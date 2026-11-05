/**
 * Team Leave Calendar API
 * GET /api/leave/team-calendar?month=YYYY-MM&includeSelf=true
 *
 * Returns approved+pending leaves for the caller's team (same department for
 * employees/managers; same company for admins) for the given month.
 *
 * Response shape (matches the Team Leave Calendar page + the mini sidebar):
 * {
 *   teamSize: number,
 *   month: string,
 *   leaves: LeaveRecord[],
 *   byDate: { "YYYY-MM-DD": number[] },  // indices into leaves[]
 *   team: TeamMember[],
 *   me: { id, firstName, lastName } | null
 * }
 */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { resolveCompanyScope } from '@/lib/companyScope';

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: cors() });
}

export async function GET(req: NextRequest) {
  const db = await getDb(req);
  try {
    const scope = await resolveCompanyScope(req);
    if (!scope) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: cors() });
    }

    const { searchParams } = new URL(req.url);
    const month = searchParams.get('month'); // YYYY-MM
    const includeSelf = searchParams.get('includeSelf') === 'true';

    if (!month) {
      return NextResponse.json({ error: 'month parameter is required (YYYY-MM)' }, { status: 400, headers: cors() });
    }

    const [year, monthNum] = month.split('-').map(Number);
    if (!year || !monthNum || monthNum < 1 || monthNum > 12) {
      return NextResponse.json({ error: 'Invalid month format. Use YYYY-MM.' }, { status: 400, headers: cors() });
    }

    const startOfMonth = new Date(year, monthNum - 1, 1);
    const endOfMonth = new Date(year, monthNum, 0, 23, 59, 59, 999);

    // Build the where clause for leave requests
    const where: Record<string, unknown> = {
      status: { in: ['pending', 'approved'] },
      startDate: { lte: endOfMonth },
      endDate: { gte: startOfMonth },
    };

    // Determine the employee's department for scoping
    let selfEmp: any = null;
    let teamMembers: any[] = [];

    if (scope.scope === 'self' || scope.scope === 'team') {
      selfEmp = await db.employee.findFirst({
        where: { userId: scope.userId, status: 'active' },
        select: { id: true, firstName: true, lastName: true, departmentId: true, avatar: true },
      }).catch(() => null);

      if (selfEmp?.departmentId) {
        // Get all team members in the same department
        teamMembers = await db.employee.findMany({
          where: { departmentId: selfEmp.departmentId, status: 'active' },
          select: { id: true, firstName: true, lastName: true, employeeId: true, avatar: true },
        }).catch(() => []);

        where.employee = { departmentId: selfEmp.departmentId, status: 'active' };
        if (!includeSelf && selfEmp?.id) {
          where.employeeId = { not: selfEmp.id };
        }
      } else {
        where.employee = { userId: scope.userId };
      }
    } else if (scope.companyId) {
      // Admin with a company selected
      where.employee = { companyId: scope.companyId, status: 'active' };
      teamMembers = await db.employee.findMany({
        where: { companyId: scope.companyId, status: 'active' },
        select: { id: true, firstName: true, lastName: true, employeeId: true, avatar: true },
      }).catch(() => []);
    } else {
      // Admin with NO company selected — fallback to first active company
      try {
        const firstCompany = await db.company.findFirst({
          where: { status: 'active' },
          select: { id: true },
          orderBy: { createdAt: 'asc' },
        });
        if (firstCompany) {
          where.employee = { companyId: firstCompany.id, status: 'active' };
          teamMembers = await db.employee.findMany({
            where: { companyId: firstCompany.id, status: 'active' },
            select: { id: true, firstName: true, lastName: true, employeeId: true, avatar: true },
          }).catch(() => []);
        }
      } catch { /* ignore */ }
    }

    // Fetch leave requests
    const leaveRequests = await db.leaveRequest.findMany({
      where,
      orderBy: { startDate: 'asc' },
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
    }).catch(() => []);

    // Build the response in the format the UI expects
    // Replace base64 avatars with proxy URLs to keep the response small and
    // avoid broken images (large data: URLs can fail in some browsers)
    const fixAvatar = (emp: any) => {
      if (!emp) return { id: '', firstName: 'Unknown', lastName: '', avatar: null };
      return {
        ...emp,
        avatar: emp.avatar && emp.avatar.startsWith('data:')
          ? `/api/employees/${emp.id}/photo`
          : emp.avatar || null,
      };
    };

    const leaves = leaveRequests.map((lr: any) => ({
      id: lr.id,
      status: lr.status,
      startDate: lr.startDate,
      endDate: lr.endDate,
      halfDay: lr.halfDay || false,
      halfDaySlot: lr.halfDaySlot || null,
      reason: lr.reason || null,
      leaveType: lr.leaveType || { id: '', name: 'Leave', code: '' },
      employee: fixAvatar(lr.employee),
    }));

    // Build byDate index: { "YYYY-MM-DD": [leaveIndex, ...] }
    const byDate: Record<string, number[]> = {};
    leaves.forEach((lv: any, idx: number) => {
      const s = new Date(lv.startDate);
      const e = new Date(lv.endDate);
      const cursor = new Date(s);
      let guard = 0;
      while (cursor <= e && guard < 400) {
        guard++;
        const dk = cursor.toISOString().split('T')[0];
        if (!byDate[dk]) byDate[dk] = [];
        byDate[dk].push(idx);
        cursor.setDate(cursor.getDate() + 1);
      }
    });

    // Build team list (replace base64 avatars with proxy URLs)
    const team = teamMembers.map((m: any) => ({
      id: m.id,
      firstName: m.firstName || '',
      lastName: m.lastName || '',
      employeeCode: m.employeeId || '',
      avatar: m.avatar && m.avatar.startsWith('data:')
        ? `/api/employees/${m.id}/photo`
        : m.avatar || null,
    }));

    const teamSize = team.length;

    const me = selfEmp
      ? { id: selfEmp.id, firstName: selfEmp.firstName, lastName: selfEmp.lastName }
      : null;

    return NextResponse.json({
      teamSize,
      month,
      leaves,
      byDate,
      team,
      me,
    }, { headers: cors() });
  } catch (error) {
    console.error('[team-calendar] error:', error);
    // Return a safe empty response so the UI doesn't crash
    return NextResponse.json({
      teamSize: 0,
      month: '',
      leaves: [],
      byDate: {},
      team: [],
      me: null,
    }, { headers: cors() });
  }
}
