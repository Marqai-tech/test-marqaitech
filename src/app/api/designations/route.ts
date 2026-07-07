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
    const departmentId = url.searchParams.get('departmentId');
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '100');

    const where: Record<string, unknown> = { status: 'active' };
    if (departmentId) where.departmentId = departmentId;

    const designations = await db.designation.findMany({
      where,
      orderBy: [{ level: 'asc' }, { title: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
      include: {
        department: { select: { id: true, name: true } },
        _count: { select: { employees: true } },
      },
    });

    const total = await db.designation.count({ where });

    return NextResponse.json({
      data: designations,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Designations GET error:', error);
    return NextResponse.json({
      data: [],
      pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
    }, { headers: corsHeaders() });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, departmentId, level, minSalary, maxSalary, status } = body;

    if (!title || !departmentId) {
      return NextResponse.json({ error: 'Title and departmentId are required' }, { status: 400, headers: corsHeaders() });
    }

    const designation = await db.designation.create({
      data: {
        title,
        departmentId,
        level: level || 1,
        minSalary: minSalary || null,
        maxSalary: maxSalary || null,
        status: status || 'active',
      },
      include: {
        department: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ designation }, { status: 201, headers: corsHeaders() });
  } catch (error) {
    console.error('Designations POST error:', error);
    return NextResponse.json({ error: 'Failed to create designation' }, { status: 500, headers: corsHeaders() });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...updateData } = body;

    if (!id) {
      return NextResponse.json({ error: 'Designation ID is required' }, { status: 400, headers: corsHeaders() });
    }

    const existing = await db.designation.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Designation not found' }, { status: 404, headers: corsHeaders() });
    }

    const designation = await db.designation.update({
      where: { id },
      data: updateData,
      include: {
        department: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ designation }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Designations PUT error:', error);
    return NextResponse.json({ error: 'Failed to update designation' }, { status: 500, headers: corsHeaders() });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Designation ID is required' }, { status: 400, headers: corsHeaders() });
    }

    await db.designation.delete({ where: { id } });
    return NextResponse.json({ message: 'Designation deleted' }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Designations DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete designation' }, { status: 500, headers: corsHeaders() });
  }
}
