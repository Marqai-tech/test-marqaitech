import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyPassword, createToken } from '@/lib/auth';
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

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400, headers: corsHeaders() }
      );
    }

    // ─── Subdomain-based tenant validation ───
    // When the app is accessed via a tenant subdomain (e.g.,
    // marqaitechgroup.3boxeshrms.com), we verify that the user
    // belongs to that specific tenant. Super admins can log in
    // from any domain. All other roles must match the subdomain tenant.
    const tenantSlug = request.headers.get('x-tenant-slug') || '';
    let subdomainTenantId: string | null = null;

    if (tenantSlug) {
      const subdomainTenant = await prisma.tenant.findUnique({
        where: { slug: tenantSlug },
        select: { id: true, status: true },
      });
      if (subdomainTenant && subdomainTenant.status === 'active') {
        subdomainTenantId = subdomainTenant.id;
      }
    }

    // ⚠️ Use explicit `select` (not `include: { tenant: true }`) so we only
    // request columns we know exist on the User and Tenant tables. An
    // `include: { tenant: true }` would SELECT every Tenant column, which
    // breaks login entirely whenever schema.prisma gains new Tenant fields
    // that haven't been migrated to the production DB yet (this exact bug
    // caused a global login outage on 2026-06-19 after the SRS rework
    // added language/baseCurrency/dataRegion/subscriptionSeats/
    // subscriptionStorage columns). With `select`, missing columns on the
    // DB side are simply not queried and login stays resilient.
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        password: true,
        role: true,
        status: true,
        avatar: true,
        tenantId: true,
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
        { error: 'Invalid email or password' },
        { status: 401, headers: corsHeaders() }
      );
    }

    if (user.status !== 'active') {
      return NextResponse.json(
        { error: 'Account is deactivated. Please contact administrator.' },
        { status: 401, headers: corsHeaders() }
      );
    }

    const isValid = await verifyPassword(password, user.password);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401, headers: corsHeaders() }
      );
    }

    // ─── Enforce subdomain-tenant matching ───
    // If the login request came from a tenant subdomain, non-super-admin
    // users must belong to that tenant. This prevents employees of one
    // tenant from logging in through another tenant's subdomain.
    if (subdomainTenantId && user.role !== 'super_admin' && user.tenantId !== subdomainTenantId) {
      return NextResponse.json(
        { error: 'You do not have access to this organization. Please use your organization\'s login page.' },
        { status: 403, headers: corsHeaders() }
      );
    }

    // ─── Enforce trial expiry ───
    // If the user's tenant has status 'trial', check if the trial period has expired.
    // Super admins can always log in. Expired trial tenants are blocked.
    if (user.role !== 'super_admin' && user.tenantId) {
      try {
        const tenant = await prisma.tenant.findUnique({
          where: { id: user.tenantId },
          select: { id: true, status: true, slug: true },
        });
        if (tenant?.status === 'trial') {
          // Check the TrialRegistration for expiry
          const trialReg = await prisma.trialRegistration.findFirst({
            where: { tenantId: tenant.id },
            select: { trialEnd: true, status: true },
          });
          if (trialReg && trialReg.trialEnd && new Date(trialReg.trialEnd) < new Date()) {
            // Trial has expired
            // Auto-update the tenant and registration status
            try {
              await prisma.tenant.update({
                where: { id: tenant.id },
                data: { status: 'expired' },
              });
              await prisma.trialRegistration.update({
                where: { id: trialReg.id },
                data: { status: 'expired' },
              });
            } catch { /* best effort */ }

            return NextResponse.json(
              {
                error: 'Your 15-day free trial has expired. Please contact 3Boxes HRMS support to continue with a subscription plan.',
                code: 'TRIAL_EXPIRED',
                trialEnd: trialReg.trialEnd,
              },
              { status: 403, headers: corsHeaders() }
            );
          }
        } else if (tenant?.status === 'expired') {
          return NextResponse.json(
            {
              error: 'Your trial access has expired. Please contact 3Boxes HRMS support to activate your subscription.',
              code: 'TRIAL_EXPIRED',
            },
            { status: 403, headers: corsHeaders() }
          );
        }
      } catch (tenantCheckErr) {
        console.error('[Login] Trial expiry check failed (non-fatal):', tenantCheckErr);
        // Don't block login if the check fails — it's a safety measure
      }
    }

    const token = await createToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
    });

    // Non-critical operations - don't block login if these fail
    try {
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLogin: new Date() },
      });
    } catch (e) {
      console.error('Failed to update lastLogin:', e);
    }

    try {
      await prisma.loginActivity.create({
        data: {
          userId: user.id,
          action: 'login',
          ip: request.headers.get('x-forwarded-for') || null,
          userAgent: request.headers.get('user-agent') || null,
        },
      });
    } catch (e) {
      console.error('Failed to create loginActivity:', e);
    }

    try {
      // ─── Clean up ALL previous unread notifications on login ───
      // Mark every previous unread notification as read so the user only sees
      // a single fresh "Welcome" notification — not a wall of stale alerts.
      await prisma.notification.updateMany({
        where: {
          userId: user.id,
          isRead: false,
        },
        data: { isRead: true },
      });

      // Now create a single consolidated welcome notification
      await createNotification({
        tenantId: user.tenantId,
        userId: user.id,
        title: 'Welcome to 3Boxes HRMS',
        message: `Hello ${user.name}! You have successfully logged in. Check your dashboard for updates.`,
        type: 'login',
        category: 'auth',
      });
    } catch (e) {
      console.error('Failed to create notification:', e);
    }

    try {
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: 'LOGIN',
          module: 'auth',
          details: `User ${user.email} logged in`,
          ip: request.headers.get('x-forwarded-for') || null,
          userAgent: request.headers.get('user-agent') || null,
        },
      });
    } catch (e) {
      console.error('Failed to create auditLog:', e);
    }

    // Multi-tenant mode: return the actual tenant name from the database.
    // The previous branding-lockdown (forcing every tenant to "Marq AI Tech Pvt Ltd")
    // has been removed so each tenant keeps its own name (e.g. "Acme Global",
    // "TechStart Solutions", "GlobalHR Services", "Marq AI Tech Pvt Ltd", etc.).
    
    // Fetch company info with logo for non-super_admin users
    let companyData = null;
    if (user.role !== 'super_admin') {
      try {
        const employee = await prisma.employee.findUnique({
          where: { userId: user.id },
          select: { companyId: true },
        });
        if (employee?.companyId) {
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
      } catch (e) {
        console.error('Failed to fetch company for login response:', e);
      }
    }

    return NextResponse.json(
      {
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          tenantId: user.tenantId,
          avatar: user.avatar,
          tenant: {
            id: user.tenant.id,
            name: user.tenant.name,
            slug: user.tenant.slug,
            plan: user.tenant.plan,
            currency: user.tenant.currency,
            timezone: user.tenant.timezone,
            logo: user.tenant.logo,
          },
          company: companyData,
        },
      },
      { headers: corsHeaders() }
    );
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500, headers: corsHeaders() }
    );
  }
}
