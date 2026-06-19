import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
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
      return NextResponse.json({ error: 'Only super admins can view platform dashboard' }, { status: 403, headers: corsHeaders() });
    }

    // Tenant counts by status
    const [totalTenants, activeTenants, suspendedTenants, inactiveTenants] = await Promise.all([
      prisma.tenant.count(),
      prisma.tenant.count({ where: { status: 'active' } }),
      prisma.tenant.count({ where: { status: 'suspended' } }),
      prisma.tenant.count({ where: { status: 'inactive' } }),
    ]);

    // Total group companies (a.k.a. parent groups under tenants)
    const totalGroupCompanies = await prisma.companyGroup.count();

    // Total companies (actual inducted companies — sits under group companies).
    // BUG FIX: previously this stat called prisma.companyGroup.count() which
    // returned the GROUP count, not the COMPANY count — so the dashboard
    // showed a misleading "Total Companies" number that was actually the
    // number of group companies.
    const totalCompanies = await prisma.company.count();

    // Total employees across all tenants
    const totalEmployees = await prisma.employee.count({ where: { status: 'active' } });

    // Total revenue from active subscriptions
    const activeSubscriptions = await prisma.subscription.findMany({
      where: { status: 'active' },
      select: { amount: true },
    });
    const totalRevenue = activeSubscriptions.reduce((sum, sub) => sum + (sub.amount || 0), 0);

    // Recent activity (last 5 audit logs)
    const recentActivity = await prisma.auditLog.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    return NextResponse.json({
      totalTenants,
      activeTenants,
      suspendedTenants,
      inactiveTenants,
      totalGroupCompanies,
      totalCompanies,
      totalEmployees,
      totalRevenue,
      platformHealth: totalTenants > 0 ? Math.round((activeTenants / totalTenants) * 100) : 0,
      recentActivity,
    }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Super admin dashboard error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
