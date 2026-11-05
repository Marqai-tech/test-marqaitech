export type AttendanceBreakPolicy = { startMinutes: number; endMinutes: number; durationMinutes: number; mandatory: boolean; shiftEndMinutes: number };
export type AttendanceRulePolicy = AttendanceBreakPolicy & {
  shiftStartMinutes: number;
  lateGraceMinutes: number;
  lateMarkAllowancePerMonth: number;
  lateMarkHalfDayOnExceed: boolean;
  productionThresholdMinutes: number;
  disableAppCheckin: boolean;
  disableAppCheckout: boolean;
};
const DEFAULT_POLICY: AttendanceBreakPolicy = { startMinutes: 810, endMinutes: 870, durationMinutes: 60, mandatory: false, shiftEndMinutes: 1110 };
const DEFAULT_RULE_POLICY: AttendanceRulePolicy = {
  ...DEFAULT_POLICY,
  shiftStartMinutes: 570,
  lateGraceMinutes: 30,
  lateMarkAllowancePerMonth: 4,
  lateMarkHalfDayOnExceed: true,
  productionThresholdMinutes: 480,
  disableAppCheckin: false,
  disableAppCheckout: false,
};

function parseTime(value: string | null | undefined, fallback: number) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : fallback;
}

export async function loadAttendanceBreakPolicy(db: any): Promise<AttendanceBreakPolicy> {
  try {
    const rows = await db.$queryRawUnsafe(`SELECT "breakStartTime", "breakEndTime", "breakDurationMinutes", "mandatoryBreakEnabled", "shiftEndDefault", "attendanceRuleScope" FROM "AttendancePolicyConfig" ORDER BY "updatedAt" DESC LIMIT 1`);
    const row = rows?.[0];
    if (!row || row.attendanceRuleScope !== 'marqaitechgroup_only') return DEFAULT_POLICY;
    return { startMinutes: parseTime(row.breakStartTime, 810), endMinutes: parseTime(row.breakEndTime, 870), durationMinutes: Number(row.breakDurationMinutes) || 60, mandatory: !!row.mandatoryBreakEnabled, shiftEndMinutes: parseTime(row.shiftEndDefault, 1110) };
  } catch { return DEFAULT_POLICY; }
}

/** Load all punch/late/production rules from AttendancePolicyConfig. */
export async function loadAttendanceRulePolicy(db: any): Promise<AttendanceRulePolicy> {
  try {
    // Ensure disableAppCheckin / disableAppCheckout columns exist
    try {
      await db.$executeRawUnsafe(`ALTER TABLE "AttendancePolicyConfig" ADD COLUMN IF NOT EXISTS "disableAppCheckin" BOOLEAN NOT NULL DEFAULT false`);
      await db.$executeRawUnsafe(`ALTER TABLE "AttendancePolicyConfig" ADD COLUMN IF NOT EXISTS "disableAppCheckout" BOOLEAN NOT NULL DEFAULT false`);
    } catch { /* column may already exist */ }

    const rows = await db.$queryRawUnsafe(`SELECT "shiftStartDefault", "shiftEndDefault", "breakStartTime", "breakEndTime", "breakDurationMinutes", "mandatoryBreakEnabled", "lateGraceMinutes", "lateMarkAllowancePerMonth", "lateMarkHalfDayOnExceed", "overtimeThresholdMinutes", "attendanceRuleScope", "disableAppCheckin", "disableAppCheckout" FROM "AttendancePolicyConfig" ORDER BY "updatedAt" DESC LIMIT 1`);
    const row = rows?.[0];
    if (!row || row.attendanceRuleScope !== 'marqaitechgroup_only' && row.attendanceRuleScope !== 'all_tenants') return DEFAULT_RULE_POLICY;
    return {
      startMinutes: parseTime(row.breakStartTime, DEFAULT_RULE_POLICY.startMinutes),
      endMinutes: parseTime(row.breakEndTime, DEFAULT_RULE_POLICY.endMinutes),
      durationMinutes: Number(row.breakDurationMinutes) || DEFAULT_RULE_POLICY.durationMinutes,
      mandatory: !!row.mandatoryBreakEnabled,
      shiftStartMinutes: parseTime(row.shiftStartDefault, DEFAULT_RULE_POLICY.shiftStartMinutes),
      shiftEndMinutes: parseTime(row.shiftEndDefault, DEFAULT_RULE_POLICY.shiftEndMinutes),
      lateGraceMinutes: Number(row.lateGraceMinutes ?? DEFAULT_RULE_POLICY.lateGraceMinutes),
      lateMarkAllowancePerMonth: Number(row.lateMarkAllowancePerMonth ?? DEFAULT_RULE_POLICY.lateMarkAllowancePerMonth),
      lateMarkHalfDayOnExceed: row.lateMarkHalfDayOnExceed ?? DEFAULT_RULE_POLICY.lateMarkHalfDayOnExceed,
      productionThresholdMinutes: Number(row.overtimeThresholdMinutes ?? DEFAULT_RULE_POLICY.productionThresholdMinutes),
      disableAppCheckin: row.disableAppCheckin ?? false,
      disableAppCheckout: row.disableAppCheckout ?? false,
    };
  } catch {
    return DEFAULT_RULE_POLICY;
  }
}

export function attendanceLocalMinutes(value: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(value);
  return Number(parts.find((part) => part.type === 'hour')?.value || 0) * 60 + Number(parts.find((part) => part.type === 'minute')?.value || 0);
}

export function effectiveBreakMinutes(breakIn: Date | null, breakOut: Date | null, checkIn: Date, checkOut: Date, policy: AttendanceBreakPolicy = DEFAULT_POLICY): number {
  const { startMinutes, endMinutes, durationMinutes, mandatory } = policy;
  const overlapsOfficialWindow = attendanceLocalMinutes(checkIn) < endMinutes && attendanceLocalMinutes(checkOut) > startMinutes;
  if (!overlapsOfficialWindow) return 0;
  if (breakIn && breakOut) {
    const actual = Math.max(0, Math.round((breakOut.getTime() - breakIn.getTime()) / 60000));
    // Official break starts at the policy startMinutes (e.g. 13:30) even if
    // the employee's Break-In punch was late. Example: Break-In 13:37,
    // Break-Out 14:33 → officialStartToBreakOut = 873 - 810 = 63 minutes.
    // This ensures the break is counted from the official window start, not
    // from the actual late Break-In time.
    const officialStartToBreakOut = Math.max(0, attendanceLocalMinutes(breakOut) - startMinutes);
    return Math.max(
      mandatory ? durationMinutes : 0,
      actual,
      Math.max(0, endMinutes - attendanceLocalMinutes(breakIn)),
      officialStartToBreakOut,
    );
  }
  return mandatory ? durationMinutes : Math.max(0, Math.min(attendanceLocalMinutes(checkOut), endMinutes) - Math.max(attendanceLocalMinutes(checkIn), startMinutes));
}
