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

    // Step 1: Fetch user with explicit `select` (not `include: { tenant: true }`).
    // Same defensive pattern as /api/auth/login: only request columns we know
    // exist, so a schema drift (new columns in schema.prisma not yet pushed to
    // the production DB) cannot break authentication.
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId as string },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatar: true,
        status: true,
        lastLogin: true,
        createdAt: true,
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            plan: true,
            currency: true,
            timezone: true,
            logo: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404, headers: corsHeaders() }
      );
    }

    // Step 2: Try to fetch employee data separately (graceful fallback)
    let employeeData = null;
    try {
      const employee = await prisma.employee.findUnique({
        where: { userId: user.id },
        include: {
          department: { select: { name: true } },
          designation: { select: { title: true } },
          branch: { select: { name: true } },
        },
      });

      if (employee) {
        // Fetch company info with logo for the employee's company
        let companyData = null;
        try {
          if (employee.companyId) {
            const company = await prisma.company.findUnique({
              where: { id: employee.companyId },
              select: { id: true, name: true, code: true, logo: true, city: true, state: true, country: true },
            });
            if (company) {
              companyData = {
                id: company.id,
                name: company.name,
                code: company.code,
                logo: company.logo,
                city: company.city,
                state: company.state,
                country: company.country,
              };
            }
          }
        } catch (compErr) {
          console.error('[Auth/Me] Company fetch error (non-fatal):', compErr);
        }

        employeeData = {
          id: employee.id,
          employeeId: employee.employeeId,
          firstName: employee.firstName,
          lastName: employee.lastName,
          department: employee.department?.name || null,
          designation: employee.designation?.title || null,
          branch: employee.branch?.name || null,
          companyId: employee.companyId,
          companyLogo: companyData?.logo || null,
          companyName: companyData?.name || null,
          status: employee.status,
          salary: employee.salary,
          company: companyData,
        };
      }
    } catch (empErr) {
      console.error('[Auth/Me] Employee fetch error (non-fatal):', empErr);
      // Continue without employee data — user can still be authenticated
    }

    // Multi-tenant mode: return the actual tenant name from the database.
    // The previous branding-lockdown (forcing every tenant to "Marq AI Tech Pvt Ltd")
    // has been removed so each tenant keeps its own name (e.g. "Acme Global",
    // "TechStart Solutions", "GlobalHR Services", "Marq AI Tech Pvt Ltd", etc.).

    return NextResponse.json(
      {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        status: user.status,
        tenant: {
          id: user.tenant.id,
          name: user.tenant.name,
          slug: user.tenant.slug,
          plan: user.tenant.plan,
          currency: user.tenant.currency,
          timezone: user.tenant.timezone,
          logo: user.tenant.logo,
        },
        employee: employeeData,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt,
      },
      { headers: corsHeaders() }
    );
  } catch (error) {
    console.error('Get current user error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500, headers: corsHeaders() }
    );
  }
}
