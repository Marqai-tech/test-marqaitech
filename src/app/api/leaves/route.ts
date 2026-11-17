import { NextRequest, NextResponse } from 'next/server';
import { getDb, getPlatformDb } from '@/lib/tenant-db';
import { getTokenFromHeaders, verifyToken } from '@/lib/auth';
import { resolveCompanyScope } from '@/lib/companyScope';
import { sanitizeMultiLineText } from '@/lib/sanitize';

export async function GET(req: NextRequest) {
  const db = await getDb(req);
  try {
    // ─── Auth + scope resolution ───
    const token = getTokenFromHeaders(req);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const url = new URL(req.url);
    const status = url.searchParams.get('status');
    const employeeId = url.searchParams.get('employeeId');
    const type = url.searchParams.get('type');
    const companyId = url.searchParams.get('companyId');
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const skip = (page - 1) * limit;

    // Resolve scope: employee=own, manager=own+reports, admin=all/company
    const scope = await resolveCompanyScope(req);
    if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const where: Record<string, unknown> = {};

    // Apply data-scope filtering
    if (scope.scope === 'self' && scope.ownEmployeeId) {
      // Employee: only their own leaves
      where.employeeId = scope.ownEmployeeId;
    } else if (scope.scope === 'team' && scope.visibleEmployeeIds.length > 0) {
      // Manager: own + direct reports' leaves
      where.employeeId = { in: scope.visibleEmployeeIds };
    } else if (scope.scope === 'all' && companyId) {
      // Admin with company selected (companyId from query)
      where.employee = { companyId };
    } else if (scope.scope === 'all' && scope.companyId) {
      // Admin with company selected via scope (from CompanySwitcher)
      where.employee = { companyId: scope.companyId };
    }
    // 'all' without companyId → no filter (sees all)

    // Allow employeeId override for admins/managers (with validation for managers)
    if (employeeId && scope.scope !== 'self') {
      if (scope.scope === 'team' && !scope.visibleEmployeeIds.includes(employeeId)) {
        return NextResponse.json({ error: 'Access denied: not your direct report' }, { status: 403 });
      }
      where.employeeId = employeeId;
    }
    if (status) where.status = status;
    if (type) where.type = type;
    if (startDate || endDate) {
      where.startDate = {};
      if (startDate) (where.startDate as Record<string, unknown>).gte = new Date(startDate);
      if (endDate) (where.startDate as Record<string, unknown>).lte = new Date(endDate);
    }

    const [leaves, total] = await Promise.all([
      db.leaveRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          employee: {
            select: {
              id: true, firstName: true, lastName: true,
              employeeId: true, avatar: true,
              department: { select: { name: true } },
            },
          },
          leaveType: { select: { id: true, name: true, code: true } },
        },
      }),
      db.leaveRequest.count({ where }),
    ]);

    // Map to the shape legacy consumers expect (type/totalDays are not columns
    // on LeaveRequest — derive them from the leave type code and date range).
    const data = leaves.map((r) => ({
      ...r,
      type: r.leaveType?.code?.split('-')[0]?.toLowerCase() ?? r.leaveType?.name?.toLowerCase() ?? null,
      totalDays: Math.max(1, Math.round((new Date(r.endDate).getTime() - new Date(r.startDate).getTime()) / 86400000) + 1),
    }));

    return NextResponse.json({
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Leaves GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch leaves', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const db = await getDb(req);
  try {
    const body = await req.json();
    const {
      type, leaveTypeId, startDate, endDate,
      employeeId: requestedEmployeeId, halfDay, halfDaySlot,
    } = body;
    // Sanitize free-text reason to strip HTML/script content before persisting.
    const reason = sanitizeMultiLineText(body.reason, 2000);

    const token = getTokenFromHeaders(req);
    const decoded = token ? await verifyToken(token) : null;

    if (!startDate || !endDate || !requestedEmployeeId) {
      return NextResponse.json(
        { error: 'Missing required fields: startDate, endDate, employeeId' },
        { status: 400 }
      );
    }
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
      return NextResponse.json(
        { error: 'Invalid date range: startDate must be on or before endDate' },
        { status: 400 }
      );
    }

    // Resolve scope — employees apply for themselves only; managers for their team.
    const scope = await resolveCompanyScope(req);
    if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    let employeeId: string = requestedEmployeeId;
    if (scope.scope === 'self') {
      if (!scope.ownEmployeeId) {
        return NextResponse.json({ error: 'No employee profile linked to this account' }, { status: 400 });
      }
      employeeId = scope.ownEmployeeId;
    } else if (scope.scope === 'team') {
      if (employeeId !== scope.ownEmployeeId && !scope.visibleEmployeeIds.includes(employeeId)) {
        return NextResponse.json({ error: 'You can only apply for yourself or your direct reports' }, { status: 403 });
      }
    }

    // Resolve the leave type (by id, name, or code). LeaveRequest stores leaveTypeId.
    let finalLeaveTypeId: string | undefined = leaveTypeId;
    if (!finalLeaveTypeId && type) {
      const lt = await db.leaveType.findFirst({
        where: {
          OR: [
            { name: { equals: type, mode: 'insensitive' } },
            { name: { contains: type, mode: 'insensitive' } },
            { code: { equals: type, mode: 'insensitive' } },
          ],
        },
      });
      finalLeaveTypeId = lt?.id;
    }
    if (!finalLeaveTypeId) {
      const fallback = await db.leaveType.findFirst({ where: { status: 'active' } });
      finalLeaveTypeId = fallback?.id;
    }
    if (!finalLeaveTypeId) {
      return NextResponse.json(
        { error: 'No leave types configured for this workspace' },
        { status: 400 }
      );
    }

    const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);

    const leaveRequest = await db.leaveRequest.create({
      data: {
        employeeId,
        leaveTypeId: finalLeaveTypeId,
        startDate: start,
        endDate: end,
        reason: reason || null,
        halfDay: Boolean(halfDay),
        halfDaySlot: halfDaySlot ? String(halfDaySlot) : null,
        status: 'pending',
      },
      include: {
        employee: {
          select: { id: true, firstName: true, lastName: true, employeeId: true, avatar: true, department: { select: { name: true } } },
        },
        leaveType: { select: { id: true, name: true, code: true } },
      },
    });

    // Notify the reporting manager (if any) so the approval happens in-app.
    try {
      const employee = await db.employee.findUnique({
        where: { id: employeeId },
        select: { reportingManagerId: true, firstName: true, lastName: true },
      });
      if (employee?.reportingManagerId && decoded?.tenantId) {
        const managerUser = await db.user.findFirst({
          where: { employee: { id: employee.reportingManagerId } },
        });
        if (managerUser) {
          await db.notification.create({
            data: {
              tenantId: decoded.tenantId as string,
              userId: managerUser.id,
              title: 'New Leave Request',
              message: `${employee.firstName} ${employee.lastName} requested ${leaveRequest.leaveType?.name ?? 'leave'} (${totalDays} day${totalDays > 1 ? 's' : ''})`,
              type: 'info',
              category: 'leave',
              link: `/leaves`,
            },
          });
        }
      }
    } catch (e) {
      console.warn('[leaves POST] Manager notification failed (non-fatal):', e);
    }

    try {
      await db.auditLog.create({
        data: {
          action: 'CREATE',
          module: 'leave',
          userId: (decoded?.userId as string) || null,
          details: `Leave request ${leaveRequest.id} submitted (${totalDays} day(s))`,
        },
      });
    } catch (e) {
      console.warn('[leaves POST] Audit log failed (non-fatal):', e);
    }

    return NextResponse.json(
      {
        ...leaveRequest,
        type: leaveRequest.leaveType?.code?.split('-')[0]?.toLowerCase() ?? leaveRequest.leaveType?.name?.toLowerCase() ?? null,
        totalDays,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Leaves POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const db = await getDb(req);
  try {
    const body = await req.json();
    const { id, leaveTypeId, startDate, endDate } = body;
    if (!id) {
      return NextResponse.json({ error: 'Leave ID is required' }, { status: 400 });
    }
    const reason = sanitizeMultiLineText(body.reason, 2000);

    const existing = await db.leaveRequest.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Leave not found' }, { status: 404 });
    }
    if (existing.status !== 'pending') {
      return NextResponse.json({ error: 'Only pending requests can be edited' }, { status: 400 });
    }

    const data: Record<string, unknown> = {};
    if (startDate) {
      const s = new Date(startDate);
      if (Number.isNaN(s.getTime())) return NextResponse.json({ error: 'Invalid startDate' }, { status: 400 });
      data.startDate = s;
    }
    if (endDate) {
      const e = new Date(endDate);
      if (Number.isNaN(e.getTime())) return NextResponse.json({ error: 'Invalid endDate' }, { status: 400 });
      data.endDate = e;
    }
    if (data.startDate && data.endDate && new Date(data.startDate as Date) > new Date(data.endDate as Date)) {
      return NextResponse.json({ error: 'startDate must be on or before endDate' }, { status: 400 });
    }
    if (reason) data.reason = reason;
    if (leaveTypeId) data.leaveTypeId = leaveTypeId;
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    const leave = await db.leaveRequest.update({
      where: { id },
      data,
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, employeeId: true } },
        leaveType: { select: { id: true, name: true, code: true } },
      },
    });

    return NextResponse.json(leave);
  } catch (error) {
    console.error('Leaves PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const db = await getDb(req);
  try {
    const body = await req.json();
    const { id, action, approverId } = body;
    // Sanitize free-text comment to strip HTML/script content before persisting.
    const comment = sanitizeMultiLineText(body.comment, 2000);

    if (!id || !action || !['approve', 'reject'].includes(action)) {
      return NextResponse.json(
        { error: 'Missing required fields: id, action (approve/reject)' },
        { status: 400 }
      );
    }

    const token = getTokenFromHeaders(req);
    const decoded = token ? await verifyToken(token) : null;
    if (!decoded) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Only approvers (admins/HR/managers) may approve or reject.
    const actorRole = (decoded.role as string) || 'employee';
    const canApprove = ['super_admin', 'tenant_admin', 'ceo', 'hr_admin', 'admin', 'manager'].includes(actorRole);
    if (!canApprove) {
      return NextResponse.json({ error: 'You do not have permission to approve or reject leaves' }, { status: 403 });
    }
    const actorId = (approverId as string) || (decoded.userId as string);

    const leave = await db.leaveRequest.findUnique({
      where: { id },
      include: { employee: true, leaveType: true },
    });

    if (!leave) {
      return NextResponse.json({ error: 'Leave not found' }, { status: 404 });
    }

    if (leave.status !== 'pending') {
      return NextResponse.json(
        { error: 'Leave request is not in pending status' },
        { status: 400 }
      );
    }

    const newStatus = action === 'approve' ? 'approved' : 'rejected';

    // Update the leave request (approvedBy/approvedAt/comments live on LeaveRequest).
    const updatedLeave = await db.leaveRequest.update({
      where: { id },
      data: {
        status: newStatus,
        approvedBy: actorId,
        approvedAt: new Date(),
        comments: comment || null,
      },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, employeeId: true } },
        leaveType: { select: { id: true, name: true, code: true } },
      },
    });

    // ─── Deduct leave balance on approval ───
    if (action === 'approve') {
      try {
        const daysDiff = Math.ceil(
          (new Date(leave.endDate).getTime() - new Date(leave.startDate).getTime()) / (1000 * 60 * 60 * 24),
        ) + 1;
        const year = new Date(leave.startDate).getFullYear();
        await db.leaveBalance.updateMany({
          where: { employeeId: leave.employeeId, year },
          data: {
            used: { increment: daysDiff },
            remaining: { decrement: daysDiff },
          },
        });
      } catch (e) {
        console.warn('[leaves PATCH] Balance deduction failed (non-fatal):', e);
      }
    }

    // Notify the employee
    try {
      const empUser = await db.user.findFirst({
        where: { employee: { id: leave.employeeId } },
      });

      if (empUser && decoded.tenantId) {
        await db.notification.create({
          data: {
            tenantId: decoded.tenantId as string,
            userId: empUser.id,
            title: `Leave ${newStatus}`,
            message: `Your ${leave.leaveType?.name ?? 'leave'} request has been ${newStatus}${comment ? `: ${comment}` : ''}`,
            type: 'info',
            category: 'leave',
            link: `/leaves`,
          },
        });
      }
    } catch (e) {
      console.warn('[leaves PATCH] Employee notification failed (non-fatal):', e);
    }

    try {
      await db.auditLog.create({
        data: {
          action: action === 'approve' ? 'APPROVE' : 'REJECT',
          module: 'leave',
          userId: actorId,
          details: `Leave ${newStatus} for request ${id}: ${comment || 'No comment'}`,
        },
      });
    } catch (e) {
      console.warn('[leaves PATCH] Audit log failed (non-fatal):', e);
    }

    return NextResponse.json(updatedLeave);
  } catch (error) {
    console.error('Leaves PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
