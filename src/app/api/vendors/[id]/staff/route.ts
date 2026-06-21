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

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });

    const { id } = await params;
    const staff = await prisma.vendorStaff.findMany({ where: { vendorId: id }, orderBy: { createdAt: 'desc' } });
    return NextResponse.json({ staff }, { headers: corsHeaders() });
  } catch (error) { console.error('Get vendor staff error:', error); return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() }); }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });

    const { id } = await params;
    const body = await request.json();
    const { name, email, phone, role, skillTags, billRate, costRate, currency } = body;
    if (!name) return NextResponse.json({ error: 'Missing name' }, { status: 400, headers: corsHeaders() });
    const staff = await prisma.vendorStaff.create({
      data: { vendorId: id, name, email, phone, role, skillTags, billRate, costRate, currency: currency || 'INR' },
    });
    await prisma.vendor.update({ where: { id }, data: { candidateCount: { increment: 1 } } });
    return NextResponse.json({ staff }, { status: 201, headers: corsHeaders() });
  } catch (error) { console.error('Create vendor staff error:', error); return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() }); }
}
