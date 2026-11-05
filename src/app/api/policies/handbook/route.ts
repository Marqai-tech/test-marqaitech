/**
 * Policies & Handbook API — employee self-service view
 *
 *   GET  /api/policies/handbook              — list active policies + my acknowledgment status
 *   GET  /api/policies/handbook?id=<id>      — single policy detail (incl. document) + my status
 *   GET  /api/policies/handbook?summary=1    — light payload for the Home widget badge
 *
 * Audience: every active employee of the policy's company (per the Policies
 * Acknowledgement requirement — per-policy audience scoping is a future item).
 * A policy is listed when it is active, has reached its effective date, and
 * has not expired. Status per employee: latest record for the policy's CURRENT
 * version — action 'accepted' → Acknowledged; no record or 'rejected' → Pending.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { getAuthInfo } from '@/lib/companyScope';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

export async function GET(req: NextRequest) {
  const db = await getDb(req);
  try {
    const auth = await getAuthInfo(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });

    const emp = await db.employee.findFirst({
      where: { userId: auth.userId },
      select: { id: true, companyId: true },
    });
    if (!emp) return NextResponse.json({ error: 'No employee record is linked to your account' }, { status: 400, headers: corsHeaders() });

    const now = new Date();
    const usable: Record<string, unknown> = {
      status: 'active',
      OR: [{ effectiveDate: null }, { effectiveDate: { lte: now } }],
      AND: [{ OR: [{ expiryDate: null }, { expiryDate: { gte: now } }] }],
    };
    if (emp.companyId) usable.companyId = emp.companyId;

    const url = new URL(req.url);
    const summaryOnly = url.searchParams.get('summary') === '1';
    const detailId = url.searchParams.get('id');

    const selectFields = summaryOnly
      ? { id: true, title: true, version: true, effectiveDate: true }
      : {
          id: true,
          title: true,
          category: true,
          description: true,
          version: true,
          effectiveDate: true,
          expiryDate: true,
          fileName: true,
          fileSize: true,
          fileMimeType: true,
          // Full text body and the attached document are only needed on the
          // viewer screen — keep list payloads small.
          ...(detailId ? { content: true, fileUrl: true } : {}),
        };

    const policies = await db.policy.findMany({
      where: detailId ? { ...usable, id: detailId } : usable,
      orderBy: { title: 'asc' },
      take: detailId ? 1 : 500,
      select: selectFields,
    });

    const myAcks = await (db as any).policyAcknowledgment?.findMany({
      where: { employeeId: emp.id },
      orderBy: { acknowledgedAt: 'desc' },
      take: 500,
      select: { policyId: true, policyVersion: true, action: true, acknowledgedAt: true, comments: true },
    }) || [];

    const statusFor = (policyId: string, version: string) => {
      const ack = myAcks.find((a: { policyId: string; policyVersion: string | null }) =>
        a.policyId === policyId && (!a.policyVersion || a.policyVersion === version));
      if (!ack || ack.action === 'rejected') {
        return {
          status: 'pending' as const,
          rejected: !!ack,
          action: ack?.action || null,
          rejectionReason: ack?.comments || null,
          rejectedAt: ack?.action === 'rejected' ? ack.acknowledgedAt : null,
          acknowledgedAt: null as Date | null,
        };
      }
      return {
        status: 'acknowledged' as const,
        rejected: false,
        action: 'accepted',
        rejectionReason: null,
        rejectedAt: null,
        acknowledgedAt: ack.acknowledgedAt as Date,
      };
    };

    const rows = policies.map((p: { id: string; version: string }) => ({ ...p, my: statusFor(p.id, p.version) }));
    const summary = {
      total: rows.length,
      pending: rows.filter((r: { my: { status: string } }) => r.my.status === 'pending').length,
      acknowledged: rows.filter((r: { my: { status: string } }) => r.my.status === 'acknowledged').length,
    };

    if (detailId) {
      if (policies.length === 0) return NextResponse.json({ error: 'Policy not found' }, { status: 404, headers: corsHeaders() });
      return NextResponse.json({ policy: rows[0] }, { headers: corsHeaders() });
    }

    return NextResponse.json({ policies: rows, summary }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Policies handbook GET error:', error);
    return NextResponse.json({ error: 'Failed to load policies' }, { status: 500, headers: corsHeaders() });
  }
}
