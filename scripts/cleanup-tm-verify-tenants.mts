// Cleanup: delete any leftover TM-VERIFY scratch tenants from the PLATFORM DB (neondb).
// Only touches tenants whose slug starts with 'tm-verify-' — everything else is untouched.
import { getPlatformDb } from '../src/lib/tenant-db.ts';

const db = getPlatformDb();
const orphans = await db.tenant.findMany({
  where: { slug: { startsWith: 'tm-verify-' } },
  select: { id: true, slug: true, name: true, _count: { select: { users: true } } },
});
if (orphans.length === 0) {
  console.log('No tm-verify-* scratch tenants found. Nothing to clean.');
} else {
  for (const t of orphans) {
    console.log(`Deleting scratch tenant ${t.slug} (${t.name}, users: ${t._count.users})...`);
    await db.tenant.delete({ where: { id: t.id } });
  }
  console.log(`Deleted ${orphans.length} scratch tenant(s).`);
}
const remaining = await db.tenant.count({ where: { slug: { startsWith: 'tm-verify-' } } });
console.log('Remaining tm-verify-* tenants:', remaining);
