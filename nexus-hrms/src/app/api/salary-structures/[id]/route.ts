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
    if (body.grade !== undefined) data.grade = body.grade || null;
    if (body.basicSalary !== undefined) data.basicSalary = parseFloat(body.basicSalary) || 0;
    if (body.hra !== undefined) data.hra = parseFloat(body.hra) || 0;
    if (body.da !== undefined) data.da = parseFloat(body.da) || 0;
    if (body.conveyance !== undefined) data.conveyance = parseFloat(body.conveyance) || 0;
    if (body.medical !== undefined) data.medical = parseFloat(body.medical) || 0;
    if (body.specialAllowance !== undefined) data.specialAllowance = parseFloat(body.specialAllowance) || 0;
    if (body.pf !== undefined) data.pf = parseFloat(body.pf) || 0;
    if (body.esi !== undefined) data.esi = parseFloat(body.esi) || 0;
    if (body.tax !== undefined) data.tax = parseFloat(body.tax) || 0;
    if (body.status !== undefined) data.status = body.status;
    if (body.description !== undefined) data.description = body.description || null;

    // Recalculate
    const bs = parseFloat(body.basicSalary) || 0;
    const hra = parseFloat(body.hra) || 0;
    const da = parseFloat(body.da) || 0;
    const conv = parseFloat(body.conveyance) || 0;
    const med = parseFloat(body.medical) || 0;
    const sa = parseFloat(body.specialAllowance) || 0;
    const pf = parseFloat(body.pf) || 0;
    const esi = parseFloat(body.esi) || 0;
    const tax = parseFloat(body.tax) || 0;

    data.grossSalary = bs + hra + da + conv + med + sa;
    data.totalDeductions = pf + esi + tax;
    data.netSalary = (bs + hra + da + conv + med + sa) - (pf + esi + tax);

    const salaryStructure = await prisma.salaryStructure.update({ where: { id }, data });
    return NextResponse.json({ salaryStructure }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Update salary structure error:', error);
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

    await prisma.salaryStructure.delete({ where: { id } });
    return NextResponse.json({ message: 'Salary structure deleted successfully' }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Delete salary structure error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
