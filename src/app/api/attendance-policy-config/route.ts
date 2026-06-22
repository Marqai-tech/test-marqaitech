/**
 * Attendance Policy Config API — REQ-CFG-03, REQ-OT-01, REQ-AI-ATT-04, REQ-ATT-07
 *  GET — get the current policy (or default values if none exists)
 *  PUT — upsert the policy (admin only)
 */
import { requireUser, isAdminRole, parseBody, ok, fail, OPTIONS } from '@/lib/attendance-leave-api';
import prisma from '@/lib/prisma';

export { OPTIONS };

export async function GET(request: Request) {
  const { user, response } = await requireUser(request);
  if (!user) return response;
  try {
    let config = await prisma.attendancePolicyConfig.findFirst({ orderBy: { createdAt: 'desc' } });
    if (!config) {
      // Return sensible defaults without persisting
      config = {
        id: 'default',
        name: 'Default Policy',
        roundEnabled: false,
        roundMinutes: 15,
        roundDirection: 'nearest',
        lateGraceMinutes: 10,
        earlyGraceMinutes: 10,
        autoOvertimeEnabled: true,
        overtimeThresholdMinutes: 480,
        autoApprovePermissionMinutes: 0,
        autoApproveMinAttendancePct: 90,
        wfhActivityMonitoringEnabled: false,
        wfhInactivityThresholdHours: 4,
        createdAt: new Date(0),
        updatedAt: new Date(0),
      } as never;
    }
    return ok({ config });
  } catch (e: unknown) {
    return fail(e instanceof Error ? e.message : 'Failed to load', 500);
  }
}

export async function PUT(request: Request) {
  const { user, response } = await requireUser(request);
  if (!user) return response;
  if (!isAdminRole(user.role)) return fail('Admin only', 403);
  const body = await parseBody(request);
  if (!body) return fail('Invalid JSON');
  try {
    const existing = await prisma.attendancePolicyConfig.findFirst({ orderBy: { createdAt: 'desc' } });

    const data = {
      name: (body.name as string) || existing?.name || 'Default Policy',
      roundEnabled: body.roundEnabled !== undefined ? !!body.roundEnabled : existing?.roundEnabled ?? false,
      roundMinutes: Number(body.roundMinutes) || existing?.roundMinutes || 15,
      roundDirection: (body.roundDirection as string) || existing?.roundDirection || 'nearest',
      lateGraceMinutes: Number(body.lateGraceMinutes) || existing?.lateGraceMinutes || 10,
      earlyGraceMinutes: Number(body.earlyGraceMinutes) || existing?.earlyGraceMinutes || 10,
      autoOvertimeEnabled: body.autoOvertimeEnabled !== undefined ? !!body.autoOvertimeEnabled : existing?.autoOvertimeEnabled ?? true,
      overtimeThresholdMinutes: Number(body.overtimeThresholdMinutes) || existing?.overtimeThresholdMinutes || 480,
      autoApprovePermissionMinutes: Number(body.autoApprovePermissionMinutes) || 0,
      autoApproveMinAttendancePct: Number(body.autoApproveMinAttendancePct) || 90,
      wfhActivityMonitoringEnabled: body.wfhActivityMonitoringEnabled !== undefined ? !!body.wfhActivityMonitoringEnabled : existing?.wfhActivityMonitoringEnabled ?? false,
      wfhInactivityThresholdHours: Number(body.wfhInactivityThresholdHours) || 4,
    };

    let config;
    if (existing) {
      config = await prisma.attendancePolicyConfig.update({ where: { id: existing.id }, data });
    } else {
      config = await prisma.attendancePolicyConfig.create({ data });
    }
    return ok({ config });
  } catch (e: unknown) {
    return fail(e instanceof Error ? e.message : 'Failed to save', 500);
  }
}
