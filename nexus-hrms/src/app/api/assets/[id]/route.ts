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

    // Assign asset to employee
    if (body.action === 'assign' && body.employeeId) {
      const assignment = await prisma.assetAssignment.create({
        data: {
          assetId: id,
          employeeId: body.employeeId,
          expectedReturn: body.expectedReturn ? new Date(body.expectedReturn) : null,
          condition: body.condition || 'good',
        },
        include: {
          asset: { select: { name: true, assetTag: true } },
          employee: { select: { firstName: true, lastName: true, employeeId: true } },
        },
      });
      await prisma.asset.update({ where: { id }, data: { status: 'assigned' } });
      return NextResponse.json({ assignment }, { status: 201, headers: corsHeaders() });
    }

    // Return asset
    if (body.action === 'return' && body.assignmentId) {
      const assignment = await prisma.assetAssignment.update({
        where: { id: body.assignmentId },
        data: {
          returnDate: new Date(),
          condition: body.condition || 'good',
          status: 'returned',
        },
      });
      // Check if asset has other active assignments
      const activeAssignments = await prisma.assetAssignment.count({
        where: { assetId: id, status: 'assigned' },
      });
      if (activeAssignments === 0) {
        await prisma.asset.update({ where: { id }, data: { status: 'available' } });
      }
      return NextResponse.json({ assignment }, { headers: corsHeaders() });
    }

    // Update asset
    const asset = await prisma.asset.update({
      where: { id },
      data: {
        ...(body.name && { name: body.name }),
        ...(body.status && { status: body.status }),
        ...(body.condition && { condition: body.condition }),
        ...(body.brand !== undefined && { brand: body.brand }),
        ...(body.model !== undefined && { model: body.model }),
      },
    });

    return NextResponse.json({ asset }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Update asset error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
