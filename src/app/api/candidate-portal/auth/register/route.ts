import { randomInt } from 'crypto';
import { NextResponse } from 'next/server';
import { getDb, getTenantSlugFromRequest, getPlatformDb } from '@/lib/tenant-db';
import { hashPassword } from '@/lib/auth';
import { sendConfiguredEmail } from '@/lib/configured-email';

const OTP_TTL_MS = 15 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] || character);

export async function POST(request: Request) {
  const db = await getDb(request);
  try {
    const body = await request.json().catch(() => ({}));
    const firstName = String(body.firstName || '').trim();
    const lastName = String(body.lastName || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!firstName || !lastName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: 'First name, last name and a valid email are required.' }, { status: 400 });
    if (password.length < 8) return NextResponse.json({ error: 'Password must contain at least 8 characters.' }, { status: 400 });

    const employee = await db.employee.findFirst({ where: { OR: [{ email }, { personalEmail: email }] }, select: { id: true } }).catch(() => null);
    const staff = await db.user.findUnique({ where: { email }, select: { role: true } }).catch(() => null);
    if (employee || (staff?.role && staff.role !== 'candidate')) return NextResponse.json({ error: 'This email belongs to an employee account. Use Employee / HR login.' }, { status: 409 });

    const existing = await db.candidatePortalUser.findUnique({ where: { candidateEmail: email } });
    if (existing?.passwordHash) return NextResponse.json({ error: 'A verified candidate account already exists. Please sign in.' }, { status: 409 });
    if (existing && Date.now() - existing.updatedAt.getTime() < RESEND_COOLDOWN_MS) {
      const retryAfter = Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - existing.updatedAt.getTime())) / 1000);
      return NextResponse.json({ error: `Please wait ${retryAfter} seconds before requesting another code.`, retryAfter }, { status: 429 });
    }

    const candidateName = `${firstName} ${lastName}`.trim();
    const otp = String(randomInt(100000, 1000000));
    const [otpHash, pendingPasswordHash] = await Promise.all([hashPassword(otp), hashPassword(password)]);
    const otpExpiresAt = new Date(Date.now() + OTP_TTL_MS);
    await db.candidatePortalUser.upsert({
      where: { candidateEmail: email },
      create: { candidateEmail: email, candidateName, currentOtpHash: otpHash, otpExpiresAt, magicToken: pendingPasswordHash },
      update: { candidateName, currentOtpHash: otpHash, otpExpiresAt, magicToken: pendingPasswordHash },
    });

    // Template-driven OTP email (Notification Center; admin-editable).
    // Tenant resolution: x-tenant-slug header → platform tenant id (empty id
    // is safe — resolveTemplate falls back to the global default template).
    let tenantIdReg = '';
    try {
      const slugReg = await getTenantSlugFromRequest(request);
      if (slugReg) {
        tenantIdReg = (await getPlatformDb().tenant.findUnique({ where: { slug: slugReg }, select: { id: true } }))?.id || '';
      }
    } catch { /* tenant resolution best-effort — global template fallback applies */ }

    const delivery = await sendConfiguredEmail({
      db, tenantId: tenantIdReg,
      module: 'recruitment', eventKey: 'recruitment.candidate.portal_otp',
      to: email,
      toName: candidateName || undefined,
      vars: { Candidate_Name: candidateName || 'Candidate', OTP_Code: otp, Expiry_Minutes: '15' },
      entityType: 'candidate_portal', entityId: email,
      status: 'info',
    });
    if (!delivery.sent) return NextResponse.json({ error: 'We could not deliver the verification email. Please try again.' }, { status: 502 });
    return NextResponse.json({ ok: true, email, message: 'Verification code sent to your email.', expiresIn: 900, resendAfter: 60 });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not start candidate registration.' }, { status: 500 });
  }
}
