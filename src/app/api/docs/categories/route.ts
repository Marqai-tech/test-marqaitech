import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getTokenFromHeaders, verifyToken } from '@/lib/auth';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

// GET: List all active categories with article counts
export async function GET(request: Request) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    const payload = verifyToken(token);
    if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });

    const categories = await prisma.docCategory.findMany({
      where: { status: 'active' },
      include: {
        _count: { select: { articles: { where: { status: 'published' } } } },
      },
      orderBy: { sortOrder: 'asc' },
    });

    const result = categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      description: cat.description,
      icon: cat.icon,
      color: cat.color,
      sortOrder: cat.sortOrder,
      articleCount: cat._count.articles,
    }));

    return NextResponse.json(result, { headers: corsHeaders() });
  } catch (error) {
    console.error('Error fetching doc categories:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500, headers: corsHeaders() }
    );
  }
}

// POST: Create category (super_admin only)
export async function POST(request: Request) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    const payload = verifyToken(token);
    if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });

    const user = await prisma.user.findUnique({ where: { id: payload.userId as string } });
    if (!user || user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Only super admins can create categories' }, { status: 403, headers: corsHeaders() });
    }

    const body = await request.json();
    const { name, slug, description, icon, color, sortOrder } = body;

    if (!name || !slug) {
      return NextResponse.json({ error: 'Name and slug are required' }, { status: 400, headers: corsHeaders() });
    }

    const existing = await prisma.docCategory.findUnique({ where: { slug } });
    if (existing) {
      return NextResponse.json({ error: 'Category with this slug already exists' }, { status: 409, headers: corsHeaders() });
    }

    const category = await prisma.docCategory.create({
      data: {
        name,
        slug,
        description,
        icon: icon || 'FiBookOpen',
        color: color || 'blue',
        sortOrder: sortOrder || 0,
      },
    });

    return NextResponse.json(category, { status: 201, headers: corsHeaders() });
  } catch (error) {
    console.error('Error creating doc category:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500, headers: corsHeaders() }
    );
  }
}
