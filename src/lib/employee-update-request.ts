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

  // Task 158 — SECTION requests (Experience / Achievements / Documents /
  // Verification / Health) carry a JSON payload instead of a single column
  // value. They always route through the HR approval chain — never applied
  // directly — and reuse the same request rows / tiers / notifications.
  if (fieldName in PROFILE_SECTION_REQUESTS) {
    return submitProfileSectionChange(db, {
      auth,
      employeeId,
      section: fieldName as ProfileSectionKey,
      payloadText: opts.newValue,
      reason: opts.reason,
      origin: opts.origin || null,
      req: opts.req,
    });
  }

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

/* ═══════════════════════════════════════════════════════════════════════════
 * Task 158 — Profile SECTION edit requests (Experience / Achievements /
 * Documents / Verification / Health).
 *
 * Employees submit a whole-section payload from My Profile; every submission
 * routes to the tenant's profile-change approval chain (HR/Admin) and only
 * updates the official record once the final tier approves. Section requests
 * reuse the EmployeeUpdateRequest row (fieldName = section key, newValue =
 * JSON payload) so the existing My Approvals inbox, audit trail and
 * notification events keep working unchanged.
 *
 * The loose `Record<string, any>` DB handle matches the file's existing
 * call-signature style above (no-explicit-any is scoped to this block).
 * ═══════════════════════════════════════════════════════════════════════════ */
/* eslint-disable @typescript-eslint/no-explicit-any */

export const PROFILE_SECTION_REQUESTS = {
  experience:   { label: 'Experience',   category: 'profile_section' },
  achievements: { label: 'Achievements', category: 'profile_section' },
  documents:    { label: 'Documents',    category: 'profile_section' },
  verification: { label: 'Verification', category: 'profile_section' },
  health:       { label: 'Health',       category: 'profile_section' },
} as const;

export type ProfileSectionKey = keyof typeof PROFILE_SECTION_REQUESTS;

/** Yes/no toggle fields in the Health section (stored as 'yes'/'no' TEXT). */
const HEALTH_YES_NO_FIELDS = ['hasChronicIllness', 'hasAllergies', 'hasDisability', 'isOnMedication', 'hasHadSurgery'] as const;

/** Whitelisted health column names (guards the raw UPDATE identifier list). */
const HEALTH_COLUMN_RE = /^(bloodGroup|emergencyMedicalCondition|hasChronicIllness|chronicIllnessDetails|hasAllergies|allergyDetails|hasDisability|disabilityDetails|isOnMedication|medicationDetails|hasHadSurgery|surgeryDetails|primaryPhysicianName|primaryPhysicianPhone|healthInsuranceProvider|healthInsurancePolicyNo)$/;
/** Free-text / enum Health fields an employee may request changes to. */
const HEALTH_TEXT_FIELDS = [
  'bloodGroup', 'emergencyMedicalCondition',
  'chronicIllnessDetails', 'allergyDetails', 'disabilityDetails', 'medicationDetails', 'surgeryDetails',
  'primaryPhysicianName', 'primaryPhysicianPhone', 'healthInsuranceProvider', 'healthInsurancePolicyNo',
] as const;

/** Verification submission fields (merged into the kycVerification JSON block). */
const VERIFICATION_FIELDS = ['fullName', 'idType', 'idNumber', 'address', 'note'] as const;

const ID_TYPES = new Set(['aadhaar', 'pan', 'passport', 'voter_id', 'driving_license', 'other']);

function asTrimmedString(value: unknown, max = 500): string {
  if (value === null || value === undefined) return '';
  return String(value).trim().slice(0, max);
}

function coerceYesNo(value: unknown): 'yes' | 'no' | null {
  const s = asTrimmedString(value, 10).toLowerCase();
  return s === 'yes' || s === 'true' || s === '1' ? 'yes'
    : s === 'no' || s === 'false' || s === '0' ? 'no'
    : null;
}

