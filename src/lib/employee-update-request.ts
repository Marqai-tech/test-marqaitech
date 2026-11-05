/**
 * Employee profile-change request engine (shared).
 *
 * Used by:
 *  - POST /api/employees/update-requests   ("Request Change" modal)
 *  - PATCH /api/users/profile              (ESS My Profile "Edit Profile")
 *
 * Field sensitivity:
 *   'low'        — direct update (phone, address, emergency contact, health info)
 *   'high'       — requires approval (names, DOB, bank details, KYC, PF/ESI)
 *   'restricted' — never editable by employee (salary, employeeId, userId, status)
 *
 * Task 86: high-risk changes route through the ACTIVE EmployeeWorkflowConfig
 * (workflowType='update_profile') when configured; otherwise the 2-tier
 * default (Reporting Manager → HR Admin) applies. A tier that resolves to no
 * concrete approver (e.g. a reporting manager without a login account) falls
 * back to active HR/admin accounts so a request can never end up invisible
 * in every "My Approvals" inbox.
 */
import { sanitizeMultiLineText } from '@/lib/sanitize';
import { ensureWorkflowConfig, resolveTierApprovers, type WorkflowTier } from '@/lib/approverResolve';
import { loadEmployeeFieldRules } from '@/lib/employee-config';

export type FieldSensitivity = 'low' | 'high' | 'restricted';

/**
 * Task 137 — fields an employee can NEVER change via self-service (the My
 * Profile editor renders them locked/read-only and the server rejects any
 * attempt, even when a tenant's saved field-rules still mark them 'high').
 * HR/Admin edits through /api/employees/[id] are NOT affected.
 */
export const SELF_SERVICE_LOCKED_FIELDS = new Set(['firstName', 'lastName', 'dateOfBirth']);

export const FIELD_SENSITIVITY: Record<string, { sensitivity: FieldSensitivity; category: string; label: string }> = {
  // Contact (low-risk — direct update)
  phone:               { sensitivity: 'low',  category: 'contact',    label: 'Phone Number' },
  address:             { sensitivity: 'low',  category: 'contact',    label: 'Address' },
  city:                { sensitivity: 'low',  category: 'contact',    label: 'City' },
  state:               { sensitivity: 'low',  category: 'contact',    label: 'State' },
  zipCode:             { sensitivity: 'low',  category: 'contact',    label: 'ZIP Code' },
  country:             { sensitivity: 'low',  category: 'contact',    label: 'Country' },
  currentAddress:      { sensitivity: 'low',  category: 'contact',    label: 'Current Address' },
  currentCity:         { sensitivity: 'low',  category: 'contact',    label: 'Current City' },
  currentState:        { sensitivity: 'low',  category: 'contact',    label: 'Current State' },
  currentZipCode:      { sensitivity: 'low',  category: 'contact',    label: 'Current ZIP Code' },
  currentCountry:      { sensitivity: 'low',  category: 'contact',    label: 'Current Country' },
  emergencyContactName: { sensitivity: 'low', category: 'contact',    label: 'Emergency Contact Name' },
  emergencyContactPhone: { sensitivity: 'low', category: 'contact',   label: 'Emergency Contact Phone' },
  emergencyContactRelation: { sensitivity: 'low', category: 'contact', label: 'Emergency Contact Relation' },
  personalEmail:       { sensitivity: 'low',  category: 'contact',    label: 'Personal Email' },

  // Personal (high-risk — approval required)
  firstName:           { sensitivity: 'high', category: 'personal',   label: 'First Name' },
  lastName:            { sensitivity: 'high', category: 'personal',   label: 'Last Name' },
  dateOfBirth:         { sensitivity: 'high', category: 'personal',   label: 'Date of Birth' },
  originalBirthday:    { sensitivity: 'high', category: 'personal',   label: 'Original Birthday' }, // Task 139 — requestable date field
  gender:              { sensitivity: 'high', category: 'personal',   label: 'Gender' },
  maritalStatus:       { sensitivity: 'high', category: 'personal',   label: 'Marital Status' },
  nationality:         { sensitivity: 'high', category: 'personal',   label: 'Nationality' },

  // Employment (high-risk)
  departmentId:        { sensitivity: 'high', category: 'employment', label: 'Department' },
  designationId:       { sensitivity: 'high', category: 'employment', label: 'Designation' },
  branchId:            { sensitivity: 'high', category: 'employment', label: 'Branch' },
  reportingManagerId:  { sensitivity: 'high', category: 'employment', label: 'Reporting Manager' },
  employeeType:        { sensitivity: 'high', category: 'employment', label: 'Employee Type' },
  employeeStatus:      { sensitivity: 'high', category: 'employment', label: 'Employee Status' },

  // Financial / KYC (high-risk — definitely approval-required)
  bankName:            { sensitivity: 'high', category: 'financial',  label: 'Bank Name' },
  bankAccountNo:       { sensitivity: 'high', category: 'financial',  label: 'Bank Account Number' },
  bankIfscCode:        { sensitivity: 'high', category: 'financial',  label: 'Bank IFSC Code' },
  panNumber:           { sensitivity: 'high', category: 'kyc',        label: 'PAN Number' },
  aadhaarNumber:       { sensitivity: 'high', category: 'kyc',        label: 'Aadhaar Number' },
  taxId:               { sensitivity: 'high', category: 'kyc',        label: 'Tax ID' },
  pfNumber:            { sensitivity: 'high', category: 'kyc',        label: 'PF Number' },
  pfUAN:               { sensitivity: 'high', category: 'kyc',        label: 'PF UAN' },
  pfNomineeName:       { sensitivity: 'high', category: 'kyc',        label: 'PF Nominee Name' },
  pfNomineeRelation:   { sensitivity: 'high', category: 'kyc',        label: 'PF Nominee Relation' },
  pfNomineePercentage: { sensitivity: 'high', category: 'kyc',        label: 'PF Nominee Percentage' },
  esiNumber:           { sensitivity: 'high', category: 'kyc',        label: 'ESI Number' },
  esiDispensary:       { sensitivity: 'high', category: 'kyc',        label: 'ESI Dispensary' },
  esiNomineeName:      { sensitivity: 'high', category: 'kyc',        label: 'ESI Nominee Name' },
  esiNomineeRelation:  { sensitivity: 'high', category: 'kyc',        label: 'ESI Nominee Relation' },
  professionalTaxNumber: { sensitivity: 'high', category: 'kyc',      label: 'Professional Tax Number' },
  lwfNumber:           { sensitivity: 'high', category: 'kyc',        label: 'LWF Number' },

  // Restricted (never editable by employee)
  email:               { sensitivity: 'restricted', category: 'system', label: 'Official Email' },
  employeeId:          { sensitivity: 'restricted', category: 'system', label: 'Employee ID' },
  userId:              { sensitivity: 'restricted', category: 'system', label: 'User ID' },
  salary:              { sensitivity: 'restricted', category: 'system', label: 'Salary' },
  salaryCurrency:      { sensitivity: 'restricted', category: 'system', label: 'Salary Currency' },
  salaryStructureId:   { sensitivity: 'restricted', category: 'system', label: 'Salary Structure' },
  dateOfJoining:       { sensitivity: 'restricted', category: 'system', label: 'Date of Joining' },
  status:              { sensitivity: 'restricted', category: 'system', label: 'Employee Status' },
  companyId:           { sensitivity: 'restricted', category: 'system', label: 'Company' },
};

