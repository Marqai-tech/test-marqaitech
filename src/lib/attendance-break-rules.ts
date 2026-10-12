export type AttendanceBreakPolicy = { startMinutes: number; endMinutes: number; durationMinutes: number; mandatory: boolean };
const DEFAULT_POLICY: AttendanceBreakPolicy = { startMinutes: 810, endMinutes: 870, durationMinutes: 60, mandatory: false };

function parseTime(value: string | null | undefined, fallback: number) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : fallback;
}

export async function loadAttendanceBreakPolicy(db: any): Promise<AttendanceBreakPolicy> {
  try {
    const rows = await db.$queryRawUnsafe(`SELECT "breakStartTime", "breakEndTime", "breakDurationMinutes", "mandatoryBreakEnabled", "attendanceRuleScope" FROM "AttendancePolicyConfig" ORDER BY "updatedAt" DESC LIMIT 1`);
    const row = rows?.[0];
    if (!row || row.attendanceRuleScope !== 'marqaitechgroup_only') return DEFAULT_POLICY;
    return { startMinutes: parseTime(row.breakStartTime, 810), endMinutes: parseTime(row.breakEndTime, 870), durationMinutes: Number(row.breakDurationMinutes) || 60, mandatory: !!row.mandatoryBreakEnabled };
  } catch { return DEFAULT_POLICY; }
}

function localMinutes(value: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(value);
  return Number(parts.find((part) => part.type === 'hour')?.value || 0) * 60 + Number(parts.find((part) => part.type === 'minute')?.value || 0);
}

export function effectiveBreakMinutes(breakIn: Date | null, breakOut: Date | null, checkIn: Date, checkOut: Date, policy: AttendanceBreakPolicy = DEFAULT_POLICY): number {
  const { startMinutes, endMinutes, durationMinutes, mandatory } = policy;
  const overlapsOfficialWindow = localMinutes(checkIn) < endMinutes && localMinutes(checkOut) > startMinutes;
  if (!overlapsOfficialWindow) return 0;
  if (breakIn && breakOut) {
    const actual = Math.max(0, Math.round((breakOut.getTime() - breakIn.getTime()) / 60000));
    return Math.max(mandatory ? durationMinutes : 0, actual, Math.max(0, endMinutes - localMinutes(breakIn)));
  }
  return mandatory ? durationMinutes : Math.max(0, Math.min(localMinutes(checkOut), endMinutes) - Math.max(localMinutes(checkIn), startMinutes));
}
