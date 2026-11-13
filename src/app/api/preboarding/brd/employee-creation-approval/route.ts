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

/**
 * BRD 6.2 — Employee-creation approval workflow.
 *
 * State machine: draft → under_review → (payrollRequired? pending_payroll) →
 * authorized → created. Terminal: rejected / cancelled.
 *
 * GET  ?candidateId= — the candidate's ACTIVE request (non-terminal) + history.
 * POST { candidateId, action, employment?, payrollRequired?, reason? }
 *   save-draft      HR      → upsert draft with employment payload
 *   submit          HR      → draft → under_review (payload validated)
 *   payroll-approve Finance → under_review → pending_payroll | authorized
 *   authorize       HR      → under_review/pending_payroll → authorized,
 *                             then creates the Employee ATOMICALLY
 *                             ($transaction: Employee + Preboarding link +
 *                             EmployeeCreationRequest update together).
 *   reject          HR      → reason required.
 *   cancel          HR      → draft only.
 *
 * The final creation re-runs the BRD 6.3 hard rules before the transaction.
 */

type Tx = { $queryRawUnsafe: (q: string, ...p: any[]) => Promise<any>; $executeRawUnsafe: (q: string, ...p: any[]) => Promise<any> };

const FINANCE_ROLES = ['tenant_admin', 'super_admin', 'finance', 'finance_admin', 'ceo'];
const AUTHORIZE_ROLES = ['tenant_admin', 'super_admin', 'hr_admin', 'company_hr_admin', 'admin'];

const TRANSITIONS: Record<string, string[]> = {
  'save-draft': ['draft', 'under_review'],          // draft may be re-edited
  submit: ['draft'],
  'payroll-approve': ['under_review'],
  authorize: ['under_review', 'pending_payroll'],
  reject: ['draft', 'under_review', 'pending_payroll'],
  cancel: ['draft'],
};

