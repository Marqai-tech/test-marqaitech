// Quick connectivity probe: platform DB + login-path queries (dev sandbox)
import { getPlatformDb } from '../src/lib/tenant-db.ts';

const platformDb = getPlatformDb();
try {
  const t = await platformDb.tenant.findMany({ select: { id: true, slug: true, status: true }, take: 5 });
  console.log('PLATFORM DB OK — tenants:', t.map((x) => x.slug).join(', ') || '(none)');
  const u = await platformDb.user.findUnique({ where: { email: 'superadmin@3boxeshrms.com' }, select: { email: true, role: true, status: true } });
  console.log('superadmin user:', u);
} catch (e) {
  console.error('PLATFORM DB FAIL:', e instanceof Error ? e.message : e);
  process.exitCode = 1;
}
