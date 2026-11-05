/**
 * Gatepass API — REQ-GATE-01, REQ-GATE-02
 * + REQ-AI-ATT-04: AI auto-approval for early-departure/late-arrival within grace
 *
 * Two-tier approval: Manager (time loss) + Security (physical gate opening).
 * Visitor/contractor gatepasses have no employeeId but log visitorName/Company.
 */
import { requireUser, findEmployeeByEmail, isAdminRole, parseBody, getQuery, ok, fail, OPTIONS } from '@/lib/attendance-leave-api';
import { getDb, getPlatformDb } from '@/lib/tenant-db';
import { buildContext, evaluateGatepassAutoApproval } from '@/lib/auto-approval-engine';
import { loadWorkflowConfig, buildRequestContext, checkRules } from '@/lib/attendance-workflow';
import { sanitizeMultiLineText } from '@/lib/sanitize';

export { OPTIONS };

export async function GET(request: Request) {
  const db = await getDb(request);
  const { user, response } = await requireUser(request);
  if (!user) return response;
  try {
    const q = getQuery(request);
    const where: Record<string, unknown> = {};
    if (!isAdminRole(user.role)) {
      const emp = await findEmployeeByEmail(user.email, db);
      if (!emp) return ok({ gatepasses: [] });
      where.employeeId = emp.id;
    } else if (q.employeeId) {
      where.employeeId = q.employeeId;
    }
    if (q.status) where.status = q.status;
    if (q.type) where.type = q.type;

    const items = await db.gatepass.findMany({
      where,
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, employeeId: true } },
      },
      orderBy: { requestedAt: 'desc' },
      take: 200,
    });
    return ok({ gatepasses: items });
  } catch (e: unknown) {
    return fail(e instanceof Error ? e.message : 'Failed to load', 500);
  }
}

export async function POST(request: Request) {
  const db = await getDb(request);
  const { user, response } = await requireUser(request);
  if (!user) return response;
  const body = await parseBody(request);
  if (!body) return fail('Invalid JSON');
  try {
    const type = body.type as string;
    if (!['early_departure', 'late_arrival', 'visitor', 'contractor'].includes(type)) {
      return fail('Invalid gatepass type');
    }
    const reason = sanitizeMultiLineText(body.reason, 2000);
    if (!reason) return fail('Reason is required');

    // ─── Resolve requestedAt ───
    // Preferred: the client sends a full ISO datetime (employee page and
    // Apply-by-HR both build it from the picked local date + time).
    // Fallback: combine `date` (YYYY-MM-DD) + `outTime` (HH:mm) for callers
    // that only have separate fields.
    let requestedAt = new Date(body.requestedAt as string);
    if (isNaN(requestedAt.getTime())) {
      const d = typeof body.date === 'string' ? body.date.trim() : '';
      const t = typeof body.outTime === 'string' ? body.outTime.trim() : '';
      if (d && t) requestedAt = new Date(`${d}T${t}`);
    }
    if (isNaN(requestedAt.getTime())) return fail('Invalid requested date/time — provide requestedAt or date + outTime');

    let employeeId: string | null = null;
    let empCompanyId: string | null = null;
    if (type === 'early_departure' || type === 'late_arrival') {
      // Admins (Apply Attendance by HR) may submit on behalf of a selected
      // employee via body.employeeId. Everyone else is always themselves.
      // NOTE: findEmployeeByEmail MUST receive the tenant `db` — the legacy
      // no-db fallback resolved the employee against the platform database,
      // producing an id that violated Gatepass_employeeId_fkey on create.
      const onBehalfId = typeof body.employeeId === 'string' ? body.employeeId.trim() : '';
      if (onBehalfId && isAdminRole(user.role)) {
        const target = await db.employee.findUnique({
          where: { id: onBehalfId },
          select: { id: true, companyId: true },
        });
        if (!target) return fail('Selected employee not found', 404);
        employeeId = target.id;
        empCompanyId = target.companyId || null;
      } else {
        if (onBehalfId && !isAdminRole(user.role)) {
          return fail('You can only submit gatepass requests for yourself', 403);
        }
        const emp = await findEmployeeByEmail(user.email, db);
        if (!emp) return fail('Employee record not found', 404);
        employeeId = emp.id;
        empCompanyId = emp.companyId || null;
      }
    }

    // ─── Unified Rule Engine enforcement ─────────────────────────────
    // Honor the unified AttendanceWorkflowConfig gate-pass rules: monthly
    // cap (gatePassMaxPerMonth), geofencing/IP whitelist, QR requirement.
    // Skip for visitor/contractor passes (no employee context).
    if (employeeId) {
      try {
        const { config } = await loadWorkflowConfig(db, empCompanyId, 'GATE_PASS');
        const ctx = await buildRequestContext(db, {
          employeeId, requestType: 'GATE_PASS',
          startDate: requestedAt, endDate: requestedAt,
          gatePassType: type === 'official' ? 'official' : 'personal',
          hours: 0,
        });
        // Geofencing / IP restriction
        let geoOk: boolean | undefined;
        if (config.rules.geoFencingEnabled && config.rules.allowedIps.length > 0) {
          const fwd = request.headers.get('x-forwarded-for') || '';
          const ip = fwd.split(',')[0].trim();
          geoOk = config.rules.allowedIps.includes(ip);
        }
        const ruleCheck = checkRules(config.rules, ctx, { startDate: requestedAt, requestType: 'GATE_PASS', geoOk });
        if (!ruleCheck.ok) return fail(ruleCheck.error!, 422);
      } catch (ruleErr) {
        console.warn('[gatepass] rule engine check failed (non-fatal):', ruleErr);
      }
    }

    // REQ-AI-ATT-04: run auto-approval engine for employee gatepasses
    // Visitor/contractor gatepasses always need security review.
    let managerStatus = 'pending';
    let managerApprovedBy: string | null = null;
    let managerApprovedAt: Date | null = null;
    let autoApprovalDecision: { autoApproved: boolean; reason: string; confidence: number } | null = null;

    if (employeeId) {
      const ctx = await buildContext(employeeId);
      const minutesOffset = typeof body.minutesOffset === 'number'
        ? Number(body.minutesOffset)
        : 30; // default 30 min if not specified
      const decision = await evaluateGatepassAutoApproval(ctx, {
        type,
        minutesOffset,
        isVisitor: false,
      });
      autoApprovalDecision = decision;
      if (decision.autoApproved) {
        managerStatus = 'approved';
        managerApprovedBy = 'ai_auto';
        managerApprovedAt = new Date();
      }
    }

    const record = await db.gatepass.create({
      data: {
        employeeId,
        visitorName: (body.visitorName as string) || null,
        visitorCompany: (body.visitorCompany as string) || null,
        visitorPhone: (body.visitorPhone as string) || null,
        projectId: (body.projectId as string) || null,
        type,
        requestedAt,
        reason,
        managerStatus,
        managerApprovedBy,
        managerApprovedAt,
        status: managerStatus === 'approved' ? 'approved' : 'pending',
      },
    });
    return ok({ gatepass: record, autoApprovalDecision }, 201);
  } catch (e: unknown) {
    return fail(e instanceof Error ? e.message : 'Failed to create', 500);
  }
}
