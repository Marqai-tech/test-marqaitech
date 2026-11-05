// Probe: list ALL platform-DB tenants with slug/dedicated-DB info (read-only)
import { getPlatformDb } from '../src/lib/tenant-db.ts';

const db = getPlatformDb();
const tenants = await db.tenant.findMany({
  select: {
    id: true, name: true, slug: true, status: true, plan: true,
    tenantDatabase: { select: { databaseName: true, isActive: true } },
  },
  orderBy: { createdAt: 'asc' },
});
for (const t of tenants) {
  console.log(`${t.slug || '(null slug)'.padEnd(24)} | ${t.status.padEnd(10)} | ${t.plan.padEnd(12)} | ${t.tenantDatabase ? `${t.tenantDatabase.databaseName} (active=${t.tenantDatabase.isActive})` : 'shared'}`);
}
console.log(`\nTotal: ${tenants.length}`);
