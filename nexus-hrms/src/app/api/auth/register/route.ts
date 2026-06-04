import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { hashPassword, createToken } from '@/lib/auth';

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
    const { name, email, password, tenantName, tenantSlug, role = 'employee' } = body;

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: 'Name, email, and password are required' },
        { status: 400, headers: corsHeaders() }
      );
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'Email already registered' },
        { status: 409, headers: corsHeaders() }
      );
    }

    // Create or find tenant
    let tenant;
    if (tenantSlug) {
      tenant = await prisma.tenant.findUnique({
        where: { slug: tenantSlug },
      });
    }

    if (!tenant) {
      const slug = tenantSlug || email.split('@')[1]?.split('.')[0] || 'default';
      tenant = await prisma.tenant.create({
        data: {
          name: tenantName || `${name}'s Organization`,
          slug,
          plan: 'starter',
          status: 'active',
        },
      });
    }

    const hashedPassword = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        tenantId: tenant.id,
        role,
        status: 'active',
      },
    });

    const token = await createToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
    });

    return NextResponse.json(
      {
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          tenantId: user.tenantId,
        },
      },
      { status: 201, headers: corsHeaders() }
    );
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders() }
    );
  }
}
