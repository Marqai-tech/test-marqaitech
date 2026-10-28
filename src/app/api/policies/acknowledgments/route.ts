/**
 * Policy Acknowledgment API — employees accept or reject a policy
 *
 *   GET  /api/policies/acknowledgments?policyId=<id>   — admin tracking: who acknowledged / rejected / pending
 *   GET  /api/policies/acknowledgments?mine=1          — current employee's own acknowledgments
 *   POST /api/policies/acknowledgments                 — accept or reject a policy (self-service)
 *        body: { policyId, action?: 'accepted' | 'rejected', comments? }
 *        - action defaults to 'accepted'
 *        - 'rejected' requires comments (the mandatory rejection reason)
 *        - one record per (policy, employee, version): acknowledging a new
 *          policy version creates a fresh record, older versions stay as history
 */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { getAuthInfo } from '@/lib/companyScope';
import { sanitizeMultiLineText } from '@/lib/sanitize';

const REJECTION_REASON_MAX = 500;

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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

    const url = new URL(req.url);

    // ── Current employee's own acknowledgments ──
    if (url.searchParams.get('mine')) {
      const emp = await db.employee.findFirst({ where: { userId: auth.userId }, select: { id: true } });
      if (!emp) return NextResponse.json({ acknowledgments: [] }, { headers: corsHeaders() });
      const acknowledgments = await (db as any).policyAcknowledgment?.findMany({
        where: { employeeId: emp.id },
        orderBy: { acknowledgedAt: 'desc' },
        take: 200,
        select: { id: true, policyId: true, policyVersion: true, action: true, method: true, acknowledgedAt: true, comments: true },
      }) || [];
      return NextResponse.json({ acknowledgments }, { headers: corsHeaders() });
    }

    // ── Admin tracking for one policy (against its CURRENT version) ──
    const policyId = url.searchParams.get('policyId');
    if (!policyId) return NextResponse.json({ error: 'policyId is required' }, { status: 400, headers: corsHeaders() });

    const isAdmin = ['super_admin', 'tenant_admin', 'admin', 'hr_admin', 'company_hr_admin'].includes(auth.role);
    if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: corsHeaders() });

    const policy = await db.policy.findUnique({ where: { id: policyId }, select: { id: true, title: true, version: true } });
    if (!policy) return NextResponse.json({ error: 'Policy not found' }, { status: 404, headers: corsHeaders() });

    const acks = await (db as any).policyAcknowledgment?.findMany({
      where: { policyId },
      include: { employee: { select: { id: true, firstName: true, lastName: true, employeeId: true, email: true, departmentId: true } } },
      orderBy: { acknowledgedAt: 'desc' },
      take: 2000,
    }) || [];

    // Latest record per employee for the policy's current version (legacy rows
    // with no version count as acknowledgments of the current version).
    const current = new Map<string, { at: Date; method: string; version: string | null; action: string; comments: string | null }>();
    for (const a of acks) {
      if (!a.employee) continue;
      if (a.policyVersion && a.policyVersion !== policy.version) continue; // older version — history
      if (!current.has(a.employeeId)) {
        current.set(a.employeeId, { at: a.acknowledgedAt, method: a.method, version: a.policyVersion, action: a.action || 'accepted', comments: a.comments });
      }
    }

    // All active employees = audience for this policy
    const employees = await db.employee.findMany({
      where: { status: 'active' },
      select: { id: true, firstName: true, lastName: true, employeeId: true, email: true, departmentId: true },
      orderBy: { firstName: 'asc' },
      take: 2000,
    });

    const rows = employees.map((e) => {
      const ack = current.get(e.id);
      const action = ack?.action || null;
      return {
        employeeId: e.id,
        employeeCode: e.employeeId,
        name: `${e.firstName} ${e.lastName}`.trim(),
        email: e.email,
        departmentId: e.departmentId,
        acknowledged: action === 'accepted',
        rejected: action === 'rejected',
        action,
        acknowledgedAt: ack?.at || null,
        method: ack?.method || null,
        acknowledgedVersion: ack?.version || null,
        comments: ack?.comments || null,
      };
    });

    return NextResponse.json({
      policy,
      summary: {
        total: rows.length,
        acknowledged: rows.filter((r) => r.acknowledged).length,
        rejected: rows.filter((r) => r.rejected).length,
        pending: rows.filter((r) => !r.acknowledged).length,
      },
      rows,
    }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Policy acknowledgments GET error:', error);
    return NextResponse.json({ error: 'Failed to load acknowledgments' }, { status: 500, headers: corsHeaders() });
  }
}

