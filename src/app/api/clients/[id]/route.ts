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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    }

    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    }

    const { id } = await params;

    const client = await prisma.client.findUnique({
      where: { id },
      include: {
        company: { select: { id: true, name: true, code: true } },
        projects: {
          select: {
            id: true, name: true, code: true, status: true,
            projectType: true, startDate: true, endDate: true, progress: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404, headers: corsHeaders() });
    }

    return NextResponse.json({ client }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Get client error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    }

    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    }

    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.client.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404, headers: corsHeaders() });
    }

    const updateData: Record<string, unknown> = {};
    const fields = [
      'name', 'code', 'industry', 'website', 'contactName', 'contactEmail',
      'contactPhone', 'address', 'city', 'state', 'country', 'zipCode',
      'billingCurrency', 'paymentTerms', 'contractValue',
    ];
    for (const field of fields) {
      if (body[field] !== undefined) updateData[field] = body[field];
    }
    if (body.contractStart !== undefined) updateData.contractStart = body.contractStart ? new Date(body.contractStart) : null;
    if (body.contractEnd !== undefined) updateData.contractEnd = body.contractEnd ? new Date(body.contractEnd) : null;
    if (body.status !== undefined) updateData.status = body.status;

    const client = await prisma.client.update({
      where: { id },
      data: updateData,
      include: { company: { select: { id: true, name: true } } },
    });

    await prisma.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'UPDATE_CLIENT',
        module: 'clients',
        details: `Updated client ${id}`,
      },
    });

    return NextResponse.json({ client }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Update client error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    }

    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    }

    const { id } = await params;

    const existing = await prisma.client.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404, headers: corsHeaders() });
    }

    // Soft delete
    const client = await prisma.client.update({
      where: { id },
      data: { status: 'inactive' },
    });

    await prisma.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'DELETE_CLIENT',
        module: 'clients',
        details: `Soft deleted client ${id} (${existing.name})`,
      },
    });

    return NextResponse.json({ message: 'Client deactivated successfully', client }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Delete client error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
