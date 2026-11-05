/**
 * Legacy compat route — real LearningPath detail (Task 38).
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
    const path = await auth.db.learningPath.findUnique({
      where: { id },
      include: { pathCourses: { include: { course: true }, orderBy: { order: 'asc' } } },
    });
    if (!path) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: ch() });
    return NextResponse.json({ path }, { headers: ch() });
  } catch (error) {
    console.error('LearningPath GET error:', error);
    return NextResponse.json({ error: 'Failed to load learning path' }, { status: 500, headers: ch() });
  }
}
