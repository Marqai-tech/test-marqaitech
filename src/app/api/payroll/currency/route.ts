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
    const legalEntityId = searchParams.get('legalEntityId');
    const companyId = searchParams.get('companyId');
    const baseCurrency = searchParams.get('baseCurrency');

    const where: Record<string, unknown> = {};
    if (legalEntityId) where.legalEntityId = legalEntityId;
    if (companyId) where.companyId = companyId;
    if (baseCurrency) where.baseCurrency = baseCurrency;

    const [currencyConfigs, exchangeRates] = await Promise.all([
      prisma.currencyConfig.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.exchangeRate.findMany({
        where: { isActive: true },
        orderBy: { rateDate: 'desc' },
      }),
    ]);

    return Response.json({ data: { currencyConfigs, exchangeRates } }, { headers: corsHeaders });
  } catch (error: unknown) {
    console.error('Error fetching currency data:', error);
    return Response.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500, headers: corsHeaders });
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = getTokenFromHeaders(request);
    const decoded = await verifyToken(token);
    if (!decoded) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

    const body = await request.json();

    if (body.type === 'exchange_rate') {
      const { type: _type, ...rateData } = body;
      const data = await prisma.exchangeRate.create({ data: rateData });
      return Response.json({ data, message: 'Exchange rate created successfully' }, { headers: corsHeaders });
    } else {
      const { type: _type, ...configData } = body;
      const data = await prisma.currencyConfig.create({ data: configData });
      return Response.json({ data, message: 'Currency config created successfully' }, { headers: corsHeaders });
    }
  } catch (error: unknown) {
    console.error('Error creating currency data:', error);
    return Response.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500, headers: corsHeaders });
  }
}
