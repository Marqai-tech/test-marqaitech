import { NextResponse } from 'next/server';
import { getDb, getPlatformDb, getDbForTenant } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { createNotification } from '@/lib/notifications';
import { ensureSchemaSynced } from '@/lib/schema-sync';
import { getHiddenSlugsForRequest } from '@/lib/tenant-filter';

// ─── Hidden Tenant Slugs (GOLDEN RULE — FOOLPROOF) ──────────────────

/**
 * Best-effort audit write that follows the ACTING USER's home database
 * (same rationale as writeTenantAudit in ../route.ts — on the demo
 * deployment the super admin's user row lives in the demo tenant DB).
 * Never throws: audit failures are logged and swallowed.
 */
async function writeTenantAudit(
  requestDb: { auditLog: { create: (args: unknown) => Promise<unknown> } },
  platformDb: { user: { findUnique: (args: unknown) => Promise<unknown> }; auditLog: { create: (args: unknown) => Promise<unknown> } },
  userId: string,
  data: { action: string; module: string; details: string },
) {
  let target: typeof platformDb | typeof requestDb = platformDb;
  try {
    const actingUser = await platformDb.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!actingUser) target = requestDb;
  } catch {
    target = requestDb;
  }
  try {
    await target.auditLog.create({ data: { userId, ...data } });
  } catch (auditErr) {
    console.error(`[Tenants] Audit write (${data.action}) failed (non-fatal):`, auditErr instanceof Error ? auditErr.message : auditErr);
  }
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

/**
 * Safe wrapper — runs a query and returns a default value on failure instead
 * of throwing. Same pattern as /api/me/context: a single failed include
 * shouldn't 500 the whole tenant view, because the frontend uses this
 * endpoint to render the "view tenant" panel.
 */
