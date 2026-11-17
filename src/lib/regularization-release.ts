/**
 * Regularization Release Window (Task 161)
 *
 * Admins/HR "release" the attendance regularization feature for all
 * employees before the payroll cut-off date of the cycle. While released:
 *   - every employee may submit regularization requests (self-service), and
 *   - all employees received an email + in-app (mobile) notification when
 *     the window was released.
 * After the payroll cut-off instant of the release's month passes, the
 * window closes automatically until HR releases it again for the next
 * cycle. Admins/HR always bypass the gate (proxy apply on behalf).
 *
 * Backward compatibility: when NO release record exists the window is
 * "legacy-open" — regularization keeps working exactly as before until HR
 * starts using the release control.
 */

import type { PrismaClient } from '@/generated/prisma/client';

const KEY = 'regularization_release';
const CATEGORY = 'attendance';
const IST = 'Asia/Kolkata';

export interface RegularizationReleaseRecord {
  released: boolean;
  releasedAt: string;
  releasedBy: string;
  releasedByName: string;
  payrollCutoffDay: number | null;
  note: string;
}

export interface RegularizationWindow {
  open: boolean;
  /** true when no release record exists yet — feature behaves as always-on */
  legacy: boolean;
  reason: 'not_released' | 'closed_manually' | 'past_payroll_cutoff' | null;
  /** ISO instant of the release month's payroll cut-off (23:59:59 IST) */
  cutoffDate: string | null;
  /** whole days left until the cut-off (null when no cut-off configured) */
  daysLeft: number | null;
  release: RegularizationReleaseRecord | null;
}

type DbLike = PrismaClient;

export async function getRegularizationRelease(db: DbLike, tenantId: string): Promise<RegularizationReleaseRecord | null> {
  const row = await db.setting.findFirst({
    where: { tenantId, companyId: null, category: CATEGORY, key: KEY },
    select: { value: true },
  }).catch(() => null);
  if (!row?.value) return null;
  try {
    const parsed = JSON.parse(row.value) as RegularizationReleaseRecord;
    return parsed && typeof parsed === 'object' && typeof parsed.released === 'boolean' ? parsed : null;
  } catch {
    return null;
  }
}

export async function saveRegularizationRelease(db: DbLike, tenantId: string, record: RegularizationReleaseRecord): Promise<void> {
  const value = JSON.stringify(record);
  const existing = await db.setting.findFirst({
    where: { tenantId, companyId: null, category: CATEGORY, key: KEY },
    select: { id: true },
  });
  if (existing) {
    await db.setting.update({ where: { id: existing.id }, data: { value, dataType: 'json' } });
  } else {
    await db.setting.create({
      data: {
        tenantId,
        companyId: null,
        category: CATEGORY,
        key: KEY,
        value,
        dataType: 'json',
        description: 'Attendance regularization release window (Task 161)',
      },
    });
  }
}

/** Tenant-wide default cut-off day from the generic module settings (1–31). */
export async function getTenantPayrollCutoffDay(db: DbLike, tenantId: string): Promise<number | null> {
  const row = await db.setting.findFirst({
    where: { tenantId, key: 'payroll_cutoff_day' },
    select: { value: true },
  }).catch(() => null);
  const n = Number(row?.value);
  return Number.isFinite(n) && n >= 1 && n <= 31 ? Math.floor(n) : null;
}

function istParts(d: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * The cut-off instant for the release's month: payrollCutoffDay at 23:59:59
 * IST (= 18:29:59 UTC the same day). The window is open while `now` is at or
 * before that instant; afterwards HR must release the next cycle.
 */
function cutoffInstantFor(release: RegularizationReleaseRecord, tenantDefaultDay: number | null): Date | null {
  const cutoffDay = release.payrollCutoffDay ?? tenantDefaultDay;
  if (!cutoffDay || cutoffDay < 1 || cutoffDay > 31) return null;
  const rel = istParts(new Date(release.releasedAt));
  const day = Math.min(cutoffDay, daysInMonth(rel.year, rel.month));
  return new Date(Date.UTC(rel.year, rel.month - 1, day, 18, 29, 59));
}

export async function getRegularizationWindow(db: DbLike, tenantId: string): Promise<RegularizationWindow> {
  const release = await getRegularizationRelease(db, tenantId);
  if (!release) {
    return { open: true, legacy: true, reason: null, cutoffDate: null, daysLeft: null, release: null };
  }
  if (!release.released) {
    return { open: false, legacy: false, reason: 'not_released', cutoffDate: null, daysLeft: null, release };
  }
  const tenantDefaultDay = await getTenantPayrollCutoffDay(db, tenantId);
  const cutoff = cutoffInstantFor(release, tenantDefaultDay);
  if (!cutoff) {
    // No cut-off configured — the window stays open until HR closes it.
    return { open: true, legacy: false, reason: null, cutoffDate: null, daysLeft: null, release };
  }
  const now = new Date();
  if (now > cutoff) {
    return { open: false, legacy: false, reason: 'past_payroll_cutoff', cutoffDate: cutoff.toISOString(), daysLeft: 0, release };
  }
  const daysLeft = Math.max(0, Math.ceil((cutoff.getTime() - now.getTime()) / 86_400_000));
  return { open: true, legacy: false, reason: null, cutoffDate: cutoff.toISOString(), daysLeft, release };
}
