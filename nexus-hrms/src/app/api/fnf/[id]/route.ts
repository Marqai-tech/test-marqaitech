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
    if (body.employeeId !== undefined) data.employeeId = body.employeeId || null;
    if (body.basicSalary !== undefined) data.basicSalary = parseFloat(body.basicSalary) || 0;
    if (body.pendingSalary !== undefined) data.pendingSalary = parseFloat(body.pendingSalary) || 0;
    if (body.leaveEncashment !== undefined) data.leaveEncashment = parseFloat(body.leaveEncashment) || 0;
    if (body.gratuity !== undefined) data.gratuity = parseFloat(body.gratuity) || 0;
    if (body.bonus !== undefined) data.bonus = parseFloat(body.bonus) || 0;
    if (body.deductions !== undefined) data.deductions = parseFloat(body.deductions) || 0;
    if (body.status !== undefined) data.status = body.status;
    if (body.paymentDate !== undefined) data.paymentDate = body.paymentDate ? new Date(body.paymentDate) : null;
    if (body.notes !== undefined) data.notes = body.notes || null;

    // Recalculate total
    const bs = parseFloat(body.basicSalary) || 0;
    const ps = parseFloat(body.pendingSalary) || 0;
    const le = parseFloat(body.leaveEncashment) || 0;
    const gr = parseFloat(body.gratuity) || 0;
    const bn = parseFloat(body.bonus) || 0;
    const ded = parseFloat(body.deductions) || 0;
    data.totalAmount = bs + ps + le + gr + bn - ded;

    const settlement = await prisma.fNFSettlement.update({ where: { id }, data });
    return NextResponse.json({ settlement }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Update FNF settlement error:', error);
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

    await prisma.fNFSettlement.delete({ where: { id } });
    return NextResponse.json({ message: 'FNF settlement deleted successfully' }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Delete FNF settlement error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