function coerceDate(value: unknown): Date | null {
  const s = asTrimmedString(value, 40);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Validate + normalise a section payload coming from the client. */
export function sanitizeSectionPayload(
  section: ProfileSectionKey,
  raw: unknown,
): { ok: true; payload: Record<string, unknown> } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: `${PROFILE_SECTION_REQUESTS[section].label} payload must be an object` };
  }
  const input = raw as Record<string, unknown>;

  if (section === 'experience' || section === 'achievements' || section === 'documents') {
    const list = input.entries;
    if (!Array.isArray(list)) return { ok: false, error: 'entries array is required' };
    if (list.length > 30) return { ok: false, error: 'A section request can include at most 30 entries' };
    const entries: Record<string, unknown>[] = [];
    for (const item of list) {
      if (!item || typeof item !== 'object') return { ok: false, error: 'Each entry must be an object' };
      const e = item as Record<string, unknown>;
      if (section === 'experience') {
        const company = asTrimmedString(e.company, 120);
        const designation = asTrimmedString(e.designation, 120);
        if (!company || !designation) return { ok: false, error: 'Every experience entry needs a company and designation' };
        const startDate = coerceDate(e.startDate);
        if (!startDate) return { ok: false, error: `Experience entry "${company}" needs a valid start date` };
        const isCurrent = e.isCurrent === true || e.isCurrent === 'true';
        const endDate = isCurrent ? null : coerceDate(e.endDate);
        if (!endDate && !isCurrent) return { ok: false, error: `Experience entry "${company}" needs an end date (or mark it as current)` };
        entries.push({
          company,
          designation,
          startDate: startDate.toISOString(),
          endDate: endDate ? endDate.toISOString() : null,
          isCurrent,
          description: asTrimmedString(e.description, 1000),
        });
      } else if (section === 'achievements') {
        const title = asTrimmedString(e.title, 160);
        if (!title) return { ok: false, error: 'Every achievement entry needs a title' };
        const category = asTrimmedString(e.category, 40) || 'previous_company';
        entries.push({
          title,
          category,
          issuer: asTrimmedString(e.issuer, 120),
          achievedOn: coerceDate(e.achievedOn)?.toISOString() || null,
          description: asTrimmedString(e.description, 1000),
        });
      } else {
        // documents — metadata edits/creates only; rows NOT in the list stay
        // untouched so no file can ever be lost through self-service.
        const name = asTrimmedString(e.name, 160);
        if (!name) return { ok: false, error: 'Every document entry needs a name' };
        const type = asTrimmedString(e.type, 40) || 'other';
        entries.push({
          existingId: asTrimmedString(e.existingId, 40) || null,
          name,
          type,
          category: asTrimmedString(e.category, 40) || 'other',
          description: asTrimmedString(e.description, 500),
          expiryDate: coerceDate(e.expiryDate)?.toISOString() || null,
        });
      }
    }
    return { ok: true, payload: { entries } };
  }

  if (section === 'verification') {
    const payload: Record<string, unknown> = {};
    for (const key of VERIFICATION_FIELDS) {
      const value = asTrimmedString(input[key], key === 'note' || key === 'address' ? 500 : 120);
      if (value) payload[key] = value;
    }
    if (!payload.fullName) return { ok: false, error: 'Full name (as on the ID) is required' };
    if (!payload.idType) return { ok: false, error: 'ID type is required' };
    else if (!ID_TYPES.has(String(payload.idType))) return { ok: false, error: 'ID type must be one of: aadhaar, pan, passport, voter_id, driving_license, other' };
    if (!payload.idNumber) return { ok: false, error: 'ID number is required' };
    return { ok: true, payload };
  }

  // health
  const payload: Record<string, unknown> = {};
  for (const key of HEALTH_YES_NO_FIELDS) {
    const v = coerceYesNo(input[key]);
    if (v) payload[key] = v;
  }
  for (const key of HEALTH_TEXT_FIELDS) {
    const v = asTrimmedString(input[key], 500);
    if (v) payload[key] = v;
  }
  if (!Object.keys(payload).length) {
    return { ok: false, error: 'No health fields were changed — nothing to submit' };
  }
  return { ok: true, payload };
}

/** Current section state snapshot (stored as the request's oldValue). */
export async function snapshotProfileSection(
  db: Record<string, any>,
  employeeId: string,
  section: ProfileSectionKey,
): Promise<string> {
  try {
    if (section === 'experience') {
      const rows = await db.experience.findMany({ where: { employeeId }, orderBy: { startDate: 'desc' } });
      return JSON.stringify({ entries: rows });
    }
    if (section === 'achievements') {
      const rows = await db.employeeAchievement.findMany({ where: { employeeId }, orderBy: { createdAt: 'desc' } });
      return JSON.stringify({ entries: rows });
    }
    if (section === 'documents') {
      const rows = await db.document.findMany({ where: { employeeId }, orderBy: { uploadedAt: 'desc' } });
      return JSON.stringify({ entries: rows.map((r: Record<string, unknown>) => ({ ...r })) });
    }
    if (section === 'verification') {
      const emp = await db.employee.findUnique({ where: { id: employeeId }, select: { kycVerification: true } });
      return JSON.stringify({ current: emp?.kycVerification ? JSON.parse(emp.kycVerification) : null });
    }
    // health
    const fields = [...HEALTH_YES_NO_FIELDS, ...HEALTH_TEXT_FIELDS];
    const emp = await db.employee.findUnique({
      where: { id: employeeId },
      select: fields.reduce((acc, f) => ({ ...acc, [f]: true }), {} as Record<string, boolean>),
    });
    return JSON.stringify({ current: emp || {} });
  } catch {
    return JSON.stringify({ current: null });
  }
}

