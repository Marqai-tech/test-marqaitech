/** Decimal hours (9.5) → clock style (9h 30m). */
export function formatHoursHm(hours: number | null | undefined): string {
  if (hours == null || Number.isNaN(Number(hours))) return '—';
  const totalMins = Math.round(Number(hours) * 60);
  if (totalMins <= 0) return '0h 0m';
  const h = Math.floor(totalMins / 60);
  const m = Math.abs(totalMins % 60);
  return `${h}h ${m}m`;
}

export function parseClockToMinutes(value: string | null | undefined, fallbackMinutes: number): number {
  if (!value || !/^\d{1,2}:\d{2}$/.test(value)) return fallbackMinutes;
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}
