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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });

    const { id } = await params;
    const subVendor = await prisma.vendor.findFirst({
      where: { id, category: 'sub_vendor' },
    });

    if (!subVendor) {
      return NextResponse.json({ error: 'Sub-vendor not found' }, { status: 404, headers: corsHeaders() });
    }

    return NextResponse.json({ subVendor }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Get sub-vendor error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });

    const { id } = await params;
    const existing = await prisma.vendor.findFirst({
      where: { id, category: 'sub_vendor' },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Sub-vendor not found' }, { status: 404, headers: corsHeaders() });
    }

    const body = await request.json();
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.contactPerson !== undefined) data.contactPerson = body.contactPerson || null;
    if (body.email !== undefined) data.email = body.email || null;
    if (body.phone !== undefined) data.phone = body.phone || null;
    if (body.address !== undefined) data.address = body.address || null;
    if (body.city !== undefined) data.city = body.city || null;
    if (body.country !== undefined) data.country = body.country || null;
    if (body.website !== undefined) data.website = body.website || null;
    if (body.status !== undefined) data.status = body.status;
    if (body.notes !== undefined) data.notes = body.notes || null;
    if (body.contractStart !== undefined) data.contractStart = body.contractStart ? new Date(body.contractStart) : null;
    if (body.contractEnd !== undefined) data.contractEnd = body.contractEnd ? new Date(body.contractEnd) : null;

    const subVendor = await prisma.vendor.update({ where: { id }, data });

    await prisma.auditLog.create({
      data: { userId: decoded.userId as string, action: 'UPDATE_SUB_VENDOR', module: 'vendors', details: `Updated sub-vendor ${id}` },
    });

    return NextResponse.json({ subVendor }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Update sub-vendor error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });

    const { id } = await params;
    const existing = await prisma.vendor.findFirst({
      where: { id, category: 'sub_vendor' },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Sub-vendor not found' }, { status: 404, headers: corsHeaders() });
    }

    await prisma.vendor.delete({ where: { id } });

    await prisma.auditLog.create({
      data: { userId: decoded.userId as string, action: 'DELETE_SUB_VENDOR', module: 'vendors', details: `Deleted sub-vendor ${existing.name}` },
    });

    return NextResponse.json({ message: 'Sub-vendor deleted successfully' }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Delete sub-vendor error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
