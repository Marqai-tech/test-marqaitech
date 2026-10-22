/**
 * PATCH /api/attendance/edit-punch
 *
 * HR / Tenant Admin / Super Admin direct-edit endpoint for testing.
 *
 * Allows an admin to directly overwrite any of the 4 punch times on an
 * employee's Attendance row for a given date:
 *   - checkIn      (ISO string or null to clear)
 *   - checkOut     (ISO string or null to clear)
 *   - breakIn      (ISO string or null to clear)
 *   - breakOut     (ISO string or null to clear)
 *
 * After the edit, workHours / breakMinutes / overtime / status are
 * recomputed using the SAME effectiveBreakMinutes() formula the live
 * punch route uses — so the test reflects real production behaviour.
 *
 * Every edit is recorded in the AuditLog with the before/after values
 * so the test trail is preserved.
 *
 * Scoping: admin roles only (tenant_admin, hr_admin, company_hr_admin,
 * admin, super_admin). Available on any tenant — the caller is
 * responsible for using this only on test/demo data.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { resolveCompanyScope } from '@/lib/companyScope';
import { safeAuditLog } from '@/lib/audit-safe';
import { effectiveBreakMinutes, loadAttendanceBreakPolicy } from '@/lib/attendance-break-rules';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

const ADMIN_ROLES = ['super_admin', 'tenant_admin', 'admin', 'hr_admin', 'company_hr_admin'];

function localMinutes(value: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(value);
  return Number(parts.find((p) => p.type === 'hour')?.value || 0) * 60 + Number(parts.find((p) => p.type === 'minute')?.value || 0);
}

function parseBody(value: unknown): Date | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function PATCH(request: NextRequest) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });

    const scope = await resolveCompanyScope(request);
    if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });

    // Admin-only — no employee self-edits
    if (!ADMIN_ROLES.includes(scope.role)) {
      return NextResponse.json({ error: 'Admin only. Employees cannot edit their own punches.' }, { status: 403, headers: corsHeaders() });
    }

    const body = await request.json();
    const { employeeId, date } = body;
    if (!employeeId || !date) {
      return NextResponse.json({ error: 'Missing required fields: employeeId, date' }, { status: 400, headers: corsHeaders() });
    }

    // Parse the 4 punch times — accept either ISO strings or null (to clear)
    const newCheckIn = parseBody(body.checkIn);
    const newCheckOut = parseBody(body.checkOut);
    const newBreakIn = parseBody(body.breakIn);
    const newBreakOut = parseBody(body.breakOut);

    // At least one field must be provided (even if null to clear)
    if (
      body.checkIn === undefined &&
      body.checkOut === undefined &&
      body.breakIn === undefined &&
      body.breakOut === undefined
    ) {
      return NextResponse.json({ error: 'Provide at least one of: checkIn, checkOut, breakIn, breakOut' }, { status: 400, headers: corsHeaders() });
    }

    // Verify the employee exists + scope-permit
    const employee = await db.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, companyId: true, userId: true, employeeId: true, firstName: true, lastName: true },
    });
    if (!employee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404, headers: corsHeaders() });
    }
    if (scope.scope === 'self' && employee.userId !== scope.userId) {
      return NextResponse.json({ error: 'You can only edit your own attendance' }, { status: 403, headers: corsHeaders() });
    }

    // Build the date object (UTC midnight for the calendar date)
    const dateObj = new Date(`${date}T00:00:00.000Z`);
    if (Number.isNaN(dateObj.getTime())) {
      return NextResponse.json({ error: 'Invalid date format (use YYYY-MM-DD)' }, { status: 400, headers: corsHeaders() });
    }

    // Fetch the existing attendance row (we need the BEFORE values for audit + recomputation)
    const existing = await db.attendance.findFirst({
      where: { employeeId, date: dateObj },
    });

    if (!existing) {
      // If no row exists, create one with the provided punches
      const created = await db.attendance.create({
        data: {
          employeeId,
          date: dateObj,
          checkIn: newCheckIn,
          checkOut: newCheckOut,
          breakIn: newBreakIn,
          breakOut: newBreakOut,
          status: 'present',
          punchMethod: 'manual_edit',
        },
      });

      // Recompute derived fields if both checkIn + checkOut exist
      let recomputed = created;
      if (created.checkIn && created.checkOut) {
        const breakPolicy = await loadAttendanceBreakPolicy(db);
        const spanMs = created.checkOut.getTime() - created.checkIn.getTime();
        const spanMinutes = Math.max(0, Math.round(spanMs / 60000));
        const breakMinutes = effectiveBreakMinutes(created.breakIn, created.breakOut, created.checkIn, created.checkOut, breakPolicy);
        const workMinutes = Math.max(0, spanMinutes - breakMinutes);
        const workHours = Math.round((workMinutes / 60) * 100) / 100;
        const otMinutes = Math.max(0, workMinutes - 480);
        const overtime = Math.round((otMinutes / 60) * 100) / 100;

        // Late check
        const checkInLocalMinutes = localMinutes(created.checkIn);
        let rulePolicy: any = null;
        try {
          const { loadAttendanceRulePolicy } = await import('@/lib/attendance-break-rules');
          rulePolicy = await loadAttendanceRulePolicy(db);
        } catch { /* fallback */ }
        const shiftStartMin = rulePolicy?.shiftStartMinutes ?? 570;
        const graceMin = rulePolicy?.lateGraceMinutes ?? 30;
        const graceCutoff = shiftStartMin + graceMin;
        const isLate = checkInLocalMinutes > graceCutoff;
        const lowProduction = workHours < 8;
        const status = lowProduction ? 'half_day' : isLate ? 'late' : 'present';
        const notes = lowProduction ? 'Net working time is below the required 8 hours. Apply Attendance Regularization for full-day correction.' : null;

        recomputed = await db.attendance.update({
          where: { id: created.id },
          data: { workHours, breakMinutes, overtime, status, notes: notes as any },
        });
      }

      // Audit log
      await safeAuditLog(db, {
        userId: scope.userId,
        action: 'ATTENDANCE_HR_DIRECT_EDIT',
        module: 'attendance',
        details: `HR direct-created attendance row for ${employee.firstName} ${employee.lastName} (${employee.employeeId}) on ${date}. checkIn=${newCheckIn?.toISOString() || 'null'}, checkOut=${newCheckOut?.toISOString() || 'null'}, breakIn=${newBreakIn?.toISOString() || 'null'}, breakOut=${newBreakOut?.toISOString() || 'null'}`,
      });

      return NextResponse.json({
        ok: true,
        attendance: recomputed,
        message: 'Attendance row created with edited punches',
        before: null,
        after: recomputed,
      }, { headers: corsHeaders() });
    }

    // ─── Existing row → preserve old values, apply new ones ───
    const before = {
      checkIn: existing.checkIn,
      checkOut: existing.checkOut,
      breakIn: existing.breakIn,
      breakOut: existing.breakOut,
      workHours: existing.workHours,
      breakMinutes: existing.breakMinutes,
      overtime: existing.overtime,
      status: existing.status,
    };

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
      punchMethod: 'manual_edit',
    };
    // Only update fields that were explicitly provided in the body (so partial edits work)
    if (body.checkIn !== undefined) updateData.checkIn = newCheckIn;
    if (body.checkOut !== undefined) updateData.checkOut = newCheckOut;
    if (body.breakIn !== undefined) updateData.breakIn = newBreakIn;
    if (body.breakOut !== undefined) updateData.breakOut = newBreakOut;

    // Apply the punch edits first
    let updated = await db.attendance.update({
      where: { id: existing.id },
      data: updateData as any,
    });

    // ─── Recompute derived fields if both checkIn + checkOut exist ───
    if (updated.checkIn && updated.checkOut) {
      const breakPolicy = await loadAttendanceBreakPolicy(db);
      const spanMs = updated.checkOut.getTime() - updated.checkIn.getTime();
      const spanMinutes = Math.max(0, Math.round(spanMs / 60000));
      const breakMinutes = effectiveBreakMinutes(updated.breakIn, updated.breakOut, updated.checkIn, updated.checkOut, breakPolicy);
      const workMinutes = Math.max(0, spanMinutes - breakMinutes);
      const workHours = Math.round((workMinutes / 60) * 100) / 100;
      const otMinutes = Math.max(0, workMinutes - 480);
      const overtime = Math.round((otMinutes / 60) * 100) / 100;

      // Late check (reads policy like the live punch route)
      const checkInLocalMinutes = localMinutes(updated.checkIn);
      let rulePolicy: any = null;
      try {
        const { loadAttendanceRulePolicy } = await import('@/lib/attendance-break-rules');
        rulePolicy = await loadAttendanceRulePolicy(db);
      } catch { /* fallback */ }
      const shiftStartMin = rulePolicy?.shiftStartMinutes ?? 570;
      const graceMin = rulePolicy?.lateGraceMinutes ?? 30;
      const graceCutoff = shiftStartMin + graceMin;
      const isLate = checkInLocalMinutes > graceCutoff;

      // Preserve existing half_day if it was set by the 4th-late rule
      const preservedHalfDay = existing.status === 'half_day' && (existing.notes || '').includes('Late-mark allowance');
      const lowProduction = workHours < 8;
      const triggerHalfDay = lowProduction || preservedHalfDay;
      const status = triggerHalfDay ? 'half_day' : isLate ? 'late' : 'present';

      // Build notes — preserve late-allowance note, append low-production note if applicable
      const notes: string[] = [];
      if (preservedHalfDay) notes.push('Late-mark allowance exceeded: attendance automatically marked Half-Day.');
      if (lowProduction) notes.push('Net working time is below the required 8 hours. Apply Attendance Regularization for full-day correction.');
      const noteText = notes.join(' ') || null;

      updated = await db.attendance.update({
        where: { id: existing.id },
        data: {
          workHours,
          breakMinutes,
          overtime,
          status,
          ...(noteText !== null ? { notes: noteText } : {}),
        },
      });
    } else {
      // Missing checkIn or checkOut — clear derived fields (can't compute)
      updated = await db.attendance.update({
        where: { id: existing.id },
        data: {
          workHours: null,
          breakMinutes: null,
          overtime: null,
          status: 'present',
        },
      });
    }

    // ─── Audit log ───
    const beforeStr = `checkIn=${before.checkIn?.toISOString() || 'null'}, checkOut=${before.checkOut?.toISOString() || 'null'}, breakIn=${before.breakIn?.toISOString() || 'null'}, breakOut=${before.breakOut?.toISOString() || 'null'}, workHours=${before.workHours ?? 'null'}, status=${before.status}`;
    const afterStr = `checkIn=${updated.checkIn?.toISOString() || 'null'}, checkOut=${updated.checkOut?.toISOString() || 'null'}, breakIn=${updated.breakIn?.toISOString() || 'null'}, breakOut=${updated.breakOut?.toISOString() || 'null'}, workHours=${updated.workHours ?? 'null'}, status=${updated.status}`;
    await safeAuditLog(db, {
      userId: scope.userId,
      action: 'ATTENDANCE_HR_DIRECT_EDIT',
      module: 'attendance',
      details: `HR direct-edited attendance for ${employee.firstName} ${employee.lastName} (${employee.employeeId}) on ${date}. BEFORE: ${beforeStr}. AFTER: ${afterStr}`,
    });

    return NextResponse.json({
      ok: true,
      attendance: updated,
      message: 'Attendance punches updated + workHours/breakMinutes/status recomputed',
      before,
      after: updated,
    }, { headers: corsHeaders() });
  } catch (error) {
    console.error('[edit-punch] PATCH error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500, headers: corsHeaders() },
    );
  }
}
