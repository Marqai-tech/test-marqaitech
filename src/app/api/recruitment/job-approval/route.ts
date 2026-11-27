import { NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { createNotification } from '@/lib/notifications';
import { resolveJobApprovalConfig } from '@/lib/recruitment-workflow';
import {
  ensureJobApprovalColumns,
  jobApprovalContext,
  canUserApproveJob,
  applyJobApprovalAction,
} from '@/lib/job-approval';

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

// ─── GET: pending job approvals + which jobs the caller can act on ───
export async function GET(request: Request) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    const decodedRec = decoded as unknown as Record<string, any>;

    await ensureJobApprovalColumns(db);

    const config = await resolveJobApprovalConfig(db, decodedRec.tenantId as string, null).catch(() => null);

    // Every job that is waiting somewhere in the approval chain
    const pendingJobs = await db.jobPosting.findMany({
      where: {
        status: 'pending_approval',
        jobApprovalStatus: { notIn: ['approved', 'rejected'] },
      },
      include: { department: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }).catch(async () => {
      // Older tenant DBs without the new columns — fall back to status only
      return db.jobPosting.findMany({
        where: { status: 'pending_approval' },
        include: { department: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 200,
      });
    });

    const rows: Array<Record<string, unknown>> = [];
    const myPending: Array<Record<string, unknown>> = [];

    for (const job of pendingJobs) {
      const ctx = jobApprovalContext(job as any);
      const canApprove = await canUserApproveJob(
        db,
        job as any,
        { role: String(decodedRec.role || ''), userId: String(decodedRec.userId || '') },
      );
      const row = {
        id: job.id,
        title: job.title,
        department: job.department ? { id: job.department.id, name: job.department.name } : null,
        createdAt: job.createdAt,
        closingDate: job.closingDate,
        vacancies: job.vacancies,
        jobApprovalStatus: (job as any).jobApprovalStatus || 'pending',
        jobApprovalChain: (job as any).jobApprovalChain || null,
        currentTier: ctx && ctx.currentTier
          ? {
              tier: ctx.currentTier.tier,
              label: ctx.currentTier.label || ctx.currentTier.approverType,
              approverType: ctx.currentTier.approverType,
              index: ctx.currentIndex,
              total: ctx.chain.length,
            }
          : null,
        canApprove,
      };
      rows.push(row);
      if (canApprove) myPending.push(row);
    }

    return NextResponse.json({
      enabled: config ? config.enabled !== false : true,
      tiers: config ? config.tiers : [],
      pending: rows,
      myPending,
    }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Job approval GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

// ─── POST: approve / reject a job at its current tier ───
export async function POST(request: Request) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    const decodedRec = decoded as unknown as Record<string, any>;

    await ensureJobApprovalColumns(db);

    const body = await request.json();
    const { jobId, action, remarks } = body || {};
    if (!jobId || !['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'jobId and action (approve|reject) are required' }, { status: 400, headers: corsHeaders() });
    }

    const job = await db.jobPosting.findUnique({
      where: { id: jobId },
      include: { department: { select: { id: true, name: true } } },
    });
    if (!job) return NextResponse.json({ error: 'Job posting not found' }, { status: 404, headers: corsHeaders() });
    if (job.status !== 'pending_approval') {
      return NextResponse.json({ error: 'Job is not awaiting approval' }, { status: 409, headers: corsHeaders() });
    }

    const canApprove = await canUserApproveJob(
      db,
      job as any,
      { role: String(decodedRec.role || ''), userId: String(decodedRec.userId || '') },
    );
    if (!canApprove) {
      const ctx = jobApprovalContext(job as any);
      const tierLabel = ctx?.currentTier ? (ctx.currentTier.label || ctx.currentTier.approverType) : 'the current tier';
      return NextResponse.json({ error: `Your role cannot approve at this tier (${tierLabel})` }, { status: 403, headers: corsHeaders() });
    }

    const approverName = String(decodedRec.name || decodedRec.email || 'approver');
    const { data, final } = await applyJobApprovalAction(
      db,
      decodedRec.tenantId as string,
      job as any,
      action,
      typeof remarks === 'string' && remarks.trim() ? remarks.trim().slice(0, 500) : null,
      approverName,
    );

    const updated = await db.jobPosting.update({
      where: { id: jobId },
      data,
      include: { department: { select: { id: true, name: true } } },
    });

    // Notify admins that the state changed (non-fatal).
    try {
      if (final) {
        const admins = await db.user.findMany({
          where: { tenantId: decodedRec.tenantId as string, role: { in: ['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_admin'] } },
          select: { id: true },
        });
        for (const a of admins) {
          await createNotification({
            tenantId: decodedRec.tenantId as string,
            userId: a.id,
            title: action === 'approve' ? 'Job Approved' : 'Job Approval Rejected',
            message: action === 'approve'
              ? `Job posting "${job.title}" completed its approval chain and is now live.`
              : `Job posting "${job.title}" was rejected during approval${remarks ? `: ${remarks}` : ''}`,
            type: action === 'approve' ? 'success' : 'warning',
            category: 'recruitment',
            link: `/recruitment/${jobId}`,
          }).catch(() => null);
        }
      }
    } catch { /* notifications non-fatal */ }

    return NextResponse.json({ success: true, final, jobPosting: updated }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Job approval POST error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
