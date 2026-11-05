/* Task 128 debug — replay notifyTaskStepChange's exact DB calls against the
 * marqaitechgroup tenant DB to find why the deployed fan-out is silent. */
const { PrismaClient } = require('/home/z/my-project/src/generated/prisma/client');

async function main() {
  const { neon } = require('@neondatabase/serverless');
  const platform = new PrismaClient({ datasources: { db: process.env.DATABASE_URL } });
  const t = await platform.$queryRawUnsafe(`SELECT td."connectionString" AS cs FROM "TenantDatabase" td JOIN "Tenant" t ON t.id = td."tenantId" WHERE td."isActive" = true AND t.slug = 'marqaitechgroup'`);
  const cs = t[0].cs;
  const db = new PrismaClient({ datasources: { db: cs }, datasourcesUrl: undefined });

  const tenantId = 'cmrmrwc00xwda0d4340861d7291';

  // 1) employee lookup (assignee + PM)
  const emps = await db.employee.findMany({
    where: { status: 'active' },
    select: { id: true, firstName: true, lastName: true, email: true, userId: true },
    take: 3,
  });
  console.log('employees ok:', emps.map(e => `${e.firstName} userId=${e.userId ? 'yes' : 'NO'}`));

  // 2) admin lookup (exact query from task-workflow.ts)
  const admins = await db.user.findMany({
    where: { role: { in: ['tenant_admin', 'admin', 'hr_admin'] }, status: 'active' },
    select: { id: true, email: true, firstName: true, lastName: true },
    take: 20,
  });
  console.log('admins ok:', admins.map(a => a.email));

  // 3) notification create (exact createNotification call) — then delete it
  const notif = await db.notification.create({
    data: {
      tenantId,
      userId: admins[0].id,
      title: 'Task workflow step updated',
      message: 'DEBUG probe — will be deleted',
      type: 'workflow',
      category: 'workflow',
      link: '/projects/debug',
      isRead: false,
      isEmailSent: false,
    },
  });
  console.log('notification create OK:', notif.id);
  await db.notification.delete({ where: { id: notif.id } });
  console.log('probe deleted — schema/permissions fine');

  await db.$disconnect();
  await platform.$disconnect();
}
main().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
