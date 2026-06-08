import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

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

// GET /api/rbac/roles - List roles
export async function GET(request: Request) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json(
        { error: 'No token provided' },
        { status: 401, headers: corsHeaders() }
      );
    }

    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401, headers: corsHeaders() }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId as string },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404, headers: corsHeaders() }
      );
    }

    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId');
    const companyId = searchParams.get('companyId');

    // Build where clause based on user role
    const where: Record<string, unknown> = {};

    if (user.role === 'super_admin') {
      // Super admin can see all roles, optionally filter by tenantId
      if (tenantId) {
        where.OR = [
          { tenantId },
          { tenantId: null }, // Include global roles
        ];
      }
    } else {
      // Tenant admin and below can only see roles for their tenant
      where.OR = [
        { tenantId: user.tenantId },
        { tenantId: null }, // Include global roles
      ];
    }

    if (companyId) {
      where.OR = [
        { companyId },
        { companyId: null }, // Include tenant-level (non-company-specific) roles
      ];
    }

    const roles = await prisma.role.findMany({
      where,
      include: {
        _count: {
          select: {
            userRoles: true,
            permissions: true,
          },
        },
      },
      orderBy: [{ level: 'asc' }, { name: 'asc' }],
    });

    const formattedRoles = roles.map((role) => ({
      id: role.id,
      name: role.name,
      key: role.key,
      description: role.description,
      isSystem: role.isSystem,
      level: role.level,
      tenantId: role.tenantId,
      companyId: role.companyId,
      status: role.status,
      createdBy: role.createdBy,
      userCount: role._count.userRoles,
      permissionCount: role._count.permissions,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    }));

    return NextResponse.json(
      { roles: formattedRoles, total: formattedRoles.length },
      { headers: corsHeaders() }
    );
  } catch (error) {
    console.error('Get roles error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders() }
    );
  }
}

// POST /api/rbac/roles - Create a new role
export async function POST(request: Request) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json(
        { error: 'No token provided' },
        { status: 401, headers: corsHeaders() }
      );
    }

    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401, headers: corsHeaders() }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId as string },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404, headers: corsHeaders() }
      );
    }

    // Only super_admin and tenant_admin can create roles
    if (user.role !== 'super_admin' && user.role !== 'tenant_admin') {
      return NextResponse.json(
        { error: 'Insufficient permissions to create roles' },
        { status: 403, headers: corsHeaders() }
      );
    }

    const body = await request.json();
    const { name, key, description, tenantId, companyId, level } = body;

    if (!name || !key) {
      return NextResponse.json(
        { error: 'Name and key are required' },
        { status: 400, headers: corsHeaders() }
      );
    }

    // Validate key format (alphanumeric and underscores only)
    if (!/^[a-z][a-z0-9_]*$/.test(key)) {
      return NextResponse.json(
        { error: 'Role key must start with lowercase letter and contain only lowercase letters, numbers, and underscores' },
        { status: 400, headers: corsHeaders() }
      );
    }

    // Determine the tenantId for the new role
    let roleTenantId: string | null = null;

    if (user.role === 'super_admin') {
      // Super admin can create roles for any tenant
      roleTenantId = tenantId || null;
    } else {
      // Tenant admin can only create roles for their own tenant
      roleTenantId = user.tenantId;

      // Verify they're not trying to create for a different tenant
      if (tenantId && tenantId !== user.tenantId) {
        return NextResponse.json(
          { error: 'Cannot create roles for a different tenant' },
          { status: 403, headers: corsHeaders() }
        );
      }
    }

    // Check if role key already exists for this tenant/company combination
    const existingRole = await prisma.role.findFirst({
      where: {
        key,
        tenantId: roleTenantId,
        companyId: companyId || null,
      },
    });

    if (existingRole) {
      return NextResponse.json(
        { error: 'A role with this key already exists for this tenant/company' },
        { status: 409, headers: corsHeaders() }
      );
    }

    const role = await prisma.role.create({
      data: {
        name,
        key,
        description: description || null,
        tenantId: roleTenantId,
        companyId: companyId || null,
        level: level ?? 5,
        isSystem: false,
        status: 'active',
        createdBy: user.id,
      },
      include: {
        _count: {
          select: {
            userRoles: true,
            permissions: true,
          },
        },
      },
    });

    return NextResponse.json(
      {
        role: {
          id: role.id,
          name: role.name,
          key: role.key,
          description: role.description,
          isSystem: role.isSystem,
          level: role.level,
          tenantId: role.tenantId,
          companyId: role.companyId,
          status: role.status,
          createdBy: role.createdBy,
          userCount: role._count.userRoles,
          permissionCount: role._count.permissions,
          createdAt: role.createdAt,
          updatedAt: role.updatedAt,
        },
      },
      { status: 201, headers: corsHeaders() }
    );
  } catch (error) {
    console.error('Create role error:', error);
    return NextResponse.json(
      { error: 'Failed to create role', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500, headers: corsHeaders() }
    );
  }
}
