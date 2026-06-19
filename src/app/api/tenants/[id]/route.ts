import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { createNotification } from '@/lib/notifications';
import { ensureSchemaSynced } from '@/lib/schema-sync';

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

/**
 * Ensure the tenant has at least one group company. Per the user's clarified
 * hierarchy ("the group company name and parent tenant are same"), every
 * tenant should have a default group whose name matches the tenant name.
 *
 * Older tenants created before the auto-group-create feature was added in
 * commit c319fe3 have NO group companies — which is why the super admin's
 * "view tenant" panel and the tenant admin's Overview/Group Companies tabs
 * showed empty data. This function auto-creates the missing default group
 * on every GET /api/tenants/[id] call so the UI always has at least one
 * group to display.
 *
 * Idempotent: if a group with the tenant's name already exists, does nothing.
 */
async function ensureDefaultGroup(tenantId: string, tenantName: string): Promise<void> {
  await safe('ensureDefaultGroup', async () => {
    const existing = await prisma.companyGroup.findFirst({
      where: { tenantId, name: { equals: tenantName, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existing) return;
    // Also check if the tenant has ANY group at all — if so, don't auto-create
    // (the super admin may have intentionally deleted the default and created
    // custom-named ones).
    const anyGroup = await prisma.companyGroup.findFirst({
      where: { tenantId },
      select: { id: true },
    });
    if (anyGroup) return;
    await prisma.companyGroup.create({
      data: {
        name: tenantName,
        tenantId,
        employeeLimitMode: 'group_total',
        maxEmployees: null,
        maxCompanies: null,
        notes: `Default group company auto-created for tenant "${tenantName}". Shares the tenant name per the parent/child identity rule.`,
      },
    });
    console.log(`[tenants/[id]] Auto-created default group "${tenantName}" for tenant ${tenantId}`);
  }, undefined as unknown as void);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

    // ─── Auto-heal: ensure the tenant has at least one default group company.
    // This fixes the "shows empty" issue for tenants created before the
    // auto-group-create feature was added. We do this BEFORE the rich fetch
    // so the returned data includes the freshly-created default group.
    const tenantBasic = await safe(
      'tenant.findUnique(basic)',
      () => prisma.tenant.findUnique({
        where: { id },
        select: { id: true, name: true },
      }),
      null,
    );
    if (tenantBasic) {
      await ensureDefaultGroup(tenantBasic.id, tenantBasic.name);
    }

    // Build the tenant view defensively — any one of these includes can fail
    // (e.g. a deleted plan referenced by a subscription, or a permission
    // mismatch on the notifications relation). If the "rich" include set
    // throws, we fall back to a simpler version so the super admin can still
    // see *something* instead of an "Internal server error" toast.
    //
    // IMPORTANT: The frontend super-admin/page.tsx reads `cg.companies` (an
    // array) on each group, so even the fallback MUST include a `companies`
    // array — otherwise `cg.companies.length` throws "Cannot read properties
    // of undefined (reading 'length')".
    let tenant: unknown = null;
    tenant = await safe(
      'tenant.findUnique(rich)',
      () => prisma.tenant.findUnique({
        where: { id },
        include: {
          companyGroups: {
            include: {
              companies: {
                select: {
                  id: true, name: true, code: true, status: true,
                  maxEmployees: true, plannedEmployeeCount: true,
                  // Company has no `employees` Prisma relation — count branches+departments only
                  _count: { select: { departments: true, branches: true } },
                },
                orderBy: { name: 'asc' },
              },
              _count: { select: { companies: true } },
            },
            orderBy: { name: 'asc' },
          },
          users: {
            select: { id: true, email: true, name: true, role: true, status: true, lastLogin: true, createdAt: true },
            orderBy: { createdAt: 'asc' },
          },
          subscriptions: {
            include: { plan: true },
            orderBy: { createdAt: 'desc' },
          },
          _count: { select: { users: true, companyGroups: true } },
        },
      }),
      null,
    );

    if (!tenant) {
      // Fallback: simpler include set, but STILL include companies array on
      // each group (the frontend assumes it is).
      tenant = await safe(
        'tenant.findUnique(fallback)',
        () => prisma.tenant.findUnique({
          where: { id },
          include: {
            companyGroups: {
              include: {
                companies: {
                  select: {
                    id: true, name: true, code: true, status: true,
                    // Company has no `employees` Prisma relation — count branches only
                    _count: { select: { branches: true, departments: true } },
                  },
                  orderBy: { name: 'asc' },
                },
                _count: { select: { companies: true } },
              },
            },
            users: { select: { id: true, email: true, name: true, role: true, status: true, lastLogin: true } },
            _count: { select: { users: true, companyGroups: true } },
          },
        }),
        null,
      );
    }

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404, headers: corsHeaders() });
    }

    // Normalise: ensure `companyGroups[].companies` is always an array (the
    // frontend assumes it is). Defensive — if for any reason a future schema
    // change drops the include, we still want the page to render.
    const normalised = tenant as {
      id: string;
      name: string;
      slug: string;
      domain?: string | null;
      plan?: string;
      status?: string;
      country?: string | null;
      currency?: string;
      timezone?: string;
      maxCompaniesAllowed?: number;
      createdAt?: string | Date;
      companyGroups?: Array<{
        id: string;
        name: string;
        companies?: Array<{
          id: string;
          name: string;
          code?: string | null;
          status?: string;
          _count?: { departments?: number; branches?: number; employees?: number };
        }>;
        _count?: { companies?: number };
      }>;
      users?: Array<{ id: string; name: string; email: string; role: string; status: string; lastLogin?: string | null }>;
      subscriptions?: Array<{ id: string; status: string; startDate: string | Date; endDate: string | Date; amount: number; plan?: { name: string } }>;
      _count?: { users?: number; companyGroups?: number };
    };
    if (normalised.companyGroups) {
      normalised.companyGroups = normalised.companyGroups.map((g) => ({
        ...g,
        companies: Array.isArray(g.companies) ? g.companies : [],
      }));
    } else {
      // Ensure companyGroups is at least an empty array, not undefined
      normalised.companyGroups = [];
    }
    if (!normalised.users) normalised.users = [];
    if (!normalised.subscriptions) normalised.subscriptions = [];
    if (!normalised._count) normalised._count = { users: 0, companyGroups: 0 };

    return NextResponse.json({ tenant: normalised }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Get tenant error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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
    let { status, name, domain, plan, country, currency, timezone, logo, maxCompaniesAllowed } = body;

    const existingTenant = await prisma.tenant.findUnique({ where: { id } });
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

    // Super-admin-only fields: plan, status, maxCompaniesAllowed
    if (userRole === 'super_admin') {
      if (plan !== undefined) updateData.plan = plan;
      if (maxCompaniesAllowed !== undefined) {
        const v = typeof maxCompaniesAllowed === 'number' && maxCompaniesAllowed >= 0 ? maxCompaniesAllowed : 0;
        updateData.maxCompaniesAllowed = v;
      }
      if (status !== undefined) {
        const validStatuses = ['active', 'suspended', 'pending_approval', 'inactive'];
        if (!validStatuses.includes(status)) {
          return NextResponse.json(
            { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
            { status: 400, headers: corsHeaders() }
          );
        }
        updateData.status = status;
      }
    }

    const tenant = await prisma.tenant.update({
      where: { id },
      data: updateData,
    }).catch(async (err) => {
      // If the column is missing, run schema sync and retry once.
      const msg = err && err.message ? err.message : String(err);
      if (/column .* does not exist|does not exist in the current database/i.test(msg)) {
        await ensureSchemaSynced();
        return prisma.tenant.update({ where: { id }, data: updateData });
      }
      throw err;
    });

    // Notify tenant admin of status changes
    if (status && status !== existingTenant.status) {
      const tenantAdmins = await prisma.user.findMany({
        where: { tenantId: id, role: 'tenant_admin' },
      });

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

    await prisma.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'UPDATE_TENANT',
        module: 'tenants',
        details: `Updated tenant ${id}: ${JSON.stringify(updateData)}`,
      },
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

    const existingTenant = await prisma.tenant.findUnique({ where: { id } });
    if (!existingTenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404, headers: corsHeaders() });
    }

    await prisma.tenant.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'DELETE_TENANT',
        module: 'tenants',
        details: `Deleted tenant ${existingTenant.name} (${existingTenant.slug})`,
      },
    });

    return NextResponse.json({ message: 'Tenant deleted successfully' }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Delete tenant error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