async function loadActiveRequest(db: Tx, candidateId: string) {
  const rows = await db.$queryRawUnsafe(
    `SELECT * FROM "EmployeeCreationRequest"
     WHERE "preboardingCandidateId" = $1 AND "status" NOT IN ('created','rejected','cancelled')
     ORDER BY "createdAt" DESC LIMIT 1`, candidateId,
  ).catch(() => []) as any[];
  return rows[0] || null;
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

    const active = await loadActiveRequest(db, candidateId);
    const history = await db.$queryRawUnsafe(
      `SELECT "id","status","candidateName","createdAt","submittedAt","authorizedAt","rejectedAt","rejectReason",
              "provisionalEmployeeId","payrollRequired"
       FROM "EmployeeCreationRequest"
       WHERE "preboardingCandidateId" = $1
       ORDER BY "createdAt" DESC LIMIT 10`, candidateId,
    ).catch(() => []) as any[];
    return NextResponse.json({ request: active, history }, { headers: CORS });
  } catch (error) {
    console.error('[employee-creation-approval] GET failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}

export async function POST(req: NextRequest) {
  const db = await getDb(req);
  try {
    const token = getTokenFromHeaders(req);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
    const decoded = await verifyToken(token).catch(() => null);
    if (!decoded) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
    const role = String(decoded.role || '');
    const userId = String((decoded as any).userId || '');
    const body = await req.json().catch(() => ({}));
    const candidateId = String(body.candidateId || '');
    const action = String(body.action || '');
    if (!candidateId || !action) return NextResponse.json({ error: 'candidateId and action required' }, { status: 400, headers: CORS });
    if (!TRANSITIONS[action]) return NextResponse.json({ error: `Unknown action '${action}'` }, { status: 400, headers: CORS });

    // Role gates per action.
    if (action === 'payroll-approve' && !FINANCE_ROLES.includes(role)) {
      return NextResponse.json({ error: 'Forbidden — Finance/Admin only for the payroll step' }, { status: 403, headers: CORS });
    }
    if (action === 'authorize' && !AUTHORIZE_ROLES.includes(role)) {
      return NextResponse.json({ error: 'Forbidden — only HR Admin / Tenant Admin can authorize creation' }, { status: 403, headers: CORS });
    }
    if (['save-draft', 'submit', 'reject', 'cancel'].includes(action) && !HR_ROLES.includes(role)) {
      return NextResponse.json({ error: 'Forbidden — HR/Admin access only' }, { status: 403, headers: CORS });
    }

    const pbRows = await db.$queryRawUnsafe(`SELECT * FROM "PreboardingCandidate" WHERE "id"=$1 LIMIT 1`, candidateId).catch(() => []) as any[];
    if (!pbRows.length) return NextResponse.json({ error: 'Preboarding candidate not found' }, { status: 404, headers: CORS });
    const pb = pbRows[0];
    const preboardingId = pb.preboardingId || await ensurePreboardingId(db, pb);

    let ecr = await loadActiveRequest(db, candidateId);

    // ── save-draft: upsert (idempotent per candidate while not terminal) ──
    if (action === 'save-draft') {
      const employment = body.employment || {};
      if (ecr) {
        await db.$executeRawUnsafe(
          `UPDATE "EmployeeCreationRequest"
           SET "employment" = $2, "payrollRequired" = $3, "status" = CASE WHEN "status" = 'draft' THEN 'draft' ELSE "status" END,
               "updatedAt" = NOW()
           WHERE "id" = $1`,
          ecr.id, JSON.stringify(employment), !!body.payrollRequired,
        );
      } else {
        const id = `ecr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        await db.$executeRawUnsafe(
          `INSERT INTO "EmployeeCreationRequest"
             ("id","preboardingCandidateId","preboardingId","candidateName","candidateEmail",
              "employment","status","payrollRequired","createdById","createdAt","updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6,'draft',$7,$8,NOW(),NOW())`,
          id, candidateId, preboardingId, pb.candidateName, pb.candidateEmail,
          JSON.stringify(employment), !!body.payrollRequired, userId,
        );
        ecr = await loadActiveRequest(db, candidateId);
      }
      await audit(db, userId, 'ECR_SAVE_DRAFT', 'preboarding', `${preboardingId}: employee-creation draft saved`);
      return NextResponse.json({ message: 'Draft saved.', request: ecr }, { headers: CORS });
    }

    if (!ecr) return NextResponse.json({ error: 'No active employee-creation request. Save a draft first.' }, { status: 404, headers: CORS });
    if (!TRANSITIONS[action].includes(ecr.status)) {
      return NextResponse.json({ error: `Cannot '${action}' — request is ${ecr.status}.` }, { status: 409, headers: CORS });
    }

    const employment = { ...(typeof ecr.employment === 'string' ? JSON.parse(ecr.employment) : ecr.employment || {}), ...(body.employment || {}) };
    const payrollRequired = body.payrollRequired !== undefined ? !!body.payrollRequired : !!ecr.payrollRequired;

    if (action === 'submit') {
      const missing: string[] = [];
      const deptId = employment.departmentId || pb.departmentId;
      const desigId = employment.designationId || pb.designationId;
      const doj = employment.dateOfJoining || pb.actualJoiningDate || pb.joiningDate;
      if (!deptId) missing.push('Department');
      if (!desigId) missing.push('Designation');
      if (!doj) missing.push('Joining date');
      if (!pb.joiningConfirmed) missing.push('Joining must be confirmed first (BRD 5.11)');
      if (pb.employeeId) return NextResponse.json({ error: `Employee already exists (${pb.employeeId}).` }, { status: 409, headers: CORS });
      if (missing.length) return NextResponse.json({ error: `Cannot submit: ${missing.join(', ')}.` }, { status: 400, headers: CORS });
      await db.$executeRawUnsafe(
        `UPDATE "EmployeeCreationRequest" SET "status"='under_review', "employment"=$2, "payrollRequired"=$3, "submittedById"=$4, "submittedAt"=NOW(), "updatedAt"=NOW() WHERE "id"=$1`,
        ecr.id, JSON.stringify(employment), payrollRequired, userId,
      );
      await audit(db, userId, 'ECR_SUBMITTED', 'preboarding', `${preboardingId}: employee-creation submitted for review`);
      return NextResponse.json({ message: 'Submitted for review.', status: 'under_review', nextStep: payrollRequired ? 'pending_payroll' : 'authorize' }, { headers: CORS });
    }

    if (action === 'payroll-approve') {
      // Configurable payroll step: if not required, this action is a no-op path
      // (authorize works directly from under_review). When required, move to
      // pending_payroll; a second call from pending_payroll is rejected by the
      // transition map — the authorize action completes it.
      await db.$executeRawUnsafe(
        `UPDATE "EmployeeCreationRequest" SET "status"=$2, "payrollReviewedById"=$3, "payrollReviewedAt"=NOW(), "employment"=$4, "updatedAt"=NOW() WHERE "id"=$1`,
        ecr.id, payrollRequired ? 'pending_payroll' : 'authorized', userId, JSON.stringify(employment),
      );
      await audit(db, userId, 'ECR_PAYROLL_STEP', 'preboarding', `${preboardingId}: payroll step completed (required=${payrollRequired})`);
      return NextResponse.json({ message: payrollRequired ? 'Payroll review recorded — awaiting HR authorization.' : 'Payroll not required — ready for HR authorization.', status: payrollRequired ? 'pending_payroll' : 'authorized' }, { headers: CORS });
    }

    if (action === 'reject') {
      const reason = String(body.reason || '').trim();
      if (!reason) return NextResponse.json({ error: 'A rejection reason is required.' }, { status: 400, headers: CORS });
      await db.$executeRawUnsafe(
        `UPDATE "EmployeeCreationRequest" SET "status"='rejected', "rejectedById"=$2, "rejectedAt"=NOW(), "rejectReason"=$3, "updatedAt"=NOW() WHERE "id"=$1`,
        ecr.id, userId, reason,
      );
      await audit(db, userId, 'ECR_REJECTED', 'preboarding', `${preboardingId}: employee-creation rejected — ${reason}`);
      return NextResponse.json({ message: 'Request rejected.', status: 'rejected' }, { headers: CORS });
    }

    if (action === 'cancel') {
      await db.$executeRawUnsafe(
        `UPDATE "EmployeeCreationRequest" SET "status"='cancelled', "updatedAt"=NOW() WHERE "id"=$1`,
        ecr.id,
      );
      await audit(db, userId, 'ECR_CANCELLED', 'preboarding', `${preboardingId}: employee-creation request cancelled`);
      return NextResponse.json({ message: 'Request cancelled.', status: 'cancelled' }, { headers: CORS });
    }

    // ─── action === 'authorize' — validate BRD 6.3, then create ATOMICALLY ───
    const docs = await db.$queryRawUnsafe(
      `SELECT "documentType","documentLabel","status" FROM "OnboardingDocument" WHERE "preboardingCandidateId"=$1`, candidateId,
    ).catch(() => []) as any[];
    const errors: string[] = [];
    const deptId = employment.departmentId || pb.departmentId || null;
    const desigId = employment.designationId || pb.designationId || null;
    const mgrId = employment.reportingManagerId || pb.reportingManagerId || null;
    const doj = employment.dateOfJoining || pb.actualJoiningDate || pb.joiningDate || pb.startDate || null;
    if (!pb.joiningConfirmed && !doj) errors.push('Actual joining date must be confirmed (BRD 6.3 rule 3)');
    if (!deptId) errors.push('Department must be valid and active (BRD 6.3 rule 7)');
    if (!desigId) errors.push('Designation must be selected');
    if (pb.employeeId) errors.push(`Existing employee duplication: record ${pb.employeeId} already linked (BRD 6.3 rule 6)`);
    if (docs.length > 0 && !docs.every((d: any) => d.status === 'approved')) {
      const pending = docs.filter((d: any) => d.status !== 'approved').map((d: any) => d.documentLabel);
      errors.push(`Mandatory documents not approved: ${pending.join(', ')}`);
    }
    if (errors.length) return NextResponse.json({ error: 'Validation failed (BRD 6.3)', errors }, { status: 409, headers: CORS });

    const nameParts = String(pb.candidateName || '').trim().split(/\s+/);
    const firstName = employment.firstName || nameParts[0] || pb.candidateName;
    const lastName = employment.lastName || nameParts.slice(1).join(' ') || nameParts[0];
    const userEmail = (pb.companyEmail || pb.candidateEmail).toLowerCase();

    let userIdLinked: string | null = null;
    try {
      const u = await db.$queryRawUnsafe(`SELECT id FROM "User" WHERE "email" = $1 LIMIT 1`, userEmail) as any[];
      userIdLinked = u[0]?.id || null;
    } catch { userIdLinked = null; }

    const empId = `emp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const provCode = `PROV-${preboardingId.replace(/[^a-z0-9]/gi, '').slice(-4)}${String(Date.now()).slice(-4)}`;
    const jDate = doj ? new Date(doj) : new Date();

    // FK pre-checks (outside transaction, fail fast with clear errors).
    if (deptId) { const d = await db.$queryRawUnsafe(`SELECT 1 FROM "Department" WHERE id=$1 LIMIT 1`, deptId) as any[]; if (!d.length) throw new Error(`Department ${deptId} does not exist`); }
    if (desigId) { const d = await db.$queryRawUnsafe(`SELECT 1 FROM "Designation" WHERE id=$1 LIMIT 1`, desigId) as any[]; if (!d.length) throw new Error(`Designation ${desigId} does not exist`); }
    if (mgrId) { const d = await db.$queryRawUnsafe(`SELECT 1 FROM "Employee" WHERE id=$1 LIMIT 1`, mgrId) as any[]; if (!d.length) throw new Error(`Reporting manager ${mgrId} does not exist`); }

    // ATOMIC creation (BRD 6.3 #12): Employee + Preboarding link + request
    // completion commit or roll back together.
    await db.$transaction(async (tx: Tx) => {
      await tx.$executeRawUnsafe(
        `INSERT INTO "Employee" ("id", "employeeId", "firstName", "lastName", "email", "phone",
                                  "userId", "departmentId", "designationId", "reportingManagerId",
                                  "dateOfJoining", "employeeStatus", "employeeType", "workMode",
                                  "status", "credentialsStatus", "preboardingCandidateId",
                                  "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'probation', $12, $13,
                 'provisional', 'invited', $14, NOW(), NOW())`,
        empId, provCode, firstName, lastName, userEmail, pb.candidatePhone || null,
        userIdLinked, deptId, desigId, mgrId, jDate,
        employment.employmentType || pb.employmentType || 'full_time',
        employment.workMode || pb.workMode || 'office',
        candidateId,
      );
      await tx.$executeRawUnsafe(
        `UPDATE "PreboardingCandidate"
         SET "employeeId"=$1, "onboardingStatus"='provisional_employee', "status"='joined',
             "preboardingStage"='joined', "updatedAt"=NOW()
         WHERE "id"=$2`,
        empId, candidateId,
      );
      await tx.$executeRawUnsafe(
        `UPDATE "EmployeeCreationRequest"
         SET "status"='created', "authorizedById"=$2, "authorizedAt"=NOW(),
             "employeeRowId"=$3, "provisionalEmployeeId"=$4, "updatedAt"=NOW()
         WHERE "id"=$1`,
        ecr.id, userId, empId, provCode,
      );
    });

    await notifyCandidate(db, pb.candidateEmail, `Your employee record has been created (provisional ID: ${provCode}). Formal Employee ID is issued after BGV clearance.`);
    await audit(db, userId, 'CREATE_EMPLOYEE_FROM_PREBOARDING', 'preboarding',
      `${preboardingId} ${pb.candidateName}: authorized + created (provisional ${provCode}) via BRD 6.2 workflow — dept ${deptId}, designation ${desigId}, DOJ ${jDate.toISOString().slice(0, 10)}`);

    return NextResponse.json({
      message: 'Authorized — employee created atomically (provisional). Formal Employee ID (MarqNNN) is issued at BGV approval.',
      status: 'created', employeeRowId: empId, provisionalEmployeeId: provCode, preboardingId,
    }, { status: 201, headers: CORS });
  } catch (error) {
    console.error('[employee-creation-approval] POST failed:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500, headers: CORS });
  }
}
