/**
 * Task 79 — Reproduce the QA P2011 with the REAL generated Prisma client
 * (exactly what the probation POST route does) against the demo tenant DB.
 * bun scripts/repro-probation-p2011.ts
 */
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { neon } from '@neondatabase/serverless'

const US_PLATFORM = 'postgresql://neondb_owner:npg_pxZd8woKe4WB@ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require'

async function main() {
  const reg = await neon(US_PLATFORM)`
    SELECT t.slug, td."connectionString" AS cs FROM "TenantDatabase" td
    JOIN "Tenant" t ON t.id = td."tenantId" WHERE td."isActive" = true AND t.slug = '3boxes-hrms-demo'`
  const cs = reg[0].cs
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: cs }) })

  const emp = await db.employee.findFirst({ select: { id: true, firstName: true } })
  if (!emp) { console.log('no employee'); return }

  // EXACT payload the route builds (probation/route.ts lines 324-342)
  const probationData = JSON.stringify({
    probationStartDate: '2025-04-01', probationPeriod: 6, extensionPeriod: 0,
    performanceRating: 4, reviewComments: 'Repro test comment for P2011 investigation',
    kpiStatus: 'pending', decision: 'pending', effectiveDate: null, confirmationLetter: null,
  })
  try {
    const review = await db.performanceReview.create({
      data: {
        employeeId: emp.id,
        reviewCycle: 'Probation',
        reviewPeriod: 'Probation (6 months)',
        reviewerId: undefined as unknown as string,
        rating: 4,
        overallRating: 4,
        comments: probationData,
        strengths: null,
        improvements: null,
        status: 'pending',
        reviewDate: new Date(),
      },
      include: { employee: { select: { firstName: true, lastName: true, employeeId: true } } },
    })
    console.log('[repro] Prisma create OK:', review.id, '→ cleaning up')
    await db.performanceReview.delete({ where: { id: review.id } })
    console.log('[repro] cleaned up')
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string; meta?: unknown }
    console.log(`[repro] Prisma create FAILED code=${err.code}`)
    console.log(`[repro] message: ${err.message?.slice(0, 400)}`)
    if (err.meta) console.log(`[repro] meta:`, JSON.stringify(err.meta).slice(0, 300))
  } finally {
    await db.$disconnect()
  }
}

main().catch(e => { console.error(e); process.exit(1) })
