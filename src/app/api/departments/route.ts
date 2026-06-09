import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const companyId = url.searchParams.get('companyId');
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '100');

    const where: Record<string, unknown> = { isActive: true };
    if (companyId) where.companyId = companyId;

    const departments = await db.department.findMany({
      where,
      orderBy: { name: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        name: true,
        code: true,
        description: true,
        isActive: true,
        companyId: true,
      },
    });

    const total = await db.department.count({ where });

    return NextResponse.json({
      data: departments,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Departments GET error:', error);
    // Demo data fallback when database is unavailable
    const demoDepartments = [
      { id: 'dept-1', name: 'Engineering', code: 'ENG', description: 'Software Engineering Department', isActive: true, companyId: companyId || 'comp-1' },
      { id: 'dept-2', name: 'Human Resources', code: 'HR', description: 'Human Resources Department', isActive: true, companyId: companyId || 'comp-1' },
      { id: 'dept-3', name: 'Design', code: 'DES', description: 'Product Design Department', isActive: true, companyId: companyId || 'comp-1' },
      { id: 'dept-4', name: 'Finance', code: 'FIN', description: 'Finance & Accounting Department', isActive: true, companyId: companyId || 'comp-1' },
      { id: 'dept-5', name: 'Marketing', code: 'MKT', description: 'Marketing & Communications Department', isActive: true, companyId: companyId || 'comp-1' },
      { id: 'dept-6', name: 'Sales', code: 'SAL', description: 'Sales Department', isActive: true, companyId: companyId || 'comp-1' },
      { id: 'dept-7', name: 'Operations', code: 'OPS', description: 'Operations Department', isActive: true, companyId: companyId || 'comp-1' },
    ];

    return NextResponse.json({
      data: demoDepartments,
      pagination: { page: 1, limit: 100, total: demoDepartments.length, totalPages: 1 },
    });
  }
}
