/**
 * Legacy compat route — /api/learning now proxies the real L&D module
 * (CourseEnrollment records, Task 38). Previously returned hardcoded demo data.
 */
import { lndAuth, json, CORS } from '@/lib/lnd-core';

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(request: Request) {
  const auth = await lndAuth(request);
  if (!auth) return json({ error: 'Unauthorized' }, 401);
  try {
    const { searchParams } = new URL(request.url);
    const where: Record<string, unknown> = {};
    const employeeId = searchParams.get('employeeId');
    if (employeeId) where.employeeId = employeeId;
    else if (!auth.isAdmin && auth.employeeId) where.employeeId = auth.employeeId;
    const status = searchParams.get('status');
    if (status) where.status = status;

    const enrollments = await auth.db.courseEnrollment.findMany({
      where,
      include: {
        course: { select: { id: true, title: true, category: true, mode: true, level: true } },
        employee: { select: { id: true, employeeId: true, firstName: true, lastName: true, companyId: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
    const data = enrollments.map((e: Record<string, unknown>) => ({
      id: e.id,
      employeeId: (e as { employee?: { id: string } }).employee?.id,
      courseName: (e as { course?: { title: string } }).course?.title,
      provider: (e as { course?: { category: string } }).course?.category,
      type: (e as { course?: { mode: string } }).course?.mode,
      status: e.status,
      score: e.score,
      completedAt: e.completedAt,
      progress: e.progress,
      companyId: (e as { employee?: { companyId: string } }).employee?.companyId,
    }));
    return json({ data, legacy: true });
  } catch (error) {
    console.error('[learning compat] GET error:', error);
    return json({ error: 'Failed to load learning records' }, 500);
  }
}
