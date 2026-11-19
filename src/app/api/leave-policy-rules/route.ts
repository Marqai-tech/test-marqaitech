/**
 * Leave Policy Rules API — Scoped rules by employee type, branch, department
 * GET  — list all rules for the company
 * POST — create a new rule (admin only)
 * PUT  — update a rule (admin only)
 * DELETE — delete a rule (admin only)
 */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { getCompanyFilter, getAuthInfo } from '@/lib/companyScope';
import { ensureLeaveSetupSchema } from '@/lib/leave-setup-schema';
import { validateCompanyOwnership } from '@/lib/company-ownership';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

// GET: List leave policy rules (company-scoped)
// Returns ALL columns including spec fields added via ALTER TABLE at runtime
// (leaveTypeId, entitledDaysPerYear, gender, creditFrequency, etc.).
// Previously this used Prisma's findMany, which silently drops columns not
// declared in schema.prisma — that broke the setup wizard's Step 4 mapping
// UI which filters rules by leaveTypeId ("No rule — create in Step 3").
// Raw SQL is the only way to return those runtime-added columns.
export async function GET(req: NextRequest) {
  const db = await getDb(req);
  try {
    try { await ensureLeaveSetupSchema((sql: string) => db.$executeRawUnsafe(sql)); } catch {}
    const companyFilter = await getCompanyFilter(req);
    if (companyFilter === null) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    }

    const companyId = (companyFilter as any).companyId;

    // SELECT r.* returns every column on the row, including ones added at
    // runtime via ALTER TABLE ADD COLUMN IF NOT EXISTS. LEFT JOINs preserve
    // the previous Prisma `include: { branch, department }` shape by adding
    // nested {id, name} objects after the query.
    const selectSql = `
      SELECT r.*,
             b.name AS "branchName",
             d.name AS "departmentName",
             lt.name AS "ruleLeaveTypeName", lt.code AS "ruleLeaveTypeCode"
      FROM "LeavePolicyRule" r
      LEFT JOIN "Branch"     b  ON b.id  = r."branchId"
      LEFT JOIN "Department" d  ON d.id = r."departmentId"
      LEFT JOIN "LeaveType"  lt ON lt.id = r."leaveTypeId"
      WHERE r.status = 'active'
    `;
    const orderSql = ` ORDER BY r.priority DESC, r.name ASC`;

    const reshape = (rows: any[]) => rows.map((r: any) => {
      const branchName = r.branchName;
      const departmentName = r.departmentName;
      const ruleLeaveTypeName = r.ruleLeaveTypeName;
      const ruleLeaveTypeCode = r.ruleLeaveTypeCode;
      delete r.branchName;
      delete r.departmentName;
      delete r.ruleLeaveTypeName;
      delete r.ruleLeaveTypeCode;
      return {
        ...r,
        branch: r.branchId ? { id: r.branchId, name: branchName } : null,
        department: r.departmentId ? { id: r.departmentId, name: departmentName } : null,
        leaveType: r.leaveTypeId ? { id: r.leaveTypeId, name: ruleLeaveTypeName, code: ruleLeaveTypeCode } : null,
      };
    });

    let rules: any[] = [];
    if (companyId) {
      rules = reshape(await db.$queryRawUnsafe(`${selectSql} AND r."companyId" = $1${orderSql}`, companyId));
    } else {
      rules = reshape(await db.$queryRawUnsafe(`${selectSql}${orderSql}`));
    }

    // ─── FALLBACK (2026-11-06) ───
    // Same intent as before: if the company-scoped query returns 0 rules but
    // the admin has rules configured in other companies of the same tenant
    // (e.g. due to the previous misfiled-records bug), fall back to all
    // active rules across the tenant so admins can still see/map them.
    if (rules.length === 0) {
      const auth = await getAuthInfo(req).catch(() => null);
      const isAdmin = auth && ['super_admin', 'tenant_admin', 'ceo', 'admin'].includes(auth.role);
      if (isAdmin) {
        const fallback = reshape(await db.$queryRawUnsafe(`${selectSql}${orderSql}`));
        if (fallback.length > 0) {
          console.warn(
            `[leave-policy-rules] Company-scoped query returned 0 rules for companyId=${companyId}; falling back to ${fallback.length} rules.`
          );
          rules = fallback;
        }
      }
    }

    return NextResponse.json({ data: rules }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Leave policy rules GET error:', error);
    return NextResponse.json({ data: [] }, { headers: corsHeaders() });
  }
}

