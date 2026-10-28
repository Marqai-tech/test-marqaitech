/**
 * Task 78 — Test the exact GET /api/employees query against the PLATFORM DB
 * (the fallback target when getDbForTenant fails on Vercel).
 * If this throws -> explains the 503 mechanism completely.
 */
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaNeon } from '@prisma/adapter-neon'

const PLATFORM = 'postgresql://neondb_owner:npg_pxZd8woKe4WB@ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require'

async function main() {
  const adapter = new PrismaNeon({ connectionString: PLATFORM })
  const db = new PrismaClient({ adapter }) as any

  // platform DB user for mallesh (fallback path resolves user by id from JWT)
  const user = await db.user.findFirst({ where: { email: 'mallesh@marqaitech.com' }, select: { id: true, role: true } })
  console.log('[platform] mallesh user on platform DB:', user)
  const admin = await db.user.findFirst({ where: { email: 'admin@3boxesluxury.com' }, select: { id: true, role: true } })
  console.log('[platform] admin@3boxesluxury.com on platform DB:', admin)

  // EXACT list query shape, as the fallback would run it (self scope for mallesh)
  try {
    const emps = await db.employee.findMany({
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
    console.log('[platform] self-scope findMany OK — rows:', emps.length)
  } catch (e: any) {
    console.error('[platform] self-scope findMany FAILED:', e.message?.split('\n').slice(0, 8).join('\n'))
  }

  // admin-style (no userId filter)
  try {
    const emps2 = await db.employee.findMany({
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
    console.log('[platform] admin-scope findMany OK — rows:', emps2.length)
  } catch (e: any) {
    console.error('[platform] admin-scope findMany FAILED:', e.message?.split('\n').slice(0, 8).join('\n'))
  }

  await db.$disconnect()
}

main().catch(e => { console.error('[platform] fatal:', e?.message || e); process.exit(1) })
