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

export async function GET(request: Request) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });

    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get('employeeId');
    const where: Record<string, unknown> = {};
    if (employeeId) where.employeeId = employeeId;
    const orders = await prisma.marketplaceOrder.findMany({
      where: where as any,
      include: { product: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return NextResponse.json({ orders }, { headers: corsHeaders() });
  } catch (error) { console.error('Get orders error:', error); return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() }); }
}

export async function POST(request: Request) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });

    const body = await request.json();
    const { employeeId, productId, qty, walletBucketId } = body;
    if (!employeeId || !productId) return NextResponse.json({ error: 'Missing fields' }, { status: 400, headers: corsHeaders() });

    const product = await prisma.marketplaceProduct.findUnique({ where: { id: productId } });
    if (!product || product.status !== 'active') return NextResponse.json({ error: 'Product unavailable' }, { status: 400, headers: corsHeaders() });

    const quantity = qty || 1;
    const totalAmount = product.corporatePrice * quantity;

    // Validate bucket
    if (!walletBucketId) return NextResponse.json({ error: 'Wallet bucket required' }, { status: 400, headers: corsHeaders() });
    const bucket = await prisma.walletBucket.findUnique({ where: { id: walletBucketId } });
    if (!bucket) return NextResponse.json({ error: 'Invalid bucket' }, { status: 400, headers: corsHeaders() });
    const allowedBuckets = product.allowedBuckets.split(',').map(s => s.trim());
    if (!allowedBuckets.includes(bucket.category)) return NextResponse.json({ error: `Product cannot be bought with ${bucket.category} bucket (REQ-MKT-03)` }, { status: 400, headers: corsHeaders() });
    if (bucket.balance < totalAmount) return NextResponse.json({ error: 'Insufficient balance' }, { status: 400, headers: corsHeaders() });

    // Quarterly quantity limit (REQ-SEC-MKT-04)
    if (product.quantityLimitPerQuarter > 0) {
      const quarterStart = new Date(); quarterStart.setMonth(Math.floor(quarterStart.getMonth() / 3) * 3, 1); quarterStart.setHours(0, 0, 0, 0);
      const quarterCount = await prisma.marketplaceOrder.count({ where: { employeeId, productId, createdAt: { gte: quarterStart }, status: { not: 'cancelled' } } });
      if (quarterCount + quantity > product.quantityLimitPerQuarter) return NextResponse.json({ error: 'Quarterly quantity limit exceeded (anti-arbitrage)' }, { status: 400, headers: corsHeaders() });
    }

    // Velocity fraud check (REQ-AI-MKT-02)
    const oneMinuteAgo = new Date(Date.now() - 60000);
    const recentOrders = await prisma.marketplaceOrder.count({ where: { employeeId, createdAt: { gte: oneMinuteAgo } } });
    let blockedByFraud = false;
    let fraudReason = null;
    if (recentOrders >= 3) { blockedByFraud = true; fraudReason = 'velocity'; }
    if (totalAmount > 50000) { blockedByFraud = true; fraudReason = 'bulk_high_value'; }

    if (blockedByFraud) {
      await prisma.marketplaceFraudFlag.create({ data: { employeeId, reason: fraudReason!, riskScore: 0.9, mfaTriggered: true } });
      return NextResponse.json({ error: 'Order blocked by fraud detection. MFA required.', fraudReason }, { status: 403, headers: corsHeaders() });
    }

    // Co-pay split
    const employerPct = bucket.employerCoPayPct;
    const employerPaid = totalAmount * (employerPct / 100);
    const employeePaid = totalAmount - employerPaid;

    // Create order + debit wallet + record transaction atomically
    const [order, ,] = await prisma.$transaction([
      prisma.marketplaceOrder.create({
        data: { employeeId, productId, qty: quantity, unitPrice: product.corporatePrice, totalAmount, currency: product.currency, walletBucketId: bucket.id!, employerCoPayPct: employerPct, employerPaidAmount: employerPaid, employeePaidAmount: employeePaid, fulfillmentStatus: 'fulfilled', fulfillmentRef: `CODE-${Date.now()}`, status: 'completed' },
      }),
      prisma.walletBucket.update({ where: { id: bucket.id }, data: { balance: { decrement: totalAmount } } }),
      prisma.walletTransaction.create({ data: { walletId: bucket.walletId, bucketId: bucket.id, type: 'debit', amount: totalAmount, currency: product.currency, baseAmount: totalAmount, description: `Order: ${product.name} x${quantity}` } }),
    ]);
    return NextResponse.json({ order }, { status: 201, headers: corsHeaders() });
  } catch (error) { console.error('Place order error:', error); return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() }); }
}
