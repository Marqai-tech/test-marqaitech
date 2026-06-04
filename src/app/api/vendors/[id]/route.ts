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

    const vendor = await prisma.vendor.findUnique({
      where: { id },
      include: {
        company: { select: { id: true, name: true, code: true } },
        parentVendor: { select: { id: true, name: true, code: true } },
        childVendors: {
          select: { id: true, name: true, code: true, status: true, candidateCount: true, rating: true },
        },
      },
    });

    if (!vendor) {
      return NextResponse.json({ error: 'Vendor not found' }, { status: 404, headers: corsHeaders() });
    }

    return NextResponse.json({ vendor }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Get vendor error:', error);
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

    const existing = await prisma.vendor.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Vendor not found' }, { status: 404, headers: corsHeaders() });
    }

    const updateData: Record<string, unknown> = {};
    const fields = [
      'name', 'code', 'industry', 'website', 'contactName', 'contactEmail',
      'contactPhone', 'address', 'city', 'state', 'country', 'zipCode',
      'specialization', 'candidateCount', 'rating',
    ];
    for (const field of fields) {
      if (body[field] !== undefined) updateData[field] = body[field];
    }
    if (body.status !== undefined) updateData.status = body.status;
    if (body.type !== undefined) updateData.type = body.type;
    if (body.parentVendorId !== undefined) updateData.parentVendorId = body.parentVendorId;

    const vendor = await prisma.vendor.update({
      where: { id },
      data: updateData,
      include: { company: { select: { id: true, name: true } }, parentVendor: { select: { id: true, name: true } } },
    });

    await prisma.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'UPDATE_VENDOR',
        module: 'vendors',
        details: `Updated vendor ${id}`,
      },
    });

    return NextResponse.json({ vendor }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Update vendor error:', error);
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

    const existing = await prisma.vendor.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Vendor not found' }, { status: 404, headers: corsHeaders() });
    }

    // Soft delete
    const vendor = await prisma.vendor.update({
      where: { id },
      data: { status: 'inactive' },
    });

    await prisma.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'DELETE_VENDOR',
        module: 'vendors',
        details: `Soft deleted vendor ${id} (${existing.name})`,
      },
    });

    return NextResponse.json({ message: 'Vendor deactivated successfully', vendor }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Delete vendor error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
