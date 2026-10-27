import { NextResponse } from 'next/server';
import { getPlatformDb, getDbForTenant, getDbForTenantById } from '@/lib/tenant-db';
import { hashPassword, verifyPassword, getTokenFromHeaders, verifyToken } from '@/lib/auth';

/**
 * POST /api/auth/change-password — Task 134
 * Body: { currentPassword, newPassword }
 *
 * Self-service password change for ANY signed-in user (super admin, tenant
 * admins, CEOs, HR, employees — every role). The user proves ownership of the
 * account by re-entering the CURRENT password (bcrypt verify against the row
 * that actually holds the identity), then the new password is hashed
 * (bcrypt, cost 12) and written back.
 *
 * DB resolution follows the same ladder as GET/PATCH /api/auth/me:
 *   1. x-tenant-slug (middleware injects it from the host on every request,
 *      web AND mobile) → tenant DB lookup by the JWT userId;
 *   2. else JWT tenantId → tenant DB via getDbForTenantById;
 *   3. else / fallback → platform DB.
 *
 * MIRROR SYNC (Task 132 constraint): tenant users exist in BOTH their tenant
 * DB (canonical — the login route authenticates tenant hosts there first)
 * and the platform DB (mirror rows copied id/email/password-hash, used by
 * the apex Rule 0 / Rule 2 paths and the mobile workspace ladder). A change
 * that touched only one copy would make the next login fail on the other
 * host, so the SAME new hash is written to:
 *   - the platform mirror row (id, falling back to email) when the home DB
 *     is a tenant DB — the exact convention POST /api/auth/reset-password
 *     already uses;
 *   - the tenant DB row (by id) when the home DB is the platform DB and the
 *     account carries a tenantId — covers users whose token resolved
 *     platform-first.
 * The active session is a stateless JWT and stays valid; no re-login is
 * forced (every OTHER device keeps working too — password changes are
 * forward-only here by design).
 *
 * Errors (all 4xx, machine-readable):
 *   400 missing fields / newPassword length bounds / new == current
 *   400 password not yet set on the account (Forgot Password flow instead)
 *   401 no/invalid token
 *   404 user row vanished
 *   400 current password incorrect
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS });
}

const MIN_LENGTH = 8;
const MAX_LENGTH = 128;

export async function POST(request: Request) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: CORS });
    }
    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: CORS });
    }
    const userId = decoded.userId as string;
    const jwtRole = (decoded.role as string) || '';
    const tenantSlug = request.headers.get('x-tenant-slug') || '';
    const tenantId = decoded.tenantId as string | undefined;

    const body = await request.json().catch(() => ({}));
    const currentPassword = String(body.currentPassword || '');
    const newPassword = String(body.newPassword || '');

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: 'Current password and new password are required' },
        { status: 400, headers: CORS },
      );
    }
    if (newPassword.length < MIN_LENGTH) {
      return NextResponse.json(
        { error: `New password must be at least ${MIN_LENGTH} characters` },
        { status: 400, headers: CORS },
      );
    }
    if (newPassword.length > MAX_LENGTH) {
      return NextResponse.json(
        { error: `New password must be at most ${MAX_LENGTH} characters` },
        { status: 400, headers: CORS },
      );
    }
    if (newPassword === currentPassword) {
      return NextResponse.json(
        { error: 'New password must be different from the current password' },
        { status: 400, headers: CORS },
      );
    }

    // ── Resolve the DB that holds this identity (same ladder as /api/auth/me) ──
    const platformDb = getPlatformDb();
    let db: any = null;
    if (jwtRole === 'super_admin') {
      db = platformDb;
    } else {
      try {
        db = tenantSlug
          ? await getDbForTenant(tenantSlug)
          : tenantId
            ? await getDbForTenantById(tenantId)
            : null;
      } catch {
        db = null;
      }
      if (db) {
        const tenantRow = await db.user
          .findUnique({ where: { id: userId }, select: { id: true } })
          .catch(() => null);
        if (!tenantRow) db = null; // token points elsewhere — fall through to platform
      }
      if (!db) {
        const platformRow = await platformDb.user
          .findUnique({ where: { id: userId }, select: { id: true } })
          .catch(() => null);
        if (platformRow) db = platformDb;
      }
    }

    if (!db) {
      return NextResponse.json({ error: 'User not found' }, { status: 404, headers: CORS });
    }

    const row = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, password: true, tenantId: true },
    });
    if (!row) {
      return NextResponse.json({ error: 'User not found' }, { status: 404, headers: CORS });
    }

    // Accounts provisioned without a password (SSO/import-only) cannot pass
    // a current-password check — route them to the email reset flow instead.
    if (!row.password) {
      return NextResponse.json(
        {
          error:
            'No password has been set for this account yet. Use "Forgot Password" on the login page to set one.',
        },
        { status: 400, headers: CORS },
      );
    }

    const currentOk = await verifyPassword(currentPassword, row.password);
    if (!currentOk) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400, headers: CORS });
    }

    const newHash = await hashPassword(newPassword);
    await db.user.update({ where: { id: userId }, data: { password: newHash } });

    // ── Mirror sync (both directions, best-effort, never blocks the change) ──
    let mirrored = false;
    if (db !== platformDb) {
      // Home = tenant DB → refresh the platform mirror (id first, then email).
      const byId = await platformDb.user
        .update({ where: { id: row.id }, data: { password: newHash } })
        .catch(() => null);
      if (byId) {
        mirrored = true;
      } else {
        const byEmail = await platformDb.user
          .update({ where: { email: row.email }, data: { password: newHash } })
          .catch(() => null);
        mirrored = !!byEmail;
      }
    } else if (row.tenantId) {
      // Home = platform DB but the account belongs to a tenant → refresh the
      // tenant DB copy so tenant-host login accepts the new password too.
      // NOTE (production reality): a handful of tenant/platform mirror pairs
      // carry DIFFERENT ids (e.g. hr@marqaitech.com) — match by id first,
      // then by email, exactly like the forward direction above.
      try {
        const tenantDb = await getDbForTenantById(row.tenantId);
        const byId = await tenantDb.user
          .update({ where: { id: row.id }, data: { password: newHash } })
          .catch(() => null);
        if (byId) {
          mirrored = true;
        } else {
          const byEmail = await tenantDb.user
            .update({ where: { email: row.email }, data: { password: newHash } })
            .catch(() => null);
          mirrored = !!byEmail;
        }
      } catch {
        // Tenant DB unreachable — the primary change already succeeded.
      }
    }

    console.log(
      `[ChangePassword] Password changed for ${row.email} (db=${db === platformDb ? 'platform' : 'tenant'}, mirrored=${mirrored})`,
    );

    return NextResponse.json(
      { message: 'Password changed successfully', mirrored },
      { headers: CORS },
    );
  } catch (error) {
    console.error('[ChangePassword] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: CORS },
    );
  }
}
