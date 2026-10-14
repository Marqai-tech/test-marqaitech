import { NextResponse } from 'next/server';
import { getDb, getPlatformDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

// ─── GET /api/super-admin/change-requests/[id] — single request ───
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded || decoded.role !== 'super_admin') {
      return NextResponse.json({ error: 'Only super admins can view change requests' }, { status: 403, headers: corsHeaders() });
    }
    const { id } = await params;
    const cr = await getPlatformDb().superAdminChangeRequest.findUnique({ where: { id } });
    if (!cr) return NextResponse.json({ error: 'Change request not found' }, { status: 404, headers: corsHeaders() });
    return NextResponse.json({ request: cr }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Get change request error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

// ─── PATCH /api/super-admin/change-requests/[id] — in-app decision ───
// action=approve    → status approved (approvalMethod: in_app, approver = acting super admin)
// action=reject     → status rejected (reason required)
// action=implement  → status implemented (only from approved; records deployCommit)
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded || decoded.role !== 'super_admin') {
      return NextResponse.json({ error: 'Only super admins can decide change requests' }, { status: 403, headers: corsHeaders() });
    }

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const action = body.action as string;
    const platformDb = getPlatformDb();

    const cr = await platformDb.superAdminChangeRequest.findUnique({ where: { id } });
    if (!cr) return NextResponse.json({ error: 'Change request not found' }, { status: 404, headers: corsHeaders() });

    const approverEmail = (decoded.email as string) || 'superadmin@3boxeshrms.com';

    if (action === 'approve') {
      if (cr.status !== 'pending_approval') {
        return NextResponse.json({ error: `Cannot approve a request in status ${cr.status}` }, { status: 409, headers: corsHeaders() });
      }
      const updated = await platformDb.superAdminChangeRequest.update({
        where: { id },
        data: {
          status: 'approved',
          approvedBy: approverEmail,
          approvalMethod: 'in_app',
          approvedAt: new Date(),
          // token no longer needed — the in-app decision supersedes the email link
          approvalToken: null,
          tokenExpiresAt: null,
        },
      });
      await auditDecision(request, decoded, `APPROVED in-app by ${approverEmail}`, cr.title);
      return NextResponse.json({ request: updated }, { headers: corsHeaders() });
    }

    if (action === 'reject') {
      if (cr.status !== 'pending_approval') {
        return NextResponse.json({ error: `Cannot reject a request in status ${cr.status}` }, { status: 409, headers: corsHeaders() });
      }
      const reason = (body.reason || '').trim();
      if (!reason) return NextResponse.json({ error: 'A rejection reason is required' }, { status: 400, headers: corsHeaders() });
      const updated = await platformDb.superAdminChangeRequest.update({
        where: { id },
        data: {
          status: 'rejected',
          approvedBy: approverEmail,
          approvalMethod: 'in_app',
          approvedAt: new Date(),
          rejectedReason: reason,
          approvalToken: null,
          tokenExpiresAt: null,
        },
      });
      await auditDecision(request, decoded, `REJECTED in-app by ${approverEmail}: ${reason}`, cr.title);
      return NextResponse.json({ request: updated }, { headers: corsHeaders() });
    }

    if (action === 'implement') {
      if (cr.status !== 'approved') {
        return NextResponse.json({ error: 'Only approved requests can be marked implemented' }, { status: 409, headers: corsHeaders() });
      }
      const updated = await platformDb.superAdminChangeRequest.update({
        where: { id },
        data: {
          status: 'implemented',
          implementedAt: new Date(),
          deployCommit: (body.deployCommit || '').trim() || null,
        },
      });
      await auditDecision(request, decoded, `Marked IMPLEMENTED by ${approverEmail} (commit ${body.deployCommit || 'n/a'})`, cr.title);
      return NextResponse.json({ request: updated }, { headers: corsHeaders() });
    }

    return NextResponse.json({ error: 'Invalid action — use approve | reject | implement' }, { status: 400, headers: corsHeaders() });
  } catch (error) {
    console.error('Decide change request error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

async function auditDecision(request: Request, decoded: { userId?: string }, details: string, title: string) {
  try {
    const db = await getDb(request);
    await db.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'DECIDE_CHANGE_REQUEST',
        module: 'governance',
        details: `Change request "${title}": ${details}`,
      },
    });
  } catch { /* best-effort */ }
}
