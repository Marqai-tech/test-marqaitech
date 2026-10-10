/**
 * Biometric Punch Log API — REQ-ATT-03, REQ-AI-ATT-01/02 (read side)
 *
 * GET /api/attendance/biometric/punch-log
 *
 * Query params:
 *   deviceId, employeeId, flagged ("true"), from, to, page (default 1), limit (default 50)
 *
 * Returns a paginated list of biometric punch events with AI risk scores and
 * flag reasons. Used by the admin UI to review flagged punches.
 *
 * NOTE: this route is at /punch-log (NOT /punch) because /punch is reserved
 * for the device webhook (POST only).
 */
import { requireUser, getQuery, ok, fail, OPTIONS, isAdminRole } from '@/lib/attendance-leave-api';
import { getDb, getPlatformDb } from '@/lib/tenant-db';

export { OPTIONS };

export async function GET(request: Request) {
  const db = await getDb(request);
  const { user, response } = await requireUser(request);
  if (!user) return response;
  try {
    const q = getQuery(request);
    const page = Math.max(1, parseInt(q.page || '1', 10));
    const limit = Math.min(200, Math.max(1, parseInt(q.limit || '50', 10)));

    const where: Record<string, unknown> = {};
    if (q.deviceId) where.deviceId = q.deviceId;
    if (q.employeeId) where.employeeId = q.employeeId;
    if (q.flagged === 'true') where.flagged = true;
    // Task 83: punch-type + department filters for the Punches tab UI
    const PUNCH_TYPES = ['check_in', 'check_out', 'break_in', 'break_out', 'duplicate', 'unmatched'];
    if (q.punchType && PUNCH_TYPES.includes(q.punchType)) where.punchType = q.punchType;
    if (q.departmentId) {
      where.employee = { departmentId: q.departmentId };
    }
    if (q.from || q.to) {
      where.punchTime = {};
      // Task 83: bare YYYY-MM-DD values now cover the FULL day for both
      // storage formats. Previously `new Date('2026-10-09')` as an `lte "to"`
      // cut the day off at UTC midnight — hiding almost every punch of the
      // end date (IST punches happen 05:30+ ahead of UTC).
      const DAY = /^\d{4}-\d{2}-\d{2}$/.test(q.from || '');
      const DAY_TO = /^\d{4}-\d{2}-\d{2}$/.test(q.to || '');
      if (q.from) {
        if (DAY) {
          const utcStart = new Date(`${q.from}T00:00:00.000Z`);
          const istStart = new Date(`${q.from}T00:00:00.000+05:30`); // = previous 18:30 UTC
          (where.punchTime as Record<string, unknown>).gte = istStart < utcStart ? istStart : utcStart;
        } else {
          (where.punchTime as Record<string, unknown>).gte = new Date(q.from);
        }
      }
      if (q.to) {
        if (DAY_TO) {
          // End of the "to" day: UTC midnight of the next day (covers both
          // UTC-midnight and IST-midnight rows/punches of the end day).
          const endUtc = new Date(`${q.to}T00:00:00.000Z`).getTime() + 24 * 60 * 60 * 1000;
          (where.punchTime as Record<string, unknown>).lte = new Date(endUtc);
        } else {
          (where.punchTime as Record<string, unknown>).lte = new Date(q.to);
        }
      }
    }

    const [punches, total] = await Promise.all([
      db.biometricPunch.findMany({
        where,
        orderBy: { punchTime: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          device: { select: { id: true, name: true, serialNumber: true, vendor: true, branch: { select: { name: true } } } },
          employee: { select: { id: true, firstName: true, lastName: true, employeeId: true, email: true, department: { select: { id: true, name: true } } } },
        },
      }),
      db.biometricPunch.count({ where }),
    ]);

    // Summary stats for admins
    let summary: Record<string, number> | null = null;
    if (isAdminRole(user.role) && page === 1) {
      // Task 83: "today" must be the IST business day — the server runs in
      // UTC, so setHours(0,0,0,0) previously started the window at 05:30 IST
      // and missed the morning punches.
      const nowIst = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
      const todayIstStartUtc = new Date(Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth(), nowIst.getUTCDate()) - 5.5 * 60 * 60 * 1000);
      const [todayTotal, todayFlagged, last7Flagged] = await Promise.all([
        db.biometricPunch.count({ where: { punchTime: { gte: todayIstStartUtc } } }),
        db.biometricPunch.count({ where: { punchTime: { gte: todayIstStartUtc }, flagged: true } }),
        db.biometricPunch.count({
          where: {
            flagged: true,
            punchTime: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
          },
        }),
      ]);
      summary = { todayTotal, todayFlagged, last7Flagged };
    }

    return ok({
      punches,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      ...(summary ? { summary } : {}),
    });
  } catch (e: unknown) {
    return fail(e instanceof Error ? e.message : 'Failed to load punches', 500);
  }
}
