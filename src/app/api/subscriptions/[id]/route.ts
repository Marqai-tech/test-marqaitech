import { NextRequest, NextResponse } from 'next/server';
import { getPlatformDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

/**
 * DELETE /api/subscriptions/[id] — super admin only.
 * Removes a subscription row (e.g. dummy/seed subscriptions pointing at
 * placeholder tenants that were already removed). Audited in the platform
 * AuditLog (governance of billing data). Task 95 change-control: raised under
 * the super-admin change-approval workflow.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    if (decoded.role !== 'super_admin') {
      return NextResponse.json({ error: 'Only super admins can delete subscriptions' }, { status: 403, headers: corsHeaders() });
    }

    const { id } = await params;
    const platformDb = getPlatformDb();
    const existing = await platformDb.subscription.findUnique({
      where: { id },
      include: { tenant: { select: { name: true, slug: true } }, plan: { select: { name: true } } },
    });
    if (!existing) return NextResponse.json({ error: 'Subscription not found' }, { status: 404, headers: corsHeaders() });

    await platformDb.subscription.delete({ where: { id } });

    try {
      await platformDb.auditLog.create({
        data: {
          userId: decoded.userId as string,
          action: 'DELETE_SUBSCRIPTION',
          module: 'subscriptions',
          details: `Deleted subscription ${id} (tenant ${existing.tenant?.name || existing.tenantId}, plan ${existing.plan?.name || 'n/a'}, amount ${existing.amount})`,
        },
      });
    } catch { /* audit best-effort */ }

    return NextResponse.json({ message: 'Subscription deleted successfully' }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Delete subscription error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
