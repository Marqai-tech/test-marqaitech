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
    // Demo data fallback
    const demoDesignations = [
      { id: 'des-1', title: 'Software Engineer', departmentId: 'dept-1', level: 1, minSalary: 300000, maxSalary: 600000, status: 'active', department: { id: 'dept-1', name: 'Engineering' }, _count: { employees: 4 }, createdAt: new Date(), updatedAt: new Date() },
      { id: 'des-2', title: 'Senior Engineer', departmentId: 'dept-1', level: 2, minSalary: 600000, maxSalary: 1200000, status: 'active', department: { id: 'dept-1', name: 'Engineering' }, _count: { employees: 3 }, createdAt: new Date(), updatedAt: new Date() },
      { id: 'des-3', title: 'Tech Lead', departmentId: 'dept-1', level: 3, minSalary: 1200000, maxSalary: 2000000, status: 'active', department: { id: 'dept-1', name: 'Engineering' }, _count: { employees: 1 }, createdAt: new Date(), updatedAt: new Date() },
      { id: 'des-4', title: 'HR Executive', departmentId: 'dept-2', level: 1, minSalary: 300000, maxSalary: 600000, status: 'active', department: { id: 'dept-2', name: 'Human Resources' }, _count: { employees: 2 }, createdAt: new Date(), updatedAt: new Date() },
      { id: 'des-5', title: 'HR Manager', departmentId: 'dept-2', level: 4, minSalary: 2000000, maxSalary: 3500000, status: 'active', department: { id: 'dept-2', name: 'Human Resources' }, _count: { employees: 2 }, createdAt: new Date(), updatedAt: new Date() },
      { id: 'des-6', title: 'Finance Manager', departmentId: 'dept-3', level: 4, minSalary: 2000000, maxSalary: 3500000, status: 'active', department: { id: 'dept-3', name: 'Finance' }, _count: { employees: 2 }, createdAt: new Date(), updatedAt: new Date() },
      { id: 'des-7', title: 'Sales Manager', departmentId: 'dept-4', level: 4, minSalary: 2000000, maxSalary: 3500000, status: 'active', department: { id: 'dept-4', name: 'Sales' }, _count: { employees: 2 }, createdAt: new Date(), updatedAt: new Date() },
      { id: 'des-8', title: 'Operations Manager', departmentId: 'dept-6', level: 4, minSalary: 2000000, maxSalary: 3500000, status: 'active', department: { id: 'dept-6', name: 'Operations' }, _count: { employees: 2 }, createdAt: new Date(), updatedAt: new Date() },
    ];

    return NextResponse.json({
      data: demoDesignations,
      pagination: { page: 1, limit: 100, total: demoDesignations.length, totalPages: 1 },
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
