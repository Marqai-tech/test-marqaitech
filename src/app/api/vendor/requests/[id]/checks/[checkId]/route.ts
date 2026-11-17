import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { getAuthInfo } from '@/lib/companyScope';
import { CHECK_STATUSES, CHECK_RESULTS, RESULTS_REQUIRING_REASON, BGV_WORKABLE_STATUSES } from '@/lib/bgv';

const CORS = { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'PATCH, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization' };
export async function OPTIONS() { return NextResponse.json({}, { headers: CORS }); }

/**
 * PATCH /api/vendor/requests/[id]/checks/[checkId] — standard verification
 * form save (mock 13). Saves ONE check's draft or completed result.
 *
 * Hardened per the vendor-access brief (fix #3 + #5):
 *  - The check row must belong to the exact authorized request
 *    (forged requestId/checkId combinations update zero rows → 404).
 *  - Only the ASSIGNED vendor employee can write; vendor admins monitor but
 *    never edit investigation data.
 *  - Case must be in a workable state (assigned / in_progress / rework_required).
 *  - Enum validation: status ∈ {pending,in_progress,completed},
 *    result ∈ {Clear, Discrepancy Found, Unable to Verify}.
 *  - "Unable to Verify" and "Discrepancy Found" REQUIRE findings (reason).
 *  - verificationDate must be a valid date not in the future.
 *  - Draft persistence: every field save is durable — reload keeps input.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; checkId: string }> }) {
  const db = await getDb(req);
  try {
    const auth = await getAuthInfo(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
    if (!['vendor_admin', 'vendor_employee'].includes(auth.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: CORS });
    }

    const vuRows = await db.$queryRawUnsafe(
      `SELECT * FROM "VendorUser" WHERE "email"=$1 AND "status"='active' LIMIT 1`,
      auth.email,
    ).catch(() => []) as any[];
    if (vuRows.length === 0) return NextResponse.json({ error: 'Vendor user not found or inactive' }, { status: 403, headers: CORS });
    const vu = vuRows[0];

    const { id: requestId, checkId } = await params;
    const body = await req.json().catch(() => ({}));
    const { status, result, findings, verificationDate, evidenceUrl } = body || {};

    // Case must belong to the same vendor.
    const reqRows = await db.$queryRawUnsafe(
      `SELECT * FROM "BgvRequest" WHERE "id"=$1 AND "vendorCompanyId"=$2 LIMIT 1`,
      requestId, vu.vendorCompanyId,
    ).catch(() => []) as any[];
    if (reqRows.length === 0) return NextResponse.json({ error: 'Case not found' }, { status: 404, headers: CORS });
    const bgvReq = reqRows[0];

    // WRITE access: assigned employee only (admins monitor, never edit).
    if (bgvReq.assignedVendorUserId !== vu.id) {
      return NextResponse.json(
        { error: auth.role === 'vendor_admin'
          ? 'Vendor admins monitor cases — check updates are made by the assigned investigator.'
          : 'This case is not assigned to you.' },
        { status: 403, headers: CORS },
      );
    }
    if (!BGV_WORKABLE_STATUSES.includes(bgvReq.status)) {
      return NextResponse.json(
        { error: `This case is ${bgvReq.status.replace(/_/g, ' ')} — checks can only be updated while assigned, in progress or under rework.` },
        { status: 409, headers: CORS },
      );
    }

    // THE binding: check must belong to THIS request (fix #3 core).
    const checkRows = await db.$queryRawUnsafe(
      `SELECT * FROM "BgvCheck" WHERE "id"=$1 AND "bgvRequestId"=$2 LIMIT 1`,
      checkId, requestId,
    ).catch(() => []) as any[];
    if (checkRows.length === 0) {
      return NextResponse.json({ error: 'Check not found for this case' }, { status: 404, headers: CORS });
    }
    const check = checkRows[0];

    // Validate enums.
    if (status !== undefined && !(CHECK_STATUSES as readonly string[]).includes(String(status))) {
      return NextResponse.json({ error: `status must be one of: ${CHECK_STATUSES.join(', ')}` }, { status: 400, headers: CORS });
    }
    if (result !== undefined && result !== null && !(CHECK_RESULTS as readonly string[]).includes(String(result))) {
      return NextResponse.json({ error: `result must be one of: ${CHECK_RESULTS.join(', ')}` }, { status: 400, headers: CORS });
    }

    // Completed checks need a valid verification date + reason rules.
    const nextResult = result !== undefined ? (result === null ? null : String(result)) : check.result;
    const nextFindings = findings !== undefined ? String(findings || '').slice(0, 4000) : check.findings;
    const nextStatus = status !== undefined ? String(status) : check.status;

    let verificationDateValue: Date | null = check.verificationDate ? new Date(check.verificationDate) : null;
    if (verificationDate !== undefined) {
      if (verificationDate === null || verificationDate === '') {
        verificationDateValue = null;
      } else {
        const d = new Date(verificationDate);
        if (isNaN(d.getTime())) {
          return NextResponse.json({ error: 'Verification date is invalid' }, { status: 400, headers: CORS });
        }
        if (d.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
          return NextResponse.json({ error: 'Verification date cannot be in the future' }, { status: 400, headers: CORS });
        }
        verificationDateValue = d;
      }
    }

    if (nextStatus === 'completed') {
      if (!nextResult) {
        return NextResponse.json({ error: 'Select a result (Clear, Discrepancy Found or Unable to Verify) before completing the check' }, { status: 400, headers: CORS });
      }
      if (!verificationDateValue) {
        return NextResponse.json({ error: 'Verification date is required to complete the check' }, { status: 400, headers: CORS });
      }
      if (RESULTS_REQUIRING_REASON.includes(nextResult as any) && !String(nextFindings || '').trim()) {
        return NextResponse.json(
          { error: `"${nextResult}" requires written findings explaining what happened / what you tried.` },
          { status: 400, headers: CORS },
        );
      }
    }

    // Build the update.
    const updates: string[] = [];
    const vals: any[] = [];
    let p = 1;
    if (status !== undefined) { updates.push(`"status"=$${p++}`); vals.push(nextStatus); }
    if (result !== undefined) { updates.push(`"result"=$${p++}`); vals.push(nextResult); }
    if (findings !== undefined) { updates.push(`"findings"=$${p++}`); vals.push(nextFindings); }
    if (verificationDate !== undefined) { updates.push(`"verificationDate"=$${p++}`); vals.push(verificationDateValue); }
    if (evidenceUrl !== undefined) { updates.push(`"evidenceUrl"=$${p++}`); vals.push(String(evidenceUrl || '').slice(0, 500)); }
    if (nextStatus === 'completed') { updates.push(`"completedAt"=NOW()`); }
    updates.push(`"updatedAt"=NOW()`);
    vals.push(checkId, requestId);
    await db.$executeRawUnsafe(
      `UPDATE "BgvCheck" SET ${updates.join(', ')} WHERE "id"=$${p++} AND "bgvRequestId"=$${p}`,
      ...vals,
    );

    // Case rolls to in_progress as soon as any work starts (never backwards).
    if (bgvReq.status === 'assigned' || bgvReq.status === 'rework_required') {
      await db.$executeRawUnsafe(
        `UPDATE "BgvRequest" SET "status"='in_progress',"updatedAt"=NOW() WHERE "id"=$1 AND "status" IN ('assigned','rework_required')`,
        requestId,
      );
    }

    await db.auditLog.create({
      data: { userId: vu.id, action: 'BGV_CHECK_SAVED', module: 'bgv',
              details: `Check ${checkId} (${check.checkLabel || check.checkType}) on ${bgvReq.caseNumber || requestId}: status=${nextStatus}, result=${nextResult || '—'} (draft save)` },
    }).catch(() => null);

    const fresh = await db.$queryRawUnsafe(`SELECT * FROM "BgvCheck" WHERE "id"=$1 LIMIT 1`, checkId).catch(() => []) as any[];
    return NextResponse.json({
      message: nextStatus === 'completed' ? 'Check completed.' : 'Draft saved.',
      check: fresh[0] || null,
    }, { headers: CORS });
  } catch (error) {
    console.error('BGV check update error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}
