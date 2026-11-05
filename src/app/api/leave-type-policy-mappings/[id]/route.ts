/**
 * Leave Type – Policy Mapping [id] API
 * PUT    — update a mapping (admin only)
 * DELETE — delete a mapping (admin only)
 */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { getAuthInfo } from '@/lib/companyScope';
import { syncLeaveConfigSchema } from '@/lib/leave-config-schema-sync';
import { safeAuditLog } from '@/lib/audit-safe';

const ADMIN_ROLES = ['super_admin', 'tenant_admin', 'ceo', 'admin'];

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: cors() });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(req);
  try {
    await syncLeaveConfigSchema(db);
    const auth = await getAuthInfo(req);
    if (!auth || !ADMIN_ROLES.includes(auth.role)) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403, headers: cors() });
    }
    const { id } = await params;
    const body = await req.json();
    const { priority, branchId, departmentId, employmentType, genderApplicability, employeeIds, status } = body;

    const sets: string[] = [];
    const vals: any[] = [];
    let pIdx = 1;
    if (priority !== undefined) { sets.push(`"priority" = $${pIdx++}`); vals.push(Number(priority)); }
    if (branchId !== undefined) { sets.push(`"branchId" = $${pIdx++}`); vals.push(branchId || null); }
    if (departmentId !== undefined) { sets.push(`"departmentId" = $${pIdx++}`); vals.push(departmentId || null); }
    if (employmentType !== undefined) { sets.push(`"employmentType" = $${pIdx++}`); vals.push(employmentType); }
    if (genderApplicability !== undefined) { sets.push(`"genderApplicability" = $${pIdx++}`); vals.push(genderApplicability); }
    if (employeeIds !== undefined) { sets.push(`"employeeIds" = $${pIdx++}`); vals.push(employeeIds || null); }
    if (status !== undefined) { sets.push(`"status" = $${pIdx++}`); vals.push(status); }
    sets.push(`"updatedBy" = $${pIdx++}`); vals.push(auth.userId);
    sets.push(`"updatedAt" = NOW()`);
    vals.push(id);

    await db.$executeRawUnsafe(`UPDATE "LeaveTypePolicyMapping" SET ${sets.join(', ')} WHERE "id" = $${pIdx}`, ...vals);

    await safeAuditLog(db, {
      userId: auth.userId,
      action: 'leave_type_policy_mapping.update',
      module: 'leave_configuration',
      details: `Updated mapping ${id}`,
    }).catch(() => {});

    return NextResponse.json({ message: 'Mapping updated' }, { headers: cors() });
  } catch (error) {
    console.error('[mappings PUT] error:', error);
    return NextResponse.json({ error: 'Failed to update mapping' }, { status: 500, headers: cors() });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(req);
  try {
    await syncLeaveConfigSchema(db);
    const auth = await getAuthInfo(req);
    if (!auth || !ADMIN_ROLES.includes(auth.role)) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403, headers: cors() });
    }
    const { id } = await params;
    await db.$executeRawUnsafe(`DELETE FROM "LeaveTypePolicyMapping" WHERE "id" = $1`, id);

    await safeAuditLog(db, {
      userId: auth.userId,
      action: 'leave_type_policy_mapping.delete',
      module: 'leave_configuration',
      details: `Deleted mapping ${id}`,
    }).catch(() => {});

    return NextResponse.json({ message: 'Mapping deleted' }, { headers: cors() });
  } catch (error) {
    console.error('[mappings DELETE] error:', error);
    return NextResponse.json({ error: 'Failed to delete mapping' }, { status: 500, headers: cors() });
  }
}
