import { NextRequest, NextResponse } from 'next/server';
import { getDb, getPlatformDb } from '@/lib/tenant-db';
import { getCompanyFilter, getAuthInfo, resolveCompanyScope } from '@/lib/companyScope';
import { resolveLeavePolicy } from '@/lib/leave-policy-resolver';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

// GET: List all leave types (company-scoped)
export async function GET(req: NextRequest) {
  const db = await getDb(req);
  try {
    const companyFilter = await getCompanyFilter(req);
    if (companyFilter === null) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    }

    // Employee self-service ('self' scope): restrict the list to the types of
    // the employee's OWN company. getCompanyFilter returns {} for employees,
    // which made the apply dropdown show every company's leave types — and
    // submitting one from another company is rejected by the leave POST
    // validation. (2026-09-09)
    const scope = await resolveCompanyScope(req);
    if (scope && scope.scope === 'self' && !scope.companyId) {
      const own = await db.employee.findFirst({
        where: { userId: scope.userId, status: 'active' },
        select: { companyId: true },
      });
      if (own?.companyId) {
        companyFilter.companyId = own.companyId;
      }
    }

    const allLeaveTypes = await db.leaveType.findMany({
      where: { status: 'active', ...companyFilter },
      orderBy: { name: 'asc' },
    });

    // ─── Mapping enforcement: filter leave types by LeaveTypePolicyMapping ───
    // For employees (scope='self'), only show leave types that have an active
    // mapping matching the employee's scope (branch, dept, gender, etc.).
    // Admins see all types (for configuration purposes).
    // If NO mappings exist at all for this company, show all types (backward-compat).
    let filteredTypes = allLeaveTypes;

    if (scope && scope.scope === 'self') {
      // Find the employee's record
      const emp = await db.employee.findFirst({
        where: { userId: scope.userId, status: 'active' },
        select: { id: true, companyId: true },
      }).catch(() => null);

      if (emp?.id) {
        // Check if ANY mappings exist for this company
        let mappingsExist = false;
        try {
          const rows: any[] = await db.$queryRawUnsafe(
            `SELECT COUNT(*)::int as cnt FROM "LeaveTypePolicyMapping" WHERE "companyId" = $1 AND status = 'active'`,
            emp.companyId
          );
          mappingsExist = rows[0]?.cnt > 0;
        } catch { /* table might not exist yet — no filtering */ }

        if (mappingsExist) {
          // Filter: only keep types where the resolver finds a match
          const visibleTypes = [];
          for (const lt of allLeaveTypes) {
            try {
              const policy = await resolveLeavePolicy(db, { employeeId: emp.id, leaveTypeId: lt.id, companyId: emp.companyId });
              if (policy.source !== 'none') {
                visibleTypes.push(lt);
              }
            } catch {
              // If resolver fails, include the type (don't block the employee)
              visibleTypes.push(lt);
            }
          }
          filteredTypes = visibleTypes;
        }
      }
    }

    // ─── FALLBACK (2026-11-06) ───
    // If the company-scoped + mapping-enforced query returned 0 leave types,
    // the apply-leave dropdown renders completely empty — even when leave
    // types DO exist in other companies of the same tenant. This commonly
    // happens when:
    //   • An admin's company switcher is set to a company that has no
    //     leave types configured yet (but other companies do).
    //   • An employee's companyId doesn't match where the admin created
    //     the leave types.
    // Recovery:
    //   • For admins (super_admin/tenant_admin/ceo/admin): fall back to all
    //     active leave types across the tenant so they can still apply/test.
    //   • For employees: try the employee's own companyId first; if still
    //     empty, fall back to all types so they're not blocked from applying.
    if (filteredTypes.length === 0) {
      const auth = await getAuthInfo(req).catch(() => null);
      const isAdmin = auth && ['super_admin', 'tenant_admin', 'ceo', 'admin'].includes(auth.role);
      const fallbackFilter = isAdmin
        ? {}
        : (scope?.scope === 'self' && scope.companyId ? { companyId: scope.companyId } : {});
      const fallback = await db.leaveType.findMany({
        where: { status: 'active', ...fallbackFilter },
        orderBy: { name: 'asc' },
      });
      if (fallback.length > 0) {
        console.warn(
          `[leave-types] Company-scoped query returned 0 types for filter ${JSON.stringify(companyFilter)}; falling back to ${fallback.length} types.`
        );
        filteredTypes = fallback;
      }
    }

    return NextResponse.json({ data: filteredTypes }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Leave types GET error:', error);
    return NextResponse.json({ data: [] }, { headers: corsHeaders() });
  }
}

