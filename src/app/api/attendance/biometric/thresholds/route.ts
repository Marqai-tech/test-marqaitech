/**
 * AI Punch Risk Thresholds API — REQ-AI-ATT-01, REQ-AI-ATT-02
 *
 * GET  /api/attendance/biometric/thresholds
 * PATCH /api/attendance/biometric/thresholds
 *
 * Tenant-level thresholds for spoofing risk, buddy-punch risk, impossible-travel,
 * and off-hours flagging. The webhook (POST /api/attendance/biometric/punch) and
 * the mobile punch endpoint (POST /api/attendance/punch/mobile) consult these.
 */
import { requireUser, parseBody, ok, fail, OPTIONS, isAdminRole } from '@/lib/attendance-leave-api';
import prisma from '@/lib/prisma';

export { OPTIONS };

export async function GET(request: Request) {
  const { user, response } = await requireUser(request);
  if (!user) return response;
  try {
    let thresholds = await prisma.attendanceAiThreshold.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: 'desc' },
    });
    if (!thresholds) {
      // Lazily create defaults
      thresholds = await prisma.attendanceAiThreshold.create({ data: { name: 'default' } });
    }
    return ok({ thresholds });
  } catch (e: unknown) {
    return fail(e instanceof Error ? e.message : 'Failed to load thresholds', 500);
  }
}

export async function PATCH(request: Request) {
  const { user, response } = await requireUser(request);
  if (!user) return response;
  if (!isAdminRole(user.role)) return fail('Only admins can update AI thresholds', 403);

  const body = await parseBody(request);
  if (!body) return fail('Invalid JSON');

  try {
    let thresholds = await prisma.attendanceAiThreshold.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: 'desc' },
    });
    if (!thresholds) {
      thresholds = await prisma.attendanceAiThreshold.create({ data: { name: 'default' } });
    }

    const data: Record<string, unknown> = {};
    if (typeof body.spoofingRiskThreshold === 'number') data.spoofingRiskThreshold = body.spoofingRiskThreshold;
    if (typeof body.buddyPunchRiskThreshold === 'number') data.buddyPunchRiskThreshold = body.buddyPunchRiskThreshold;
    if (typeof body.impossibleTravelKm === 'number') data.impossibleTravelKm = body.impossibleTravelKm;
    if (typeof body.impossibleTravelMinutes === 'number') data.impossibleTravelMinutes = body.impossibleTravelMinutes;
    if (typeof body.offHoursStartMinutes === 'number') data.offHoursStartMinutes = body.offHoursStartMinutes;
    if (typeof body.offHoursEndMinutes === 'number') data.offHoursEndMinutes = body.offHoursEndMinutes;
    if (typeof body.isActive === 'boolean') data.isActive = body.isActive;

    const updated = await prisma.attendanceAiThreshold.update({ where: { id: thresholds.id }, data });
    return ok({ thresholds: updated });
  } catch (e: unknown) {
    return fail(e instanceof Error ? e.message : 'Failed to update thresholds', 500);
  }
}
