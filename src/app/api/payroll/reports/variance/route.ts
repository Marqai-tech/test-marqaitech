import { getDb, getPlatformDb } from '@/lib/tenant-db';
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

function prevPeriod(period: string): string {
  const [y, m] = period.split('-').map(Number);
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, '0')}`;
}

/**
 * Payroll Variance Report — current run vs previous month, per employee.
 * Variance % > threshold (PayrollStatutoryConfig.varianceThresholdPct, default 5%)
 * is FLAGGED → payroll specialist review → Finance Head approval before the
 * bank file can be released (Stage C of the payroll cycle).
 * GET ?runId=...            → variance rows for that run (vs previous period run)
 * POST { runId, flagRows }  → persist PayrollAnomaly rows for flagged employees (audit trail)
 */
export async function GET(request: NextRequest) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    const decoded = await verifyToken(token);
    if (!decoded) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

    const { searchParams } = new URL(request.url);
    const runId = searchParams.get('runId');
    if (!runId) return Response.json({ error: 'runId is required' }, { status: 400, headers: corsHeaders });

    const run = await db.payrollRun.findUnique({ where: { id: runId } });
    if (!run) return Response.json({ error: 'Payroll run not found' }, { status: 404, headers: corsHeaders });

    // Threshold from statutory config (default 5%)
    let thresholdPct = 5;
    if (run.companyId) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cfg = await (db as any).payrollStatutoryConfig.findUnique({ where: { companyId: run.companyId } });
        if (cfg?.varianceThresholdPct) thresholdPct = cfg.varianceThresholdPct;
      } catch { /* model not migrated — default */ }
    }

    const prev = prevPeriod(run.payrollPeriod);

    // Fetch transaction lines for current and previous runs
    const curLines = await db.payrollTransactionLine.findMany({
      where: { payrollRunId: runId, isReversal: false },
      include: { employee: { select: { id: true, employeeId: true, firstName: true, lastName: true, department: { select: { name: true } } } } },
    });

    const prevRuns = await db.payrollRun.findMany({
      where: { payrollPeriod: prev, companyId: run.companyId || undefined },
      select: { id: true },
    });

    const prevLines = prevRuns.length
      ? await db.payrollTransactionLine.findMany({
          where: { payrollRunId: { in: prevRuns.map(r => r.id) }, isReversal: false },
        })
      : [];

    // Aggregate net pay per employee for both periods
    const net = (lines: typeof curLines) => {
      const m = new Map<string, { net: number; gross: number; ded: number }>();
      for (const l of lines) {
        const e = m.get(l.employeeId) || { net: 0, gross: 0, ded: 0 };
        if (l.componentType === 'EARNING') { e.gross += l.finalAmount; }
        else if (l.componentType === 'DEDUCTION') { e.ded += l.finalAmount; }
        e.net = e.gross - e.ded;
        m.set(l.employeeId, e);
      }
      return m;
    };

    const cur = net(curLines);
    const prevMap = net(prevLines as typeof curLines);

    interface VarianceRow {
      employeeId: string; empCode: string; name: string; department: string;
      currentNet: number; previousNet: number; delta: number; variancePct: number;
      flagged: boolean;
    }
    const rows: VarianceRow[] = [];
    for (const [empId, curVal] of cur.entries()) {
      const emp = curLines.find(l => l.employeeId === empId)?.employee as Record<string, unknown> | undefined;
      const prevVal = prevMap.get(empId) || { net: 0, gross: 0, ded: 0 };
      const delta = curVal.net - prevVal.net;
      const pct = prevVal.net > 0 ? (delta / prevVal.net) * 100 : (curVal.net > 0 ? 100 : 0);
      rows.push({
        employeeId: empId,
        empCode: String((emp?.employeeId as string) || empId),
        name: `${(emp?.firstName as string) || ''} ${(emp?.lastName as string) || ''}`.trim(),
        department: ((emp?.department as { name?: string } | null)?.name) || '—',
        currentNet: Math.round(curVal.net * 100) / 100,
        previousNet: Math.round(prevVal.net * 100) / 100,
        delta: Math.round(delta * 100) / 100,
        variancePct: Math.round(pct * 100) / 100,
        flagged: Math.abs(pct) > thresholdPct && (prevVal.net > 0 || curVal.net > 0),
      });
    }

    rows.sort((a, b) => Math.abs(b.variancePct) - Math.abs(a.variancePct));

    const flagged = rows.filter(r => r.flagged);
    return Response.json({
      runId,
      payrollPeriod: run.payrollPeriod,
      previousPeriod: prev,
      thresholdPct,
      totalEmployees: rows.length,
      flaggedCount: flagged.length,
      data: rows,
      summary: {
        currentTotalNet: [...cur.values()].reduce((s, v) => s + v.net, 0),
        previousTotalNet: [...prevMap.values()].reduce((s, v) => s + v.net, 0),
      },
      governance: flagged.length > 0
        ? `Variation above ${thresholdPct}% for ${flagged.length} employee(s) — payroll specialist review + Finance Head approval required before bank file release.`
        : `All employees within the ${thresholdPct}% variance threshold.`,
    }, { headers: corsHeaders });
  } catch (error: unknown) {
    console.error('Error computing payroll variance:', error);
    return Response.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500, headers: corsHeaders });
  }
}

/** POST: persist flagged rows as PayrollAnomaly records (VARIANCE_THRESHOLD) for audit + Finance review. */
export async function POST(request: NextRequest) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    const decoded = await verifyToken(token);
    if (!decoded) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

    const body = await request.json();
    const { runId, persist = true } = body;
    if (!runId) return Response.json({ error: 'runId is required' }, { status: 400, headers: corsHeaders });

    const run = await db.payrollRun.findUnique({ where: { id: runId } });
    if (!run) return Response.json({ error: 'Payroll run not found' }, { status: 404, headers: corsHeaders });

    let thresholdPct = 5;
    if (run.companyId) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cfg = await (db as any).payrollStatutoryConfig.findUnique({ where: { companyId: run.companyId } });
        if (cfg?.varianceThresholdPct) thresholdPct = cfg.varianceThresholdPct;
      } catch { /* default */ }
    }

    const resp = await fetch(new URL(`/api/payroll/reports/variance?runId=${runId}`, request.url).toString(), {
      headers: { Authorization: request.headers.get('authorization') || '', Cookie: request.headers.get('cookie') || '' },
    });
    if (!resp.ok) return Response.json({ error: 'Variance computation failed' }, { status: resp.status });
    const variance = await resp.json();
    const flaggedRows = (variance.data as Array<Record<string, unknown>>).filter(r => r.flagged);

    if (!persist || flaggedRows.length === 0) {
      return Response.json({ data: { flaggedCount: flaggedRows.length, persisted: 0 }, message: 'No flagged rows to persist' }, { headers: corsHeaders });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anomalies: any[] = [];
    for (const row of flaggedRows) {
      anomalies.push({
        payrollRunId: runId,
        employeeId: String(row.employeeId),
        companyId: run.companyId || null,
        anomalyType: 'VARIANCE_THRESHOLD',
        severity: Math.abs(Number(row.variancePct)) > 25 ? 'CRITICAL' : Math.abs(Number(row.variancePct)) > 15 ? 'HIGH' : 'MEDIUM',
        metricName: 'net_pay_variance_pct',
        observedValue: Number(row.variancePct),
        baselineValue: Number(row.previousNet),
        deviationPct: Number(row.variancePct),
        detectionMethod: 'RULE_BASED',
        description: `Net pay variance ${row.variancePct}% between ${variance.previousPeriod} (₹${row.previousNet}) and ${variance.payrollPeriod} (₹${row.currentNet}) — exceeds ${thresholdPct}% governance threshold.`,
        evidenceJson: JSON.stringify({ previousPeriod: variance.previousPeriod, currentPeriod: variance.payrollPeriod, thresholdPct }),
        status: 'OPEN',
      });
    }
    await db.payrollAnomaly.createMany({ data: anomalies });

    // Notification: payroll team alerted for variance > threshold
    try {
      const tenantId = (decoded as Record<string, unknown>).tenantId as string | undefined;
      if (tenantId) {
        const { dispatchNotification, resolveRoleRecipients } = await import('@/lib/notification-center');
        const payrollIds = await resolveRoleRecipients(db, ['payroll_admin', 'payroll_manager', 'admin', 'tenant_admin', 'ceo'], 10);
        if (payrollIds.length) {
          await dispatchNotification({
            tenantId,
            module: 'payroll',
            eventKey: 'payroll.variance.flagged',
            recipients: payrollIds.map((pid) => ({ userId: pid })),
            vars: {
              Pay_Period: run.payrollPeriod,
              Affected_Count: String(flaggedRows.length),
              Variance_Detail: flaggedRows.slice(0, 3).map(r => `${r.name}: ${r.variancePct}%`).join(', '),
            },
            entity: { type: 'payroll_run', id: runId, link: '/payroll/reports' },
          });
        }
      }
    } catch { /* non-fatal */ }

    return Response.json({ data: { flaggedCount: flaggedRows.length, persisted: anomalies.length, thresholdPct }, message: `${anomalies.length} variance anomaly(ies) recorded for review` }, { status: 201, headers: corsHeaders });
  } catch (error: unknown) {
    console.error('Error persisting variance anomalies:', error);
    return Response.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500, headers: corsHeaders });
  }
}
