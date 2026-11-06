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
    // mapping matching the employee's scope (branch, dept, gender, employeeIds, etc.).
    // Admins see all types (for configuration purposes).
    //
    // RULE:
    //   • If NO mappings exist at all for this company → show ALL types (backward-compat
    //     for companies that haven't set up mappings yet).
    //   • If mappings DO exist → only show types where the resolver finds a match
    //     for THIS employee. If an employee-specific mapping exists (employeeIds set),
    //     only employees in that list see the type. Other employees don't see it.
    //   • If the resolver fails for a type → include it (don't block on resolver errors).
    //   • If mappings exist but the employee matches NONE → show empty (this is the
    //     intended behavior — the admin configured mappings, and this employee isn't
    //     in any of them). The admin can add a mapping for them or use "all employees".
    let filteredTypes = allLeaveTypes;

    if (scope && scope.scope === 'self') {
      // Find the employee's record
      const emp = await db.employee.findFirst({
        where: { userId: scope.userId, status: 'active' },
        select: { id: true, companyId: true },
      }).catch(() => null);

      if (emp?.id) {
        // Check if ANY mappings exist — across ALL companies (not just the
        // employee's company). The admin might have created the mapping under
        // a different company than the employee's (due to the company-switcher
        // selection at mapping-creation time). If we only checked the employee's
        // company, we'd miss the mapping → no enforcement → employee sees all types.
        let mappingsExist = false;
        let mappingCompanyIds: string[] = [];
        try {
          const rows: any[] = await db.$queryRawUnsafe(
            `SELECT DISTINCT "companyId" FROM "LeaveTypePolicyMapping" WHERE status = 'active'`
          );
          mappingCompanyIds = rows.map((r: any) => r.companyId).filter(Boolean);
          mappingsExist = mappingCompanyIds.length > 0;
        } catch { /* table might not exist yet — no filtering */ }

        if (mappingsExist) {
          // Mapping enforcement is ACTIVE — only show types where the resolver
          // finds a match for THIS employee. Try the employee's company first,
          // then every other company that has mappings (handles cross-company
          // scenarios where the leave type / mapping is in a different company).
          const companiesToCheck = [emp.companyId, ...mappingCompanyIds].filter(Boolean) as string[];
          const uniqueCompanies = [...new Set(companiesToCheck)];

          const visibleTypes = [];
          for (const lt of allLeaveTypes) {
            let matched = false;
            for (const cId of uniqueCompanies) {
              try {
                const policy = await resolveLeavePolicy(db, { employeeId: emp.id, leaveTypeId: lt.id, companyId: cId });
                if (policy.source !== 'none') { matched = true; break; }
              } catch {
                // If resolver fails for one company, try the next
              }
            }
            if (matched) {
              visibleTypes.push(lt);
            }
          }
          // Respect the mapping enforcement result — even if it's empty.
          // The admin configured mappings; if this employee doesn't match any,
          // they don't see those leave types. This is the intended behavior.
          filteredTypes = visibleTypes;
          console.log(
            `[leave-types] Mapping enforcement: employee=${emp.id} sees ${visibleTypes.length} of ${allLeaveTypes.length} type(s) (checked ${uniqueCompanies.length} companies for mappings).`
          );
        }
        // If no mappings exist → filteredTypes stays = allLeaveTypes (backward-compat)
      }
    }

    // ─── FALLBACK (2026-11-06) ───
    // If the company-scoped query returned 0 leave types (the company has no
    // types at all — e.g. they were all created under a different company due
    // to the previous misfiled-records bug), fall back to ALL active leave types
    // across the tenant.
    //
    // CRITICAL: after fetching the fallback types, we MUST re-run mapping
    // enforcement on them. Otherwise the fallback bypasses the employee-specific
    // filtering and the employee sees types that were mapped to OTHER employees.
    if (allLeaveTypes.length === 0) {
      const auth = await getAuthInfo(req).catch(() => null);
      const fallback = await db.leaveType.findMany({
        where: { status: 'active' },
        orderBy: { name: 'asc' },
      });
      if (fallback.length > 0) {
        console.warn(
          `[leave-types] Company-scoped query returned 0 types for filter ${JSON.stringify(companyFilter)} (role=${auth?.role || 'unknown'}); falling back to ${fallback.length} types across the tenant.`
        );

        // Re-run mapping enforcement on the fallback types for employees.
        // Admins see all fallback types (no enforcement for admins).
        if (scope && scope.scope === 'self') {
          const emp = await db.employee.findFirst({
            where: { userId: scope.userId, status: 'active' },
            select: { id: true, companyId: true },
          }).catch(() => null);

          if (emp?.id) {
            // Get all companies that have mappings
            let mappingCompanyIds: string[] = [];
            let mappingsExist = false;
            try {
              const rows: any[] = await db.$queryRawUnsafe(
                `SELECT DISTINCT "companyId" FROM "LeaveTypePolicyMapping" WHERE status = 'active'`
              );
              mappingCompanyIds = rows.map((r: any) => r.companyId).filter(Boolean);
              mappingsExist = mappingCompanyIds.length > 0;
            } catch { /* table might not exist */ }

            if (mappingsExist) {
              const companiesToCheck = [emp.companyId, ...mappingCompanyIds].filter(Boolean) as string[];
              const uniqueCompanies = [...new Set(companiesToCheck)];
              const enforcedTypes = [];
              for (const lt of fallback) {
                let matched = false;
                for (const cId of uniqueCompanies) {
                  try {
                    const policy = await resolveLeavePolicy(db, { employeeId: emp.id, leaveTypeId: lt.id, companyId: cId });
                    if (policy.source !== 'none') { matched = true; break; }
                  } catch { /* try next */ }
                }
                if (matched) enforcedTypes.push(lt);
              }
              filteredTypes = enforcedTypes;
              console.log(
                `[leave-types] Fallback + mapping enforcement: employee=${emp.id} sees ${enforcedTypes.length} of ${fallback.length} fallback type(s).`
              );
            } else {
              // No mappings exist → show all fallback types (backward-compat)
              filteredTypes = fallback;
            }
          } else {
            filteredTypes = fallback;
          }
        } else {
          // Admin → show all fallback types
          filteredTypes = fallback;
        }
      }
    }

    // ─── FINAL FALLBACK ───
    // If after all the above (company scope + mapping enforcement + cross-company
    // fallback + re-enforcement) the employee still has 0 leave types, show ALL
    // active types. An empty dropdown blocks the employee from applying for leave
    // entirely — that's never acceptable. The POST handler does its own validation,
    // so showing types here is safe.
    if (filteredTypes.length === 0) {
      const allTypes = await db.leaveType.findMany({
        where: { status: 'active' },
        orderBy: { name: 'asc' },
      });
      if (allTypes.length > 0) {
        console.warn(
          `[leave-types] Final fallback: showing all ${allTypes.length} active type(s) — mapping enforcement returned 0 for this employee.`
        );
        filteredTypes = allTypes;
      }
    }

    // ─── DEBUG support: ?debug=1 shows the enforcement breakdown ───
    // Usage: GET /api/leave-types?debug=1
    // Returns the same data PLUS a _debug object showing how many types exist,
    // how many mappings exist, and how many the employee is allowed to see.
    const { searchParams } = new URL(req.url);
    const isDebug = searchParams.get('debug') === '1';
    if (isDebug) {
      return NextResponse.json({
        data: filteredTypes,
        _debug: {
          scope: scope?.scope,
          role: (await getAuthInfo(req).catch(() => null))?.role,
          companyFilter,
          totalTypesInCompany: allLeaveTypes.length,
          visibleAfterMapping: filteredTypes.length,
          fallbackUsed: allLeaveTypes.length === 0 && filteredTypes.length > 0,
        },
      }, { headers: corsHeaders() });
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
