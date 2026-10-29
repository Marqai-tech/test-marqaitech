/**
 * Team Leave Calendar API
 *
 * GET /api/leave/team-calendar?month=YYYY-MM
 *
 * Returns all approved + pending leave requests for the authenticated
 * employee's team (same department) OR — for managers/admins — for their
 * reporting subordinates, in the specified month.
 *
 * Purpose: power the team leave calendar UI so employees can see who is
 * already on leave on any given day before applying. If multiple team
 * members are already out, the employee is encouraged to apply for a
 * different date because approval chances are lower.
 *
 * Auth: any authenticated user.
 * Scope:
 *   - employee / manager: members of their own department (excluding self
 *     for privacy if requested via ?includeSelf=false)
 *   - admin / super_admin: members of the selected company's employees
 *
 * Response shape:
 * {
 *   teamSize: number,
 *   month: "YYYY-MM",
 *   leaves: Array<{
 *     id, status, startDate, endDate, halfDay, halfDaySlot,
 *     leaveType: { id, name, code },
 *     employee: { id, firstName, lastName, employeeCode, avatar? }
 *   }>,
 *   byDate: { "YYYY-MM-DD": Array<leave-index> }  // quick lookup for the UI
 *   team: Array<{ id, firstName, lastName, employeeCode }>  // for the legend
 * }
 */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { resolveCompanyScope, getAuthInfo } from '@/lib/companyScope';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Cache-Control': 'no-store, max-age=0',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

export async function GET(req: NextRequest) {
  const db = await getDb(req);
  try {
    const auth = await getAuthInfo(req);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    }
    const scope = await resolveCompanyScope(req);
    if (!scope) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    }

    const { searchParams } = new URL(req.url);
    const monthParam = searchParams.get('month'); // YYYY-MM
    const includeSelf = (searchParams.get('includeSelf') ?? 'true') === 'true';
    const departmentId = searchParams.get('departmentId'); // optional filter

    // Default to current month if not specified
    const now = new Date();
    const year = monthParam ? parseInt(monthParam.split('-')[0], 10) : now.getFullYear();
    const month = monthParam ? parseInt(monthParam.split('-')[1], 10) - 1 : now.getMonth();
    if (isNaN(year) || isNaN(month) || month < 0 || month > 11) {
      return NextResponse.json({ error: 'Invalid month. Use YYYY-MM format.' }, { status: 400, headers: corsHeaders() });
    }
    // Month range (UTC to avoid TZ surprises)
    const monthStart = new Date(Date.UTC(year, month, 1));
    const monthEnd = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));

    // Resolve the acting employee
    const me = await db.employee.findFirst({
      where: { userId: scope.userId, status: 'active' },
      select: { id: true, departmentId: true, companyId: true, firstName: true, lastName: true, employeeId: true },
    });

    const isAdminRole = ['super_admin', 'tenant_admin', 'admin', 'hr_admin'].includes(auth.role);

    // Build the team-member filter
    //  - Employees & managers: same department (or all reporters if manager)
    //  - Admins: all employees in their company scope
    let teamMemberIds: string[] = [];
    let teamFilter: Record<string, unknown> = {};

    if (isAdminRole && scope.companyId) {
      teamFilter = { companyId: scope.companyId, status: 'active' };
    } else if (isAdminRole) {
      // super_admin with no company selected — return empty (would be huge)
      return NextResponse.json({
        teamSize: 0,
        month: `${year}-${String(month + 1).padStart(2, '0')}`,
        leaves: [],
        byDate: {},
        team: [],
        message: 'Select a company from the switcher to view its team leave calendar.',
      }, { headers: corsHeaders() });
    } else if (me) {
      // Employee or manager
      if (departmentId) {
        teamFilter = { departmentId, status: 'active' };
      } else if (me.departmentId) {
        teamFilter = { departmentId: me.departmentId, status: 'active' };
      } else {
        // No department — fall back to same company
        teamFilter = { companyId: me.companyId, status: 'active' };
      }
    } else {
      return NextResponse.json({
        teamSize: 0,
        month: `${year}-${String(month + 1).padStart(2, '0')}`,
        leaves: [],
        byDate: {},
        team: [],
        message: 'No employee record found for the current user.',
      }, { headers: corsHeaders() });
    }

    // Exclude self if requested
    if (!includeSelf && me) {
      teamFilter = { ...teamFilter, id: { not: me.id } };
    }

    const teamMembers = await db.employee.findMany({
      where: teamFilter,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        employeeId: true,
        avatar: true,
        departmentId: true,
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
    teamMemberIds = teamMembers.map(e => e.id);

    if (teamMemberIds.length === 0) {
      return NextResponse.json({
        teamSize: 0,
        month: `${year}-${String(month + 1).padStart(2, '0')}`,
        leaves: [],
        byDate: {},
        team: [],
      }, { headers: corsHeaders() });
    }

    // Fetch all approved + pending leaves overlapping the month range
    const leaves = await db.leaveRequest.findMany({
      where: {
        employeeId: { in: teamMemberIds },
        status: { in: ['approved', 'pending'] },
        AND: [
          { startDate: { lte: monthEnd } },
          { endDate: { gte: monthStart } },
        ],
      },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            employeeId: true,
            avatar: true,
          },
        },
        leaveType: {
          select: { id: true, name: true, code: true },
        },
      },
      orderBy: { startDate: 'asc' },
    });

    // Build a byDate index: { "YYYY-MM-DD": [leaveIndex, ...] }
    // A leave that spans multiple days shows up on every day in its range
    const byDate: Record<string, number[]> = {};
    for (let i = 0; i < leaves.length; i++) {
      const lv = leaves[i];
      const start = new Date(lv.startDate);
      const end = new Date(lv.endDate);
      // Walk day-by-day from start to end (UTC, inclusive)
      const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
      const endUTC = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
      while (cursor.getTime() <= endUTC.getTime()) {
        // Only include days within the requested month
        if (cursor.getUTCFullYear() === year && cursor.getUTCMonth() === month) {
          const key = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}-${String(cursor.getUTCDate()).padStart(2, '0')}`;
          if (!byDate[key]) byDate[key] = [];
          byDate[key].push(i);
        }
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
    }

    return NextResponse.json({
      teamSize: teamMembers.length,
      month: `${year}-${String(month + 1).padStart(2, '0')}`,
      leaves: leaves.map(lv => ({
        id: lv.id,
        status: lv.status,
        startDate: lv.startDate,
        endDate: lv.endDate,
        halfDay: lv.halfDay,
        halfDaySlot: lv.halfDaySlot,
        reason: lv.reason, // OK to expose to team — helps plan around the absence
        leaveType: lv.leaveType,
        employee: lv.employee,
      })),
      byDate,
      team: teamMembers.map(m => ({
        id: m.id,
        firstName: m.firstName,
        lastName: m.lastName,
        employeeCode: m.employeeId,
        avatar: m.avatar,
      })),
      me: me ? { id: me.id, firstName: me.firstName, lastName: me.lastName } : null,
    }, { headers: corsHeaders() });
  } catch (error) {
    console.error('[team-calendar] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch team leave calendar' }, { status: 500, headers: corsHeaders() });
  }
}
