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

    const branches = await db.branch.findMany({
      where,
      orderBy: { name: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        name: true,
        code: true,
        city: true,
        country: true,
        isActive: true,
        companyId: true,
      },
    });

    const total = await db.branch.count({ where });

    return NextResponse.json({
      data: branches,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Branches GET error:', error);
    // Demo data fallback when database is unavailable
    const demoBranches = [
      { id: 'branch-1', name: 'Hyderabad HQ', code: 'HYD', city: 'Hyderabad', country: 'India', isActive: true, companyId: companyId || 'comp-1' },
      { id: 'branch-2', name: 'Bangalore Office', code: 'BLR', city: 'Bangalore', country: 'India', isActive: true, companyId: companyId || 'comp-1' },
      { id: 'branch-3', name: 'Mumbai Office', code: 'MUM', city: 'Mumbai', country: 'India', isActive: true, companyId: companyId || 'comp-1' },
    ];

    return NextResponse.json({
      data: demoBranches,
      pagination: { page: 1, limit: 100, total: demoBranches.length, totalPages: 1 },
    });
  }
}
