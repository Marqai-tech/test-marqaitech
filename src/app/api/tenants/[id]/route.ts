import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { createNotification } from '@/lib/notifications';

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

    const tenant = await prisma.tenant.findUnique({
      where: { id },
      include: {
        companyGroups: {
          include: {
            companies: {
              include: {
                _count: { select: { departments: true, branches: true, employees: true } },
              },
            },
          },
        },
        users: {
          select: { id: true, email: true, name: true, role: true, status: true, lastLogin: true },
        },
        subscriptions: {
          include: { plan: true },
          orderBy: { createdAt: 'desc' },
        },
        _count: { select: { users: true, companyGroups: true, notifications: true } },
      },
    });

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404, headers: corsHeaders() });
    }

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
      return NextResponse.json({ error: 'Only super admins can update tenants' }, { status: 403, headers: corsHeaders() });
    }

    const { id } = await params;
    const body = await request.json();
    let { status, name, domain, plan, country, currency, timezone, logo, maxCompaniesAllowed } = body;

    const existingTenant = await prisma.tenant.findUnique({ where: { id } });
    if (!existingTenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404, headers: corsHeaders() });
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (domain !== undefined) updateData.domain = domain;
    if (plan !== undefined) updateData.plan = plan;
    if (country !== undefined) updateData.country = country;
    if (currency !== undefined) updateData.currency = currency;
    if (timezone !== undefined) updateData.timezone = timezone;
    if (logo !== undefined) updateData.logo = logo;
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

    const tenant = await prisma.tenant.update({
      where: { id },
      data: updateData,
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
