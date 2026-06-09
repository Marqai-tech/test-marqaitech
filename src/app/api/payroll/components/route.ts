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
    const countryCode = searchParams.get('countryCode');
    const componentType = searchParams.get('componentType');
    const componentCategory = searchParams.get('componentCategory');
    const isActive = searchParams.get('isActive');

    const where: Record<string, unknown> = {};
    if (countryCode) where.countryCode = countryCode;
    if (componentType) where.componentType = componentType;
    if (componentCategory) where.componentCategory = componentCategory;
    if (isActive !== null && isActive !== undefined) where.isActive = isActive === 'true';

    const data = await prisma.payrollComponent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return Response.json({ data }, { headers: corsHeaders });
  } catch (error: unknown) {
    console.error('Error fetching payroll components:', error);
    return Response.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500, headers: corsHeaders });
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = getTokenFromHeaders(request);
    const decoded = await verifyToken(token);
    if (!decoded) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

    const body = await request.json();
    const data = await prisma.payrollComponent.create({ data: body });

    return Response.json({ data, message: 'Payroll component created successfully' }, { headers: corsHeaders });
  } catch (error: unknown) {
    console.error('Error creating payroll component:', error);
    return Response.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500, headers: corsHeaders });
  }
}
