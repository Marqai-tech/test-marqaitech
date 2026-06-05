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

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });

    const company = await prisma.company.findUnique({
      where: { id },
      include: {
        companyGroup: true,
        branches: true,
        departments: true,
        grades: true,
        costCenters: true,
        businessUnits: true,
      },
    });

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404, headers: corsHeaders() });
    }

    return NextResponse.json({ company }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Get company error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
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
    if (body.name !== undefined) data.name = body.name;
    if (body.code !== undefined) data.code = body.code || null;
    if (body.legalName !== undefined) data.legalName = body.legalName || null;
    if (body.companyGroupId !== undefined) data.companyGroupId = body.companyGroupId;
    if (body.parentCompanyId !== undefined) data.parentCompanyId = body.parentCompanyId || null;
    if (body.registrationNo !== undefined) data.registrationNo = body.registrationNo || null;
    if (body.taxId !== undefined) data.taxId = body.taxId || null;
    if (body.panTanCin !== undefined) data.panTanCin = body.panTanCin || null;
    if (body.gstVatNumber !== undefined) data.gstVatNumber = body.gstVatNumber || null;
    if (body.country !== undefined) data.country = body.country || null;
    if (body.currency !== undefined) data.currency = body.currency;
    if (body.payrollCurrency !== undefined) data.payrollCurrency = body.payrollCurrency;
    if (body.reportingCurrency !== undefined) data.reportingCurrency = body.reportingCurrency;
    if (body.timezone !== undefined) data.timezone = body.timezone;
    if (body.financialYear !== undefined) data.financialYear = body.financialYear;
    if (body.payrollFrequency !== undefined) data.payrollFrequency = body.payrollFrequency;
    if (body.address !== undefined) data.address = body.address || null;
    if (body.city !== undefined) data.city = body.city || null;
    if (body.state !== undefined) data.state = body.state || null;
    if (body.zipCode !== undefined) data.zipCode = body.zipCode || null;
    if (body.phone !== undefined) data.phone = body.phone || null;
    if (body.email !== undefined) data.email = body.email || null;
    if (body.website !== undefined) data.website = body.website || null;
    if (body.logo !== undefined) data.logo = body.logo || null;
    if (body.bankDetails !== undefined) data.bankDetails = body.bankDetails || null;
    if (body.companyAdmin !== undefined) data.companyAdmin = body.companyAdmin || null;
    if (body.status !== undefined) data.status = body.status;

    const company = await prisma.company.update({ where: { id }, data });
    return NextResponse.json({ company }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Update company error:', error);
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

    await prisma.company.delete({ where: { id } });
    return NextResponse.json({ message: 'Company deleted successfully' }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Delete company error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
