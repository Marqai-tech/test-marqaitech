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

export async function GET(request: Request) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const status = searchParams.get('status');
    const plan = searchParams.get('plan');
    const tenantType = searchParams.get('tenantType');
    const search = searchParams.get('search');

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (plan) where.plan = plan;
    if (tenantType) where.tenantType = tenantType;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { companyName: { contains: search, mode: 'insensitive' } },
        { adminEmail: { contains: search, mode: 'insensitive' } },
        { domain: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [tenants, total] = await Promise.all([
      prisma.tenant.findMany({
        where,
        include: {
          _count: { select: { users: true, companyGroups: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.tenant.count({ where }),
    ]);

    // Compute aggregate stats
    const [totalTenants, activeTenants, suspendedTenants, totalCompanies, totalEmployees, revenueData] = await Promise.all([
      prisma.tenant.count(),
      prisma.tenant.count({ where: { status: 'active' } }),
      prisma.tenant.count({ where: { status: 'suspended' } }),
      prisma.companyGroup.count(),
      prisma.employee.count(),
      prisma.tenant.findMany({
        where: { paymentStatus: 'paid' },
        select: { plan: true, billingCycle: true },
      }),
    ]);

    const stats = {
      totalTenants,
      activeTenants,
      suspendedTenants,
      totalCompanies,
      totalEmployees,
      platformRevenue: revenueData.length * 99, // simplified revenue calc
    };

    return NextResponse.json(
      { tenants, stats, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } },
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
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });

    const body = await request.json();
    const {
      name, slug, domain, tenantType, companyName, legalName, industry,
      country, currency, adminName, adminEmail, adminMobile,
      plan, employeeLimit, userLimit, storageLimit, aiCreditLimit,
      trialStartDate, trialEndDate, subscriptionStartDate, subscriptionEndDate,
      billingCycle, paymentStatus, status, timezone,
    } = body;

    if (!name) {
      return NextResponse.json({ error: 'Tenant name is required' }, { status: 400, headers: corsHeaders() });
    }

    // Generate slug from name if not provided
    const tenantSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    // Check slug uniqueness
    const existingSlug = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (existingSlug) {
      return NextResponse.json({ error: 'A tenant with this slug already exists' }, { status: 400, headers: corsHeaders() });
    }

    const tenant = await prisma.tenant.create({
      data: {
        name,
        slug: tenantSlug,
        domain: domain || null,
        tenantType: tenantType || 'single_company',
        companyName: companyName || null,
        legalName: legalName || null,
        industry: industry || null,
        country: country || null,
        currency: currency || 'USD',
        adminName: adminName || null,
        adminEmail: adminEmail || null,
        adminMobile: adminMobile || null,
        plan: plan || 'starter',
        employeeLimit: employeeLimit || 50,
        userLimit: userLimit || 10,
        storageLimit: storageLimit || 5,
        aiCreditLimit: aiCreditLimit || 100,
        trialStartDate: trialStartDate ? new Date(trialStartDate) : null,
        trialEndDate: trialEndDate ? new Date(trialEndDate) : null,
        subscriptionStartDate: subscriptionStartDate ? new Date(subscriptionStartDate) : null,
        subscriptionEndDate: subscriptionEndDate ? new Date(subscriptionEndDate) : null,
        billingCycle: billingCycle || 'monthly',
        paymentStatus: paymentStatus || 'pending',
        status: status || 'active',
        timezone: timezone || 'UTC',
      },
    });

    // Create default company group for the tenant
    await prisma.companyGroup.create({
      data: {
        name: companyName || name,
        tenantId: tenant.id,
      },
    });

    return NextResponse.json({ tenant }, { status: 201, headers: corsHeaders() });
  } catch (error) {
    console.error('Create tenant error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
