import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

/**
 * Task 139 — ORGANIZATION stats for EVERY login (mobile home / web).
 * The user asked for "total employees, active / on leave / exits this month
 * records should be same for all the users like admin" — so unlike
 * /api/dashboard (which self-scopes employees to 1 row), this endpoint always
 * computes TENANT-WIDE numbers from the same sources as the employees module
 * dashboard:
 *   total / active  — Employee rows (any status) / status='active'
 *   onLeave         — /api/leave?onLeaveToday=1 count logic (approved leave covering IST today)
 *   exitsThisMonth  — terminated/resigned employees whose updatedAt falls in the current month
 */
export async function GET(request: NextRequest) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });

    const totals = await db.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE "status" = 'active')::int AS active,
              COUNT(*) FILTER (WHERE "status" IN ('terminated','resigned'))::int AS exited
       FROM "Employee"`,
    ).catch(() => []) as Array<Record<string, unknown>>;

    const onLeaveRows = await db.$queryRawUnsafe(
      `SELECT COUNT(DISTINCT lr."employeeId")::int AS on_leave
       FROM "LeaveRequest" lr
       WHERE lr."status" = 'approved'
         AND (NOW() AT TIME ZONE 'Asia/Kolkata')::date BETWEEN lr."startDate"::date AND lr."endDate"::date`,
    ).catch(() => []) as Array<Record<string, unknown>>;

    const exitsRows = await db.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS exits
       FROM "Employee"
       WHERE "status" IN ('terminated','resigned')
         AND date_trunc('month', "updatedAt" AT TIME ZONE 'Asia/Kolkata') = date_trunc('month', (NOW() AT TIME ZONE 'Asia/Kolkata'))`,
    ).catch(() => []) as Array<Record<string, unknown>>;

    const t = totals?.[0] || {};
    return NextResponse.json({
      total: Number(t.total || 0),
      active: Number(t.active || 0),
      onLeave: Number(onLeaveRows?.[0]?.on_leave || 0),
      exitsThisMonth: Number(exitsRows?.[0]?.exits || 0),
      scope: 'tenant',
    }, { headers: corsHeaders() });
  } catch (error) {
    console.error('[OrgStats GET] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
