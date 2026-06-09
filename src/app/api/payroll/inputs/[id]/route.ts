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

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const token = getTokenFromHeaders(request);
    const decoded = await verifyToken(token);
    if (!decoded) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

    const body = await request.json();
    const data = await prisma.payrollInput.update({
      where: { id },
      data: body,
    });

    return Response.json({ data, message: 'Payroll input updated successfully' }, { headers: corsHeaders });
  } catch (error: unknown) {
    console.error('Error updating payroll input:', error);
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
    const { approvalStatus, remarks } = body;

    if (!approvalStatus || !['APPROVED', 'REJECTED'].includes(approvalStatus)) {
      return Response.json({ error: 'Invalid approval status. Must be APPROVED or REJECTED' }, { status: 400, headers: corsHeaders });
    }

    const data = await prisma.payrollInput.update({
      where: { id },
      data: {
        approvalStatus,
        approvedBy: decoded.userId as string,
        approvalDate: new Date(),
        ...(remarks && { remarks }),
      },
    });

    return Response.json({ data, message: `Payroll input ${approvalStatus.toLowerCase()} successfully` }, { headers: corsHeaders });
  } catch (error: unknown) {
    console.error('Error updating payroll input status:', error);
    return Response.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500, headers: corsHeaders });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const token = getTokenFromHeaders(request);
    const decoded = await verifyToken(token);
    if (!decoded) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

    await prisma.payrollInput.delete({ where: { id } });

    return Response.json({ message: 'Payroll input deleted successfully' }, { headers: corsHeaders });
  } catch (error: unknown) {
    console.error('Error deleting payroll input:', error);
    return Response.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500, headers: corsHeaders });
  }
}
