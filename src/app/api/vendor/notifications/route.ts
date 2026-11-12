import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { getAuthInfo } from '@/lib/companyScope';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};
export async function OPTIONS() { return NextResponse.json({}, { headers: CORS }); }

/**
 * Vendor portal Notification Center (brief: in-app notification surface).
 *
 * GET  /api/vendor/notifications
 *   - Auth: vendor JWT (vendor_admin | vendor_employee), account must still
 *     be active in the DB (disabling cuts access immediately).
 *   - Lists the 50 newest BgvNotification events addressed to THIS user
 *     (recipient = their work email) — never another member's feed.
 *   - Includes the unread count (rows newer than notificationsSeenAt).
 *
 * POST /api/vendor/notifications
 *   - Marks the caller's feed as seen (notificationsSeenAt = NOW()).
 */
export async function GET(req: NextRequest) {
  const db = await getDb(req);
  try {
    const auth = await getAuthInfo(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
    if (!['vendor_admin', 'vendor_employee'].includes(auth.role)) {
      return NextResponse.json({ error: 'Forbidden — vendor access only' }, { status: 403, headers: CORS });
    }
    const myEmail = (auth.email || '').toLowerCase();

    const vuRows = await db.$queryRawUnsafe(
      `SELECT "id","status","notificationsSeenAt" FROM "VendorUser" WHERE "email"=$1 LIMIT 1`,
      myEmail,
    ).catch(() => []) as any[];
    if (vuRows.length === 0 || vuRows[0].status !== 'active') {
      return NextResponse.json({ error: 'Forbidden — account is not active' }, { status: 403, headers: CORS });
    }
    const vu = vuRows[0];

    const items = await db.$queryRawUnsafe(
      `SELECT n."id", n."event", n."channel", n."status", n."error", n."createdAt",
              n."providerMessageId", n."bgvRequestId",
              br."caseNumber", br."candidateName", br."candidateEmail"
         FROM "BgvNotification" n
         LEFT JOIN "BgvRequest" br ON br."id" = n."bgvRequestId"
        WHERE n."recipient" = $1
        ORDER BY n."createdAt" DESC
        LIMIT 50`,
      myEmail,
    ).catch(() => []) as any[];

    const unreadRows = await db.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS n FROM "BgvNotification"
        WHERE "recipient" = $1
          AND ("channel" = 'in_app' OR TRUE)
          AND ($2::timestamptz IS NULL OR "createdAt" > $2::timestamptz)`,
      myEmail, vu.notificationsSeenAt || null,
    ).catch(() => []) as any[];

    return NextResponse.json({
      items,
      unread: unreadRows[0]?.n || 0,
      seenAt: vu.notificationsSeenAt || null,
    }, { headers: CORS });
  } catch (error) {
    console.error('Vendor notifications GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}

export async function POST(req: NextRequest) {
  const db = await getDb(req);
  try {
    const auth = await getAuthInfo(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
    if (!['vendor_admin', 'vendor_employee'].includes(auth.role)) {
      return NextResponse.json({ error: 'Forbidden — vendor access only' }, { status: 403, headers: CORS });
    }
    const myEmail = (auth.email || '').toLowerCase();

    await db.$executeRawUnsafe(
      `UPDATE "VendorUser" SET "notificationsSeenAt" = NOW(), "updatedAt" = NOW() WHERE "email"=$1`,
      myEmail,
    ).catch(() => 0);

    return NextResponse.json({ ok: true }, { headers: CORS });
  } catch (error) {
    console.error('Vendor notifications POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}
