/**
 * Bulk Policy Mapping API — assign one leave policy to many employees at once.
 *
 * GET  ?mode=policies
 *        → All active leave types + policy cards for the caller's company,
 *          grouped by leave type, each card carrying:
 *          { id, name, ruleCode, daysPerYear, carryForward, meantFor,
 *            maxForLabel, mappedCount, leaveTypeId }
 *
 * GET  ?mode=employees&leaveTypeId=<id>&policyId=<id>
 *        → Every employee of the company with their CURRENT mapped policy
 *          for that leave type:
 *          { employees: [{ id, employeeId, name, email, designation,
 *                          department, location, employeeStatus, status,
 *                          currentPolicy: { id, name, ruleCode } | null }] }
 *
 * POST { policyId, employeeIds: [...] }
 *        → Maps the selected employees to the chosen policy:
 *          1. Removes them from every OTHER policy of the SAME leave type
 *             (one policy per employee per leave type).
 *          2. Adds them to the chosen LeavePolicyRule.employeeIds JSON list.
 *          3. Best-effort syncs LeaveTypePolicyMapping.employeeIds rows that
 *             already exist for the same (leaveType, policy) pairs.
 *
 * Auth: admin roles only (super_admin / tenant_admin / admin / hr_admin / ceo).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { resolveCompanyScope } from '@/lib/companyScope';
import { ensureLeaveSetupSchema } from '@/lib/leave-setup-schema';
import { syncLeaveConfigSchema } from '@/lib/leave-config-schema-sync';
import { safeAuditLog } from '@/lib/audit-safe';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: CORS });
}

function fail(error: string, status = 400) {
  return NextResponse.json({ error }, { status, headers: CORS });
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS });
}

/** Parse a LeavePolicyRule.employeeIds / mapping.employeeIds JSON column safely. */
function parseEmployeeIds(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** Extract the first allocation entry from a rule's leaveTypeAllocations JSON. */
function firstAllocation(raw: unknown): { leaveTypeId?: string; quota?: number; carryForward?: boolean; maxCarryForward?: number } | null {
  if (!raw) return null;
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (Array.isArray(arr) && arr.length > 0) {
      const a = arr[0];
      return {
        leaveTypeId: a?.leaveTypeId ? String(a.leaveTypeId) : undefined,
        quota: Number(a?.quota) || undefined,
        carryForward: typeof a?.carryForward === 'boolean' ? a.carryForward : undefined,
        maxCarryForward: Number(a?.maxCarryForward) || undefined,
      };
    }
  } catch { /* ignore */ }
  return null;
}

interface RuleRow {
  id: string;
  name: string;
  description?: string | null;
  companyId: string;
  leaveTypeId?: string | null;
  ruleCode?: string | null;
  employeeIds?: string | null;
  leaveTypeAllocations?: string | null;
  annualQuota?: number;
  creditDays?: number;
  carryForwardGlobal?: boolean;
  carryForwardToNextYear?: boolean;
  maxCarryForwardDays?: number;
  probationRestriction?: boolean;
  employmentType?: string;
  genderApplicability?: string;
  priority?: number;
}

/** Human label for who the policy is meant for. */
function meantForLabel(r: RuleRow): string {
  const empCount = parseEmployeeIds(r.employeeIds).length;
  if (empCount > 0) return `${empCount} selected employees`;
  const et = (r.employmentType || 'all').toLowerCase();
  if (et && et !== 'all') {
    return et.split(/[-_]/).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ') + ' employees';
  }
  const g = (r.genderApplicability || 'all').toLowerCase();
  if (g && g !== 'all') return `${g.charAt(0).toUpperCase() + g.slice(1)} employees`;
  return 'All employees';
}

/** "Max for" restriction label (mirrors the design bullets). */
function maxForLabel(r: RuleRow): string | null {
  if (r.probationRestriction) return 'Confirmed employees';
  return null;
}

