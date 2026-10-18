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
import { getDb, getPlatformDb, getDbForTenantById } from '@/lib/tenant-db';
import { withSchemaSync } from '@/lib/schema-sync';
import { ensureAutoPresentColumn } from '@/lib/attendance-auto-present';

export { OPTIONS };

export async function GET(request: Request) {
  const db = await getDb(request);
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
          lateGraceMinutes: 15,
          earlyGraceMinutes: 10,
          autoOvertimeEnabled: true,
          overtimeThresholdMinutes: 480,
          autoApprovePermissionMinutes: 0,
          autoApproveMinAttendancePct: 90,
          wfhActivityMonitoringEnabled: false,
          wfhInactivityThresholdHours: 4,
          lateMarkAllowancePerMonth: 4,
          lateMarkHalfDayOnExceed: true,
          halfDayAfterMinutes: 21,
          lateMarkNotApplicableOnTour: true,
          shiftStartDefault: '09:30',
          shiftEndDefault: '18:30',
          breakDurationMinutes: 30,
          breakStartTime: '13:30', breakEndTime: '14:30', mandatoryBreakEnabled: false, attendanceRuleScope: 'all_tenants',
          gatePassMaxPerMonth: 1,
          gatePassHalfDayOnExceed: true,
          gatePassHalfDayNextDay: true,
          gatePassEarlyHours: 1,
          canteenEnabled: true,
          canteenFreeForGeneralShift: true,
          canteenFreeForNightShift: true,
          canteenOtfreeThresholdHours: 5,
          autoPresentManagementEnabled: false,
          disableAppCheckin: false,
          disableAppCheckout: false,
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

    // Task 82: idempotent self-heal for the auto-present flag column on
    // whichever DB this request actually resolved to (Vercel's runtime DB
    // stack can differ from the one patch scripts target).
    await ensureAutoPresentColumn(db);

    let config;
    try {
      config = await withSchemaSync(() => db.attendancePolicyConfig.findFirst({
        where,
        orderBy: { createdAt: 'desc' },
      }));
    } catch (dbErr: unknown) {
      // If the table/column doesn't exist in the tenant DB, return defaults
      // instead of crashing. This happens when Prisma migration hasn't been
      // applied to the tenant database yet.
      const errMsg = dbErr instanceof Error ? dbErr.message : String(dbErr);
      if (/column .* does not exist|does not exist in the current database|table .* does not exist/i.test(errMsg)) {
        console.warn('[attendance-policy-config] Table/column missing in tenant DB — returning defaults:', errMsg);
        config = null;
      } else {
        throw dbErr;
      }
    }
    if (!config) {
      // Return sensible defaults without persisting
      config = {
        id: 'default',
        name: 'Default Policy',
        roundEnabled: false,
        roundMinutes: 15,
        roundDirection: 'nearest',
        lateGraceMinutes: 15,
        earlyGraceMinutes: 10,
        autoOvertimeEnabled: true,
        overtimeThresholdMinutes: 480,
        autoApprovePermissionMinutes: 0,
        autoApproveMinAttendancePct: 90,
        wfhActivityMonitoringEnabled: false,
        wfhInactivityThresholdHours: 4,
        lateMarkAllowancePerMonth: 4,
        lateMarkHalfDayOnExceed: true,
        halfDayAfterMinutes: 21,
        lateMarkNotApplicableOnTour: true,
          shiftStartDefault: '09:30',
          shiftEndDefault: '18:30',
        breakDurationMinutes: 30,
        breakStartTime: '13:30', breakEndTime: '14:30', mandatoryBreakEnabled: false, attendanceRuleScope: 'all_tenants',
        gatePassMaxPerMonth: 1,
        gatePassHalfDayOnExceed: true,
        gatePassHalfDayNextDay: true,
        gatePassEarlyHours: 1,
        canteenEnabled: true,
        canteenFreeForGeneralShift: true,
        canteenFreeForNightShift: true,
        canteenOtfreeThresholdHours: 5,
        autoPresentManagementEnabled: false,
        disableAppCheckin: false,
        disableAppCheckout: false,
        companyId: scope.companyId || scope.ownCompanyId || null,
        createdAt: new Date(0),
        updatedAt: new Date(0),
      } as never;
    }
    // Weekend configuration (from Setting table — company override first, then
    // tenant-wide; default Sat+Sun). Exposed so the attendance calendar/table
    // can mark weekends without a separate request.
    const { getWeekendDays } = await import('@/lib/working-days');
    const weekendDays = await getWeekendDays(
      db,
      null,
      scope.companyId || scope.ownCompanyId || null,
    );
    return ok({ config, weekendDays });
  } catch (e: unknown) {
    return fail(e instanceof Error ? e.message : 'Failed to load', 500);
  }
}

