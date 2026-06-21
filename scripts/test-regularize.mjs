import { db as prisma } from '../src/lib/db.ts';

async function main() {
  console.log('=== Test 1: count ===');
  const count = await prisma.attendanceRegularization.count();
  console.log('count:', count);

  console.log('\n=== Test 2: findMany without include ===');
  const items = await prisma.attendanceRegularization.findMany({ take: 1 });
  console.log('items:', JSON.stringify(items, null, 2).slice(0, 500));

  console.log('\n=== Test 3: audit-log count ===');
  const auditCount = await prisma.attendanceAuditLog.count();
  console.log('audit count:', auditCount);
}

main().catch(e => console.error(e.message)).finally(() => process.exit(0));
