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

    const user = await prisma.user.findUnique({
      where: { email },
      include: { tenant: true },
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
      await createNotification({
        tenantId: user.tenantId,
        userId: user.id,
        title: 'Login Successful',
        message: `Welcome back, ${user.name}! You have successfully logged in.`,
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

    // Always ensure tenant name is "3 Boxes Corp" — never return EH2R, Nexus, or any wrong branding
    let tenantName = user.tenant.name;
    let tenantSlug = user.tenant.slug;
    const nameLower = (tenantName || '').toLowerCase();
    if (!nameLower.includes('3 boxes')) {
      try {
        const fixed = await prisma.tenant.update({
          where: { id: user.tenant.id },
          data: { name: '3 Boxes Corp', slug: '3boxes-corp', domain: '3boxeshrms.com' },
        });
        tenantName = fixed.name;
        tenantSlug = fixed.slug;
        console.log('[Auth] Auto-fixed tenant name from', user.tenant.name, 'to', fixed.name);
      } catch (e) {
        console.error('[Auth] Failed to auto-fix tenant name:', e);
        // Force the correct name even if DB update fails
        tenantName = '3 Boxes Corp';
        tenantSlug = '3boxes-corp';
      }
    }

    // ALWAYS force correct branding - never allow any other name
    tenantName = '3 Boxes Corp';
    tenantSlug = '3boxes-corp';

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
            name: tenantName,
            slug: tenantSlug,
            plan: user.tenant.plan,
            currency: user.tenant.currency,
            timezone: user.tenant.timezone,
          },
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
