/**
 * GET /api/preboarding/brd/activity — BRD Preboarding Activity & History (screen 8).
 *
 * Returns the audit trail for preboarding activities, newest first.
 * Query params:
 *   candidateEmail=<email>   filter to one candidate (details text contains the email)
 *   action=<prefix>          e.g. PREBOARDING_, DOCUMENT_, JOINING_
 *   limit=<n>                default 100
 *
 * Auth: HR/admin roles.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { getTokenFromHeaders, verifyToken } from '@/lib/auth';
import { HR_ROLES } from '@/lib/preboarding';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS });
}

export async function GET(req: NextRequest) {
  const db = await getDb(req);
  try {
    const token = getTokenFromHeaders(req);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
    const decoded = await verifyToken(token).catch(() => null);
    if (!decoded || !HR_ROLES.includes(String(decoded.role || ''))) {
      return NextResponse.json({ error: 'Forbidden — HR/Admin access only' }, { status: 403, headers: CORS });
    }

    const sp = new URL(req.url).searchParams;
    const candidateEmail = (sp.get('candidateEmail') || '').trim().toLowerCase();
    const actionPrefix = (sp.get('action') || '').trim();
    const limit = Math.min(Number(sp.get('limit') || 100), 500);

    const where: string[] = [`(a."module" = 'preboarding' OR a."module" = 'onboarding')`];
    const params: any[] = [];
    if (candidateEmail) { params.push(`%${candidateEmail}%`); where.push(`a."details" ILIKE $${params.length}`); }
    if (actionPrefix) { params.push(`${actionPrefix}%`); where.push(`a."action" LIKE $${params.length}`); }
    params.push(limit);

    const rows = await db.$queryRawUnsafe(
      `SELECT a."id", a."action", a."module", a."details", a."createdAt",
              u."name" AS "userName", u."email" AS "userEmail"
       FROM "AuditLog" a
       LEFT JOIN "User" u ON u."id" = a."userId"
       WHERE ${where.join(' AND ')}
       ORDER BY a."createdAt" DESC
       LIMIT $${params.length}`,
      ...params,
    ).catch(() => []) as any[];

    return NextResponse.json({ activities: rows, count: rows.length }, { headers: CORS });
  } catch (error) {
    console.error('[preboarding/brd/activity] GET failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}
