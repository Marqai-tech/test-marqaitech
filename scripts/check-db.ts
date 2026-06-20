import prisma from '../src/lib/prisma';

async function main() {
  const tenants = await prisma.tenant.findMany({
    include: {
      _count: { select: { companyGroups: true, users: true } },
      companyGroups: {
        include: {
          _count: { select: { companies: true } },
          companies: { select: { id: true, name: true, code: true, status: true } },
        },
      },
    },
  });
  for (const t of tenants) {
    console.log('════════════════════════════════════════════');
    console.log(`Tenant: ${t.name} (id=${t.id}, slug=${t.slug}, plan=${t.plan}, status=${t.status})`);
    console.log(`  users=${t._count.users}, groups=${t._count.companyGroups}`);
    if (t.companyGroups.length === 0) {
      console.log('  ⚠️  NO GROUP COMPANIES UNDER THIS TENANT');
    }
    for (const g of t.companyGroups) {
      console.log(`  ─ Group: ${g.name} (id=${g.id}) — ${g._count.companies} companies`);
      for (const c of g.companies) {
        console.log(`      • Company: ${c.name} (code=${c.code || '—'}, status=${c.status})`);
      }
    }
  }
  // Also check users
  console.log('════════════════════════════════════════════');
  console.log('Users (with roles):');
  const users = await prisma.user.findMany({ select: { id: true, name: true, email: true, role: true, tenantId: true, status: true } });
  for (const u of users) {
    console.log(`  • ${u.name || '—'} <${u.email}> role=${u.role} tenantId=${u.tenantId} status=${u.status}`);
  }
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
