/**
 * 3Boxes HRMS — Per-Tenant Database Isolation
 *
 * This module provides functions to route database queries to the correct
 * database based on the tenant subdomain. Each tenant can have its own
 * separate Neon PostgreSQL database, ensuring complete data isolation.
 *
 * Architecture:
 *   - Platform DB (neondb): Stores Tenant, User (platform-level), TenantDatabase,
 *     TrialRegistration, and other cross-tenant data
 *   - Tenant DB (e.g., tenant_marqaitechgroup): Stores the tenant's own data —
 *     CompanyGroup, Company, Department, Employee, Payroll, etc.
 *
 * How it works:
 *   1. When a request comes in with x-tenant-slug header (set by middleware),
 *      we look up the TenantDatabase record in the platform DB.
 *   2. If a TenantDatabase exists and is active, we create a PrismaClient
 *      connected to that tenant's dedicated database.
 *   3. If no TenantDatabase exists (or it's not active), we fall back to
 *      the platform DB with tenantId filtering (shared-DB mode).
 *
 * Usage in API routes:
 *   import { getDbForTenant } from '@/lib/tenant-db';
 *   const db = await getDbForTenant(tenantSlug);
 *   const employees = await db.employee.findMany({ ... });
 */

import { PrismaClient } from '@/generated/prisma/client'
import { PrismaNeon } from '@prisma/adapter-neon'
import { db as platformDb } from '@/lib/db'

// Cache tenant DB clients to avoid recreating on every request
const tenantDbCache = new Map<string, { client: PrismaClient; lastAccess: number }>()

// Clean up cache entries older than 5 minutes (300000ms)
const CACHE_TTL = 300000

// Periodic cleanup
if (typeof globalThis !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of tenantDbCache.entries()) {
      if (now - entry.lastAccess > CACHE_TTL) {
        entry.client.$disconnect().catch(() => {})
        tenantDbCache.delete(key)
      }
    }
  }, 60000).unref?.()
}

/**
 * Get the PrismaClient for a specific tenant's database.
 *
 * If the tenant has a dedicated database (TenantDatabase record exists and is active),
 * returns a PrismaClient connected to that database.
 * Otherwise, returns the platform DB (shared mode with tenantId filtering).
 *
 * @param tenantSlug - The tenant's slug (from subdomain or header)
 * @returns PrismaClient connected to the appropriate database
 */
export async function getDbForTenant(tenantSlug: string): Promise<PrismaClient> {
  if (!tenantSlug) return platformDb

  // Check cache first
  const cached = tenantDbCache.get(tenantSlug)
  if (cached) {
    cached.lastAccess = Date.now()
    return cached.client
  }

  // Look up the tenant's dedicated database
  try {
    const tenantDbRecord = await platformDb.tenantDatabase.findFirst({
      where: {
        tenant: { slug: tenantSlug },
        isActive: true,
      },
      select: {
        connectionString: true,
        databaseName: true,
      },
    })

    if (!tenantDbRecord) {
      // No dedicated DB — use platform DB (shared mode)
      // The calling code should filter by tenantId
      return platformDb
    }

    // Create a new PrismaClient for this tenant's database
    const adapter = new PrismaNeon({ connectionString: tenantDbRecord.connectionString })
    const tenantClient = new PrismaClient({ adapter })

    // Cache it
    tenantDbCache.set(tenantSlug, {
      client: tenantClient,
      lastAccess: Date.now(),
    })

    return tenantClient
  } catch (error) {
    console.error(`[TenantDB] Failed to get DB for tenant "${tenantSlug}":`, error)
    // Fall back to platform DB on error
    return platformDb
  }
}

/**
 * Get the PrismaClient for a tenant by tenantId (instead of slug).
 * Useful when you already have the tenantId from the JWT.
 */
export async function getDbForTenantById(tenantId: string): Promise<PrismaClient> {
  if (!tenantId) return platformDb

  // Try cache by tenantId (we'll look up slug for caching)
  try {
    const tenant = await platformDb.tenant.findUnique({
      where: { id: tenantId },
      select: { slug: true },
    })

    if (!tenant) return platformDb
    return getDbForTenant(tenant.slug)
  } catch (error) {
    console.error(`[TenantDB] Failed to get DB for tenantId "${tenantId}":`, error)
    return platformDb
  }
}

/**
 * Check if a tenant has a dedicated database (isolated mode).
 */
export async function isTenantIsolated(tenantSlug: string): Promise<boolean> {
  try {
    const count = await platformDb.tenantDatabase.count({
      where: {
        tenant: { slug: tenantSlug },
        isActive: true,
      },
    })
    return count > 0
  } catch {
    return false
  }
}

/**
 * Register a new dedicated database for a tenant.
 * Called during trial provisioning when a separate DB is created.
 */
export async function registerTenantDatabase(params: {
  tenantId: string
  connectionString: string
  directUrl?: string
  databaseName: string
  neonBranchId?: string
  neonProjectId?: string
}) {
  // Invalidate cache if exists
  const tenant = await platformDb.tenant.findUnique({
    where: { id: params.tenantId },
    select: { slug: true },
  })
  if (tenant) {
    const cached = tenantDbCache.get(tenant.slug)
    if (cached) {
      cached.client.$disconnect().catch(() => {})
      tenantDbCache.delete(tenant.slug)
    }
  }

  return platformDb.tenantDatabase.upsert({
    where: { tenantId: params.tenantId },
    create: {
      tenantId: params.tenantId,
      connectionString: params.connectionString,
      directUrl: params.directUrl,
      databaseName: params.databaseName,
      neonBranchId: params.neonBranchId,
      neonProjectId: params.neonProjectId,
      isActive: true,
    },
    update: {
      connectionString: params.connectionString,
      directUrl: params.directUrl,
      databaseName: params.databaseName,
      neonBranchId: params.neonBranchId,
      neonProjectId: params.neonProjectId,
      isActive: true,
    },
  })
}

/**
 * Disconnect a tenant's dedicated database client from cache.
 */
export function disconnectTenantDb(tenantSlug: string) {
  const cached = tenantDbCache.get(tenantSlug)
  if (cached) {
    cached.client.$disconnect().catch(() => {})
    tenantDbCache.delete(tenantSlug)
  }
}
