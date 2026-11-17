/**
 * POST /api/admin/diagnose-notifications
 *
 * Super-admin diagnostic endpoint.
 *
 * For a given email + tenantSlug, reports:
 *   1. The User row (raw SQL) — id, name, email, role
 *   2. Whether Prisma findUnique on User works (or fails with schema drift)
 *   3. The last 10 NotificationDelivery records for that user — channel, status, error
 *   4. The last 10 Notification records (in-app) — title, isRead, isEmailSent
 *   5. Whether the tenant has CollaborationSettings (SMTP) configured
 *
 * This pinpoints WHY notification emails are not being delivered.
 */
import { NextResponse } from 'next/server';
import { getPlatformDb, getDbForTenant } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(request: Request) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });
    if (decoded.role !== 'super_admin') {
      return NextResponse.json({ error: 'Super admin only' }, { status: 403, headers: corsHeaders() });
    }

    const body = await request.json().catch(() => ({}));
    const email = String(body.email || '').trim().toLowerCase();
    const tenantSlug = String(body.tenantSlug || '').trim();
    if (!email || !tenantSlug) {
      return NextResponse.json({ error: 'email + tenantSlug required' }, { status: 400, headers: corsHeaders() });
    }

    const report: Record<string, unknown> = { email, tenantSlug };

    const tenantDb = await getDbForTenant(tenantSlug);

    // 1. User row via raw SQL
    const userRows = await tenantDb.$queryRawUnsafe(
      `SELECT id, name, email, role, status FROM "User" WHERE LOWER(email) = LOWER($1)`,
      email,
    ) as any[];
    report['userRawSql'] = userRows;
    const userId = userRows[0]?.id;

    // 2. Prisma findUnique test
    if (userId) {
      try {
        const prismaUser = await tenantDb.user.findUnique({
          where: { id: userId },
          select: { name: true, email: true, role: true },
        });
        report['prismaFindUnique'] = { ok: true, result: prismaUser };
      } catch (e) {
        report['prismaFindUnique'] = { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    }

    // 3. Last 10 NotificationDelivery records
    if (userId) {
      try {
        const deliveries = await tenantDb.$queryRawUnsafe(
          `SELECT id, channel, "recipientId", subject, status, error, "createdAt"
           FROM "NotificationDelivery"
           WHERE "recipientId" = $1
           ORDER BY "createdAt" DESC
           LIMIT 200`,
          userId,
        );
        report['notificationDeliveries'] = deliveries;
      } catch (e) {
        report['notificationDeliveries'] = { error: e instanceof Error ? e.message : String(e) };
      }

      // 3b. Count by status
      try {
        const statusCounts = await tenantDb.$queryRawUnsafe(
          `SELECT channel, status, COUNT(*)::int as cnt
           FROM "NotificationDelivery"
           WHERE "recipientId" = $1
           GROUP BY channel, status`,
          userId,
        );
        report['deliveryStatusCounts'] = statusCounts;
      } catch (e) {
        report['deliveryStatusCounts'] = { error: e instanceof Error ? e.message : String(e) };
      }
    }

    // 4. Last 10 in-app Notifications
    if (userId) {
      try {
        const notifs = await tenantDb.$queryRawUnsafe(
          `SELECT id, title, type, "isRead", "isEmailSent", "createdAt"
           FROM "Notification"
           WHERE "userId" = $1
           ORDER BY "createdAt" DESC
           LIMIT 200`,
          userId,
        );
        report['notifications'] = notifs;
      } catch (e) {
        report['notifications'] = { error: e instanceof Error ? e.message : String(e) };
      }
    }

    // 5. CollaborationSettings (tenant SMTP)
    try {
      const cs = await tenantDb.$queryRawUnsafe(
        `SELECT "emailIntegrationEnabled", "emailProvider", "smtpHost", "smtpUsername",
                "smtpFromName", "smtpFromAddress", "smtpEncryption"
         FROM "CollaborationSettings"
         LIMIT 1`
      );
      report['collaborationSettings'] = cs;
    } catch (e) {
      report['collaborationSettings'] = { error: e instanceof Error ? e.message : String(e) };
    }

    // 6. Env SMTP config (mask password)
    report['envSmtp'] = {
      SMTP_HOST: process.env.SMTP_HOST ? 'set' : 'not set',
      SMTP_USERNAME: process.env.SMTP_USERNAME ? 'set' : 'not set',
      SMTP_PASSWORD: process.env.SMTP_PASSWORD ? 'set' : 'not set',
      SMTP_FROM_EMAIL: process.env.SMTP_FROM_EMAIL || 'not set',
      RESEND_API_KEY: process.env.RESEND_API_KEY ? 'set' : 'not set',
      RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL || 'not set',
    };

    return NextResponse.json(report, { status: 200, headers: corsHeaders() });
  } catch (error) {
    console.error('[diagnose-notifications] error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500, headers: corsHeaders() }
    );
  }
}
