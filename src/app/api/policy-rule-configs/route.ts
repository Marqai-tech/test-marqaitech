/**
 * Policy Rule Configs API — Corrected Architecture
 *
 * Rules link to Type-Policy Mapping ID (not directly to LeavePolicyRule).
 * This follows the corrected architecture:
 *   LeaveType + LeavePolicy → LeaveTypePolicyMapping → PolicyRuleConfig
 *
 * GET   — list all rule configs (company-scoped)
 * POST  — create a new rule config (admin only)
 */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { getCompanyFilter, getAuthInfo } from '@/lib/companyScope';
import { validateCompanyOwnership } from '@/lib/company-ownership';
import { safeAuditLog } from '@/lib/audit-safe';

const ADMIN_ROLES = ['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_admin'];

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: cors() });
}

// Ensure the table exists with the corrected schema (mappingId-based)
async function ensureTable(db: any) {
  try {
    // Create table with mappingId (corrected architecture)
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "PolicyRuleConfig" (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        "mappingId" TEXT,
        "policyRuleId" TEXT,
        "leaveTypeId" TEXT,
        "leavePolicyId" TEXT,
        category TEXT NOT NULL,
        value TEXT NOT NULL,
        unit TEXT NOT NULL DEFAULT '',
        "applicabilityType" TEXT NOT NULL DEFAULT 'company',
        "departmentId" TEXT,
        "branchId" TEXT,
        "employeeId" TEXT,
        "effectiveFrom" TIMESTAMP(3),
        "effectiveTo" TIMESTAMP(3),
        status TEXT NOT NULL DEFAULT 'active',
        "companyId" TEXT NOT NULL,
        "createdBy" TEXT,
        "updatedBy" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add columns if they don't exist (backward compat with old schema)
    const colsToAdd = [
      { name: 'mappingId', type: 'TEXT' },
      { name: 'leavePolicyId', type: 'TEXT' },
      { name: 'applicabilityType', type: "TEXT NOT NULL DEFAULT 'company'" },
      { name: 'departmentId', type: 'TEXT' },
      { name: 'branchId', type: 'TEXT' },
      { name: 'employeeId', type: 'TEXT' },
    ];
    for (const col of colsToAdd) {
      try {
        await db.$executeRawUnsafe(`ALTER TABLE "PolicyRuleConfig" ADD COLUMN IF NOT EXISTS "${col.name}" ${col.type}`);
      } catch { /* column may already exist */ }
    }

    await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PolicyRuleConfig_companyId_idx" ON "PolicyRuleConfig" ("companyId")`);
    await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PolicyRuleConfig_mappingId_idx" ON "PolicyRuleConfig" ("mappingId")`);
    await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PolicyRuleConfig_policyRuleId_idx" ON "PolicyRuleConfig" ("policyRuleId")`);
  } catch { /* table may already exist */ }
}

// GET — list rule configs with joined mapping + policy + leave type + department + branch names
export async function GET(req: NextRequest) {
  const db = await getDb(req);
  try {
    await ensureTable(db);
    const companyFilter = await getCompanyFilter(req);
    if (companyFilter === null) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: cors() });
    }

    const companyId = (companyFilter as any).companyId;
    let rows: any[] = [];

    const query = `
      SELECT r.*,
             m."leaveTypeId" as "mappingLeaveTypeId",
             m."policyRuleId" as "mappingPolicyRuleId",
             p.name as "policyRuleName",
             lt.name as "leaveTypeName", lt.code as "leaveTypeCode",
             d.name as "departmentName",
             b.name as "branchName",
             e."firstName" as "employeeFirstName", e."lastName" as "employeeLastName"
      FROM "PolicyRuleConfig" r
      LEFT JOIN "LeaveTypePolicyMapping" m ON m.id = r."mappingId"
      LEFT JOIN "LeavePolicyRule" p ON p.id = COALESCE(r."policyRuleId", m."policyRuleId")
      LEFT JOIN "LeaveType" lt ON lt.id = COALESCE(r."leaveTypeId", m."leaveTypeId")
      LEFT JOIN "Department" d ON d.id = r."departmentId"
      LEFT JOIN "Branch" b ON b.id = r."branchId"
      LEFT JOIN "Employee" e ON e.id = r."employeeId"
      ${companyId ? 'WHERE r."companyId" = $1' : ''}
      ORDER BY r."createdAt" DESC
    `;

    if (companyId) {
      rows = await db.$queryRawUnsafe(query, companyId);
    } else {
      rows = await db.$queryRawUnsafe(query);
    }

    return NextResponse.json({ data: rows }, { headers: cors() });
  } catch (error) {
    console.error('[policy-rule-configs GET] error:', error);
    return NextResponse.json({ data: [] }, { headers: cors() });
  }
}

