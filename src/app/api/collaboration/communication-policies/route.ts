import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

/**
 * GET /api/collaboration/communication-policies
 * Returns communication policies for the current tenant.
 *
 * REQ-6.2: Communication Governance — Define who can create Company-Wide
 * announcement channels. Set rules for auto-deleting chat histories.
 */
export async function GET(request: NextRequest) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const policies = await prisma.communicationPolicy.findMany({
      where: { tenantId: decoded.tenantId },
    });

    // Ensure default policies exist
    const defaultPolicies = [
      {
        policyKey: 'announcement_creators',
        policyValue: JSON.stringify({ allowed_roles: ['super_admin', 'tenant_admin', 'admin'] }),
        appliesToRoomType: 'announcement',
      },
      {
        policyKey: 'message_retention',
        policyValue: JSON.stringify({ default_days: 365, by_room_type: { direct: null, group: 365, project: null, announcement: null } }),
        appliesToRoomType: null,
      },
      {
        policyKey: 'file_retention',
        policyValue: JSON.stringify({ default_days: null, cleanup_after_days_inactive: 90 }),
        appliesToRoomType: null,
      },
    ];

    const existingKeys = new Set(policies.map((p) => p.policyKey));
    const missing = defaultPolicies.filter((p) => !existingKeys.has(p.policyKey));

    if (missing.length > 0) {
      await prisma.communicationPolicy.createMany({
        data: missing.map((p) => ({
          tenantId: decoded.tenantId,
          policyKey: p.policyKey,
          policyValue: p.policyValue,
          appliesToRoomType: p.appliesToRoomType,
          updatedBy: decoded.id,
        })),
        skipDuplicates: true,
      });
      const refreshed = await prisma.communicationPolicy.findMany({
        where: { tenantId: decoded.tenantId },
      });
      return NextResponse.json({ policies: refreshed });
    }

    return NextResponse.json({ policies });
  } catch (error) {
    console.error('GET communication policies error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/collaboration/communication-policies
 * Body: { policyKey, policyValue, appliesToRoomType? }
 *
 * Tenant Admin / Super Admin only.
 */
export async function PATCH(request: NextRequest) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    if (!['super_admin', 'tenant_admin'].includes(decoded.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const { policyKey, policyValue, appliesToRoomType } = body;
    if (!policyKey || !policyValue) return NextResponse.json({ error: 'policyKey and policyValue are required' }, { status: 400 });

    const policy = await prisma.communicationPolicy.upsert({
      where: { tenantId_policyKey: { tenantId: decoded.tenantId, policyKey } },
      create: {
        tenantId: decoded.tenantId,
        policyKey,
        policyValue: typeof policyValue === 'string' ? policyValue : JSON.stringify(policyValue),
        appliesToRoomType,
        updatedBy: decoded.id,
      },
      update: {
        policyValue: typeof policyValue === 'string' ? policyValue : JSON.stringify(policyValue),
        appliesToRoomType,
        updatedBy: decoded.id,
      },
    });

    return NextResponse.json({ policy });
  } catch (error) {
    console.error('PATCH communication policies error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
