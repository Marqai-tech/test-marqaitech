/**
 * Leave Type – Policy Mapping API
 * GET   — list all mappings for the company (optionally filter by leaveTypeId)
 * POST  — create a new mapping (admin only)
 *
 * TEST-ENVIRONMENT ONLY — operates on tenant DB via getDb(request).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { getCompanyFilter, getAuthInfo } from '@/lib/companyScope';
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

// GET — list mappings, joined with leave type + policy rule names
export async function GET(req: NextRequest) {
  const db = await getDb(req);
  try {
    await syncLeaveConfigSchema(db);
    const companyFilter = await getCompanyFilter(req);
    if (companyFilter === null) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: cors() });
    }
    const { searchParams } = new URL(req.url);
    const leaveTypeId = searchParams.get('leaveTypeId');
    const policyRuleId = searchParams.get('policyRuleId');

    // Raw SQL because Prisma client may not have the new model cached on first run
    const companyId = (companyFilter as any).companyId;
    let rows: any[] = [];
    if (companyId) {
      const conditions = [`m."companyId" = $1`, `m.status = 'active'`];
      const params: any[] = [companyId];
      if (leaveTypeId) { conditions.push(`m."leaveTypeId" = $${params.length + 1}`); params.push(leaveTypeId); }
      if (policyRuleId) { conditions.push(`m."policyRuleId" = $${params.length + 1}`); params.push(policyRuleId); }
      rows = await db.$queryRawUnsafe(`
        SELECT m.*, 
               lt.name as "leaveTypeName", lt.code as "leaveTypeCode",
               r.name as "policyRuleName"
        FROM "LeaveTypePolicyMapping" m
        LEFT JOIN "LeaveType" lt ON lt.id = m."leaveTypeId"
        LEFT JOIN "LeavePolicyRule" r ON r.id = m."policyRuleId"
        WHERE ${conditions.join(' AND ')}
        ORDER BY m.priority DESC, m."createdAt" DESC
      `, ...params);
    }

    return NextResponse.json({ data: rows }, { headers: cors() });
  } catch (error) {
    console.error('[mappings GET] error:', error);
    return NextResponse.json({ data: [] }, { headers: cors() });
  }
}

// POST — create a mapping
export async function POST(req: NextRequest) {
  const db = await getDb(req);
  try {
    await syncLeaveConfigSchema(db);
    const auth = await getAuthInfo(req);
    if (!auth || !ADMIN_ROLES.includes(auth.role)) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403, headers: cors() });
    }
    const body = await req.json();
    const { leaveTypeId, policyRuleId, companyId, priority, branchId, departmentId,
            employmentType, genderApplicability, employeeIds, status } = body;

    if (!leaveTypeId || !policyRuleId) {
      return NextResponse.json({ error: 'leaveTypeId and policyRuleId are required' }, { status: 400, headers: cors() });
    }

    // Resolve companyId
    let resolvedCompanyId = companyId;
    if (!resolvedCompanyId) {
      const cf = await getCompanyFilter(req);
      if (cf && 'companyId' in cf) resolvedCompanyId = (cf as any).companyId;
    }
    // Fallback: auto-resolve to first active company
    if (!resolvedCompanyId) {
      try {
        const firstCompany = await db.company.findFirst({
          where: { status: 'active' },
          select: { id: true },
          orderBy: { createdAt: 'asc' },
        });
        if (firstCompany) resolvedCompanyId = firstCompany.id;
      } catch { /* ignore */ }
    }
    if (!resolvedCompanyId) {
      return NextResponse.json({ error: 'companyId is required. Please select a company or ensure at least one company exists.' }, { status: 400, headers: cors() });
    }

    // Verify leave type + policy rule exist and belong to the same company
    const [lt, pr] = await Promise.all([
      db.leaveType.findFirst({ where: { id: leaveTypeId, companyId: resolvedCompanyId }, select: { id: true, name: true } }),
      db.leavePolicyRule.findFirst({ where: { id: policyRuleId, companyId: resolvedCompanyId }, select: { id: true, name: true } }),
    ]);
    if (!lt) return NextResponse.json({ error: 'Leave type not found in this company' }, { status: 404, headers: cors() });
    if (!pr) return NextResponse.json({ error: 'Leave policy rule not found in this company' }, { status: 404, headers: cors() });

    // Prevent duplicate (leaveTypeId, policyRuleId, companyId) — the unique index enforces this
    const id = `ltpm_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    try {
      await db.$executeRawUnsafe(`
        INSERT INTO "LeaveTypePolicyMapping" 
          ("id", "leaveTypeId", "policyRuleId", "companyId", "priority", "branchId", "departmentId",
           "employmentType", "genderApplicability", "employeeIds", "status", "createdBy", "updatedBy", "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
      `,
        id, leaveTypeId, policyRuleId, resolvedCompanyId,
        Number(priority) || 50,
        branchId || null, departmentId || null,
        employmentType || 'all', genderApplicability || 'all',
        employeeIds || null,
        status || 'active',
        auth.userId, auth.userId,
      );
    } catch (e: any) {
      if (e?.message?.includes('unique') || e?.code === '23505') {
        return NextResponse.json({ error: 'A mapping for this leave type + policy already exists. Edit the existing one instead.' }, { status: 409, headers: cors() });
      }
      throw e;
    }

    await safeAuditLog(db, {
      userId: auth.userId,
      action: 'leave_type_policy_mapping.create',
      module: 'leave_configuration',
      details: `Created mapping ${id}: ${lt.name} → ${pr.name} (priority ${priority || 50})`,
    }).catch(() => {});

    return NextResponse.json({ id, message: 'Mapping created' }, { status: 201, headers: cors() });
  } catch (error) {
    console.error('[mappings POST] error:', error);
    return NextResponse.json({ error: 'Failed to create mapping' }, { status: 500, headers: cors() });
  }
}
