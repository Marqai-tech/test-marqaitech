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
    const companyGroupId = searchParams.get('companyGroupId');
    const status = searchParams.get('status');

    const where: Record<string, unknown> = {};
    if (companyGroupId) where.companyGroupId = companyGroupId;
    if (status) where.status = status;

    const [companies, total] = await Promise.all([
      prisma.company.findMany({
        where,
        include: { companyGroup: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.company.count({ where }),
    ]);

    return NextResponse.json(
      { companies, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } },
      { headers: corsHeaders() }
    );
  } catch (error) {
    console.error('Get companies error:', error);
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
      name, code, legalName, companyGroupId, parentCompanyId,
      registrationNo, taxId, panTanCin, gstVatNumber,
      country, currency, payrollCurrency, reportingCurrency,
      timezone, financialYear, payrollFrequency,
      address, city, state, zipCode, phone, email, website,
      logo, bankDetails, companyAdmin, status,
    } = body;

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400, headers: corsHeaders() });
    }
    if (!companyGroupId) {
      return NextResponse.json({ error: 'Company group ID is required' }, { status: 400, headers: corsHeaders() });
    }

    const company = await prisma.company.create({
      data: {
        name,
        code: code || null,
        legalName: legalName || null,
        companyGroupId,
        parentCompanyId: parentCompanyId || null,
        registrationNo: registrationNo || null,
        taxId: taxId || null,
        panTanCin: panTanCin || null,
        gstVatNumber: gstVatNumber || null,
        country: country || null,
        currency: currency || 'USD',
        payrollCurrency: payrollCurrency || 'USD',
        reportingCurrency: reportingCurrency || 'USD',
        timezone: timezone || 'UTC',
        financialYear: financialYear || 'April-March',
        payrollFrequency: payrollFrequency || 'monthly',
        address: address || null,
        city: city || null,
        state: state || null,
        zipCode: zipCode || null,
        phone: phone || null,
        email: email || null,
        website: website || null,
        logo: logo || null,
        bankDetails: bankDetails || null,
        companyAdmin: companyAdmin || null,
        status: status || 'active',
      },
    });

    return NextResponse.json({ company }, { status: 201, headers: corsHeaders() });
  } catch (error) {
    console.error('Create company error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
