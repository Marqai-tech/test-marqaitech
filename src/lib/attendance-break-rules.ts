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
    // BUG_070 fix: Cap the break duration at the policy's official window.
    // If an employee takes a longer break (e.g., 103 min when policy says 60),
    // only deduct up to the policy's official end time.
    // Example: break 1:33 PM → 3:16 PM (103 min actual)
    //          Policy window: 1:30 PM → 2:30 PM (60 min)
    //          Deduction: 1:33 PM → 2:30 PM = 57 min (capped at window end)
    const breakInMin = attendanceLocalMinutes(breakIn);
    const breakOutMin = attendanceLocalMinutes(breakOut);
    const effectiveBreakOut = Math.min(breakOutMin, endMinutes); // cap at policy end
    const effectiveBreakIn = Math.max(breakInMin, startMinutes); // start from policy start
    const capped = Math.max(0, effectiveBreakOut - effectiveBreakIn);
    // For mandatory breaks, ensure at least the policy duration is deducted
    // (but never more than the capped window)
    return mandatory ? Math.min(Math.max(capped, durationMinutes), durationMinutes) : Math.min(capped, durationMinutes);
  }
  return mandatory ? durationMinutes : Math.max(0, Math.min(attendanceLocalMinutes(checkOut), endMinutes) - Math.max(attendanceLocalMinutes(checkIn), startMinutes));
}
