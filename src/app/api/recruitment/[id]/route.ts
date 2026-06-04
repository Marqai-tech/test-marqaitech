import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

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
    if (!token) {
      return NextResponse.json(
        { error: 'No token provided' },
        { status: 401, headers: corsHeaders() }
      );
    }

    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401, headers: corsHeaders() }
      );
    }

    const { id } = await params;
    const jobPosting = await prisma.jobPosting.findUnique({
      where: { id },
      include: {
        department: {
          select: { id: true, name: true },
        },
        applications: {
          orderBy: { appliedDate: 'desc' },
        },
        _count: {
          select: { applications: true },
        },
      },
    });

    if (!jobPosting) {
      return NextResponse.json(
        { error: 'Job posting not found' },
        { status: 404, headers: corsHeaders() }
      );
    }

    return NextResponse.json(
      { jobPosting },
      { headers: corsHeaders() }
    );
  } catch (error) {
    console.error('Get job posting error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders() }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json(
        { error: 'No token provided' },
        { status: 401, headers: corsHeaders() }
      );
    }

    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401, headers: corsHeaders() }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const {
      title,
      departmentId,
      position,
      location,
      type,
      experience,
      salary,
      description,
      requirements,
      closingDate,
      vacancies,
      status,
    } = body;

    // Check if job posting exists
    const existing = await prisma.jobPosting.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: 'Job posting not found' },
        { status: 404, headers: corsHeaders() }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (title !== undefined) updateData.title = title;
    if (departmentId !== undefined) updateData.departmentId = departmentId;
    if (position !== undefined) updateData.position = position;
    if (location !== undefined) updateData.location = location;
    if (type !== undefined) updateData.type = type;
    if (experience !== undefined) updateData.experience = experience;
    if (salary !== undefined) updateData.salary = salary;
    if (description !== undefined) updateData.description = description;
    if (requirements !== undefined) updateData.requirements = requirements;
    if (vacancies !== undefined) updateData.vacancies = parseInt(String(vacancies)) || 1;
    if (closingDate !== undefined) updateData.closingDate = closingDate ? new Date(closingDate) : null;
    if (status !== undefined) updateData.status = status;

    const jobPosting = await prisma.jobPosting.update({
      where: { id },
      data: updateData,
      include: {
        department: {
          select: { id: true, name: true },
        },
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'UPDATE_JOB_POSTING',
        module: 'recruitment',
        details: `Updated job posting: ${jobPosting.title}`,
      },
    });

    return NextResponse.json(
      { jobPosting },
      { headers: corsHeaders() }
    );
  } catch (error) {
    console.error('Update job posting error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders() }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json(
        { error: 'No token provided' },
        { status: 401, headers: corsHeaders() }
      );
    }

    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401, headers: corsHeaders() }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const { status } = body;

    // Try to update as job posting first
    const jobPosting = await prisma.jobPosting.findUnique({ where: { id } });
    if (jobPosting) {
      const updateData: Record<string, unknown> = {};
      if (status !== undefined) updateData.status = status;

      const updated = await prisma.jobPosting.update({
        where: { id },
        data: updateData,
        include: {
          department: {
            select: { id: true, name: true },
          },
        },
      });

      return NextResponse.json(
        { jobPosting: updated },
        { headers: corsHeaders() }
      );
    }

    // Try to update as application
    const application = await prisma.jobApplication.findUnique({ where: { id } });
    if (application) {
      const updateData: Record<string, unknown> = {};
      if (status !== undefined) updateData.status = status;

      const updated = await prisma.jobApplication.update({
        where: { id },
        data: updateData,
      });

      await prisma.auditLog.create({
        data: {
          userId: decoded.userId as string,
          action: 'UPDATE_APPLICATION_STATUS',
          module: 'recruitment',
          details: `Updated application status for ${updated.candidateName} to ${status}`,
        },
      });

      return NextResponse.json(
        { application: updated },
        { headers: corsHeaders() }
      );
    }

    return NextResponse.json(
      { error: 'Record not found' },
      { status: 404, headers: corsHeaders() }
    );
  } catch (error) {
    console.error('Patch recruitment error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders() }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json(
        { error: 'No token provided' },
        { status: 401, headers: corsHeaders() }
      );
    }

    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401, headers: corsHeaders() }
      );
    }

    const { id } = await params;

    // Check if job posting exists
    const existing = await prisma.jobPosting.findUnique({
      where: { id },
      include: { _count: { select: { applications: true } } },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'Job posting not found' },
        { status: 404, headers: corsHeaders() }
      );
    }

    // Delete associated applications first
    await prisma.jobApplication.deleteMany({
      where: { jobPostingId: id },
    });

    // Delete the job posting
    await prisma.jobPosting.delete({
      where: { id },
    });

    await prisma.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'DELETE_JOB_POSTING',
        module: 'recruitment',
        details: `Deleted job posting: ${existing.title}`,
      },
    });

    return NextResponse.json(
      { message: 'Job posting deleted successfully' },
      { headers: corsHeaders() }
    );
  } catch (error) {
    console.error('Delete job posting error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders() }
    );
  }
}
