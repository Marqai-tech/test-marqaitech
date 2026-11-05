/**
 * Punch type + clock time checks for attendance regularization.
 * A check-in after the shift ends, or a check-out before the shift starts,
 * is rejected before the request is saved.
 */

export const DEFAULT_SHIFT_START = '10:00';
export const DEFAULT_SHIFT_END = '18:30';


export function hhmmToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

export function minutesToLabel(mins: number): string {
  const hour24 = Math.floor(mins / 60) % 24;
  const minute = mins % 60;
  const suffix = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, '0')} ${suffix}`;
}

export function minutesInTimeZone(date: Date, timeZone = 'Asia/Kolkata'): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  let hour = Number(parts.find(part => part.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find(part => part.type === 'minute')?.value ?? '0');
  if (hour === 24) hour = 0;
  return hour * 60 + minute;
}

export function validatePunchTime(input: {
  punchType: 'check_in' | 'check_out';
  time: string;
  shiftStart?: string;
  shiftEnd?: string;
  existingCheckIn?: string | null;
  existingCheckOut?: string | null;
}): { ok: true } | { ok: false; error: string } {
  const punchMinutes = hhmmToMinutes(input.time);
  if (punchMinutes === null) {
    return { ok: false, error: 'Enter a valid punch time.' };
  }

  const start = hhmmToMinutes(input.shiftStart || DEFAULT_SHIFT_START) ?? hhmmToMinutes(DEFAULT_SHIFT_START)!;
  const end = hhmmToMinutes(input.shiftEnd || DEFAULT_SHIFT_END) ?? hhmmToMinutes(DEFAULT_SHIFT_END)!;
  const earliestCheckIn = start;
  const entered = minutesToLabel(punchMinutes);
  const punchLabel = input.punchType === 'check_in' ? 'Check-in' : 'Check-out';

  if (input.punchType === 'check_in') {
    if (punchMinutes < earliestCheckIn || punchMinutes > end) {
      return {
        ok: false,
        error: `${punchLabel} time ${entered} is not valid for Check-In. Check-in must be between ${minutesToLabel(earliestCheckIn)} and ${minutesToLabel(end)}.`,
      };
    }
    const existingOut = input.existingCheckOut ? hhmmToMinutes(input.existingCheckOut) : null;
    if (existingOut !== null && punchMinutes >= existingOut) {
      return {
        ok: false,
        error: `${punchLabel} time ${entered} must be before the existing check-out (${minutesToLabel(existingOut)}).`,
      };
    }
  } else {
    if (punchMinutes < start) {
      return {
        ok: false,
        error: `${punchLabel} time ${entered} is not valid for Check-Out. Check-out must be at or after ${minutesToLabel(start)}.`,
      };
    }
    const existingIn = input.existingCheckIn ? hhmmToMinutes(input.existingCheckIn) : null;
    if (existingIn !== null && punchMinutes <= existingIn) {
      return {
        ok: false,
        error: `${punchLabel} time ${entered} must be after the existing check-in (${minutesToLabel(existingIn)}).`,
      };
    }
  }

  return { ok: true };
}
