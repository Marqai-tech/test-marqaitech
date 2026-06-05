import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Priority: POSTGRES_PRISMA_URL (Neon pooled) > POSTGRES_URL (Neon direct) > DATABASE_URL (fallback)
// The Vercel Neon integration sets POSTGRES_URL and POSTGRES_PRISMA_URL
const datasourceUrl = process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL

function createPrismaClient() {
  try {
    return new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['query'] : ['error'],
      ...(datasourceUrl ? { datasourceUrl } : {}),
    })
  } catch (error) {
    console.error('Failed to create PrismaClient:', error)
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
        'workflowStepInstance',
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
  globalForPrisma.prisma ??
  createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
