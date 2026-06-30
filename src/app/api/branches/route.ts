import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const companyId = url.searchParams.get('companyId');
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '100');

    const where: Record<string, unknown> = { status: 'active' };
    if (companyId) where.companyId = companyId;

    const branches = await db.branch.findMany({
      where,
      orderBy: { name: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        company: { select: { id: true, name: true, code: true } },
        _count: { select: { employees: true } },
      },
    });

    const total = await db.branch.count({ where });

    return NextResponse.json({
      data: branches,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Branches GET error:', error);
    // Demo data fallback when database is unavailable
    const url = new URL(req.url);
    const companyId = url.searchParams.get('companyId');

    const demoBranches = [
      { id: 'branch-1', name: 'Mumbai HQ', code: 'MUM', city: 'Mumbai', state: 'Maharashtra', country: 'India', address: 'BKC, Bandra East', zipCode: '400051', phone: '+91 22 4567 8901', email: 'mumbai@3boxes.com', status: 'active', companyId: companyId || 'comp-1', company: { id: companyId || 'comp-1', name: 'Marq AI Tech Pvt Ltd', code: '3BOXES' }, _count: { employees: 5 }, createdAt: new Date(), updatedAt: new Date() },
      { id: 'branch-2', name: 'Bangalore Tech Park', code: 'BLR', city: 'Bangalore', state: 'Karnataka', country: 'India', address: 'Whitefield Main Road', zipCode: '560066', phone: '+91 80 2345 6789', email: 'blr@3boxes.com', status: 'active', companyId: companyId || 'comp-1', company: { id: companyId || 'comp-1', name: 'Marq AI Tech Pvt Ltd', code: '3BOXES' }, _count: { employees: 4 }, createdAt: new Date(), updatedAt: new Date() },
      { id: 'branch-3', name: 'Delhi NCR Office', code: 'DEL', city: 'New Delhi', state: 'Delhi', country: 'India', address: 'Connaught Place', zipCode: '110001', phone: '+91 11 3456 7890', email: 'delhi@3boxes.com', status: 'active', companyId: companyId || 'comp-1', company: { id: companyId || 'comp-1', name: 'Marq AI Tech Pvt Ltd', code: '3BOXES' }, _count: { employees: 2 }, createdAt: new Date(), updatedAt: new Date() },
      { id: 'branch-4', name: 'Hyderabad Campus', code: 'HYD', city: 'Hyderabad', state: 'Telangana', country: 'India', address: 'HITEC City, Madhapur', zipCode: '500081', phone: '+91 40 4567 8901', email: 'hyd@3boxes.com', status: 'active', companyId: 'comp-2', company: { id: 'comp-2', name: '3Boxes Solutions', code: 'NEXSOL' }, _count: { employees: 6 }, createdAt: new Date(), updatedAt: new Date() },
      { id: 'branch-5', name: 'Chennai Center', code: 'CHN', city: 'Chennai', state: 'Tamil Nadu', country: 'India', address: 'OMR, Thoraipakkam', zipCode: '600097', phone: '+91 44 5678 9012', email: 'chn@3boxes.com', status: 'active', companyId: 'comp-2', company: { id: 'comp-2', name: '3Boxes Solutions', code: 'NEXSOL' }, _count: { employees: 4 }, createdAt: new Date(), updatedAt: new Date() },
      { id: 'branch-6', name: 'Pune Office', code: 'PUN', city: 'Pune', state: 'Maharashtra', country: 'India', address: 'Hinjewadi Phase 2', zipCode: '411057', phone: '+91 20 6789 0123', email: 'pune@3boxes.com', status: 'active', companyId: 'comp-3', company: { id: 'comp-3', name: '3Boxes Staffing', code: 'NEXSTAFF' }, _count: { employees: 10 }, createdAt: new Date(), updatedAt: new Date() },
    ];

    return NextResponse.json({
      data: demoBranches,
      pagination: { page: 1, limit: 100, total: demoBranches.length, totalPages: 1 },
    }, { headers: corsHeaders() });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, code, companyId, country, state, city, address, zipCode, phone, email, status } = body;

    if (!name || !companyId) {
      return NextResponse.json({ error: 'Name and companyId are required' }, { status: 400, headers: corsHeaders() });
    }

    const branch = await db.branch.create({
      data: {
        name,
        code: code || name.substring(0, 3).toUpperCase(),
        companyId,
        country: country || 'India',
        state,
        city,
        address,
        zipCode,
        phone,
        email,
        status: status || 'active',
      },
      include: {
        company: { select: { id: true, name: true, code: true } },
      },
    });

    return NextResponse.json({ branch }, { status: 201, headers: corsHeaders() });
  } catch (error) {
    console.error('Branches POST error:', error);
    return NextResponse.json({ error: 'Failed to create branch' }, { status: 500, headers: corsHeaders() });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...updateData } = body;

    if (!id) {
      return NextResponse.json({ error: 'Branch ID is required' }, { status: 400, headers: corsHeaders() });
    }

    const existing = await db.branch.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Branch not found' }, { status: 404, headers: corsHeaders() });
    }

    const branch = await db.branch.update({
      where: { id },
      data: updateData,
      include: {
        company: { select: { id: true, name: true, code: true } },
      },
    });

    return NextResponse.json({ branch }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Branches PUT error:', error);
    return NextResponse.json({ error: 'Failed to update branch' }, { status: 500, headers: corsHeaders() });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Branch ID is required' }, { status: 400, headers: corsHeaders() });
    }

    await db.branch.delete({ where: { id } });
    return NextResponse.json({ message: 'Branch deleted' }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Branches DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete branch' }, { status: 500, headers: corsHeaders() });
  }
}
