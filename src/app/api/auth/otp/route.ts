import { NextResponse } from 'next/server';
import { getPlatformDb, getDbForTenant } from '@/lib/tenant-db';
import { createToken, REMEMBER_TOKEN_TTL, SESSION_TOKEN_TTL } from '@/lib/auth';
import { getHiddenSlugsForRequest } from '@/lib/tenant-filter';
import { sendEmail } from '@/lib/email';
import { sendSms, isSmsConfigured } from '@/lib/sms';
import { createHash } from 'crypto';
import { buildBrandedEmailForTenant } from '@/lib/tenant-branding';

/**
 * Task 141 — Mobile OTP sign-in (design: "Verify your number").
 *
 * POST /api/auth/otp  { action: 'request' | 'verify', phone, dialCode, code?, rememberMe? }
 *
 * REQUEST: resolves the account from Employee.phone (same candidate set as
 * /api/auth/login), mints a 6-digit code, stores ONLY its SHA-256 hash in the
 * tenant DB ("LoginOtp" table, auto-created), emails the code via the platform
 * email integration, and returns masked destinations. On the platform apex a
 * cross-tenant sweep answers 403 + suggestedUrl (Task 132 ladder parity) so
 * the mobile app re-requests at the right workspace — the apex never mints
 * sessions or OTPs.
 *
 * VERIFY: validates hash + 5-minute expiry + attempt limit (5), consumes the
 * code and returns the SAME session shape as /api/auth/login
 * ({ token, user: { id, name, email, role, tenantId, avatar, tenant, company } })
 * so the mobile app can reuse its post-login pipeline unchanged.
 */

const OTP_TTL_SEC = 300; // 5 minutes
const OTP_MAX_ATTEMPTS = 5;
const OTP_REQUEST_WINDOW_MIN = 15;
const OTP_MAX_PER_WINDOW = 3;
// Task 142 — the showcase workspace may surface the code in-app so the
// owner/HR can test the OTP flow before SMS/SMTP gateways are configured.
// REAL tenant workspaces NEVER expose the code in the API response.
const OTP_DEMO_SLUGS = new Set(['3boxes-hrms-demo']);

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

function phoneCandidates(rawPhone: string, dialCode: unknown): string[] {
  const identityDigits = String(rawPhone || '').replace(/\D/g, '');
  const dialDigits = String(dialCode || '').replace(/\D/g, '');
  const set = new Set<string>();
  if (identityDigits.length >= 6) {
    set.add(identityDigits);
    set.add(`+${identityDigits}`);
    if (dialDigits) {
      set.add(`${dialDigits}${identityDigits}`);
      set.add(`+${dialDigits}${identityDigits}`);
    }
    if (identityDigits.length > 10) set.add(identityDigits.slice(-10));
  }
  return [...set];
}

function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return email;
  const local = email.slice(0, at);
  const domain = email.slice(at);
  const head = local.slice(0, Math.min(2, local.length));
  return `${head}${'*'.repeat(Math.max(3, Math.min(6, Math.max(0, local.length - 2))))}${domain}`;
}

function maskPhone(phone: string, dialCode: unknown): string {
  const dial = String(dialCode || '').replace(/\D/g, '') || '91';
  const digits = String(phone || '').replace(/\D/g, '');
  const tail = digits.slice(-4);
  return `+${dial} •••••${tail}`;
}

/** Mirror the login route's workspace resolution: x-tenant-slug header → host subdomain. */
function resolveTenantSlug(request: Request): string {
  let slug = request.headers.get('x-tenant-slug') || '';
  const host = (request.headers.get('x-tenant-domain') || request.headers.get('host') || '').split(':')[0].toLowerCase();
  if (host.endsWith('.vercel.app') && slug === host.split('.')[0]) slug = '';
  if (!slug && host.endsWith('.3boxeshrms.com')) {
    const sub = host.replace('.3boxeshrms.com', '');
    if (sub && sub !== 'www' && sub !== 'nexus-hrms-demo' && sub !== 'nexus-hrms') slug = sub;
  }
  return slug;
}

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  avatar: true,
  tenantId: true,
} as const;

type OtpUser = { id: string; name: string; email: string; role: string; status: string; avatar: string | null; tenantId: string | null };

/** Task 142 — OTP requests may arrive as a registered EMAIL address (the
 *  mobile "Mobile / Email" tab): resolve the linked user directly. */
