import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
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

    const where: Record<string, unknown> = {};
    if (employeeId) where.employeeId = employeeId;
    if (status) where.status = status;
    if (type) where.type = type;
    if (companyId) where.employee = { companyId };
    if (startDate || endDate) {
      where.startDate = {};
      if (startDate) (where.startDate as Record<string, unknown>).gte = new Date(startDate);
      if (endDate) (where.startDate as Record<string, unknown>).lte = new Date(endDate);
    }

    const [leaves, total] = await Promise.all([
      db.leave.findMany({
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
          approver: {
            select: { id: true, firstName: true, lastName: true },
          },
          workflowInstance: {
            include: {
              workflowDef: { select: { name: true } },
              steps: { orderBy: { stepOrder: 'asc' } },
            },
          },
        },
      }),
      db.leave.count({ where }),
    ]);

    return NextResponse.json({
      data: leaves,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Leaves GET error:', error);
    // Demo data fallback when database is unavailable
    const demoLeaves = [
      { id: 'leave-1', type: 'casual', startDate: '2025-05-20', endDate: '2025-05-21', totalDays: 2, reason: 'Personal work', status: 'approved', employeeId: 'demo-1', approverId: 'demo-2', approverComment: 'Approved', createdAt: '2025-05-18', employee: { id: 'demo-1', firstName: 'Rajesh', lastName: 'Kumar', employeeId: 'EMP001', avatar: null, department: { name: 'Engineering' } }, approver: { id: 'demo-2', firstName: 'Priya', lastName: 'Sharma' }, workflowInstance: null },
      { id: 'leave-2', type: 'sick', startDate: '2025-05-15', endDate: '2025-05-16', totalDays: 2, reason: 'Not feeling well', status: 'approved', employeeId: 'demo-3', approverId: 'demo-2', approverComment: 'Get well soon', createdAt: '2025-05-14', employee: { id: 'demo-3', firstName: 'Amit', lastName: 'Patel', employeeId: 'EMP003', avatar: null, department: { name: 'Design' } }, approver: { id: 'demo-2', firstName: 'Priya', lastName: 'Sharma' }, workflowInstance: null },
      { id: 'leave-3', type: 'paid', startDate: '2025-06-01', endDate: '2025-06-05', totalDays: 5, reason: 'Family vacation', status: 'pending', employeeId: 'demo-6', approverId: null, approverComment: null, createdAt: '2025-05-25', employee: { id: 'demo-6', firstName: 'Ananya', lastName: 'Gupta', employeeId: 'EMP006', avatar: null, department: { name: 'Marketing' } }, approver: null, workflowInstance: null },
      { id: 'leave-4', type: 'casual', startDate: '2025-05-28', endDate: '2025-05-28', totalDays: 1, reason: 'Doctor appointment', status: 'pending', employeeId: 'demo-4', approverId: null, approverComment: null, createdAt: '2025-05-26', employee: { id: 'demo-4', firstName: 'Sneha', lastName: 'Reddy', employeeId: 'EMP004', avatar: null, department: { name: 'Finance' } }, approver: null, workflowInstance: null },
      { id: 'leave-5', type: 'sick', startDate: '2025-05-10', endDate: '2025-05-10', totalDays: 1, reason: 'Migraine', status: 'rejected', employeeId: 'demo-8', approverId: 'demo-9', approverComment: 'Critical project deadline', createdAt: '2025-05-09', employee: { id: 'demo-8', firstName: 'Deepa', lastName: 'Iyer', employeeId: 'EMP008', avatar: null, department: { name: 'Sales' } }, approver: { id: 'demo-9', firstName: 'Arjun', lastName: 'Menon' }, workflowInstance: null },
      { id: 'leave-6', type: 'paid', startDate: '2025-04-14', endDate: '2025-04-18', totalDays: 5, reason: 'Annual family trip', status: 'approved', employeeId: 'demo-9', approverId: 'demo-2', approverComment: 'Enjoy your trip', createdAt: '2025-04-01', employee: { id: 'demo-9', firstName: 'Arjun', lastName: 'Menon', employeeId: 'EMP009', avatar: null, department: { name: 'Operations' } }, approver: { id: 'demo-2', firstName: 'Priya', lastName: 'Sharma' }, workflowInstance: null },
      { id: 'leave-7', type: 'casual', startDate: '2025-06-10', endDate: '2025-06-11', totalDays: 2, reason: 'Home relocation', status: 'pending', employeeId: 'demo-5', approverId: null, approverComment: null, createdAt: '2025-06-01', employee: { id: 'demo-5', firstName: 'Vikram', lastName: 'Singh', employeeId: 'EMP005', avatar: null, department: { name: 'Engineering' } }, approver: null, workflowInstance: null },
    ];
    let filtered = demoLeaves;
    if (status) filtered = filtered.filter(l => l.status === status);
    if (type) filtered = filtered.filter(l => l.type === type);
    if (employeeId) filtered = filtered.filter(l => l.employeeId === employeeId);
    return NextResponse.json({
      data: filtered,
      pagination: { page, limit, total: filtered.length, totalPages: 1 },
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      type, startDate, endDate, totalDays, reason,
      employeeId, createWorkflow,
    } = body;

    if (!type || !startDate || !endDate || !totalDays || !employeeId) {
      return NextResponse.json(
        { error: 'Missing required fields: type, startDate, endDate, totalDays, employeeId' },
        { status: 400 }
      );
    }

    const leave = await db.leave.create({
      data: {
        type,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        totalDays,
        reason,
        employeeId,
        status: 'pending',
      },
      include: {
        employee: {
          select: { firstName: true, lastName: true, department: { select: { name: true } } },
        },
      },
    });

    // Create workflow instance if requested
    if (createWorkflow) {
      const workflowDef = await db.workflowDefinition.findFirst({
        where: { entity: 'leave', isActive: true },
        include: { steps: { orderBy: { stepOrder: 'asc' } } },
      });

      if (workflowDef && workflowDef.steps.length > 0) {
        const instance = await db.workflowInstance.create({
          data: {
            status: 'pending',
            currentStep: 0,
            initiatedBy: employeeId,
            workflowDefId: workflowDef.id,
            steps: {
              create: workflowDef.steps.map((step) => ({
                stepOrder: step.stepOrder,
                status: step.stepOrder === 0 ? 'pending' : 'pending',
              })),
            },
          },
        });

        await db.leave.update({
          where: { id: leave.id },
          data: { workflowInstanceId: instance.id },
        });

        leave.workflowInstanceId = instance.id;
      }
    }

    // Notify manager
    const employee = await db.employee.findUnique({
      where: { id: employeeId },
      select: { reportingManagerId: true, firstName: true, lastName: true },
    });

    if (employee?.reportingManagerId) {
      const managerUser = await db.user.findFirst({
        where: { employee: { id: employee.reportingManagerId } },
      });
      if (managerUser) {
        await db.notification.create({
          data: {
            title: 'New Leave Request',
            message: `${employee.firstName} ${employee.lastName} requested ${type} leave for ${totalDays} days`,
            type: 'leave',
            category: 'approval',
            userId: managerUser.id,
            actionUrl: `/leaves/${leave.id}`,
          },
        });
      }
    }

    await db.auditLog.create({
      data: {
        action: 'CREATE',
        entity: 'Leave',
        entityId: leave.id,
        userId: body.userId,
        details: `Leave request submitted: ${type} for ${totalDays} days`,
      },
    });

    return NextResponse.json(leave, { status: 201 });
  } catch (error) {
    console.error('Leaves POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...updateData } = body;

    if (!id) {
      return NextResponse.json({ error: 'Leave ID is required' }, { status: 400 });
    }

    const existing = await db.leave.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Leave not found' }, { status: 404 });
    }

    if (updateData.startDate) updateData.startDate = new Date(updateData.startDate);
    if (updateData.endDate) updateData.endDate = new Date(updateData.endDate);

    const leave = await db.leave.update({
      where: { id },
      data: updateData,
      include: {
        employee: { select: { firstName: true, lastName: true } },
        approver: { select: { firstName: true, lastName: true } },
      },
    });

    return NextResponse.json(leave);
  } catch (error) {
    console.error('Leaves PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, action, approverId, comment } = body;

    if (!id || !action || !approverId) {
      return NextResponse.json(
        { error: 'Missing required fields: id, action (approve/reject), approverId' },
        { status: 400 }
      );
    }

    const leave = await db.leave.findUnique({
      where: { id },
      include: { employee: true },
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

    // Update the leave
    const updatedLeave = await db.leave.update({
      where: { id },
      data: {
        status: newStatus,
        approverId,
        approverComment: comment,
      },
      include: {
        employee: { select: { firstName: true, lastName: true } },
        approver: { select: { firstName: true, lastName: true } },
      },
    });

    // Update workflow instance if exists
    if (leave.workflowInstanceId) {
      const instance = await db.workflowInstance.findUnique({
        where: { id: leave.workflowInstanceId },
        include: { steps: { orderBy: { stepOrder: 'asc' } } },
      });

      if (instance) {
        const currentStep = instance.steps.find(
          (s) => s.stepOrder === instance.currentStep
        );

        if (currentStep) {
          await db.workflowStepInstance.update({
            where: { id: currentStep.id },
            data: {
              status: newStatus,
              actionedBy: approverId,
              comments: comment,
              actedAt: new Date(),
            },
          });
        }

        if (action === 'approve') {
          const nextStep = instance.steps.find(
            (s) => s.stepOrder === instance.currentStep + 1
          );
          if (nextStep) {
            await db.workflowInstance.update({
              where: { id: instance.id },
              data: { currentStep: instance.currentStep + 1 },
            });
          } else {
            await db.workflowInstance.update({
              where: { id: instance.id },
              data: { status: 'approved' },
            });
          }
        } else {
          await db.workflowInstance.update({
            where: { id: instance.id },
            data: { status: 'rejected' },
          });
        }
      }
    }

    // Notify the employee
    const empUser = await db.user.findFirst({
      where: { employee: { id: leave.employeeId } },
    });

    if (empUser) {
      await db.notification.create({
        data: {
          title: `Leave ${newStatus}`,
          message: `Your ${leave.type} leave request has been ${newStatus}${comment ? `: ${comment}` : ''}`,
          type: 'leave',
          category: 'status_update',
          userId: empUser.id,
          actionUrl: `/leaves/${id}`,
        },
      });
    }

    await db.auditLog.create({
      data: {
        action: action === 'approve' ? 'APPROVE' : 'REJECT',
        entity: 'Leave',
        entityId: id,
        userId: approverId,
        details: `Leave ${newStatus}: ${comment || 'No comment'}`,
      },
    });

    return NextResponse.json(updatedLeave);
  } catch (error) {
    console.error('Leaves PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
