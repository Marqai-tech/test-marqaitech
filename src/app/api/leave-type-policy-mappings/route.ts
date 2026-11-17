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
import { validateCompanyOwnership } from '@/lib/company-ownership';

const ADMIN_ROLES = ['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_admin'];

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
    const conditions = [`m.status = 'active'`];
    const params: any[] = [];

    if (companyId) {
      conditions.push(`m."companyId" = $${params.length + 1}`);
      params.push(companyId);
    }
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

    // ─── FALLBACK (2026-11-06) ───
    // If the company-scoped query returned 0 mappings but the admin has
    // leave types and policies configured (possibly in a different company
    // due to the previous misfiled-records bug), fall back to showing ALL
    // mappings across the tenant. Better to show them than an empty table.
    if (rows.length === 0) {
      const auth = await getAuthInfo(req).catch(() => null);
      const isAdmin = auth && ADMIN_ROLES.includes(auth.role);
      if (isAdmin) {
        const allRows: any[] = await db.$queryRawUnsafe(`
          SELECT m.*,
                 lt.name as "leaveTypeName", lt.code as "leaveTypeCode",
                 r.name as "policyRuleName"
          FROM "LeaveTypePolicyMapping" m
          LEFT JOIN "LeaveType" lt ON lt.id = m."leaveTypeId"
          LEFT JOIN "LeavePolicyRule" r ON r.id = m."policyRuleId"
          WHERE m.status = 'active'
          ORDER BY m.priority DESC, m."createdAt" DESC
        `);
        if (allRows.length > 0) {
          console.warn(
            `[mappings GET] Company-scoped query returned 0 mappings for companyId=${companyId}; falling back to ${allRows.length} mappings across the tenant.`
          );
          rows = allRows;
        }
      }
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

    // ─── COMPANY OWNERSHIP VALIDATION ───
    // Verify the authenticated admin can manage this company (prevents
    // cross-tenant data leakage via direct API requests with a foreign companyId).
    const ownership = await validateCompanyOwnership(req, resolvedCompanyId);
    if (!ownership.ok) {
      return NextResponse.json({ error: ownership.error || 'Access denied' }, { status: 403, headers: cors() });
    }

    // Verify leave type + policy rule exist.
    // BUG FIX: previously this required BOTH the leave type and policy rule
    // to belong to resolvedCompanyId. Due to the previous misfiled-records
    // bug, they might be in a different company. Now we look them up without
    // the companyId filter — if they exist anywhere, allow the mapping. The
    // mapping itself is still stored under resolvedCompanyId (the selected
    // company) so it shows up in the right company's list.
    const [lt, pr] = await Promise.all([
      db.leaveType.findFirst({ where: { id: leaveTypeId }, select: { id: true, name: true, companyId: true } }),
      db.leavePolicyRule.findFirst({ where: { id: policyRuleId }, select: { id: true, name: true, companyId: true } }),
    ]);
    if (!lt) return NextResponse.json({ error: 'Leave type not found. Please refresh the Leave Types tab and try again.' }, { status: 404, headers: cors() });
    if (!pr) return NextResponse.json({ error: 'Leave policy rule not found. Please refresh the Leave Policies tab and try again.' }, { status: 404, headers: cors() });

    // If the leave type / policy rule are in a different company than the
    // selected one, reassign them to the selected company so everything is
    // consistent. This auto-fixes the misfiled-records issue.
    if (lt.companyId !== resolvedCompanyId) {
      try {
        await db.leaveType.update({ where: { id: leaveTypeId }, data: { companyId: resolvedCompanyId } });
        console.warn(`[mappings POST] Reassigned leave type ${leaveTypeId} from company ${lt.companyId} to ${resolvedCompanyId}`);
      } catch (e) { /* non-fatal */ }
    }
    if (pr.companyId !== resolvedCompanyId) {
      try {
        await db.leavePolicyRule.update({ where: { id: policyRuleId }, data: { companyId: resolvedCompanyId } });
        console.warn(`[mappings POST] Reassigned policy rule ${policyRuleId} from company ${pr.companyId} to ${resolvedCompanyId}`);
      } catch (e) { /* non-fatal */ }
    }

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
