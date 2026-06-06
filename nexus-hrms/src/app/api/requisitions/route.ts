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
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const status = searchParams.get('status');

    const where: Record<string, unknown> = {};
    if (status) where.status = status;

    const [requisitions, total] = await Promise.all([
      prisma.manpowerRequisition.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.manpowerRequisition.count({ where }),
    ]);

    return NextResponse.json({ requisitions, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Get requisitions error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

export async function POST(request: Request) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });

    const body = await request.json();
    const {
      departmentId, designationId, companyId, branchId, hiringManagerId,
      positionType, numberOfOpenings, employmentType, skillsRequired,
      experienceRequired, qualification, salaryBudget, projectId, clientId,
      priority, expectedJoiningDate, justification, requestedBy,
    } = body;

    // Generate requisitionId: REQ-YYYY-NNNN
    const year = new Date().getFullYear();
    const count = await prisma.manpowerRequisition.count();
    const requisitionId = `REQ-${year}-${String(count + 1).padStart(4, '0')}`;

    const requisition = await prisma.manpowerRequisition.create({
      data: {
        requisitionId,
        departmentId: departmentId || null,
        designationId: designationId || null,
        companyId: companyId || null,
        branchId: branchId || null,
        hiringManagerId: hiringManagerId || null,
        positionType: positionType || 'new',
        numberOfOpenings: numberOfOpenings ? parseInt(String(numberOfOpenings)) : 1,
        employmentType: employmentType || 'full-time',
        skillsRequired: skillsRequired || null,
        experienceRequired: experienceRequired || null,
        qualification: qualification || null,
        salaryBudget: salaryBudget || null,
        projectId: projectId || null,
        clientId: clientId || null,
        priority: priority || 'medium',
        expectedJoiningDate: expectedJoiningDate ? new Date(expectedJoiningDate) : null,
        justification: justification || null,
        requestedBy: requestedBy || null,
      },
    });

    return NextResponse.json({ requisition }, { status: 201, headers: corsHeaders() });
  } catch (error) {
    console.error('Create requisition error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