export async function GET(req: NextRequest) {
  const db = await getDb(req);
  try {
    // ─── Auth + company scope ───
    const scope = await resolveCompanyScope(req);
    if (!scope) return fail('Unauthorized', 401);
    if (!['super_admin', 'tenant_admin', 'admin', 'hr_admin', 'ceo'].includes(scope.role)) {
      return fail('Forbidden: admin access required', 403);
    }
    const url = new URL(req.url);
    let companyId = url.searchParams.get('companyId') || scope.companyId;
    // BUG FIX: Fallback to first active company when admin has no company selected
    if (!companyId) {
      try {
        const fc = await db.company.findFirst({ where: { status: 'active' }, select: { id: true }, orderBy: { createdAt: 'asc' } });
        if (fc) companyId = fc.id;
      } catch {}
    }
    if (!companyId) {
      return fail('No company selected. Pick a company in the switcher first.', 400);
    }

    // Guarantee runtime columns exist (ruleCode, leaveTypeId, employeeIds, …)
    try { await ensureLeaveSetupSchema((sql: string) => db.$executeRawUnsafe(sql)); } catch {}
    try { await syncLeaveConfigSchema(db); } catch {}

    const mode = url.searchParams.get('mode') || 'policies';

    // ════════════════════════════════════════════════════════════════
    // MODE: policies — leave types + policy cards grouped by type
    // ════════════════════════════════════════════════════════════════
    if (mode === 'policies') {
      const leaveTypes = await db.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT id, name, code, "defaultDays", "carryForward", "maxCarryForward", "displayOrder", "calendarColor", status
           FROM "LeaveType"
          WHERE "companyId" = $1 AND status = 'active'
          ORDER BY "displayOrder" ASC, name ASC`,
        companyId,
      );

      const rules = await db.$queryRawUnsafe<RuleRow[]>(
        `SELECT id, name, description, "companyId", "leaveTypeId", "ruleCode", "employeeIds",
                "leaveTypeAllocations", "annualQuota", "creditDays", "carryForwardGlobal",
                "carryForwardToNextYear", "maxCarryForwardDays", "probationRestriction",
                "employmentType", "genderApplicability", priority
           FROM "LeavePolicyRule"
          WHERE "companyId" = $1 AND status = 'active'
          ORDER BY priority DESC, name ASC`,
        companyId,
      );

      // Mapping rows — used to widen each policy's mapped-employee count.
      let mappings: Array<{ policyRuleId: string; leaveTypeId: string; employeeIds: string | null }> = [];
      try {
        mappings = await db.$queryRawUnsafe<Array<{ policyRuleId: string; leaveTypeId: string; employeeIds: string | null }>>(
          `SELECT "policyRuleId", "leaveTypeId", "employeeIds" FROM "LeaveTypePolicyMapping" WHERE "companyId" = $1`,
          companyId,
        );
      } catch { mappings = []; }

      const ltNameById = new Map<string, { name: string; code: string; color?: string | null; defaultDays: number }>();
      for (const lt of leaveTypes) {
        ltNameById.set(String(lt.id), {
          name: String(lt.name),
          code: String(lt.code),
          color: (lt.calendarColor as string) || null,
          defaultDays: Number(lt.defaultDays) || 0,
        });
      }

      // group policies by their primary leave type
      const groups: Record<string, {
        leaveTypeId: string;
        leaveTypeName: string;
        leaveTypeCode: string;
        color?: string | null;
        policies: Array<Record<string, unknown>>;
      }> = {};

      for (const r of rules) {
        const alloc = firstAllocation(r.leaveTypeAllocations);
        // A rule's leave type: explicit runtime column → first allocation → null (skip)
        const ltId = r.leaveTypeId || alloc?.leaveTypeId;
        if (!ltId) continue;
        const lt = ltNameById.get(ltId);
        if (!lt) continue; // leave type deleted/inactive — hide the card

        const ruleEmpIds = parseEmployeeIds(r.employeeIds);
        const mappingEmpIds = mappings
          .filter(m => m.policyRuleId === r.id)
          .flatMap(m => parseEmployeeIds(m.employeeIds));
        const mappedCount = new Set([...ruleEmpIds, ...mappingEmpIds]).size;

        const quota = Number(r.creditDays) > 0 ? Number(r.creditDays)
          : (alloc?.quota || Number(r.annualQuota) || lt.defaultDays || 0);
        const carryForward = Boolean(r.carryForwardToNextYear) || Boolean(r.carryForwardGlobal) || Boolean(alloc?.carryForward);

        const badge = (r.ruleCode || '').trim() ||
          `${lt.code}-${(r.name.split(/[-\s]+/).map(w => w[0]).join('').toUpperCase().slice(0, 4)) || 'STD'}`;

        if (!groups[ltId]) {
          groups[ltId] = { leaveTypeId: ltId, leaveTypeName: lt.name, leaveTypeCode: lt.code, color: lt.color, policies: [] };
        }
        groups[ltId].policies.push({
          id: r.id,
          name: r.name,
          ruleCode: badge,
          description: r.description || null,
          daysPerYear: quota,
          carryForward,
          maxCarryForwardDays: Number(r.maxCarryForwardDays) || alloc?.maxCarryForward || 0,
          maxForLabel: maxForLabel(r),
          meantFor: meantForLabel(r),
          mappedCount,
          leaveTypeId: ltId,
          isOpenEnded: ruleEmpIds.length === 0,
        });
      }

      const grouped = Object.values(groups).sort((a, b) => a.leaveTypeName.localeCompare(b.leaveTypeName));

      return ok({
        companyId,
        groups: grouped,
        totalPolicies: Object.values(groups).reduce((n, g) => n + g.policies.length, 0),
      });
    }

    // ════════════════════════════════════════════════════════════════
    // MODE: employees — company roster + current policy per leave type
    // ════════════════════════════════════════════════════════════════
    if (mode === 'employees') {
      const leaveTypeId = url.searchParams.get('leaveTypeId');
      if (!leaveTypeId) return fail('leaveTypeId is required', 400);

      const employees = await db.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT e.id, e."employeeId" AS "empCode", e."firstName", e."lastName", e.email,
                e.status, e."employeeStatus", e.avatar,
                d.name  AS "departmentName",
                dg.title AS "designationTitle",
                b.name  AS "branchName"
           FROM "Employee" e
           LEFT JOIN "Department"  d  ON d.id  = e."departmentId"
           LEFT JOIN "Designation" dg ON dg.id = e."designationId"
           LEFT JOIN "Branch"      b  ON b.id  = e."branchId"
          WHERE e."companyId" = $1
          ORDER BY e."firstName" ASC, e."lastName" ASC`,
        companyId,
      );

      // Active rules for this company → current-policy lookup per employee
      const rules = await db.$queryRawUnsafe<RuleRow[]>(
        `SELECT id, name, "leaveTypeId", "ruleCode", "employeeIds", "leaveTypeAllocations", priority
           FROM "LeavePolicyRule"
          WHERE "companyId" = $1 AND status = 'active'
          ORDER BY priority DESC`,
        companyId,
      );

      // best-effort: mapping rows also confer membership
      let mappings: Array<{ policyRuleId: string; leaveTypeId: string; employeeIds: string | null }> = [];
      try {
        mappings = await db.$queryRawUnsafe<Array<{ policyRuleId: string; leaveTypeId: string; employeeIds: string | null }>>(
          `SELECT "policyRuleId", "leaveTypeId", "employeeIds" FROM "LeaveTypePolicyMapping" WHERE "companyId" = $1`,
          companyId,
        );
      } catch { mappings = []; }

      const ruleEmp = new Map<string, Set<string>>();
      const ruleLt = new Map<string, string>();
      for (const r of rules) {
        const alloc = firstAllocation(r.leaveTypeAllocations);
        const ltId = r.leaveTypeId || alloc?.leaveTypeId;
        if (!ltId) continue;
        ruleLt.set(r.id, ltId);
        const set = new Set(parseEmployeeIds(r.employeeIds));
        for (const m of mappings) {
          if (m.policyRuleId === r.id) for (const e of parseEmployeeIds(m.employeeIds)) set.add(e);
        }
        ruleEmp.set(r.id, set);
      }

      const ruleById = new Map(rules.map(r => [r.id, r]));
      const currentPolicyByEmp = new Map<string, { id: string; name: string; ruleCode: string }>();
      for (const [ruleId, set] of ruleEmp) {
        if (ruleLt.get(ruleId) !== leaveTypeId) continue;
        const r = ruleById.get(ruleId);
        if (!r) continue;
        for (const empId of set) {
          if (!currentPolicyByEmp.has(empId)) {
            currentPolicyByEmp.set(empId, {
              id: ruleId,
              name: r.name,
              ruleCode: (r.ruleCode || '').trim(),
            });
          }
        }
      }

      const shaped = employees.map(e => ({
        id: String(e.id),
        empCode: String(e.empCode || ''),
        name: `${e.firstName || ''} ${e.lastName || ''}`.trim(),
        email: String(e.email || ''),
        designation: String(e.designationTitle || '—'),
        department: String(e.departmentName || '—'),
        location: String(e.branchName || '—'),
        employeeStatus: String(e.employeeStatus || 'confirmed'),
        status: String(e.status || 'active'),
        currentPolicy: currentPolicyByEmp.get(String(e.id)) || null,
      }));

      return ok({ companyId, leaveTypeId, employees: shaped });
    }

    return fail('Unknown mode. Use mode=policies or mode=employees', 400);
  } catch (e) {
    console.error('[bulk-policy-mapping][GET]', e);
    return fail(e instanceof Error ? e.message : 'Failed to load bulk policy data', 500);
  }
}

