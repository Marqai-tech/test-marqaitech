import { getTokenFromHeaders, verifyToken } from '@/lib/auth';
import { NextRequest } from 'next/server';
import { getDb, getPlatformDb } from '@/lib/tenant-db';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

// GET: Get mapped policies for an employee
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    const decoded = await verifyToken(token);
    if (!decoded) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

    const { id } = await params;

    const employee = await db.employee.findUnique({
      where: { id },
      select: {
        id: true,
        employeeId: true,
        firstName: true,
        lastName: true,
        leavePolicyId: true,
        attendancePolicyId: true,
        travelPolicyId: true,
        salaryStructureId: true,
      },
    });

    if (!employee) {
      return Response.json({ error: 'Employee not found' }, { status: 404, headers: corsHeaders });
    }

    // Fetch policy details
    const [leavePolicies, attendancePolicies, travelPolicies, salaryStructures] = await Promise.all([
      db.policy.findMany({ where: { category: 'leave', status: 'active' }, orderBy: { title: 'asc' } }),
      db.policy.findMany({ where: { category: 'attendance', status: 'active' }, orderBy: { title: 'asc' } }),
      db.policy.findMany({ where: { category: 'travel', status: 'active' }, orderBy: { title: 'asc' } }),
      db.salaryStructure.findMany({ where: { status: 'active' }, orderBy: { name: 'asc' } }),
    ]);

    // Fetch mapped policy/structure details
    const [mappedLeavePolicy, mappedAttendancePolicy, mappedTravelPolicy, mappedSalaryStructure] = await Promise.all([
      employee.leavePolicyId ? db.policy.findUnique({ where: { id: employee.leavePolicyId } }) : null,
      employee.attendancePolicyId ? db.policy.findUnique({ where: { id: employee.attendancePolicyId } }) : null,
      employee.travelPolicyId ? db.policy.findUnique({ where: { id: employee.travelPolicyId } }) : null,
      employee.salaryStructureId ? db.salaryStructure.findUnique({
        where: { id: employee.salaryStructureId },
        include: { components: true },
      }) : null,
    ]);

    // Fetch leavePolicyIds via raw SQL (runtime column not in Prisma schema)
    let leavePolicyIds: string | null = null;
    try {
      const rows: any[] = await db.$queryRawUnsafe(`SELECT "leavePolicyIds" FROM "Employee" WHERE "id" = $1`, id);
      if (rows.length > 0) leavePolicyIds = rows[0].leavePolicyIds;
    } catch {}

    // Fetch leave policy options with leaveTypeIds (runtime column)
    let leavePolicyOptions = leavePolicies;
    try {
      const ltRows: any[] = await db.$queryRawUnsafe(`SELECT id, "leaveTypeIds" FROM "Policy" WHERE id = ANY($1::text[])`, leavePolicies.map(p => p.id));
      const ltMap = new Map(ltRows.map((r: any) => [r.id, r.leaveTypeIds]));
      leavePolicyOptions = leavePolicies.map(p => ({ ...p, leaveTypeIds: ltMap.get(p.id) || null }));
    } catch {}

    return Response.json({
      data: {
        employee: {
          id: employee.id,
          employeeId: employee.employeeId,
          firstName: employee.firstName,
          lastName: employee.lastName,
          leavePolicyId: employee.leavePolicyId,
          leavePolicyIds,
          attendancePolicyId: employee.attendancePolicyId,
          travelPolicyId: employee.travelPolicyId,
          salaryStructureId: employee.salaryStructureId,
        },
        options: {
          leavePolicies: leavePolicyOptions,
          attendancePolicies,
          travelPolicies,
          salaryStructures,
        },
        mapped: {
          leavePolicy: mappedLeavePolicy,
          attendancePolicy: mappedAttendancePolicy,
          travelPolicy: mappedTravelPolicy,
          salaryStructure: mappedSalaryStructure,
        },
      },
    }, { headers: corsHeaders });
  } catch (error: unknown) {
    console.error('Error fetching employee policies:', error);
    return Response.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500, headers: corsHeaders });
  }
}

// PUT: Update mapped policies for an employee
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    const decoded = await verifyToken(token);
    if (!decoded) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

    const { id } = await params;
    const body = await request.json();
    const userRole = (decoded as Record<string, unknown>).role as string;

    // Only admin/HR can update policies
    if (userRole !== 'super_admin' && (userRole !== 'tenant_admin' && userRole !== 'ceo') && userRole !== 'admin') {
      return Response.json({ error: 'Only HR/Admin can update employee policies' }, { status: 403, headers: corsHeaders });
    }

    const employee = await db.employee.findUnique({ where: { id } });
    if (!employee) {
      return Response.json({ error: 'Employee not found' }, { status: 404, headers: corsHeaders });
    }

    const updateData: Record<string, unknown> = {};
    if (body.leavePolicyId !== undefined) updateData.leavePolicyId = body.leavePolicyId || null;
    if (body.attendancePolicyId !== undefined) updateData.attendancePolicyId = body.attendancePolicyId || null;
    if (body.travelPolicyId !== undefined) updateData.travelPolicyId = body.travelPolicyId || null;
    if (body.salaryStructureId !== undefined) updateData.salaryStructureId = body.salaryStructureId || null;

    // leavePolicyIds — multiple leave policies stored as a JSON array in a runtime column
    if (body.leavePolicyIds !== undefined) {
      // Ensure the runtime column exists
      try { await db.$executeRawUnsafe(`ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "leavePolicyIds" TEXT`); } catch {}
      // Store as JSON string via raw SQL (Prisma doesn't know this column)
      try { await db.$executeRawUnsafe(`UPDATE "Employee" SET "leavePolicyIds" = $1 WHERE "id" = $2`, body.leavePolicyIds || null, id); } catch (e) { console.warn('[emp policies PUT] leavePolicyIds update failed:', e); }
      // Also update the single leavePolicyId for backward compat (first item)
      try {
        const ids = JSON.parse(body.leavePolicyIds || '[]');
        if (Array.isArray(ids) && ids.length > 0) {
          updateData.leavePolicyId = ids[0];
        } else {
          updateData.leavePolicyId = null;
        }
      } catch {}
    }

    const updated = await db.employee.update({
      where: { id },
      data: updateData,
    });

    // Fetch leavePolicyIds via raw SQL since Prisma doesn't know the column
    try {
      const rows: any[] = await db.$queryRawUnsafe(`SELECT "leavePolicyIds" FROM "Employee" WHERE "id" = $1`, id);
      if (rows.length > 0) {
        (updated as any).leavePolicyIds = rows[0].leavePolicyIds;
      }
    } catch {}

    return Response.json({ data: updated }, { headers: corsHeaders });
  } catch (error: unknown) {
    console.error('Error updating employee policies:', error);
    return Response.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500, headers: corsHeaders });
  }
}
