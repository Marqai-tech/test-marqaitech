import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { getAuthInfo } from '@/lib/companyScope';
import { notifyBgvEvent, BGV_TERMINAL_STATUSES, BGV_WORKABLE_STATUSES, labelForStatus } from '@/lib/bgv';

const CORS = { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization' };
export async function OPTIONS() { return NextResponse.json({}, { headers: CORS }); }

/**
 * POST /api/vendor/requests/[id]/assign — vendor admin assigns/reassigns a case
 * to one active employee of the SAME company (mock screen 09).
 *
 * Hardened per the vendor-access brief (fix #4):
 *  - Admin identity and vendor membership are resolved from the CURRENT DB
 *    row (status must be active) — stale tokens grant nothing.
 *  - Target employee must be an ACTIVE vendor_employee of the same vendor
 *    company and tenant.
 *  - Request state machine: only awaiting_assignment / rework_required cases
 *    can be (re)assigned. Final cases can never be reopened by assigning.
 *  - Optimistic concurrency: caller passes expectedVersion; if another admin
 *    changed the case meanwhile → 409 with the fresh state (UI refreshes).
 *  - Reassignment requires a reason, writes BgvAssignment history and revokes
 *    the previous assignee's access immediately.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(req);
  try {
    const auth = await getAuthInfo(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
    if (auth.role !== 'vendor_admin') return NextResponse.json({ error: 'Forbidden — vendor admin only' }, { status: 403, headers: CORS });

    // Current vendor-admin record (DB, not token claims).
    const adminRows = await db.$queryRawUnsafe(
      `SELECT * FROM "VendorUser" WHERE "email"=$1 AND "role"='vendor_admin' AND "status"='active' LIMIT 1`,
      auth.email,
    ).catch(() => []) as any[];
    if (adminRows.length === 0) return NextResponse.json({ error: 'Vendor admin not found or inactive' }, { status: 403, headers: CORS });
    const admin = adminRows[0];

    const { id: requestId } = await params;
    const body = await req.json();
    const { vendorUserId, reason, expectedVersion, dueDate, instructions } = body || {};
    if (!vendorUserId) return NextResponse.json({ error: 'vendorUserId required' }, { status: 400, headers: CORS });

    // Target employee: active vendor_employee of the SAME vendor.
    const empRows = await db.$queryRawUnsafe(
      `SELECT * FROM "VendorUser" WHERE "id"=$1 AND "vendorCompanyId"=$2 AND "role"='vendor_employee' AND "status"='active' LIMIT 1`,
      vendorUserId, admin.vendorCompanyId,
    ).catch(() => []) as any[];
    if (empRows.length === 0) {
      return NextResponse.json({ error: 'Employee not found, not an active employee of your company, or already disabled' }, { status: 403, headers: CORS });
    }
    const emp = empRows[0];

    // Request: must belong to this vendor.
    const reqRows = await db.$queryRawUnsafe(
      `SELECT * FROM "BgvRequest" WHERE "id"=$1 AND "vendorCompanyId"=$2 LIMIT 1`,
      requestId, admin.vendorCompanyId,
    ).catch(() => []) as any[];
    if (reqRows.length === 0) return NextResponse.json({ error: 'Request not found or not in your vendor' }, { status: 404, headers: CORS });
    const bgvReq = reqRows[0];

    if (BGV_TERMINAL_STATUSES.includes(bgvReq.status)) {
      return NextResponse.json({ error: `This case is final (${labelForStatus(bgvReq.status)}) and cannot be assigned.` }, { status: 409, headers: CORS });
    }
    if (bgvReq.status === 'submitted_for_hr_review' || bgvReq.status === 'awaiting_information') {
      return NextResponse.json(
        { error: `This case is ${labelForStatus(bgvReq.status)} — assignment is not possible while HR review is in flight.` },
        { status: 409, headers: CORS },
      );
    }

    // Reassignment must come with a reason.
    const isReassignment = Boolean(bgvReq.assignedVendorUserId) && bgvReq.assignedVendorUserId !== vendorUserId;
    if (isReassignment && !String(reason || '').trim()) {
      return NextResponse.json({ error: 'A reason is required when reassigning a case to another employee.' }, { status: 400, headers: CORS });
    }

    // Optimistic concurrency (409 + fresh state so the UI can refresh).
    if (expectedVersion !== undefined && Number(expectedVersion) !== Number(bgvReq.version || 0)) {
      return NextResponse.json(
        { error: 'This case was just changed by someone else. The list below has been refreshed — please assign again.', code: 'CONFLICT', currentStatus: bgvReq.status, currentAssignee: bgvReq.assignedVendorUserId },
        { status: 409, headers: CORS },
      );
    }

    // ── Assignment history (BgvAssignment = open-interval audit trail).
    // Every assignment event opens a row for the new holder; a reassignment to
    // a DIFFERENT employee closes the previous open row first. The first
    // assignment also gets a row — without it the history table only ever
    // records unassignment events (found during the live E2E: assignments
    // came back empty for a freshly assigned case).
    const holderChanged = Boolean(bgvReq.assignedVendorUserId) && bgvReq.assignedVendorUserId !== vendorUserId;
    if (holderChanged) {
      await db.$executeRawUnsafe(
        `UPDATE "BgvAssignment"
            SET "unassignedAt"=NOW(), "unassignedById"=$1,
                "reason"=COALESCE("reason", $2)
          WHERE "bgvRequestId"=$3 AND "vendorUserId"=$4 AND "unassignedAt" IS NULL`,
        admin.id,
        holderChanged && isReassignment ? String(reason).slice(0, 500) : 'Assignment changed',
        requestId, bgvReq.assignedVendorUserId,
      ).catch(() => 0);
    }
    // Never duplicate an open row for the same holder (re-assigning the same
    // employee just refreshes due date/instructions on the request itself).
    const openRows = await db.$queryRawUnsafe(
      `SELECT "id" FROM "BgvAssignment" WHERE "bgvRequestId"=$1 AND "vendorUserId"=$2 AND "unassignedAt" IS NULL LIMIT 1`,
      requestId, vendorUserId,
    ).catch(() => []) as any[];
    if (openRows.length === 0) {
      await db.$executeRawUnsafe(
        `INSERT INTO "BgvAssignment" ("id","bgvRequestId","vendorUserId","assignedById","assignedAt","reason")
         VALUES ($1,$2,$3,$4,NOW(),$5)`,
        `asg-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
        requestId, vendorUserId, admin.id,
        isReassignment ? String(reason).slice(0, 500) : 'Initial assignment',
      ).catch(() => 0);
    }

    const nextStatus = BGV_WORKABLE_STATUSES.includes(bgvReq.status) ? bgvReq.status : 'assigned';
    await db.$executeRawUnsafe(
      `UPDATE "BgvRequest"
          SET "assignedVendorUserId"=$1, "assignedById"=$2, "assignedAt"=NOW(),
              "status"=$3, "version"="version"+1,
              "dueDate"=COALESCE($4::timestamptz, "dueDate"),
              "instructions"=COALESCE(NULLIF($5,''), "instructions"),
              "updatedAt"=NOW()
        WHERE "id"=$6 AND "version"=$7`,
      vendorUserId, admin.id, nextStatus,
      dueDate ? new Date(dueDate) : null, String(instructions || ''), requestId, bgvReq.version || 0,
    );

    // Notify the new assignee + keep admins informed.
    await notifyBgvEvent({
      db,
      event: isReassignment ? 'reassigned' : 'assigned',
      recipient: emp.email,
      bgvRequestId: requestId,
      vendorCompanyId: admin.vendorCompanyId,
      vendorUserId: emp.id,
      subject: `BGV case ${bgvReq.caseNumber || requestId} assigned to you`,
      html: `<p>A BGV case was assigned to you:</p>
             <ul>
               <li>Candidate: <b>${bgvReq.candidateName || bgvReq.candidateEmail}</b></li>
               <li>Case ID: <b>${bgvReq.caseNumber || requestId}</b></li>
               <li>Due date: <b>${bgvReq.dueDate ? new Date(bgvReq.dueDate).toISOString().slice(0, 10) : '—'}</b></li>
               ${isReassignment && reason ? `<li>Reassignment reason: ${String(reason).slice(0, 300)}</li>` : ''}
             </ul>
             <p>Open your <b>My Cases</b> workspace in the vendor portal to start verification.</p>`,
    });
    if (isReassignment) {
      const prevRows = await db.$queryRawUnsafe(
        `SELECT "email" FROM "VendorUser" WHERE "id"=$1 LIMIT 1`, bgvReq.assignedVendorUserId,
      ).catch(() => []) as any[];
      if (prevRows[0]?.email) {
        await notifyBgvEvent({
          db, event: 'reassigned_previous', recipient: prevRows[0].email,
          bgvRequestId: requestId, vendorCompanyId: admin.vendorCompanyId,
          subject: `BGV case ${bgvReq.caseNumber || requestId} was reassigned from you`,
          html: `<p>Case ${bgvReq.caseNumber || requestId} (${bgvReq.candidateName || bgvReq.candidateEmail}) was reassigned${reason ? ` — reason: ${String(reason).slice(0, 300)}` : ''}. Your access to this case has been removed.</p>`,
        });
      }
    }

    await db.auditLog.create({ data: { userId: admin.id, action: 'BGV_REQUEST_ASSIGNED', module: 'bgv', details: `${isReassignment ? 'Reassigned' : 'Assigned'} request ${requestId} (${bgvReq.caseNumber || ''}) to ${emp.email}${isReassignment ? ` — ${reason}` : ''}` } }).catch(() => null);

    return NextResponse.json({
      message: `Case assigned to ${emp.name} (${emp.email}).`,
      requestId, assignedTo: { id: emp.id, name: emp.name, email: emp.email },
      status: nextStatus, version: (bgvReq.version || 0) + 1,
    }, { headers: CORS });
  } catch (error) {
    console.error('BGV assign error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}
