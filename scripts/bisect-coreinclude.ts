/**
 * Task 78 — Bisect which part of coreInclude triggers P2022 on the LIVE tenant DB.
 */
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaNeon } from '@prisma/adapter-neon'
import { neon } from '@neondatabase/serverless'

const PLATFORM = 'postgresql://neondb_owner:npg_pxZd8woKe4WB@ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require'

async function main() {
  const platformSql = neon(PLATFORM)
  const t = await platformSql.query(
    `SELECT td."connectionString" AS cs FROM "TenantDatabase" td JOIN "Tenant" t ON t.id=td."tenantId" WHERE t.slug='marqaitechgroup'`
  )
  const db = new PrismaClient({ adapter: new PrismaNeon({ connectionString: t[0].cs }) }) as any
  const id = 'cmth5rnge000304l7xec6ovec'

  const tests: Array<[string, any]> = [
    ['FULL coreInclude', {
      department: { include: { company: { select: { id: true, name: true, code: true } } } },
      designation: true,
      branch: { include: { company: { select: { id: true, name: true, code: true } } } },
      user: { select: { id: true, email: true, role: true, avatar: true } },
      reportingManager: { select: { id: true, firstName: true, lastName: true, employeeId: true, designation: { select: { title: true } } } },
      _count: { select: { directReports: true } },
    }],
    ['designation: true ONLY', { designation: true }],
    ['department.company.code ONLY', { department: { include: { company: { select: { id: true, name: true, code: true } } } } }],
    ['branch.company.code ONLY', { branch: { include: { company: { select: { id: true, name: true, code: true } } } } }],
    ['user incl avatar ONLY', { user: { select: { id: true, email: true, role: true, avatar: true } } }],
    ['reportingManager ONLY', { reportingManager: { select: { id: true, firstName: true, lastName: true, employeeId: true, designation: { select: { title: true } } } } }],
    ['_count directReports ONLY', { _count: { select: { directReports: true } } }],
  ]

  for (const [name, include] of tests) {
    try {
      const emp = await db.employee.findUnique({ where: { id }, include })
      console.log(`OK    ${name}${emp ? ' (row found)' : ' (no row)'}`)
    } catch (e: any) {
      const msg = (e.message || String(e)).split('\n').filter(Boolean).slice(-3).join(' | ')
      console.log(`FAIL  ${name} -> ${msg.slice(0, 220)}`)
    }
  }
  await db.$disconnect()
}

main().catch(e => { console.error('fatal:', e?.message || e); process.exit(1) })
