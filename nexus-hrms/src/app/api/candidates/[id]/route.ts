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
    const candidate = await prisma.jobApplication.findUnique({
      where: { id },
      include: {
        jobPosting: {
          select: { id: true, title: true, department: { select: { id: true, name: true } } },
        },
        interviews: { orderBy: { round: 'asc' } },
        offers: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!candidate) {
      return NextResponse.json({ error: 'Candidate not found' }, { status: 404, headers: corsHeaders() });
    }

    return NextResponse.json({ candidate }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Get candidate error:', error);
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

    const existing = await prisma.jobApplication.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Candidate not found' }, { status: 404, headers: corsHeaders() });
    }

    const data: Record<string, unknown> = {};
    if (body.candidateName !== undefined) data.candidateName = body.candidateName;
    if (body.candidateEmail !== undefined) data.candidateEmail = body.candidateEmail;
    if (body.candidatePhone !== undefined) data.candidatePhone = body.candidatePhone || null;
    if (body.resume !== undefined) data.resume = body.resume || null;
    if (body.coverLetter !== undefined) data.coverLetter = body.coverLetter || null;
    if (body.source !== undefined) data.source = body.source;
    if (body.vendorId !== undefined) data.vendorId = body.vendorId || null;
    if (body.subVendorId !== undefined) data.subVendorId = body.subVendorId || null;
    if (body.skills !== undefined) data.skills = body.skills || null;
    if (body.experience !== undefined) data.experience = body.experience || null;
    if (body.currentCtc !== undefined) data.currentCtc = body.currentCtc || null;
    if (body.expectedCtc !== undefined) data.expectedCtc = body.expectedCtc || null;
    if (body.noticePeriod !== undefined) data.noticePeriod = body.noticePeriod || null;
    if (body.currentLocation !== undefined) data.currentLocation = body.currentLocation || null;
    if (body.aiResumeScore !== undefined) data.aiResumeScore = body.aiResumeScore ? parseFloat(body.aiResumeScore) : null;
    if (body.aiInterviewScore !== undefined) data.aiInterviewScore = body.aiInterviewScore ? parseFloat(body.aiInterviewScore) : null;
    if (body.aiScreeningResult !== undefined) data.aiScreeningResult = body.aiScreeningResult || null;
    if (body.rating !== undefined) data.rating = body.rating ? parseInt(body.rating) : null;
    if (body.notes !== undefined) data.notes = body.notes || null;
    if (body.expectedSalary !== undefined) data.expectedSalary = body.expectedSalary || null;

    const candidate = await prisma.jobApplication.update({ where: { id }, data });

    await prisma.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'UPDATE_CANDIDATE',
        module: 'recruitment',
        details: `Updated candidate: ${existing.candidateName}`,
      },
    });

    return NextResponse.json({ candidate }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Update candidate error:', error);
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

    const existing = await prisma.jobApplication.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Candidate not found' }, { status: 404, headers: corsHeaders() });
    }

    const data: Record<string, unknown> = {};
    if (body.status !== undefined) data.status = body.status;
    if (body.recruiterStatus !== undefined) data.recruiterStatus = body.recruiterStatus;
    if (body.clientStatus !== undefined) data.clientStatus = body.clientStatus || null;
    if (body.offerStatus !== undefined) data.offerStatus = body.offerStatus || null;
    if (body.interviewDate !== undefined) data.interviewDate = body.interviewDate ? new Date(body.interviewDate) : null;
    if (body.aiResumeScore !== undefined) data.aiResumeScore = body.aiResumeScore ? parseFloat(body.aiResumeScore) : null;
    if (body.aiInterviewScore !== undefined) data.aiInterviewScore = body.aiInterviewScore ? parseFloat(body.aiInterviewScore) : null;

    const candidate = await prisma.jobApplication.update({ where: { id }, data });

    await prisma.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'PATCH_CANDIDATE_STATUS',
        module: 'recruitment',
        details: `Updated status for candidate ${existing.candidateName}: ${JSON.stringify(body)}`,
      },
    });

    return NextResponse.json({ candidate }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Patch candidate error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
