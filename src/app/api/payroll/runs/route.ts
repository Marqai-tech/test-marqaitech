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
    const runStatus = searchParams.get('runStatus');
    const payrollPeriod = searchParams.get('payrollPeriod');
    const companyId = searchParams.get('companyId');

    const where: Record<string, unknown> = {};
    if (runStatus) where.runStatus = runStatus;
    if (payrollPeriod) where.payrollPeriod = payrollPeriod;
    if (companyId) where.companyId = companyId;

    let data;
    try {
      data = await prisma.payrollRun.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      });
    } catch (dbError: unknown) {
      console.error('PayrollRun table not available:', dbError);
      data = [];
    }

    return Response.json({ data }, { headers: corsHeaders });
  } catch (error: unknown) {
    console.error('Error fetching payroll runs:', error);
    return Response.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500, headers: corsHeaders });
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = getTokenFromHeaders(request);
    const decoded = await verifyToken(token);
    if (!decoded) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

    const body = await request.json();
    let data;
    try {
      data = await prisma.payrollRun.create({
        data: {
          ...body,
          initiatedBy: decoded.userId as string,
        },
      });
    } catch (dbError: unknown) {
      console.error('PayrollRun table not available:', dbError);
      return Response.json({ error: 'PayrollRun table is not available' }, { status: 503, headers: corsHeaders });
    }

    return Response.json({ data, message: 'Payroll run created successfully' }, { headers: corsHeaders });
  } catch (error: unknown) {
    console.error('Error creating payroll run:', error);
    return Response.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500, headers: corsHeaders });
  }
}
