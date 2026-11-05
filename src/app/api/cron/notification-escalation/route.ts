/**
 * Notification Escalation Cron (Task 36)
 *
 *   GET /api/cron/notification-escalation?secret=CRON_SECRET
 *
 * Implements the escalation matrix: when an approver does not act on an
 * actionable notification (leave / attendance / exit clearance / profile
 * update / requisition) within the configured window (default 48 hours),
 * the system escalates to the next level (module preference escalateToRole,
 * falling back to HR admins). Re-escalates every 24h until actioned.
 *
 * Multi-tenant: sweeps every dedicated tenant DB + shared tenants on the
 * platform DB. Recommended schedule: daily (Vercel Hobby) — the sweep is
 * window-based so daily execution still honors the 48h requirement.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getPlatformDb, getDbForTenantById } from '@/lib/tenant-db';
import { dispatchNotification } from '@/lib/notification-center';

const CRON_SECRET = process.env.CRON_SECRET || '3boxes-hrms-cron-2026';

// module → escalation event key (modules without one re-ping the original event)
const ESCALATION_EVENT: Record<string, string> = {
  leave: 'leave.escalated',
  attendance: 'attendance.escalated',
  exit: 'exit.escalated',
};

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() { return NextResponse.json({}, { headers: cors() }); }

interface PendingGroup {
  entityType: string;
  entityId: string;
  module: string;
  tenantId: string;
  oldestCreatedAt: Date;
  sample: any;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const bearer = request.headers.get('authorization');
    const bearerToken = bearer?.startsWith('Bearer ') ? bearer.slice(7).trim() : null;
    if (searchParams.get('secret') !== CRON_SECRET && bearerToken !== CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: cors() });
    }

    const platformDb = getPlatformDb();
    const tenants = await platformDb.tenant.findMany({ where: { status: 'active' }, select: { id: true, slug: true, name: true } });
    const dedicated = await platformDb.tenantDatabase.findMany({ where: { isActive: true }, select: { tenantId: true } });
    const dedicatedIds = new Set(dedicated.map((d: any) => d.tenantId));

    let escalated = 0;
    const details: any[] = [];

    for (const tenant of tenants) {
      try {
        const db = await getDbForTenantById(tenant.id);
        const count = await sweepTenant(db, tenant.id, tenant.name, details);
        escalated += count;
      } catch (e) {
        console.warn(`[EscalationCron] tenant ${tenant.slug} failed: ${(e as Error).message}`);
      }
    }
    void dedicatedIds;

    return NextResponse.json({ success: true, escalated, details, checkedAt: new Date().toISOString() }, { headers: cors() });
  } catch (error) {
    console.error('Notification escalation cron error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: cors() });
  }
}

async function sweepTenant(db: any, tenantId: string, tenantName: string, details: any[]): Promise<number> {
  // Load module-level escalation preferences
  let prefs: any[] = [];
  try {
    prefs = await db.notificationPreference.findMany({ where: { tenantId, scope: 'tenant' } });
  } catch { /* table may be missing */ }
  const prefFor = (module: string) => prefs.find((p: any) => p.module === module && !p.eventKey);

  // Pending actionable deliveries grouped by entity
  const pending = await db.notificationDelivery.findMany({
    where: { actionable: true, actionedAt: null, actionResult: null, entityType: { not: null }, entityId: { not: null } },
    orderBy: { createdAt: 'asc' },
    take: 500,
  });
  if (!pending.length) return 0;

  const groups = new Map<string, PendingGroup>();
  for (const d of pending) {
    const key = `${d.entityType}:${d.entityId}`;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        entityType: d.entityType, entityId: d.entityId, module: d.module,
        tenantId, oldestCreatedAt: d.createdAt, sample: d,
      });
    }
  }

  let escalated = 0;
  const now = Date.now();

  for (const g of groups.values()) {
    const pref = prefFor(g.module);
    if (pref && pref.escalationEnabled === false) continue;
    const hours = pref?.escalationHours ?? 48;
    const cutoff = now - hours * 3600 * 1000;
    if (new Date(g.oldestCreatedAt).getTime() > cutoff) continue;

    // Re-escalate at most every 24h
    const reCutoff = now - 24 * 3600 * 1000;
    if (g.sample.escalatedAt && new Date(g.sample.escalatedAt).getTime() > reCutoff) continue;

    const pendingHours = Math.floor((now - new Date(g.oldestCreatedAt).getTime()) / 3600000);
    const escalateToRole = pref?.escalateToRole || null;
    const escalateRoles = escalateToRole ? [escalateToRole] : ['hr_admin', 'admin', 'company_hr_admin'];

    const escUsers = await db.user.findMany({
      where: { role: { in: escalateRoles }, status: 'active' },
      select: { id: true, name: true },
      take: 10,
    }).catch(() => []);

    const evKey = ESCALATION_EVENT[g.module];
    const vars = buildEscalationVars(g, pendingHours);
    const entityLink = g.sample.entityLink || '/';

    if (evKey) {
      // Dedicated escalation event → notify next level AND remind the original approver
      const recipients = escUsers.map((u: any) => ({ userId: u.id, name: u.name || '' }));
      if (g.sample.recipientId && !recipients.some((r: any) => r.userId === g.sample.recipientId)) {
        recipients.push({ userId: g.sample.recipientId });
      }
      if (recipients.length) {
        await dispatchNotification({
          tenantId, module: g.module, eventKey: evKey, recipients, vars,
          entity: { type: g.entityType, id: g.entityId, link: entityLink },
        });
        escalated++;
      }
    } else {
      // No dedicated escalation event → re-send the original actionable event to next level
      const recipients = escUsers.map((u: any) => ({ userId: u.id, name: u.name || '' }));
      if (recipients.length && evKey !== undefined) {
        await dispatchNotification({
          tenantId, module: g.module, eventKey: g.sample.eventKey, recipients,
          vars: { ...vars, Pending_Hours: String(pendingHours) },
          entity: { type: g.entityType, id: g.entityId, link: entityLink },
        });
        escalated++;
      }
    }

    // Stamp escalation on ALL pending deliveries of this entity
    await db.notificationDelivery.updateMany({
      where: { entityType: g.entityType, entityId: g.entityId, actionable: true, actionedAt: null, actionResult: null },
      data: { escalatedAt: new Date(), escalationCount: { increment: 1 } },
    });

    details.push({ tenant: tenantName, entity: `${g.entityType}:${g.entityId.slice(-8)}`, module: g.module, pendingHours, notifiedRoles: escalateRoles });
  }

  return escalated;
}

function buildEscalationVars(g: PendingGroup, pendingHours: number): Record<string, string> {
  const meta = safeParse(g.sample.metadata);
  const common: Record<string, string> = {
    Pending_Hours: String(pendingHours),
    Original_Approver: g.sample.recipientName || 'the assigned approver',
    Employee_Name: meta.Employee_Name || meta.employeeName || meta.Employee_Name || 'an employee',
  };
  switch (g.module) {
    case 'leave':
      return {
        ...common,
        Leave_Type: meta.Leave_Type || 'leave',
        From_Date: meta.From_Date || '',
        To_Date: meta.To_Date || '',
      };
    case 'attendance':
      return {
        ...common,
        Request_Type: meta.Request_Type || 'attendance',
        Request_Date: meta.Request_Date || '',
      };
    case 'exit':
      return {
        ...common,
        Clearance_Item: meta.Clearance_Item || 'Exit clearance',
        Department: meta.Department || '',
      };
    default:
      return common;
  }
}

function safeParse(v: unknown): Record<string, string> {
  try {
    const parsed = typeof v === 'string' ? JSON.parse(v) : v;
    return parsed && typeof parsed === 'object' ? parsed as Record<string, string> : {};
  } catch { return {}; }
}