export interface RequesterAuth {
  userId: string;
  role: string;
  tenantId: string | null;
}

export interface FieldChangeResult {
  ok: boolean;
  status?: number;
  error?: string;
  applied: boolean;
  request?: Record<string, unknown>;
  message?: string;
}

/** Admins / HR roles that may act as a fallback approver for orphaned tiers. */
const FALLBACK_ROLES = ['hr_admin', 'admin', 'tenant_admin', 'ceo', 'super_admin', 'company_hr_admin'];

/**
 * Resolve a fallback approver when a tier's own resolution comes up empty
 * (reporting manager without a login, empty HR role set, etc.). Returns the
 * first active admin userId, preferring HR admins.
 */
async function fallbackApproverUserId(db: Record<string, any>): Promise<string | null> {
  try {
    const admins = await db.user.findMany({
      where: { role: { in: FALLBACK_ROLES }, status: 'active' },
      select: { id: true, role: true },
      take: 50,
    });
    if (!admins.length) return null;
    const preferred = admins.find((a: { role: string }) => a.role === 'hr_admin' || a.role === 'company_hr_admin')
      || admins.find((a: { role: string }) => a.role === 'admin')
      || admins.find((a: { role: string }) => (a.role === 'tenant_admin' || a.role === 'ceo'))
      || admins[0];
    return preferred?.id || null;
  } catch {
    return null;
  }
}

/**
 * Apply one employee profile-field change on behalf of a requester:
 *  - low sensitivity        → applied directly (+ audit row, status 'applied', tier 0)
 *  - high sensitivity       → pending EmployeeUpdateRequest + approval steps +
 *                             tier-1 approver notification (email + in-app)
 *  - restricted / unchanged → rejected with an explanatory error
 */
