import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });

    const tenant = await prisma.tenant.findUnique({
      where: { id },
      include: {
        companyGroups: { include: { _count: { select: { companies: true } } } },
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

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });

    const body = await request.json();
    const data: Record<string, unknown> = {};

    if (body.name !== undefined) data.name = body.name;
    if (body.slug !== undefined) data.slug = body.slug;
    if (body.domain !== undefined) data.domain = body.domain || null;
    if (body.tenantType !== undefined) data.tenantType = body.tenantType;
    if (body.companyName !== undefined) data.companyName = body.companyName || null;
    if (body.legalName !== undefined) data.legalName = body.legalName || null;
    if (body.industry !== undefined) data.industry = body.industry || null;
    if (body.country !== undefined) data.country = body.country || null;
    if (body.currency !== undefined) data.currency = body.currency;
    if (body.adminName !== undefined) data.adminName = body.adminName || null;
    if (body.adminEmail !== undefined) data.adminEmail = body.adminEmail || null;
    if (body.adminMobile !== undefined) data.adminMobile = body.adminMobile || null;
    if (body.plan !== undefined) data.plan = body.plan;
    if (body.employeeLimit !== undefined) data.employeeLimit = parseInt(body.employeeLimit) || 50;
    if (body.userLimit !== undefined) data.userLimit = parseInt(body.userLimit) || 10;
    if (body.storageLimit !== undefined) data.storageLimit = parseInt(body.storageLimit) || 5;
    if (body.aiCreditLimit !== undefined) data.aiCreditLimit = parseInt(body.aiCreditLimit) || 100;
    if (body.trialStartDate !== undefined) data.trialStartDate = body.trialStartDate ? new Date(body.trialStartDate) : null;
    if (body.trialEndDate !== undefined) data.trialEndDate = body.trialEndDate ? new Date(body.trialEndDate) : null;
    if (body.subscriptionStartDate !== undefined) data.subscriptionStartDate = body.subscriptionStartDate ? new Date(body.subscriptionStartDate) : null;
    if (body.subscriptionEndDate !== undefined) data.subscriptionEndDate = body.subscriptionEndDate ? new Date(body.subscriptionEndDate) : null;
    if (body.billingCycle !== undefined) data.billingCycle = body.billingCycle;
    if (body.paymentStatus !== undefined) data.paymentStatus = body.paymentStatus;
    if (body.status !== undefined) data.status = body.status;
    if (body.timezone !== undefined) data.timezone = body.timezone;
    if (body.logo !== undefined) data.logo = body.logo || null;

    const tenant = await prisma.tenant.update({ where: { id }, data });
    return NextResponse.json({ tenant }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Update tenant error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });

    await prisma.tenant.delete({ where: { id } });
    return NextResponse.json({ message: 'Tenant deleted successfully' }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Delete tenant error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
