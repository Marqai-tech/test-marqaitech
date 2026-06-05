import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { createNotification } from '@/lib/notifications';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });

    const { id } = await params;
    const requisition = await prisma.manpowerRequisition.findUnique({ where: { id } });

    if (!requisition) {
      return NextResponse.json({ error: 'Requisition not found' }, { status: 404, headers: corsHeaders() });
    }

    return NextResponse.json({ requisition }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Get manpower requisition error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });

    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.manpowerRequisition.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Requisition not found' }, { status: 404, headers: corsHeaders() });
    }

    const data: Record<string, unknown> = {};
    if (body.companyId !== undefined) data.companyId = body.companyId || null;
    if (body.branchId !== undefined) data.branchId = body.branchId || null;
    if (body.departmentId !== undefined) data.departmentId = body.departmentId || null;
    if (body.designationId !== undefined) data.designationId = body.designationId || null;
    if (body.hiringManagerId !== undefined) data.hiringManagerId = body.hiringManagerId || null;
    if (body.positionType !== undefined) data.positionType = body.positionType;
    if (body.replacementEmployeeId !== undefined) data.replacementEmployeeId = body.replacementEmployeeId || null;
    if (body.numberOfOpenings !== undefined) data.numberOfOpenings = parseInt(body.numberOfOpenings) || 1;
    if (body.employmentType !== undefined) data.employmentType = body.employmentType;
    if (body.skillsRequired !== undefined) data.skillsRequired = body.skillsRequired || null;
    if (body.experienceRequired !== undefined) data.experienceRequired = body.experienceRequired || null;
    if (body.qualification !== undefined) data.qualification = body.qualification || null;
    if (body.salaryBudget !== undefined) data.salaryBudget = body.salaryBudget || null;
    if (body.projectId !== undefined) data.projectId = body.projectId || null;
    if (body.clientId !== undefined) data.clientId = body.clientId || null;
    if (body.priority !== undefined) data.priority = body.priority;
    if (body.expectedJoiningDate !== undefined) data.expectedJoiningDate = body.expectedJoiningDate ? new Date(body.expectedJoiningDate) : null;
    if (body.justification !== undefined) data.justification = body.justification || null;

    const requisition = await prisma.manpowerRequisition.update({ where: { id }, data });

    await prisma.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'UPDATE_MANPOWER_REQUISITION',
        module: 'recruitment',
        details: `Updated manpower requisition: ${existing.requisitionId}`,
      },
    });

    return NextResponse.json({ requisition }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Update manpower requisition error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });

    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.manpowerRequisition.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Requisition not found' }, { status: 404, headers: corsHeaders() });
    }

    const data: Record<string, unknown> = {};

    // Approval workflow: draft → pending_manager → pending_hr → pending_budget → approved/rejected
    if (body.approvalStatus !== undefined) {
      data.approvalStatus = body.approvalStatus;

      if (body.approvalStatus === 'approved') {
        data.approvedBy = decoded.userId as string;
        data.approvedAt = new Date();
      }
      if (body.approvalStatus === 'rejected') {
        data.rejectionReason = body.rejectionReason || null;
        data.approvedBy = decoded.userId as string;
        data.approvedAt = new Date();
      }
    }

    if (body.status !== undefined) data.status = body.status;
    if (body.jobPostingId !== undefined) data.jobPostingId = body.jobPostingId || null;

    const requisition = await prisma.manpowerRequisition.update({ where: { id }, data });

    // Notify on approval status change
    if (body.approvalStatus) {
      const notificationMessages: Record<string, { title: string; message: string }> = {
        pending_manager: { title: 'Requisition Pending Manager Approval', message: `Requisition ${existing.requisitionId} is pending manager approval.` },
        pending_hr: { title: 'Requisition Pending HR Approval', message: `Requisition ${existing.requisitionId} is pending HR approval.` },
        pending_budget: { title: 'Requisition Pending Budget Approval', message: `Requisition ${existing.requisitionId} is pending budget approval.` },
        approved: { title: 'Requisition Approved', message: `Requisition ${existing.requisitionId} has been approved.` },
        rejected: { title: 'Requisition Rejected', message: `Requisition ${existing.requisitionId} has been rejected.${body.rejectionReason ? ` Reason: ${body.rejectionReason}` : ''}` },
      };

      const notif = notificationMessages[body.approvalStatus];
      if (notif) {
        const hrAdmins = await prisma.user.findMany({
          where: { tenantId: decoded.tenantId as string, role: { in: ['super_admin', 'tenant_admin', 'hr_admin', 'manager'] } },
        });
        for (const admin of hrAdmins) {
          await createNotification({
            tenantId: decoded.tenantId as string,
            userId: admin.id,
            title: notif.title,
            message: notif.message,
            type: body.approvalStatus === 'approved' ? 'success' : body.approvalStatus === 'rejected' ? 'error' : 'info',
            category: 'recruitment',
          });
        }
      }
    }

    await prisma.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'PATCH_MANPOWER_REQUISITION',
        module: 'recruitment',
        details: `Updated requisition ${existing.requisitionId}: ${JSON.stringify(body)}`,
      },
    });

    return NextResponse.json({ requisition }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Patch manpower requisition error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });

    const { id } = await params;

    const existing = await prisma.manpowerRequisition.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Requisition not found' }, { status: 404, headers: corsHeaders() });
    }

    // Soft delete - set status to cancelled
    const requisition = await prisma.manpowerRequisition.update({
      where: { id },
      data: { status: 'cancelled' },
    });

    await prisma.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'DELETE_MANPOWER_REQUISITION',
        module: 'recruitment',
        details: `Cancelled manpower requisition: ${existing.requisitionId}`,
      },
    });

    return NextResponse.json({ message: 'Requisition cancelled successfully', requisition }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Delete manpower requisition error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
