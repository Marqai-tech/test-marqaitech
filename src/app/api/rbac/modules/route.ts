import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/rbac/modules — List all modules with permissions
export async function GET() {
  try {
    const modules = await db.module.findMany({
      include: {
        permissions: { orderBy: { action: 'asc' } },
      },
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
    });

    return NextResponse.json({ modules });
  } catch (error: unknown) {
    console.error('Get modules error:', error);
    return NextResponse.json({ error: 'Failed to fetch modules' }, { status: 500 });
  }
}
