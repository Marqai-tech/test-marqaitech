/**
 * Task 157 — HR/Admin one-shot attendance update from the Regularize month view.
 * POST /api/attendance/bulk-update
 *
 * Lets HR update attendance for SINGLE or MULTIPLE employees in one request —
 * for payroll purposes. Each update upserts the Attendance row for
 * (employeeId, date), optionally setting status / check-in / check-out, and
 * always writes an AttendanceAuditLog entry (action: 'mass_correction') so
 * payroll edits stay traceable.
 */
import { requireUser, isAdminRole, parseBody, ok, fail, OPTIONS } from '@/lib/attendance-leave-api';
import { getDb } from '@/lib/tenant-db';

export { OPTIONS };

const VALID_STATUSES = ['present', 'absent', 'late', 'half_day', 'holiday', 'weekend', 'on_leave'];

interface BulkUpdateItem {
  employeeId?: unknown;
  date?: unknown;
  status?: unknown;
  checkIn?: unknown;
  checkOut?: unknown;
  note?: unknown;
  reason?: unknown;
}

export async function POST(request: Request) {
  const db = await getDb(request);
  const { user, response } = await requireUser(request);
  if (!user) return response;
  if (!isAdminRole(user.role)) return fail('Only HR/Admin can bulk-update attendance', 403);

  const body = await parseBody(request);
  if (!body) return fail('Invalid JSON');

  const updates: BulkUpdateItem[] = Array.isArray(body.updates) ? body.updates : [];
  if (updates.length === 0) return fail('No updates provided', 422);
  if (updates.length > 400) return fail('Too many updates in one batch — maximum 400 cells per submission', 422);

  const changedBy = user.id || user.email || 'system';
  const results: Array<{ employeeId: string; date: string; ok: boolean; error?: string; attendanceId?: string }> = [];

  for (const u of updates) {
    const employeeId = typeof u.employeeId === 'string' ? u.employeeId.trim() : '';
    const dateKey = typeof u.date === 'string' ? u.date.trim() : '';

    if (!employeeId || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      results.push({ employeeId, date: dateKey, ok: false, error: 'Invalid employee or date' });
      continue;
    }

    const status = typeof u.status === 'string' && u.status ? u.status : null;
    if (status && !VALID_STATUSES.includes(status)) {
      results.push({ employeeId, date: dateKey, ok: false, error: `Invalid status "${status}"` });
      continue;
    }

    // Times arrive as full ISO datetimes built client-side from date + HH:mm.
    const checkIn = typeof u.checkIn === 'string' && u.checkIn ? new Date(u.checkIn) : null;
    const checkOut = typeof u.checkOut === 'string' && u.checkOut ? new Date(u.checkOut) : null;
    if ((u.checkIn && (!checkIn || isNaN(checkIn.getTime()))) || (u.checkOut && (!checkOut || isNaN(checkOut.getTime())))) {
      results.push({ employeeId, date: dateKey, ok: false, error: 'Invalid check-in/check-out time' });
      continue;
    }

    try {
      // Attendance rows are stored either at UTC midnight of the calendar day
      // or at IST midnight (…+05:30 = previous day 18:30 UTC). Match BOTH
      // conventions before falling back to a create, otherwise the same
      // calendar day could end up duplicated.
      const utcMidnight = new Date(`${dateKey}T00:00:00.000Z`);
      const istMidnight = new Date(`${dateKey}T00:00:00+05:30`);
      let record = await db.attendance.findFirst({ where: { employeeId, date: utcMidnight } });
      if (!record) record = await db.attendance.findFirst({ where: { employeeId, date: istMidnight } });

      const beforeData = record
        ? { checkIn: record.checkIn, checkOut: record.checkOut, status: record.status, workHours: record.workHours }
        : null;

      const data: {
        status?: string;
        checkIn?: Date;
        checkOut?: Date;
        notes?: string;
        workHours?: number;
      } = {};
      if (status) data.status = status;
      if (checkIn) data.checkIn = checkIn;
      if (checkOut) data.checkOut = checkOut;
      if (typeof u.note === 'string' && u.note.trim()) data.notes = u.note.trim().slice(0, 500);

      // Recompute production hours when both punches are known after the merge
      // (existing row values + submitted values), minus any recorded break.
      const effIn = checkIn ?? record?.checkIn ?? null;
      const effOut = checkOut ?? record?.checkOut ?? null;
      if (effIn && effOut) {
        const breakMinutes = record?.breakMinutes ?? 0;
        const hours = Math.max(0, (new Date(effOut).getTime() - new Date(effIn).getTime()) / 3600000 - breakMinutes / 60);
        data.workHours = Math.round(hours * 100) / 100;
      }

      if (!record) {
        record = await db.attendance.create({
          data: { employeeId, date: utcMidnight, status: status || 'present', ...data },
        });
      } else {
        record = await db.attendance.update({ where: { id: record.id }, data });
      }

      // REQ-SEC-ATT-04: every manual/mass correction is audit-logged.
      await db.attendanceAuditLog.create({
        data: {
          employeeId,
          attendanceId: record.id,
          action: 'mass_correction',
          beforeData: beforeData as object,
          afterData: { checkIn: record.checkIn, checkOut: record.checkOut, status: record.status, workHours: record.workHours },
          changedBy,
          reason: (typeof u.reason === 'string' && u.reason.trim() ? u.reason.trim() : 'HR bulk update from month view').slice(0, 300),
        },
      });

      results.push({ employeeId, date: dateKey, ok: true, attendanceId: record.id });
    } catch (e: unknown) {
      results.push({ employeeId, date: dateKey, ok: false, error: e instanceof Error ? e.message : 'Update failed' });
    }
  }

  const updated = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok);
  return ok({ updated, failedCount: failed.length, failed, results }, failed.length && !updated ? 422 : 200);
}
