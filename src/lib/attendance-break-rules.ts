export type AttendanceBreakPolicy = { startMinutes: number; endMinutes: number; durationMinutes: number; mandatory: boolean; shiftEndMinutes: number };
const DEFAULT_POLICY: AttendanceBreakPolicy = { startMinutes: 810, endMinutes: 870, durationMinutes: 60, mandatory: false, shiftEndMinutes: 1110 };

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
    return Math.max(mandatory ? durationMinutes : 0, actual, Math.max(0, endMinutes - attendanceLocalMinutes(breakIn)));
  }
  return mandatory ? durationMinutes : Math.max(0, Math.min(attendanceLocalMinutes(checkOut), endMinutes) - Math.max(attendanceLocalMinutes(checkIn), startMinutes));
}
