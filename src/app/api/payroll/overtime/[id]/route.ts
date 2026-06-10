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

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const token = getTokenFromHeaders(request);
    const decoded = await verifyToken(token);
    if (!decoded) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

    const data = await prisma.overtimeRecord.findUnique({
      where: { id },
      include: {
        employee: {
          select: { id: true, employeeId: true, firstName: true, lastName: true, email: true, salary: true },
        },
      },
    });

    if (!data) return Response.json({ error: 'Overtime record not found' }, { status: 404, headers: corsHeaders });

    return Response.json({ data }, { headers: corsHeaders });
  } catch (error: unknown) {
    console.error('Error fetching overtime record:', error);
    return Response.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500, headers: corsHeaders });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const token = getTokenFromHeaders(request);
    const decoded = await verifyToken(token);
    if (!decoded) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

    const body = await request.json();

    const existing = await prisma.overtimeRecord.findUnique({ where: { id } });
    if (!existing) return Response.json({ error: 'Overtime record not found' }, { status: 404, headers: corsHeaders });

    const hours = body.hours !== undefined ? parseFloat(body.hours) : existing.hours;
    const rateType = body.rateType || existing.rateType;
    const rate = body.rate !== undefined ? parseFloat(body.rate) : existing.rate;

    // Recalculate amount based on rateType
    let amount = existing.amount;
    if (body.hours !== undefined || body.rateType || body.rate !== undefined) {
      if (rateType === 'FLAT') {
        amount = rate;
      } else if (rateType === 'HOURLY_RATE') {
        amount = hours * rate;
      } else if (rateType === 'PERCENTAGE_OF_BASIC') {
        const employeeId = body.employeeId || existing.employeeId;
        const employee = await prisma.employee.findUnique({
          where: { employeeId },
          select: { salary: true },
        });
        const basicSalary = employee?.salary || 0;
        amount = (basicSalary * rate) / 100;
      }
      amount = Math.round(amount * 100) / 100;
    }

    // If amount is provided explicitly, use that instead
    if (body.amount !== undefined && body.amount !== null) {
      amount = parseFloat(body.amount);
    }

    const updateData: Record<string, unknown> = {
      ...(body.date && { date: new Date(body.date) }),
      ...(body.hours !== undefined && { hours }),
      ...(body.rateType && { rateType }),
      ...(body.rate !== undefined && { rate }),
      amount,
      ...(body.reason !== undefined && { reason: body.reason }),
      ...(body.project !== undefined && { project: body.project }),
    };

    const data = await prisma.overtimeRecord.update({
      where: { id },
      data: updateData,
    });

    return Response.json({ data, message: 'Overtime record updated successfully' }, { headers: corsHeaders });
  } catch (error: unknown) {
    console.error('Error updating overtime record:', error);
    return Response.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500, headers: corsHeaders });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const token = getTokenFromHeaders(request);
    const decoded = await verifyToken(token);
    if (!decoded) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

    const body = await request.json();
    const { status } = body;

    if (!status || !['approved', 'rejected', 'processed'].includes(status)) {
      return Response.json({ error: 'Invalid status. Must be approved, rejected, or processed' }, { status: 400, headers: corsHeaders });
    }

    const existing = await prisma.overtimeRecord.findUnique({ where: { id } });
    if (!existing) return Response.json({ error: 'Overtime record not found' }, { status: 404, headers: corsHeaders });

    const updateData: Record<string, unknown> = {
      status,
      ...(status === 'approved' && {
        approvedBy: decoded.userId as string,
        approvedAt: new Date(),
      }),
    };

    const data = await prisma.overtimeRecord.update({
      where: { id },
      data: updateData,
    });

    return Response.json({ data, message: `Overtime record ${status} successfully` }, { headers: corsHeaders });
  } catch (error: unknown) {
    console.error('Error updating overtime record status:', error);
    return Response.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500, headers: corsHeaders });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const token = getTokenFromHeaders(request);
    const decoded = await verifyToken(token);
    if (!decoded) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

    const existing = await prisma.overtimeRecord.findUnique({ where: { id } });
    if (!existing) return Response.json({ error: 'Overtime record not found' }, { status: 404, headers: corsHeaders });

    if (existing.status !== 'pending') {
      return Response.json({ error: 'Only pending overtime records can be deleted' }, { status: 400, headers: corsHeaders });
    }

    await prisma.overtimeRecord.delete({ where: { id } });

    return Response.json({ message: 'Overtime record deleted successfully' }, { headers: corsHeaders });
  } catch (error: unknown) {
    console.error('Error deleting overtime record:', error);
    return Response.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500, headers: corsHeaders });
  }
}