// POST: Create a new leave policy rule
export async function POST(req: NextRequest) {
  const db = await getDb(req);
  try {
    try { await ensureLeaveSetupSchema((sql: string) => db.$executeRawUnsafe(sql)); } catch {}
    const auth = await getAuthInfo(req);
    if (!auth || !['super_admin', 'tenant_admin', 'admin', 'hr_admin', 'ceo'].includes(auth.role)) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403, headers: corsHeaders() });
    }

    const body = await req.json();
    const {
      name, policyId, companyId, employmentType, branchId, departmentId,
      leaveTypeAllocations, sandwichRuleEnabled, proRataEnabled,
      probationRestriction, probationMonths, encashmentAllowed,
      carryForwardGlobal, maxCarryForwardDays, priority, status,
    } = body;

    if (!name) {
      return NextResponse.json({ error: 'Rule name is required' }, { status: 400, headers: corsHeaders() });
    }

    // Resolve companyId — do NOT blindly trust the frontend value.
    // 1. From body (frontend switcher) → validate ownership
    // 2. From getCompanyFilter (session scope)
    // 3. Fallback: first active company in the tenant (only for super_admin)
    let resolvedCompanyId = companyId;
    if (!resolvedCompanyId) {
      const companyFilter = await getCompanyFilter(req);
      if (companyFilter && 'companyId' in companyFilter) {
        resolvedCompanyId = companyFilter.companyId as string;
      }
    }
    if (!resolvedCompanyId) {
      try {
        const fc = await db.company.findFirst({ where: { status: 'active' }, select: { id: true }, orderBy: { createdAt: 'asc' } });
        if (fc) resolvedCompanyId = fc.id;
      } catch {}
    }
    if (!resolvedCompanyId) {
      return NextResponse.json({ error: 'companyId required. Ensure a company exists.' }, { status: 400, headers: corsHeaders() });
    }

    // ─── COMPANY OWNERSHIP VALIDATION ───
    // Verify the authenticated admin actually has the right to manage this
    // company. Prevents cross-tenant data leakage via direct API requests.
    const ownership = await validateCompanyOwnership(req, resolvedCompanyId);
    if (!ownership.ok) {
      return NextResponse.json({ error: ownership.error || 'Access denied' }, { status: 403, headers: corsHeaders() });
    }

    // Step 1: Create with Prisma — only fields that exist in the generated schema
    const rule = await db.leavePolicyRule.create({
      data: {
        name,
        policyId: policyId || null,
        companyId: resolvedCompanyId,
        employmentType: employmentType || 'all',
        branchId: branchId || null,
        departmentId: departmentId || null,
        leaveTypeAllocations: typeof leaveTypeAllocations === 'string'
          ? leaveTypeAllocations
          : JSON.stringify(leaveTypeAllocations || []),
        sandwichRuleEnabled: sandwichRuleEnabled ?? true,
        proRataEnabled: proRataEnabled ?? false,
        probationRestriction: probationRestriction ?? true,
        probationMonths: probationMonths ?? 6,
        encashmentAllowed: encashmentAllowed ?? false,
        carryForwardGlobal: carryForwardGlobal ?? true,
        maxCarryForwardDays: maxCarryForwardDays ?? 5,
        priority: priority ?? 0,
        status: status || 'active',
      },
      include: {
        branch: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
      },
    });

    // Step 2: UPDATE with raw SQL for ALL spec fields
    try {
      // First ensure all columns exist
      const ensureCols = [
        'ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "creditFrequency" TEXT',
        'ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "creditDays" DOUBLE PRECISION NOT NULL DEFAULT 0',
        'ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "prorata" BOOLEAN NOT NULL DEFAULT false',
        'ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "applyNextYear" BOOLEAN NOT NULL DEFAULT false',
        'ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "maxStretch" DOUBLE PRECISION NOT NULL DEFAULT 0',
        'ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "monthlyLimit" BOOLEAN NOT NULL DEFAULT false',
        'ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "monthlyMaxDays" DOUBLE PRECISION NOT NULL DEFAULT 0',
        'ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "monthlyMaxTimes" INTEGER NOT NULL DEFAULT 0',
        'ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "backDate" BOOLEAN NOT NULL DEFAULT false',
        'ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "backDateWithin" INTEGER NOT NULL DEFAULT 0',
        'ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "docRequired" BOOLEAN NOT NULL DEFAULT false',
        'ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "docAfterDays" DOUBLE PRECISION NOT NULL DEFAULT 0',
        'ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "docWithin" INTEGER NOT NULL DEFAULT 0',
        'ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "excludeHoliday" BOOLEAN NOT NULL DEFAULT true',
        'ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "excludeWeeklyOff" BOOLEAN NOT NULL DEFAULT true',
        'ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "maritalStatus" TEXT NOT NULL DEFAULT \'both\'',
        'ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "empStatusJson" TEXT',
        'ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "workingReq" BOOLEAN NOT NULL DEFAULT false',
        'ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "workingDays" INTEGER NOT NULL DEFAULT 0',
        'ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "esi" BOOLEAN NOT NULL DEFAULT false',
        'ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "esiSalary" DOUBLE PRECISION NOT NULL DEFAULT 0',
        'ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "cfMode" TEXT NOT NULL DEFAULT \'Limited\'',
        'ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "cfDays" DOUBLE PRECISION NOT NULL DEFAULT 0',
        'ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "maxAccum" DOUBLE PRECISION NOT NULL DEFAULT 0',
        'ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "expiryDays" INTEGER NOT NULL DEFAULT 0',
        'ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "encashLimit" DOUBLE PRECISION NOT NULL DEFAULT 0',
        'ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "halfDayAllowed" BOOLEAN NOT NULL DEFAULT true',
      ];
      for (const col of ensureCols) { try { await db.$executeRawUnsafe(col); } catch {} }

      const sql = 'UPDATE "LeavePolicyRule" SET "gender" = $1, "entitledDaysPerYear" = $2, "advanceNoticeDays" = $3, "minDaysPerRequest" = $4, "maxDaysPerRequest" = $5, "carryForwardToNextYear" = $6, "leaveEncashmentApplicable" = $7, "leaveTypeId" = $8, "ruleCode" = $9, "specificEmployeeIds" = $10, "onlyTheseEmployees" = $11, "creditFrequency" = $12, "creditDays" = $13, "prorata" = $14, "applyNextYear" = $15, "maxStretch" = $16, "monthlyLimit" = $17, "monthlyMaxDays" = $18, "monthlyMaxTimes" = $19, "backDate" = $20, "backDateWithin" = $21, "docRequired" = $22, "docAfterDays" = $23, "docWithin" = $24, "excludeHoliday" = $25, "excludeWeeklyOff" = $26, "maritalStatus" = $27, "empStatusJson" = $28, "workingReq" = $29, "workingDays" = $30, "esi" = $31, "esiSalary" = $32, "cfMode" = $33, "cfDays" = $34, "maxAccum" = $35, "expiryDays" = $36, "encashLimit" = $37, "halfDayAllowed" = $38 WHERE "id" = $39';
      await db.$executeRawUnsafe(sql,
        String(body.gender || 'both'),
        Number(body.entitledDaysPerYear || 0),
        Number(body.advanceNoticeDays || 0),
        Number(body.minDaysPerRequest || 0.5),
        Number(body.maxDaysPerRequest || 0),
        Boolean(body.carryForwardToNextYear || body.carryForward || false),
        Boolean(body.leaveEncashmentApplicable || body.encash || false),
        body.leaveTypeId || null,
        body.ruleCode || null,
        body.specificEmployeeIds ? JSON.stringify(body.specificEmployeeIds) : null,
        Boolean(body.onlyTheseEmployees || false),
        String(body.creditFrequency || 'Monthly'),
        Number(body.creditDays || 0),
        Boolean(body.prorata || false),
        Boolean(body.applyNextYear || false),
        Number(body.maxStretch || 0),
        Boolean(body.monthlyLimit || false),
        Number(body.monthlyMaxDays || 0),
        Number(body.monthlyMaxTimes || 0),
        Boolean(body.backDate || false),
        Number(body.backDateWithin || 0),
        Boolean(body.docRequired || false),
        Number(body.docAfterDays || 0),
        Number(body.docWithin || 0),
        Boolean(body.excludeHoliday ?? true),
        Boolean(body.excludeWeeklyOff ?? true),
        String(body.marital || 'both'),
        body.empStatus ? JSON.stringify(body.empStatus) : null,
        Boolean(body.workingReq || false),
        Number(body.workingDays || 0),
        Boolean(body.esi || false),
        Number(body.esiSalary || 0),
        String(body.cfMode || 'Limited'),
        Number(body.cfDays || 0),
        Number(body.maxAccum || 0),
        Number(body.expiryDays || 0),
        Number(body.encashLimit || 0),
        Boolean(body.halfDayAllowed ?? true),
        rule.id
      );
    } catch (e) { console.error('[leave-policy-rules] spec field update failed:', e); }

    return NextResponse.json({ rule }, { status: 201, headers: corsHeaders() });
  } catch (error) {
    console.error('Leave policy rules POST error:', error);
    return NextResponse.json({ error: 'Failed to create leave policy rule' }, { status: 500, headers: corsHeaders() });
  }
}

