import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

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

export async function GET(request: Request) {
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

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const status = searchParams.get('status');
    const search = searchParams.get('search');

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { candidateName: { contains: search, mode: 'insensitive' } },
        { candidateEmail: { contains: search, mode: 'insensitive' } },
        { jobTitle: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [candidates, total] = await Promise.all([
      prisma.preboardingCandidate.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.preboardingCandidate.count({ where }),
    ]);

    // Compute stats
    const allCandidates = await prisma.preboardingCandidate.findMany({
      select: { status: true },
    });

    const stats = {
      total: allCandidates.length,
      documentCollection: allCandidates.filter(c => c.status === 'document_collection').length,
      bgvInProgress: allCandidates.filter(c => c.status === 'bgv').length,
      readyToJoin: allCandidates.filter(c => c.status === 'provisioning' || c.status === 'asset_request').length,
      joined: allCandidates.filter(c => c.status === 'joined').length,
    };

    return NextResponse.json(
      {
        candidates,
        stats,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
      { headers: corsHeaders() }
    );
  } catch (error) {
    console.error('Get preboarding candidates error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders() }
    );
  }
}

export async function POST(request: Request) {
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

    const body = await request.json();
    const {
      candidateName,
      candidateEmail,
      candidatePhone,
      jobTitle,
      departmentId,
      offeredSalary,
      currency,
      offerDate,
      joiningDate,
      notes,
      offerId,
      status,
    } = body;

    if (!candidateName || !candidateEmail) {
      return NextResponse.json(
        { error: 'Missing required fields: candidateName, candidateEmail' },
        { status: 400, headers: corsHeaders() }
      );
    }

    const candidate = await prisma.preboardingCandidate.create({
      data: {
        candidateName,
        candidateEmail,
        candidatePhone: candidatePhone || null,
        jobTitle: jobTitle || null,
        departmentId: departmentId || null,
        offeredSalary: offeredSalary ? parseFloat(String(offeredSalary)) : null,
        currency: currency || 'USD',
        offerDate: offerDate ? new Date(offerDate) : new Date(),
        joiningDate: joiningDate ? new Date(joiningDate) : null,
        notes: notes || null,
        offerId: offerId || null,
        status: status || 'offer_accepted',
        documentsUploaded: null,
        backgroundCheckStatus: 'pending',
        backgroundCheckNotes: null,
        hrVerified: false,
        accountProvisioned: false,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'CREATE_PREBOARDING_CANDIDATE',
        module: 'preboarding',
        details: `Created preboarding candidate: ${candidateName}`,
      },
    });

    return NextResponse.json(
      { candidate },
      { status: 201, headers: corsHeaders() }
    );
  } catch (error) {
    console.error('Create preboarding candidate error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders() }
    );
  }
}
