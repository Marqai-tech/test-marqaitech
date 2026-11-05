/**
 * Leave Type detail API — update + delete
 *   PATCH /api/leave-types/[id] — update a leave type (admin only)
 *   DELETE /api/leave-types/[id] — delete a leave type (admin only)
 */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { getAuthInfo } from '@/lib/companyScope';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(req);
  try {
    const auth = await getAuthInfo(req);
    if (!auth || !['super_admin', 'tenant_admin', 'ceo', 'admin'].includes(auth.role)) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403, headers: corsHeaders() });
    }
    const { id } = await params;
    const body = await req.json();
    const { name, code, description, defaultDays, isPaid, carryForward, maxCarryForward,
            employmentType, employeeStatus, probationRestricted, sandwichRuleEnabled, status } = body;

    const data: Record<string, unknown> = {};
    if (name !== undefined) {
      if (!/^[A-Za-z][A-Za-z\s'-]{1,49}$/.test(name)) {
        return NextResponse.json({ error: 'Name must be 2–50 characters, letters/spaces only' }, { status: 400, headers: corsHeaders() });
      }
      data.name = name;
    }
    if (code !== undefined) {
      const upperCode = String(code).toUpperCase();
      // BUG FIX: allow hyphens/numbers (e.g. LT-TNS) — previously
      // /^[A-Z]{2,10}$/ rejected valid codes.
      if (!/^[A-Z][A-Z0-9-]{1,9}$/.test(upperCode)) {
        return NextResponse.json({ error: 'Code must be 2–10 characters, starting with a letter. Allowed: uppercase letters (A–Z), numbers (0–9) and hyphens — e.g. CL, EL, LT-TNS.' }, { status: 400, headers: corsHeaders() });
      }
      // BUG FIX: duplicate-code check was missing on update — renaming a
      // type to an existing code hit the DB unique index as a 500.
      const duplicate = await db.leaveType.findFirst({
        where: { code: upperCode, id: { not: id } },
        select: { id: true, name: true },
      });
      if (duplicate) {
        return NextResponse.json({ error: `Leave type code "${upperCode}" is already used by "${duplicate.name}". Codes must be unique — please choose a different code.` }, { status: 409, headers: corsHeaders() });
      }
      data.code = upperCode;
    }
    if (description !== undefined) data.description = description || null;
    if (defaultDays !== undefined) {
      const dd = Number(defaultDays);
      if (isNaN(dd) || dd < 0 || dd > 366) {
        return NextResponse.json({ error: 'Annual quota must be 0–366' }, { status: 400, headers: corsHeaders() });
      }
      data.defaultDays = dd;
    }
    if (isPaid !== undefined) data.isPaid = !!isPaid;
    if (carryForward !== undefined) data.carryForward = !!carryForward;
    if (maxCarryForward !== undefined) data.maxCarryForward = Math.max(0, Number(maxCarryForward) || 0);
    if (status !== undefined) data.status = status;
    // Scope fields
    if (employmentType !== undefined) {
      data.employmentType = ['all', 'full-time', 'part-time', 'contract', 'internship'].includes(String(employmentType))
        ? String(employmentType) : 'all';
    }
    if (employeeStatus !== undefined) {
      data.employeeStatus = ['all', 'active', 'on_leave', 'inactive'].includes(String(employeeStatus))
        ? String(employeeStatus) : 'all';
    }
    if (probationRestricted !== undefined) data.probationRestricted = !!probationRestricted;
    if (sandwichRuleEnabled !== undefined) data.sandwichRuleEnabled = !!sandwichRuleEnabled;


    // Ensure new columns exist
    const newCols = [
      `ALTER TABLE "LeaveType" ADD COLUMN IF NOT EXISTS "maxConsecutiveDays" INTEGER DEFAULT 0`,
      `ALTER TABLE "LeaveType" ADD COLUMN IF NOT EXISTS "minAdvanceDays" INTEGER DEFAULT 0`,
      `ALTER TABLE "LeaveType" ADD COLUMN IF NOT EXISTS "accrualFrequency" TEXT DEFAULT 'yearly'`,
      `ALTER TABLE "LeaveType" ADD COLUMN IF NOT EXISTS "accrualAmount" DOUBLE PRECISION DEFAULT 0`,
      `ALTER TABLE "LeaveType" ADD COLUMN IF NOT EXISTS "maxBalance" DOUBLE PRECISION DEFAULT 0`,
      `ALTER TABLE "LeaveType" ADD COLUMN IF NOT EXISTS "leaveExpiryDays" INTEGER DEFAULT 0`,
      `ALTER TABLE "LeaveType" ADD COLUMN IF NOT EXISTS "negativeBalanceAllowed" BOOLEAN DEFAULT false`,
    ];
    for (const sql of newCols) {
      try { await db.$executeRawUnsafe(sql); } catch { /* ignore */ }
    }

    const updated = await db.leaveType.update({ where: { id }, data });
    return NextResponse.json({ leaveType: updated }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Leave type PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update leave type' }, { status: 500, headers: corsHeaders() });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(req);
  try {
    const auth = await getAuthInfo(req);
    if (!auth || !['super_admin', 'tenant_admin', 'ceo', 'admin'].includes(auth.role)) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403, headers: corsHeaders() });
    }
    const { id } = await params;

    const leaveType = await db.leaveType.findUnique({
      where: { id },
      select: { id: true, name: true, code: true, status: true },
    });
    if (!leaveType) {
      return NextResponse.json({ error: 'Leave type not found' }, { status: 404, headers: corsHeaders() });
    }

    // ─── BUG FIX: dependency / in-use check before deactivation ───
    // Previously any leave type could be deactivated with no warning even
    // when it was mapped to balances, rules or workflow configs. Now the
    // delete is rejected with a clear breakdown when the type is in use.
    const safeCount = async (fn: () => Promise<number>): Promise<number> => {
      try { return await fn(); } catch { return 0; }
    };
    const [requestCount, balanceCount, encashmentCount, workflowCount] = await Promise.all([
      safeCount(() => db.leaveRequest.count({ where: { leaveTypeId: id } })),
      safeCount(() => db.leaveBalance.count({ where: { leaveTypeId: id } })),
      safeCount(() => db.leaveEncashmentRequest?.count?.({ where: { leaveTypeId: id } }) ?? 0),
      safeCount(() => db.leaveWorkflowConfig?.count?.({ where: { leaveTypeId: id } }) ?? 0),
    ]);

    // LeavePolicyRule.leaveTypeAllocations is a denormalized JSON array —
    // scan rules that mention this leave type id.
    let ruleMappingCount = 0;
    try {
      const allocRules = await db.leavePolicyRule.findMany({
        where: { leaveTypeAllocations: { contains: id } },
        select: { id: true, leaveTypeAllocations: true },
      });
      ruleMappingCount = (allocRules || []).filter((r: { leaveTypeAllocations: string }) => {
        try {
          return ((JSON.parse(r.leaveTypeAllocations) || []) as Array<{ leaveTypeId?: string }>)
            .some((a) => a?.leaveTypeId === id);
        } catch { return false; }
      }).length;
    } catch { /* table may not exist in older DBs */ }

    const usages: string[] = [];
    if (requestCount > 0) usages.push(`${requestCount} leave request(s)`);
    if (balanceCount > 0) usages.push(`${balanceCount} employee leave balance(s)`);
    if (encashmentCount > 0) usages.push(`${encashmentCount} encashment request(s)`);
    if (workflowCount > 0) usages.push(`${workflowCount} approval workflow config(s)`);
    if (ruleMappingCount > 0) usages.push(`${ruleMappingCount} policy rule mapping(s)`);

    if (usages.length > 0) {
      return NextResponse.json({
        error: `Cannot delete leave type "${leaveType.name}" (${leaveType.code}): it is currently in use by ${usages.join(', ')}. Remove its usages or deactivate the related records first.`,
        usages,
      }, { status: 409, headers: corsHeaders() });
    }

    // Not in use — safe to soft-delete (deactivate).
    await db.leaveType.update({ where: { id }, data: { status: 'inactive' } });
    return NextResponse.json({ message: 'Leave type deactivated' }, { headers: corsHeaders() });
  } catch (error: any) {
    console.error('Leave type DELETE error:', error);
    if (error?.code === 'P2002') {
      return NextResponse.json({ error: 'Cannot delete this leave type due to existing references.' }, { status: 409, headers: corsHeaders() });
    }
    return NextResponse.json({ error: 'Failed to delete leave type' }, { status: 500, headers: corsHeaders() });
  }
}
