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

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });

    const body = await request.json();
    const data: Record<string, unknown> = {};
    if (body.departmentId !== undefined) data.departmentId = body.departmentId || null;
    if (body.designationId !== undefined) data.designationId = body.designationId || null;
    if (body.companyId !== undefined) data.companyId = body.companyId || null;
    if (body.branchId !== undefined) data.branchId = body.branchId || null;
    if (body.hiringManagerId !== undefined) data.hiringManagerId = body.hiringManagerId || null;
    if (body.positionType !== undefined) data.positionType = body.positionType;
    if (body.numberOfOpenings !== undefined) data.numberOfOpenings = parseInt(body.numberOfOpenings);
    if (body.employmentType !== undefined) data.employmentType = body.employmentType;
    if (body.skillsRequired !== undefined) data.skillsRequired = body.skillsRequired || null;
    if (body.experienceRequired !== undefined) data.experienceRequired = body.experienceRequired || null;
    if (body.qualification !== undefined) data.qualification = body.qualification || null;
    if (body.salaryBudget !== undefined) data.salaryBudget = body.salaryBudget || null;
    if (body.priority !== undefined) data.priority = body.priority;
    if (body.expectedJoiningDate !== undefined) data.expectedJoiningDate = body.expectedJoiningDate ? new Date(body.expectedJoiningDate) : null;
    if (body.justification !== undefined) data.justification = body.justification || null;
    if (body.approvalStatus !== undefined) data.approvalStatus = body.approvalStatus;
    if (body.status !== undefined) data.status = body.status;
    if (body.requestedBy !== undefined) data.requestedBy = body.requestedBy || null;

    const requisition = await prisma.manpowerRequisition.update({ where: { id }, data });
    return NextResponse.json({ requisition }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Update requisition error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });

    await prisma.manpowerRequisition.delete({ where: { id } });
    return NextResponse.json({ message: 'Requisition deleted successfully' }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Delete requisition error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