// POST — create a new rule config
export async function POST(req: NextRequest) {
  const db = await getDb(req);
  try {
    await ensureTable(db);
    const auth = await getAuthInfo(req);
    if (!auth || !ADMIN_ROLES.includes(auth.role)) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403, headers: cors() });
    }

    const body = await req.json();
    const {
      name, description,
      mappingId, policyRuleId, leaveTypeId, leavePolicyId,
      category, value, unit,
      applicabilityType, departmentId, branchId, employeeId,
      effectiveFrom, effectiveTo, status, companyId
    } = body;

    if (!name || !category || value === undefined) {
      return NextResponse.json({ error: 'Missing required fields: name, category, value' }, { status: 400, headers: cors() });
    }

    // If mappingId is provided, resolve leaveTypeId + policyRuleId from the mapping
    let resolvedLeaveTypeId = leaveTypeId;
    let resolvedPolicyRuleId = policyRuleId;
    let resolvedLeavePolicyId = leavePolicyId;

    if (mappingId) {
      const mappingRows: any[] = await db.$queryRawUnsafe(
        `SELECT "leaveTypeId", "policyRuleId" FROM "LeaveTypePolicyMapping" WHERE id = $1 AND status = 'active'`,
        mappingId
      );
      if (mappingRows.length === 0) {
        return NextResponse.json({ error: 'Mapping not found or inactive' }, { status: 404, headers: cors() });
      }
      if (!resolvedLeaveTypeId) resolvedLeaveTypeId = mappingRows[0].leaveTypeId;
      if (!resolvedPolicyRuleId) resolvedPolicyRuleId = mappingRows[0].policyRuleId;
    }

    // Resolve companyId
    let resolvedCompanyId = companyId;
    if (!resolvedCompanyId) {
      const cf = await getCompanyFilter(req);
      if (cf && 'companyId' in cf) resolvedCompanyId = (cf as any).companyId;
    }
    if (!resolvedCompanyId) {
      try { const fc = await db.company.findFirst({ where: { status: 'active' }, select: { id: true }, orderBy: { createdAt: 'asc' } }); if (fc) resolvedCompanyId = fc.id; } catch {}
    }
    if (!resolvedCompanyId) {
      return NextResponse.json({ error: 'companyId is required' }, { status: 400, headers: cors() });
    }

    // Company ownership validation
    const ownership = await validateCompanyOwnership(req, resolvedCompanyId);
    if (!ownership.ok) {
      return NextResponse.json({ error: ownership.error || 'Access denied' }, { status: 403, headers: cors() });
    }

    const id = `prc_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    await db.$executeRawUnsafe(`
      INSERT INTO "PolicyRuleConfig"
        ("id", "name", "description", "mappingId", "policyRuleId", "leaveTypeId", "leavePolicyId",
         "category", "value", "unit", "applicabilityType", "departmentId", "branchId", "employeeId",
         "effectiveFrom", "effectiveTo", "status", "companyId", "createdBy", "updatedBy", "createdAt", "updatedAt")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, NOW(), NOW())
    `,
      id, name, description || null,
      mappingId || null, resolvedPolicyRuleId || null, resolvedLeaveTypeId || null, resolvedLeavePolicyId || null,
      category, String(value), unit || '',
      applicabilityType || 'company', departmentId || null, branchId || null, employeeId || null,
      effectiveFrom ? new Date(effectiveFrom) : null, effectiveTo ? new Date(effectiveTo) : null,
      status || 'active', resolvedCompanyId, auth.userId, auth.userId
    );

    await safeAuditLog(db, {
      userId: auth.userId,
      action: 'policy_rule_config.create',
      module: 'leave_configuration',
      details: `Created policy rule config ${id}: ${name} (${category} = ${value})`,
    }).catch(() => {});

    return NextResponse.json({ id, message: 'Rule created' }, { status: 201, headers: cors() });
  } catch (error: any) {
    console.error('[policy-rule-configs POST] error:', error);
    return NextResponse.json({ error: 'Failed to create rule' }, { status: 500, headers: cors() });
  }
}
