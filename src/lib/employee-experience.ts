/**
 * Task 137 — shared experience-years computation.
 *
 * Sums an employee's Experience rows (start→end, or start→now for current
 * employment) into a decimal years figure used by the employee list/grid
 * EXP column and the view page. Overlapping entries are summed as-is —
 * matching how "total experience" is conventionally claimed on profiles.
 */
export interface ExperienceSpanRow {
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  isCurrent?: boolean | null;
}

export function computeExperienceYearsFromRows(rows: ExperienceSpanRow[] | null | undefined): number {
  if (!rows || !rows.length) return 0;
  let months = 0;
  for (const row of rows) {
    if (!row?.startDate) continue;
    try {
      const start = new Date(row.startDate);
      if (isNaN(start.getTime())) continue;
      const end = row.isCurrent || !row.endDate ? new Date() : new Date(row.endDate);
      if (isNaN(end.getTime())) continue;
      let m = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
      if (end.getDate() < start.getDate()) m -= 1;
      if (m > 0) months += m;
    } catch { /* skip malformed row */ }
  }
  return Math.round((months / 12) * 10) / 10;
}

/** Format for display: 3.5 → "3.5 yrs"; 0 → "—" (mirrors the client helper). */
export function formatExperienceYearsServer(years: number | null | undefined): string {
  if (years && years > 0) return `${years} yr${years === 1 ? '' : 's'}`;
  return '—';
}