export async function PUT(request: Request) {
  const db = await getDb(request);
  const scope = await resolveCompanyScope(request);
  if (!scope) return fail('Unauthorized', 401);
  if (!isAdminRole(scope.role)) return fail('Admin only', 403);

  const body = await parseBody(request);
  if (!body) return fail('Invalid JSON');
  try {
    // Task 82: self-heal the flag column before upserting (see GET).
    await ensureAutoPresentColumn(db);
    // Determine which company this policy belongs to
    const policyCompanyId = scope.companyId || scope.ownCompanyId || null;

    const where: Record<string, unknown> = {};
    if (policyCompanyId) {
      where.companyId = policyCompanyId;
    }

    let existing = null;
    try {
      existing = await withSchemaSync(() => db.attendancePolicyConfig.findFirst({
        where,
        orderBy: { createdAt: 'desc' },
      }));
    } catch (dbErr: unknown) {
      // If the table/column doesn't exist in the tenant DB, proceed without
      // existing config — we'll try to create, and if that also fails, return
      // a meaningful error.
      const errMsg = dbErr instanceof Error ? dbErr.message : String(dbErr);
      if (/column .* does not exist|does not exist in the current database|table .* does not exist/i.test(errMsg)) {
        console.warn('[attendance-policy-config] Table/column missing in tenant DB on PUT — will try to create:', errMsg);
      } else {
        throw dbErr;
      }
    }

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
      // Late Coming Policy
      lateMarkAllowancePerMonth: body.lateMarkAllowancePerMonth !== undefined ? Number(body.lateMarkAllowancePerMonth) : existing?.lateMarkAllowancePerMonth ?? 4,
      lateMarkHalfDayOnExceed: body.lateMarkHalfDayOnExceed !== undefined ? !!body.lateMarkHalfDayOnExceed : existing?.lateMarkHalfDayOnExceed ?? true,
      halfDayAfterMinutes: body.halfDayAfterMinutes !== undefined ? Number(body.halfDayAfterMinutes) : existing?.halfDayAfterMinutes ?? 21,
      lateMarkNotApplicableOnTour: body.lateMarkNotApplicableOnTour !== undefined ? !!body.lateMarkNotApplicableOnTour : existing?.lateMarkNotApplicableOnTour ?? true,
      // Shift Defaults
      shiftStartDefault: (body.shiftStartDefault as string) || existing?.shiftStartDefault || '09:30',
      shiftEndDefault: (body.shiftEndDefault as string) || existing?.shiftEndDefault || '18:30',
      breakDurationMinutes: body.breakDurationMinutes !== undefined ? Number(body.breakDurationMinutes) : existing?.breakDurationMinutes ?? 30,
      breakStartTime: (body.breakStartTime as string) || existing?.breakStartTime || '13:30',
      breakEndTime: (body.breakEndTime as string) || existing?.breakEndTime || '14:30',
      mandatoryBreakEnabled: body.mandatoryBreakEnabled !== undefined ? !!body.mandatoryBreakEnabled : existing?.mandatoryBreakEnabled ?? false,
      attendanceRuleScope: (body.attendanceRuleScope as string) || existing?.attendanceRuleScope || 'all_tenants',
      // BUG_071: Disable App Check-In (biometric-only mode)
      disableAppCheckin: body.disableAppCheckin !== undefined ? !!body.disableAppCheckin : existing?.disableAppCheckin ?? false,
      // Gate Pass Policy
      gatePassMaxPerMonth: body.gatePassMaxPerMonth !== undefined ? Number(body.gatePassMaxPerMonth) : existing?.gatePassMaxPerMonth ?? 1,
      gatePassHalfDayOnExceed: body.gatePassHalfDayOnExceed !== undefined ? !!body.gatePassHalfDayOnExceed : existing?.gatePassHalfDayOnExceed ?? true,
      gatePassHalfDayNextDay: body.gatePassHalfDayNextDay !== undefined ? !!body.gatePassHalfDayNextDay : existing?.gatePassHalfDayNextDay ?? true,
      gatePassEarlyHours: body.gatePassEarlyHours !== undefined ? Number(body.gatePassEarlyHours) : existing?.gatePassEarlyHours ?? 1,
      // Canteen Policy
      canteenEnabled: body.canteenEnabled !== undefined ? !!body.canteenEnabled : existing?.canteenEnabled ?? false,
      canteenFreeForGeneralShift: body.canteenFreeForGeneralShift !== undefined ? !!body.canteenFreeForGeneralShift : existing?.canteenFreeForGeneralShift ?? true,
      canteenFreeForNightShift: body.canteenFreeForNightShift !== undefined ? !!body.canteenFreeForNightShift : existing?.canteenFreeForNightShift ?? true,
      canteenOtfreeThresholdHours: body.canteenOtfreeThresholdHours !== undefined ? Number(body.canteenOtfreeThresholdHours) : existing?.canteenOtfreeThresholdHours ?? 5,
      // Auto-Present for Management (Task 82) — off by default
      autoPresentManagementEnabled: body.autoPresentManagementEnabled !== undefined ? !!body.autoPresentManagementEnabled : existing?.autoPresentManagementEnabled ?? false,
    };

    let config;
    if (existing) {
      config = await db.attendancePolicyConfig.update({ where: { id: existing.id }, data });
    } else {
      config = await db.attendancePolicyConfig.create({ data });
    }
    // Weekend switches are stored in the shared Setting table and are read by
    // working-days/attendance calculations. Keep them in sync with this page.
    if (scope.tenantId && (body.saturdayWeekend !== undefined || body.sundayWeekend !== undefined)) {
      const weekendSettings = [
        ['attendance_weekend_saturday', body.saturdayWeekend],
        ['attendance_weekend_sunday', body.sundayWeekend],
      ] as const;
      for (const [key, value] of weekendSettings) {
        if (value === undefined) continue;
        await db.setting.upsert({
          where: { tenantId_companyId_category_key: { tenantId: scope.tenantId, companyId: policyCompanyId, category: 'attendance', key } },
          create: { tenantId: scope.tenantId, companyId: policyCompanyId, category: 'attendance', key, value: JSON.stringify(!!value), dataType: 'boolean' },
          update: { value: JSON.stringify(!!value), dataType: 'boolean' },
        });
      }
    }
    return ok({ config });
  } catch (e: unknown) {
    // If the table still doesn't exist after sync, return a clear message
    const errMsg = e instanceof Error ? e.message : String(e);
    if (/column .* does not exist|does not exist in the current database|table .* does not exist/i.test(errMsg)) {
      console.error('[attendance-policy-config] Table/column missing in tenant DB after sync — cannot persist:', errMsg);
      return fail('Attendance policy configuration is not yet available. Please try again after the database migration completes.', 503);
    }
    return fail(e instanceof Error ? e.message : 'Failed to save', 500);
  }
}