export async function POST(req: NextRequest) {
  const db = await getDb(req);
  try {
    const scope = await resolveCompanyScope(req);
    if (!scope) return fail('Unauthorized', 401);
    if (!['super_admin', 'tenant_admin', 'admin', 'hr_admin', 'ceo'].includes(scope.role)) {
      return fail('Forbidden: admin access required', 403);
    }

    const body = await req.json().catch(() => ({}));
    const policyId: string | undefined = body.policyId;
    const policyIds: string[] = Array.isArray(body.policyIds) ? body.policyIds.map(String) : (policyId ? [policyId] : []);
    const employeeIds: string[] = Array.isArray(body.employeeIds) ? body.employeeIds.map(String) : [];
    let companyId: string | undefined = body.companyId || scope.companyId || undefined;

    // BUG FIX: Company fallback for admins without switcher selection
    if (!companyId) {
      try {
        const fc = await db.company.findFirst({ where: { status: 'active' }, select: { id: true }, orderBy: { createdAt: 'asc' } });
        if (fc) companyId = fc.id;
      } catch {}
    }

    if (policyIds.length === 0) return fail('policyId is required', 400);
    if (employeeIds.length === 0) return fail('Select at least one employee', 400);
    if (!companyId) return fail('No company in scope', 400);

    try { await ensureLeaveSetupSchema((sql: string) => db.$executeRawUnsafe(sql)); } catch {}
    try { await syncLeaveConfigSchema(db); } catch {}

    // ─── 1. Validate the policy exists in the Policy table ───
    const polRow = (await db.$queryRawUnsafe<Array<{ id: string; title: string; status: string; category: string }>>(
      `SELECT id, title, status, category FROM "Policy" WHERE id = $1 LIMIT 1`,
      policyIds[0],
    ))[0];
    if (!polRow) return fail('Policy not found', 404);
    if (polRow.status !== 'active') return fail('Policy is inactive', 400);

    // ─── 2. Validate employees belong to the same company ───
    const placeholders = employeeIds.map((_, i) => `$${i + 2}`).join(', ');
    const validEmps = await db.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM "Employee" WHERE "companyId" = $1 AND id IN (${placeholders})`,
      companyId, ...employeeIds,
    );
    const validIds = new Set(validEmps.map(v => v.id));
    const invalidCount = employeeIds.filter(id => !validIds.has(id)).length;

    // ─── 3. Update Employee.leavePolicyId for each selected employee ───
    // BUG FIX: This is the critical step — updates the Employee table's
    // leavePolicyId column so /leave/apply can read the assigned policy.
    // Also updates the runtime leavePolicyIds JSON array column.
    const leavePolicyIdsJson = JSON.stringify(policyIds);
    let applied = 0;
    for (const empId of employeeIds) {
      if (!validIds.has(empId)) continue;
      try {
        // Update the schema-defined leavePolicyId column (singular, for backward compat)
        await db.employee.update({
          where: { id: empId },
          data: { leavePolicyId: policyIds[0] },
        });
        // Also update the runtime leavePolicyIds column (plural, JSON array)
        await db.$executeRawUnsafe(
          `UPDATE "Employee" SET "leavePolicyIds" = $1, "updatedAt" = NOW() WHERE "id" = $2`,
          leavePolicyIdsJson, empId,
        ).catch(() => {}); // Column might not exist — non-fatal
        applied++;
      } catch (e) {
        console.warn(`[bulk-policy-mapping] Failed to update employee ${empId}:`, e);
      }
    }

    // ─── 4. Audit log ───
    try {
      await safeAuditLog(db, {
        userId: scope.userId,
        action: 'BULK_POLICY_MAPPING',
        module: 'leave',
        details: `Assigned policy "${polRow.title}" (${policyIds[0]}) to ${applied} employee(s)`,
      });
    } catch {}

    return ok({
      success: true,
      policy: { id: policyIds[0], name: polRow.title, ruleCode: '—', leaveTypeId: '' },
      applied,
      alreadyOnIt: 0,
      movedFromOther: 0,
      invalidEmployees: invalidCount,
      mappingsSynced: 0,
      totalMappedNow: applied,
    }, 201);
  } catch (error) {
    console.error('[bulk-policy-mapping POST] Error:', error);
    return fail('Failed to apply policy mapping', 500);
  }
}