// POST: Create a new leave type
export async function POST(req: NextRequest) {
  const db = await getDb(req);
  try {
    const auth = await getAuthInfo(req);
    if (!auth) { return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() }); }
    if (!['super_admin', 'tenant_admin', 'ceo', 'admin'].includes(auth.role)) { return NextResponse.json({ error: 'Admin only' }, { status: 403, headers: corsHeaders() }); }
    try { await db.$executeRawUnsafe(`ALTER TABLE "LeaveType" ADD COLUMN IF NOT EXISTS "calendarColor" TEXT`); await db.$executeRawUnsafe(`ALTER TABLE "LeaveType" ADD COLUMN IF NOT EXISTS "halfDayAllowed" BOOLEAN NOT NULL DEFAULT true`); await db.$executeRawUnsafe(`ALTER TABLE "LeaveType" ADD COLUMN IF NOT EXISTS "documentRequirement" TEXT NOT NULL DEFAULT 'never'`); } catch {}

    const body = await req.json();
    const { name, code, description, defaultDays, isPaid, carryForward, maxCarryForward, companyId,
            employmentType, employeeStatus, probationRestricted, sandwichRuleEnabled } = body;

    if (!name || !code) {
      return NextResponse.json({ error: 'Name and code are required' }, { status: 400, headers: corsHeaders() });
    }

    // ─── Validate name format (letters and spaces only, 2-50 chars) ───
    if (!/^[A-Za-z][A-Za-z\s'-]{1,49}$/.test(name)) {
      return NextResponse.json({ error: 'Name must be 2–50 characters and contain only letters, spaces, hyphens, or apostrophes' }, { status: 400, headers: corsHeaders() });
    }

    // ─── Validate code format (2-10 chars: uppercase letters, numbers and
    // hyphens, starting with a letter — e.g. CL, EL, LT-TNS, WL-2) ───
    // BUG FIX: previously /^[A-Z]{2,10}$/ rejected valid codes like LT-TNS.
    const upperCode = code.toUpperCase();
    if (!/^[A-Z][A-Z0-9-]{1,9}$/.test(upperCode)) {
      return NextResponse.json({ error: 'Code must be 2–10 characters, starting with a letter. Allowed: uppercase letters (A–Z), numbers (0–9) and hyphens — e.g. CL, EL, LT-TNS.' }, { status: 400, headers: corsHeaders() });
    }

    // ─── Validate defaultDays ───
    const dd = Number(defaultDays ?? 0);
    if (isNaN(dd) || dd < 0 || dd > 366) {
      return NextResponse.json({ error: 'Annual quota (defaultDays) must be a number between 0 and 366' }, { status: 400, headers: corsHeaders() });
    }

    // Resolve companyId: from body, from user's scope, or from ownCompanyId
    let resolvedCompanyId = companyId;
    if (!resolvedCompanyId) {
      const companyFilter = await getCompanyFilter(req);
      if (companyFilter && 'companyId' in companyFilter) {
        resolvedCompanyId = companyFilter.companyId as string;
      }
    }
    if (!resolvedCompanyId) {
      const scope = await resolveCompanyScope(req);
      if (scope?.ownCompanyId) {
        resolvedCompanyId = scope.ownCompanyId;
      }
    }

    if (!resolvedCompanyId) { try { const fc = await db.company.findFirst({ where: { status: 'active' }, select: { id: true }, orderBy: { createdAt: 'asc' } }); if (fc) resolvedCompanyId = fc.id; } catch {} }
    if (!resolvedCompanyId) { return NextResponse.json({ error: 'Company ID required. Ensure a company exists.' }, { status: 400, headers: corsHeaders() }); }

    // ─── Check for duplicate code within the same company ───
    const existingByCode = await db.leaveType.findFirst({
      where: { code: upperCode, companyId: resolvedCompanyId },
      select: { id: true, name: true },
    });
    if (existingByCode) {
      return NextResponse.json({ error: `A leave type with code "${upperCode}" already exists for this company ("${existingByCode.name}"). Please use a different code.` }, { status: 409, headers: corsHeaders() });
    }

    // ─── BUG FIX: codes are GLOBALLY unique (LeaveType.code @unique in the
    // schema) — a code used by ANOTHER company would previously pass the
    // per-company check and then die as a Prisma P2002 500. Fail fast with
    // a clear message instead.
    const existingByCodeOtherCompany = await db.leaveType.findFirst({
      where: { code: upperCode, NOT: { companyId: resolvedCompanyId } },
      select: { id: true, name: true },
    });
    if (existingByCodeOtherCompany) {
      return NextResponse.json({ error: `Leave type code "${upperCode}" is already used by "${existingByCodeOtherCompany.name}" (another company). Codes must be unique across all companies — please choose a different code.` }, { status: 409, headers: corsHeaders() });
    }

    // ─── Check for duplicate name within the same company ───
    const existingByName = await db.leaveType.findFirst({
      where: { name: { equals: name, mode: 'insensitive' }, companyId: resolvedCompanyId },
      select: { id: true, code: true },
    });
    if (existingByName) {
      return NextResponse.json({ error: `A leave type with name "${name}" already exists for this company` }, { status: 409, headers: corsHeaders() });
    }

    const leaveType = await db.leaveType.create({
      data: {
        name,
        code: upperCode,
        description: description || null,
        defaultDays: dd,
        isPaid: isPaid ?? true,
        carryForward: carryForward ?? false,
        maxCarryForward: maxCarryForward ?? 0,
        status: 'active',
        companyId: resolvedCompanyId,
        // Employee scope (new — rules mapped to leave types)
        employmentType: ['all', 'full-time', 'part-time', 'contract', 'internship'].includes(String(employmentType))
          ? String(employmentType) : 'all',
        employeeStatus: ['all', 'active', 'on_leave', 'inactive'].includes(String(employeeStatus))
          ? String(employeeStatus) : 'all',
        probationRestricted: probationRestricted ?? false,
        sandwichRuleEnabled: sandwichRuleEnabled ?? true,
      },
    });

    return NextResponse.json({ leaveType }, { status: 201, headers: corsHeaders() });
  } catch (error: any) {
    console.error('Leave types POST error:', error);
    // BUG FIX: unique-constraint violations now return a clear 409 instead
    // of a generic 500 "Failed to create leave type".
    if (error?.code === 'P2002') {
      return NextResponse.json({ error: 'A leave type with this code or name already exists. Codes and names must be unique — please use different values.' }, { status: 409, headers: corsHeaders() });
    }
    return NextResponse.json({ error: 'Failed to create leave type' }, { status: 500, headers: corsHeaders() });
  }
}
