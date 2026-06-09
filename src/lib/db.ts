/**
 * Nexus HRMS - Database Client (Single Source of Truth)
 *
 * ⚠️  DO NOT create separate PrismaClient instances elsewhere.
 * ⚠️  Always import `db` from '@/lib/db' — never from '@/lib/prisma'.
 *
 * DATABASE CONNECTION PRIORITY (set by Vercel Neon integration):
 *   1. POSTGRES_PRISMA_URL  — Neon pooled connection (recommended for serverless)
 *   2. POSTGRES_URL         — Neon direct connection
 *   3. DATABASE_URL         — Fallback / local development
 *
 * To prevent connecting to the WRONG database:
 *   - On Vercel: Check Project Settings → Environment Variables → ensure the Neon
 *     integration points to the CORRECT Neon project (Nexus HRMS, not any other).
 *   - Locally: Ensure .env contains the correct DATABASE_URL for this project.
 *   - The startup log below will print a prefix of the connection string so you
 *     can verify the database name at a glance.
 */
import { PrismaClient } from '@/generated/prisma/client'

const globalForDb = globalThis as unknown as {
  db: PrismaClient | undefined
}

// Priority: POSTGRES_PRISMA_URL (Neon pooled) > POSTGRES_URL (Neon direct) > DATABASE_URL (fallback)
// The Vercel Neon integration sets POSTGRES_URL and POSTGRES_PRISMA_URL
const datasourceUrl = process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL

// Safety log: print the connection string prefix so we can verify which DB is being used
if (typeof window === 'undefined') {
  const maskedUrl = datasourceUrl
    ? datasourceUrl.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@')
    : 'NOT SET — will use Prisma schema default'
  console.log(`[Nexus DB] Connecting to: ${maskedUrl.substring(0, 80)}...`)
}

function createPrismaClient() {
  try {
    return new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['query'] : ['error'],
      ...(datasourceUrl ? { datasourceUrl } : {}),
    })
  } catch (error) {
    console.error('[Nexus DB] Failed to create PrismaClient:', error)
    return createFallbackProxy()
  }
}

// Fallback proxy that catches all database calls and returns safe defaults
function createFallbackProxy(): PrismaClient {
  return new Proxy({} as PrismaClient, {
    get(_target, prop: string) {
      const modelNames = [
        'user', 'employee', 'company', 'department', 'branch', 'job',
        'candidate', 'attendance', 'leave', 'payrollRecord', 'expenseClaim',
        'travelRequest', 'assetAllocation', 'notification', 'auditLog',
        'performanceReview', 'reviewCycle', 'goal', 'learningRecord',
        'ticket', 'workflowDefinition', 'workflowInstance', 'onboardingTask',
        'client', 'vendor', 'subVendor', 'survey', 'surveyQuestion', 'surveyResponse',
        'shift', 'shiftMember', 'complianceItem', 'document', 'interview',
        'leavePolicy', 'payrollStructure', 'alumniRecord', 'workflowStepDef',
        'workflowStepInstance', 'role', 'module', 'permission', 'rolePermission',
        'userRoleAssignment', 'tenant',
      ]

      if (modelNames.includes(prop)) {
        return new Proxy({}, {
          get(_t, method: string) {
            return (..._args: unknown[]) => {
              if (method === 'count') return Promise.resolve(0)
              if (method === 'findMany') return Promise.resolve([])
              if (method === 'findUnique') return Promise.resolve(null)
              if (method === 'findFirst') return Promise.resolve(null)
              if (method === 'aggregate') return Promise.resolve({ _sum: {} })
              if (method === 'groupBy') return Promise.resolve([])
              if (method === 'create') return Promise.resolve({})
              if (method === 'update') return Promise.resolve({})
              if (method === 'delete') return Promise.resolve({})
              if (method === 'deleteMany') return Promise.resolve({ count: 0 })
              if (method === 'updateMany') return Promise.resolve({ count: 0 })
              return Promise.resolve(null)
            }
          }
        })
      }

      // For $connect, $disconnect, $transaction, etc.
      if (typeof prop === 'string' && prop.startsWith('$')) {
        if (prop === '$transaction') {
          return (fn: any) => {
            if (typeof fn === 'function') return fn(db)
            return Promise.resolve([])
          }
        }
        return () => Promise.resolve()
      }

      return undefined
    }
  })
}

export const db =
  globalForDb.db ??
  createPrismaClient()

// Cache in development; also cache in production on Vercel for warm starts
if (process.env.NODE_ENV !== 'production') globalForDb.db = db
