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

    // Enroll employee
    if (body.action === 'enroll' && body.employeeId) {
      const enrollment = await prisma.trainingEnrollment.create({
        data: { trainingId: id, employeeId: body.employeeId },
        include: { employee: { select: { firstName: true, lastName: true, employeeId: true } } },
      });
      return NextResponse.json({ enrollment }, { status: 201, headers: corsHeaders() });
    }

    // Update training
    const training = await prisma.training.update({
      where: { id },
      data: {
        ...(body.title && { title: body.title }),
        ...(body.status && { status: body.status }),
        ...(body.category !== undefined && { category: body.category }),
        ...(body.trainer !== undefined && { trainer: body.trainer }),
        ...(body.mode && { mode: body.mode }),
        ...(body.location !== undefined && { location: body.location }),
        ...(body.maxParticipants !== undefined && { maxParticipants: body.maxParticipants }),
        ...(body.cost !== undefined && { cost: body.cost }),
      },
    });

    return NextResponse.json({ training }, { headers: corsHeaders() });
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === 'P2002') {
      return NextResponse.json({ error: 'Employee already enrolled in this training' }, { status: 409, headers: corsHeaders() });
    }
    console.error('Update training error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
