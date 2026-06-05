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
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });

    const { id } = await params;
    const interview = await prisma.interview.findUnique({
      where: { id },
      include: {
        jobApplication: {
          select: {
            id: true,
            candidateName: true,
            candidateEmail: true,
            candidatePhone: true,
            jobPosting: { select: { id: true, title: true, department: { select: { id: true, name: true } } } },
          },
        },
      },
    });

    if (!interview) {
      return NextResponse.json({ error: 'Interview not found' }, { status: 404, headers: corsHeaders() });
    }

    return NextResponse.json({ interview }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Get interview error:', error);
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

    const existing = await prisma.interview.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Interview not found' }, { status: 404, headers: corsHeaders() });
    }

    const data: Record<string, unknown> = {};
    if (body.round !== undefined) data.round = parseInt(body.round);
    if (body.type !== undefined) data.type = body.type;
    if (body.title !== undefined) data.title = body.title || null;
    if (body.date !== undefined) data.date = new Date(body.date);
    if (body.time !== undefined) data.time = body.time || null;
    if (body.duration !== undefined) data.duration = body.duration ? parseInt(body.duration) : null;
    if (body.location !== undefined) data.location = body.location || null;
    if (body.meetingUrl !== undefined) data.meetingUrl = body.meetingUrl || null;
    if (body.interviewerIds !== undefined) data.interviewerIds = body.interviewerIds || null;
    if (body.interviewerNames !== undefined) data.interviewerNames = body.interviewerNames || null;

    const interview = await prisma.interview.update({ where: { id }, data });

    await prisma.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'UPDATE_INTERVIEW',
        module: 'recruitment',
        details: `Updated interview for application ${existing.jobApplicationId}`,
      },
    });

    return NextResponse.json({ interview }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Update interview error:', error);
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

    const existing = await prisma.interview.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Interview not found' }, { status: 404, headers: corsHeaders() });
    }

    const data: Record<string, unknown> = {};

    // Status updates
    if (body.status !== undefined) {
      data.status = body.status;

      if (body.status === 'rescheduled' && body.rescheduledReason) {
        data.rescheduledFrom = existing.date;
        data.rescheduledReason = body.rescheduledReason;
        if (body.newDate) data.date = new Date(body.newDate);
        if (body.newTime) data.time = body.newTime;
      }

      if (body.status === 'cancelled' && body.cancellationReason) {
        data.cancellationReason = body.cancellationReason;
      }
    }

    // Feedback
    if (body.feedback !== undefined) data.feedback = body.feedback || null;
    if (body.score !== undefined) data.score = body.score ? parseInt(body.score) : null;
    if (body.recommendation !== undefined) data.recommendation = body.recommendation || null;
    if (body.aiScore !== undefined) data.aiScore = body.aiScore ? parseInt(body.aiScore) : null;
    if (body.aiFeedback !== undefined) data.aiFeedback = body.aiFeedback || null;

    const interview = await prisma.interview.update({ where: { id }, data });

    await prisma.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'PATCH_INTERVIEW',
        module: 'recruitment',
        details: `Updated interview status/feedback for application ${existing.jobApplicationId}`,
      },
    });

    return NextResponse.json({ interview }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Patch interview error:', error);
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

    const existing = await prisma.interview.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Interview not found' }, { status: 404, headers: corsHeaders() });
    }

    // Cancel instead of delete
    const interview = await prisma.interview.update({
      where: { id },
      data: { status: 'cancelled', cancellationReason: 'Cancelled by user' },
    });

    await prisma.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'CANCEL_INTERVIEW',
        module: 'recruitment',
        details: `Cancelled interview for application ${existing.jobApplicationId}`,
      },
    });

    return NextResponse.json({ message: 'Interview cancelled successfully', interview }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Delete interview error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