async function findUserByEmail(db: ReturnType<typeof getPlatformDb>, rawEmail: string) {
  const email = String(rawEmail || '').trim().toLowerCase();
  if (!email.includes('@') || email.length < 5) return null;
  try {
    const rows = (await db.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT u."id", u."name", u."email", u."role", u."status", u."avatar", u."tenantId", e."avatar" AS "employeeAvatar"
         FROM "User" u LEFT JOIN "Employee" e ON e."userId" = u."id"
        WHERE LOWER(u."email") = $1 LIMIT 1`,
      email,
    )) as Array<Record<string, unknown>>;
    const row = rows?.[0];
    if (!row?.id) return null;
    const user: OtpUser = {
      id: String(row.id), name: String(row.name || ''), email: String(row.email || ''),
      role: String(row.role || ''), status: String(row.status || 'active'),
      avatar: (row.avatar as string | null) ?? null, tenantId: (row.tenantId as string | null) ?? null,
    };
    return { user, employeeAvatar: (row.employeeAvatar as string | null) ?? null };
  } catch (e) {
    console.error('[OTP] email lookup failed:', e);
    return null;
  }
}

async function findUserByPhone(db: ReturnType<typeof getPlatformDb>, candidates: string[]) {
  if (candidates.length === 0) return null;
  // Fast path: exact candidate match (plain / +prefixed / dial-prefixed).
  const emp = await db.employee
    .findFirst({
      where: { phone: { in: candidates } },
      select: { userId: true, avatar: true },
    })
    .catch(() => null);
  // Robust path: phones are stored free-form ("+91-9828803789", "98765 43210",
  // "7671813161") — compare DIGIT-ONLY normalisation and require a linked user.
  if (!emp?.userId) {
    const digitVariants = [...new Set(candidates.map((c) => c.replace(/\D/g, '')).filter((c) => c.length >= 6))];
    if (digitVariants.length > 0) {
      try {
        const rows = (await db.$queryRawUnsafe<{ userId: string; avatar: string | null }[]>(
          `SELECT "userId", avatar FROM "Employee"
           WHERE phone IS NOT NULL AND "userId" IS NOT NULL
             AND regexp_replace(phone, '[^0-9]', '', 'g') = ANY($1::text[])
           LIMIT 1`,
          digitVariants,
        )) as { userId: string; avatar: string | null }[];
        if (rows?.[0]?.userId) {
          const user = await db.user.findUnique({ where: { id: rows[0].userId }, select: userSelect }).catch(() => null);
          if (user) return { user: user as OtpUser, employeeAvatar: rows[0].avatar };
        }
      } catch (rawErr) {
        console.error('[OTP] digit-normalised lookup failed:', rawErr);
      }
    }
  }
  if (!emp?.userId) return null;
  const user = await db.user.findUnique({ where: { id: emp.userId }, select: userSelect }).catch(() => null);
  if (!user) return null;
  return { user: user as OtpUser, employeeAvatar: emp.avatar as string | null };
}

async function ensureOtpTable(db: ReturnType<typeof getPlatformDb>) {
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "LoginOtp" (
      "id" TEXT PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "phone" TEXT NOT NULL,
      "codeHash" TEXT NOT NULL,
      "attempts" INTEGER NOT NULL DEFAULT 0,
      "expiresAt" TIMESTAMP(3) NOT NULL,
      "consumedAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "LoginOtp_userId_idx" ON "LoginOtp"("userId")`);
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * REQ 5 — OTP email body content (no outer <html> wrapper).
 *
 * The full branded HTML document is built by `buildBrandedEmailForTenant`,
 * which wraps this body in the tenant-branded header (logo + colors) and
 * footer. Returns just the inner body HTML so the caller can pass it as
 * `bodyHtml` to the branded template.
 */
function otpEmailBodyHtml(code: string, name: string): string {
  return `
      <p style="margin:0 0 6px;font-size:15px;color:#0f172a;">Hi ${escapeHtml(name || 'there')},</p>
      <p style="margin:0 0 16px;font-size:13.5px;color:#475569;line-height:1.6;">
        Use this one-time code to sign in to the 3Boxes HRMS mobile app. It expires in
        <strong>5 minutes</strong> and can be used only once.
      </p>
      <div style="text-align:center;margin:18px 0;">
        <span style="display:inline-block;letter-spacing:10px;font-size:30px;font-weight:800;color:#0F172A;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:12px;padding:14px 22px 14px 32px;">${escapeHtml(code)}</span>
      </div>
      <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.6;">
        Didn't request this code? Someone may have typed your number by mistake — you can safely ignore this email.
        Never share this code with anyone, including HR or IT staff.
      </p>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function POST(request: Request) {
  const platformDb = getPlatformDb();
  try {
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || '');
    const phone = String(body.phone || '');
    const dialCode = body.dialCode;
    // Task 142 — the mobile tab may send a registered EMAIL address instead
    // of a phone number; both identities mint the same emailed OTP.
    const isEmailIdentity = phone.includes('@');
    const candidates = isEmailIdentity ? [] : phoneCandidates(phone, dialCode);
    if (!isEmailIdentity && candidates.length === 0) {
      return NextResponse.json({ error: 'Enter a valid mobile number' }, { status: 400, headers: corsHeaders() });
    }

    const tenantSlug = resolveTenantSlug(request);

    // ─── Platform apex: sweep tenant DBs, suggest the workspace (no OTP minted here) ───
    if (!tenantSlug) {
      try {
        const sweepDbs = await platformDb.tenantDatabase.findMany({
          where: { isActive: true, tenant: { isNot: { slug: '3boxes-hrms-demo' } } },
          select: { tenant: { select: { slug: true } } },
        });
        for (const td of sweepDbs) {
          const slug = td.tenant?.slug;
          if (!slug) continue;
          const sweepDb = await getDbForTenant(slug).catch(() => null);
          if (!sweepDb) continue;
          const hit = isEmailIdentity
            ? await findUserByEmail(sweepDb, phone).catch(() => null)
            : await findUserByPhone(sweepDb, candidates).catch(() => null);
          if (hit) {
            return NextResponse.json(
              {
                error: `Your workspace is https://${slug}.3boxeshrms.com — requesting the code there.`,
                code: 'MAIN_DOMAIN_SUPER_ADMIN_ONLY',
                suggestedUrl: `https://${slug}.3boxeshrms.com`,
              },
              { status: 403, headers: corsHeaders() },
            );
          }
        }
      } catch (sweepErr) {
        console.error('[OTP] Tenant sweep failed:', sweepErr);
      }
      return NextResponse.json(
        { error: 'No account found for this mobile number', code: 'OTP_NO_ACCOUNT' },
        { status: 404, headers: corsHeaders() },
      );
    }

    const db = await getDbForTenant(tenantSlug).catch(() => null);
    if (!db) {
      return NextResponse.json({ error: 'Workspace is unreachable — try again' }, { status: 502, headers: corsHeaders() });
    }

    const found = isEmailIdentity
      ? await findUserByEmail(db, phone).catch(() => null)
      : await findUserByPhone(db, candidates).catch(() => null);
    if (!found) {
      return NextResponse.json(
        { error: 'No account found for this mobile number in this workspace', code: 'OTP_NO_ACCOUNT' },
        { status: 404, headers: corsHeaders() },
      );
    }
    const user = found.user;

    if (user.role === 'candidate') {
      return NextResponse.json(
        { error: 'This account signs in as a Candidate. Select Candidate on the login page.', code: 'USE_CANDIDATE_LOGIN' },
        { status: 403, headers: corsHeaders() },
      );
    }
    if (user.status && user.status !== 'active') {
      return NextResponse.json(
        { error: 'This account is not active — contact your HR / Admin.', code: 'ACCOUNT_INACTIVE' },
        { status: 403, headers: corsHeaders() },
      );
    }
    if (!user.email) {
      return NextResponse.json(
        { error: 'No registered email on this account for code delivery — sign in with your Employee ID and password.', code: 'OTP_NO_EMAIL' },
        { status: 400, headers: corsHeaders() },
      );
    }

    await ensureOtpTable(db);

    // ─── REQUEST ───
    if (action === 'request') {
      const recent = (await db.$queryRawUnsafe<{ count: string }[]>(
        `SELECT COUNT(*) AS count FROM "LoginOtp" WHERE "userId" = $1 AND "createdAt" > NOW() - INTERVAL '15 minutes'`,
        user.id,
      )) as { count: string }[];
      const recentCount = Number(recent?.[0]?.count ?? 0);
      if (recentCount >= OTP_MAX_PER_WINDOW) {
        return NextResponse.json(
          { error: `Too many codes requested — try again in ${OTP_REQUEST_WINDOW_MIN} minutes or sign in with your password.`, code: 'OTP_RATE_LIMITED' },
          { status: 429, headers: corsHeaders() },
        );
      }

      const code = String(Math.floor(100000 + Math.random() * 900000));
      const codeHash = sha256(`${code}:${user.id}`);
      const expiresAt = new Date(Date.now() + OTP_TTL_SEC * 1000);
      await db.$executeRawUnsafe(
        `INSERT INTO "LoginOtp" ("id", "userId", "phone", "codeHash", "attempts", "expiresAt", "createdAt")
         VALUES ($1, $2, $3, $4, 0, $5, CURRENT_TIMESTAMP)`,
        `${user.id}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        user.id,
        maskPhone(phone, dialCode),
        codeHash,
        expiresAt,
      );

      // ── Task 142: DUAL-CHANNEL delivery — SMS first, email always. ──
      // Previously the code went out by email only, so employees whose
      // email was unreachable never got in. Now both channels are attempted
      // and the response reports exactly which ones carried the code.
      const smsDelivery = await sendSms(
        phone,
        `${code} is your 3Boxes HRMS sign-in code. Valid 5 minutes. Never share this code.`,
        String(dialCode || '').replace(/\D/g, '') || '91',
      ).catch((e) => ({ success: false, error: String(e) } as const));

      const delivery = await sendEmail({
        to: user.email,
        subject: `${code} is your 3Boxes HRMS sign-in code`,
        // REQ 5 — wrap the OTP body in the tenant-branded template (logo +
        // colors). user.tenantId is resolved earlier in the request flow.
        html: await buildBrandedEmailForTenant((user as any).tenantId || null, {
          title: 'Mobile sign-in verification',
          bodyHtml: otpEmailBodyHtml(code, user.name || 'there'),
        }),
      }).catch((e) => ({ success: false, error: String(e) }));

      const emailDelivered = Boolean((delivery as { success?: boolean })?.success);
      const smsDelivered = Boolean((smsDelivery as { success?: boolean })?.success);
      const dialDigits = String(dialCode || '').replace(/\D/g, '') || '91';

      // No channel reached the user: give actionable guidance instead of a
      // fake success. The demo workspace may surface the code in-app so the
      // flow stays testable before gateways are configured.
      if (!emailDelivered && !smsDelivered) {
        const isDemo = OTP_DEMO_SLUGS.has(tenantSlug);
        if (isDemo) {
          return NextResponse.json(
            {
              sent: true,
              demoWorkspace: true,
              demoFallbackCode: code,
              channels: { email: false, sms: false },
              maskedPhone: maskPhone(phone, dialCode),
              maskedEmail: maskEmail(user.email),
              expiresInSec: OTP_TTL_SEC,
            },
            { headers: corsHeaders() },
          );
        }
        return NextResponse.json(
          {
            sent: false,
            channels: { email: false, sms: false },
            smsConfigured: isSmsConfigured(),
            error:
              'We could not deliver the code right now (email gateway did not accept the message and no SMS gateway is configured for this workspace). '
              + 'Please sign in with your Employee ID and password, or tap Contact HR to raise a ticket — HR / Admin / IT Admin are alerted instantly.',
            maskedPhone: maskPhone(phone, dialCode),
            maskedEmail: maskEmail(user.email),
          },
          { status: 502, headers: corsHeaders() },
        );
      }

      return NextResponse.json(
        {
          sent: true,
          emailDelivered,
          smsDelivered,
          channels: { email: emailDelivered, sms: smsDelivered },
          smsConfigured: isSmsConfigured(),
          maskedPhone: maskPhone(phone, dialCode),
          maskedEmail: maskEmail(user.email),
          dialDigits,
          expiresInSec: OTP_TTL_SEC,
        },
        { headers: corsHeaders() },
      );
    }

    // ─── VERIFY ───
    if (action === 'verify') {
      const code = String(body.code || '').replace(/\D/g, '');
      if (code.length !== 6) {
        return NextResponse.json({ error: 'Enter the 6-digit code' }, { status: 400, headers: corsHeaders() });
      }
      const rows = (await db.$queryRawUnsafe<{ id: string; attempts: number; expiresAt: Date; codeHash: string }[]>(
        `SELECT "id", "attempts", "expiresAt", "codeHash" FROM "LoginOtp"
         WHERE "userId" = $1 AND "consumedAt" IS NULL ORDER BY "createdAt" DESC LIMIT 1`,
        user.id,
      )) as { id: string; attempts: number; expiresAt: Date; codeHash: string }[];
      const row = rows?.[0];
      if (!row) {
        return NextResponse.json({ error: 'No active code — request a new one.', code: 'OTP_NO_ACTIVE' }, { status: 400, headers: corsHeaders() });
      }
      if (new Date(row.expiresAt).getTime() < Date.now()) {
        return NextResponse.json({ error: 'This code has expired — request a new one.', code: 'OTP_EXPIRED' }, { status: 401, headers: corsHeaders() });
      }
      if (Number(row.attempts) >= OTP_MAX_ATTEMPTS) {
        return NextResponse.json(
          { error: 'Too many wrong attempts — request a new code.', code: 'OTP_LOCKED' },
          { status: 429, headers: corsHeaders() },
        );
      }
      if (sha256(`${code}:${user.id}`) !== String(row.codeHash)) {
        await db.$executeRawUnsafe(`UPDATE "LoginOtp" SET "attempts" = "attempts" + 1 WHERE "id" = $1`, row.id);
        const left = OTP_MAX_ATTEMPTS - (Number(row.attempts) + 1);
        return NextResponse.json(
          { error: left > 0 ? `Incorrect code — ${left} attempt${left === 1 ? '' : 's'} left.` : 'Too many wrong attempts — request a new code.', code: 'OTP_MISMATCH' },
          { status: 401, headers: corsHeaders() },
        );
      }

      await db.$executeRawUnsafe(`UPDATE "LoginOtp" SET "consumedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`, row.id);

      // Session — same claims + TTL rules as /api/auth/login (mobile passes rememberMe:true).
      const persistSession = Boolean(body.rememberMe);
      const token = await createToken(
        { userId: user.id, email: user.email, role: user.role, tenantId: user.tenantId },
        persistSession ? REMEMBER_TOKEN_TTL : SESSION_TOKEN_TTL,
      );

      // Tenant info (platform-level) + company info (tenant DB) — mirrors login.
      let tenant: Record<string, unknown> | null = null;
      try {
        tenant = (await platformDb.tenant.findUnique({
          where: { id: user.tenantId as string },
          select: { id: true, name: true, slug: true, plan: true, currency: true, timezone: true, logo: true },
        })) as unknown as Record<string, unknown> | null;
      } catch (e) {
        console.error('[OTP] tenant resolution failed:', e);
      }
      if (!tenant && user.role !== 'super_admin') {
        return NextResponse.json({ error: 'Unable to resolve tenant information. Please contact support.' }, { status: 500, headers: corsHeaders() });
      }

      let companyData: Record<string, unknown> | null = null;
      let loginAvatar: string | null = user.avatar || found.employeeAvatar || null;
      if (user.role !== 'super_admin') {
        try {
          const employee = await db.employee.findUnique({ where: { userId: user.id }, select: { companyId: true, avatar: true } });
          if (employee?.avatar) loginAvatar = employee.avatar;
          if (employee?.companyId) {
            const company = await db.company.findUnique({
              where: { id: employee.companyId },
              select: { id: true, name: true, code: true, logo: true, city: true, state: true, country: true },
            });
            if (company) companyData = company as unknown as Record<string, unknown>;
          }
        } catch (e) {
          console.error('[OTP] company resolution failed:', e);
        }
      }

      // Hidden-tenant scrub (same golden rule as login).
      const hiddenSlugs = getHiddenSlugsForRequest(request);
      const tenantRecord = tenant as { slug?: string } | null;
      const isTenantHidden = Boolean(tenantRecord?.slug && hiddenSlugs.includes(tenantRecord.slug));
      const safeTenantId = isTenantHidden ? null : user.tenantId;
      const safeTenant = isTenantHidden ? null : tenantRecord;

      // Best-effort bookkeeping (login parity).
      try {
        await db.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });
      } catch (_) {}
      try {
        await db.auditLog.create({
          data: { userId: user.id, action: 'LOGIN', module: 'auth', details: `User ${user.email} logged in via mobile OTP` },
        });
      } catch (_) {}

      return NextResponse.json(
        {
          token,
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            tenantId: safeTenantId,
            avatar: loginAvatar,
            tenant: safeTenant,
            company: companyData,
          },
        },
        { headers: corsHeaders() },
      );
    }

    return NextResponse.json({ error: 'Unknown action — use request or verify' }, { status: 400, headers: corsHeaders() });
  } catch (error) {
    console.error('[OTP] error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500, headers: corsHeaders() },
    );
  }
}
