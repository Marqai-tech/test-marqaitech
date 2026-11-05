/**
 * Legacy compat route — now backed by the real LearningPath model (Task 38).
 */
import { NextResponse } from 'next/server';
import { lndAuth, companyWhere, CORS } from '@/lib/lnd-core';

function ch() { return CORS; }
export async function OPTIONS() { return new Response(null, { status: 204, headers: ch() }); }

export async function GET(request: Request) {
  const auth = await lndAuth(request);
  if (!auth) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: ch() });
  try {
    const paths = await auth.db.learningPath.findMany({
      where: companyWhere(auth.companyId),
      include: { _count: { select: { pathCourses: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return NextResponse.json({ learningPaths: paths.map((p: Record<string, unknown> & { _count: { pathCourses: number } }) => ({ ...p, courseCount: p._count.pathCourses })) }, { headers: ch() });
  } catch (error) {
    console.error('LearningPaths GET error:', error);
    return NextResponse.json({ error: 'Failed to load learning paths' }, { status: 500, headers: ch() });
  }
}
