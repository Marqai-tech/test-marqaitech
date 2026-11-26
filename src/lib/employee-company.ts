/**
 * resolveEmployeeCompanyId — the ONE canonical companyId resolver for every
 * employee-creation path (mark-joined, BGV approval, employee-creation +
 * approval, manual add).
 *
 * Why it exists: employees whose `companyId` is NULL are invisible in the
 * Employee List whenever HR views the list through a company scope
 * (CompanySwitcher selection or own-company scoping). That is exactly the
 * "created employee cannot be found anywhere" bug. Every creation flow must
 * stamp the employee with a company.
 *
 * Resolution order (first non-null wins):
 *   1. The department's company (Department.companyId is a required relation,
 *      so this normally resolves immediately).
 *   2. The reporting manager's company.
 *   3. The group's first company / the tenant's first active company.
 *
 * Returns null only when the database has no Company rows at all.
 */

/** Minimal surface every caller already provides ($queryRawUnsafe). */
interface RawDb {
  $queryRawUnsafe: (sql: TemplateStringsArray | string, ...values: unknown[]) => Promise<unknown>;
}

interface CompanyIdRow {
  companyId?: string | null;
}
interface IdRow {
  id?: string | null;
}

export async function resolveEmployeeCompanyId(
  db: RawDb,
  deptId?: string | null,
  mgrId?: string | null,
): Promise<string | null> {
  const pickCompanyId = (rows: unknown): string | null => {
    const first = Array.isArray(rows) ? (rows[0] as CompanyIdRow | undefined) : undefined;
    return first?.companyId ? String(first.companyId) : null;
  };

  try {
    if (deptId) {
      const rows = (await db.$queryRawUnsafe(
        `SELECT "companyId" FROM "Department" WHERE "id"=$1 LIMIT 1`,
        deptId,
      ).catch(() => [])) as unknown;
      const companyId = pickCompanyId(rows);
      if (companyId) return companyId;
    }

    if (mgrId) {
      const rows = (await db.$queryRawUnsafe(
        `SELECT "companyId" FROM "Employee" WHERE "id"=$1 AND "companyId" IS NOT NULL LIMIT 1`,
        mgrId,
      ).catch(() => [])) as unknown;
      const companyId = pickCompanyId(rows);
      if (companyId) return companyId;
    }

    // Last resort: the oldest active company in this database.
    const active = (await db.$queryRawUnsafe(
      `SELECT "id" FROM "Company" WHERE "status"='active' ORDER BY "createdAt" ASC LIMIT 1`,
    ).catch(() => [])) as unknown;
    const activeFirst = Array.isArray(active) ? (active[0] as IdRow | undefined) : undefined;
    if (activeFirst?.id) return String(activeFirst.id);

    const any = (await db.$queryRawUnsafe(
      `SELECT "id" FROM "Company" ORDER BY "createdAt" ASC LIMIT 1`,
    ).catch(() => [])) as unknown;
    const anyFirst = Array.isArray(any) ? (any[0] as IdRow | undefined) : undefined;
    return anyFirst?.id ? String(anyFirst.id) : null;
  } catch {
    return null;
  }
}