// Spec fields added to LeavePolicyRule at runtime via ALTER TABLE — NOT in
// schema.prisma. Prisma.update throws "Unknown arg" for these, so PUT must
// split them out and update them via raw SQL. List is aligned with
// ensureLeaveSetupSchema() in src/lib/leave-setup-schema.ts and the
// ensureCols block in POST above.
const RULE_SPEC_FIELDS: Array<{ name: string; ddl: string }> = [
  { name: 'gender',                    ddl: `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "gender" TEXT NOT NULL DEFAULT 'both'` },
  { name: 'specificEmployeeIds',       ddl: `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "specificEmployeeIds" TEXT` },
  { name: 'onlyTheseEmployees',        ddl: `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "onlyTheseEmployees" BOOLEAN NOT NULL DEFAULT false` },
  { name: 'entitledDaysPerYear',       ddl: `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "entitledDaysPerYear" DOUBLE PRECISION NOT NULL DEFAULT 0` },
  { name: 'advanceNoticeDays',         ddl: `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "advanceNoticeDays" INTEGER NOT NULL DEFAULT 0` },
  { name: 'minDaysPerRequest',         ddl: `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "minDaysPerRequest" DOUBLE PRECISION NOT NULL DEFAULT 0.5` },
  { name: 'maxDaysPerRequest',         ddl: `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "maxDaysPerRequest" DOUBLE PRECISION NOT NULL DEFAULT 0` },
  { name: 'carryForwardToNextYear',    ddl: `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "carryForwardToNextYear" BOOLEAN NOT NULL DEFAULT false` },
  { name: 'leaveEncashmentApplicable', ddl: `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "leaveEncashmentApplicable" BOOLEAN NOT NULL DEFAULT false` },
  { name: 'leaveTypeId',               ddl: `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "leaveTypeId" TEXT` },
  { name: 'ruleCode',                  ddl: `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "ruleCode" TEXT` },
  { name: 'creditFrequency',           ddl: `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "creditFrequency" TEXT NOT NULL DEFAULT 'Monthly'` },
  { name: 'creditDays',                ddl: `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "creditDays" DOUBLE PRECISION NOT NULL DEFAULT 0` },
  { name: 'prorata',                   ddl: `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "prorata" BOOLEAN NOT NULL DEFAULT false` },
  { name: 'applyNextYear',             ddl: `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "applyNextYear" BOOLEAN NOT NULL DEFAULT false` },
  { name: 'maxStretch',                ddl: `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "maxStretch" DOUBLE PRECISION NOT NULL DEFAULT 0` },
  { name: 'monthlyLimit',              ddl: `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "monthlyLimit" BOOLEAN NOT NULL DEFAULT false` },
  { name: 'monthlyMaxDays',            ddl: `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "monthlyMaxDays" DOUBLE PRECISION NOT NULL DEFAULT 0` },
  { name: 'monthlyMaxTimes',           ddl: `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "monthlyMaxTimes" INTEGER NOT NULL DEFAULT 0` },
  { name: 'backDate',                  ddl: `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "backDate" BOOLEAN NOT NULL DEFAULT false` },
  { name: 'backDateWithin',            ddl: `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "backDateWithin" INTEGER NOT NULL DEFAULT 0` },
  { name: 'docRequired',               ddl: `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "docRequired" BOOLEAN NOT NULL DEFAULT false` },
  { name: 'docAfterDays',              ddl: `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "docAfterDays" DOUBLE PRECISION NOT NULL DEFAULT 0` },
  { name: 'docWithin',                 ddl: `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "docWithin" INTEGER NOT NULL DEFAULT 0` },
  { name: 'excludeHoliday',            ddl: `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "excludeHoliday" BOOLEAN NOT NULL DEFAULT true` },
  { name: 'excludeWeeklyOff',          ddl: `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "excludeWeeklyOff" BOOLEAN NOT NULL DEFAULT true` },
  { name: 'maritalStatus',             ddl: `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "maritalStatus" TEXT NOT NULL DEFAULT 'both'` },
  { name: 'empStatusJson',             ddl: `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "empStatusJson" TEXT` },
  { name: 'workingReq',                ddl: `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "workingReq" BOOLEAN NOT NULL DEFAULT false` },
  { name: 'workingDays',               ddl: `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "workingDays" INTEGER NOT NULL DEFAULT 0` },
  { name: 'esi',                       ddl: `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "esi" BOOLEAN NOT NULL DEFAULT false` },
  { name: 'esiSalary',                 ddl: `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "esiSalary" DOUBLE PRECISION NOT NULL DEFAULT 0` },
  { name: 'cfMode',                    ddl: `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "cfMode" TEXT NOT NULL DEFAULT 'Limited'` },
  { name: 'cfDays',                    ddl: `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "cfDays" DOUBLE PRECISION NOT NULL DEFAULT 0` },
  { name: 'maxAccum',                  ddl: `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "maxAccum" DOUBLE PRECISION NOT NULL DEFAULT 0` },
  { name: 'expiryDays',                ddl: `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "expiryDays" INTEGER NOT NULL DEFAULT 0` },
  { name: 'encashLimit',               ddl: `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "encashLimit" DOUBLE PRECISION NOT NULL DEFAULT 0` },
  { name: 'halfDayAllowed',            ddl: `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "halfDayAllowed" BOOLEAN NOT NULL DEFAULT true` },
];
const RULE_SPEC_FIELD_NAMES = new Set(RULE_SPEC_FIELDS.map(f => f.name));

