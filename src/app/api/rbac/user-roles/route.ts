import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/rbac/user-roles — List users with their role assignments
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get('tenantId');
    const companyId = searchParams.get('companyId');
    const search = searchParams.get('search');

    const where: Record<string, unknown> = {};
    if (tenantId) where.tenantId = tenantId;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const users = await db.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        avatar: true,
        tenantId: true,
        tenant: { select: { id: true, name: true, slug: true } },
        employee: { select: { id: true, firstName: true, lastName: true, companyId: true } },
        roleAssignments: {
          include: {
            role: { select: { id: true, name: true, key: true, level: true, isSystem: true, companyId: true } },
          },
        },
      },
      orderBy: { name: 'asc' },
      take: 100,
    });

    // Filter by company if specified (check role assignments)
    let filtered: typeof users = users;
    if (companyId) {
      filtered = users.filter((u: typeof users[number]) =>
        u.roleAssignments.some((ra: { companyId: string | null }) => ra.companyId === companyId || ra.companyId === null)
      );
    }

    return NextResponse.json({ users: filtered });
  } catch (error: unknown) {
    console.error('Get user roles error:', error);
    return NextResponse.json({ error: 'Failed to fetch user roles' }, { status: 500 });
  }
}
