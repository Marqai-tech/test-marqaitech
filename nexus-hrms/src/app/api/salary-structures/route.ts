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

    const [salaryStructures, total] = await Promise.all([
      prisma.salaryStructure.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.salaryStructure.count({ where }),
    ]);

    return NextResponse.json({ salaryStructures, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Get salary structures error:', error);
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
    const { name, grade, basicSalary, hra, da, conveyance, medical, specialAllowance, pf, esi, tax, status, description } = body;

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400, headers: corsHeaders() });
    }

    const bs = parseFloat(basicSalary) || 0;
    const hraVal = parseFloat(hra) || 0;
    const daVal = parseFloat(da) || 0;
    const convVal = parseFloat(conveyance) || 0;
    const medVal = parseFloat(medical) || 0;
    const saVal = parseFloat(specialAllowance) || 0;
    const pfVal = parseFloat(pf) || 0;
    const esiVal = parseFloat(esi) || 0;
    const taxVal = parseFloat(tax) || 0;

    const grossSalary = bs + hraVal + daVal + convVal + medVal + saVal;
    const totalDeductions = pfVal + esiVal + taxVal;
    const netSalary = grossSalary - totalDeductions;

    const salaryStructure = await prisma.salaryStructure.create({
      data: {
        name,
        grade: grade || null,
        basicSalary: bs,
        hra: hraVal,
        da: daVal,
        conveyance: convVal,
        medical: medVal,
        specialAllowance: saVal,
        pf: pfVal,
        esi: esiVal,
        tax: taxVal,
        grossSalary,
        totalDeductions,
        netSalary,
        status: status || 'active',
        description: description || null,
      },
    });

    return NextResponse.json({ salaryStructure }, { status: 201, headers: corsHeaders() });
  } catch (error) {
    console.error('Create salary structure error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
