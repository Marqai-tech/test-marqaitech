/**
 * Notice Period Tracker — shared pure helpers.
 *
 * Business rules (verified against the resignation API):
 *  - Employee.status flips to 'resigned' at APPROVAL time, not at the last
 *    working date (see src/app/api/employees/resignation/[id]/route.ts).
 *    So "under notice period" = Resignation rows with status 'approved'
 *    whose lastWorkingDate is still today or in the future.
 *  - Resignation.status values used in the code:
 *      'pending' | 'pending_approval' | 'approved' | 'rejected' | 'cancelled'
 *
 * Used by the Notice Period Tracker page, the Employee Dashboard KPI and the
 * Employee Detail "Notice Period" card so all three stay consistent.
 */

export interface ResignationRecordLike {
  employeeId?: string | null;
  employeeName?: string | null;
  employeeCode?: string | null;
  department?: string | null;
  designation?: string | null;
  resignationDate?: string | Date | null;
  lastWorkingDate?: string | Date | null;
  noticePeriodDays?: number | null;
  isNoticePeriodWaived?: boolean | null;
  status?: string | null;
}

export type NoticeChipLabel =
  | 'Under Notice'
  | 'Relieving Today'
  | 'Past LWD'
  | 'Notice Waived'
  | 'Pending Approval'
  | 'Rejected';

export interface NoticeStatusInfo {
  chip: NoticeChipLabel;
  /** Tailwind classes for the status chip */
  className: string;
  /** Sort bucket — lower sorts first (under-notice rows first, rejected last) */
  rank: number;
  /** Whole days left until LWD (0 on/after LWD, clamped >= 0) */
  daysRemaining: number;
  /** Days of notice already served, clamped to [0, noticePeriodDays] */
  daysServed: number;
  /** 0-100 progress through the notice period */
  progressPct: number;
  approved: boolean;
  pending: boolean;
  rejected: boolean;
  waived: boolean;
}

const DAY_MS = 86400000;

/** Local-midnight timestamp so day math ignores time-of-day skew. */
function startOfDayMs(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Whole calendar days from today until LWD, clamped at 0 (past LWD => 0). */
export function daysUntil(lwd: string | Date | null | undefined, now: Date = new Date()): number {
  if (!lwd) return 0;
  const d = new Date(lwd);
  if (isNaN(d.getTime())) return 0;
  return Math.max(0, Math.ceil((startOfDayMs(d) - startOfDayMs(now)) / DAY_MS));
}

export function getNoticeStatusInfo(rec: ResignationRecordLike, now: Date = new Date()): NoticeStatusInfo {
  const status = String(rec.status || 'pending').toLowerCase();
  const pending = status === 'pending' || status === 'pending_approval';
  const approved = status === 'approved';
  const rejected = status === 'rejected';
  const waived = Boolean(rec.isNoticePeriodWaived);

  const daysRemaining = daysUntil(rec.lastWorkingDate, now);
  const noticeDays = Math.max(0, Number(rec.noticePeriodDays) || 0);
  const daysServed = Math.min(noticeDays, Math.max(0, noticeDays - daysRemaining));
  const progressPct = noticeDays > 0 ? Math.min(100, Math.round((daysServed / noticeDays) * 100)) : 0;

  let chip: NoticeChipLabel;
  let className: string;
  let rank: number;

  if (rejected) {
    // Rejected requests render muted — informational only.
    chip = 'Rejected';
    className = 'thb-badge bg-slate-100 text-slate-500';
    rank = 4;
  } else if (pending) {
    chip = 'Pending Approval';
    className = 'thb-badge thb-badge-warning';
    rank = 2;
  } else if (approved && waived) {
    // Waived notice: no active notice being served — the waiver takes
    // precedence over the under-notice states so it is always visible.
    chip = 'Notice Waived';
    className = 'thb-badge thb-badge-purple';
    rank = 1;
  } else if (approved && daysRemaining === 0 && rec.lastWorkingDate &&
    startOfDayMs(new Date(rec.lastWorkingDate)) === startOfDayMs(now)) {
    chip = 'Relieving Today';
    className = 'thb-badge thb-badge-info';
    rank = 0;
  } else if (approved && daysRemaining === 0) {
    // Approved but the last working date has passed — awaiting relieving
    // formalities (full & final settlement, asset return, etc.).
    chip = 'Past LWD';
    className = 'thb-badge thb-badge-error';
    rank = 3;
  } else {
    chip = 'Under Notice';
    className = 'thb-badge thb-badge-success';
    rank = 0;
  }

  return { chip, className, rank, daysRemaining, daysServed, progressPct, approved, pending, rejected, waived };
}

/** True when the row is approved AND the last working date is today or later. */
export function isApprovedWithFutureLwd(rec: ResignationRecordLike, now: Date = new Date()): boolean {
  if (String(rec.status || '').toLowerCase() !== 'approved') return false;
  if (!rec.lastWorkingDate) return false;
  const d = new Date(rec.lastWorkingDate);
  if (isNaN(d.getTime())) return false;
  return startOfDayMs(d) >= startOfDayMs(now);
}

/**
 * "Under Notice" summary count: approved AND LWD >= today AND notice NOT
 * waived (waived employees are not serving notice, so they are counted by
 * the separate "Notice Waived" tile instead of being double-counted).
 */
export function isUnderNotice(rec: ResignationRecordLike, now: Date = new Date()): boolean {
  return isApprovedWithFutureLwd(rec, now) && !rec.isNoticePeriodWaived;
}

/** Approved employees relieving within the next 7 days (including today). */
export function isRelievingThisWeek(rec: ResignationRecordLike, now: Date = new Date()): boolean {
  return isUnderNotice(rec, now) && daysUntil(rec.lastWorkingDate, now) <= 7;
}
