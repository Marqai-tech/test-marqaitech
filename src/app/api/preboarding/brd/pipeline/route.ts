/**
 * GET /api/preboarding/brd/pipeline — BRD Preboarding Candidates List + Dashboard data.
 *
 * Returns every PreboardingCandidate with BRD-computed fields:
 *   preboardingId (PRE-YYYY-NNNN), stage (Figure 1.1), documentStatus,
 *   verificationStatus, joiningReadiness, readinessPercent, offerStatus,
 *   documents summary, joiner meta (jobTitle, joiningDate...).
 *
 * Query params:
 *   stage=<stage>            filter by BRD stage
 *   search=<text>            name / email / preboardingId
 *   department=<text>        department filter
 *   readiness=Ready|Not Ready
 *   limit=<n>                default 300
 *
 * Auth: HR/admin roles.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { getTokenFromHeaders, verifyToken } from '@/lib/auth';
import {
  HR_ROLES, deriveStage, documentStatusOf,
  verificationStatusOf, computeReadiness, joiningReadinessOf, ensurePreboardingId,
  STAGE_LABELS,
} from '@/lib/preboarding';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS });
}

export async function GET(req: NextRequest) {
  const db = await getDb(req);
  try {
    const token = getTokenFromHeaders(req);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
    const decoded = await verifyToken(token).catch(() => null);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: CORS });
    if (!HR_ROLES.includes(String(decoded.role || ''))) {
      return NextResponse.json({ error: 'Forbidden — HR/Admin access only' }, { status: 403, headers: CORS });
    }

    const rows = await db.$queryRawUnsafe(
      `SELECT pbc."id", pbc."preboardingId", pbc."preboardingStage", pbc."candidateName", pbc."candidateEmail", pbc."candidatePhone",
              pbc."jobTitle", pbc."departmentId", pbc."designationId", pbc."reportingManagerId",
              pbc."employmentType", pbc."workLocation", pbc."joiningDate", pbc."startDate", pbc."offerId",
              pbc."onboardingStatus", pbc."status", pbc."backgroundCheckStatus", pbc."companyEmail",
              pbc."ctc", pbc."currency", pbc."employeeId", pbc."activatedAt", pbc."createdAt",
              pbc."portalDetails", pbc."portalSubmittedAt", pbc."declarationName", pbc."declarationAcceptedAt",
              pbc."correctionNote", pbc."correctionSetAt", pbc."readinessChecklist", pbc."readyToJoinAt",
              pbc."joiningConfirmed", pbc."joiningConfirmedAt", pbc."actualJoiningDate", pbc."reportingTime", pbc."reportingLocation",
              pbc."didNotJoinAt", pbc."noShowReason", pbc."postponedJoiningDate", pbc."postponementReason",
              pbc."cancelledAt", pbc."cancellationReason", pbc."hrAssignedTo", pbc."recruiterName",
              pbc."workMode", pbc."branch", pbc."reminderSentAt", pbc."offerDate"
       FROM "PreboardingCandidate" pbc
       ORDER BY pbc."createdAt" DESC
       LIMIT 300`,
    ).catch(() => []) as any[];

    // Resolve department + designation + manager names once (small ref tables)
    const deptRows = await db.$queryRawUnsafe(`SELECT id, name FROM "Department"`).catch(() => []) as any[];
    const desigRows = await db.$queryRawUnsafe(`SELECT id, title FROM "Designation"`).catch(() => []) as any[];
    const deptMap = new Map(deptRows.map((d: any) => [d.id, d.name]));
    const desigMap = new Map(desigRows.map((d: any) => [d.id, d.title]));

    let managerMap = new Map<string, string>();
    try {
      const mgrRows = await db.$queryRawUnsafe(`SELECT id, "firstName", "lastName" FROM "Employee" LIMIT 500`) as any[];
      managerMap = new Map(mgrRows.map((m: any) => [m.id, [m.firstName, m.lastName].filter(Boolean).join(' ')]));
    } catch { /* Employee table may be empty */ }

    const candidates: any[] = [];
    const stageCounts: Record<string, number> = {};
    for (const stage of Object.keys(STAGE_LABELS)) stageCounts[stage] = 0;

    for (const pb of rows) {
      const preboardingId = await ensurePreboardingId(db, pb);
      const docs = await db.$queryRawUnsafe(
        `SELECT d."id", d."documentType", d."documentLabel", d."status", d."reviewNotes", d."uploadedAt", d."fileName"
         FROM "OnboardingDocument" d WHERE d."preboardingCandidateId" = $1 ORDER BY d."createdAt" ASC`,
        pb.id,
      ).catch(() => []) as any[];

      const stage = deriveStage(pb);
      stageCounts[stage] = (stageCounts[stage] || 0) + 1;
      const readiness = computeReadiness(pb, docs);

      candidates.push({
        id: pb.id,
        preboardingId,
        candidateId: pb.offerId || null,
        candidateName: pb.candidateName,
        candidateEmail: pb.candidateEmail,
        candidatePhone: pb.candidatePhone || null,
        jobTitle: pb.jobTitle || null,
        department: pb.departmentId ? (deptMap.get(pb.departmentId) || null) : null,
        designation: pb.designationId ? (desigMap.get(pb.designationId) || null) : null,
        reportingManager: pb.reportingManagerId ? (managerMap.get(pb.reportingManagerId) || null) : null,
        companyEmail: pb.companyEmail || null,
        employmentType: pb.employmentType || null,
        workLocation: pb.workLocation || null,
        workMode: pb.workMode || null,
        branch: pb.branch || null,
        recruiter: pb.recruiterName || null,
        hrAssignedTo: pb.hrAssignedTo || null,
        joiningDate: pb.joiningDate || pb.startDate || null,
        offerStatus: 'Accepted',
        offerDate: pb.offerDate || null,
        documentStatus: documentStatusOf(docs),
        verificationStatus: verificationStatusOf(docs),
        joiningReadiness: joiningReadinessOf(pb, readiness.items as any),
        readinessPercent: readiness.percent,
        readinessCompleted: readiness.completed,
        readinessTotal: readiness.items.length,
        stage,
        stageLabel: STAGE_LABELS[stage] || stage,
        onboardingStatus: pb.onboardingStatus || null,
        bgvStatus: pb.backgroundCheckStatus || 'pending',
        employeeId: pb.employeeId || null,
        correctionNote: pb.correctionNote || null,
        portalSubmittedAt: pb.portalSubmittedAt || null,
        joiningConfirmed: Boolean(pb.joiningConfirmed),
        actualJoiningDate: pb.actualJoiningDate || null,
        documents: docs,
        createdAt: pb.createdAt,
        reminderSentAt: pb.reminderSentAt || null,
      });
    }

    // ─── Metrics (BRD 5.1 A. Metric cards) ───
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    const upcoming = candidates.filter(c => c.joiningDate && new Date(c.joiningDate).getTime() > now && !['joined', 'did_not_join', 'cancelled'].includes(c.stage));
    const metrics = {
      totalPreboarding: candidates.filter(c => !['cancelled'].includes(c.stage)).length,
      upcomingJoiners: upcoming.length,
      joiningThisWeek: upcoming.filter(c => new Date(c.joiningDate).getTime() - now <= 7 * DAY).length,
      documentsPending: candidates.filter(c => c.documentStatus === 'Pending' && !['did_not_join', 'cancelled'].includes(c.stage)).length,
      verificationPending: candidates.filter(c => c.verificationStatus === 'In Review' || (c.stage === 'verification' && c.verificationStatus !== 'Verified')).length,
      documentsRejected: candidates.filter(c => c.verificationStatus === 'Rejected').length,
      joiningReadinessPending: candidates.filter(c => c.joiningReadiness === 'Not Ready' && ['verification', 'ready_to_join', 'details_pending'].includes(c.stage)).length,
      joiningConfirmed: candidates.filter(c => c.joiningConfirmed).length,
      joiningCompleted: candidates.filter(c => c.stage === 'joined').length,
      didNotJoin: candidates.filter(c => c.stage === 'did_not_join').length,
      stageCounts,
    };

    // ─── Filters ───
    const sp = new URL(req.url).searchParams;
    let filtered = candidates;
    const stageF = sp.get('stage');
    if (stageF) filtered = filtered.filter(c => c.stage === stageF);
    const search = (sp.get('search') || '').trim().toLowerCase();
    if (search) filtered = filtered.filter(c =>
      [c.candidateName, c.candidateEmail, c.preboardingId, c.jobTitle].some(v => String(v || '').toLowerCase().includes(search)));
    const readinessF = sp.get('readiness');
    if (readinessF) filtered = filtered.filter(c => c.joiningReadiness === readinessF);
    const departmentF = sp.get('department');
    if (departmentF) filtered = filtered.filter(c => c.department === departmentF);

    return NextResponse.json({ candidates: filtered, metrics, total: candidates.length }, { headers: CORS });
  } catch (error) {
    console.error('[preboarding/brd/pipeline] GET failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}
