/**
 * /api/preboarding/brd/employee-creation — BRD Section 6.
 * "Employee Creation / Convert Candidate to Employee" — the bridge between
 * Preboarding and Onboarding.
 *
 * GET  ?candidateId=<id>
 *        → Sections A–E auto-populated (candidate info, employment info +
 *          department/designation/manager options, payroll info, access,
 *          joining checklist mapping) + BRD 6.3 validation results.
 *
 * POST { candidateId, employment: {...}, action: 'validate' | 'create' }
 *        validate → runs BRD 6.3 business rules, returns pass/fail per rule.
 *        create   → re-validates, then creates the provisional Employee row
 *                   (same semantics as Mark Joined: PROV-XXXXXXXX temporary
 *                   code; formal MarqNNN issued at BGV approval) in one
 *                   transaction-like sequence, links PreboardingCandidate,
 *                   audits CREATE_EMPLOYEE_FROM_PREBOARDING.
 *
 * BRD 6.3 golden rule: one candidate identity → one employee record; no
 * partial records (employee + link + audit happen atomically best-effort).
 *
 * Auth: HR/admin roles.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { getTokenFromHeaders, verifyToken } from '@/lib/auth';
import { HR_ROLES, parsePortalDetails, notifyCandidate, audit, ensurePreboardingId } from '@/lib/preboarding';
import { sendConfiguredEmail } from '@/lib/configured-email';
import { resolveEmployeeCompanyId } from '@/lib/employee-company';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS });
}

async function loadFull(db: any, candidateId: string) {
  const pbRows = await db.$queryRawUnsafe(`SELECT * FROM "PreboardingCandidate" WHERE "id"=$1 LIMIT 1`, candidateId).catch(() => []) as any[];
  if (!pbRows.length) return null;
  const pb = pbRows[0];
  const docs = await db.$queryRawUnsafe(
    `SELECT "documentType","documentLabel","status" FROM "OnboardingDocument" WHERE "preboardingCandidateId"=$1`, candidateId,
  ).catch(() => []) as any[];
  return { pb, docs };
}

export async function GET(req: NextRequest) {
  const db = await getDb(req);
  try {
    const token = getTokenFromHeaders(req);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
    const decoded = await verifyToken(token).catch(() => null);
    if (!decoded || !HR_ROLES.includes(String(decoded.role || ''))) {
      return NextResponse.json({ error: 'Forbidden — HR/Admin access only' }, { status: 403, headers: CORS });
    }
    const candidateId = new URL(req.url).searchParams.get('candidateId');
    if (!candidateId) return NextResponse.json({ error: 'candidateId required' }, { status: 400, headers: CORS });

    const loaded = await loadFull(db, candidateId);
    if (!loaded) return NextResponse.json({ error: 'Preboarding candidate not found' }, { status: 404, headers: CORS });
    const { pb, docs } = loaded;
    const details = parsePortalDetails(pb.portalDetails);
    const preboardingId = await ensurePreboardingId(db, pb);
    if (pb.backgroundCheckStatus !== 'cleared') {
      return NextResponse.json({ error: 'Employee conversion is allowed only after BGV is passed.' }, { status: 409, headers: CORS });
    }

    const departments = await db.$queryRawUnsafe(`SELECT id, name FROM "Department" ORDER BY name ASC LIMIT 100`).catch(() => []) as any[];
    const designations = await db.$queryRawUnsafe(`SELECT id, title FROM "Designation" ORDER BY title ASC LIMIT 200`).catch(() => []) as any[];
    const managers = await db.$queryRawUnsafe(`SELECT id, "firstName", "lastName", "employeeId" FROM "Employee" ORDER BY "firstName" ASC LIMIT 200`).catch(() => []) as any[];

    // ─── BRD 6.3 validation results (live) ───
    const validations = [
      { rule: 'Candidate must have an accepted offer', ok: true, detail: 'Offer accepted at convert-to-draft' },
      { rule: 'Preboarding record must be linked', ok: true, detail: preboardingId },
      { rule: 'Actual joining date must be confirmed', ok: Boolean(pb.joiningConfirmed), detail: pb.joiningConfirmedAt ? String(pb.joiningConfirmedAt).slice(0, 10) : 'Not confirmed — use Joining Formalities' },
      { rule: 'Required employee details must be verified', ok: Boolean(details.personal?.firstName), detail: details.personal?.firstName ? 'Portal personal details submitted' : 'Portal details not submitted yet' },
      { rule: 'Mandatory documents approved', ok: docs.length > 0 && docs.every((d: any) => d.status === 'approved'), detail: `${docs.filter((d: any) => d.status === 'approved').length}/${docs.length} approved` },
      { rule: 'Existing employee duplication must be checked', ok: !pb.employeeId, detail: pb.employeeId ? `Employee already exists (${pb.employeeId})` : 'No duplicate employee record' },
      { rule: 'Company and department must be valid and active', ok: Boolean(pb.departmentId), detail: pb.departmentId ? 'Department assigned' : 'Department not assigned' },
      { rule: 'Reporting Manager must be an eligible employee', ok: Boolean(pb.reportingManagerId), detail: pb.reportingManagerId ? 'Assigned' : 'Not assigned' },
    ];

    // Resolve the formal employee code (MarqNNN) when a record already exists
    let linkedCode: string | null = null;
    if (pb.employeeId) {
      try {
        const codeRows = await db.$queryRawUnsafe(`SELECT "employeeId" FROM "Employee" WHERE "id"=$1 LIMIT 1`, pb.employeeId) as any[];
        linkedCode = codeRows[0]?.employeeId || null;
      } catch { /* advisory only */ }
    }

    return NextResponse.json({
      sectionA: {
        preboardingId,
        candidateId: pb.offerId || null,
        fullName: pb.candidateName,
        personalEmail: pb.candidateEmail,
        mobileNumber: pb.candidatePhone || null,
        dateOfBirth: details.personal?.dateOfBirth || null,
        currentAddress: [details.address?.currentAddressLine1, details.address?.currentCity, details.address?.currentState, details.address?.currentPincode].filter(Boolean).join(', ') || details.address?.permanentAddressLine1 || null,
        permanentAddress: [details.address?.permanentAddressLine1, details.address?.permanentCity, details.address?.permanentState, details.address?.permanentPincode].filter(Boolean).join(', ') || null,
        emergencyContact: details.family?.emergencyContactName ? `${details.family.emergencyContactName} (${details.family.emergencyContactRelation || '—'}) ${details.family.emergencyContactMobile || ''}` : null,
      },
      sectionB: {
        // Employee ID — generated on create (PROV-XXXXXXXX provisional; MarqNNN at BGV approval)
        departmentId: pb.departmentId || null,
        designationId: pb.designationId || null,
        reportingManagerId: pb.reportingManagerId || null,
        employmentType: pb.employmentType || 'full_time',
        dateOfJoining: pb.actualJoiningDate || pb.joiningDate || pb.startDate || null,
        workLocation: pb.workLocation || null,
        workMode: pb.workMode || 'office',
        employeeStatus: 'probation',
        confirmationDueDate: null,
        options: {
          departments: departments.map((d: any) => ({ id: d.id, name: d.name })),
          designations: designations.map((d: any) => ({ id: d.id, title: d.title })),
          managers: managers.map((m: any) => ({ id: m.id, name: [m.firstName, m.lastName].filter(Boolean).join(' '), employeeId: m.employeeId })),
        },
      },
      sectionC: {
        annualCtc: pb.ctc ?? pb.offeredSalary ?? null,
        currency: pb.currency || 'INR',
        bankDetails: details.bank ? {
          accountHolderName: details.bank.accountHolderName || null,
          bankName: details.bank.bankName || null,
          accountNumber: details.bank.accountNumber ? `••••${String(details.bank.accountNumber).slice(-4)}` : null, // masked in UI per BRD 5.7
          ifscCode: details.bank.ifscCode || null,
          panNumber: details.bank.panNumber || null,
        } : null,
      },
      sectionD: {
        companyEmail: pb.companyEmail || null,
        loginActivation: 'On employee creation the system generates the Employee ID (MarqNNN), activates the company email login and emails the temporary password to the candidate.',
      },
      sectionE: {
        documents: docs.map((d: any) => ({ type: d.documentType, label: d.documentLabel, status: d.status })),
      },
      validations,
      employeeExists: Boolean(pb.employeeId),
      linkedEmployeeId: pb.employeeId || null,
      linkedEmployeeCode: linkedCode,
      joiningConfirmed: Boolean(pb.joiningConfirmed),
    }, { headers: CORS });
  } catch (error) {
    console.error('[preboarding/brd/employee-creation] GET failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}

export async function POST(req: NextRequest) {
  const db = await getDb(req);
  try {
    const token = getTokenFromHeaders(req);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
    const decoded = await verifyToken(token).catch(() => null);
    if (!decoded || !HR_ROLES.includes(String(decoded.role || ''))) {
      return NextResponse.json({ error: 'Forbidden — HR/Admin access only' }, { status: 403, headers: CORS });
    }

    const body = await req.json().catch(() => ({}));
    const candidateId = String(body.candidateId || '');
    const action = String(body.action || 'validate');
    if (!candidateId) return NextResponse.json({ error: 'candidateId required' }, { status: 400, headers: CORS });

    const loaded = await loadFull(db, candidateId);
    if (!loaded) return NextResponse.json({ error: 'Preboarding candidate not found' }, { status: 404, headers: CORS });
    const { pb, docs } = loaded;
    const details = parsePortalDetails(pb.portalDetails);
    const preboardingId = await ensurePreboardingId(db, pb);
    const employment = body.employment || {};
    const deptId = employment.departmentId || pb.departmentId || null;
    const desigId = employment.designationId || pb.designationId || null;
    const mgrId = employment.reportingManagerId || pb.reportingManagerId || null;
    const doj = employment.dateOfJoining || pb.actualJoiningDate || pb.joiningDate || pb.startDate || null;

    // ─── BRD 6.3 business rules (hard) ───
    const errors: string[] = [];
    if (!pb.joiningConfirmed && !doj) errors.push('Actual joining date must be confirmed (BRD 6.3 rule 3)');
    if (!deptId) errors.push('Department must be valid and active (BRD 6.3 rule 7)');
    if (!desigId) errors.push('Designation must be selected');
    if (pb.employeeId) errors.push(`Existing employee duplication: record ${pb.employeeId} already linked (BRD 6.3 rule 6)`);
    if (docs.length > 0 && !docs.every((d: any) => d.status === 'approved')) {
      const pending = docs.filter((d: any) => d.status !== 'approved').map((d: any) => d.documentLabel);
      errors.push(`Mandatory documents not approved: ${pending.join(', ')}`);
    }
    if (errors.length) {
      return NextResponse.json({ error: 'Validation failed (BRD 6.3)', errors, canCreate: false }, { status: action === 'validate' ? 200 : 409, headers: CORS });
    }

    if (action === 'validate') {
      return NextResponse.json({ message: 'All BRD 6.3 validations passed.', canCreate: true, validationsPassed: true }, { headers: CORS });
    }

    // ─── action === 'create' ───
    // 2026-11: since the GET gate requires BGV cleared, creation now issues the
    // FORMAL employee code (MarqNNN) directly, provisions the login (User +
    // temporary password) and activates the employee — HR sees exactly what was
    // assigned: company email, login details and Employee ID.
    const nameParts = String(pb.candidateName || '').trim().split(/\s+/);
    const firstName = employment.firstName || nameParts[0] || pb.candidateName;
    const lastName = employment.lastName || nameParts.slice(1).join(' ') || nameParts[0];

    // HR-assigned company email (Section D) — falls back to the stored
    // companyEmail, then the personal email so the login always works.
    const requestedCompanyEmail = String(employment.companyEmail || '').trim().toLowerCase();
    if (requestedCompanyEmail && requestedCompanyEmail !== String(pb.companyEmail || '').toLowerCase()) {
      await db.$executeRawUnsafe(`UPDATE "PreboardingCandidate" SET "companyEmail"=$1,"updatedAt"=NOW() WHERE "id"=$2`, requestedCompanyEmail, candidateId).catch(() => 0);
      pb.companyEmail = requestedCompanyEmail;
    }
    const userEmail = (pb.companyEmail || pb.candidateEmail || '').toLowerCase();

    // ─── Sequential formal employee code (MarqNNN) ───
    let empCode = 'Marq001';
    try {
      const existingCodes = await db.$queryRawUnsafe(
        `SELECT "employeeId" FROM "Employee"
         WHERE "employeeId" ~ '^Marq[0-9]+$'
         ORDER BY CAST(SUBSTRING("employeeId" FROM 'Marq([0-9]+)') AS INTEGER) DESC
         LIMIT 1`,
      ) as any[];
      if (existingCodes.length > 0 && existingCodes[0]?.employeeId) {
        const match = existingCodes[0].employeeId.match(/^Marq(\d+)$/i);
        if (match) { const next = parseInt(match[1], 10) + 1; empCode = `Marq${next < 1000 ? String(next).padStart(3, '0') : String(next)}`; }
      }
    } catch { /* keep default */ }

    // ─── Provision the login: create or upgrade the User row ───
    const temporaryPassword = `Marq!${Math.random().toString(36).slice(2, 10)}A1!`;
    const { hashPassword } = await import('@/lib/auth');
    const hashedPassword = await hashPassword(temporaryPassword);
    const userRow = await db.$queryRawUnsafe(`SELECT "id" FROM "User" WHERE "email"=$1 LIMIT 1`, userEmail).catch(() => []) as any[];
    let userId: string;
    if (userRow.length > 0) {
      userId = userRow[0].id;
      await db.$executeRawUnsafe(
        `UPDATE "User" SET "password"=$1, "role"='employee', "status"='active', "updatedAt"=NOW() WHERE "id"=$2`,
        hashedPassword, userId,
      ).catch(() => 0);
    } else {
      const newUserId = `usr-ec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await db.$executeRawUnsafe(
        `INSERT INTO "User" ("id","email","password","name","role","status","tenantId","createdAt","updatedAt")
         VALUES ($1,$2,$3,$4,'employee','active',$5,NOW(),NOW())`,
        newUserId, userEmail, hashedPassword, pb.candidateName || firstName,
        String((decoded as any).tenantId || '') || null,
      ).catch((e: any) => { throw new Error(`User create failed: ${e.message}`); });
      userId = newUserId;
    }

    const empId = `emp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const jDate = doj ? new Date(doj) : new Date();

    // Validate FK references exist before insert (additive-safe)
    if (deptId) { const d = await db.$queryRawUnsafe(`SELECT 1 FROM "Department" WHERE id=$1 LIMIT 1`, deptId) as any[]; if (!d.length) throw new Error(`Department ${deptId} does not exist`); }
    if (desigId) { const d = await db.$queryRawUnsafe(`SELECT 1 FROM "Designation" WHERE id=$1 LIMIT 1`, desigId) as any[]; if (!d.length) throw new Error(`Designation ${desigId} does not exist`); }
    if (mgrId) { const d = await db.$queryRawUnsafe(`SELECT 1 FROM "Employee" WHERE id=$1 LIMIT 1`, mgrId) as any[]; if (!d.length) throw new Error(`Reporting manager ${mgrId} does not exist`); }

    // ─── Resolve companyId (department → manager → first active company) ───
    // Without it the employee list (scoped by companyId when HR has a company
    // selected) does not show the freshly created employee.
    const companyId = await resolveEmployeeCompanyId(db, deptId, mgrId);

    // Runtime column safety (preboardingCandidateId is a schema-sync column).
    await db.$executeRawUnsafe(`ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "preboardingCandidateId" TEXT`).catch(() => 0);

    // ─── Auto-populate the employee profile from the candidate's submitted
    //     portal details + recruitment profile. The new hire's HRMS profile is
    //     filled on day one; they only complete what is still missing. ───
    const personal = details.personal || {};
    const address = details.address || {};
    const family = details.family || {};
    const bank = details.bank || {};
    const permanentAddress = [address.permanentAddressLine1, address.permanentAddressLine2].filter(Boolean).join(', ') || null;
    const nullIfEmpty = (v: unknown) => (v === null || v === undefined || String(v).trim() === '' ? null : v);

    await db.$executeRawUnsafe(
      `INSERT INTO "Employee" ("id", "employeeId", "firstName", "lastName", "email", "phone",
                                "userId", "companyId", "departmentId", "designationId", "reportingManagerId",
                                "dateOfJoining", "employeeStatus", "employeeType", "workMode",
                                "status", "credentialsStatus",
                                "personalEmail", "dateOfBirth", "gender", "maritalStatus", "nationality",
                                "address", "city", "state", "zipCode", "country",
                                "emergencyContactName", "emergencyContactPhone",
                                "bankName", "bankAccountNo", "bankIfscCode", "panNumber",
                                "preboardingCandidateId",
                                "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6,
               $7, $8, $9, $10, $11,
               $12, 'probation', $13, $14,
               'active', 'active',
               $15, $16, $17, $18, $19,
               $20, $21, $22, $23, $24,
               $25, $26,
               $27, $28, $29, $30,
               $31,
               NOW(), NOW())`,
      empId, empCode, personal.firstName || firstName, personal.lastName || lastName, userEmail, pb.candidatePhone || personal.mobileNumber || null,
      userId, companyId, deptId, desigId, mgrId,
      jDate,
      employment.employmentType || pb.employmentType || 'full_time',
      employment.workMode || pb.workMode || 'office',
      pb.candidateEmail,
      nullIfEmpty(personal.dateOfBirth) ? new Date(personal.dateOfBirth) : null,
      nullIfEmpty(personal.gender),
      nullIfEmpty(personal.maritalStatus),
      nullIfEmpty(personal.nationality),
      permanentAddress,
      nullIfEmpty(address.permanentCity),
      nullIfEmpty(address.permanentState),
      nullIfEmpty(address.permanentPincode),
      nullIfEmpty(address.permanentCountry),
      nullIfEmpty(family.emergencyContactName),
      nullIfEmpty(family.emergencyContactMobile),
      nullIfEmpty(bank.bankName),
      nullIfEmpty(bank.accountNumber),
      nullIfEmpty(bank.ifscCode),
      nullIfEmpty(bank.panNumber),
      candidateId,
    );

    // ─── Mirror the recruitment profile into employee sub-records ───
    // Skills / qualification come from the recruitment Candidate row (via the
    // job application) so the employee's HRMS profile matches what HR hired.
    try {
      const candRows = pb.jobApplicationId
        ? await db.$queryRawUnsafe(
            `SELECT c."skills", c."highestQualification", c."university", c."graduationYear"
             FROM "JobApplication" ja JOIN "Candidate" c ON c."id" = ja."candidateId"
             WHERE ja."id"=$1 LIMIT 1`, pb.jobApplicationId).catch(() => []) as any[]
        : [];
      const cand = candRows[0];
      if (cand) {
        let skills: string[] = [];
        if (cand.skills) {
          const raw = String(cand.skills).trim();
          if (raw.startsWith('[')) { try { const arr = JSON.parse(raw); if (Array.isArray(arr)) skills = arr.map((s: any) => String(s).trim()).filter(Boolean); } catch { /* fall through */ } }
          if (skills.length === 0) skills = raw.split(',').map((s: string) => s.trim()).filter(Boolean);
        }
        for (const skill of skills.slice(0, 30)) {
          await db.$executeRawUnsafe(
            `INSERT INTO "EmployeeSkill" ("id","employeeId","skill","level","createdAt","updatedAt")
             VALUES ($1,$2,$3,'intermediate',NOW(),NOW())`,
            `esk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, empId, skill,
          ).catch(() => 0);
        }
        if (cand.highestQualification) {
          await db.$executeRawUnsafe(
            `INSERT INTO "Qualification" ("id","employeeId","degree","institution","year","createdAt","updatedAt")
             VALUES ($1,$2,$3,$4,$5,NOW(),NOW())`,
            `qua-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, empId,
            String(cand.highestQualification), cand.university || null, Number(cand.graduationYear) || new Date().getFullYear(),
          ).catch(() => 0);
        }
      }
    } catch { /* profile mirroring is best-effort */ }

    await db.$executeRawUnsafe(
      `UPDATE "PreboardingCandidate" SET "employeeId"=$1, "onboardingStatus"='active_employee', "status"='joined', "preboardingStage"='joined', "activatedAt"=NOW(), "updatedAt"=NOW() WHERE "id"=$2`,
      empId, candidateId,
    );
    if (pb.jobApplicationId) {
      await db.$executeRawUnsafe(`UPDATE "JobApplication" SET "status"='hired', "updatedAt"=NOW() WHERE "id"=$1 AND "status" IN ('bgv_passed','bgv_cleared')`, pb.jobApplicationId).catch(() => null);
    }

    await notifyCandidate(db, pb.candidateEmail, `Your employee record has been created. Employee ID: ${empCode}. Your login has been activated — check your email for the credentials.`);
    await audit(db, (decoded as any).userId, 'CREATE_EMPLOYEE_FROM_PREBOARDING', 'preboarding',
      `${preboardingId} ${pb.candidateName}: employee created (formal ${empCode}) — dept ${deptId}, designation ${desigId}, manager ${mgrId}, DOJ ${jDate.toISOString().slice(0, 10)}, login ${userEmail}`);

    // ─── Activation email with login credentials ───
    // Sent to the company email (login identity) and the personal email as a
    // fallback copy. Delivery failures are surfaced to HR in the response and
    // the UI instead of being silently swallowed.
    const loginUrlBase = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || 'https://3boxes-hrms-inky.vercel.app';
    const loginUrl = `${loginUrlBase}/login`;
    const emailVars = {
      Employee_Name: firstName || 'there',
      Employee_Id: empCode,
      Company_Email: userEmail,
      Temporary_Password: temporaryPassword,
      Login_Url: loginUrl,
    };
    const emailTargets = Array.from(new Set([userEmail, String(pb.candidateEmail || '').toLowerCase()].filter(Boolean)));
    let emailSent = false;
    for (const target of emailTargets) {
      const result = await sendConfiguredEmail({
        db, tenantId: String((decoded as any).tenantId || ''),
        module: 'onboarding', eventKey: 'onboarding.employee.account_activated',
        to: target,
        toName: firstName || undefined,
        vars: emailVars,
        entityType: 'preboarding_candidate', entityId: candidateId, entityLink: '/preboarding',
        status: 'welcome',
      }).catch(() => null);
      if (result && (result as any).sent === true) emailSent = true;
    }

    try {
      await db.notification.create({ data: { userId, tenantId: String((decoded as any).tenantId || ''), title: 'Welcome!', message: `Account active. Employee ID: ${empCode}`, type: 'success', category: 'onboarding', isRead: false, isEmailSent: emailSent } }).catch(() => null);
    } catch {}

    return NextResponse.json({
      message: `Employee created successfully. Employee ID: ${empCode}. Login activated for ${userEmail}.${emailSent ? ' Login details emailed.' : ' Warning: the credentials email could not be delivered — share the details below manually.'}`,
      employeeRowId: empId, provisionalEmployeeId: empCode, employeeCode: empCode,
      loginEmail: userEmail, personalEmail: pb.candidateEmail || null,
      temporaryPassword, loginUrl, emailSent, preboardingId,
    }, { status: 201, headers: CORS });
  } catch (error) {
    console.error('[preboarding/brd/employee-creation] POST failed:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500, headers: CORS });
  }
}
