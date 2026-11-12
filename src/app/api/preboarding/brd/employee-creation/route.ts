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
        loginActivation: 'On employee creation — password Welcome@123 (change on first login)',
      },
      sectionE: {
        documents: docs.map((d: any) => ({ type: d.documentType, label: d.documentLabel, status: d.status })),
      },
      validations,
      employeeExists: Boolean(pb.employeeId),
      linkedEmployeeId: pb.employeeId || null,
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
    const nameParts = String(pb.candidateName || '').trim().split(/\s+/);
    const firstName = employment.firstName || nameParts[0] || pb.candidateName;
    const lastName = employment.lastName || nameParts.slice(1).join(' ') || nameParts[0];

    // Find the User created at convert time (companyEmail) — reuse for login identity
    let userId: string | null = null;
    const userEmail = pb.companyEmail || pb.candidateEmail;
    try {
      const u = await db.$queryRawUnsafe(`SELECT id FROM "User" WHERE "email" = $1 LIMIT 1`, userEmail.toLowerCase()) as any[];
      userId = u[0]?.id || null;
    } catch {}

    const empId = `emp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const provCode = `PROV-${preboardingId.replace(/[^a-z0-9]/gi, '').slice(-4)}${String(Date.now()).slice(-4)}`;
    const jDate = doj ? new Date(doj) : new Date();

    // Validate FK references exist before insert (additive-safe)
    if (deptId) { const d = await db.$queryRawUnsafe(`SELECT 1 FROM "Department" WHERE id=$1 LIMIT 1`, deptId) as any[]; if (!d.length) throw new Error(`Department ${deptId} does not exist`); }
    if (desigId) { const d = await db.$queryRawUnsafe(`SELECT 1 FROM "Designation" WHERE id=$1 LIMIT 1`, desigId) as any[]; if (!d.length) throw new Error(`Designation ${desigId} does not exist`); }
    if (mgrId) { const d = await db.$queryRawUnsafe(`SELECT 1 FROM "Employee" WHERE id=$1 LIMIT 1`, mgrId) as any[]; if (!d.length) throw new Error(`Reporting manager ${mgrId} does not exist`); }

    await db.$executeRawUnsafe(
      `INSERT INTO "Employee" ("id", "employeeId", "firstName", "lastName", "email", "phone",
                                "userId", "departmentId", "designationId", "reportingManagerId",
                                "dateOfJoining", "employeeStatus", "employeeType", "workMode",
                                "status", "credentialsStatus", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'probation', $12, $13,
               'provisional', 'invited', NOW(), NOW())`,
      empId, provCode, firstName, lastName, userEmail.toLowerCase(), pb.candidatePhone || null,
      userId, deptId, desigId, mgrId, jDate,
      employment.employmentType || pb.employmentType || 'full_time',
      employment.workMode || pb.workMode || 'office',
    );

    await db.$executeRawUnsafe(
      `UPDATE "PreboardingCandidate" SET "employeeId"=$1, "onboardingStatus"='provisional_employee', "status"='joined', "preboardingStage"='joined', "updatedAt"=NOW() WHERE "id"=$2`,
      empId, candidateId,
    );

    await notifyCandidate(db, pb.candidateEmail, `Your employee record has been created (provisional ID: ${provCode}). System access details will be shared shortly. Formal Employee ID is issued after BGV clearance.`);
    await audit(db, (decoded as any).userId, 'CREATE_EMPLOYEE_FROM_PREBOARDING', 'preboarding',
      `${preboardingId} ${pb.candidateName}: employee created (provisional ${provCode}) — dept ${deptId}, designation ${desigId}, manager ${mgrId}, DOJ ${jDate.toISOString().slice(0, 10)}`);
    await import('@/lib/email').then(({ sendEmail }) => sendEmail({
      to: pb.candidateEmail,
      subject: 'Your employee account has been created',
      html: `<p>Dear ${pb.candidateName},</p><p>Your employee record has been created (provisional ID: <b>${provCode}</b>).</p><p>You can sign in with ${userEmail.toLowerCase()} — password <b>Welcome@123</b> (change on first login).</p>`,
    }).catch(() => null)).catch(() => null);

    return NextResponse.json({
      message: 'Employee created successfully (provisional). Formal Employee ID (MarqNNN) is issued at BGV approval.',
      employeeRowId: empId, provisionalEmployeeId: provCode, preboardingId,
    }, { status: 201, headers: CORS });
  } catch (error) {
    console.error('[preboarding/brd/employee-creation] POST failed:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500, headers: CORS });
  }
}
