/**
 * Actionable Notification — public token API (Task 36)
 *
 *   GET  /api/notifications/action/[token]?tenant=<slug>  — context for the action page
 *   POST /api/notifications/action/[token]?tenant=<slug>  — { action: 'approve'|'reject', comment? }
 *
 * No auth: recipients act directly from email / Slack / Teams. The token is
 * minted per recipient when the actionable notification is dispatched, is
 * single-use, and expires after the template's expiresHours window.
 * Tenant resolution comes from the ?tenant= query param (middleware
 * gives it the highest priority) so links work from any mail client.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getDbForTenant } from '@/lib/tenant-db';
import { getActionHandler } from '@/lib/notification-actions';

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() { return NextResponse.json({}, { headers: cors() }); }

async function loadDelivery(db: any, token: string) {
  // actionToken is shared across channels for one recipient — pick the newest
  const delivery = await db.notificationDelivery.findFirst({
    where: { actionToken: token },
    orderBy: { createdAt: 'desc' },
  });
  if (!delivery) return { error: 'This action link is invalid or has expired.', status: 404 as const };
  if (delivery.actionedAt || delivery.actionResult) {
    return { error: `This request was already ${delivery.actionResult || 'actioned'}.`, status: 409 as const };
  }
  if (delivery.actionExpiresAt && new Date(delivery.actionExpiresAt).getTime() < Date.now()) {
    return { error: 'This action link has expired. Please act from the HRMS platform.', status: 410 as const };
  }
  return { delivery };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const tenantSlug = new URL(req.url).searchParams.get('tenant') || '';
    const db = await getDbForTenant(tenantSlug);

    const loaded = await loadDelivery(db, token);
    if ('error' in loaded) return NextResponse.json({ error: loaded.error }, { status: loaded.status, headers: cors() });
    const d = loaded.delivery as any;

    // Human-friendly context about the underlying request
    let context: Record<string, unknown> = {};
    try {
      if (d.entityType === 'leave_request' && d.entityId) {
        const lr = await (db as any).leaveRequest.findUnique({
          where: { id: d.entityId },
          select: { leaveType: { select: { name: true } }, startDate: true, endDate: true, reason: true, status: true, employee: { select: { firstName: true, lastName: true, employeeId: true } } },
        });
        if (lr) {
          const days = lr.startDate && lr.endDate
            ? Math.max(1, Math.round((new Date(lr.endDate).getTime() - new Date(lr.startDate).getTime()) / 86400000) + 1)
            : null;
          context = {
            employeeName: lr.employee ? `${lr.employee.firstName || ''} ${lr.employee.lastName || ''}`.trim() : 'Employee',
            fields: [
              ['Leave type', lr.leaveType?.name || '—'],
              ['From', lr.startDate ? new Date(lr.startDate).toLocaleDateString('en-IN') : '—'],
              ['To', lr.endDate ? new Date(lr.endDate).toLocaleDateString('en-IN') : '—'],
              ['Days', days ? String(days) : '—'],
              ['Reason', lr.reason || '—'],
              ['Current status', lr.status],
            ],
          };
        }
      } else if (d.entityType === 'attendance_request' && d.entityId) {
        const ar = await (db as any).attendanceRequest.findUnique({
          where: { id: d.entityId },
          select: { requestType: true, requestDate: true, reason: true, status: true, employee: { select: { firstName: true, lastName: true, employeeId: true } } },
        });
        if (ar) {
          context = {
            employeeName: ar.employee ? `${ar.employee.firstName || ''} ${ar.employee.lastName || ''}`.trim() : 'Employee',
            fields: [
              ['Request type', ar.requestType || '—'],
              ['Date', ar.requestDate ? new Date(ar.requestDate).toLocaleDateString('en-IN') : '—'],
              ['Reason', ar.reason || '—'],
              ['Current status', ar.status],
            ],
          };
        }
      } else if (d.entityType === 'employee_update_request' && d.entityId) {
        const ur = await (db as any).employeeUpdateRequest.findUnique({
          where: { id: d.entityId },
          select: { fieldName: true, oldValue: true, newValue: true, status: true, employee: { select: { firstName: true, lastName: true, employeeId: true } } },
        });
        if (ur) {
          context = {
            employeeName: ur.employee ? `${ur.employee.firstName || ''} ${ur.employee.lastName || ''}`.trim() : 'Employee',
            fields: [
              ['Field', ur.fieldName || '—'],
              ['Old value', String(ur.oldValue ?? '—')],
              ['New value', String(ur.newValue ?? '—')],
              ['Current status', ur.status],
            ],
          };
        }
      } else if (d.entityType === 'requisition' && d.entityId) {
        const rq = await (db as any).requisition.findUnique({ where: { id: d.entityId }, select: { title: true, department: true, openings: true, status: true } });
        if (rq) {
          context = {
            employeeName: rq.title,
            fields: [
              ['Department', rq.department || '—'],
              ['Openings', String(rq.openings ?? '—')],
              ['Current status', rq.status],
            ],
          };
        }
      }
    } catch (e) {
      console.warn('[NotificationAction] context load failed:', (e as Error).message);
    }

    return NextResponse.json(
      {
        subject: d.subject,
        module: d.module,
        eventKey: d.eventKey,
        channel: d.channel,
        recipientName: d.recipientName,
        entityType: d.entityType,
        expiresAt: d.actionExpiresAt,
        createdAt: d.createdAt,
        context,
      },
      { headers: cors() },
    );
  } catch (error) {
    console.error('Notification action GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: cors() });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const tenantSlug = new URL(req.url).searchParams.get('tenant') || '';
    const db = await getDbForTenant(tenantSlug);
    const body = await req.json().catch(() => ({}));
    const action = body?.action === 'reject' ? 'reject' : body?.action === 'approve' ? 'approve' : null;
    if (!action) return NextResponse.json({ error: 'action must be approve or reject' }, { status: 400, headers: cors() });

    const loaded = await loadDelivery(db, token);
    if ('error' in loaded) return NextResponse.json({ error: loaded.error }, { status: loaded.status, headers: cors() });
    const d = loaded.delivery as any;

    if (!d.entityType || !d.entityId) {
      return NextResponse.json({ error: 'This notification does not support actions' }, { status: 400, headers: cors() });
    }
    const handler = getActionHandler(d.entityType);
    if (!handler) {
      return NextResponse.json({ error: `No action handler for ${d.entityType}` }, { status: 400, headers: cors() });
    }

    // Actor: the token owner (approver) — fall back to system for candidate-side flows
    const actorUserId = d.recipientId || 'system';
    const result = await handler({
      db, entityId: d.entityId, action, comment: body?.comment, actorUserId,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.message }, { status: 400, headers: cors() });
    }

    // Record the action on ALL deliveries sharing this token (multi-channel)
    await db.notificationDelivery.updateMany({
      where: { actionToken: token },
      data: { actionedAt: new Date(), actionResult: action === 'approve' ? 'approved' : 'rejected', actionComment: body?.comment || null },
    });

    // Acknowledge the requester (best-effort)
    try {
      const { dispatchNotification } = await import('@/lib/notification-center');
      const moduleOf = d.module;
      const ackKey =
        moduleOf === 'leave' ? (action === 'approve' ? 'leave.approved' : 'leave.rejected')
        : moduleOf === 'attendance' ? 'attendance.request.result'
        : moduleOf === 'core_hr' ? 'core_hr.profile.update_result'
        : null;
      if (ackKey) {
        const entity = await loadAckTarget(db, d.entityType, d.entityId);
        if (entity?.tenantId && entity?.requesterUserId) {
          await dispatchNotification({
            tenantId: entity.tenantId,
            module: moduleOf,
            eventKey: ackKey,
            recipients: [{ userId: entity.requesterUserId }],
            vars: {
              Field_Name: entity.fieldName || '',
              Status: action === 'approve' ? 'approved' : 'rejected',
              Approver_Name: d.recipientName || 'Your approver',
              Comment: body?.comment ? `Comments: ${body.comment}` : '',
              Request_Type: entity.requestType || '',
              Request_Date: entity.requestDate || '',
            },
            entity: { type: d.entityType, id: d.entityId, link: d.entityLink || undefined },
          });
        }
      }
    } catch (e) {
      console.warn('[NotificationAction] ack dispatch failed:', (e as Error).message);
    }

    return NextResponse.json({ success: true, message: result.message, finalized: result.finalized ?? true }, { headers: cors() });
  } catch (error) {
    console.error('Notification action POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: cors() });
  }
}

async function loadAckTarget(db: any, entityType: string, entityId: string) {
  try {
    if (entityType === 'leave_request') {
      const lr = await (db as any).leaveRequest.findUnique({ where: { id: entityId }, select: { tenantId: true, employee: { select: { userId: true } } } });
      return { tenantId: lr?.tenantId, requesterUserId: lr?.employee?.userId || null };
    }
    if (entityType === 'attendance_request') {
      const ar = await (db as any).attendanceRequest.findUnique({ where: { id: entityId }, select: { tenantId: true, employee: { select: { userId: true } }, requestType: true, requestDate: true } });
      return { tenantId: ar?.tenantId, requesterUserId: ar?.employee?.userId || null, requestType: ar?.requestType, requestDate: ar?.requestDate ? new Date(ar.requestDate).toLocaleDateString('en-IN') : '' };
    }
    if (entityType === 'employee_update_request') {
      const ur = await (db as any).employeeUpdateRequest.findUnique({ where: { id: entityId }, select: { tenantId: true, employee: { select: { userId: true } }, fieldName: true } });
      return { tenantId: ur?.tenantId, requesterUserId: ur?.employee?.userId || null, fieldName: ur?.fieldName };
    }
  } catch { /* best-effort */ }
  return null;
}
