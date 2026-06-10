import prisma from '@/lib/prisma';
import { getTokenFromHeaders, verifyToken } from '@/lib/auth';
import { NextRequest } from 'next/server';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function GET(request: NextRequest) {
  try {
    const token = getTokenFromHeaders(request);
    const decoded = await verifyToken(token);
    if (!decoded) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get('employeeId');
    const status = searchParams.get('status');
    const loanType = searchParams.get('loanType');

    const where: Record<string, unknown> = {};
    if (employeeId) where.employeeId = employeeId;
    if (status) where.status = status;
    if (loanType) where.loanType = loanType;

    const data = await prisma.loan.findMany({
      where,
      include: {
        employee: {
          select: { id: true, employeeId: true, firstName: true, lastName: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return Response.json({ data }, { headers: corsHeaders });
  } catch (error: unknown) {
    console.error('Error fetching loans:', error);
    return Response.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500, headers: corsHeaders });
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = getTokenFromHeaders(request);
    const decoded = await verifyToken(token);
    if (!decoded) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

    const body = await request.json();

    // Validate required fields
    if (!body.employeeId) return Response.json({ error: 'Employee ID is required' }, { status: 400, headers: corsHeaders });
    if (!body.loanType) return Response.json({ error: 'Loan type is required' }, { status: 400, headers: corsHeaders });
    if (!body.loanAmount || body.loanAmount <= 0) return Response.json({ error: 'Loan amount must be greater than 0' }, { status: 400, headers: corsHeaders });
    if (!body.tenureMonths || body.tenureMonths <= 0) return Response.json({ error: 'Tenure months must be greater than 0' }, { status: 400, headers: corsHeaders });
    if (!body.startDate) return Response.json({ error: 'Start date is required' }, { status: 400, headers: corsHeaders });

    const loanAmount = parseFloat(body.loanAmount);
    const interestRate = parseFloat(body.interestRate) || 0;
    const tenureMonths = parseInt(body.tenureMonths);

    // Calculate EMI using standard EMI formula: EMI = P * r * (1+r)^n / ((1+r)^n - 1)
    let emiAmount: number;
    if (interestRate === 0) {
      emiAmount = loanAmount / tenureMonths;
    } else {
      const monthlyRate = interestRate / 12 / 100;
      const factor = Math.pow(1 + monthlyRate, tenureMonths);
      emiAmount = (loanAmount * monthlyRate * factor) / (factor - 1);
    }

    // Round to 2 decimal places
    emiAmount = Math.round(emiAmount * 100) / 100;

    const data = await prisma.loan.create({
      data: {
        employeeId: body.employeeId,
        loanType: body.loanType,
        loanAmount,
        interestRate,
        tenureMonths,
        emiAmount,
        outstandingBalance: loanAmount,
        disbursedAmount: body.disbursedAmount ? parseFloat(body.disbursedAmount) : loanAmount,
        disbursedDate: body.disbursedDate || null,
        startDate: new Date(body.startDate),
        endDate: body.endDate ? new Date(body.endDate) : null,
        recoveredAmount: 0,
        remainingEmis: tenureMonths,
        status: body.status || 'pending',
        remarks: body.remarks || null,
      },
    });

    return Response.json({ data, message: 'Loan created successfully' }, { headers: corsHeaders });
  } catch (error: unknown) {
    console.error('Error creating loan:', error);
    return Response.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500, headers: corsHeaders });
  }
}
