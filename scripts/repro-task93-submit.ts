/**
 * Local reproduction of the missing probation.review_submitted dispatch.
 * Runs the REAL lib code (dispatchProbationEvent → dispatchNotification)
 * against the demo tenant DB with full console visibility.
 */
process.env.DATABASE_URL = 'postgresql://neondb_owner:npg_pxZd8woKe4WB@ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require';

async function main() {
  const { getPlatformDb, getDbForTenantById } = await import('../src/lib/tenant-db');
  const platformDb = getPlatformDb();
  const tenant = await (platformDb as any).tenant.findUnique({ where: { slug: '3boxes-hrms-demo' }, select: { id: true, slug: true } });
  if (!tenant) throw new Error('demo tenant not found');
  console.log('tenant:', tenant.id, tenant.slug);

  const db = await getDbForTenantById(tenant.id);
  console.log('tenant db resolved');

  // Mirror the POST route's resolution
  const { resolveProbationTierRecipients } = await import('../src/lib/probation-notify');
  const cfgRow = await (db as any).employeeWorkflowConfig.findFirst({
    where: { tenantId: tenant.id, workflowType: 'probation_confirmation', isActive: true },
    orderBy: { updatedAt: 'desc' },
  });
  const parsed = JSON.parse(cfgRow?.config || '{}');
  console.log('tiers:', JSON.stringify(parsed.tiers));

  const arjun = await (db as any).employee.findFirst({ where: { employeeId: 'EMP-TNS-003' }, select: { id: true, userId: true, firstName: true, lastName: true, employeeId: true } });
  console.log('employee:', arjun?.id, arjun?.userId);

  const recipients = await resolveProbationTierRecipients(db as any, parsed.tiers, 1, arjun.id);
  console.log('resolved tier1 recipients:', JSON.stringify(recipients));

  // Which users are these?
  for (const r of recipients) {
    const u = await (db as any).user.findUnique({ where: { id: r.userId }, select: { email: true, role: true, status: true } }).catch((e: Error) => ({ err: e.message }));
    console.log('  →', r.userId, JSON.stringify(u));
  }

  // Now the real dispatch for a FRESH pseudo-review (dedup will pass)
  const { dispatchProbationEvent } = await import('../src/lib/probation-notify');
  console.log('\n--- dispatching probation.review_submitted (local repro) ---');
  await dispatchProbationEvent({
    db: db as any,
    tenantId: tenant.id,
    eventKey: 'probation.review_submitted',
    reviewId: 'local-repro-' + Date.now(),
    employee: { id: arjun.id, userId: arjun.userId, firstName: arjun.firstName, lastName: arjun.lastName, employeeId: arjun.employeeId, departmentName: 'Engineering' },
    recipients,
    excludeUserIds: [],
    vars: { Submitted_By: 'Local Repro', Submitted_On: new Date().toISOString(), Review_Status: 'Pending HR Review', Probation_End_Date: '2026-10-01' },
  });

  // What landed?
  const rows = await (db as any).notificationDelivery.findMany({
    where: { module: 'probation', eventKey: 'probation.review_submitted' },
    orderBy: { createdAt: 'desc' }, take: 6,
    select: { entityId: true, channel: true, status: true, error: true, recipientId: true },
  });
  console.log('review_submitted delivery rows now in DB:', rows.length);
  rows.forEach((r: any) => console.log(' ', r.entityId, r.channel, r.status, (r.error || '').slice(0, 90)));
  process.exit(0);
}

main().catch((e) => { console.error('REPRO FAILED:', e); process.exit(1); });
