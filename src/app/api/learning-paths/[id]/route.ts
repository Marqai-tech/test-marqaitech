import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

function corsHeaders() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
}
export async function OPTIONS() { return NextResponse.json({}, { headers: corsHeaders() }); }

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });
    const { id } = await params;
    const path = await prisma.learningPath.findUnique({
      where: { id },
      include: { courses: { include: { course: true }, orderBy: { order: 'asc' } } },
    });
    if (!path) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: corsHeaders() });
    return NextResponse.json({ learningPath: path }, { headers: corsHeaders() });
  } catch (error) {
    console.error('LearningPath GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });
    const { id } = await params;
    const body = await request.json();
    const path = await prisma.learningPath.update({ where: { id }, data: body });
    return NextResponse.json({ learningPath: path }, { headers: corsHeaders() });
  } catch (error) {
    console.error('LearningPath PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });
    const { id } = await params;
    await prisma.learningPath.delete({ where: { id } });
    return NextResponse.json({ success: true }, { headers: corsHeaders() });
  } catch (error) {
    console.error('LearningPath DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
