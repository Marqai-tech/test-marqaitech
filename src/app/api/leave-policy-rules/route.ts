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

/** Ensure the extended LeavePolicyRule columns exist (runtime DDL). */
async function ensurePolicyRuleColumns(db: any) {
  const cols = [
    `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "description" TEXT`,
    `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "annualQuota" INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "accrualFrequency" TEXT NOT NULL DEFAULT 'yearly'`,
    `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "accrualAmount" DOUBLE PRECISION NOT NULL DEFAULT 0`,
    `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "maxBalance" DOUBLE PRECISION NOT NULL DEFAULT 0`,
    `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "openingBalance" DOUBLE PRECISION NOT NULL DEFAULT 0`,
    `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "prorateNewJoiners" BOOLEAN NOT NULL DEFAULT true`,
    `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "accrualStartDate" TEXT`,
    `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "minAdvanceNotice" INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "maxFutureDays" INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "backdatedAllowed" BOOLEAN NOT NULL DEFAULT false`,
    `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "backdatedMaxDays" INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "minConsecutiveDays" INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "maxConsecutiveDays" INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "halfDayEligible" BOOLEAN NOT NULL DEFAULT true`,
    `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "requireAttachment" BOOLEAN NOT NULL DEFAULT false`,
    `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "requireAttachmentAfterDays" INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "overlappingLeaveAllowed" BOOLEAN NOT NULL DEFAULT false`,
    `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "genderApplicability" TEXT NOT NULL DEFAULT 'all'`,
    `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "employeeIds" TEXT`,
    `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "effectiveFromDate" TIMESTAMP(3)`,
    `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "effectiveToDate" TIMESTAMP(3)`,
    `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "yearEndProcessingMode" TEXT NOT NULL DEFAULT 'carry_forward'`,
    `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "yearEndMaxCarryForward" INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "yearEndMaxEncashment" INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "yearEndExpiryDays" INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "encashmentBasis" TEXT NOT NULL DEFAULT 'basic'`,
    `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "encashmentMaxDays" INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "encashmentAutoYearEnd" BOOLEAN NOT NULL DEFAULT false`,
    `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "encashmentEmployeeInitiated" BOOLEAN NOT NULL DEFAULT true`,
    `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "createdBy" TEXT`,
    `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "updatedBy" TEXT`,
    // LeaveType new columns
    `ALTER TABLE "LeaveType" ADD COLUMN IF NOT EXISTS "calendarColor" TEXT`,
    `ALTER TABLE "LeaveType" ADD COLUMN IF NOT EXISTS "halfDayAllowed" BOOLEAN NOT NULL DEFAULT true`,
    `ALTER TABLE "LeaveType" ADD COLUMN IF NOT EXISTS "documentRequirement" TEXT NOT NULL DEFAULT 'never'`,
    // LeaveRequest new columns
    `ALTER TABLE "LeaveRequest" ADD COLUMN IF NOT EXISTS "chargeableDays" DOUBLE PRECISION`,
    `ALTER TABLE "LeaveRequest" ADD COLUMN IF NOT EXISTS "reversedAt" TIMESTAMP(3)`,
    `ALTER TABLE "LeaveRequest" ADD COLUMN IF NOT EXISTS "cancellationReason" TEXT`,
    // LeaveLedger table
    `CREATE TABLE IF NOT EXISTS "LeaveLedger" ("id" TEXT NOT NULL, "employeeId" TEXT NOT NULL, "leaveTypeId" TEXT NOT NULL, "year" INTEGER NOT NULL, "transactionType" TEXT NOT NULL, "days" DOUBLE PRECISION NOT NULL, "balanceBefore" DOUBLE PRECISION NOT NULL DEFAULT 0, "balanceAfter" DOUBLE PRECISION NOT NULL DEFAULT 0, "sourceType" TEXT, "sourceId" TEXT, "reason" TEXT, "createdBy" TEXT, "leaveRequestId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(), CONSTRAINT "LeaveLedger_pkey" PRIMARY KEY ("id"))`,
    // LeaveTypePolicyMapping table
    `CREATE TABLE IF NOT EXISTS "LeaveTypePolicyMapping" ("id" TEXT NOT NULL, "leaveTypeId" TEXT NOT NULL, "policyRuleId" TEXT NOT NULL, "companyId" TEXT NOT NULL, "priority" INTEGER NOT NULL DEFAULT 50, "branchId" TEXT, "departmentId" TEXT, "designationId" TEXT, "employmentType" TEXT NOT NULL DEFAULT 'all', "genderApplicability" TEXT NOT NULL DEFAULT 'all', "employeeIds" TEXT, "effectiveFrom" TIMESTAMP(3), "effectiveTo" TIMESTAMP(3), "status" TEXT NOT NULL DEFAULT 'active', "createdBy" TEXT, "updatedBy" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(), CONSTRAINT "LeaveTypePolicyMapping_pkey" PRIMARY KEY ("id"))`,
    // LeaveCarryForwardRule table
    `CREATE TABLE IF NOT EXISTS "LeaveCarryForwardRule" ("id" TEXT NOT NULL, "policyRuleId" TEXT NOT NULL, "leaveTypeId" TEXT, "conditionField" TEXT NOT NULL DEFAULT 'balance', "conditionOperator" TEXT NOT NULL DEFAULT 'gte', "conditionValue" DOUBLE PRECISION NOT NULL DEFAULT 0, "carryForwardDays" DOUBLE PRECISION NOT NULL DEFAULT 0, "encashmentDays" DOUBLE PRECISION NOT NULL DEFAULT 0, "remainingTreatment" TEXT NOT NULL DEFAULT 'expire', "priority" INTEGER NOT NULL DEFAULT 0, "status" TEXT NOT NULL DEFAULT 'active', "createdBy" TEXT, "updatedBy" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(), CONSTRAINT "LeaveCarryForwardRule_pkey" PRIMARY KEY ("id"))`,
  ];
  for (const sql of cols) {
    try { await db.$executeRawUnsafe(sql); } catch { /* ignore */ }
  }
}

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
export async function GET(req: NextRequest) {
  const db = await getDb(req);
  try {
    const companyFilter = await getCompanyFilter(req);
    if (companyFilter === null) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    }

    // Ensure the extended columns exist before querying
    await ensurePolicyRuleColumns(db);

    const rules = await db.leavePolicyRule.findMany({
      where: { status: 'active', ...companyFilter },
      orderBy: [{ priority: 'desc' }, { name: 'asc' }],
      include: {
        branch: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
      },
    });

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
    const auth = await getAuthInfo(req);
    if (!auth || !['super_admin', 'tenant_admin', 'admin'].includes(auth.role)) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403, headers: corsHeaders() });
    }

    const body = await req.json();
    const {
      name, policyId, companyId, employmentType, branchId, departmentId,
      leaveTypeAllocations, sandwichRuleEnabled, proRataEnabled,
      probationRestriction, probationMonths, encashmentAllowed,
      carryForwardGlobal, maxCarryForwardDays, priority, status,
    } = body;

    // Ensure the extended columns exist before trying to create
    await ensurePolicyRuleColumns(db);

    if (!name) {
      return NextResponse.json({ error: 'Rule name is required' }, { status: 400, headers: corsHeaders() });
    }

    // Resolve companyId
    let resolvedCompanyId = companyId;
    if (!resolvedCompanyId) {
      const companyFilter = await getCompanyFilter(req);
      if (companyFilter && 'companyId' in companyFilter) {
        resolvedCompanyId = companyFilter.companyId as string;
      }
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
      return NextResponse.json({ error: 'companyId is required. Please select a company from the switcher, or ensure at least one company exists in the tenant.' }, { status: 400, headers: corsHeaders() });
    }

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

    return NextResponse.json({ rule }, { status: 201, headers: corsHeaders() });
  } catch (error) {
    console.error('Leave policy rules POST error:', error);
    return NextResponse.json({ error: 'Failed to create leave policy rule' }, { status: 500, headers: corsHeaders() });
  }
}

// PUT: Update a leave policy rule
export async function PUT(req: NextRequest) {
  const db = await getDb(req);
  try {
    const auth = await getAuthInfo(req);
    if (!auth || !['super_admin', 'tenant_admin', 'admin'].includes(auth.role)) {
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

    const rule = await db.leavePolicyRule.update({
      where: { id },
      data: cleanData,
      include: {
        branch: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
      },
    }).catch((updateErr: any) => {
      console.error('[LeavePolicyRules PUT] Prisma update failed:', updateErr?.message || updateErr);
      // Check for common Prisma errors
      if (updateErr?.code === 'P2025') {
        throw new Error('Leave policy rule not found. It may have been deleted. Please refresh the page and try again.');
      }
      if (updateErr?.code === 'P2002') {
        throw new Error('A rule with this name already exists. Please use a unique name.');
      }
      throw new Error(`Failed to update: ${updateErr?.message || 'Unknown Prisma error'}`);
    });

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
    if (!auth || !['super_admin', 'tenant_admin', 'admin'].includes(auth.role)) {
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