export async function POST(req: NextRequest) {
  const db = await getDb(req);
  try {
    const auth = await getAuthInfo(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });

    const body = await req.json();
    const { policyId, comments } = body;
    const action = body.action === 'rejected' ? 'rejected' : 'accepted';
    if (!policyId) return NextResponse.json({ error: 'policyId is required' }, { status: 400, headers: corsHeaders() });

    const policy = await db.policy.findUnique({ where: { id: policyId }, select: { id: true, title: true, version: true, status: true } });
    if (!policy) return NextResponse.json({ error: 'Policy not found' }, { status: 404, headers: corsHeaders() });
    if (policy.status !== 'active') {
      return NextResponse.json({ error: 'This policy is not active' }, { status: 400, headers: corsHeaders() });
    }

    const emp = await db.employee.findFirst({ where: { userId: auth.userId }, select: { id: true, firstName: true, userId: true } });
    if (!emp) return NextResponse.json({ error: 'No employee record is linked to your account. Acknowledgments are recorded per-employee.' }, { status: 400, headers: corsHeaders() });

    // Mandatory rejection reason
    let reason: string | null = null;
    if (action === 'rejected') {
      const trimmed = typeof comments === 'string' ? comments.trim() : '';
      if (!trimmed) {
        return NextResponse.json({ error: 'Reason for rejection is required' }, { status: 400, headers: corsHeaders() });
      }
      reason = sanitizeMultiLineText(trimmed, REJECTION_REASON_MAX);
    }

    const existing = await (db as any).policyAcknowledgment?.findFirst({
      where: { policyId, employeeId: emp.id, policyVersion: policy.version },
    });

    if (existing && existing.action !== 'rejected') {
      return NextResponse.json({ acknowledgment: existing, message: 'Policy already acknowledged' }, { headers: corsHeaders() });
    }

    const isAdmin = ['super_admin', 'tenant_admin', 'admin', 'hr_admin', 'company_hr_admin'].includes(auth.role);
    const method = isAdmin ? 'admin_marked' : 'self_service';

    const acknowledgment = existing
      ? await (db as any).policyAcknowledgment?.update({
          where: { id: existing.id },
          data: { action, method, acknowledgedById: auth.userId, acknowledgedAt: new Date(), comments: reason ?? (typeof comments === 'string' && comments.trim() ? sanitizeMultiLineText(comments, 300) : null) },
        })
      : await (db as any).policyAcknowledgment?.create({
          data: {
            policyId,
            employeeId: emp.id,
            policyVersion: policy.version,
            action,
            method,
            acknowledgedById: auth.userId,
            comments: reason ?? (typeof comments === 'string' && comments.trim() ? sanitizeMultiLineText(comments, 300) : null),
          },
        });

    // Task 88 (spec Workflow 3): confirmation notification to the EMPLOYEE
    // (even when HR marked it on their behalf). Non-fatal.
    try {
      if (auth.tenantId && action === 'accepted') {
        const { dispatchNotification } = await import('@/lib/notification-center');
        await dispatchNotification({
          tenantId: auth.tenantId,
          module: 'core_hr',
          eventKey: 'core_hr.policy.ack_confirmed',
          recipients: [{ userId: emp.userId || auth.userId }],
          vars: {
            Policy_Name: policy.title,
            Policy_Version: policy.version || '1.0',
            Acknowledged_On: new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
          },
          entity: { type: 'policy', id: policyId, link: '/policies-handbook' },
          origin: req.headers.get('origin') || undefined,
        });
      }
    } catch { /* non-fatal */ }

    return NextResponse.json({
      acknowledgment,
      message: action === 'rejected' ? 'Rejection recorded — HR can review it in the acknowledgment tracker' : 'Policy acknowledged',
    }, { status: existing ? 200 : 201, headers: corsHeaders() });
  } catch (error) {
    console.error('Policy acknowledgment POST error:', error);
    return NextResponse.json({ error: 'Failed to record acknowledgment' }, { status: 500, headers: corsHeaders() });
  }
}
