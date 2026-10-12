const BREAK_START = 13 * 60 + 30;
const BREAK_END = 14 * 60 + 30;

function localMinutes(value: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(value);
  return Number(parts.find((part) => part.type === 'hour')?.value || 0) * 60 + Number(parts.find((part) => part.type === 'minute')?.value || 0);
}

export function effectiveBreakMinutes(breakIn: Date | null, breakOut: Date | null, checkIn: Date, checkOut: Date): number {
  if (breakIn && breakOut) {
    const actual = Math.max(0, Math.round((breakOut.getTime() - breakIn.getTime()) / 60000));
    return Math.max(actual, Math.max(0, BREAK_END - localMinutes(breakIn)));
  }
  return Math.max(0, Math.min(localMinutes(checkOut), BREAK_END) - Math.max(localMinutes(checkIn), BREAK_START));
}
