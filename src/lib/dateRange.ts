/**
 * Date-range presets and helpers for the Employee Dashboard.
 *
 * The dashboard ships with a date-range dropdown (Last 7 / 30 / 90 days,
 * This Month / Quarter / Year, plus Custom Range). The presets resolve to
 * concrete `fromDate` / `toDate` ISO date strings (YYYY-MM-DD) which are
 * appended to every dashboard API call so KPI cards and detail tables all
 * reflect the selected period.
 */

export type DateRangePreset =
  | 'last_7'
  | 'last_30'
  | 'last_90'
  | 'this_month'
  | 'this_quarter'
  | 'this_year'
  | 'custom';

export interface DateRangeOption {
  value: DateRangePreset;
  label: string;
  /** Short hint shown in the header chip after the preset is applied */
  hint: string;
}

export const DATE_RANGE_OPTIONS: DateRangeOption[] = [
  { value: 'last_7', label: 'Last 7 Days', hint: '7D' },
  { value: 'last_30', label: 'Last 30 Days', hint: '30D' },
  { value: 'last_90', label: 'Last 90 Days', hint: '90D' },
  { value: 'this_month', label: 'This Month', hint: 'MONTH' },
  { value: 'this_quarter', label: 'This Quarter', hint: 'QTR' },
  { value: 'this_year', label: 'This Year', hint: 'YR' },
  { value: 'custom', label: 'Custom Range', hint: 'CUSTOM' },
];

export const DEFAULT_DATE_RANGE: DateRangePreset = 'last_30';

export interface ResolvedDateRange {
  preset: DateRangePreset;
  fromDate: string; // YYYY-MM-DD
  toDate: string; // YYYY-MM-DD
  /** Human-readable summary, e.g. "01 Nov 2026 – 30 Nov 2026" */
  label: string;
}

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function startOfQuarter(d: Date): Date {
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), q * 3, 1);
}

function startOfYear(d: Date): Date {
  return new Date(d.getFullYear(), 0, 1);
}

function fmtPretty(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Resolve a preset (plus optional custom from/to) into concrete YYYY-MM-DD bounds.
 * The `customFrom` / `customTo` parameters are only consulted when preset === 'custom'.
 */
export function resolveDateRange(
  preset: DateRangePreset,
  customFrom?: string,
  customTo?: string,
): ResolvedDateRange {
  const now = new Date();
  const today = startOfDay(now);

  let from: Date;
  let to: Date;

  switch (preset) {
    case 'last_7': {
      from = new Date(today);
      from.setDate(from.getDate() - 6);
      to = today;
      break;
    }
    case 'last_30': {
      from = new Date(today);
      from.setDate(from.getDate() - 29);
      to = today;
      break;
    }
    case 'last_90': {
      from = new Date(today);
      from.setDate(from.getDate() - 89);
      to = today;
      break;
    }
    case 'this_month': {
      from = startOfMonth(now);
      // last day of current month (or today if mid-month — keep it within "today")
      const lastOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      to = lastOfMonth < today ? lastOfMonth : today;
      break;
    }
    case 'this_quarter': {
      from = startOfQuarter(now);
      const qEndMonth = Math.floor(now.getMonth() / 3) * 3 + 2;
      const lastOfQuarter = new Date(now.getFullYear(), qEndMonth + 1, 0);
      to = lastOfQuarter < today ? lastOfQuarter : today;
      break;
    }
    case 'this_year': {
      from = startOfYear(now);
      const lastOfYear = new Date(now.getFullYear(), 11, 31);
      to = lastOfYear < today ? lastOfYear : today;
      break;
    }
    case 'custom': {
      if (customFrom && customTo) {
        from = startOfDay(new Date(customFrom));
        to = startOfDay(new Date(customTo));
      } else {
        // Fallback to last 30 days if custom range is incomplete
        from = new Date(today);
        from.setDate(from.getDate() - 29);
        to = today;
      }
      break;
    }
    default: {
      from = new Date(today);
      from.setDate(from.getDate() - 29);
      to = today;
    }
  }

  // Guard against reversed ranges
  if (from > to) {
    const tmp = from;
    from = to;
    to = tmp;
  }

  return {
    preset,
    fromDate: toYmd(from),
    toDate: toYmd(to),
    label: `${fmtPretty(from)} – ${fmtPretty(to)}`,
  };
}
