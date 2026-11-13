import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { getAuthInfo } from '@/lib/companyScope';
<<<<<<< HEAD
import { findJoiningBlockers } from '@/lib/onboarding-documents';
=======
>>>>>>> e220f68 (Complete HRMS lifecycle workflow and UI audit fixes)

const CORS = { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization' };
export async function OPTIONS() { return NextResponse.json({}, { headers: CORS }); }

/**
 * POST /api/onboarding/mark-joined — mark candidate as Provisional Employee
 *
 * Side effects:
 *   1. Sets PreboardingCandidate.onboardingStatus='provisional_employee'
 *   2. If no Employee row exists yet, creates a PROVISIONAL Employee linked
 *      to the User that was created at convert-to-draft time (via companyEmail).
 *      The provisional Employee carries a temporary employeeId (`PROV-<shortid>`)
 *      so the candidate can already access attendance + leave APIs that
 *      require an Employee row. The Marq-prefixed ID is assigned at BGV
 *      approval time.
 *   3. Updates PreboardingCandidate.employeeId to point at the Employee row
 *      so subsequent BGV approval can find and upgrade it.
 */
export async function POST(req: NextRequest) {
  const db = await getDb(req);
  try {
    const auth = await getAuthInfo(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
    const isAdmin = ['super_admin','tenant_admin','ceo','admin','hr_admin','company_hr_admin'].includes(auth.role);
    if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: CORS });

    const body = await req.json();
    const { preboardingCandidateId } = body || {};
    if (!preboardingCandidateId) return NextResponse.json({ error: 'preboardingCandidateId required' }, { status: 400, headers: CORS });

    const rows = await db.$queryRawUnsafe(
      `SELECT id, "candidateName", "candidateEmail", "candidatePhone", "companyEmail", "jobTitle",
              "departmentId", "designationId", "reportingManagerId", "joiningDate",
              "onboardingStatus", "employeeId" AS "linkedEmployeeId"
       FROM "PreboardingCandidate" WHERE "id" = $1 LIMIT 1`, preboardingCandidateId,
    ).catch(() => []) as any[];
    if (rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: CORS });
    const pb = rows[0];
    if (pb.onboardingStatus === 'active_employee') return NextResponse.json({ error: 'Already activated' }, { status: 409, headers: CORS });
    if (pb.onboardingStatus === 'bgv_failed') return NextResponse.json({ error: 'BGV failed' }, { status: 400, headers: CORS });

<<<<<<< HEAD
    // BRD 5.9/5.10 — provisional joining also requires all required documents
    // approved; a rejected/pending required document blocks it.
    const blockers = await findJoiningBlockers(db, preboardingCandidateId);
    if (blockers.length) {
      return NextResponse.json({
        error: `Cannot mark joined — ${blockers.length} required document${blockers.length > 1 ? 's are' : ' is'} not approved: ${blockers.map((b) => `${b.documentLabel} (${b.status})`).join(', ')}. Resolve document verification first (BRD 5.9).`,
        code: 'DOCUMENTS_NOT_APPROVED', blockers,
      }, { status: 409, headers: CORS });
    }

=======
>>>>>>> e220f68 (Complete HRMS lifecycle workflow and UI audit fixes)
    // ─── Resolve department + designation (required by Employee model) ───
    let deptId = pb.departmentId;
    if (!deptId) {
      const d = await db.$queryRawUnsafe(`SELECT id FROM "Department" ORDER BY "createdAt" ASC LIMIT 1`).catch(() => []) as any[];
      deptId = d[0]?.id || null;
    }
    let desigId = pb.designationId;
    if (!desigId) {
      const d = await db.$queryRawUnsafe(`SELECT id FROM "Designation" ORDER BY "createdAt" ASC LIMIT 1`).catch(() => []) as any[];
      desigId = d[0]?.id || null;
    }
    if (!deptId || !desigId) {
      return NextResponse.json({ error: 'No Department or Designation found — please configure them before marking joined.' }, { status: 400, headers: CORS });
    }

    // ─── Create provisional Employee if one doesn't exist ───
    let employeeId = pb.linkedEmployeeId;
    if (!employeeId) {
      // Find the User that was created at convert-to-draft (via companyEmail)
      const userEmail = pb.companyEmail || pb.candidateEmail;
      const userRow = await db.$queryRawUnsafe(
        `SELECT id FROM "User" WHERE "email" = $1 LIMIT 1`, userEmail.toLowerCase(),
      ).catch(() => []) as any[];
      const userId = userRow[0]?.id || null;

      const firstName = (pb.candidateName||'New').split(' ')[0];
      const lastName = (pb.candidateName||'Employee').split(' ').slice(1).join(' ') || 'Employee';

      // Provisional employeeId (placeholder — Marq ID assigned at BGV approval)
      const provCode = `PROV-${preboardingCandidateId.replace(/[^a-z0-9]/gi, '').slice(-8).toUpperCase()}`;

      // Check no Employee with this email already exists
      const existing = await db.$queryRawUnsafe(
        `SELECT id, "employeeId" FROM "Employee" WHERE "email" = $1 LIMIT 1`, userEmail.toLowerCase(),
      ).catch(() => []) as any[];

      if (existing.length > 0) {
        // Employee already exists — link it to the PreboardingCandidate
        employeeId = existing[0].id;
        await db.$executeRawUnsafe(
          `UPDATE "PreboardingCandidate" SET "employeeId" = $1, "onboardingStatus" = 'provisional_employee', "status" = 'joined', "updatedAt" = NOW() WHERE "id" = $2`,
          employeeId, preboardingCandidateId,
        );
      } else {
        // Create provisional Employee row
        const empId = `emp-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
        const jDate = pb.joiningDate ? new Date(pb.joiningDate) : new Date();
        await db.$executeRawUnsafe(
          `INSERT INTO "Employee" ("id", "employeeId", "firstName", "lastName", "email", "phone",
                                    "userId", "departmentId", "designationId", "reportingManagerId",
                                    "dateOfJoining", "employeeStatus", "employeeType", "status",
                                    "credentialsStatus", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'probation', 'full_time', 'provisional',
                   'invited', NOW(), NOW())`,
          empId, provCode, firstName, lastName, userEmail.toLowerCase(), pb.candidatePhone||null,
          userId, deptId, desigId, pb.reportingManagerId||null, jDate,
        ).catch((e:any) => { throw new Error(`Provisional Employee create failed: ${e.message}`); });
        employeeId = empId;
      }

      // Link Employee back to PreboardingCandidate
      await db.$executeRawUnsafe(
        `UPDATE "PreboardingCandidate" SET "employeeId" = $1 WHERE "id" = $2`,
        employeeId, preboardingCandidateId,
      ).catch(() => 0);
    }

    // ─── Set status to provisional_employee ───
    await db.$executeRawUnsafe(
      `UPDATE "PreboardingCandidate" SET "onboardingStatus"='provisional_employee',"status"='joined',"updatedAt"=NOW() WHERE "id"=$1`, preboardingCandidateId,
    );

    // Notify candidate
    await db.$executeRawUnsafe(
      `INSERT INTO "CandidateMessage" ("id","candidateEmail","senderRole","message","createdAt","updatedAt") VALUES ($1,$2,'system',$3,NOW(),NOW())`,
      `msg-${Date.now()}`, pb.candidateEmail,
      `You have been marked as "Joined". You now have provisional access to view attendance and apply for leave. Full access after BGV approval.`,
    ).catch(() => 0);

    // Also push an in-app notification to the User (so they see it on HRMS login too)
    if (pb.companyEmail) {
      const u = await db.$queryRawUnsafe(`SELECT id FROM "User" WHERE "email" = $1 LIMIT 1`, (pb.companyEmail as string).toLowerCase()).catch(() => []) as any[];
      if (u[0]?.id) {
        try {
          await db.notification.create({ data: {
            userId: u[0].id, tenantId: auth.tenantId,
            title: 'Provisional Access Activated',
            message: 'You can now view attendance and apply for leave. Full access after BGV approval.',
            type: 'info', category: 'onboarding', isRead: false, isEmailSent: false,
          } }).catch(() => null);
        } catch {}
      }
    }

    await db.auditLog.create({ data: { userId: auth.userId, action: 'CANDIDATE_MARKED_JOINED_PROVISIONAL', module: 'onboarding', details: `Marked ${pb.candidateName} as Joined (Provisional). Employee row: ${employeeId}` } }).catch(() => null);

    return NextResponse.json({
      message: 'Marked as Joined. Provisional access activated.',
      onboardingStatus: 'provisional_employee',
      employeeId,
    }, { headers: CORS });
  } catch (error) {
    console.error('Mark-joined error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500, headers: CORS });
  }
}
