/**
 * /api/preboarding/brd/readiness — BRD 5.10 Joining Readiness.
 *
 * GET  ?candidateId=<id>  → readiness checklist (15 requirements, computed + manual
 *                           overrides), readiness metric, mandatory-gaps.
 * PATCH { candidateId, requirement?, status? }            update a manual checklist item
 * PATCH { candidateId, action: 'mark-ready-to-join' }     → validates mandatory items,
 *                                                           sets stage ready_to_join.
 *
 * BRD rule: "Readiness percentage should be calculated using configured checklist
 * weights or item counts. Mandatory requirements must not be bypassed simply
 * because the overall percentage is high."
 *
 * Auth: HR/admin roles.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { getTokenFromHeaders, verifyToken } from '@/lib/auth';
import {
  HR_ROLES, computeReadiness, READINESS_MANDATORY, notifyCandidate, audit, ensurePreboardingId,
} from '@/lib/preboarding';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const MANUAL_ITEMS = new Set(['Shift', 'IT Requirements', 'Asset Requirements', 'Joining Instructions']);

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS });
}

async function loadWithDocs(db: any, candidateId: string) {
  const pbRows = await db.$queryRawUnsafe(`SELECT * FROM "PreboardingCandidate" WHERE "id"=$1 LIMIT 1`, candidateId).catch(() => []) as any[];
  if (!pbRows.length) return null;
  const pb = pbRows[0];
  const docs = await db.$queryRawUnsafe(
    `SELECT "status" FROM "OnboardingDocument" WHERE "preboardingCandidateId"=$1`, candidateId,
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
    const loaded = await loadWithDocs(db, candidateId);
    if (!loaded) return NextResponse.json({ error: 'Preboarding candidate not found' }, { status: 404, headers: CORS });
    const readiness = computeReadiness(loaded.pb, loaded.docs);
    const mandatoryPending = readiness.items.filter((i: any) => READINESS_MANDATORY.has(i.requirement) && i.status === 'pending').map((i: any) => i.requirement);
    const preboardingId = await ensurePreboardingId(db, loaded.pb);
    return NextResponse.json({
      candidateId,
      preboardingId,
      candidateName: loaded.pb.candidateName,
      items: readiness.items,
      completed: readiness.completed,
      total: readiness.items.length,
      percent: readiness.percent,
      canMarkReady: mandatoryPending.length === 0,
      mandatoryPending,
      readyToJoinAt: loaded.pb.readyToJoinAt || null,
    }, { headers: CORS });
  } catch (error) {
    console.error('[preboarding/brd/readiness] GET failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}

export async function PATCH(req: NextRequest) {
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
    if (!candidateId) return NextResponse.json({ error: 'candidateId required' }, { status: 400, headers: CORS });
    const loaded = await loadWithDocs(db, candidateId);
    if (!loaded) return NextResponse.json({ error: 'Preboarding candidate not found' }, { status: 404, headers: CORS });
    const { pb, docs } = loaded;
    const preboardingId = await ensurePreboardingId(db, pb);
    const who = (decoded as any).name || (decoded as any).email || 'HR';

    if (body.action === 'mark-ready-to-join') {
      const readiness = computeReadiness(pb, docs);
      const mandatoryPending = readiness.items.filter((i: any) => READINESS_MANDATORY.has(i.requirement) && i.status === 'pending').map((i: any) => i.requirement);
      if (mandatoryPending.length > 0) {
        return NextResponse.json({
          error: `Cannot mark Ready to Join — mandatory items incomplete: ${mandatoryPending.join(', ')} (BRD 5.10)`,
          mandatoryPending,
        }, { status: 409, headers: CORS });
      }
      await db.$executeRawUnsafe(
        `UPDATE "PreboardingCandidate" SET "readyToJoinAt"=NOW(), "preboardingStage"='ready_to_join', "updatedAt"=NOW() WHERE "id"=$1`,
        candidateId,
      );
      await notifyCandidate(db, pb.candidateEmail, `Great news! You are marked Ready to Join${pb.jobTitle ? ` as ${pb.jobTitle}` : ''}. Please follow the joining instructions shared by HR.`);
      await audit(db, (decoded as any).userId, 'PREBOARDING_READY_TO_JOIN', 'preboarding', `${preboardingId} ${pb.candidateName}: marked ready to join (${readiness.completed}/${readiness.items.length}) by ${who}`);
      return NextResponse.json({ message: 'Candidate marked Ready to Join.', percent: readiness.percent }, { headers: CORS });
    }

    // Manual checklist item update
    const requirement = String(body.requirement || '');
    const status = String(body.status || '');
    if (!requirement || !['complete', 'pending'].includes(status)) {
      return NextResponse.json({ error: "requirement + status ('complete'|'pending') required" }, { status: 400, headers: CORS });
    }
    const { parseJsonMap } = await import('@/lib/preboarding');
    const stored = parseJsonMap(pb.readinessChecklist);
    stored[requirement] = { status, updatedBy: who, updatedAt: new Date().toISOString() };
    await db.$executeRawUnsafe(
      `UPDATE "PreboardingCandidate" SET "readinessChecklist"=$1::jsonb, "updatedAt"=NOW() WHERE "id"=$2`,
      JSON.stringify(stored), candidateId,
    );
    await audit(db, (decoded as any).userId, 'PREBOARDING_READINESS_UPDATED', 'preboarding', `${preboardingId} ${pb.candidateName}: ${requirement} → ${status} (by ${who})`);
    const readiness = computeReadiness({ ...pb, readinessChecklist: stored }, docs);
    return NextResponse.json({ message: `${requirement} marked ${status}.`, percent: readiness.percent, completed: readiness.completed }, { headers: CORS });
  } catch (error) {
    console.error('[preboarding/brd/readiness] PATCH failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}
