/**
 * Document Expiry Cron (Task 36)
 *
 *   GET /api/cron/document-expiry?secret=CRON_SECRET
 *
 * Sweeps Document.expiryDate across tenants and notifies the employee + HR
 * at 30 / 7 / 1 days before expiry (once per threshold per document, deduped
 * through the NotificationDelivery log).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getPlatformDb, getDbForTenantById } from '@/lib/tenant-db';
import { dispatchNotification } from '@/lib/notification-center';

const CRON_SECRET = process.env.CRON_SECRET || '3boxes-hrms-cron-2026';
const THRESHOLDS = [30, 7, 1];

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() { return NextResponse.json({}, { headers: cors() }); }

export async function GET(request: NextRequest) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const bearer = request.headers.get('authorization');
    const bearerToken = bearer?.startsWith('Bearer ') ? bearer.slice(7).trim() : null;
    if (searchParams.get('secret') !== CRON_SECRET && bearerToken !== CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: cors() });
    }

    const platformDb = getPlatformDb();
    const tenants = await platformDb.tenant.findMany({ where: { status: 'active' }, select: { id: true, name: true } });

    let alertsSent = 0;
    const details: any[] = [];

    for (const tenant of tenants) {
      try {
        const db = await getDbForTenantById(tenant.id);
        alertsSent += await sweepTenant(db, tenant.id, tenant.name, details);
      } catch (e) {
        console.warn(`[DocExpiryCron] tenant ${tenant.id} failed: ${(e as Error).message}`);
      }
    }

    return NextResponse.json({ success: true, alertsSent, details, checkedAt: new Date().toISOString() }, { headers: cors() });
  } catch (error) {
    console.error('Document expiry cron error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: cors() });
  }
}

async function alreadySent(db: any, entityId: string, recipientId: string, sinceDays: number): Promise<boolean> {
  const since = new Date(Date.now() - sinceDays * 24 * 3600 * 1000);
  const count = await db.notificationDelivery.count({
    where: { eventKey: 'core_hr.document.expiring', entityType: 'document', entityId, recipientId, createdAt: { gte: since } },
  }).catch(() => 1); // on error, assume already sent (safer than spamming)
  return count > 0;
}

async function sweepTenant(db: any, tenantId: string, tenantName: string, details: any[]): Promise<number> {
  const now = new Date();
  const maxWindow = new Date(now.getTime() + 31 * 24 * 3600 * 1000);
  const docs = await db.document.findMany({
    where: { expiryDate: { gte: now, lte: maxWindow }, status: 'active' },
    select: {
      id: true, name: true, type: true, expiryDate: true, employeeId: true,
      employee: { select: { userId: true, firstName: true, lastName: true, email: true } },
    },
    take: 300,
  }).catch(() => []);
  if (!docs.length) return 0;

  const hrAdmins = await db.user.findMany({
    where: { role: { in: ['hr_admin', 'admin', 'company_hr_admin'] }, status: 'active' },
    select: { id: true },
    take: 15,
  }).catch(() => []);

  let sent = 0;
  for (const doc of docs) {
    const daysLeft = Math.ceil((new Date(doc.expiryDate).getTime() - now.getTime()) / 86400000);
    if (!THRESHOLDS.includes(daysLeft)) continue;

    const emp = doc.employee || {};
    const empName = `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || 'An employee';
    const vars = {
      Employee_Name: empName,
      Document_Name: doc.name,
      Expiry_Date: new Date(doc.expiryDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
      Days_Left: String(daysLeft),
    };

    // Employee first (dedupe per threshold)
    if (emp.userId && !(await alreadySent(db, doc.id, emp.userId, 28))) {
      const res = await dispatchNotification({
        tenantId, module: 'core_hr', eventKey: 'core_hr.document.expiring',
        recipients: [{ userId: emp.userId, name: empName }],
        vars, entity: { type: 'document', id: doc.id, link: '/documents' },
      });
      sent += res.deliveries.filter((d) => d.status === 'sent').length;
    }
    // HR admins (dedupe per doc)
    for (const hr of hrAdmins) {
      if (await alreadySent(db, doc.id, hr.id, 28)) continue;
      const res = await dispatchNotification({
        tenantId, module: 'core_hr', eventKey: 'core_hr.document.expiring',
        recipients: [{ userId: hr.id }],
        vars, entity: { type: 'document', id: doc.id, link: '/documents' },
      });
      sent += res.deliveries.filter((d) => d.status === 'sent').length;
    }
    details.push({ tenant: tenantName, doc: doc.name, daysLeft });
  }
  return sent;
}
