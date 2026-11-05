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

    // ─── HARD DELETE: remove all related records first, then delete the type ───
    // Delete in dependency order to avoid FK constraint violations.
    const safeDelete = async (fn: () => Promise<any>) => { try { return await fn(); } catch { return null; } };

    // 1. Delete LeaveTypePolicyMapping rows referencing this type
    await safeDelete(() => db.$executeRawUnsafe(`DELETE FROM "LeaveTypePolicyMapping" WHERE "leaveTypeId" = $1`, id));

    // 2. Delete LeaveLedger entries
    await safeDelete(() => db.$executeRawUnsafe(`DELETE FROM "LeaveLedger" WHERE "leaveTypeId" = $1`, id));

    // 3. Delete LeaveApprovalStep rows for requests of this type
    await safeDelete(() => db.$executeRawUnsafe(`DELETE FROM "LeaveApprovalStep" WHERE "leaveRequestId" IN (SELECT id FROM "LeaveRequest" WHERE "leaveTypeId" = $1)`, id));

    // 4. Delete LeaveAttachment rows for requests of this type
    await safeDelete(() => db.$executeRawUnsafe(`DELETE FROM "LeaveAttachment" WHERE "leaveRequestId" IN (SELECT id FROM "LeaveRequest" WHERE "leaveTypeId" = $1)`, id));

    // 5. Delete LeaveRequest rows
    await safeDelete(() => db.leaveRequest.deleteMany({ where: { leaveTypeId: id } }));

    // 6. Delete LeaveBalance rows
    await safeDelete(() => db.leaveBalance.deleteMany({ where: { leaveTypeId: id } }));

    // 7. Delete LeaveEncashmentRequest rows
    await safeDelete(() => db.leaveEncashmentRequest?.deleteMany?.({ where: { leaveTypeId: id } }));

    // 8. Delete LeaveWorkflowConfig rows referencing this type
    await safeDelete(() => db.leaveWorkflowConfig?.deleteMany?.({ where: { leaveTypeId: id } }));

    // 9. Remove from LeavePolicyRule.leaveTypeAllocations JSON
    try {
      const rules = await db.leavePolicyRule.findMany({
        where: { leaveTypeAllocations: { contains: id } },
        select: { id: true, leaveTypeAllocations: true },
      });
      for (const rule of rules) {
        try {
          const allocs = JSON.parse(rule.leaveTypeAllocations || '[]');
          const filtered = allocs.filter((a: any) => a?.leaveTypeId !== id);
          await db.leavePolicyRule.update({
            where: { id: rule.id },
            data: { leaveTypeAllocations: JSON.stringify(filtered) },
          });
        } catch { /* skip if JSON parse fails */ }
      }
    } catch { /* table may not exist */ }

    // 10. Delete LeaveCarryForwardRule rows referencing this type
    await safeDelete(() => db.$executeRawUnsafe(`DELETE FROM "LeaveCarryForwardRule" WHERE "leaveTypeId" = $1`, id));

    // Finally — hard delete the leave type itself
    await db.leaveType.delete({ where: { id } });

    return NextResponse.json({ message: `Leave type "${leaveType.name}" deleted successfully` }, { headers: corsHeaders() });
  } catch (error: any) {
    console.error('Leave type DELETE error:', error);
    // If hard delete fails (e.g. FK constraint), fall back to soft-delete
    try {
      await db.leaveType.update({ where: { id: (await params).id }, data: { status: 'inactive' } }).catch(() => {});
      return NextResponse.json({ message: 'Leave type deactivated (hard delete failed, soft-deleted instead)' }, { headers: corsHeaders() });
    } catch {
      return NextResponse.json({ error: 'Failed to delete leave type' }, { status: 500, headers: corsHeaders() });
    }
  }
}
