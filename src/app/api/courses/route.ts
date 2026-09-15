/**
 * Legacy compat route — now backed by the real Course model (Task 38).
 */
import { NextResponse } from 'next/server';
import { lndAuth, companyWhere, CORS, ADMIN_ROLES } from '@/lib/lnd-core';

function ch() { return CORS; }
export async function OPTIONS() { return new Response(null, { status: 204, headers: ch() }); }

export async function GET(request: Request) {
  const auth = await lndAuth(request);
  if (!auth) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: ch() });
  try {
    const courses = await auth.db.course.findMany({
      where: companyWhere(auth.companyId),
      include: { _count: { select: { enrollments: true, modules: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return NextResponse.json({ courses }, { headers: ch() });
  } catch (error) {
    console.error('Courses GET error:', error);
    return NextResponse.json({ error: 'Failed to load courses' }, { status: 500, headers: ch() });
  }
}

export async function POST(request: Request) {
  const auth = await lndAuth(request);
  if (!auth) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: ch() });
  if (!ADMIN_ROLES.includes(auth.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: ch() });
  try {
    const body = await request.json();
    if (!body.title) return NextResponse.json({ error: 'title is required' }, { status: 400, headers: ch() });
    const course = await auth.db.course.create({
      data: {
        title: body.title,
        description: body.description || null,
        category: body.category || 'technical',
        provider: body.provider || null,
        mode: body.mode || 'e_learning',
        level: body.level || 'beginner',
        durationHours: Number(body.duration) || Number(body.durationHours) || 1,
        skills: Array.isArray(body.skills) ? body.skills : null,
        status: body.status || 'published',
        companyId: body.companyId || auth.companyId,
        createdById: auth.userId,
      },
    });
    return NextResponse.json({ course }, { status: 201, headers: ch() });
  } catch (error) {
    console.error('Courses POST error:', error);
    return NextResponse.json({ error: 'Failed to create course' }, { status: 500, headers: ch() });
  }
}
