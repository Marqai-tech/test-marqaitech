import { getDb, getPlatformDb } from '@/lib/tenant-db';
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
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    const decoded = await verifyToken(token);
    if (!decoded) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get('employeeId');
    const inputType = searchParams.get('inputType');
    const approvalStatus = searchParams.get('approvalStatus');
    const payrollRunId = searchParams.get('payrollRunId');

    const where: Record<string, unknown> = {};
    if (employeeId) where.employeeId = employeeId;
    if (inputType) where.inputType = inputType;
    if (approvalStatus) where.approvalStatus = approvalStatus;
    if (payrollRunId) where.payrollRunId = payrollRunId;

    let data;
    try {
      data = await db.payrollInput.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      });
    } catch (dbError: unknown) {
      console.error('PayrollInput table not available:', dbError);
      data = [];
    }

    return Response.json({ data }, { headers: corsHeaders });
  } catch (error: unknown) {
    console.error('Error fetching payroll inputs:', error);
    return Response.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500, headers: corsHeaders });
  }
}

export async function POST(request: NextRequest) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    const decoded = await verifyToken(token);
    if (!decoded) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

    const body = await request.json();
    let data;
    try {
      data = await db.payrollInput.create({
        data: { ...body, createdBy: body.createdBy || (decoded.userId as string) },
      });
    } catch (dbError: unknown) {
      console.error('PayrollInput table not available:', dbError);
      return Response.json({ error: 'PayrollInput table is not available' }, { status: 503, headers: corsHeaders });
    }

    return Response.json({ data, message: 'Payroll input created successfully' }, { headers: corsHeaders });
  } catch (error: unknown) {
    console.error('Error creating payroll input:', error);
    return Response.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500, headers: corsHeaders });
  }
}
