import { requireUser, ok, fail, OPTIONS } from '@/lib/attendance-leave-api';
import prisma from '@/lib/prisma';

export { OPTIONS };

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, response } = await requireUser(request);
  if (!user) return response;
  try {
    const { id } = await params;
    // Find the user's employee record to ensure they only delete their own elections
    const emp = await prisma.employee.findFirst({ where: { email: user.email } });
    if (!emp) return fail('Employee record not found', 404);

    const election = await prisma.optionalHolidayElection.findUnique({ where: { id } });
    if (!election) return fail('Not found', 404);
    if (election.employeeId !== emp.id) return fail('Forbidden', 403);

    await prisma.optionalHolidayElection.delete({ where: { id } });
    return ok({ deleted: true });
  } catch (e: unknown) {
    return fail(e instanceof Error ? e.message : 'Failed to delete', 500);
  }
}
