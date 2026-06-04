import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { createNotification } from '@/lib/notifications';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
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
    if (!token) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    }

    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    }

    const { id } = await params;

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, name: true, code: true, contactName: true, contactEmail: true } },
        department: { select: { id: true, name: true, code: true } },
        company: { select: { id: true, name: true } },
        tasks: {
          include: {
            milestone: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        milestones: {
          include: { _count: { select: { tasks: true } } },
          orderBy: { plannedDate: 'asc' },
        },
        allocations: {
          include: {
            employee: { select: { id: true, firstName: true, lastName: true, employeeId: true, email: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404, headers: corsHeaders() });
    }

    return NextResponse.json({ project }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Get project error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    }

    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    }

    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.project.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404, headers: corsHeaders() });
    }

    const updateData: Record<string, unknown> = {};
    const fields = [
      'name', 'code', 'clientId', 'departmentId', 'projectManagerId',
      'deliveryManagerId', 'projectType', 'billingType', 'currency',
      'budgetAmount', 'estimatedHours', 'actualHours', 'billingRate', 'costRate',
      'description', 'progress',
    ];
    for (const field of fields) {
      if (body[field] !== undefined) updateData[field] = body[field];
    }
    if (body.startDate !== undefined) updateData.startDate = new Date(body.startDate);
    if (body.endDate !== undefined) updateData.endDate = body.endDate ? new Date(body.endDate) : null;

    const project = await prisma.project.update({
      where: { id },
      data: updateData,
      include: {
        client: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'UPDATE_PROJECT',
        module: 'projects',
        details: `Updated project ${id}`,
      },
    });

    return NextResponse.json({ project }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Update project error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    }

    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    }

    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.project.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404, headers: corsHeaders() });
    }

    const updateData: Record<string, unknown> = {};
    const fields = [
      'name', 'code', 'clientId', 'departmentId', 'projectManagerId',
      'deliveryManagerId', 'projectType', 'billingType', 'currency',
      'budgetAmount', 'estimatedHours', 'actualHours', 'billingRate', 'costRate',
      'description', 'progress', 'status',
    ];
    for (const field of fields) {
      if (body[field] !== undefined) updateData[field] = body[field];
    }
    if (body.startDate !== undefined) updateData.startDate = new Date(body.startDate);
    if (body.endDate !== undefined) updateData.endDate = body.endDate ? new Date(body.endDate) : null;

    const project = await prisma.project.update({
      where: { id },
      data: updateData,
      include: {
        client: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
      },
    });

    // Notify relevant users on status change
    if (body.status && body.status !== existing.status) {
      const allocations = await prisma.projectAllocation.findMany({
        where: { projectId: id, status: 'active' },
        include: { employee: { include: { user: true } } },
      });

      for (const allocation of allocations) {
        if (allocation.employee.user) {
          await createNotification({
            tenantId: decoded.tenantId as string,
            userId: allocation.employee.user.id,
            title: 'Project Status Updated',
            message: `Project "${existing.name}" status changed to ${body.status}.`,
            type: body.status === 'active' ? 'success' : body.status === 'on_hold' ? 'warning' : 'info',
            category: 'system',
            link: `/projects/${id}`,
          });
        }
      }
    }

    await prisma.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'UPDATE_PROJECT',
        module: 'projects',
        details: `Updated project ${id}`,
      },
    });

    return NextResponse.json({ project }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Patch project error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    }

    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    }

    const { id } = await params;

    const existing = await prisma.project.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404, headers: corsHeaders() });
    }

    // Delete related records first (tasks, allocations, milestones)
    await prisma.projectTask.deleteMany({ where: { projectId: id } });
    await prisma.projectAllocation.deleteMany({ where: { projectId: id } });
    await prisma.projectMilestone.deleteMany({ where: { projectId: id } });

    // Delete the project
    await prisma.project.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'DELETE_PROJECT',
        module: 'projects',
        details: `Deleted project ${existing.name} (${id})`,
      },
    });

    return NextResponse.json({ message: 'Project deleted successfully' }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Delete project error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
