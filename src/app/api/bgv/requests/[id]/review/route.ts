import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { getAuthInfo } from '@/lib/companyScope';

const CORS = { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization' };
export async function OPTIONS() { return NextResponse.json({}, { headers: CORS }); }

/**
 * BUG-4 fix: POST /api/bgv/requests/[id]/review — HR interim review actions.
 *
 * 'awaiting_information' — the vendor must supply more info/documents before
 *   HR can decide (candidate/vendor is asked for additional input).
 * 'rework_required'      — the submitted report is not acceptable as-is; the
 *   vendor must fix findings and resubmit.
 *
 * Both statuses were previously rendered in the /bgv-dashboard and
 * /vendor-portal dashboards but never set by any API — dead states. The
 * vendor portal already supports working on a request in any non-terminal
 * status and resubmitting a new report version, which flips the request
 * back to 'submitted_for_hr_review'.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(req);
  try {
    const auth = await getAuthInfo(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
    const isAdmin = ['super_admin','tenant_admin','ceo','admin','hr_admin','company_hr_admin'].includes(auth.role);
    if (!isAdmin) return NextResponse.json({ error: 'Forbidden — HR/Admin only' }, { status: 403, headers: CORS });

    const { id: requestId } = await params;
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');
    const notes = String(body.notes || '').slice(0, 2000);

    if (!['awaiting_information', 'rework_required'].includes(action)) {
      return NextResponse.json({ error: "action must be 'awaiting_information' or 'rework_required'" }, { status: 400, headers: CORS });
    }

    const reqRows = await db.$queryRawUnsafe(`SELECT * FROM "BgvRequest" WHERE "id"=$1 LIMIT 1`, requestId).catch(() => []) as any[];
    if (reqRows.length === 0) return NextResponse.json({ error: 'Request not found' }, { status: 404, headers: CORS });
    const bgvReq = reqRows[0];

    const terminal = ['approved_by_hr', 'rejected_by_hr', 'cancelled'];
    if (terminal.includes(bgvReq.status)) {
      return NextResponse.json({ error: `Request is already ${bgvReq.status} — no further review actions possible` }, { status: 409, headers: CORS });
    }

    await db.$executeRawUnsafe(
      `UPDATE "BgvRequest" SET "status"=$1, "instructions" = COALESCE(NULLIF($2,''), "instructions"), "updatedAt"=NOW() WHERE "id"=$3`,
      action, notes ? `[HR ${new Date().toISOString()}] ${notes}` : '', requestId,
    );

    // Record the HR decision on the latest submitted report, if any
    if (bgvReq.status === 'submitted_for_hr_review') {
      const decision = action === 'awaiting_information' ? 'awaiting_information' : 'rework_required';
      await db.$executeRawUnsafe(
        `UPDATE "BgvReport" SET "hrDecision"=$1,"hrDecisionById"=$2,"hrDecisionAt"=NOW(),"hrDecisionNotes"=$3
          WHERE "bgvRequestId"=$4 AND "status"='submitted'`,
        decision, auth.userId, notes || null, requestId,
      ).catch(() => 0);
    }

    // Notify the vendor admin by email (non-fatal)
    try {
      const vendorRows = await db.$queryRawUnsafe(`SELECT "name","email" FROM "VendorCompany" WHERE "id"=$1 LIMIT 1`, bgvReq.vendorCompanyId).catch(() => []) as any[];
      const adminRows = await db.$queryRawUnsafe(`SELECT "email" FROM "VendorUser" WHERE "vendorCompanyId"=$1 AND "role"='vendor_admin' AND "status"='active' LIMIT 1`, bgvReq.vendorCompanyId).catch(() => []) as any[];
      if (adminRows[0]?.email) {
        const { sendEmail } = await import('@/lib/email');
        const subject = action === 'awaiting_information'
          ? `Action needed: more information required for BGV of ${bgvReq.candidateName}`
          : `Rework required: BGV report for ${bgvReq.candidateName}`;
        await sendEmail({
          to: adminRows[0].email,
          subject,
          html: `<p>${action === 'awaiting_information'
            ? 'HR needs additional information before the report can be accepted. Please update the request and resubmit.'
            : 'The submitted report requires rework. Please address the findings and resubmit a new report version.'}</p>${notes ? `<p><strong>HR notes:</strong> ${notes}</p>` : ''}<p>Request: ${requestId} — vendor: ${vendorRows[0]?.name || ''}</p>`,
        }).catch(() => null);
      }
    } catch { /* email optional */ }

    await db.auditLog.create({
      data: { userId: String((auth as any).userId || ''), action: 'BGV_REVIEW_INTERIM', module: 'bgv', details: `BGV request ${requestId} set to ${action}${notes ? ` — ${notes}` : ''}` },
    }).catch(() => null);

    return NextResponse.json({ message: `Request marked ${action === 'awaiting_information' ? 'Awaiting Information' : 'Rework Required'}.`, requestId, status: action }, { headers: CORS });
  } catch (error) {
    console.error('BGV interim review error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}
