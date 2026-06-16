import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

async function requireAuth(req: NextRequest) {
  const token = getTokenFromHeaders(req);
  if (!token) return null;
  const decoded = await verifyToken(token);
  if (!decoded) return null;
  return decoded;
}

// GET /api/companies — List companies
export async function GET(req: NextRequest) {
  try {
    const decoded = await requireAuth(req);
    if (!decoded) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    }
    const role = (decoded.role as string) || 'employee';
    const callerTenantId = decoded.tenantId as string;

    const { searchParams } = new URL(req.url);
    const requestedTenantId = searchParams.get('tenantId');
    const search = searchParams.get('search');

    // Scope by role
    let effectiveTenantId: string | null = null;
    if (role === 'super_admin') {
      // Super admin can request any tenant, default to their own
      effectiveTenantId = requestedTenantId || callerTenantId;
    } else if (role === 'tenant_admin') {
      // Tenant admin: only their own tenant
      effectiveTenantId = callerTenantId;
    } else {
      // Other roles: scope to their own tenant as well (for read access)
      effectiveTenantId = callerTenantId;
    }

    const where: Record<string, unknown> = {};
    if (effectiveTenantId) {
      const companyGroups = await db.companyGroup.findMany({
        where: { tenantId: effectiveTenantId },
        select: { id: true },
      });
      const groupIds = companyGroups.map((g) => g.id);
      where.companyGroupId = { in: groupIds };
    }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
      ];
    }

    const companies = await db.company.findMany({
      where,
      include: {
        companyGroup: { select: { id: true, name: true, tenantId: true } },
        _count: { select: { departments: true, branches: true } },
      },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({ companies }, { headers: corsHeaders() });
  } catch (error: unknown) {
    console.error('Get companies error:', error);
    return NextResponse.json({ companies: [] }, { headers: corsHeaders() });
  }
}

// POST /api/companies — Create a company (super_admin or tenant_admin only)
export async function POST(req: NextRequest) {
  try {
    const decoded = await requireAuth(req);
    if (!decoded) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    }
    const role = (decoded.role as string) || 'employee';
    const callerTenantId = decoded.tenantId as string;

    if (!['super_admin', 'tenant_admin'].includes(role)) {
      return NextResponse.json({ error: 'Only admins can create companies' }, { status: 403, headers: corsHeaders() });
    }

    const body = await req.json();
    const {
      name, code, companyGroupId, companyGroupName,
      registrationNo, taxId, country, currency, timezone,
      address, city, state, zipCode, phone, email, website, status,
      tenantId: bodyTenantId,
    } = body;

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400, headers: corsHeaders() });
    }

    // Resolve target tenant
    let targetTenantId = callerTenantId;
    if (role === 'super_admin' && bodyTenantId) {
      targetTenantId = bodyTenantId;
    }

    // Resolve company group: either use provided one (must belong to target tenant),
    // or create a new one under the target tenant
    let groupId = companyGroupId;
    if (groupId) {
      const existingGroup = await db.companyGroup.findUnique({ where: { id: groupId } });
      if (!existingGroup || existingGroup.tenantId !== targetTenantId) {
        return NextResponse.json({ error: 'Invalid company group for the selected tenant' }, { status: 400, headers: corsHeaders() });
      }
    } else {
      // Auto-create a group under the target tenant
      const groupName = companyGroupName || `${name} Group`;
      const newGroup = await db.companyGroup.create({
        data: { name: groupName, tenantId: targetTenantId },
      });
      groupId = newGroup.id;
    }

    const company = await db.company.create({
      data: {
        name,
        code: code || name.substring(0, 6).toUpperCase().replace(/\s/g, ''),
        companyGroupId: groupId,
        registrationNo,
        taxId,
        country: country || 'India',
        currency: currency || 'INR',
        timezone: timezone || 'Asia/Kolkata',
        address,
        city,
        state,
        zipCode,
        phone,
        email,
        website,
        status: status || 'active',
      },
      include: {
        companyGroup: { select: { id: true, name: true, tenantId: true } },
        _count: { select: { departments: true, branches: true } },
      },
    });

    return NextResponse.json({ company }, { status: 201, headers: corsHeaders() });
  } catch (error: unknown) {
    console.error('Create company error:', error);
    return NextResponse.json({ error: 'Failed to create company' }, { status: 500, headers: corsHeaders() });
  }
}

// PUT /api/companies — Update a company
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...updateData } = body;

    if (!id) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400, headers: corsHeaders() });
    }

    const existing = await db.company.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404, headers: corsHeaders() });
    }

    const company = await db.company.update({
      where: { id },
      data: updateData,
      include: {
        companyGroup: { select: { id: true, name: true } },
        _count: { select: { departments: true, branches: true } },
      },
    });

    return NextResponse.json({ company }, { headers: corsHeaders() });
  } catch (error: unknown) {
    console.error('Update company error:', error);
    return NextResponse.json({ error: 'Failed to update company' }, { status: 500, headers: corsHeaders() });
  }
}

// DELETE /api/companies — Delete a company
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400, headers: corsHeaders() });
    }

    await db.company.delete({ where: { id } });
    return NextResponse.json({ message: 'Company deleted' }, { headers: corsHeaders() });
  } catch (error: unknown) {
    console.error('Delete company error:', error);
    return NextResponse.json({ error: 'Failed to delete company' }, { status: 500, headers: corsHeaders() });
  }
}