// PUT: Update a leave policy rule
// Splits the update payload into Prisma-known fields (updated via Prisma)
// and spec fields added via ALTER TABLE at runtime (updated via raw SQL).
// Previously the entire payload was passed to Prisma.update, which threw
// "Unknown arg" for spec fields like leaveTypeId, entitledDaysPerYear, etc.
export async function PUT(req: NextRequest) {
  const db = await getDb(req);
  try {
    try { await ensureLeaveSetupSchema((sql: string) => db.$executeRawUnsafe(sql)); } catch {}
    const auth = await getAuthInfo(req);
    if (!auth || !['super_admin', 'tenant_admin', 'admin', 'hr_admin', 'ceo'].includes(auth.role)) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403, headers: corsHeaders() });
    }

    const body = await req.json();
    const { id, ...updateData } = body;

    if (!id) {
      return NextResponse.json({ error: 'Rule ID is required' }, { status: 400, headers: corsHeaders() });
    }

    // Handle JSON serialization for leaveTypeAllocations
    if (updateData.leaveTypeAllocations && typeof updateData.leaveTypeAllocations !== 'string') {
      updateData.leaveTypeAllocations = JSON.stringify(updateData.leaveTypeAllocations);
    }

    // Task 66 FIX: strip undefined values from updateData (Prisma throws on
    // undefined for optional fields). Also strip null values for relation
    // fields that might cause FK violations.
    const cleanData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updateData)) {
      if (value !== undefined) {
        cleanData[key] = value;
      }
    }

    // Split into Prisma-known fields and spec fields (raw SQL columns added
    // at runtime via ALTER TABLE). Prisma.update throws "Unknown arg" if
    // spec fields are passed in data.
    // BUG-LM-004 FIX: The frontend sends `marital` but the DB column is `maritalStatus`.
    // Map it before splitting so it goes into specData, not prismaData.
    const FIELD_ALIASES: Record<string, string> = {
      marital: 'maritalStatus',
    };
    const prismaData: Record<string, unknown> = {};
    const specData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(cleanData)) {
      const fieldName = FIELD_ALIASES[key] || key;
      if (RULE_SPEC_FIELD_NAMES.has(fieldName)) specData[fieldName] = value;
      else if (fieldName !== key) { /* aliased field already handled above */ }
      else prismaData[key] = value;
    }

    // Step 1: Prisma update for Prisma-known fields only.
    if (Object.keys(prismaData).length > 0) {
      await db.leavePolicyRule.update({
        where: { id },
        data: prismaData,
      }).catch((updateErr: any) => {
        console.error('[LeavePolicyRules PUT] Prisma update failed:', updateErr?.message || updateErr);
        if (updateErr?.code === 'P2025') {
          throw new Error('Leave policy rule not found. It may have been deleted. Please refresh the page and try again.');
        }
        if (updateErr?.code === 'P2002') {
          throw new Error('A rule with this name already exists. Please use a unique name.');
        }
        // BUG-LM-005 FIX: Never dump raw Prisma errors to the UI. Log server-side,
        // return a short friendly message with a code the user can give support.
        console.error('[LeavePolicyRules PUT] Prisma update failed:', updateErr?.message || updateErr);
        if (updateErr?.code === 'P2025') {
          throw new Error('Leave policy rule not found. It may have been deleted. Please refresh the page and try again.');
        }
        if (updateErr?.code === 'P2002') {
          throw new Error('A rule with this name already exists. Please use a unique name.');
        }
        throw new Error('Could not save the rule. Please try again or contact support with code LV-R01.');
      });
    }

    // Step 2: Raw SQL UPDATE for spec fields (leaveTypeId, entitledDaysPerYear, etc.)
    if (Object.keys(specData).length > 0) {
      // Ensure all spec columns exist (idempotent — safe even if ensureLeaveSetupSchema already ran).
      for (const f of RULE_SPEC_FIELDS) {
        try { await db.$executeRawUnsafe(f.ddl); } catch {}
      }
      const sets: string[] = [];
      const params: any[] = [];
      for (const [field, value] of Object.entries(specData)) {
        params.push(value);
        sets.push(`"${field}" = $${params.length}`);
      }
      params.push(id);
      try {
        await db.$executeRawUnsafe(
          `UPDATE "LeavePolicyRule" SET ${sets.join(', ')} WHERE "id" = $${params.length}`,
          ...params,
        );
      } catch (e: any) {
        console.error('[LeavePolicyRules PUT] spec field update failed:', e?.message || e);
        // Non-fatal — Prisma update already succeeded for the core fields.
      }
    }

    // Step 3: Fetch the updated row via raw SQL so spec fields come back too.
    const rows: any[] = await db.$queryRawUnsafe(`
      SELECT r.*,
             b.name AS "branchName",
             d.name AS "departmentName",
             lt.name AS "ruleLeaveTypeName", lt.code AS "ruleLeaveTypeCode"
      FROM "LeavePolicyRule" r
      LEFT JOIN "Branch"     b  ON b.id  = r."branchId"
      LEFT JOIN "Department" d  ON d.id = r."departmentId"
      LEFT JOIN "LeaveType"  lt ON lt.id = r."leaveTypeId"
      WHERE r.id = $1
    `, id);
    const row = rows[0];
    if (!row) {
      return NextResponse.json({ error: 'Rule not found after update' }, { status: 404, headers: corsHeaders() });
    }
    const branchName = row.branchName;
    const departmentName = row.departmentName;
    const ruleLeaveTypeName = row.ruleLeaveTypeName;
    const ruleLeaveTypeCode = row.ruleLeaveTypeCode;
    delete row.branchName;
    delete row.departmentName;
    delete row.ruleLeaveTypeName;
    delete row.ruleLeaveTypeCode;
    const rule = {
      ...row,
      branch: row.branchId ? { id: row.branchId, name: branchName } : null,
      department: row.departmentId ? { id: row.departmentId, name: departmentName } : null,
      leaveType: row.leaveTypeId ? { id: row.leaveTypeId, name: ruleLeaveTypeName, code: ruleLeaveTypeCode } : null,
    };

    return NextResponse.json({ rule }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Leave policy rules PUT error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to update leave policy rule';
    return NextResponse.json({ error: msg }, { status: 500, headers: corsHeaders() });
  }
}

// DELETE: Delete a leave policy rule
export async function DELETE(req: NextRequest) {
  const db = await getDb(req);
  try {
    const auth = await getAuthInfo(req);
    if (!auth || !['super_admin', 'tenant_admin', 'admin', 'hr_admin', 'ceo'].includes(auth.role)) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403, headers: corsHeaders() });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Rule ID is required' }, { status: 400, headers: corsHeaders() });
    }

    await db.leavePolicyRule.delete({ where: { id } });
    return NextResponse.json({ message: 'Rule deleted' }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Leave policy rules DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete leave policy rule' }, { status: 500, headers: corsHeaders() });
  }
}
