import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getTokenFromHeaders, verifyToken } from '@/lib/auth';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

/** GET — list company mappings for an employee */
export async function GET(request: Request) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });

    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });

    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get('employeeId');

    if (!employeeId) {
      return NextResponse.json({ error: 'employeeId is required' }, { status: 400, headers: corsHeaders() });
    }

    const mappings = await prisma.employeeCompanyMapping.findMany({
      where: { employeeId },
      include: {
        company: { select: { id: true, name: true, code: true } },
        department: { select: { id: true, name: true } },
        designation: { select: { id: true, title: true } },
        branch: { select: { id: true, name: true } },
      },
      orderBy: { isPrimary: 'desc' },
    });

    return NextResponse.json({ mappings }, { headers: corsHeaders() });
  } catch (error) {
    console.error('[CompanyMappings GET] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

/** POST — add a company mapping for an employee */
export async function POST(request: Request) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });

    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });

    const body = await request.json();
    const { employeeId, companyId, employeeCode, departmentId, designationId, branchId, isPrimary } = body;

    if (!employeeId || !companyId || !employeeCode) {
      return NextResponse.json(
        { error: 'employeeId, companyId, and employeeCode are required' },
        { status: 400, headers: corsHeaders() }
      );
    }

    // Check if mapping already exists
    const existing = await prisma.employeeCompanyMapping.findUnique({
      where: { employeeId_companyId: { employeeId, companyId } },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Employee is already mapped to this company' },
        { status: 409, headers: corsHeaders() }
      );
    }

    // If this is set as primary, unset other primary mappings
    if (isPrimary) {
      await prisma.employeeCompanyMapping.updateMany({
        where: { employeeId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    const mapping = await prisma.employeeCompanyMapping.create({
      data: {
        employeeId,
        companyId,
        employeeCode,
        departmentId: departmentId || null,
        designationId: designationId || null,
        branchId: branchId || null,
        isPrimary: isPrimary || false,
      },
      include: {
        company: { select: { id: true, name: true, code: true } },
        department: { select: { id: true, name: true } },
        designation: { select: { id: true, title: true } },
        branch: { select: { id: true, name: true } },
      },
    });

    // Also update the Employee's companyId if this is primary
    if (isPrimary) {
      await prisma.employee.update({
        where: { id: employeeId },
        data: { companyId, employeeId: employeeCode },
      });
    }

    return NextResponse.json({ mapping }, { status: 201, headers: corsHeaders() });
  } catch (error) {
    console.error('[CompanyMappings POST] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

/** DELETE — remove a company mapping */
export async function DELETE(request: Request) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });

    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });

    const { searchParams } = new URL(request.url);
    const mappingId = searchParams.get('id');

    if (!mappingId) {
      return NextResponse.json({ error: 'Mapping ID is required' }, { status: 400, headers: corsHeaders() });
    }

    const mapping = await prisma.employeeCompanyMapping.findUnique({
      where: { id: mappingId },
    });

    if (!mapping) {
      return NextResponse.json({ error: 'Mapping not found' }, { status: 404, headers: corsHeaders() });
    }

    // Don't allow deleting primary mapping
    if (mapping.isPrimary) {
      return NextResponse.json(
        { error: 'Cannot delete primary company mapping. Set another mapping as primary first.' },
        { status: 400, headers: corsHeaders() }
      );
    }

    await prisma.employeeCompanyMapping.delete({
      where: { id: mappingId },
    });

    return NextResponse.json({ message: 'Company mapping removed' }, { headers: corsHeaders() });
  } catch (error) {
    console.error('[CompanyMappings DELETE] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
