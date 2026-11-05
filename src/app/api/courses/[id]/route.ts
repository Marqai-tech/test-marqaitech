/**
 * Legacy compat route — real Course detail (Task 38).
 */
import { NextResponse } from 'next/server';
import { lndAuth, CORS } from '@/lib/lnd-core';

function ch() { return CORS; }
export async function OPTIONS() { return new Response(null, { status: 204, headers: ch() }); }

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await lndAuth(request);
  if (!auth) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: ch() });
  try {
    const { id } = await params;
    const course = await auth.db.course.findUnique({
      where: { id },
      include: { modules: { orderBy: { order: 'asc' } }, enrollments: { include: { employee: { select: { id: true, firstName: true, lastName: true } } } } },
    });
    if (!course) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: ch() });
    return NextResponse.json({ course }, { headers: ch() });
  } catch (error) {
    console.error('Course GET error:', error);
    return NextResponse.json({ error: 'Failed to load course' }, { status: 500, headers: ch() });
  }
}
