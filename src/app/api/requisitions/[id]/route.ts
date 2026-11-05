import { NextResponse } from 'next/server';
import { getDb, getPlatformDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { createNotification, sendNotificationEmail } from '@/lib/notifications';
import { resolveRequisitionConfig, RequisitionWorkflowConfig, RequisitionApprovalTier } from '@/lib/recruitment-workflow';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

// Task 164 (legacy): roles that could approve at each tier under the
// previous hardcoded flow. Kept as a fallback only — C-32 prefers the
// configured RequisitionWorkflowConfig from the tenant's workflow-config
// table. The DEFAULT_REQUISITION_CONFIG mirrors these exactly:
//   tier 1 = HR_ROLES, tier 2 = FINANCE_ROLES
const HR_ROLES = ['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_admin', 'company_hr_admin'];
const FINANCE_ROLES = ['super_admin', 'tenant_admin', 'ceo', 'admin', 'finance_admin'];

// C-32: legacy approvalStatus values map to a "tier index" that the
// configured chain works against. The mapping is:
//   'draft'      → 0  (no tier — pre-submission)
//   'pending'    → 0  (waiting on Tier 1)
//   'hr_approved' → 1  (Tier 1 done, waiting on Tier 2) — LEGACY 2-tier only
//   'tier_2_approved' → 2  (Tier 2 done, waiting on Tier 3) — for >2 tiers
//   'tier_3_approved' → 3  (Tier 3 done, waiting on Tier 4) — for >3 tiers
//   'budget_approved' → final (all tiers done — ready for job posting)
//   'rejected' / 'returned' → terminal
//
// For backwards compat with existing rows in 'hr_approved' state under
// a still-2-tier config, we map 'hr_approved' to tier-index 1 (Tier 1
// done, Tier 2 next). If the config has only 1 tier (HR only), we
// promote 'hr_approved' to 'budget_approved' on first contact.
const STATUS_TO_TIER_INDEX: Record<string, number> = {
  pending: 0,
  hr_approved: 1,
  tier_2_approved: 2,
  tier_3_approved: 3,
  tier_4_approved: 4,
  tier_5_approved: 5,
  tier_6_approved: 6,
  tier_7_approved: 7,
  tier_8_approved: 8,
  tier_9_approved: 9,
};

function tierIndexToStatus(tierDone: number, totalTiers: number): string {
  // tierDone = how many tiers have approved (1-based count)
  // totalTiers = total tiers in chain
  if (tierDone >= totalTiers) return 'budget_approved';
  // Legacy 2-tier: Tier 1 done = 'hr_approved'
  if (totalTiers === 2 && tierDone === 1) return 'hr_approved';
  // Multi-tier (>=3): use 'tier_<n>_approved' for intermediate tiers
  if (tierDone === 1) return 'hr_approved'; // first intermediate always 'hr_approved' for legacy compat
  return `tier_${tierDone}_approved`;
}

// Resolve which roles can approve at a given tier in the configured chain.
// Returns a list of role strings; if the list includes 'specific_user',
// the caller must also check approverUserId match.
function rolesForTier(tier: RequisitionApprovalTier): { roles: string[]; specificUserId: string | null } {
  switch (tier.approverType) {
    case 'hr_admin':
      return { roles: HR_ROLES, specificUserId: null };
    case 'finance':
      return { roles: FINANCE_ROLES, specificUserId: null };
    case 'tenant_admin':
      return { roles: ['super_admin', 'tenant_admin'], specificUserId: null };
    case 'ceo':
      return { roles: ['super_admin', 'ceo'], specificUserId: null };
    case 'department_head':
      // Any role that can be a department head — for simplicity, treat
      // 'admin' and 'hr_admin' and 'tenant_admin' as eligible. In future,
      // we can resolve the actual department head from Department.headId.
      return { roles: ['super_admin', 'tenant_admin', 'admin', 'hr_admin'], specificUserId: null };
    case 'reporting_manager':
      // Handled by the caller — they must compare decoded.userId against
      // the requisition's hiringManagerId OR the requester's manager.
      // Returning an empty role list here forces the caller to check
      // identity instead of role.
      return { roles: [], specificUserId: null };
    case 'specific_user':
      return { roles: [], specificUserId: tier.approverUserId || null };
    default:
      return { roles: [], specificUserId: null };
  }
}

// Check whether the current user can approve at the given tier.
function canApproveAtTier(
  tier: RequisitionApprovalTier,
  userRole: string,
  userId: string,
  requisitionHiringManagerId: string | null,
): boolean {
  // reporting_manager: the requisition's hiringManager is the "reporting
  // manager" of the requester — but the requester themselves can't approve
  // their own request. So the current user must be the hiringManager.
  if (tier.approverType === 'reporting_manager') {
    return !!requisitionHiringManagerId && requisitionHiringManagerId === userId;
  }
  const { roles, specificUserId } = rolesForTier(tier);
  if (tier.approverType === 'specific_user') {
    return !!specificUserId && specificUserId === userId;
  }
  return roles.includes(userRole);
}

// Parse a salary budget string like "500000-700000 INR/year" or "100000"
// into a numeric lower-bound value (the lower of the range, or the single
// number). Returns null if it can't parse a meaningful number.
function parseSalaryBudget(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw !== 'string') return null;
  // Find the first number in the string (handles "500000-700000", "₹5,00,000", "100000 INR")
  const m = raw.match(/(\d[\d,]*\.?\d*)/);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });

    const { id } = await params;

    const requisition = await db.requisition.findUnique({
      where: { id },
      include: {
        department: { select: { id: true, name: true, code: true } },
        designation: { select: { id: true, title: true, level: true } },
        company: { select: { id: true, name: true } },
      },
    }).catch(async () => {
      // RAW SQL fallback
      const rows = await db.$queryRawUnsafe(
        `SELECT r.*, d."name" AS "deptName", des."title" AS "desgTitle"
         FROM "Requisition" r
         LEFT JOIN "Department" d ON d."id" = r."departmentId"
         LEFT JOIN "Designation" des ON des."id" = r."designationId"
         WHERE r."id" = $1 LIMIT 1`,
        id,
      ) as any[];
      return rows[0] || null;
    });

    if (!requisition) {
      return NextResponse.json({ error: 'Requisition not found' }, { status: 404, headers: corsHeaders() });
    }

    // Task 164: also fetch approval history from AuditLog
    let approvalHistory: any[] = [];
    try {
      approvalHistory = await db.auditLog.findMany({
        where: { module: 'requisitions', details: { contains: requisition.requisitionId || '' } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }) as any[];
    } catch {}

    return NextResponse.json({ requisition, approvalHistory }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Get requisition error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });

    const { id } = await params;
    const body = await request.json();
    const { action, comments, departmentId, designationId, positionType, numberOfOpenings,
            employmentType, skillsRequired, experienceRequired, qualification,
            salaryBudget, priority, expectedJoiningDate, reason } = body;

    // Task 164: fetch existing via RAW SQL fallback
    const existing = await db.requisition.findUnique({ where: { id } }).catch(async () => {
      const rows = await db.$queryRawUnsafe(`SELECT * FROM "Requisition" WHERE "id" = $1 LIMIT 1`, id) as any[];
      return rows[0] || null;
    });
    if (!existing) {
      return NextResponse.json({ error: 'Requisition not found' }, { status: 404, headers: corsHeaders() });
    }

    const userRole = (decoded.role as string) || '';
    const isHr = HR_ROLES.includes(userRole);
    // C-32: isFinance was previously used to gate 'finance_approve' and
    // 'finance_reject' actions. With the new tier-driven flow, the
    // tier's approverType decides who can approve — so the global
    // isFinance flag is no longer needed. FINANCE_ROLES is still kept
    // (above) because rolesForTier() uses it internally.
    const isRequester = existing.hiringManagerId === decoded.userId;

    // C-32: resolve the tenant's configured requisition approval workflow.
    // Falls back to DEFAULT_REQUISITION_CONFIG (the original hardcoded
    // HR → Finance flow) if no config is saved for the tenant. The chain
    // drives who can approve at which tier, how many tiers there are, and
    // whether to skip the Finance tier for low-budget requisitions.
    const reqWfConfig: RequisitionWorkflowConfig = await resolveRequisitionConfig(
      db,
      decoded.tenantId as string | undefined,
      existing.companyId || undefined,
    ).catch(() => ({
      // Fallback to defaults if resolveRequisitionConfig throws (e.g. db
      // not yet wired for this tenant) — same as the previous hardcoded
      // behavior, so existing flows don't break.
      tiers: [
        { tier: 1, approverType: 'hr_admin', label: 'HR Approval' },
        { tier: 2, approverType: 'finance', label: 'Finance Approval' },
      ],
      skipFinanceBelowBudget: null,
      allowManagerSubmit: false,
    }));
    // Filter out any 'finance' tiers if the requisition's budget is below
    // the configured skip threshold. The remaining tiers form the
    // "effective chain" used for the rest of this request.
    const salaryBudgetNum = parseSalaryBudget(existing.salaryBudget);
    const skipFinance =
      reqWfConfig.skipFinanceBelowBudget != null &&
      salaryBudgetNum != null &&
      salaryBudgetNum < reqWfConfig.skipFinanceBelowBudget;
    const effectiveTiers = skipFinance
      ? reqWfConfig.tiers.filter((t) => t.approverType !== 'finance')
      : reqWfConfig.tiers;
    const effectiveTotalTiers = effectiveTiers.length;
    if (skipFinance) {
      console.log(`[requisitions] Skipping Finance tier(s) for req ${existing.requisitionId} — budget ${salaryBudgetNum} < threshold ${reqWfConfig.skipFinanceBelowBudget}`);
    }

    // ─── Task 164: field edits (only requester or admin, only if draft/returned) ───
    const updateData: Record<string, unknown> = {};
    if (departmentId !== undefined) updateData.departmentId = departmentId;
    if (designationId !== undefined) updateData.designationId = designationId || null;
    if (positionType !== undefined) updateData.positionType = positionType;
    if (numberOfOpenings !== undefined) updateData.numberOfOpenings = numberOfOpenings;
    if (employmentType !== undefined) updateData.employmentType = employmentType;
    if (skillsRequired !== undefined) updateData.skillsRequired = skillsRequired || null;
    if (experienceRequired !== undefined) updateData.experienceRequired = experienceRequired || null;
    if (qualification !== undefined) updateData.qualification = qualification || null;
    if (salaryBudget !== undefined) updateData.salaryBudget = salaryBudget || null;
    if (priority !== undefined) updateData.priority = priority;
    if (expectedJoiningDate !== undefined) updateData.expectedJoiningDate = expectedJoiningDate ? new Date(expectedJoiningDate) : null;

    // Phase 3 fix: Persist positionTitle and reason in PATCH (were destructured but never stored)
    if (body.positionTitle !== undefined) (updateData as any).positionTitle = body.positionTitle || null;
    if (reason !== undefined) (updateData as any).reason = reason || null;

    // Phase 3 fix: Only allow field edits if requester or admin AND status is draft/returned
    if (Object.keys(updateData).length > 0 && !action) {
      if (!isRequester && !isHr) {
        return NextResponse.json({ error: 'Only the requester or HR can edit requisition fields' }, { status: 403, headers: corsHeaders() });
      }
      if (!['draft', 'returned'].includes(existing.approvalStatus)) {
        return NextResponse.json({ error: 'Cannot edit a requisition that is already ' + existing.approvalStatus + '. Return it first.' }, { status: 400, headers: corsHeaders() });
      }
    }

    // ─── Task 164 / C-32: approval actions ───
    // C-32 flow (configurable, driven by the tenant's
    // RequisitionWorkflowConfig):
    //   draft → pending (submit) → Tier 1 approve → Tier 2 approve → …
    //                            → final tier approve → 'budget_approved'
    //                            → rejected (at any tier) / returned (any tier)
    //
    // Legacy 2-tier status names ('hr_approved', 'budget_approved') are
    // preserved for backwards compatibility with existing rows + UI badges.
    //
    // Action vocabulary (the API still accepts the old action names so
    // existing UI buttons keep working):
    //   'submit'         → requester submits the draft
    //   'approve'         → approve at the CURRENT tier (generic; C-32)
    //   'hr_approve'      → approve at the CURRENT tier (legacy alias; only
    //                       allowed when the current tier is HR-like)
    //   'finance_approve' → approve at the CURRENT tier (legacy alias; only
    //                       allowed when the current tier is finance-like)
    //   'reject'          → reject at the CURRENT tier (generic; C-32)
    //   'hr_reject'       → reject at the CURRENT tier (legacy alias)
    //   'finance_reject'  → reject at the CURRENT tier (legacy alias)
    //   'return'          → return to requester for correction (any tier
    //                       whose approverType allows HR-like roles)
    if (action) {
      const currentStatus = existing.approvalStatus;

      // ─── Submit (draft → pending): only requester (or reporting manager if allowed) ───
      if (action === 'submit') {
        // C-32: allow reporting manager to submit on requester's behalf
        // if the config has allowManagerSubmit=true. In that case the
        // "reporting manager" of THIS requisition is its hiringManager.
        const allowMgr = reqWfConfig.allowManagerSubmit === true;
        if (!isRequester && !isHr && !allowMgr) {
          return NextResponse.json({ error: 'Only the requester can submit' }, { status: 403, headers: corsHeaders() });
        }
        if (allowMgr && !isRequester && !isHr && existing.hiringManagerId !== decoded.userId) {
          return NextResponse.json({ error: 'Only the requester or their reporting manager can submit' }, { status: 403, headers: corsHeaders() });
        }
        if (currentStatus !== 'draft' && currentStatus !== 'returned') {
          return NextResponse.json({ error: `Cannot submit: current status is ${currentStatus}` }, { status: 400, headers: corsHeaders() });
        }
        updateData.approvalStatus = 'pending';
        updateData.status = 'open';
        updateData.approvedBy = null;
        updateData.approvedAt = null;
        updateData.rejectionReason = null;
      }

      // ─── Approve (current tier) — generic + legacy aliases ───
      else if (action === 'approve' || action === 'hr_approve' || action === 'finance_approve') {
        if (currentStatus === 'draft' || currentStatus === 'returned' || currentStatus === 'rejected' || currentStatus === 'budget_approved') {
          return NextResponse.json({ error: `Cannot approve: current status is ${currentStatus}` }, { status: 400, headers: corsHeaders() });
        }
        // Figure out which tier is the "current" tier based on the status.
        // 'pending' = tier 0 = waiting on Tier 1 (effectiveTiers[0]).
        // 'hr_approved' / 'tier_<n>_approved' = tier n done = waiting on Tier n+1.
        const tierIdxDone = STATUS_TO_TIER_INDEX[currentStatus] ?? 0;
        const currentTierIdx = tierIdxDone; // 0-based, the tier we're waiting on
        if (currentTierIdx >= effectiveTotalTiers) {
          // Already past the last tier — shouldn't happen because
          // 'budget_approved' is caught above, but guard anyway.
          return NextResponse.json({ error: 'No more tiers to approve' }, { status: 400, headers: corsHeaders() });
        }
        const currentTier = effectiveTiers[currentTierIdx];
        // C-32: legacy alias validation — if the caller passed
        // 'hr_approve', ensure the current tier is HR-like; if
        // 'finance_approve', ensure it's finance-like. This keeps
        // existing UI buttons honest about what they're doing.
        if (action === 'hr_approve' && currentTier.approverType === 'finance') {
          return NextResponse.json({ error: 'Cannot use HR approval here — the current tier requires Finance approval' }, { status: 400, headers: corsHeaders() });
        }
        if (action === 'finance_approve' && currentTier.approverType === 'hr_admin') {
          return NextResponse.json({ error: 'Cannot use Finance approval here — the current tier requires HR approval' }, { status: 400, headers: corsHeaders() });
        }
        // C-32: enforce the approver role/identity against the configured tier.
        const canApprove = canApproveAtTier(currentTier, userRole, String(decoded.userId || ''), existing.hiringManagerId || null);
        if (!canApprove) {
          const tierLabel = currentTier.label || currentTier.approverType;
          return NextResponse.json({ error: `Only ${tierLabel} can approve at this tier` }, { status: 403, headers: corsHeaders() });
        }
        // Advance: tierIdxDone + 1 tiers are now complete.
        const newTierDone = tierIdxDone + 1;
        const newStatus = tierIndexToStatus(newTierDone, effectiveTotalTiers);
        updateData.approvalStatus = newStatus;
        if (newStatus === 'budget_approved') {
          updateData.status = 'approved';
        }
        updateData.approvedBy = decoded.userId;
        updateData.approvedAt = new Date();
        updateData.rejectionReason = null;
      }

      // ─── Reject (current tier) — generic + legacy aliases ───
      else if (action === 'reject' || action === 'hr_reject' || action === 'finance_reject') {
        if (currentStatus === 'draft' || currentStatus === 'returned' || currentStatus === 'rejected' || currentStatus === 'budget_approved') {
          return NextResponse.json({ error: `Cannot reject: current status is ${currentStatus}` }, { status: 400, headers: corsHeaders() });
        }
        const tierIdxDone = STATUS_TO_TIER_INDEX[currentStatus] ?? 0;
        const currentTierIdx = tierIdxDone;
        if (currentTierIdx >= effectiveTotalTiers) {
          return NextResponse.json({ error: 'No tier to reject' }, { status: 400, headers: corsHeaders() });
        }
        const currentTier = effectiveTiers[currentTierIdx];
        // Legacy alias validation (same as approve)
        if (action === 'hr_reject' && currentTier.approverType === 'finance') {
          return NextResponse.json({ error: 'Cannot use HR rejection here — the current tier requires Finance action' }, { status: 400, headers: corsHeaders() });
        }
        if (action === 'finance_reject' && currentTier.approverType === 'hr_admin') {
          return NextResponse.json({ error: 'Cannot use Finance rejection here — the current tier requires HR action' }, { status: 400, headers: corsHeaders() });
        }
        const canApprove = canApproveAtTier(currentTier, userRole, String(decoded.userId || ''), existing.hiringManagerId || null);
        if (!canApprove) {
          const tierLabel = currentTier.label || currentTier.approverType;
          return NextResponse.json({ error: `Only ${tierLabel} can reject at this tier` }, { status: 403, headers: corsHeaders() });
        }
        updateData.approvalStatus = 'rejected';
        updateData.status = 'cancelled';
        updateData.rejectionReason = comments || `Rejected at ${currentTier.label || currentTier.approverType}`;
        updateData.approvedBy = decoded.userId;
        updateData.approvedAt = new Date();
      }

      // ─── Return (current tier → returned): only current-tier approver ───
      else if (action === 'return') {
        if (currentStatus === 'draft' || currentStatus === 'returned' || currentStatus === 'rejected' || currentStatus === 'budget_approved') {
          return NextResponse.json({ error: `Cannot return: current status is ${currentStatus}` }, { status: 400, headers: corsHeaders() });
        }
        const tierIdxDone = STATUS_TO_TIER_INDEX[currentStatus] ?? 0;
        const currentTierIdx = tierIdxDone;
        if (currentTierIdx >= effectiveTotalTiers) {
          return NextResponse.json({ error: 'No tier to return from' }, { status: 400, headers: corsHeaders() });
        }
        const currentTier = effectiveTiers[currentTierIdx];
        // C-32: only the current tier's approver can return the requisition.
        // (Previously anyone with HR role could return at any tier —
        //  C-32 narrows this to the current tier's approver to respect
        //  the configured chain. The legacy behavior of "HR can return
        //  at any time" is preserved as long as Tier 1 is configured as
        //  'hr_admin', which is the default.)
        const canApprove = canApproveAtTier(currentTier, userRole, String(decoded.userId || ''), existing.hiringManagerId || null);
        if (!canApprove) {
          const tierLabel = currentTier.label || currentTier.approverType;
          return NextResponse.json({ error: `Only ${tierLabel} can return at this tier` }, { status: 403, headers: corsHeaders() });
        }
        updateData.approvalStatus = 'returned';
        updateData.rejectionReason = comments || 'Returned for correction';
        updateData.approvedBy = decoded.userId;
        updateData.approvedAt = new Date();
      }

      else {
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400, headers: corsHeaders() });
      }
    }

    // ─── Update the requisition ───
    const requisition = await db.requisition.update({
      where: { id },
      data: updateData,
      include: {
        department: { select: { id: true, name: true } },
        designation: { select: { id: true, title: true } },
      },
    }).catch(async (err) => {
      // RAW SQL fallback
      console.warn('[Requisitions PATCH] Prisma update failed, trying RAW SQL:', err instanceof Error ? err.message : err);
      const sets: string[] = [];
      const vals: any[] = [];
      let idx = 1;
      for (const [k, v] of Object.entries(updateData)) {
        if (v instanceof Date) {
          sets.push(`"${k}" = $${idx++}::timestamp`);
        } else {
          sets.push(`"${k}" = $${idx++}`);
        }
        vals.push(v);
      }
      if (sets.length > 0) {
        vals.push(id);
        await db.$executeRawUnsafe(`UPDATE "Requisition" SET ${sets.join(', ')}, "updatedAt" = NOW() WHERE "id" = $${idx}`, ...vals);
      }
      // Fetch back
      const rows = await db.$queryRawUnsafe(
        `SELECT r.*, d."name" AS "deptName", des."title" AS "desgTitle"
         FROM "Requisition" r LEFT JOIN "Department" d ON d."id" = r."departmentId"
         LEFT JOIN "Designation" des ON des."id" = r."designationId"
         WHERE r."id" = $1 LIMIT 1`, id
      ) as any[];
      return rows[0] || { id, ...updateData };
    });

    // ─── Audit log + approval history ───
    const actionLabel = action ? ` — ${action}${comments ? `: ${comments}` : ''}` : '';
    await db.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: action ? 'REQUISITION_APPROVAL' : 'UPDATE_REQUISITION',
        module: 'requisitions',
        details: `${action ? action.toUpperCase() : 'Updated'} requisition ${existing.requisitionId}${actionLabel}`,
      },
    }).catch(() => null);

    // ─── Notifications ───
    if (action && decoded.tenantId) {
      try {
        const { dispatchNotification } = await import('@/lib/notification-center');
        const empName = decoded.name || decoded.email || 'Approver';

        // Notify the requester (Manager) of any decision
        if (existing.hiringManagerId) {
          let notifTitle = '';
          let notifMsg = '';
          if (action === 'hr_approve') { notifTitle = 'Requisition Approved by HR'; notifMsg = `Your requisition ${existing.requisitionId} was approved by HR. Pending Finance approval.`; }
          else if (action === 'finance_approve') { notifTitle = 'Requisition Fully Approved'; notifMsg = `Your requisition ${existing.requisitionId} has been fully approved. You can now create a job posting.`; }
          else if (action === 'hr_reject' || action === 'finance_reject') { notifTitle = 'Requisition Rejected'; notifMsg = `Your requisition ${existing.requisitionId} was rejected. Reason: ${comments || 'N/A'}`; }
          else if (action === 'return') { notifTitle = 'Requisition Returned for Correction'; notifMsg = `Your requisition ${existing.requisitionId} was returned. Please review and resubmit. Comments: ${comments || 'N/A'}`; }
          else if (action === 'submit') { notifTitle = 'Requisition Submitted'; notifMsg = `Your requisition ${existing.requisitionId} has been submitted for HR approval.`; }

          if (notifTitle) {
            // GAP FIX #3: Use dispatchNotification for fully-approved requisitions so the
            // recruitment.requisition.approved event template is used (with proper email +
            // delivery log). For other actions, keep the existing raw createNotification
            // which already sends in-app + email.
            if (action === 'finance_approve' && decoded.tenantId) {
              try {
                const { dispatchNotification } = await import('@/lib/notification-center');
                await dispatchNotification({
                  tenantId: decoded.tenantId as string,
                  module: 'recruitment',
                  eventKey: 'recruitment.requisition.approved',
                  recipients: [{ userId: existing.hiringManagerId }],
                  vars: {
                    Requisition_Title: existing.requisitionId,
                    Department: existing.department?.name || '—',
                    Requested_By: empName,
                    Openings: String(existing.numberOfOpenings || 1),
                  },
                  entity: { type: 'requisition', id: existing.id, link: '/requisitions' },
                }).catch(() => null);
              } catch { /* non-fatal */ }
            } else {
              // Keep existing raw notification for non-fully-approved actions
              const notif = await createNotification({
                tenantId: decoded.tenantId as string,
                userId: existing.hiringManagerId,
                title: notifTitle,
                message: notifMsg,
                type: action.includes('reject') ? 'warning' : action === 'return' ? 'info' : 'success',
                category: 'recruitment',
                link: '/requisitions',
              }).catch(() => null);
              const mgrUser = await db.user.findUnique({ where: { id: existing.hiringManagerId }, select: { email: true } }).catch(() => null);
              if (notif?.id && mgrUser?.email) {
                await sendNotificationEmail(db, decoded.tenantId as string, notif, mgrUser.email, notifTitle, `<p>${notifMsg}</p>`).catch(() => null);
              }
            }
          }
        }

        // Notify Finance when HR approves
        // C-32: replaced the hardcoded "action === 'hr_approve'" check
        // with a tier-driven approach. After ANY approval advances the
        // requisition to the next tier, notify the next tier's
        // approvers that the requisition is now waiting on them. This
        // keeps the existing 'recruitment.requisition.finance_approval_required'
        // event firing for the legacy 2-tier flow, while ALSO supporting
        // multi-tier chains (HR → Finance → CEO etc.).
        if (action === 'approve' || action === 'hr_approve' || action === 'finance_approve') {
          // If the new status is 'budget_approved', no next tier — skip
          // notification here (the requester-side "Fully Approved"
          // notification below already fires).
          if (updateData.approvalStatus !== 'budget_approved') {
            // Find the next tier to notify
            const newTierIdxDone = STATUS_TO_TIER_INDEX[updateData.approvalStatus as string] ?? 0;
            const nextTierIdx = newTierIdxDone; // 0-based, waiting on this tier
            if (nextTierIdx < effectiveTotalTiers) {
              const nextTier = effectiveTiers[nextTierIdx];
              const rolesForNext = rolesForTier(nextTier);
              let nextApprovers: Array<{ id: string; email: string }> = [];
              if (nextTier.approverType === 'specific_user' && rolesForNext.specificUserId) {
                const u = await db.user.findUnique({ where: { id: rolesForNext.specificUserId }, select: { id: true, email: true } }).catch(() => null);
                if (u) nextApprovers = [u];
              } else if (nextTier.approverType === 'reporting_manager' && existing.hiringManagerId) {
                // The hiringManager IS the reporting manager of the
                // requester — but they shouldn't approve their own
                // request, so we don't notify them. Skip.
              } else if (rolesForNext.roles.length > 0) {
                nextApprovers = await db.user.findMany({
                  where: { role: { in: rolesForNext.roles }, status: 'active' },
                  select: { id: true, email: true },
                }).catch(() => []);
              }
              if (nextApprovers.length > 0) {
                await dispatchNotification({
                  tenantId: decoded.tenantId as string,
                  module: 'recruitment',
                  eventKey: 'recruitment.requisition.finance_approval_required',
                  recipients: nextApprovers.map((u: { id: string }) => ({ userId: u.id })),
                  vars: {
                    Requisition_Title: `${requisition.designation?.title || existing.requisitionId}`,
                    Department: requisition.department?.name || '—',
                  },
                  entity: { type: 'requisition', id, link: '/requisitions' },
                  origin: request.headers.get('origin') || undefined,
                }).catch(() => null);
              }
            }
          }
        }

        // Notify HR when Manager submits (or resubmits after return)
        // C-32: use the FIRST effective tier's approver roles (instead
        // of always HR_ROLES) so a tenant that reconfigures Tier 1 to
        // e.g. 'department_head' will notify those users on submit.
        if (action === 'submit') {
          let firstTierApprovers: Array<{ id: string; email: string }> = [];
          if (effectiveTiers.length > 0) {
            const firstTier = effectiveTiers[0];
            const rolesForFirst = rolesForTier(firstTier);
            if (firstTier.approverType === 'specific_user' && rolesForFirst.specificUserId) {
              const u = await db.user.findUnique({ where: { id: rolesForFirst.specificUserId }, select: { id: true, email: true } }).catch(() => null);
              if (u) firstTierApprovers = [u];
            } else if (firstTier.approverType === 'reporting_manager' && existing.hiringManagerId) {
              // Notify the hiringManager (who is the reporting manager
              // of the requester) — but only if they're not the
              // requester themselves.
              if (existing.hiringManagerId !== decoded.userId) {
                const u = await db.user.findUnique({ where: { id: existing.hiringManagerId }, select: { id: true, email: true } }).catch(() => null);
                if (u) firstTierApprovers = [u];
              }
            } else if (rolesForFirst.roles.length > 0) {
              firstTierApprovers = await db.user.findMany({
                where: { role: { in: rolesForFirst.roles }, status: 'active' },
                select: { id: true, email: true },
              }).catch(() => []);
            }
          }
          if (firstTierApprovers.length > 0) {
            await dispatchNotification({
              tenantId: decoded.tenantId as string,
              module: 'recruitment',
              eventKey: 'recruitment.requisition.submitted',
              recipients: firstTierApprovers.map((u: { id: string }) => ({ userId: u.id })),
              vars: {
                Requisition_Title: `${requisition.designation?.title || existing.requisitionId}`,
                Department: requisition.department?.name || '—',
                Requested_By: decoded.name || decoded.email || 'Manager',
              },
              entity: { type: 'requisition', id, link: '/requisitions' },
              origin: request.headers.get('origin') || undefined,
            }).catch(() => null);
          }
        }
      } catch (e) {
        console.warn('[requisitions] notification failed (non-fatal):', (e as Error).message);
      }
    }

    return NextResponse.json({ requisition }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Patch requisition error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });

    const { id } = await params;
    const existing = await db.requisition.findUnique({ where: { id } }).catch(async () => {
      const rows = await db.$queryRawUnsafe(`SELECT * FROM "Requisition" WHERE "id" = $1 LIMIT 1`, id) as any[];
      return rows[0] || null;
    });
    if (!existing) return NextResponse.json({ error: 'Requisition not found' }, { status: 404, headers: corsHeaders() });

    // Phase 3 fix: Only requester or HR/Admin can delete, and only if draft/returned
    const userRole = (decoded.role as string) || '';
    const isHrOrAdmin = HR_ROLES.includes(userRole);
    const isRequester = existing.hiringManagerId === decoded.userId;
    if (!isRequester && !isHrOrAdmin) {
      return NextResponse.json({ error: 'Only the requester or HR/Admin can delete a requisition' }, { status: 403, headers: corsHeaders() });
    }
    if (!['draft', 'returned'].includes(existing.approvalStatus)) {
      return NextResponse.json({ error: 'Cannot delete a requisition that has been submitted or approved. Cancel it instead.' }, { status: 400, headers: corsHeaders() });
    }

    await db.requisition.delete({ where: { id } }).catch(async () => {
      await db.$executeRawUnsafe(`DELETE FROM "Requisition" WHERE "id" = $1`, id);
    });

    await db.auditLog.create({
      data: { userId: decoded.userId as string, action: 'DELETE_REQUISITION', module: 'requisitions', details: `Deleted requisition ${existing.requisitionId}` },
    }).catch(() => null);

    return NextResponse.json({ success: true }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Delete requisition error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