async function safe<T>(
  label: string,
  fn: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[tenants/[id]] ${label} failed:`, msg);
    return fallback;
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await getDb(request); // resolve tenant DB handle (shared-mode resolution side effect)
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    }

    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    }

    const { id } = await params;
    const platformDb = getPlatformDb();

    // ─── Step 1: Get tenant basic info from platform DB ───
    const tenantBasic = await platformDb.tenant.findUnique({
      where: { id },
      select: {
        id: true, name: true, slug: true, domain: true, plan: true,
        status: true, country: true, currency: true, timezone: true,
        maxCompaniesAllowed: true, logo: true, createdAt: true,
      },
    });

    if (!tenantBasic) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404, headers: corsHeaders() });
    }

    // ─── GOLDEN RULE: Block access to hidden tenants ───
    const hiddenSlugs = getHiddenSlugsForRequest(request);
    if (tenantBasic.slug && hiddenSlugs.includes(tenantBasic.slug)) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404, headers: corsHeaders() });
    }

    // ─── Step 2: Get tenant's dedicated database ───
    // Per golden rules, tenant data (CompanyGroup, Company, Employee, etc.)
    // lives in the tenant's own database, NOT in the platform DB.
    let tenantDb = platformDb; // fallback
    let hasTenantDb = false;
    if (tenantBasic.slug) {
      try {
        const tenantDbRecord = await platformDb.tenantDatabase.findFirst({
          where: {
            tenant: { slug: tenantBasic.slug },
            isActive: true,
          },
          select: { id: true },
        });
        if (tenantDbRecord) {
          tenantDb = await getDbForTenant(tenantBasic.slug);
          hasTenantDb = true;
        }
      } catch (e) {
        console.error(`[tenants/[id]] Failed to get tenant DB for "${tenantBasic.slug}":`, e);
      }
    }

    // ─── Step 3: Fetch company groups, companies, and employees from TENANT DB ───
    // This is the key fix — the super admin should see the SAME data that the
    // tenant admin sees. Since the tenant admin's CRUD operations go to the
    // tenant's own database, we must read from that database too.

    // 3a. Company Groups with Companies
    const companyGroups = await safe(
      'tenantDb.companyGroup.findMany',
      () => tenantDb.companyGroup.findMany({
        where: { tenantId: id },
        include: {
          companies: {
            select: {
              id: true, name: true, code: true, status: true,
              maxEmployees: true, plannedEmployeeCount: true,
              _count: { select: { departments: true, branches: true } },
            },
            orderBy: { name: 'asc' },
          },
          _count: { select: { companies: true } },
        },
        orderBy: { name: 'asc' },
      }),
      [] as Array<{
        id: string;
        name: string;
        companies: Array<{
          id: string; name: string; code: string | null; status: string;
          maxEmployees: number | null; plannedEmployeeCount: number | null;
          _count: { departments: number; branches: number };
        }>;
        _count: { companies: number };
      }>,
    );

    // Ensure companies is always an array on each group
    const normalisedCompanyGroups = companyGroups.map((g) => ({
      ...g,
      companies: Array.isArray(g.companies) ? g.companies : [],
    }));

    // 3b. Employees from tenant DB
    // Note: Employee has `department` and `designation` as Prisma relations,
    // but `companyId` is just a String? field (no `company` relation).
    // We include department/designation names via relations, and look up
    // company name separately below.
    // ⚠️ Employee has NO tenantId column in any database (dedicated or
    // shared-mode) — filtering by tenantId throws PrismaClientValidationError
    // at runtime and safe() masks it, so employees were always []. Scope by
    // the companies discovered in step 3a instead (works for both modes).
    const groupCompanyIds = normalisedCompanyGroups.flatMap((g) => (g.companies || []).map((c) => c.id));
    const employees = groupCompanyIds.length === 0
      ? ([] as Awaited<ReturnType<typeof fetchEmployees>>)
      : await fetchEmployees();
    async function fetchEmployees() {
      return await safe(
        'tenantDb.employee.findMany',
        () => tenantDb.employee.findMany({
          where: { companyId: { in: groupCompanyIds }, status: 'active' },
          select: {
            id: true, firstName: true, lastName: true, email: true,
            employeeId: true, status: true, phone: true, createdAt: true,
            companyId: true,
            department: { select: { name: true } },
            designation: { select: { title: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 200, // limit for performance
        }),
        [],
      );
    }

    // 3b-2. Resolve company names for employees
    // Since Employee.companyId is a String? (no Prisma relation), we need
    // to look up the company name from the Company table.
    type DetailEmployee = Awaited<ReturnType<typeof fetchEmployees>>[number];
    const companyIds = [...new Set(employees.map((e: DetailEmployee) => e.companyId).filter(Boolean))] as string[];
    const companyMap = new Map<string, string>();
    if (companyIds.length > 0) {
      await safe('tenantDb.company.findMany(forEmployeeLookup)', async () => {
        const companies = await tenantDb.company.findMany({
          where: { id: { in: companyIds } },
          select: { id: true, name: true },
        });
        for (const c of companies) companyMap.set(c.id, c.name);
        return companies;
      }, []);
    }
    // Attach company name to each employee
    const employeesWithCompany = employees.map((e: DetailEmployee) => ({
      ...e,
      department: e.department?.name || null,
      designation: e.designation?.title || null,
      company: e.companyId ? { id: e.companyId, name: companyMap.get(e.companyId) || null } : null,
    }));

    // 3c. Users from tenant DB (tenant admins, etc.)
    const users = await safe(
      'tenantDb.user.findMany',
      () => tenantDb.user.findMany({
        where: { tenantId: id },
        select: { id: true, email: true, name: true, role: true, status: true, lastLogin: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      [],
    );

    // ─── Step 4: Get subscriptions from platform DB ───
    // Subscriptions are cross-tenant data, stored in platform DB
    const subscriptions = await safe(
      'platformDb.subscription.findMany',
      () => platformDb.subscription.findMany({
        where: { tenantId: id },
        include: { plan: true },
        orderBy: { createdAt: 'desc' },
      }),
      [],
    );

    // ─── Step 5: Build response ───
    const tenant = {
      ...tenantBasic,
      // Whether this tenant resolves to its own dedicated database (true) or
      // falls back to the shared platform database (false).
      hasDedicatedDb: hasTenantDb,
      companyGroups: normalisedCompanyGroups,
      employees: employeesWithCompany,
      users,
      subscriptions,
      _count: {
        users: users.length,
        companyGroups: normalisedCompanyGroups.length,
        employees: employees.length,
      },
    };

    return NextResponse.json({ tenant }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Get tenant error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    }

    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    }

    const userRole = decoded.role as string;
    const callerTenantId = decoded.tenantId as string;
    const { id } = await params;

    // Authorization:
    //  - super_admin can update ANY tenant (full field set)
    //  - tenant_admin can update ONLY their own tenant, and only a limited
    //    field set (name, domain, country, currency, timezone, logo).
    //    They CANNOT change plan, status, or maxCompaniesAllowed.
    if (userRole !== 'super_admin' && userRole !== 'tenant_admin') {
      return NextResponse.json({ error: 'Only super admins or tenant admins can update tenants' }, { status: 403, headers: corsHeaders() });
    }
    if (userRole === 'tenant_admin' && callerTenantId !== id) {
      return NextResponse.json({ error: 'Tenant admins can only update their own tenant' }, { status: 403, headers: corsHeaders() });
    }

    const body = await request.json();
    const { status, name, domain, plan, country, currency, timezone, logo, maxCompaniesAllowed } = body;
    // Extended platform fields (super_admin only, same guard as plan/status).
    const { language, baseCurrency, dataRegion, subscriptionSeats, subscriptionStorage } = body;

    const existingTenant = await getPlatformDb().tenant.findUnique({ where: { id } });
    if (!existingTenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404, headers: corsHeaders() });
    }

    const updateData: Record<string, unknown> = {};
    // For tenant_admin: only allow a limited subset of fields.
    if (name !== undefined) updateData.name = name;
    if (domain !== undefined) updateData.domain = domain;
    if (country !== undefined) updateData.country = country;
    if (currency !== undefined) updateData.currency = currency;
    if (timezone !== undefined) updateData.timezone = timezone;
    if (logo !== undefined) updateData.logo = logo;

    // Super-admin-only fields: plan, status, maxCompaniesAllowed + extended
    // platform fields (language / baseCurrency / dataRegion / seat & storage caps).
    if (userRole === 'super_admin') {
      if (plan !== undefined) updateData.plan = plan;
      if (maxCompaniesAllowed !== undefined) {
        const v = typeof maxCompaniesAllowed === 'number' && maxCompaniesAllowed >= 0 ? maxCompaniesAllowed : 0;
        updateData.maxCompaniesAllowed = v;
      }
      if (language !== undefined) updateData.language = language || 'en';
      if (baseCurrency !== undefined) updateData.baseCurrency = baseCurrency || currency || 'INR';
      if (dataRegion !== undefined) updateData.dataRegion = dataRegion || null;
      if (subscriptionSeats !== undefined && Number.isFinite(Number(subscriptionSeats))) {
        updateData.subscriptionSeats = Math.max(0, Math.floor(Number(subscriptionSeats)));
      }
      if (subscriptionStorage !== undefined && Number.isFinite(Number(subscriptionStorage))) {
        updateData.subscriptionStorage = Math.max(0, Math.floor(Number(subscriptionStorage)));
      }
      if (status !== undefined) {
        // 'trial' is part of the real lifecycle vocabulary (set by trial
        // approval) — super admins must be able to convert trial → active.
        const validStatuses = ['active', 'suspended', 'pending_approval', 'inactive', 'trial'];
        if (!validStatuses.includes(status)) {
          return NextResponse.json(
            { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
            { status: 400, headers: corsHeaders() }
          );
        }
        updateData.status = status;
      }
    }

    const tenant = await getPlatformDb().tenant.update({
      where: { id },
      data: updateData,
    }).catch(async (err) => {
      // If the column is missing, run schema sync and retry once.
      const msg = err && err.message ? err.message : String(err);
      if (/column .* does not exist|does not exist in the current database/i.test(msg)) {
        await ensureSchemaSynced();
        return getPlatformDb().tenant.update({ where: { id }, data: updateData });
      }
      throw err;
    });

    // Notify tenant admin of status changes. Tenant admin users live in the
    // target tenant's own database when it has one (fallback = platform DB
    // for shared-mode tenants) — resolve by the TARGET tenant's slug, not
    // the caller's.
    if (status && status !== existingTenant.status) {
      let adminDb = db;
      try {
        if (existingTenant.slug) adminDb = await getDbForTenant(existingTenant.slug);
      } catch { /* keep fallback */ }
      const tenantAdmins = await adminDb.user.findMany({
        where: { tenantId: id, role: 'tenant_admin' },
      }).catch(() => []);

      for (const admin of tenantAdmins) {
        await createNotification({
          tenantId: id,
          userId: admin.id,
          title: 'Tenant Status Updated',
          message: `Your tenant has been ${status === 'active' ? 'approved/activated' : status === 'suspended' ? 'suspended' : `updated to ${status}`}.`,
          type: status === 'active' ? 'success' : status === 'suspended' ? 'warning' : 'info',
          category: 'system',
          link: '/settings',
        });
      }
    }

    // Audit follows the acting user's home DB; never fails the update.
    await writeTenantAudit(db, getPlatformDb(), decoded.userId as string, {
      action: 'UPDATE_TENANT',
      module: 'tenants',
      details: `Updated tenant ${id}: ${JSON.stringify(updateData)}`,
    });

    return NextResponse.json({ tenant }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Update tenant error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    }

    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    }

    const userRole = decoded.role as string;
    if (userRole !== 'super_admin') {
      return NextResponse.json({ error: 'Only super admins can delete tenants' }, { status: 403, headers: corsHeaders() });
    }

    const { id } = await params;

    const existingTenant = await getPlatformDb().tenant.findUnique({ where: { id } });
    if (!existingTenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404, headers: corsHeaders() });
    }

    await getPlatformDb().tenant.delete({ where: { id } });

    // Audit follows the acting user's home DB; never fails the delete.
    await writeTenantAudit(db, getPlatformDb(), decoded.userId as string, {
      action: 'DELETE_TENANT',
      module: 'tenants',
      details: `Deleted tenant ${existingTenant.name} (${existingTenant.slug})`,
    });

    return NextResponse.json({ message: 'Tenant deleted successfully' }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Delete tenant error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
