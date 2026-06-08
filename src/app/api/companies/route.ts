import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET /api/companies — List companies (optionally filtered by tenant)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get('tenantId');
    const search = searchParams.get('search');

    const where: Record<string, unknown> = {};
    if (tenantId) {
      // Find companies via company groups belonging to the tenant
      const companyGroups = await prisma.companyGroup.findMany({
        where: { tenantId },
        select: { id: true },
      });
      const groupIds = companyGroups.map((g) => g.id);
      where.companyGroupId = { in: groupIds };
    }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
      ];
    }

    const companies = await prisma.company.findMany({
      where,
      include: {
        companyGroup: { select: { id: true, name: true, tenantId: true } },
        _count: { select: { departments: true, branches: true } },
      },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({ companies });
  } catch (error: unknown) {
    console.error('Get companies error:', error);
    return NextResponse.json({ error: 'Failed to fetch companies' }, { status: 500 });
  }
}
