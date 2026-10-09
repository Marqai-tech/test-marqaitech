export const ATTENDANCE_RULES = {
  shiftStartMinutes: 9 * 60 + 30,
  graceEndMinutes: 10 * 60,
  shiftEndMinutes: 18 * 60 + 30,
  breakStartMinutes: 13 * 60 + 30,
  breakEndMinutes: 14 * 60 + 30,
  requiredNetMinutes: 8 * 60,
  allowedBreakMinutes: 60,
} as const;

export type AttendanceState = {
  checkIn?: Date | null;
  checkOut?: Date | null;
  breakIn?: Date | null;
  breakOut?: Date | null;
};

export function nextAttendanceAction(state: AttendanceState): 'checkin' | 'breakin' | 'breakout' | 'checkout' | null {
  if (!state.checkIn) return 'checkin';
  if (state.checkOut) return null;
  if (!state.breakIn) return 'breakin';
  if (!state.breakOut) return 'breakout';
  return 'checkout';
}

export function minutesSinceMidnight(date: Date) {
  return date.getHours() * 60 + date.getMinutes();
}

export function isLateCheckIn(date: Date) {
  return minutesSinceMidnight(date) > ATTENDANCE_RULES.graceEndMinutes;
}

export function calculateNetWorkMinutes(state: AttendanceState) {
  if (!state.checkIn || !state.checkOut) return null;
  const elapsed = Math.max(0, Math.round((state.checkOut.getTime() - state.checkIn.getTime()) / 60000));
  const breakMinutes = state.breakIn && state.breakOut
    ? Math.max(0, Math.round((state.breakOut.getTime() - state.breakIn.getTime()) / 60000))
    : 0;
  return Math.max(0, elapsed - breakMinutes);
}
