import { NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { ensureSchemaSynced } from '@/lib/schema-sync';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function daysBetween(a: Date | string | null | undefined, b: Date | string | null | undefined): number | null {
  if (!a || !b) return null;
  const da = a instanceof Date ? a : new Date(a);
  const db = b instanceof Date ? b : new Date(b);
  if (isNaN(da.getTime()) || isNaN(db.getTime())) return null;
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}

function monthKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  return `${y}-${m}`;
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

/**
 * GET — Compute recruitment report data from database.
 * Returns: hiringSummary, timeToHire, sourceAnalytics, offerAcceptance
 */
export async function GET(request: Request) {
  try {
    await ensureSchemaSynced();

    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    }
    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    }

    const db = await getDb(request);

    const now = new Date();
    const sixMonthsAgo = new Date(now.getTime() - 180 * 86400000);

    // Parallel data fetch
    const [
      jobPostings,
      applications,
      offers,
      requisitions,
    ] = await Promise.all([
      db.jobPosting.findMany({
        include: {
          department: { select: { id: true, name: true } },
          applications: { select: { id: true, status: true, appliedDate: true, source: true } },
        },
      }),
      db.jobApplication.findMany({
        select: {
          id: true,
          status: true,
          appliedDate: true,
          source: true,
          jobPostingId: true,
          jobPosting: { select: { id: true, title: true, departmentId: true, department: { select: { id: true, name: true } } } },
        },
      }),
      db.offer.findMany({
        select: {
          id: true,
          status: true,
          candidateName: true,
          createdAt: true,
          respondedAt: true,
        },
      }),
      db.requisition.findMany({
        select: { id: true, status: true, numberOfOpenings: true },
      }),
    ]);

    // ── Hiring Summary (by department) ──
    const deptMap = new Map<string, { open: number; inProgress: number; hired: number }>();
    // Initialize departments from job postings
    (jobPostings || []).forEach((j) => {
      const dept = j.department?.name || 'Unknown';
      if (!deptMap.has(dept)) deptMap.set(dept, { open: 0, inProgress: 0, hired: 0 });
      const agg = deptMap.get(dept)!;
      if (j.status === 'open') agg.open += 1;
      // In-progress: jobs with at least one non-terminal application
      const inProgressApps = (j.applications || []).filter(
        (a) => !['rejected', 'hired'].includes(a.status)
      );
      if (inProgressApps.length > 0 && j.status !== 'filled') agg.inProgress += inProgressApps.length;
    });

    // Count hired applications by department
    (applications || []).filter((a) => a.status === 'hired').forEach((a) => {
      const dept = a.jobPosting?.department?.name || 'Unknown';
      if (!deptMap.has(dept)) deptMap.set(dept, { open: 0, inProgress: 0, hired: 0 });
      deptMap.get(dept)!.hired += 1;
    });

    const hiringSummary = Array.from(deptMap.entries()).map(([department, v]) => ({
      department,
      ...v,
    }));

    // ── Overall Summary ──
    const totalOpenPositions = (jobPostings || []).filter((j) => j.status === 'open').length;
    const totalApplications = (applications || []).length;
    const totalOffersMade = (offers || []).length;
    const totalHired = (applications || []).filter((a) => a.status === 'hired').length;
    const hiringRate = totalApplications > 0 ? Math.round((totalHired / totalApplications) * 1000) / 10 : 0;

    // ── Time to Hire ──
    // Average days from application to hire for hired candidates
    const tthValues: number[] = [];
    const tthByDeptMap = new Map<string, number[]>();
    (applications || []).filter((a) => a.status === 'hired' && a.appliedDate).forEach((a) => {
      // Use the latest interview or offer date as proxy for "hire date"
      // In absence of a direct hireDate on the application, we look at corresponding offer
      const matchingOffer = (offers || []).find(
        (o) => o.jobPostingId === a.jobPostingId && o.status === 'accepted'
      );
      if (matchingOffer?.respondedAt) {
        const days = daysBetween(a.appliedDate, matchingOffer.respondedAt);
        if (days !== null && days >= 0) {
          tthValues.push(days);
          const dept = a.jobPosting?.department?.name || 'Unknown';
          const arr = tthByDeptMap.get(dept) || [];
          arr.push(days);
          tthByDeptMap.set(dept, arr);
        }
      }
    });

    const timeToHireAvg = tthValues.length > 0
      ? Math.round((tthValues.reduce((s, v) => s + v, 0) / tthValues.length) * 10) / 10
      : 0;

    const timeToHireByDepartment = Array.from(tthByDeptMap.entries()).map(([department, values]) => ({
      department,
      avgDays: Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10,
      hiresCount: values.length,
    }));

    // ── Time to Fill ──
    const ttfValues: number[] = [];
    (jobPostings || []).filter((j) => j.status === 'filled' && j.postedDate).forEach((j) => {
      const days = daysBetween(j.postedDate, j.closingDate);
      if (days !== null && days >= 0) ttfValues.push(days);
    });
    const timeToFillAvg = ttfValues.length > 0
      ? Math.round((ttfValues.reduce((s, v) => s + v, 0) / ttfValues.length) * 10) / 10
      : 0;

    // ── Source Analytics ──
    const bySourceMap = new Map<string, { applications: number; hired: number }>();
    (applications || []).forEach((a) => {
      const src = a.source || 'website';
      if (!bySourceMap.has(src)) bySourceMap.set(src, { applications: 0, hired: 0 });
      const agg = bySourceMap.get(src)!;
      agg.applications += 1;
      if (a.status === 'hired') agg.hired += 1;
    });

    const sourceAnalytics = Array.from(bySourceMap.entries()).map(([source, v]) => ({
      source,
      ...v,
      conversionRate: v.applications > 0 ? Math.round((v.hired / v.applications) * 1000) / 10 : 0,
    }));

    // ── Offer Acceptance ──
    const offersAccepted = (offers || []).filter((o) => o.status === 'accepted').length;
    const offersRejected = (offers || []).filter((o) => o.status === 'rejected').length;
    const offersPending = (offers || []).filter((o) => !['accepted', 'rejected', 'withdrawn'].includes(o.status)).length;
    const totalOfferResponses = offersAccepted + offersRejected;
    const offerAcceptanceRate = totalOfferResponses > 0
      ? Math.round((offersAccepted / totalOfferResponses) * 1000) / 10
      : 0;

    // ── Monthly Trend (last 6 months) ──
    const monthlyMap = new Map<string, { applications: number; hires: number; offers: number }>();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getUTCFullYear(), now.getUTCMonth() - i, 1);
      monthlyMap.set(monthKey(d), { applications: 0, hires: 0, offers: 0 });
    }

    (applications || []).forEach((a) => {
      if (!a.appliedDate) return;
      const d = a.appliedDate instanceof Date ? a.appliedDate : new Date(a.appliedDate);
      if (d >= sixMonthsAgo) {
        const k = monthKey(d);
        const e = monthlyMap.get(k);
        if (e) e.applications += 1;
        if (a.status === 'hired' && e) e.hires += 1;
      }
    });

    (offers || []).forEach((o) => {
      const d = o.createdAt instanceof Date ? o.createdAt : new Date(o.createdAt);
      if (d >= sixMonthsAgo) {
        const k = monthKey(d);
        const e = monthlyMap.get(k);
        if (e) e.offers += 1;
      }
    });

    const monthlyTrend = Array.from(monthlyMap.entries()).map(([month, v]) => ({
      month,
      ...v,
    }));

    // ── Open Requisitions ──
    const openRequisitions = (requisitions || []).filter(
      (r) => r.status === 'open' || r.status === 'approved'
    ).length;

    return NextResponse.json(
      {
        hiringSummary,
        overall: {
          totalOpenPositions,
          totalApplications,
          totalOffersMade,
          totalHired,
          hiringRate,
          timeToFillAvg,
          timeToHireAvg,
          openRequisitions,
        },
        timeToHire: {
          avgDays: timeToHireAvg,
          byDepartment: timeToHireByDepartment,
        },
        sourceAnalytics,
        offerAcceptance: {
          accepted: offersAccepted,
          rejected: offersRejected,
          pending: offersPending,
          acceptanceRate: offerAcceptanceRate,
        },
        monthlyTrend,
        generatedAt: now.toISOString(),
      },
      { headers: corsHeaders() }
    );
  } catch (error) {
    console.error('GET recruitment-reports error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
