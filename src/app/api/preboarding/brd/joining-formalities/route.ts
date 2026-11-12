/**
 * /api/preboarding/brd/joining-formalities — BRD 5.11 Joining Confirmation & Formalities.
 *
 * GET   → candidates grouped for joining day operations:
 *           reportingToday, reportingThisWeek, overdue (expected date passed, not joined),
 *           joined, didNotJoin. Each row carries expected joining date + readiness.
 *
 * POST  { candidateId, action, ... }
 *   action=confirm-joined   { actualJoiningDate, reportingTime, reportingLocation, hrRemarks? }
 *                           → joiningConfirmed=TRUE, stage ready_to_join kept until
 *                             Employee Creation screen completes (BRD section 6).
 *   action=did-not-join     { reason }        (mandatory — BRD No-show workflow)
 *   action=postpone         { joiningDate, reason }
 *   action=cancel           { reason }
 *
 * Auth: HR/admin roles.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { getTokenFromHeaders, verifyToken } from '@/lib/auth';
import { HR_ROLES, notifyCandidate, audit, ensurePreboardingId } from '@/lib/preboarding';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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
    if (!decoded || !HR_ROLES.includes(String(decoded.role || ''))) {
      return NextResponse.json({ error: 'Forbidden — HR/Admin access only' }, { status: 403, headers: CORS });
    }

    const rows = await db.$queryRawUnsafe(
      `SELECT pbc."id", pbc."preboardingId", pbc."candidateName", pbc."candidateEmail", pbc."jobTitle",
              pbc."joiningDate", pbc."startDate", pbc."joiningConfirmed", pbc."joiningConfirmedAt",
              pbc."actualJoiningDate", pbc."reportingTime", pbc."reportingLocation",
              pbc."didNotJoinAt", pbc."noShowReason", pbc."postponedJoiningDate", pbc."postponementReason",
              pbc."cancelledAt", pbc."cancellationReason", pbc."employeeId", pbc."preboardingStage",
              pbc."readyToJoinAt", pbc."workLocation", pbc."employmentType"
       FROM "PreboardingCandidate" pbc
       WHERE pbc."cancelledAt" IS NULL
       ORDER BY COALESCE(pbc."joiningDate", pbc."startDate") ASC NULLS LAST
       LIMIT 300`,
    ).catch(() => []) as any[];

    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    const active = rows.filter((r: any) => !r.didNotJoinAt && !(r.preboardingStage === 'did_not_join'));
    const joinDateOf = (r: any) => r.joiningDate || r.startDate || null;

    const reportingToday = active.filter((r: any) => {
      const d = joinDateOf(r); return d && new Date(d).getTime() >= now - DAY && new Date(d).getTime() < now + DAY;
    });
    const reportingThisWeek = active.filter((r: any) => {
      const d = joinDateOf(r); return d && new Date(d).getTime() > now + DAY && new Date(d).getTime() <= now + 7 * DAY;
    });
    const overdue = active.filter((r: any) => {
      const d = joinDateOf(r); return d && new Date(d).getTime() < now - DAY && !r.employeeId;
    });
    const awaitingFormalities = active.filter((r: any) => r.readyToJoinAt && !r.joiningConfirmed && !r.employeeId);
    const joined = rows.filter((r: any) => r.employeeId || r.preboardingStage === 'joined');
    const didNotJoin = rows.filter((r: any) => r.didNotJoinAt || r.preboardingStage === 'did_not_join');

    return NextResponse.json({
      reportingToday, reportingThisWeek, overdue, awaitingFormalities, joined, didNotJoin,
      counts: {
        reportingToday: reportingToday.length,
        reportingThisWeek: reportingThisWeek.length,
        overdue: overdue.length,
        awaitingFormalities: awaitingFormalities.length,
        joined: joined.length,
        didNotJoin: didNotJoin.length,
      },
    }, { headers: CORS });
  } catch (error) {
    console.error('[preboarding/brd/joining-formalities] GET failed:', error);
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
    const action = String(body.action || '');
    if (!candidateId || !action) return NextResponse.json({ error: 'candidateId and action required' }, { status: 400, headers: CORS });

    const pbRows = await db.$queryRawUnsafe(`SELECT * FROM "PreboardingCandidate" WHERE "id"=$1 LIMIT 1`, candidateId).catch(() => []) as any[];
    if (!pbRows.length) return NextResponse.json({ error: 'Preboarding candidate not found' }, { status: 404, headers: CORS });
    const pb = pbRows[0];
    const preboardingId = await ensurePreboardingId(db, pb);
    const who = (decoded as any).name || (decoded as any).email || 'HR';

    switch (action) {
      case 'confirm-joined': {
        const actual = body.actualJoiningDate ? new Date(body.actualJoiningDate) : null;
        if (!actual) return NextResponse.json({ error: 'Actual Joining Date cannot be blank when confirming joined (BRD 5.11)' }, { status: 400, headers: CORS });
        const reportingTime = String(body.reportingTime || '').trim() || null;
        const reportingLocation = String(body.reportingLocation || '').trim() || null;
        const remarks = String(body.hrRemarks || '').trim() || null;
        await db.$executeRawUnsafe(
          `UPDATE "PreboardingCandidate"
           SET "joiningConfirmed"=TRUE, "joiningConfirmedAt"=NOW(), "actualJoiningDate"=$1,
               "reportingTime"=$2, "reportingLocation"=$3, "preboardingStage"='ready_to_join', "updatedAt"=NOW()
           WHERE "id"=$4`,
          actual, reportingTime, reportingLocation, candidateId,
        );
        if (remarks) await db.$executeRawUnsafe(`UPDATE "PreboardingCandidate" SET "notes"=$1, "updatedAt"=NOW() WHERE "id"=$2`, remarks, candidateId);
        await notifyCandidate(db, pb.candidateEmail, `Joining confirmed for ${actual.toISOString().slice(0, 10)}${reportingTime ? ` at ${reportingTime}` : ''}${reportingLocation ? `, ${reportingLocation}` : ''}. Welcome aboard!`);
        await audit(db, (decoded as any).userId, 'JOINING_CONFIRMED', 'preboarding', `${preboardingId} ${pb.candidateName}: confirmed joined on ${actual.toISOString().slice(0, 10)} by ${who}`);
        return NextResponse.json({ message: 'Joining confirmed. Proceed to Employee Creation to generate the employee record.' }, { headers: CORS });
      }

      case 'did-not-join': {
        const reason = String(body.reason || '').trim();
        if (!reason) return NextResponse.json({ error: 'A reason is mandatory when marking Did Not Join (BRD No-show workflow)' }, { status: 400, headers: CORS });
        if (pb.employeeId) return NextResponse.json({ error: 'Candidate already has an employee record — cannot mark Did Not Join' }, { status: 409, headers: CORS });
        await db.$executeRawUnsafe(
          `UPDATE "PreboardingCandidate" SET "didNotJoinAt"=NOW(), "noShowReason"=$1, "preboardingStage"='did_not_join', "updatedAt"=NOW() WHERE "id"=$2`,
          reason, candidateId,
        );
        await audit(db, (decoded as any).userId, 'JOINING_DID_NOT_JOIN', 'preboarding', `${preboardingId} ${pb.candidateName}: did not join — ${reason} (by ${who})`);
        return NextResponse.json({ message: 'Marked Did Not Join. No employee record created. Recruitment notified in audit history.' }, { headers: CORS });
      }

      case 'postpone': {
        const jd = body.joiningDate ? new Date(body.joiningDate) : null;
        const reason = String(body.reason || '').trim();
        if (!jd) return NextResponse.json({ error: 'A revised joining date is required' }, { status: 400, headers: CORS });
        if (!reason) return NextResponse.json({ error: 'A reason is required when postponing joining' }, { status: 400, headers: CORS });
        await db.$executeRawUnsafe(
          `UPDATE "PreboardingCandidate" SET "joiningDate"=$1, "startDate"=$1, "postponedJoiningDate"=$1, "postponementReason"=$2, "updatedAt"=NOW() WHERE "id"=$3`,
          jd, reason, candidateId,
        );
        await notifyCandidate(db, pb.candidateEmail, `Your joining date has been revised to ${jd.toISOString().slice(0, 10)}. Reason: ${reason}`);
        await audit(db, (decoded as any).userId, 'JOINING_POSTPONED', 'preboarding', `${preboardingId} ${pb.candidateName}: postponed to ${jd.toISOString().slice(0, 10)} — ${reason}`);
        return NextResponse.json({ message: 'Joining postponed and candidate notified.' }, { headers: CORS });
      }

      case 'cancel': {
        const reason = String(body.reason || '').trim();
        if (!reason) return NextResponse.json({ error: 'A cancellation reason is mandatory' }, { status: 400, headers: CORS });
        if (pb.employeeId) return NextResponse.json({ error: 'Candidate already has an employee record — cannot cancel' }, { status: 409, headers: CORS });
        await db.$executeRawUnsafe(
          `UPDATE "PreboardingCandidate" SET "cancelledAt"=NOW(), "cancellationReason"=$1, "preboardingStage"='cancelled', "updatedAt"=NOW() WHERE "id"=$2`,
          reason, candidateId,
        );
        await audit(db, (decoded as any).userId, 'JOINING_CANCELLED', 'preboarding', `${preboardingId} ${pb.candidateName}: joining cancelled — ${reason}`);
        return NextResponse.json({ message: 'Joining cancelled. Preboarding record closed.' }, { headers: CORS });
      }

      default:
        return NextResponse.json({ error: `Unknown action '${action}'. Valid: confirm-joined, did-not-join, postpone, cancel` }, { status: 400, headers: CORS });
    }
  } catch (error) {
    console.error('[preboarding/brd/joining-formalities] POST failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}
