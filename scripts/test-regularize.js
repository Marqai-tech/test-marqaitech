// Quick test: query AttendanceRegularization without include
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('=== Test 1: count ===');
  const count = await prisma.attendanceRegularization.count();
  console.log('count:', count);

  console.log('\n=== Test 2: findMany without include ===');
  const items = await prisma.attendanceRegularization.findMany({ take: 1 });
  console.log('items:', JSON.stringify(items, null, 2).slice(0, 500));

  console.log('\n=== Test 3: findMany with include employee ===');
  try {
    const items2 = await prisma.attendanceRegularization.findMany({
      take: 1,
      include: { employee: { select: { id: true, firstName: true, lastName: true, employeeId: true } } },
    });
    console.log('items2:', JSON.stringify(items2, null, 2).slice(0, 500));
  } catch (e) {
    console.log('ERROR:', e.message);
  }

  console.log('\n=== Test 4: audit-log count ===');
  const auditCount = await prisma.attendanceAuditLog.count();
  console.log('audit count:', auditCount);
}

main().catch(e => console.error(e.message)).finally(() => prisma.$disconnect());
