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
    return NextResponse.json({
      data: [],
      pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
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
