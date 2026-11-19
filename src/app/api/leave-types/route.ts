import { NextRequest, NextResponse } from 'next/server';
import { getDb, getPlatformDb } from '@/lib/tenant-db';
import { getCompanyFilter, getAuthInfo, resolveCompanyScope } from '@/lib/companyScope';
import { resolveLeavePolicy } from '@/lib/leave-policy-resolver';
import { validateCompanyOwnership } from '@/lib/company-ownership';
import { getLeaveCategory } from '@/lib/leave-balance-rules';
import { ensureLeaveSetupSchema } from '@/lib/leave-setup-schema';

// BUG-LM-001/002/003 FIX: Employee ↔ Mapping scope matcher.
// Checks if an employee matches a LeaveTypePolicyMapping's scope fields.
// The mapping inherits scope from both itself and its linked rule.
// Returns true only if ALL applicable filters pass.
function employeeMatchesMapping(emp: any, mapping: any): boolean {
  if (!emp) return false;

  // employmentType: 'all' matches; otherwise must equal employee's type (normalized)
  const et = mapping.employmentType || 'all';
  if (et !== 'all') {
    const normalized = et.replace(/-/g, '_');
    if (emp.employmentType && emp.employmentType !== normalized && emp.employmentType !== et) {
      return false;
    }
  }

  // branchId: null = all branches; otherwise must match
  if (mapping.branchId && emp.branchId !== mapping.branchId) return false;

  // departmentId: null = all departments; otherwise must match
  if (mapping.departmentId && emp.departmentId !== mapping.departmentId) return false;

  // genderApplicability: check both the mapping's and the rule's field.
  // 'all' or 'both' matches everyone; otherwise must match employee gender.
  const gender = mapping.genderApplicability || mapping.ruleGenderApplicability || mapping.ruleGender || 'all';
  if (gender && gender !== 'all' && gender !== 'both') {
    if (emp.gender && emp.gender.toLowerCase() !== gender.toLowerCase()) return false;
  }

  // employeeIds: JSON array — if set, employee must be in the list
  if (mapping.employeeIds) {
    try {
      const ids: string[] = JSON.parse(mapping.employeeIds);
      if (Array.isArray(ids) && ids.length > 0 && !ids.includes(emp.id)) return false;
    } catch { /* ignore malformed */ }
  }

  // empStatusJson: from the linked rule — JSON array of allowed employee statuses.
  // If set, employee's status must be in the list.
  if (mapping.empStatusJson) {
    try {
      const statuses: string[] = JSON.parse(mapping.empStatusJson);
      if (Array.isArray(statuses) && statuses.length > 0) {
        const lower = statuses.map(s => s.toLowerCase());
        if (!lower.includes('all')) {
          const empStatus = (emp.employeeStatus || '').toLowerCase();
          if (empStatus && !lower.includes(empStatus)) return false;
        }
      }
    } catch { /* ignore malformed */ }
  }

  return true; // All checks passed
}

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
    // Ensure the Leave Setup columns (category, smallestUnit, displayOrder, …)
    // exist before Prisma selects them — tenant DBs may not be migrated yet.
    try { await ensureLeaveSetupSchema((sql: string) => db.$executeRawUnsafe(sql)); } catch {}
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

    // BUG_219 FIX: support includeInactive=1 for admin setup pages (show active + inactive types)
    const { searchParams } = new URL(req.url);
    const includeInactive = searchParams.get('includeInactive') === '1';
    const statusFilter = includeInactive ? {} : { status: 'active' as const };

    const allLeaveTypes = await db.leaveType.findMany({
      where: { ...statusFilter, ...companyFilter },
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
          // BUG-LM-001/002/003 FIX: The mapping is the SOLE gatekeeper.
          // Previously we called resolveLeavePolicy() which has a fallback to
          // LeavePolicyRule rows — that meant unmapped leave types still showed
          // if they had a rule. Now we check the mapping table directly:
          // a leave type is visible ONLY if an ACTIVE LeaveTypePolicyMapping
          // exists for (this leaveType + this company) AND the employee matches
          // the mapping's scope (employmentType, gender, branch, dept, employeeIds).
          const companiesToCheck = [emp.companyId, ...mappingCompanyIds].filter(Boolean) as string[];
          const uniqueCompanies = [...new Set(companiesToCheck)];

          // Fetch the employee's full profile for scope matching
          const empFull = await db.employee.findFirst({
            where: { userId: scope.userId, status: 'active' },
            select: { id: true, companyId: true, employmentType: true, branchId: true, departmentId: true, gender: true, employeeStatus: true },
          }).catch(() => emp);

          // Get ALL active mappings across the companies we're checking,
          // joined with the rule's eligibility fields for matching.
          let allMappings: any[] = [];
          try {
            allMappings = await db.$queryRawUnsafe(`
              SELECT m.*, r."empStatusJson", r."gender" as "ruleGender", r."genderApplicability" as "ruleGenderApplicability"
              FROM "LeaveTypePolicyMapping" m
              LEFT JOIN "LeavePolicyRule" r ON r.id = m."policyRuleId"
              WHERE m.status = 'active'
                AND m."companyId" = ANY($1::text[])
            `, uniqueCompanies);
          } catch (e) {
            console.warn('[leave-types] Failed to fetch mappings for enforcement:', e);
          }

          // Group mappings by leaveTypeId for fast lookup
          const mappingsByLeaveType = new Map<string, any[]>();
          for (const m of allMappings) {
            const arr = mappingsByLeaveType.get(m.leaveTypeId) || [];
            arr.push(m);
            mappingsByLeaveType.set(m.leaveTypeId, arr);
          }

          // For each leave type, check if ANY mapping matches this employee
          const visibleTypes = [];
          for (const lt of allLeaveTypes) {
            const ltMappings = mappingsByLeaveType.get(lt.id);
            if (!ltMappings || ltMappings.length === 0) {
              // No mapping for this leave type → HIDDEN (mapping is the gatekeeper)
              continue;
            }
            // Check if the employee matches at least one mapping's scope
            let matched = false;
            for (const m of ltMappings) {
              if (employeeMatchesMapping(empFull, m)) { matched = true; break; }
            }
            if (matched) { visibleTypes.push(lt); }
          }
          filteredTypes = visibleTypes;
          console.log(
            `[leave-types] Mapping enforcement: employee=${emp.id} sees ${visibleTypes.length} of ${allLeaveTypes.length} type(s) (${allMappings.length} mappings across ${uniqueCompanies.length} companies).`
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
              // BUG-LM-001/002/003 FIX: Same direct-mapping check as above.
              const companiesToCheck = [emp.companyId, ...mappingCompanyIds].filter(Boolean) as string[];
              const uniqueCompanies = [...new Set(companiesToCheck)];

              const empFull = await db.employee.findFirst({
                where: { userId: scope.userId, status: 'active' },
                select: { id: true, companyId: true, employmentType: true, branchId: true, departmentId: true, gender: true, employeeStatus: true },
              }).catch(() => emp);

              let allMappings: any[] = [];
              try {
                allMappings = await db.$queryRawUnsafe(`
                  SELECT m.*, r."empStatusJson", r."gender" as "ruleGender", r."genderApplicability" as "ruleGenderApplicability"
                  FROM "LeaveTypePolicyMapping" m
                  LEFT JOIN "LeavePolicyRule" r ON r.id = m."policyRuleId"
                  WHERE m.status = 'active'
                    AND m."companyId" = ANY($1::text[])
                `, uniqueCompanies);
              } catch {}

              const mappingsByLeaveType = new Map<string, any[]>();
              for (const m of allMappings) {
                const arr = mappingsByLeaveType.get(m.leaveTypeId) || [];
                arr.push(m);
                mappingsByLeaveType.set(m.leaveTypeId, arr);
              }

              const enforcedTypes = [];
              for (const lt of fallback) {
                const ltMappings = mappingsByLeaveType.get(lt.id);
                if (!ltMappings || ltMappings.length === 0) continue; // No mapping → hidden
                for (const m of ltMappings) {
                  if (employeeMatchesMapping(empFull, m)) { enforcedTypes.push(lt); break; }
                }
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

    // ─── GENDER-BASED FILTERING ───
    // BUG FIX: maternity leave should only show for female employees, paternity
    // only for male. Filter out gender-incompatible leave types from the final list.
    // This runs AFTER all other filtering so it always applies.
    if (scope && scope.scope === 'self') {
      const emp = await db.employee.findFirst({
        where: { userId: scope.userId, status: 'active' },
        select: { gender: true },
      }).catch(() => null);

      if (emp) {
        const empGender = (emp.gender || '').toLowerCase();
        const beforeGenderFilter = filteredTypes.length;
        filteredTypes = filteredTypes.filter((lt: any) => {
          const category = getLeaveCategory({ name: lt.name, code: lt.code });
          if (category === 'maternity') return empGender === 'female';
          if (category === 'paternity') return empGender === 'male';
          if (category === 'parental') {
            // Parental is gender-neutral — keep it (the resolver renames it)
            return true;
          }
          return true; // non-gendered types always visible
        });
        if (filteredTypes.length < beforeGenderFilter) {
          console.log(
            `[leave-types] Gender filter: removed ${beforeGenderFilter - filteredTypes.length} type(s) for employee gender='${empGender || 'unknown'}'.`
          );
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
    // ─── FINAL MAPPING ENFORCEMENT (simple + robust) ───
    // For employees only: query LeaveTypePolicyMapping directly to check if
    // each leave type has at least one active mapping that matches the employee.
    // This runs AFTER all existing logic as a safety net — if the resolver-based
    // filtering above missed anything, this catches it.
    if (scope && scope.scope === 'self' && filteredTypes.length > 0) {
      try {
        // Re-fetch employee if not already available
        let empId = '';
        let empGender = '';
        let empEmpType = '';
        let empBranchId: string | null = null;
        let empDeptId: string | null = null;
        const emp = await db.employee.findFirst({
          where: { userId: scope.userId },
          select: { id: true, gender: true, employeeType: true, branchId: true, departmentId: true },
        }).catch(() => null);
        if (emp) {
          empId = emp.id;
          empGender = (emp.gender || '').toLowerCase();
          empEmpType = (emp.employeeType || '').toLowerCase().replace('_', '-');
          empBranchId = emp.branchId || null;
          empDeptId = emp.departmentId || null;
        }

        if (empId) {
          // Query all active mappings for these leave types (across ALL companies)
          const ltIds = filteredTypes.map((t: any) => t.id);
          if (ltIds.length > 0) {
            const placeholders = ltIds.map((_: any, i: number) => `$${i + 1}`).join(',');
            const mappingRows: any[] = await db.$queryRawUnsafe(
              `SELECT "leaveTypeId", "employmentType", "genderApplicability", "branchId", "departmentId", "employeeIds"
               FROM "LeaveTypePolicyMapping"
               WHERE "leaveTypeId" IN (${placeholders})
                 AND status = 'active'`,
              ...ltIds
            );

            // Check if ANY mappings exist at all
            if (mappingRows.length > 0) {
              // Group mappings by leaveTypeId
              const mappingsByLt = new Map<string, any[]>();
              for (const m of mappingRows) {
                const arr = mappingsByLt.get(m.leaveTypeId) || [];
                arr.push(m);
                mappingsByLt.set(m.leaveTypeId, arr);
              }

              // Filter: only keep leave types where at least one mapping matches the employee
              const enforcedTypes = filteredTypes.filter((lt: any) => {
                const ltMappings = mappingsByLt.get(lt.id) || [];
                if (ltMappings.length === 0) return false; // no mappings → hidden

                // Check if any mapping matches the employee's scope
                return ltMappings.some((m: any) => {
                  // Employment type check
                  const mEmpType = (m.employmentType || 'all').toLowerCase();
                  if (mEmpType !== 'all') {
                    const rt = mEmpType.replace('_', '-');
                    if (rt === 'full-time' && empEmpType !== 'full-time') return false;
                    if (rt === 'part-time' && empEmpType !== 'part-time') return false;
                    if (rt === 'contract' && empEmpType !== 'contract') return false;
                    if (rt === 'internship' && empEmpType !== 'internship' && empEmpType !== 'intern') return false;
                    if (rt !== empEmpType) return false;
                  }
                  // Gender check
                  const mGender = (m.genderApplicability || 'all').toLowerCase();
                  if (mGender !== 'all' && mGender !== 'both') {
                    if (empGender === 'male' && mGender !== 'male' && mGender !== 'm') return false;
                    if (empGender === 'female' && mGender !== 'female' && mGender !== 'f') return false;
                    if (empGender === 'other' && mGender !== 'other' && mGender !== 'o') return false;
                    if (!empGender) return false;
                  }
                  // Branch check
                  if (m.branchId && m.branchId !== empBranchId) return false;
                  // Department check
                  if (m.departmentId && m.departmentId !== empDeptId) return false;
                  // Employee IDs check — if set, employee must be in the list
                  if (m.employeeIds) {
                    try {
                      const ids = JSON.parse(m.employeeIds);
                      if (Array.isArray(ids) && ids.length > 0 && !ids.includes(empId)) return false;
                    } catch {}
                  }
                  return true; // all checks passed
                });
              });

              console.log(
                `[leave-types] FINAL mapping enforcement: employee=${empId} sees ${enforcedTypes.length} of ${filteredTypes.length} type(s) (based on ${mappingRows.length} active mappings).`
              );
              filteredTypes = enforcedTypes;
            }
            // If NO mappings exist at all → don't filter (backward compat)
          }
        }
      } catch (finalFilterErr) {
        console.warn('[leave-types] FINAL mapping enforcement failed (non-fatal):', finalFilterErr);
      }
    }

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
    if (!['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_admin'].includes(auth.role)) { return NextResponse.json({ error: 'Admin only' }, { status: 403, headers: corsHeaders() }); }
    try { await ensureLeaveSetupSchema((sql: string) => db.$executeRawUnsafe(sql)); } catch {}

    const body = await req.json();
    const { name, code, description, defaultDays, isPaid, carryForward, maxCarryForward, companyId,
            employmentType, employeeStatus, probationRestricted, sandwichRuleEnabled,
            category, smallestUnit, calendarColor, displayOrder } = body;

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

    // ─── COMPANY OWNERSHIP VALIDATION ───
    // Verify the authenticated admin can manage this company (prevents
    // cross-tenant data leakage via direct API requests with a foreign companyId).
    const ownership = await validateCompanyOwnership(req, resolvedCompanyId);
    if (!ownership.ok) {
      return NextResponse.json({ error: ownership.error || 'Access denied' }, { status: 403, headers: corsHeaders() });
    }

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
        // ─── Leave Setup wizard fields ───
        category: ['paid', 'unpaid', 'statutory', 'special'].includes(String(category || '').toLowerCase())
          ? String(category).toLowerCase() : 'paid',
        smallestUnit: ['full_day', 'half_day', 'hourly'].includes(String(smallestUnit || '').toLowerCase())
          ? String(smallestUnit).toLowerCase() : 'full_day',
        calendarColor: (typeof calendarColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(calendarColor))
          ? calendarColor : null,
        displayOrder: Number.isFinite(Number(displayOrder))
          ? Math.max(0, Math.trunc(Number(displayOrder))) : 0,
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
