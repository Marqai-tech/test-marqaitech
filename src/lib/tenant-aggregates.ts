import type { PrismaClient } from '@/generated/prisma/client';
import { getDbForTenant } from '@/lib/tenant-db';

const STAT_TTL_MS = 10 * 60 * 1000;
let tableReady = false;

export type TenantCountResult = {
  groups: number;
  companies: number;
  employees: number;
  tenantDbs: number;
  source: 'platform-table' | 'refreshed' | 'empty';
};

async function ensureTable(db: PrismaClient) {
  if (tableReady) return;
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "TenantDashboardStat" (
      "tenantId" TEXT PRIMARY KEY,
      "slug" TEXT NOT NULL,
      "groupCount" INTEGER NOT NULL DEFAULT 0,
      "companyCount" INTEGER NOT NULL DEFAULT 0,
      "employeeCount" INTEGER NOT NULL DEFAULT 0,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  tableReady = true;
}

async function upsertStat(
  db: PrismaClient,
  tenantId: string,
  slug: string,
  groupCount: number,
  companyCount: number,
  employeeCount: number,
) {
  await db.$executeRawUnsafe(
    `INSERT INTO "TenantDashboardStat" ("tenantId","slug","groupCount","companyCount","employeeCount","updatedAt")
     VALUES ($1,$2,$3,$4,$5,NOW())
     ON CONFLICT ("tenantId") DO UPDATE SET
       "slug" = EXCLUDED."slug",
       "groupCount" = EXCLUDED."groupCount",
       "companyCount" = EXCLUDED."companyCount",
       "employeeCount" = EXCLUDED."employeeCount",
       "updatedAt" = NOW()`,
    tenantId,
    slug,
    groupCount,
    companyCount,
    employeeCount,
  );
}

async function countDedicatedTenant(slug: string) {
  const tenantDb = await getDbForTenant(slug);
  const [groupCount, companyCount, employeeCount] = await Promise.all([
    tenantDb.companyGroup.count(),
    tenantDb.company.count(),
    tenantDb.employee.count({ where: { status: 'active' } }),
  ]);
  return { groupCount, companyCount, employeeCount };
}

/**
 * Platform-stored per-tenant counts for Super Admin totals.
 * Tenant DBs are opened only when a row is missing or older than 10 minutes.
 */
export async function getTenantDashboardCounts(
  platformDb: PrismaClient,
  tenantFilter: { slug: { notIn: string[] }; NOT: { name: { contains: string } } },
  options: { allowRefresh: boolean },
): Promise<TenantCountResult> {
  await ensureTable(platformDb);

  const tenants = await platformDb.tenant.findMany({
    where: tenantFilter,
    select: { id: true, slug: true },
  });
  const slugs = tenants.map((t) => t.slug).filter(Boolean) as string[];
  if (slugs.length === 0) {
    return { groups: 0, companies: 0, employees: 0, tenantDbs: 0, source: 'empty' };
  }

  const dedicated = await platformDb.tenantDatabase.findMany({
    where: { isActive: true, tenant: { slug: { in: slugs } } },
    select: { tenant: { select: { id: true, slug: true } } },
  });
  const dedicatedTenants = dedicated
    .map((r) => r.tenant)
    .filter((t): t is { id: string; slug: string } => !!t?.id && !!t?.slug);

  const stored = (await platformDb.$queryRawUnsafe(
    `SELECT "tenantId","slug","groupCount","companyCount","employeeCount","updatedAt"
     FROM "TenantDashboardStat"`,
  )) as {
    tenantId: string;
    slug: string;
    groupCount: number;
    companyCount: number;
    employeeCount: number;
    updatedAt: Date;
  }[];

  const byId = new Map(stored.map((r) => [r.tenantId, r]));
  const cutoff = Date.now() - STAT_TTL_MS;
  const stale = dedicatedTenants.filter((t) => {
    const row = byId.get(t.id);
    if (!row) return true;
    return new Date(row.updatedAt).getTime() < cutoff;
  });

  let tenantDbs = 0;
  let source: TenantCountResult['source'] = 'platform-table';

  if (stale.length > 0 && options.allowRefresh) {
    source = 'refreshed';
    const refreshed = await Promise.all(
      stale.map(async (t) => {
        try {
          const counts = await countDedicatedTenant(t.slug);
          tenantDbs += 1;
          await upsertStat(platformDb, t.id, t.slug, counts.groupCount, counts.companyCount, counts.employeeCount);
          return { tenantId: t.id, ...counts };
        } catch (e) {
          console.error(`[TenantAggregates] Failed for "${t.slug}":`, e);
          return { tenantId: t.id, groupCount: 0, companyCount: 0, employeeCount: 0 };
        }
      }),
    );
    for (const r of refreshed) {
      byId.set(r.tenantId, {
        tenantId: r.tenantId,
        slug: '',
        groupCount: r.groupCount,
        companyCount: r.companyCount,
        employeeCount: r.employeeCount,
        updatedAt: new Date(),
      });
    }
  }

  let groups = 0;
  let companies = 0;
  let employees = 0;
  for (const t of dedicatedTenants) {
    const row = byId.get(t.id);
    if (!row) continue;
    groups += Number(row.groupCount) || 0;
    companies += Number(row.companyCount) || 0;
    employees += Number(row.employeeCount) || 0;
  }

  return { groups, companies, employees, tenantDbs, source };
}
