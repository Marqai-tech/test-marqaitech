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
    const offer = await prisma.offer.findUnique({
      where: { id },
      include: {
        jobApplication: {
          select: {
            id: true,
            candidateName: true,
            candidateEmail: true,
            candidatePhone: true,
            skills: true,
            experience: true,
            currentCtc: true,
            expectedCtc: true,
            jobPosting: { select: { id: true, title: true, department: { select: { id: true, name: true } } } },
          },
        },
      },
    });

    if (!offer) {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404, headers: corsHeaders() });
    }

    return NextResponse.json({ offer }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Get offer error:', error);
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

    const existing = await prisma.offer.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404, headers: corsHeaders() });
    }

    const data: Record<string, unknown> = {};
    if (body.candidateName !== undefined) data.candidateName = body.candidateName;
    if (body.candidateEmail !== undefined) data.candidateEmail = body.candidateEmail;
    if (body.jobTitle !== undefined) data.jobTitle = body.jobTitle || null;
    if (body.departmentId !== undefined) data.departmentId = body.departmentId || null;
    if (body.offeredSalary !== undefined) data.offeredSalary = body.offeredSalary ? parseFloat(body.offeredSalary) : null;
    if (body.currency !== undefined) data.currency = body.currency;
    if (body.salaryBreakup !== undefined) data.salaryBreakup = body.salaryBreakup || null;
    if (body.joiningBonus !== undefined) data.joiningBonus = body.joiningBonus ? parseFloat(body.joiningBonus) : null;
    if (body.retentionBonus !== undefined) data.retentionBonus = body.retentionBonus ? parseFloat(body.retentionBonus) : null;
    if (body.variablePay !== undefined) data.variablePay = body.variablePay ? parseFloat(body.variablePay) : null;
    if (body.offerDate !== undefined) data.offerDate = body.offerDate ? new Date(body.offerDate) : new Date();
    if (body.joiningDate !== undefined) data.joiningDate = body.joiningDate ? new Date(body.joiningDate) : null;
    if (body.offerExpiryDate !== undefined) data.offerExpiryDate = body.offerExpiryDate ? new Date(body.offerExpiryDate) : null;
    if (body.notes !== undefined) data.notes = body.notes || null;

    const offer = await prisma.offer.update({ where: { id }, data });

    await prisma.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'UPDATE_OFFER',
        module: 'recruitment',
        details: `Updated offer ${existing.offerNumber}`,
      },
    });

    return NextResponse.json({ offer }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Update offer error:', error);
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

    const existing = await prisma.offer.findUnique({
      where: { id },
      include: { jobApplication: { select: { candidateName: true, candidateEmail: true, jobPostingId: true } } },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404, headers: corsHeaders() });
    }

    const data: Record<string, unknown> = {};

    // Approval workflow: draft → pending_hr → pending_finance → pending_management → approved/rejected
    if (body.approvalStatus !== undefined) {
      data.approvalStatus = body.approvalStatus;
      if (body.approvalStatus === 'approved') {
        data.approvedBy = decoded.userId as string;
        data.approvedAt = new Date();
        data.status = 'approved';
      }
      if (body.approvalStatus === 'rejected') {
        data.rejectionReason = body.rejectionReason || null;
        data.approvedBy = decoded.userId as string;
        data.approvedAt = new Date();
        data.status = 'rejected';
      }
    }

    // Candidate response
    if (body.candidateResponse !== undefined) {
      data.candidateResponse = body.candidateResponse;
      data.responseDate = new Date();

      if (body.candidateResponse === 'accepted') {
        data.status = 'accepted';
      } else if (body.candidateResponse === 'rejected') {
        data.status = 'rejected';
      } else if (body.candidateResponse === 'negotiation') {
        data.status = 'pending_approval';
        data.negotiationNotes = body.negotiationNotes || null;
      }
    }

    if (body.status !== undefined) data.status = body.status;
    if (body.negotiationNotes !== undefined) data.negotiationNotes = body.negotiationNotes || null;

    const offer = await prisma.offer.update({ where: { id }, data });

    // Convert to Employee: when offer is accepted, create OnboardingTask entries
    if (body.convertToEmployee) {
      const jobApp = existing.jobApplication;
      const jobPosting = await prisma.jobPosting.findUnique({
        where: { id: jobApp.jobPostingId },
        include: { department: true },
      });

      if (jobPosting && jobPosting.departmentId) {
        const year = new Date().getFullYear();
        const empCount = await prisma.employee.count();
        const employeeId = `EMP-${year}-${String(empCount + 1).padStart(4, '0')}`;

        // Create employee
        const employee = await prisma.employee.create({
          data: {
            employeeId,
            firstName: existing.candidateName.split(' ')[0] || existing.candidateName,
            lastName: existing.candidateName.split(' ').slice(1).join(' ') || '',
            email: existing.candidateEmail,
            departmentId: jobPosting.departmentId,
            designationId: jobPosting.department?.id || '', // fallback
            dateOfJoining: existing.joiningDate || new Date(),
            salary: existing.offeredSalary,
            salaryCurrency: existing.currency,
            status: 'active',
          },
        });

        // Create onboarding tasks
        const onboardingTasks = [
          { task: 'Complete employee profile', category: 'hr_docs' },
          { task: 'Submit ID proofs and documents', category: 'hr_docs' },
          { task: 'IT setup - Email and system access', category: 'it_setup' },
          { task: 'Office tour and introductions', category: 'introduction' },
          { task: 'Policy and compliance training', category: 'training' },
          { task: 'Benefits enrollment', category: 'hr_docs' },
        ];

        for (const task of onboardingTasks) {
          await prisma.onboardingTask.create({
            data: {
              employeeId: employee.id,
              task: task.task,
              category: task.category,
              status: 'pending',
              dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
              assignedBy: decoded.userId as string,
            },
          });
        }

        // Update offer
        await prisma.offer.update({
          where: { id },
          data: { convertedToEmployee: true, employeeId: employee.id },
        });

        // Update job application status
        await prisma.jobApplication.update({
          where: { id: existing.jobApplicationId },
          data: { status: 'hired', offerStatus: 'accepted' },
        });

        await createNotification({
          tenantId: decoded.tenantId as string,
          userId: decoded.userId as string,
          title: 'Employee Created from Offer',
          message: `${existing.candidateName} has been converted to employee (${employeeId}). Onboarding tasks created.`,
          type: 'success',
          category: 'recruitment',
        });

        await prisma.auditLog.create({
          data: {
            userId: decoded.userId as string,
            action: 'CONVERT_OFFER_TO_EMPLOYEE',
            module: 'recruitment',
            details: `Converted offer ${existing.offerNumber} to employee ${employeeId}`,
          },
        });

        return NextResponse.json({ offer, employee, onboardingTasks: onboardingTasks.length }, { headers: corsHeaders() });
      }
    }

    // Notify on approval changes
    if (body.approvalStatus) {
      const messages: Record<string, { title: string; message: string; type: 'info' | 'success' | 'error' | 'warning' }> = {
        pending_hr: { title: 'Offer Pending HR Approval', message: `Offer ${existing.offerNumber} is pending HR approval.`, type: 'info' },
        pending_finance: { title: 'Offer Pending Finance Approval', message: `Offer ${existing.offerNumber} is pending finance approval.`, type: 'info' },
        pending_management: { title: 'Offer Pending Management Approval', message: `Offer ${existing.offerNumber} is pending management approval.`, type: 'info' },
        approved: { title: 'Offer Approved', message: `Offer ${existing.offerNumber} has been approved.`, type: 'success' },
        rejected: { title: 'Offer Rejected', message: `Offer ${existing.offerNumber} has been rejected.`, type: 'error' },
      };
      const msg = messages[body.approvalStatus];
      if (msg) {
        const admins = await prisma.user.findMany({
          where: { tenantId: decoded.tenantId as string, role: { in: ['super_admin', 'tenant_admin', 'hr_admin'] } },
        });
        for (const admin of admins) {
          await createNotification({
            tenantId: decoded.tenantId as string,
            userId: admin.id,
            title: msg.title,
            message: msg.message,
            type: msg.type,
            category: 'recruitment',
          });
        }
      }
    }

    await prisma.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'PATCH_OFFER',
        module: 'recruitment',
        details: `Updated offer ${existing.offerNumber}: ${JSON.stringify(body)}`,
      },
    });

    return NextResponse.json({ offer }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Patch offer error:', error);
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

    const existing = await prisma.offer.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404, headers: corsHeaders() });
    }

    // Soft delete - mark as withdrawn
    const offer = await prisma.offer.update({
      where: { id },
      data: { status: 'withdrawn' },
    });

    await prisma.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'WITHDRAW_OFFER',
        module: 'recruitment',
        details: `Withdrawn offer ${existing.offerNumber}`,
      },
    });

    return NextResponse.json({ message: 'Offer withdrawn successfully', offer }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Delete offer error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