/**
 * Submit a section change — always pending approval (the employee's official
 * record is NEVER touched at submission time). Mirrors the HIGH-risk field
 * flow: duplicate pending check → workflow tiers → approval steps →
 * tier-1 + employee notifications.
 */
export async function submitProfileSectionChange(
  db: Record<string, any>,
  opts: {
    auth: RequesterAuth;
    employeeId: string;
    section: ProfileSectionKey;
    payloadText: string;
    reason?: string;
    origin?: string | null;
    req?: Request;
  },
): Promise<FieldChangeResult> {
  const { auth, employeeId, section } = opts;
  const meta = PROFILE_SECTION_REQUESTS[section];

  let parsed: unknown;
  try { parsed = JSON.parse(opts.payloadText); } catch {
    return { ok: false, status: 400, error: `${meta.label} payload must be valid JSON`, applied: false };
  }
  const clean = sanitizeSectionPayload(section, parsed);
  if (!clean.ok) return { ok: false, status: 400, error: clean.error, applied: false };

  const emp = await db.employee.findUnique({ where: { id: employeeId }, select: { id: true, firstName: true, lastName: true } });
  if (!emp) return { ok: false, status: 404, error: 'Employee not found', applied: false };

  // One pending section request at a time keeps the approval inbox clean.
  const existingPending = await (db as any).employeeUpdateRequest.findFirst({
    where: { employeeId, fieldName: section, status: 'pending' },
    orderBy: { requestedAt: 'desc' },
  }).catch(() => null);
  if (existingPending) {
    const submittedOn = existingPending.requestedAt
      ? new Date(existingPending.requestedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
      : 'recently';
    return {
      ok: false, status: 409, applied: false,
      error: `A ${meta.label} edit is already pending approval (submitted ${submittedOn}). Your details remain unchanged until it is approved — you can cancel it from Update Requests and submit a new one.`,
    };
  }

  const oldValue = await snapshotProfileSection(db, employeeId, section);
  const cleanReason = sanitizeMultiLineText(opts.reason, 500);
  const cleanNewValue = JSON.stringify(clean.payload);

  // Task 158 — the REAL request is required: ensureWorkflowConfig resolves the
  // tenant via getAuthInfo(req) (Bearer token), so a synthetic request would
  // report "workflow not configured" even when the tenant has a config row.
  const wfConfig = await ensureWorkflowConfig(db, opts.req || new Request('http://local/'), 'update_profile');
  if (!wfConfig?.tiers?.length) {
    return { ok: false, status: 409, error: 'Employee profile workflow is not configured for this tenant', applied: false };
  }
  const tiers: WorkflowTier[] = wfConfig.tiers;
  const configSnapshot = JSON.stringify({
    fieldSensitivity: { sensitivity: 'high', category: meta.category, label: `${meta.label} (section edit)` },
    workflowConfigId: wfConfig?.id || null,
    tiers,
  });

  const updateRequest = await db.employeeUpdateRequest.create({
    data: {
      employeeId, fieldName: section, fieldLabel: `${meta.label} (section edit)`, category: meta.category,
      oldValue, newValue: cleanNewValue, reason: cleanReason,
      status: 'pending', currentTier: 1,
      configSnapshot,
      requestedById: auth.userId,
      documentId: null,
    },
  });

  for (let i = 0; i < tiers.length; i += 1) {
    const step = tiers[i];
    let approverUserId: string | null = null;
    try {
      const resolved = await resolveTierApprovers(db, step, employeeId);
      approverUserId = resolved.userIds[0] || null;
    } catch { approverUserId = null; }
    if (!approverUserId && step.approverType === 'reporting_manager') {
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

  // Notifications — tier-1 approver (actionable) + submitting employee (receipt).
  try {
    const employeeName = `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || 'An employee';
    if (auth.tenantId) {
      const { dispatchNotification } = await import('@/lib/notification-center');
      const entity = { type: 'employee_update_request', id: updateRequest.id, link: '/employees/update-requests' };
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
            Field_Name: `${meta.label} (section edit)`,
            New_Value: `${meta.label} details submitted for review`,
            Critical: '',
          },
          entity,
          origin: opts.origin || undefined,
        });
      }
      await dispatchNotification({
        tenantId: auth.tenantId,
        module: 'core_hr',
        eventKey: 'core_hr.profile.update_submitted',
        recipients: [{ userId: auth.userId }],
        vars: {
          Employee_Name: employeeName,
          Field_Name: `${meta.label} (section edit)`,
          New_Value: `${meta.label} details submitted for review`,
          Requested_At: new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
        },
        entity,
        origin: opts.origin || undefined,
      });
    }
  } catch (e) {
    console.warn('[employee-update-request] section notification failed (non-fatal):', (e as Error).message);
  }

  return { ok: true, applied: false, request: updateRequest, message: `${meta.label} edit submitted for HR approval` };
}

/**
 * Apply an APPROVED section request to the official record. Called from the
 * approve route when the last tier signs off. Returns the count of entries
 * written (or fields, for health/verification).
 */
export async function applyProfileSectionChange(
  db: Record<string, any>,
  employeeId: string,
  section: ProfileSectionKey,
  payloadJson: string,
): Promise<{ applied: number }> {
  const parsed: unknown = JSON.parse(payloadJson); // request rows always store valid JSON
  const clean = sanitizeSectionPayload(section, parsed);
  if (!clean.ok) throw new Error(clean.error);
  const payload = clean.payload;

  if (section === 'experience') {
    const entries = payload.entries as Array<Record<string, unknown>>;
    await db.$transaction([
      db.experience.deleteMany({ where: { employeeId } }),
      db.experience.createMany({
        data: entries.map((e) => ({
          employeeId,
          company: String(e.company),
          designation: String(e.designation),
          startDate: new Date(String(e.startDate)),
          endDate: e.endDate ? new Date(String(e.endDate)) : null,
          isCurrent: Boolean(e.isCurrent),
          description: (e.description as string) || null,
        })),
      }),
    ]);
    return { applied: entries.length };
  }

  if (section === 'achievements') {
    const entries = payload.entries as Array<Record<string, unknown>>;
    await db.$transaction([
      db.employeeAchievement.deleteMany({ where: { employeeId } }),
      db.employeeAchievement.createMany({
        data: entries.map((e) => ({
          employeeId,
          title: String(e.title),
          category: String(e.category || 'previous_company'),
          issuer: (e.issuer as string) || null,
          achievedOn: e.achievedOn ? new Date(String(e.achievedOn)) : null,
          description: (e.description as string) || null,
        })),
      }),
    ]);
    return { applied: entries.length };
  }

  if (section === 'documents') {
    // Non-destructive: existing rows referenced in the payload are UPDATED,
    // new rows are CREATED, and rows the employee did not mention are left
    // untouched — files can never be lost through self-service.
    const entries = payload.entries as Array<Record<string, unknown>>;
    let applied = 0;
    for (const e of entries) {
      const data = {
        name: String(e.name),
        type: String(e.type || 'other'),
        category: String(e.category || 'other'),
        description: (e.description as string) || null,
        expiryDate: e.expiryDate ? new Date(String(e.expiryDate)) : null,
      };
      if (e.existingId) {
        const owned = await db.document.findFirst({ where: { id: String(e.existingId), employeeId }, select: { id: true } });
        if (owned) {
          await db.document.update({ where: { id: owned.id }, data });
          applied += 1;
        }
      } else {
        await db.document.create({ data: { employeeId, ...data, status: 'active' } });
        applied += 1;
      }
    }
    return { applied };
  }

  if (section === 'verification') {
    const emp = await db.employee.findUnique({ where: { id: employeeId }, select: { kycVerification: true } });
    let current: Record<string, unknown> = {};
    try { current = emp?.kycVerification ? JSON.parse(emp.kycVerification) : {}; } catch { current = {}; }
    const merged = {
      ...current,
      ...payload,
      status: 'pending',
      submittedBy: 'employee',
      submittedAt: new Date().toISOString(),
    };
    await db.employee.update({ where: { id: employeeId }, data: { kycVerification: JSON.stringify(merged) } });
    return { applied: Object.keys(payload).length };
  }

  // health — only the whitelisted keys the employee actually submitted.
  // Task 158: these fields are runtime-added TEXT columns that are NOT in the
  // generated Prisma schema — the app reads/writes them via raw SQL
  // (loadEmployeeProfileExtras / saveEmployeeProfileExtras). Ensure the
  // columns exist, then UPDATE through the same raw pattern.
  const { ensureEmployeeProfileColumns } = await import('@/lib/employee-profile-columns');
  await ensureEmployeeProfileColumns(db as unknown as Parameters<typeof ensureEmployeeProfileColumns>[0]);
  const data: Record<string, unknown> = { ...payload };
  const keys = Object.keys(data).filter((k) => HEALTH_COLUMN_RE.test(k));
  if (keys.length) {
    const sets = keys.map((k, i) => `"${k}" = $${i + 2}`).join(', ');
    const params: unknown[] = [employeeId, ...keys.map((k) => String(data[k] ?? null))];
    await db.$queryRawUnsafe(`UPDATE "Employee" SET ${sets}, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`, ...params);
  }
  return { applied: keys.length };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
