import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken, getTokenFromHeaders, hashPassword } from '@/lib/auth';

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

export async function GET(request: Request) {
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
      return NextResponse.json({ error: 'Only super admins can list all tenants' }, { status: 403, headers: corsHeaders() });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const status = searchParams.get('status');
    const search = searchParams.get('search');

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
        { domain: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [tenants, total] = await Promise.all([
      prisma.tenant.findMany({
        where,
        include: {
          _count: { select: { users: true, companyGroups: true, subscriptions: true } },
          subscriptions: {
            where: { status: 'active' },
            take: 1,
            include: { plan: true },
            orderBy: { createdAt: 'desc' },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.tenant.count({ where }),
    ]);

    return NextResponse.json(
      { tenants, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } },
      { headers: corsHeaders() }
    );
  } catch (error) {
    console.error('Get tenants error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

export async function POST(request: Request) {
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
      return NextResponse.json({ error: 'Only super admins can create tenants' }, { status: 403, headers: corsHeaders() });
    }

    const body = await request.json();
    const {
      name, slug, domain, plan, country, currency, timezone, logo,
      adminName, adminEmail, adminPassword,
    } = body;

    if (!name || !slug || !adminName || !adminEmail || !adminPassword) {
      return NextResponse.json(
        { error: 'Missing required fields: name, slug, adminName, adminEmail, adminPassword' },
        { status: 400, headers: corsHeaders() }
      );
    }

    // Check for duplicate slug
    const existingTenant = await prisma.tenant.findUnique({ where: { slug } });
    if (existingTenant) {
      return NextResponse.json({ error: 'Tenant slug already exists' }, { status: 409, headers: corsHeaders() });
    }

    // Check for duplicate admin email
    const existingUser = await prisma.user.findUnique({ where: { email: adminEmail } });
    if (existingUser) {
      return NextResponse.json({ error: 'Admin email already exists' }, { status: 409, headers: corsHeaders() });
    }

    const hashedPassword = await hashPassword(adminPassword);

    const tenant = await prisma.tenant.create({
      data: {
        name,
        slug,
        domain,
        plan: plan || 'starter',
        country,
        currency: currency || 'USD',
        timezone: timezone || 'UTC',
        logo,
        status: 'pending_approval',
        users: {
          create: {
            email: adminEmail,
            password: hashedPassword,
            name: adminName,
            role: 'tenant_admin',
            status: 'active',
          },
        },
      },
      include: {
        users: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'CREATE_TENANT',
        module: 'tenants',
        details: `Created tenant ${name} (${slug}) with admin ${adminEmail}`,
      },
    });

    return NextResponse.json({ tenant }, { status: 201, headers: corsHeaders() });
  } catch (error) {
    console.error('Create tenant error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