export async function applyEmployeeFieldChange(
  db: Record<string, any>,
  opts: {
    auth: RequesterAuth;
    employeeId: string;
    fieldName: string;
    newValue: string;
    reason?: string;
    documentId?: string | null;
    origin?: string | null;
    req?: Request;
  },
): Promise<FieldChangeResult> {
  const { auth, employeeId, fieldName } = opts;
  // Saved tenant settings are the authority. The default is persisted only
  // for first-time tenants so all subsequent requests read configuration.
  const fieldRules = await loadEmployeeFieldRules(db, opts.req || new Request('http://local/'));
  const fieldConfig = fieldRules[fieldName];
  if (!fieldConfig) return { ok: false, status: 400, error: `Unknown field: ${fieldName}`, applied: false };
  if (SELF_SERVICE_LOCKED_FIELDS.has(fieldName)) {
    return { ok: false, status: 403, error: `${fieldConfig.label} is locked for self-service — contact HR/Admin to change it.`, applied: false };
  }
  if (fieldConfig.sensitivity === 'restricted') {
    return { ok: false, status: 403, error: `Field "${fieldConfig.label}" is restricted and cannot be changed via self-service.`, applied: false };
  }

  const emp = await db.employee.findUnique({ where: { id: employeeId }, select: { [fieldName]: true } });
  if (!emp) return { ok: false, status: 404, error: 'Employee not found', applied: false };
  const oldValue = String((emp as Record<string, unknown>)[fieldName] ?? '');
  if (oldValue === String(opts.newValue)) {
    return { ok: false, status: 400, error: 'The new value is the same as the current value.', applied: false };
  }

  const cleanReason = sanitizeMultiLineText(opts.reason, 500);
  const cleanNewValue = sanitizeMultiLineText(opts.newValue, 2000);

  // ─── LOW-risk: apply directly, keep an audit row ───
  if (fieldConfig.sensitivity === 'low') {
    await db.employee.update({
      where: { id: employeeId },
      data: { [fieldName]: cleanNewValue } as Record<string, unknown>,
    });
    const request = await db.employeeUpdateRequest.create({
      data: {
        employeeId, fieldName, fieldLabel: fieldConfig.label, category: fieldConfig.category,
        oldValue, newValue: cleanNewValue, reason: cleanReason,
        status: 'applied', currentTier: 0,
        requestedById: auth.userId, requestedAt: new Date(),
        appliedAt: new Date(),
        documentId: opts.documentId || null,
      },
    });

    // Task 137 — the employee's own record changed without an approval step,
    // so HR/Admin must still SEE it: bell + email to every active admin/HR
    // account (the actor themselves is skipped). Failures are non-fatal —
    // the field change itself already succeeded.
    try {
      if (auth.tenantId) {
        const { dispatchNotification } = await import('@/lib/notification-center');
        const admins = await (db as any).user.findMany({
          where: { role: { in: FALLBACK_ROLES }, status: 'active', id: { not: auth.userId } },
          select: { id: true },
          take: 100,
        });
        if (admins.length) {
          const empRow = await db.employee.findUnique({ where: { id: employeeId }, select: { firstName: true, lastName: true } });
          const employeeName = empRow ? `${empRow.firstName || ''} ${empRow.lastName || ''}`.trim() : 'An employee';
          const when = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
          await dispatchNotification({
            tenantId: auth.tenantId,
            module: 'core_hr',
            eventKey: 'core_hr.profile.self_updated',
            recipients: admins.map((a: { id: string }) => ({ userId: a.id })),
            vars: {
              Employee_Name: employeeName,
              Field_Name: fieldConfig.label || fieldName,
              Old_Value: oldValue || '—',
              New_Value: cleanNewValue || '—',
              Updated_At: when,
            },
            entity: { type: 'employee_profile', id: employeeId, link: `/employees/${employeeId}` },
            origin: opts.origin || undefined,
          });
        }
      }
    } catch (e) {
      console.warn('[employee-update-request] self-update HR alert failed (non-fatal):', (e as Error).message);
    }

    return { ok: true, applied: true, request, message: 'Field updated directly (low-risk)' };
  }

  // ─── HIGH-risk: pending approval chain ───

  // Task 88 (spec rule 8 — duplicate requests): block a second pending
  // request for the same employee+field so approvers never see stacked
  // identical entries and the employee gets a clear message instead.
  const existingPending = await (db as any).employeeUpdateRequest.findFirst({
    where: { employeeId, fieldName, status: 'pending' },
    orderBy: { requestedAt: 'desc' },
  }).catch(() => null);
  if (existingPending) {
    const submittedOn = existingPending.requestedAt
      ? new Date(existingPending.requestedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
      : 'recently';
    return {
      ok: false, status: 409, applied: false,
      error: `A change for "${fieldConfig.label}" is already pending approval (submitted ${submittedOn}). Your existing details remain unchanged until it is approved — cancel it from Update Requests if you want to submit a new value.`,
    };
  }

  const wfConfig = await ensureWorkflowConfig(db, opts.req || new Request('http://local/'), 'update_profile');
  if (!wfConfig?.tiers?.length) {
    return { ok: false, status: 409, error: 'Employee profile workflow is not configured for this tenant', applied: false };
  }
  const tiers: WorkflowTier[] = wfConfig.tiers;

  const configSnapshot = JSON.stringify({
    fieldSensitivity: fieldConfig,
    workflowConfigId: wfConfig?.id || null,
    tiers,
  });

  const updateRequest = await db.employeeUpdateRequest.create({
    data: {
      employeeId, fieldName, fieldLabel: fieldConfig.label, category: fieldConfig.category,
      oldValue, newValue: cleanNewValue, reason: cleanReason,
      status: 'pending', currentTier: 1,
      configSnapshot,
      requestedById: auth.userId,
      documentId: opts.documentId || null,
    },
  });

  // Create approval steps (configured chain or 2-tier default). Task 86:
  // every tier MUST resolve to a concrete approver — an orphaned step is
  // invisible in every My Approvals inbox, which read as "requests not
  // coming for approval".
  for (let i = 0; i < tiers.length; i++) {
    const step = tiers[i];
    let approverUserId: string | null = null;
    try {
      const resolved = await resolveTierApprovers(db, step, employeeId);
      approverUserId = resolved.userIds[0] || null;
    } catch { approverUserId = null; }
    if (!approverUserId && step.approverType === 'reporting_manager') {
      // legacy fallback: resolve RM directly
      try {
        const mgr = await db.employee.findUnique({ where: { id: employeeId }, select: { reportingManagerId: true } });
        if (mgr?.reportingManagerId) {
          const mgrUser = await db.employee.findUnique({ where: { id: mgr.reportingManagerId }, select: { userId: true } });
          approverUserId = mgrUser?.userId || null;
        }
      } catch { approverUserId = null; }
    }
    if (!approverUserId) approverUserId = await fallbackApproverUserId(db);
    await (db as any).employeeUpdateApprovalStep.create({
      data: {
        updateRequestId: updateRequest.id,
        tier: i + 1,
        approverType: step.approverType,
        approverName: step.approverName || step.approverType,
        approverUserId,
        status: 'pending',
      },
    });
  }

  // ─── Notifications (multi-channel, email + in-app; failures are non-fatal) ───
  try {
    const empRow = await db.employee.findUnique({ where: { id: employeeId }, select: { firstName: true, lastName: true } });
    const employeeName = empRow ? `${empRow.firstName || ''} ${empRow.lastName || ''}`.trim() : 'An employee';
    const critical = ['bank', 'account', 'salary', 'pan', 'aadhaar', 'ssn', 'tax', 'pf', 'esi'].some((k) => fieldName.toLowerCase().includes(k));

    if (auth.tenantId) {
      const { dispatchNotification } = await import('@/lib/notification-center');
      const entity = { type: 'employee_update_request', id: updateRequest.id, link: '/employees/update-requests' };
      const submittedAt = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

      // Notify the tier-1 approver — actionable (email + in-app)
      const firstStep = await (db as any).employeeUpdateApprovalStep.findFirst({
        where: { updateRequestId: updateRequest.id, tier: 1 },
      });
      if (firstStep?.approverUserId) {
        await dispatchNotification({
          tenantId: auth.tenantId,
          module: 'core_hr',
          eventKey: 'core_hr.profile.update_requested',
          recipients: [{ userId: firstStep.approverUserId }],
          vars: {
            Employee_Name: employeeName,
            Field_Name: fieldConfig.label || fieldName,
            New_Value: cleanNewValue,
            Critical: critical ? ' This is a PAYROLL-CRITICAL change.' : '',
          },
          entity,
          origin: opts.origin || undefined,
        });
      }

      // Task 88 (spec Workflow 1): submission confirmation to the requesting
      // employee — in-app + email. Their details stay unchanged until approval.
      await dispatchNotification({
        tenantId: auth.tenantId,
        module: 'core_hr',
        eventKey: 'core_hr.profile.update_submitted',
        recipients: [{ userId: auth.userId }],
        vars: {
          Employee_Name: employeeName,
          Field_Name: fieldConfig.label || fieldName,
          New_Value: cleanNewValue,
          Requested_At: submittedAt,
        },
        entity,
        origin: opts.origin || undefined,
      });
    }
  } catch (e) {
    console.warn('[employee-update-request] notification failed (non-fatal):', (e as Error).message);
  }

  return { ok: true, applied: false, request: updateRequest, message: 'Update request submitted for approval' };
}
