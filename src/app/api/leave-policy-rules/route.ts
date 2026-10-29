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
    if (!auth || !['super_admin', 'tenant_admin', 'ceo', 'admin'].includes(auth.role)) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403, headers: corsHeaders() });
    }

    const body = await req.json();
    const {
      name, policyId, companyId, employmentType, branchId, departmentId,
      leaveTypeAllocations, sandwichRuleEnabled, proRataEnabled,
      probationRestriction, probationMonths, encashmentAllowed,
      carryForwardGlobal, maxCarryForwardDays, priority, status,
      genderApplicability, employeeIds, yearEndProcessingMode,
      yearEndMaxCarryForward, yearEndMaxEncashment, yearEndExpiryDays,
      effectiveFromDate, effectiveToDate,
    } = body;

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
    if (!resolvedCompanyId) {
      return NextResponse.json({ error: 'companyId is required' }, { status: 400, headers: corsHeaders() });
    }


    // ─── Ensure new LeavePolicyRule columns exist ───
    const policyColumns = [
      `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "genderApplicability" TEXT DEFAULT 'all'`,
      `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "employeeIds" TEXT`,
      `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "yearEndProcessingMode" TEXT DEFAULT 'carry_forward'`,
      `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "yearEndMaxCarryForward" INTEGER DEFAULT 0`,
      `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "yearEndMaxEncashment" INTEGER DEFAULT 0`,
      `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "yearEndExpiryDays" INTEGER DEFAULT 0`,
      `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "effectiveFromDate" TIMESTAMP(3)`,
      `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "effectiveToDate" TIMESTAMP(3)`,
    ];
    for (const sql of policyColumns) {
      try { await db.$executeRawUnsafe(sql); } catch { /* ignore */ }
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
      genderApplicability: genderApplicability || 'all',
      employeeIds: employeeIds || null,
      yearEndProcessingMode: yearEndProcessingMode || 'carry_forward',
      yearEndMaxCarryForward: Number(yearEndMaxCarryForward) || 0,
      yearEndMaxEncashment: Number(yearEndMaxEncashment) || 0,
      yearEndExpiryDays: Number(yearEndExpiryDays) || 0,
      effectiveFromDate: effectiveFromDate ? new Date(effectiveFromDate) : null,
      effectiveToDate: effectiveToDate ? new Date(effectiveToDate) : null,
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
    if (!auth || !['super_admin', 'tenant_admin', 'ceo', 'admin'].includes(auth.role)) {
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
    if (!auth || !['super_admin', 'tenant_admin', 'ceo', 'admin'].includes(auth.role)) {
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
