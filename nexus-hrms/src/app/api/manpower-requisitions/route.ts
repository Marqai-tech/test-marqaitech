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
    const departmentId = searchParams.get('departmentId');
    const approvalStatus = searchParams.get('approvalStatus');

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (departmentId) where.departmentId = departmentId;
    if (approvalStatus) where.approvalStatus = approvalStatus;

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
    console.error('Get manpower requisitions error:', error);
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

    // Auto-generate requisitionId: REQ-YYYY-NNNN
    const year = new Date().getFullYear();
    const lastReq = await prisma.manpowerRequisition.findFirst({
      where: { requisitionId: { startsWith: `REQ-${year}-` } },
      orderBy: { requisitionId: 'desc' },
    });
    const nextNum = lastReq ? parseInt(lastReq.requisitionId.split('-')[2]) + 1 : 1;
    const requisitionId = `REQ-${year}-${String(nextNum).padStart(4, '0')}`;

    const requisition = await prisma.manpowerRequisition.create({
      data: {
        requisitionId,
        companyId: body.companyId || null,
        branchId: body.branchId || null,
        departmentId: body.departmentId || null,
        designationId: body.designationId || null,
        hiringManagerId: body.hiringManagerId || null,
        positionType: body.positionType || 'new',
        replacementEmployeeId: body.replacementEmployeeId || null,
        numberOfOpenings: parseInt(body.numberOfOpenings) || 1,
        employmentType: body.employmentType || 'full-time',
        skillsRequired: body.skillsRequired || null,
        experienceRequired: body.experienceRequired || null,
        qualification: body.qualification || null,
        salaryBudget: body.salaryBudget || null,
        projectId: body.projectId || null,
        clientId: body.clientId || null,
        priority: body.priority || 'medium',
        expectedJoiningDate: body.expectedJoiningDate ? new Date(body.expectedJoiningDate) : null,
        justification: body.justification || null,
        approvalStatus: body.approvalStatus || 'draft',
        requestedBy: decoded.userId as string,
        status: 'active',
      },
    });

    // Notify HR admins if submitted for approval
    if (body.approvalStatus === 'pending_manager') {
      const hrAdmins = await prisma.user.findMany({
        where: { tenantId: decoded.tenantId as string, role: { in: ['super_admin', 'tenant_admin', 'hr_admin', 'manager'] } },
      });
      for (const admin of hrAdmins) {
        await createNotification({
          tenantId: decoded.tenantId as string,
          userId: admin.id,
          title: 'New Manpower Requisition',
          message: `Requisition ${requisitionId} has been submitted for approval.`,
          type: 'info',
          category: 'recruitment',
        });
      }
    }

    await prisma.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'CREATE_MANPOWER_REQUISITION',
        module: 'recruitment',
        details: `Created manpower requisition: ${requisitionId}`,
      },
    });

    return NextResponse.json({ requisition }, { status: 201, headers: corsHeaders() });
  } catch (error) {
    console.error('Create manpower requisition error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
