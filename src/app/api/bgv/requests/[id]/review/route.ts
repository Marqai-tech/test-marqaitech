import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { getAuthInfo } from '@/lib/companyScope';
import { HR_ROLES, notifyBgvEvent, BGV_TERMINAL_STATUSES, labelForStatus, resolveBaseUrl } from '@/lib/bgv';

const CORS = { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization' };
export async function OPTIONS() { return NextResponse.json({}, { headers: CORS }); }

/**
 * POST /api/bgv/requests/[id]/review — HR interim review actions.
 *
 *  action = 'rework_required'      → the submitted report must be corrected.
 *    Body: { action, reason (required), checkIds? (specific checks to redo),
 *            dueDate? }
 *    - Opens a working copy for the CURRENT investigator (previous submitted
 *      versions stay immutable and visible to HR).
 *    - Notifies the assigned employee AND the vendor admin with the reason
 *      and which checks to correct.
 *  action = 'awaiting_information' → vendor must supply more info first.
 *
 * Both record the decision on the latest submitted report and are
 * permission-checked. Terminal cases cannot be reviewed.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(req);
  try {
    const auth = await getAuthInfo(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
    if (!HR_ROLES.includes(auth.role)) return NextResponse.json({ error: 'Forbidden — HR/Admin only' }, { status: 403, headers: CORS });

    const { id: requestId } = await params;
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');
    const notes = String(body.notes || body.reason || '').slice(0, 2000);
    const checkIds: string[] = Array.isArray(body.checkIds) ? body.checkIds.filter((x: any) => typeof x === 'string').slice(0, 50) : [];
    const dueDate = body.dueDate ? new Date(body.dueDate) : null;

    if (!['awaiting_information', 'rework_required'].includes(action)) {
      return NextResponse.json({ error: "action must be 'awaiting_information' or 'rework_required'" }, { status: 400, headers: CORS });
    }
    if (action === 'rework_required' && !notes.trim()) {
      return NextResponse.json({ error: 'A reason is mandatory when requesting rework.' }, { status: 400, headers: CORS });
    }

    const reqRows = await db.$queryRawUnsafe(`SELECT * FROM "BgvRequest" WHERE "id"=$1 LIMIT 1`, requestId).catch(() => []) as any[];
    if (!reqRows.length) return NextResponse.json({ error: 'Request not found' }, { status: 404, headers: CORS });
    const bgvReq = reqRows[0];

    if (BGV_TERMINAL_STATUSES.includes(bgvReq.status)) {
      return NextResponse.json({ error: `Request is already ${labelForStatus(bgvReq.status)} — no further review actions possible.` }, { status: 409, headers: CORS });
    }

    const reworkDue = dueDate && !isNaN(dueDate.getTime()) ? dueDate : null;

    await db.$executeRawUnsafe(
      `UPDATE "BgvRequest"
          SET "status"=$1,
              "reworkReason"=$2, "reworkChecks"=$3, "reworkDueDate"=$4,
              "instructions"=COALESCE(NULLIF($5,''), "instructions"),
              "updatedAt"=NOW()
        WHERE "id"=$6`,
      action,
      action === 'rework_required' ? notes : bgvReq.reworkReason,
      action === 'rework_required' ? (checkIds.length ? JSON.stringify(checkIds) : null) : bgvReq.reworkChecks,
      reworkDue,
      notes ? `[HR ${new Date().toISOString()}] ${notes}` : '',
      requestId,
    );

    // Record the HR decision on the latest submitted report (if any).
    if (bgvReq.status === 'submitted_for_hr_review') {
      await db.$executeRawUnsafe(
        `UPDATE "BgvReport"
            SET "hrDecision"=$1,"hrDecisionById"=$2,"hrDecisionAt"=NOW(),
                "hrDecisionReason"=$3,"hrDecisionNotes"=$3
          WHERE "bgvRequestId"=$4 AND "version" = (SELECT MAX("version") FROM "BgvReport" WHERE "bgvRequestId"=$4)`,
        action === 'awaiting_information' ? 'awaiting_information' : 'rework_required',
        auth.userId, notes || null, requestId,
      ).catch(() => 0);
    }

    // ── Notify: assigned investigator + vendor admin(s) (never just "first admin").
    const vendorAdmins = await db.$queryRawUnsafe(
      `SELECT "email","id","name" FROM "VendorUser" WHERE "vendorCompanyId"=$1 AND "role"='vendor_admin' AND "status"='active'`,
      bgvReq.vendorCompanyId,
    ).catch(() => []) as any[];
    let assignee: any = null;
    if (bgvReq.assignedVendorUserId) {
      const a = await db.$queryRawUnsafe(
        `SELECT "email","id","name" FROM "VendorUser" WHERE "id"=$1 LIMIT 1`, bgvReq.assignedVendorUserId,
      ).catch(() => []) as any[];
      assignee = a[0] || null;
    }

    const baseUrl = resolveBaseUrl(req);
    const checkLabels: string[] = [];
    if (checkIds.length) {
      const placeholders = checkIds.map((_, i) => `$${i + 1}`).join(',');
      const rows = await db.$queryRawUnsafe(
        `SELECT "checkLabel","checkType" FROM "BgvCheck" WHERE "bgvRequestId"=$${checkIds.length + 1} AND "id" IN (${placeholders})`,
        ...checkIds, requestId,
      ).catch(() => []) as any[];
      for (const r of rows) checkLabels.push(r.checkLabel || r.checkType);
    }

    const subject = action === 'rework_required'
      ? `Rework requested: BGV case ${bgvReq.caseNumber || requestId} (${bgvReq.candidateName || bgvReq.candidateEmail})`
      : `More information needed: BGV case ${bgvReq.caseNumber || requestId}`;
    const html = `<p>HR has requested <b>${action === 'rework_required' ? 'rework' : 'additional information'}</b> for BGV case <b>${bgvReq.caseNumber || requestId}</b>.</p>
      <ul>
        <li>Candidate: ${bgvReq.candidateName || bgvReq.candidateEmail}</li>
        ${reworkDue ? `<li>Correct by: <b>${reworkDue.toISOString().slice(0, 10)}</b></li>` : ''}
        ${checkLabels.length ? `<li>Checks to correct: <b>${checkLabels.join(', ')}</b></li>` : '<li>Checks to correct: all (as per HR notes)</li>'}
        ${notes ? `<li>HR notes: <i>${notes.slice(0, 800)}</i></li>` : ''}
      </ul>
      <p>Your previously submitted versions are preserved. Open the case${baseUrl ? ` (<a href="${baseUrl}/vendor-portal/dashboard">vendor portal</a>)` : ''} to submit a corrected report — it will create a new version for HR review.</p>`;

    if (assignee) {
      await notifyBgvEvent({
        db, event: action, recipient: assignee.email, bgvRequestId: requestId,
        vendorCompanyId: bgvReq.vendorCompanyId, vendorUserId: assignee.id,
        subject, html,
      });
    }
    for (const va of vendorAdmins.slice(0, 3)) {
      await notifyBgvEvent({
        db, event: action, recipient: va.email, bgvRequestId: requestId,
        vendorCompanyId: bgvReq.vendorCompanyId, vendorUserId: va.id,
        subject, html,
      });
    }

    await db.auditLog.create({
      data: { userId: String(auth.userId || ''), action: 'BGV_REVIEW_INTERIM', module: 'bgv',
              details: `BGV request ${requestId} (${bgvReq.caseNumber || ''}) set to ${action}${notes ? ` — ${notes.slice(0, 200)}` : ''}${checkIds.length ? ` — checks: ${checkIds.join(',')}` : ''}` },
    }).catch(() => null);

    return NextResponse.json({
      message: action === 'rework_required'
        ? 'Rework requested — the investigator and vendor admin have been notified.'
        : 'Awaiting information — the vendor has been notified.',
      requestId, status: action,
    }, { headers: CORS });
  } catch (error) {
    console.error('BGV interim review error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}
