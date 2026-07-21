/**
 * Attendance Policy Config API — REQ-CFG-03, REQ-OT-01, REQ-AI-ATT-04, REQ-ATT-07
 *  GET — get the current policy (or default values if none exists)
 *  PUT — upsert the policy (admin only)
 *
 * Company scoping:
 *  - Employees (scope='self'): can only see their own company's policy
 *  - Admins with companyId selected: see that company's policy
 *  - Admins without companyId: see the first policy or default
 */
import { isAdminRole, parseBody, ok, fail, OPTIONS } from '@/lib/attendance-leave-api';
import { resolveCompanyScope } from '@/lib/companyScope';
import prisma from '@/lib/prisma';
import { withSchemaSync } from '@/lib/schema-sync';

export { OPTIONS };

export async function GET(request: Request) {
  const scope = await resolveCompanyScope(request);
  if (!scope) return fail('Unauthorized', 401);
  try {
    // Build the where clause based on company scope
    const where: Record<string, unknown> = {};
    if (scope.scope === 'self') {
      // Non-admin: filter by their own company
      if (scope.ownCompanyId) {
        where.companyId = scope.ownCompanyId;
      } else {
        // No company association — return defaults
        const defaultConfig = {
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
          companyId: null,
          createdAt: new Date(0),
          updatedAt: new Date(0),
        };
        return ok({ config: defaultConfig });
      }
    } else if (scope.companyId) {
      // Admin with specific company selected
      where.companyId = scope.companyId;
    }
    // scope === 'all' && no companyId → admin sees the latest policy (no company filter)

    let config = await withSchemaSync(() => prisma.attendancePolicyConfig.findFirst({
      where,
      orderBy: { createdAt: 'desc' },
    }));
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
        companyId: scope.companyId || scope.ownCompanyId || null,
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
  const scope = await resolveCompanyScope(request);
  if (!scope) return fail('Unauthorized', 401);
  if (!isAdminRole(scope.role)) return fail('Admin only', 403);

  const body = await parseBody(request);
  if (!body) return fail('Invalid JSON');
  try {
    // Determine which company this policy belongs to
    const policyCompanyId = scope.companyId || scope.ownCompanyId || null;

    const where: Record<string, unknown> = {};
    if (policyCompanyId) {
      where.companyId = policyCompanyId;
    }

    const existing = await withSchemaSync(() => prisma.attendancePolicyConfig.findFirst({
      where,
      orderBy: { createdAt: 'desc' },
    }));

    const data = {
      name: (body.name as string) || existing?.name || 'Default Policy',
      companyId: policyCompanyId,
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
