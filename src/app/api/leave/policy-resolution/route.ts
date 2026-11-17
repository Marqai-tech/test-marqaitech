/**
 * Leave Policy Resolution API
 * GET /api/leave/policy-resolution?employeeId=&leaveTypeId=
 *
 * Returns the applicable LeavePolicyRule for the given employee + leave type,
 * using the priority + specificity conflict resolution cascade.
 * Used by:
 *   - Apply Leave (server-side enforcement)
 *   - The "Policy Resolution Preview" debug panel in the configuration UI
 *
 * Auth: admin can query any employee in their company; self-scope can only
 * query their own resolution.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { resolveCompanyScope } from '@/lib/companyScope';
import { resolveLeavePolicy } from '@/lib/leave-policy-resolver';

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
    const employeeId = searchParams.get('employeeId');
    const leaveTypeId = searchParams.get('leaveTypeId');

    if (!employeeId || !leaveTypeId) {
      return NextResponse.json({ error: 'employeeId and leaveTypeId are required' }, { status: 400, headers: cors() });
    }

    // Self-scope: only allow querying own employee record
    if (scope.scope === 'self') {
      const selfEmp = await db.employee.findFirst({
        where: { userId: scope.userId, status: 'active' },
        select: { id: true },
      });
      if (!selfEmp || selfEmp.id !== employeeId) {
        return NextResponse.json({ error: 'You can only query policy resolution for yourself' }, { status: 403, headers: cors() });
      }
    } else if (scope.companyId) {
      // Admin: verify employee belongs to the selected company
      const emp = await db.employee.findFirst({
        where: { id: employeeId, companyId: scope.companyId },
        select: { id: true },
      });
      if (!emp) {
        return NextResponse.json({ error: 'Employee not found in your company' }, { status: 404, headers: cors() });
      }
    }

    const result = await resolveLeavePolicy(db, { employeeId, leaveTypeId, companyId: scope.companyId });
    return NextResponse.json({ resolution: result }, { headers: cors() });
  } catch (error) {
    console.error('[policy-resolution GET] error:', error);
    return NextResponse.json({ error: 'Failed to resolve policy' }, { status: 500, headers: cors() });
  }
}
