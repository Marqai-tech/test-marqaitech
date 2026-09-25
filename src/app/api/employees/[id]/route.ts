import { NextResponse } from 'next/server';
import { getDb, getPlatformDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { createNotification } from '@/lib/notifications';
import { sendEmail } from '@/lib/email-sender';
import type { PrismaClient } from '@prisma/client';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

/* ════════════════════════════════════════════════════════════════════
   Reporting Manager change — shared validation + notification helper
   Used by BOTH the focused PATCH (quick manager reassignment) and the
   full PUT (Edit Employee form). The reporting manager drives leave
   approvals, module notifications and the org chart, so every change
   is validated (same company, active, no self-reference, no cycle),
   audit-logged and announced to both the new manager and the employee.
   ════════════════════════════════════════════════════════════════════ */

type ManagerCheckResult = { ok: true; manager: { id: string; firstName: string; lastName: string; email: string; userId: string | null } | null } | { ok: false; error: string; status: number };

async function validateReportingManagerChange(
  db: PrismaClient,
  employee: { id: string; firstName: string; lastName: string; companyId: string | null },
  newManagerId: string | null | undefined
): Promise<ManagerCheckResult> {
  // Clearing the manager is always allowed
  if (!newManagerId) return { ok: true, manager: null };

  // Cannot report to yourself
  if (newManagerId === employee.id) {
    return { ok: false, error: 'An employee cannot be their own reporting manager', status: 400 };
  }

  let manager: { id: string; firstName: string; lastName: string; email: string; userId: string | null; status: string; companyId: string | null } | null = null;
  try {
    manager = await db.employee.findUnique({
      where: { id: newManagerId },
      select: { id: true, firstName: true, lastName: true, email: true, userId: true, status: true, companyId: true },
    });
  } catch {
    return { ok: false, error: 'Reporting manager lookup failed', status: 500 };
  }

  if (!manager) return { ok: false, error: 'Selected reporting manager was not found', status: 400 };
  if (manager.status && manager.status !== 'active') {
    return { ok: false, error: 'Selected reporting manager is not an active employee', status: 400 };
  }
  // Same-company rule (when both sides have a company)
  if (employee.companyId && manager.companyId && employee.companyId !== manager.companyId) {
    return { ok: false, error: 'Reporting manager must belong to the same company as the employee', status: 400 };
  }

  // Cycle guard: walk UP the new manager's chain — if we reach the employee
  // being edited, this assignment would create a reporting loop.
  try {
    let cursorId: string | null = newManagerId;
    const seen = new Set<string>();
    for (let depth = 0; depth < 25 && cursorId; depth++) {
      if (cursorId === employee.id) {
        return { ok: false, error: 'This assignment creates a reporting cycle (the manager already reports, directly or indirectly, to this employee)', status: 400 };
      }
      if (seen.has(cursorId)) break; // existing loop in data — stop walking
      seen.add(cursorId);
      const row: { reportingManagerId: string | null } | null = await db.employee.findUnique({
        where: { id: cursorId },
        select: { reportingManagerId: true },
      });
      cursorId = row?.reportingManagerId ?? null;
    }
  } catch { /* best-effort cycle check */ }

  return { ok: true, manager };
}

/** Announce a reporting-manager change: in-app bells + real emails + audit log. */
async function notifyReportingManagerChange(
  db: PrismaClient,
  opts: {
    tenantId?: string;
    actorUserId?: string;
    employee: { id: string; firstName: string; lastName: string; email: string; userId: string | null };
    oldManagerId: string | null;
    newManagerId: string | null;
    newManager?: { id: string; firstName: string; lastName: string; email: string; userId: string | null } | null;
    source: 'PATCH' | 'PUT';
  }
) {
  const { tenantId, employee, oldManagerId, newManagerId, newManager, source } = opts;
  if (oldManagerId === newManagerId) return; // nothing changed

  const empName = `${employee.firstName} ${employee.lastName}`.trim();

  // Resolve names for messages
  const nameOf = async (id: string | null | undefined) => {
    if (!id) return '—';
    try {
      const m = await db.employee.findUnique({ where: { id }, select: { firstName: true, lastName: true } });
      return m ? `${m.firstName} ${m.lastName}`.trim() : '—';
    } catch { return '—'; }
  };
  const oldName = await nameOf(oldManagerId);
  const newName = newManager ? `${newManager.firstName} ${newManager.lastName}`.trim() : await nameOf(newManagerId);

  // 1. Audit log (best-effort)
  try {
    await db.auditLog.create({
      data: {
        userId: opts.actorUserId || employee.userId || null,
        action: 'UPDATE_REPORTING_MANAGER',
        module: 'employees',
        details: `Reporting manager for ${empName} (${employee.id}) changed: ${oldName} → ${newName} (via ${source})`,
      },
    });
  } catch (e) {
    console.warn('[ReportingManager] audit log failed (non-critical):', e);
  }

  // 2. In-app notifications (tenant DB — bell icon)
  if (tenantId) {
    if (newManager?.userId) {
      await createNotification({
        tenantId,
        userId: newManager.userId,
        title: 'New team member assigned',
        message: `${empName} now reports to you as their reporting manager.`,
        type: 'info',
        category: 'workflow',
        link: '/employees',
      }).catch(() => null);
    }
    if (employee.userId) {
      await createNotification({
        tenantId,
        userId: employee.userId,
        title: 'Reporting manager updated',
        message: newManagerId ? `Your reporting manager is now ${newName}.` : 'Your reporting manager assignment has been cleared.',
        type: 'info',
        category: 'workflow',
        link: '/employees',
      }).catch(() => null);
    }
  }

  // 3. Real email via tenant SMTP / global fallback (best-effort, non-blocking)
  const brandRow = await (async () => {
    try { return await db.tenant.findFirst({ select: { name: true } }); } catch { return null; }
  })().catch(() => null);
  const brand = brandRow?.name || '3Boxes HRMS';
  const htmlWrap = (title: string, body: string) => `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px">
      <h2 style="color:#10b981;margin:0 0 12px">${title}</h2>
      <p style="color:#334155;font-size:14px;line-height:1.6">${body}</p>
      <p style="color:#94a3b8;font-size:11px;margin-top:24px">This is an automated notification from ${brand}.</p>
    </div>`;
  if (newManager?.email) {
    sendEmail({
      to: newManager.email,
      subject: `${empName} now reports to you`,
      html: htmlWrap('New team member assigned', `<strong>${empName}</strong> has been assigned to report to you. You will now receive their approvals and workflow requests.`),
      fromName: brand,
    }).catch(() => null);
  }
  if (employee.email && newManagerId) {
    sendEmail({
      to: employee.email,
      subject: `Your reporting manager is now ${newName}`,
      html: htmlWrap('Reporting manager updated', `Hi <strong>${empName}</strong>, your reporting manager has been updated${oldName !== '—' ? ` (was ${oldName})` : ''} and is now <strong>${newName}</strong>. Future approvals and workflows will be routed to them.`),
      fromName: brand,
    }).catch(() => null);
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

// Core includes that are guaranteed to exist in the Employee table
// NOTE: Employee has companyId but NO @relation to Company — it's a bare String field.
// We must NOT include `company` in the Prisma include clause.
// Company info is resolved separately via fetchOptionalRelations → companyMappings.
const coreInclude = {
  department: { include: { company: { select: { id: true, name: true, code: true } } } },
  designation: true,
  branch: { include: { company: { select: { id: true, name: true, code: true } } } },
  user: {
    select: { id: true, email: true, role: true, avatar: true },
  },
  // Reporting hierarchy — surfaced on the View Details page (Employment/Overview
  // tabs) so the assigned manager is always visible after add/edit.
  reportingManager: {
    select: {
      id: true, firstName: true, lastName: true, employeeId: true,
      designation: { select: { title: true } },
    },
  },
  _count: { select: { directReports: true } },
};

/**
 * Safely fetch optional relations for an employee.
 * Each relation is fetched independently so one failure doesn't break the rest.
 */
async function fetchOptionalRelations(db: PrismaClient, employeeId: string, companyId?: string | null) {
  const result: Record<string, unknown> = {};

  // Resolve company info from companyId (Employee.companyId is a bare String, not a relation)
  if (companyId) {
    try {
      result.company = await db.company.findUnique({
        where: { id: companyId },
        select: { id: true, name: true, code: true },
      });
    } catch (err) {
      console.warn(`[Employee GET] Failed to fetch company for ${companyId}:`, err instanceof Error ? err.message : err);
      result.company = null;
    }
  } else {
    result.company = null;
  }

  const optionalFetches: [string, () => Promise<unknown>][] = [
    ['leaveBalances', () => db.leaveBalance.findMany({
      where: { employeeId },
      include: { leaveType: true },
    })],
    ['dependents', () => db.dependent.findMany({ where: { employeeId } })],
    ['qualifications', () => db.qualification.findMany({ where: { employeeId } })],
    ['experiences', () => db.experience.findMany({ where: { employeeId } })],
    ['skills', () => {
      try {
        return (db as any).employeeSkill?.findMany?.({ where: { employeeId } }) ?? [];
      } catch { return []; }
    }],
    ['documents', () => db.document.findMany({ where: { employeeId } })],
    ['assetAssignments', () => db.assetAssignment.findMany({
      where: { employeeId },
      include: { asset: true },
    })],
    ['companyMappings', () => db.employeeCompanyMapping.findMany({
      where: { employeeId, status: 'active' },
      include: {
        company: { select: { id: true, name: true, code: true } },
        department: { select: { id: true, name: true } },
        designation: { select: { id: true, title: true } },
        branch: { select: { id: true, name: true } },
      },
      orderBy: { isPrimary: 'desc' },
    })],
  ];

  await Promise.allSettled(
    optionalFetches.map(async ([key, fetchFn]) => {
      try {
        result[key] = await fetchFn();
      } catch (err) {
        console.warn(`[Employee GET] Failed to fetch ${key} for ${employeeId}:`, err instanceof Error ? err.message : err);
        result[key] = []; // Default to empty array
      }
    })
  );

  return result;
}

/**
 * Resolve an employee ID to the actual database record.
 * Tries: 1) by CUID id → 2) by employeeId (e.g. "EMP001") → 3) by email
 */
async function findEmployee(db: PrismaClient, id: string) {
  // Strategy 1: by database id (CUID)
  try {
    const emp = await db.employee.findUnique({
      where: { id },
      include: coreInclude,
    });
    if (emp) return emp;
  } catch (err) {
    console.warn(`[Employee GET] findUnique by id failed, trying fallback:`, err instanceof Error ? err.message : err);
  }

  // Strategy 2: by employeeId (business key like "EMP001")
  try {
    const emp = await db.employee.findUnique({
      where: { employeeId: id },
      include: coreInclude,
    });
    if (emp) return emp;
  } catch {
    // continue
  }

  // Strategy 3: by email
  try {
    const emp = await db.employee.findFirst({
      where: { email: { equals: id, mode: 'insensitive' } },
      include: coreInclude,
    });
    if (emp) return emp;
  } catch {
    // continue
  }

  return null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = await getDb(request);
  try {
    const { id: rawId } = await params;
    const id = decodeURIComponent(rawId);

    console.log(`[Employee GET] Looking up employee: ${id}`);

    // ─── Inline schema-sync: ensure ALL Employee columns exist ───
    try {
      const syncStatements = [
        `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "avatar" TEXT`,
        `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "personalEmail" TEXT`,
        `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "employeeStatus" TEXT NOT NULL DEFAULT 'confirmed'`,
        `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "employeeType" TEXT NOT NULL DEFAULT 'full_time'`,
        `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "maritalStatus" TEXT`,
        `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "nationality" TEXT`,
        `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "address" TEXT`,
        `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "city" TEXT`,
        `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "state" TEXT`,
        `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "zipCode" TEXT`,
        `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "country" TEXT`,
        `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'active'`,
        `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "reportingManagerId" TEXT`,
        `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "designationId" TEXT`,
        `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "dateOfJoining" TIMESTAMP(3)`,
        `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "bloodGroup" TEXT`,
        `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "emergencyContactName" TEXT`,
        `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "emergencyContactPhone" TEXT`,
        `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "bankName" TEXT`,
        `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "bankAccountNo" TEXT`,
        `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "bankIfscCode" TEXT`,
        `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "panNumber" TEXT`,
        `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "aadhaarNumber" TEXT`,
        `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "taxId" TEXT`,
        `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "salary" DOUBLE PRECISION`,
        `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "salaryCurrency" TEXT NOT NULL DEFAULT 'INR'`,
        `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "leavePolicyId" TEXT`,
        `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "attendancePolicyId" TEXT`,
        `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "travelPolicyId" TEXT`,
        `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "salaryStructureId" TEXT`,
      ];
      for (const sql of syncStatements) {
        try { await db.$executeRawUnsafe(sql); } catch { /* column already exists */ }
      }
    } catch (syncErr) {
      console.warn('[Employee GET] Inline schema-sync failed (non-fatal):', syncErr);
    }

    try {
      // Step 1: Find the core employee record
      let employee = await findEmployee(db, id);

      if (!employee) {
        console.log(`[Employee GET] Employee not found after all strategies for: ${id}`);
        return NextResponse.json(
          { error: 'Employee not found', code: 'NOT_FOUND', searchedId: id },
          { status: 404, headers: corsHeaders() }
        );
      }

      // Step 2: Fetch optional relations independently (non-fatal if they fail)
      const optionalData = await fetchOptionalRelations(db, employee.id, employee.companyId);
      employee = { ...employee, ...optionalData };

      console.log(`[Employee GET] Found employee: ${employee.employeeId} (${employee.firstName} ${employee.lastName})`);
      return NextResponse.json(
        { employee },
        { headers: corsHeaders() }
      );
    } catch (dbError) {
      console.error('[Employee GET] DB query failed:', dbError);
      return NextResponse.json(
        { error: 'Service temporarily unavailable. Please try again.', code: 'DB_UNAVAILABLE', details: dbError instanceof Error ? dbError.message : String(dbError) },
        { status: 503, headers: corsHeaders() }
      );
    }
  } catch (error) {
    console.error('[Employee GET] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders() }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = await getDb(request);
  try {
    const { id: rawId } = await params;
    const id = decodeURIComponent(rawId);

    // ─── Inline schema-sync: ensure ALL Employee columns exist ───
    try {
      const syncStatements = [
        `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "avatar" TEXT`,
        `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "personalEmail" TEXT`,
        `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "employeeStatus" TEXT NOT NULL DEFAULT 'confirmed'`,
        `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "employeeType" TEXT NOT NULL DEFAULT 'full_time'`,
        `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "maritalStatus" TEXT`,
        `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "reportingManagerId" TEXT`,
        `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'active'`,
      ];
      for (const sql of syncStatements) {
        try { await db.$executeRawUnsafe(sql); } catch { /* column already exists */ }
      }
    } catch (syncErr) {
      console.warn('[Employee PUT] Inline schema-sync failed (non-fatal):', syncErr);
    }

    const body = await request.json();

    try {
      // Try to find employee by id first, then by employeeId
      let existingEmployee = await db.employee.findUnique({ where: { id } });
      if (!existingEmployee) {
        existingEmployee = await db.employee.findUnique({ where: { employeeId: id } });
      }

      if (!existingEmployee) {
        return NextResponse.json(
          { error: 'Employee not found' },
          { status: 404, headers: corsHeaders() }
        );
      }

      // ─── Task 72: Employee Data Lock check ───
      // If the tenant admin has locked employee data (via Employee Settings >
      // Lock Employee Data toggle), changes to employeeId, email, and
      // employment details are rejected with a clear error message.
      // The lock is stored in CollaborationSettings.employeeDataLocked.
      try {
        await db.$executeRawUnsafe(`ALTER TABLE "CollaborationSettings" ADD COLUMN IF NOT EXISTS "employeeDataLocked" BOOLEAN NOT NULL DEFAULT false`);
      } catch { /* column may already exist */ }
      const lockRows = await db.$queryRawUnsafe(`SELECT "employeeDataLocked" FROM "CollaborationSettings" LIMIT 1`).catch(() => []) as any[];
      const isLocked = lockRows?.[0]?.employeeDataLocked === true || lockRows?.[0]?.employeedatalocked === true;
      if (isLocked) {
        // Check if any locked fields are being changed
        const lockedFields = ['employeeId', 'email', 'departmentId', 'designationId', 'branchId', 'reportingManagerId', 'employeeType', 'employeeStatus', 'companyId', 'dateOfJoining', 'status'];
        const attemptedChanges = lockedFields.filter(f => body[f] !== undefined && body[f] !== (existingEmployee as any)[f]);
        if (attemptedChanges.length > 0) {
          return NextResponse.json(
            { error: `Employee data is locked by the tenant admin. The following fields cannot be changed: ${attemptedChanges.join(', ')}. Please unlock employee data in Employee Settings > Access & Permissions > Lock Employee Data to make changes.` },
            { status: 403, headers: corsHeaders() }
          );
        }
      }

      const actualId = existingEmployee.id;

      const {
        firstName, lastName, email, personalEmail, phone, departmentId, designationId,
        branchId, companyId, dateOfJoining, dateOfBirth, gender, maritalStatus,
        nationality, address, city, state, zipCode, country, bloodGroup,
        emergencyContactName, emergencyContactPhone, bankName, bankAccountNo,
        bankIfscCode, panNumber, aadhaarNumber, taxId, salary, salaryCurrency,
        status, role, avatar, reportingManagerId,
        employeeStatus, employeeType, employeeId,
        // Task 74: add missing fields that were silently dropped
        pfUAN, leavePolicyId, attendancePolicyId, travelPolicyId, salaryStructureId,
        healthInsuranceProvider, healthInsurancePolicyNo,
        primaryPhysicianName, primaryPhysicianPhone,
        hasChronicIllness, chronicIllnessDetails,
        hasAllergies, allergyDetails,
        hasDisability, disabilityDetails,
        isOnMedication, medicationDetails,
        hasHadSurgery, surgeryDetails,
        emergencyMedicalCondition,
      } = body;

      const updateData: Record<string, unknown> = {};
      // Task 71: allow updating employeeId when auto-generation is disabled
      if (employeeId !== undefined) updateData.employeeId = employeeId;
      if (firstName !== undefined) updateData.firstName = firstName;
      if (lastName !== undefined) updateData.lastName = lastName;
      if (email !== undefined) updateData.email = email;
      if (personalEmail !== undefined) updateData.personalEmail = personalEmail || null;
      if (phone !== undefined) updateData.phone = phone;
      if (employeeStatus !== undefined) updateData.employeeStatus = employeeStatus;
      if (employeeType !== undefined) updateData.employeeType = employeeType;
      if (departmentId !== undefined) updateData.departmentId = departmentId || undefined;
      if (designationId !== undefined) updateData.designationId = designationId || undefined;
      if (branchId !== undefined) updateData.branchId = branchId || null;
      if (companyId !== undefined) updateData.companyId = companyId || null;
      if (dateOfJoining !== undefined) updateData.dateOfJoining = new Date(dateOfJoining);
      if (dateOfBirth !== undefined) updateData.dateOfBirth = dateOfBirth ? new Date(dateOfBirth) : null;
      if (gender !== undefined) updateData.gender = gender;
      if (maritalStatus !== undefined) updateData.maritalStatus = maritalStatus;
      if (nationality !== undefined) updateData.nationality = nationality;
      if (address !== undefined) updateData.address = address;
      if (city !== undefined) updateData.city = city;
      if (state !== undefined) updateData.state = state;
      if (zipCode !== undefined) updateData.zipCode = zipCode;
      if (country !== undefined) updateData.country = country;
      if (bloodGroup !== undefined) updateData.bloodGroup = bloodGroup;
      if (emergencyContactName !== undefined) updateData.emergencyContactName = emergencyContactName;
      if (emergencyContactPhone !== undefined) updateData.emergencyContactPhone = emergencyContactPhone;
      if (bankName !== undefined) updateData.bankName = bankName;
      if (bankAccountNo !== undefined) updateData.bankAccountNo = bankAccountNo;
      if (bankIfscCode !== undefined) updateData.bankIfscCode = bankIfscCode;
      if (panNumber !== undefined) updateData.panNumber = panNumber;
      if (aadhaarNumber !== undefined) updateData.aadhaarNumber = aadhaarNumber;
      if (taxId !== undefined) updateData.taxId = taxId;
      if (salary !== undefined) updateData.salary = salary;
      if (salaryCurrency !== undefined) updateData.salaryCurrency = salaryCurrency;
      if (avatar !== undefined) updateData.avatar = avatar || null;
      if (status !== undefined) updateData.status = status;
      // Task 74: persist health + insurance + policy fields that were silently dropped
      if (pfUAN !== undefined) updateData.pfUAN = pfUAN || null;
      if (leavePolicyId !== undefined) updateData.leavePolicyId = leavePolicyId || null;
      if (attendancePolicyId !== undefined) updateData.attendancePolicyId = attendancePolicyId || null;
      if (travelPolicyId !== undefined) updateData.travelPolicyId = travelPolicyId || null;
      if (salaryStructureId !== undefined) updateData.salaryStructureId = salaryStructureId || null;
      if (healthInsuranceProvider !== undefined) updateData.healthInsuranceProvider = healthInsuranceProvider || null;
      if (healthInsurancePolicyNo !== undefined) updateData.healthInsurancePolicyNo = healthInsurancePolicyNo || null;
      if (primaryPhysicianName !== undefined) updateData.primaryPhysicianName = primaryPhysicianName || null;
      if (primaryPhysicianPhone !== undefined) updateData.primaryPhysicianPhone = primaryPhysicianPhone || null;
      if (hasChronicIllness !== undefined) updateData.hasChronicIllness = hasChronicIllness || null;
      if (chronicIllnessDetails !== undefined) updateData.chronicIllnessDetails = chronicIllnessDetails || null;
      if (hasAllergies !== undefined) updateData.hasAllergies = hasAllergies || null;
      if (allergyDetails !== undefined) updateData.allergyDetails = allergyDetails || null;
      if (hasDisability !== undefined) updateData.hasDisability = hasDisability || null;
      if (disabilityDetails !== undefined) updateData.disabilityDetails = disabilityDetails || null;
      if (isOnMedication !== undefined) updateData.isOnMedication = isOnMedication || null;
      if (medicationDetails !== undefined) updateData.medicationDetails = medicationDetails || null;
      if (hasHadSurgery !== undefined) updateData.hasHadSurgery = hasHadSurgery || null;
      if (surgeryDetails !== undefined) updateData.surgeryDetails = surgeryDetails || null;
      if (emergencyMedicalCondition !== undefined) updateData.emergencyMedicalCondition = emergencyMedicalCondition || null;

      // ─── Reporting manager (validated: same company, active, no self/cycle) ───
      let newManagerForNotify: { id: string; firstName: string; lastName: string; email: string; userId: string | null } | null = null;
      if (reportingManagerId !== undefined) {
        const check = await validateReportingManagerChange(db, existingEmployee, reportingManagerId || null);
        if (!check.ok) {
          return NextResponse.json({ error: check.error }, { status: check.status, headers: corsHeaders() });
        }
        updateData.reportingManagerId = reportingManagerId || null;
        newManagerForNotify = check.manager;
      }

      const employee = await db.employee.update({
        where: { id: actualId },
        data: updateData,
        include: coreInclude,
      });

      // ─── Task 73: Audit log — record all employment detail changes ───
      // Every time an admin edits an employee via PUT, we log each changed
      // field to the EmployeeUpdateRequest table with status='applied' (no
      // approval needed for admin-level changes). This creates a complete
      // history visible in the Edit Log report (/employees/edit-log).
      try {
        // Resolve the actor (who made the change)
        let actorUserId: string | null = null;
        let actorTenantId: string | null = null;
        try {
          const tok = getTokenFromHeaders(request);
          if (tok) { const d = await verifyToken(tok); if (d) { actorUserId = d.userId as string; actorTenantId = d.tenantId as string; } }
        } catch { /* best-effort */ }

        // Compact field-label map for audit entries
        const FIELD_LABELS: Record<string, { label: string; category: string }> = {
          employeeId:          { label: 'Employee ID',           category: 'system' },
          email:               { label: 'Official Email',        category: 'system' },
          firstName:           { label: 'First Name',            category: 'personal' },
          lastName:            { label: 'Last Name',              category: 'personal' },
          dateOfBirth:         { label: 'Date of Birth',          category: 'personal' },
          gender:              { label: 'Gender',                 category: 'personal' },
          maritalStatus:       { label: 'Marital Status',        category: 'personal' },
          nationality:         { label: 'Nationality',           category: 'personal' },
          departmentId:        { label: 'Department',            category: 'employment' },
          designationId:       { label: 'Designation',           category: 'employment' },
          branchId:            { label: 'Branch',                category: 'employment' },
          reportingManagerId:  { label: 'Reporting Manager',     category: 'employment' },
          employeeType:        { label: 'Employee Type',          category: 'employment' },
          employeeStatus:      { label: 'Employee Status',       category: 'employment' },
          companyId:           { label: 'Company',               category: 'employment' },
          dateOfJoining:       { label: 'Date of Joining',       category: 'employment' },
          status:              { label: 'Status',                category: 'employment' },
          phone:               { label: 'Phone Number',           category: 'contact' },
          personalEmail:       { label: 'Personal Email',         category: 'contact' },
          address:             { label: 'Address',                category: 'contact' },
          city:                { label: 'City',                   category: 'contact' },
          state:               { label: 'State',                  category: 'contact' },
          zipCode:             { label: 'ZIP Code',               category: 'contact' },
          country:             { label: 'Country',               category: 'contact' },
          bloodGroup:          { label: 'Blood Group',            category: 'personal' },
          emergencyContactName: { label: 'Emergency Contact Name', category: 'contact' },
          emergencyContactPhone: { label: 'Emergency Contact Phone', category: 'contact' },
          bankName:            { label: 'Bank Name',             category: 'financial' },
          bankAccountNo:       { label: 'Bank Account Number',  category: 'financial' },
          bankIfscCode:        { label: 'Bank IFSC Code',        category: 'financial' },
          panNumber:           { label: 'PAN Number',            category: 'kyc' },
          aadhaarNumber:       { label: 'Aadhaar Number',        category: 'kyc' },
          taxId:               { label: 'Tax ID',                category: 'kyc' },
          salary:              { label: 'Salary',                category: 'system' },
          salaryCurrency:      { label: 'Salary Currency',       category: 'system' },
          role:                { label: 'User Role',             category: 'system' },
        };

        // Resolve department/designation/branch names for readable old/new values
        let oldDeptName = existingEmployee.departmentId || '';
        let newDeptName = updateData.departmentId as string || '';
        let oldDesigName = existingEmployee.designationId || '';
        let newDesigName = updateData.designationId as string || '';
        let oldBranchName = existingEmployee.branchId || '';
        let newBranchName = updateData.branchId as string || '';
        let oldMgrName = existingEmployee.reportingManagerId || '';
        let newMgrName = updateData.reportingManagerId as string || '';
        try {
          if (oldDeptName || newDeptName) {
            const depts = await db.department.findMany({ where: { id: { in: [oldDeptName, newDeptName].filter(Boolean) } }, select: { id: true, name: true } });
            const m = new Map(depts.map(d => [d.id, d.name]));
            oldDeptName = m.get(oldDeptName) || oldDeptName;
            newDeptName = m.get(newDeptName) || newDeptName;
          }
          if (oldDesigName || newDesigName) {
            const desigs = await db.designation.findMany({ where: { id: { in: [oldDesigName, newDesigName].filter(Boolean) } }, select: { id: true, title: true } });
            const m = new Map(desigs.map(d => [d.id, d.title]));
            oldDesigName = m.get(oldDesigName) || oldDesigName;
            newDesigName = m.get(newDesigName) || newDesigName;
          }
          if (oldMgrName || newMgrName) {
            const mgrs = await db.employee.findMany({ where: { id: { in: [oldMgrName, newMgrName].filter(Boolean) } }, select: { id: true, firstName: true, lastName: true } });
            const m = new Map(mgrs.map(e => [e.id, `${e.firstName} ${e.lastName}`.trim()]));
            oldMgrName = m.get(oldMgrName) || oldMgrName;
            newMgrName = m.get(newMgrName) || newMgrName;
          }
        } catch { /* best-effort name resolution */ }

        // Map FK field IDs to resolved names for the audit log
        const resolveValue = (field: string, val: unknown): string => {
          if (val === null || val === undefined) return '';
          if (val instanceof Date) return val.toISOString().split('T')[0];
          const s = String(val);
          if (field === 'departmentId') return field === 'departmentId' && oldDeptName && s === String(existingEmployee.departmentId) ? oldDeptName : (s === String(updateData.departmentId) ? newDeptName : s);
          if (field === 'designationId') return field === 'designationId' && oldDesigName && s === String(existingEmployee.designationId) ? oldDesigName : (s === String(updateData.designationId) ? newDesigName : s);
          if (field === 'reportingManagerId') return field === 'reportingManagerId' && oldMgrName && s === String(existingEmployee.reportingManagerId) ? oldMgrName : (s === String(updateData.reportingManagerId) ? newMgrName : s);
          return s;
        };

        // For each field in updateData, compare with the old value and create an audit entry
        const auditEntries: Array<{ fieldName: string; fieldLabel: string; category: string; oldValue: string; newValue: string }> = [];
        for (const [field, newVal] of Object.entries(updateData)) {
          if (field === 'updatedAt' || field === 'avatar') continue;
          const meta = FIELD_LABELS[field];
          if (!meta) continue;
          const oldVal = (existingEmployee as Record<string, unknown>)[field];
          const oldStr = resolveValue(field, oldVal);
          const newStr = resolveValue(field, newVal);
          // Only log if the value actually changed
          if (oldStr !== newStr) {
            auditEntries.push({ fieldName: field, fieldLabel: meta.label, category: meta.category, oldValue: oldStr, newValue: newStr });
          }
        }

        // Create EmployeeUpdateRequest entries for each changed field
        if (auditEntries.length > 0 && actorTenantId) {
          for (const entry of auditEntries) {
            try {
              await db.employeeUpdateRequest.create({
                data: {
                  employeeId: actualId,
                  fieldName: entry.fieldName,
                  fieldLabel: entry.fieldLabel,
                  category: entry.category,
                  oldValue: entry.oldValue || '',
                  newValue: entry.newValue || '',
                  reason: `Admin edit via PUT /api/employees/[id]`,
                  status: 'applied',
                  currentTier: 0,
                  requestedById: actorUserId || 'system',
                  requestedAt: new Date(),
                  appliedAt: new Date(),
                  documentId: null,
                },
              }).catch(() => null); // non-critical — don't block the update if logging fails
            } catch { /* per-field — continue to next */ }
          }
          console.log(`[Employee PUT] Audit log: ${auditEntries.length} field change(s) logged for employee ${actualId}`);
        }
      } catch (auditErr) {
        console.warn('[Employee PUT] Audit logging failed (non-critical):', auditErr);
      }

      // ─── Announce reporting-manager change (bell + email + audit) ───
      if (reportingManagerId !== undefined) {
        let decodedActor: { userId?: string; tenantId?: string } = {};
        try {
          const tok = getTokenFromHeaders(request);
          if (tok) { const d = await verifyToken(tok); if (d) decodedActor = { userId: d.userId as string, tenantId: d.tenantId as string }; }
        } catch { /* best-effort identity */ }
        await notifyReportingManagerChange(db, {
          tenantId: decodedActor.tenantId,
          actorUserId: decodedActor.userId,
          employee: { id: employee.id, firstName: employee.firstName, lastName: employee.lastName, email: employee.email, userId: employee.userId },
          oldManagerId: existingEmployee.reportingManagerId ?? null,
          newManagerId: (employee as { reportingManagerId?: string | null }).reportingManagerId ?? null,
          newManager: newManagerForNotify,
          source: 'PUT',
        });
      }

      // ─── Sync email to the linked User account ───
      // When the employee's official email is updated, also update the linked
      // User record's email so login credentials stay in sync. Without this,
      // the credentials page shows the OLD user.email even after the employee
      // email was updated.
      if (email !== undefined && employee.userId) {
        try {
          // Update the User's email in the tenant DB
          await db.user.update({
            where: { id: employee.userId },
            data: { email },
          }).catch(() => null);

          // Also update in the platform DB (login checks platform DB first)
          const { getPlatformDb } = await import('@/lib/tenant-db');
          const platformDb = getPlatformDb();
          await platformDb.user.update({
            where: { id: employee.userId },
            data: { email },
          }).catch(() => null);

          // Also try to find and update by the OLD email in platform DB
          // (in case the User record exists with a different ID)
          if (existingEmployee.email && existingEmployee.email !== email) {
            const platformUserByEmail = await platformDb.user.findUnique({
              where: { email: existingEmployee.email },
              select: { id: true },
            }).catch(() => null);
            if (platformUserByEmail && platformUserByEmail.id !== employee.userId) {
              await platformDb.user.update({
                where: { id: platformUserByEmail.id },
                data: { email },
              }).catch(() => null);
            }
          }

          console.log(`[Employee PUT] Synced email update for user ${employee.userId}: ${existingEmployee.email} → ${email}`);
        } catch (syncErr) {
          console.error('[Employee PUT] Failed to sync email to User account (non-critical):', syncErr);
        }
      }

      // ─── Update User role if provided ───
      if (role !== undefined && employee.userId) {
        try {
          const effectiveRole = role || 'employee';
          console.log(`[Employee PUT] Updating role for user ${employee.userId} to: ${effectiveRole}`);
          await db.user.update({
            where: { id: employee.userId },
            data: { role: effectiveRole },
          });

          // Also update UserRoleAssignment if a Role record exists
          try {
            const roleRecord = await db.role.findFirst({
              where: {
                OR: [
                  { key: effectiveRole },
                  { name: { equals: effectiveRole, mode: 'insensitive' } },
                ],
              },
            });
            if (roleRecord) {
              await db.userRoleAssignment.deleteMany({
                where: { userId: employee.userId },
              });
              await db.userRoleAssignment.create({
                data: {
                  userId: employee.userId,
                  roleId: roleRecord.id,
                  companyId: employee.companyId || null,
                },
              });
            }
          } catch (roleAssignErr) {
            console.warn('[Employee PUT] Role assignment update failed (non-critical):', roleAssignErr);
          }

          // Re-fetch employee with updated user role for the response
          const updatedEmployee = await db.employee.findUnique({
            where: { id: actualId },
            include: coreInclude,
          });
          if (updatedEmployee) {
            // Try audit log (non-critical)
            try {
              const token = getTokenFromHeaders(request);
              if (token) {
                const decoded = await verifyToken(token);
                if (decoded) {
                  await db.auditLog.create({
                    data: {
                      userId: decoded.userId as string,
                      action: 'UPDATE_EMPLOYEE',
                      module: 'employees',
                      details: `Updated employee ${employee.employeeId} (role: ${effectiveRole})`,
                    },
                  });
                }
              }
            } catch { /* non-critical */ }

            return NextResponse.json({ employee: updatedEmployee }, { headers: corsHeaders() });
          }
        } catch (roleUpdateErr) {
          console.error('[Employee PUT] Failed to update user role (non-critical):', roleUpdateErr);
        }
      }

      // ─── Auto-create/update probation review if employeeStatus changed to 'probation' ───
      if (employeeStatus === 'probation' && existingEmployee.employeeStatus !== 'probation') {
        // Status changed TO probation — create a probation review
        try {
          const doj = dateOfJoining || existingEmployee.dateOfJoining;
          if (doj) {
            // Check if a probation review already exists
            const existingReview = await db.performanceReview.findFirst({
              where: { employeeId: actualId, reviewCycle: 'Probation' },
            });

            if (!existingReview) {
              // Calculate end date from body.probationEndDate or default 6 months
              let endDate: Date;
              if (body.probationEndDate) {
                endDate = new Date(body.probationEndDate);
              } else {
                endDate = new Date(doj);
                endDate.setMonth(endDate.getMonth() + 6);
              }

              const startDate = new Date(doj);
              const probPeriodMs = endDate.getTime() - startDate.getTime();
              const probPeriodMonths = Math.round(probPeriodMs / (1000 * 60 * 60 * 24 * 30));

              const probationData = JSON.stringify({
                probationStartDate: doj instanceof Date ? doj.toISOString().split('T')[0] : doj,
                probationEndDate: endDate.toISOString().split('T')[0],
                probationPeriod: probPeriodMonths || 6,
                extensionPeriod: 0,
                performanceRating: 0,
                reviewComments: 'Auto-created from employee edit. Status changed to Probation.',
                kpiStatus: 'pending',
                decision: 'pending',
                effectiveDate: endDate.toISOString().split('T')[0],
                autoCreated: true,
                workflowStage: 'hr_review',
                alertSent10Day: false,
                alertSent3Day: false,
                alertSent1Day: false,
                alertSentOverdue: false,
              });

              await db.performanceReview.create({
                data: {
                  employeeId: actualId,
                  reviewCycle: 'Probation',
                  reviewPeriod: `Probation (${probPeriodMonths || 6} months)`,
                  rating: 0,
                  overallRating: 0,
                  comments: probationData,
                  status: 'pending',
                  reviewDate: endDate,
                },
              }).catch(() => null);

              console.log(`[Employee PUT] Auto-created probation review for ${actualId} (end: ${endDate.toISOString().split('T')[0]})`);
            }
          }
        } catch (probErr) {
          console.error('[Employee PUT] Auto-probation creation failed (non-critical):', probErr);
        }
      } else if (employeeStatus && employeeStatus !== 'probation' && existingEmployee.employeeStatus === 'probation') {
        // Status changed FROM probation to something else — update the probation review status
        try {
          await db.performanceReview.updateMany({
            where: { employeeId: actualId, reviewCycle: 'Probation', status: 'pending' },
            data: { status: employeeStatus === 'confirmed' ? 'completed' : 'rejected' },
          }).catch(() => null);
        } catch { /* non-critical */ }
      }

      // Try audit log (non-critical)
      try {
        const token = getTokenFromHeaders(request);
        if (token) {
          const decoded = await verifyToken(token);
          if (decoded) {
            await db.auditLog.create({
              data: {
                userId: decoded.userId as string,
                action: 'UPDATE_EMPLOYEE',
                module: 'employees',
                details: `Updated employee ${employee.employeeId}`,
              },
            });
          }
        }
      } catch { /* non-critical */ }

      return NextResponse.json(
        { employee },
        { headers: corsHeaders() }
      );
    } catch (dbError) {
      console.error('[Employee PUT] DB update failed:', dbError);
      return NextResponse.json(
        { error: 'Failed to update employee' },
        { status: 500, headers: corsHeaders() }
      );
    }
  } catch (error) {
    console.error('[Employee PUT] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders() }
    );
  }
}

/* ════════════════════════════════════════════════════════════════════
   PATCH /api/employees/[id] — focused reporting-manager reassignment
   (admin-only). Body: { reportingManagerId: string | null }

   This is the quick "change manager" action used by the Edit Employee
   modal on the Employees page. The reporting manager drives:
     • Leave approvals (leave.applied → approver = reporting manager)
     • All module notification/email routing for workflows
     • The automatic org chart (/org-chart builds from this field)
   Every change is validated (exists, active, same company, no self or
   cycle), audit-logged, and announced to BOTH the new manager and the
   employee via in-app bell + real email.
   ════════════════════════════════════════════════════════════════════ */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = await getDb(request);
  try {
    // ─── Admin-only gate ───
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });
    const callerRole = (decoded.role as string) || '';
    const adminRoles = ['super_admin', 'tenant_admin', 'admin', 'hr_admin', 'company_hr_admin', 'hrhead'];
    if (!adminRoles.includes(callerRole)) {
      return NextResponse.json({ error: 'Only admins can update the reporting manager' }, { status: 403, headers: corsHeaders() });
    }

    const { id: rawId } = await params;
    const id = decodeURIComponent(rawId);

    // Ensure the column exists (defensive, mirrors PUT/POST schema-sync)
    try {
      await db.$executeRawUnsafe(`ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "reportingManagerId" TEXT`);
    } catch { /* column already exists */ }

    const body = await request.json().catch(() => ({}));
    const { reportingManagerId } = body;
    if (reportingManagerId === undefined) {
      return NextResponse.json({ error: 'reportingManagerId is required (string employee id or null to clear)' }, { status: 400, headers: corsHeaders() });
    }

    // Resolve the employee (same strategies as GET)
    let existingEmployee = await db.employee.findUnique({ where: { id } });
    if (!existingEmployee) {
      existingEmployee = await db.employee.findUnique({ where: { employeeId: id } });
    }
    if (!existingEmployee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404, headers: corsHeaders() });
    }

    // Validate the new assignment
    const check = await validateReportingManagerChange(db, existingEmployee, reportingManagerId || null);
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: check.status, headers: corsHeaders() });
    }

    const updated = await db.employee.update({
      where: { id: existingEmployee.id },
      data: { reportingManagerId: reportingManagerId || null },
      include: coreInclude,
    });

    // Announce (bell + email + audit) — only fires when the value actually changed
    await notifyReportingManagerChange(db, {
      tenantId: decoded.tenantId as string | undefined,
      actorUserId: decoded.userId as string | undefined,
      employee: { id: updated.id, firstName: updated.firstName, lastName: updated.lastName, email: updated.email, userId: updated.userId },
      oldManagerId: existingEmployee.reportingManagerId ?? null,
      newManagerId: (updated as { reportingManagerId?: string | null }).reportingManagerId ?? null,
      newManager: check.manager,
      source: 'PATCH',
    });

    return NextResponse.json({
      success: true,
      message: (reportingManagerId ? 'Reporting manager updated' : 'Reporting manager cleared') + '. Manager and employee have been notified.',
      employee: {
        id: updated.id,
        firstName: updated.firstName,
        lastName: updated.lastName,
        email: updated.email,
        reportingManagerId: (updated as { reportingManagerId?: string | null }).reportingManagerId ?? null,
      },
    }, { headers: corsHeaders() });
  } catch (error) {
    console.error('[Employee PATCH] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders() }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = await getDb(request);
  try {
    const { id: rawId } = await params;
    const id = decodeURIComponent(rawId);

    try {
      let existingEmployee = await db.employee.findUnique({ where: { id } });
      if (!existingEmployee) {
        existingEmployee = await db.employee.findUnique({ where: { employeeId: id } });
      }

      if (!existingEmployee) {
        return NextResponse.json(
          { error: 'Employee not found' },
          { status: 404, headers: corsHeaders() }
        );
      }

      const actualId = existingEmployee.id;

      const employee = await db.employee.update({
        where: { id: actualId },
        data: { status: 'terminated' },
      });

      try {
        const token = getTokenFromHeaders(request);
        if (token) {
          const decoded = await verifyToken(token);
          if (decoded) {
            await db.auditLog.create({
              data: {
                userId: decoded.userId as string,
                action: 'DELETE_EMPLOYEE',
                module: 'employees',
                details: `Soft deleted (terminated) employee ${employee.employeeId}`,
              },
            });
          }
        }
      } catch { /* non-critical */ }

      return NextResponse.json(
        { message: 'Employee terminated successfully', employee },
        { headers: corsHeaders() }
      );
    } catch (dbError) {
      console.error('[Employee DELETE] DB delete failed:', dbError);
      return NextResponse.json(
        { error: 'Failed to delete employee' },
        { status: 500, headers: corsHeaders() }
      );
    }
  } catch (error) {
    console.error('[Employee DELETE] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders() }
    );
  }
}
