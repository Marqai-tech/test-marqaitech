/**
 * Task 78 — Reproduce the exact app DB call for LIVE tenant using the same
 * stack (generated Prisma client + PrismaNeon adapter) to capture the real error.
 */
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaNeon } from '@prisma/adapter-neon'
import { neon } from '@neondatabase/serverless'

const PLATFORM = 'postgresql://neondb_owner:npg_pxZd8woKe4WB@ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require'

async function main() {
  const platformSql = neon(PLATFORM)
  const tenants = await platformSql.query(`
    SELECT t.slug, td."connectionString" AS cs
    FROM "Tenant" t JOIN "TenantDatabase" td ON td."tenantId" = t.id
    WHERE td."isActive" = true AND t.slug = 'marqaitechgroup'`)
  if (!tenants.length) { console.log('tenant not found'); return }
  const cs: string = tenants[0].cs
  console.log('[repro] host:', cs.split('@')[1]?.split('/')[0])

  const adapter = new PrismaNeon({ connectionString: cs })
  const db = new PrismaClient({ adapter })

  // 1. find the user for scope=self simulation (mallesh@marqaitech.com)
  const user = await (db as any).user.findFirst({ where: { email: 'mallesh@marqaitech.com' }, select: { id: true, role: true } })
  console.log('[repro] user:', user)

  // 2. EXACT same shape as GET /api/employees (select-all via omit + includes)
  try {
    const emps = await (db as any).employee.findMany({
      where: user ? { userId: user.id } : {},
      omit: { avatar: true },
      include: {
        department: { select: { id: true, name: true } },
        designation: { select: { id: true, title: true } },
        branch: { select: { id: true, name: true } },
        user: { select: { id: true, email: true, role: true } },
        reportingManager: { select: { id: true, firstName: true, lastName: true, employeeId: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    console.log('[repro] SELF-SCOPE findMany OK — rows:', emps.length)
    if (emps[0]) {
      console.log('[repro] first row id:', emps[0].id, '| isManagement:', emps[0].isManagement)
    }
  } catch (e: any) {
    console.error('[repro] SELF-SCOPE findMany FAILED:', e.message?.split('\n').slice(0, 6).join('\n'))
  }

  // 3. also try the unscoped (admin-style) query
  try {
    const total = await (db as any).employee.count({})
    console.log('[repro] count all OK — total:', total)
    const emps2 = await (db as any).employee.findMany({
      omit: { avatar: true },
      include: {
        department: { select: { id: true, name: true } },
        designation: { select: { id: true, title: true } },
        branch: { select: { id: true, name: true } },
        user: { select: { id: true, email: true, role: true } },
        reportingManager: { select: { id: true, firstName: true, lastName: true, employeeId: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    console.log('[repro] ALL findMany OK — rows:', emps2.length)
  } catch (e: any) {
    console.error('[repro] ALL findMany FAILED:', e.message?.split('\n').slice(0, 8).join('\n'))
  }

  await (db as any).$disconnect()
}

main().catch(e => { console.error('[repro] fatal:', e); process.exit(1) })
