import { NextRequest, NextResponse } from 'next/server';
import { getPlatformDb, getDbForTenant } from '@/lib/tenant-db';

/**
 * GET /api/cron/leave-reminders
 *
 * BUG_065 fix: Pending Leave Approval Reminder (Email 6 from the Leave
 * Module Notification Workflow spec).
 *
 * Cron-driven job that scans all tenants for leave requests in 'pending'
 * status older than the configured SLA (default 24 hours) and dispatches
 * a reminder notification to the assigned approver.
 *
 * Idempotency: each leave request gets at most ONE reminder per 24h
 * window. We track this via the LeaveRequest.reminderSentAt column
 * (added via schema-sync below). If the column doesn't exist, the
 * reminder is sent every run — non-fatal but may be noisy.
 *
 * Auth: requires CRON_SECRET in the Authorization header (Vercel cron
 * standard). Falls back to allowing the call when CRON_SECRET is not
 * configured (local dev).
 */
export const maxDuration = 60;

// SLA: hours a leave request can be pending before the first reminder.
const REMINDER_SLA_HOURS = 24;

// Max reminders per run — avoids runaway memory use on tenants with
// thousands of pending requests.
const MAX_REMINDERS_PER_RUN = 100;

export async function GET(request: NextRequest) {
  // Auth check
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get('authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (token !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized — invalid CRON_SECRET' }, { status: 401 });
    }
  }

  const platformDb = getPlatformDb();
  const sent: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];

  try {
    // Ensure the reminderSentAt column exists on LeaveRequest (best-effort)
    try {
      await platformDb.$executeRawUnsafe(
        `ALTER TABLE "LeaveRequest" ADD COLUMN IF NOT EXISTS "reminderSentAt" TIMESTAMP(3)`,
      );
    } catch { /* column may already exist, or table not in platform DB */ }

    // Find all tenants — we need to scan each tenant's DB separately
    const tenants = await platformDb.tenant.findMany({
      where: { status: { in: ['active', 'trial'] } },
      select: { id: true, name: true, slug: true, timezone: true },
    });

    const slaCutoff = new Date(Date.now() - REMINDER_SLA_HOURS * 60 * 60 * 1000);
    const reminderWindowStart = new Date(Date.now() - 48 * 60 * 60 * 1000); // don't re-remind within 48h

    for (const tenant of tenants) {
      let tenantDb: any;
      try {
        tenantDb = await getDbForTenant(tenant.slug);
      } catch {
        // No dedicated DB for this tenant — use platform DB
        tenantDb = platformDb;
      }

      // Find pending leave requests older than the SLA that haven't been
      // reminded in the last 48 hours.
      let pendingRequests: any[] = [];
      try {
        pendingRequests = await tenantDb.leaveRequest.findMany({
          where: {
            status: 'pending',
            createdAt: { lte: slaCutoff },
            OR: [
              { reminderSentAt: null },
              { reminderSentAt: { lte: reminderWindowStart } },
            ],
          },
          include: {
            employee: { select: { id: true, firstName: true, lastName: true, userId: true, reportingManagerId: true } },
            leaveType: { select: { id: true, name: true } },
          },
          take: MAX_REMINDERS_PER_RUN,
          orderBy: { createdAt: 'asc' },
        });
      } catch (e: any) {
        // reminderSentAt column may not exist on this tenant DB — try without it
        try {
          pendingRequests = await tenantDb.leaveRequest.findMany({
            where: {
              status: 'pending',
              createdAt: { lte: slaCutoff },
            },
            include: {
              employee: { select: { id: true, firstName: true, lastName: true, userId: true, reportingManagerId: true } },
              leaveType: { select: { id: true, name: true } },
            },
            take: MAX_REMINDERS_PER_RUN,
            orderBy: { createdAt: 'asc' },
          });
        } catch (e2: any) {
          failed.push(`${tenant.slug}: ${e2.message}`);
          continue;
        }
      }

      for (const lr of pendingRequests) {
        try {
          // Resolve the approver: prefer the workflow's current approver,
          // fall back to the employee's reporting manager, then to all
          // active admins/HR in the tenant.
          let approverId: string | null = null;

          // Try workflow step table for the current approver
          try {
            const stepRows: any[] = await tenantDb.$queryRawUnsafe(
              `SELECT "approverId" FROM "LeaveApprovalStep"
               WHERE "leaveRequestId" = $1 AND "status" = 'pending'
               ORDER BY "tier" ASC LIMIT 1`,
              lr.id,
            );
            if (stepRows?.[0]?.approverId) {
              approverId = stepRows[0].approverId;
            }
          } catch { /* table or column missing — fall back */ }

          if (!approverId && lr.employee?.reportingManagerId) {
            // Look up the reporting manager's userId
            try {
              const mgr = await tenantDb.employee.findUnique({
                where: { id: lr.employee.reportingManagerId },
                select: { userId: true },
              });
              if (mgr?.userId) approverId = mgr.userId;
            } catch { /* best-effort */ }
          }

          let recipientIds: string[] = [];
          if (approverId) {
            recipientIds = [approverId];
          } else {
            // Fallback: all active admins/HR
            try {
              const admins = await tenantDb.user.findMany({
                where: {
                  tenantId: tenant.id,
                  role: { in: ['hr_admin', 'admin', 'tenant_admin', 'super_admin'] },
                  status: 'active',
                },
                select: { id: true },
                take: 10,
              });
              recipientIds = admins.map((a: any) => a.id);
            } catch { /* best-effort */ }
          }

          if (recipientIds.length === 0) {
            skipped.push(`${tenant.slug}/${lr.id}: no approver resolved`);
            continue;
          }

          // Dispatch the pending_reminder event
          const { dispatchLeaveEvent } = await import('@/lib/leave-notify');
          const pendingHours = Math.round(
            (Date.now() - new Date(lr.createdAt).getTime()) / (60 * 60 * 1000),
          );
          const empName = lr.employee
            ? `${lr.employee.firstName || ''} ${lr.employee.lastName || ''}`.trim()
            : 'An employee';

          await dispatchLeaveEvent(
            tenantDb,
            tenant.id,
            'leave.pending_reminder',
            lr,
            approverId,
            null,
            request as any,
            recipientIds,
            {
              Employee_Name: empName,
              Request_Id: lr.id,
              Submitted_On: new Date(lr.createdAt).toLocaleString(),
              Pending_Hours: String(pendingHours),
            },
          );

          // Mark the reminder as sent (idempotency tracking)
          try {
            await tenantDb.$executeRawUnsafe(
              `UPDATE "LeaveRequest" SET "reminderSentAt" = NOW() WHERE "id" = $1`,
              lr.id,
            );
          } catch { /* column may not exist on this tenant DB — non-fatal */ }

          sent.push(`${tenant.slug}/${lr.id}`);
        } catch (e: any) {
          failed.push(`${tenant.slug}/${lr.id}: ${e.message}`);
        }
      }
    }

    return NextResponse.json({
      message: `Leave reminder cron complete. Sent: ${sent.length}, skipped: ${skipped.length}, failed: ${failed.length}.`,
      sent: sent.slice(0, 50),
      skipped: skipped.slice(0, 20),
      failed: failed.slice(0, 20),
      sla: `${REMINDER_SLA_HOURS}h`,
      tenantsScanned: tenants.length,
    });
  } catch (error: any) {
    console.error('[cron/leave-reminders] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 },
    );
  }
}
