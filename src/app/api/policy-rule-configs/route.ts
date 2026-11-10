/**
 * Policy Rule Configs API
 * GET   — list all rule configs (company-scoped)
 * POST  — create a new rule config (admin only)
 *
 * Table is created at runtime via CREATE TABLE IF NOT EXISTS (no Prisma
 * migration needed — backward compatible).
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

// Ensure the table exists
async function ensureTable(db: any) {
  try {
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "PolicyRuleConfig" (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        "policyRuleId" TEXT NOT NULL,
        "leaveTypeId" TEXT,
        category TEXT NOT NULL,
        value TEXT NOT NULL,
        unit TEXT NOT NULL DEFAULT '',
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
    await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PolicyRuleConfig_companyId_idx" ON "PolicyRuleConfig" ("companyId")`);
    await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PolicyRuleConfig_policyRuleId_idx" ON "PolicyRuleConfig" ("policyRuleId")`);
    await db.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "PolicyRuleConfig_unique_idx" ON "PolicyRuleConfig" ("policyRuleId", "category", "leaveTypeId", "companyId") WHERE "leaveTypeId" IS NOT NULL`);
  } catch { /* table may already exist */ }
}

// GET — list rule configs with joined policy rule + leave type names
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

    if (companyId) {
      rows = await db.$queryRawUnsafe(`
        SELECT r.*, p.name as "policyRuleName", lt.name as "leaveTypeName", lt.code as "leaveTypeCode"
        FROM "PolicyRuleConfig" r
        LEFT JOIN "LeavePolicyRule" p ON p.id = r."policyRuleId"
        LEFT JOIN "LeaveType" lt ON lt.id = r."leaveTypeId"
        WHERE r."companyId" = $1
        ORDER BY r."createdAt" DESC
      `, companyId);
    } else {
      // Admin with no company selected — show all
      rows = await db.$queryRawUnsafe(`
        SELECT r.*, p.name as "policyRuleName", lt.name as "leaveTypeName", lt.code as "leaveTypeCode"
        FROM "PolicyRuleConfig" r
        LEFT JOIN "LeavePolicyRule" p ON p.id = r."policyRuleId"
        LEFT JOIN "LeaveType" lt ON lt.id = r."leaveTypeId"
        ORDER BY r."createdAt" DESC
      `);
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
    const { name, description, policyRuleId, leaveTypeId, category, value, unit, effectiveFrom, effectiveTo, status, companyId } = body;

    if (!name || !policyRuleId || !category || value === undefined) {
      return NextResponse.json({ error: 'Missing required fields: name, policyRuleId, category, value' }, { status: 400, headers: cors() });
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
        ("id", "name", "description", "policyRuleId", "leaveTypeId", "category", "value", "unit",
         "effectiveFrom", "effectiveTo", "status", "companyId", "createdBy", "updatedBy", "createdAt", "updatedAt")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
    `,
      id, name, description || null, policyRuleId, leaveTypeId || null, category, String(value), unit || '',
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
    if (error?.message?.includes('unique') || error?.code === '23505') {
      return NextResponse.json({ error: 'A rule with this category already exists for this policy + leave type combination.' }, { status: 409, headers: cors() });
    }
    return NextResponse.json({ error: 'Failed to create rule' }, { status: 500, headers: cors() });
  }
}
