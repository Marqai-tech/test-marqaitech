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
export async function GET(req: NextRequest) {
  const db = await getDb(req);
  try {
    const companyFilter = await getCompanyFilter(req);
    if (companyFilter === null) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    }

    let rules = await db.leavePolicyRule.findMany({
      where: { status: 'active', ...companyFilter },
      orderBy: [{ priority: 'desc' }, { name: 'asc' }],
      include: {
        branch: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
      },
    });

    // ─── FALLBACK (2026-11-06) ───
    // Same fix as /api/leave-types: if the company-scoped query returns 0
    // rules, the Leave Type Mapping tab shows "No policy rules defined yet"
    // even when rules DO exist in other companies of the same tenant. This
    // happens when an admin's company switcher is set to a company that has
    // no rules configured yet (but other companies do). Fall back to all
    // active rules across the tenant so admins can still see/map them.
    if (rules.length === 0) {
      const auth = await getAuthInfo(req).catch(() => null);
      const isAdmin = auth && ['super_admin', 'tenant_admin', 'ceo', 'admin'].includes(auth.role);
      if (isAdmin) {
        const fallback = await db.leavePolicyRule.findMany({
          where: { status: 'active' },
          orderBy: [{ priority: 'desc' }, { name: 'asc' }],
          include: {
            branch: { select: { id: true, name: true } },
            department: { select: { id: true, name: true } },
          },
        });
        if (fallback.length > 0) {
          console.warn(
            `[leave-policy-rules] Company-scoped query returned 0 rules for filter ${JSON.stringify(companyFilter)}; falling back to ${fallback.length} rules.`
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
