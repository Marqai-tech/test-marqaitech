/**
 * Task 123 — Auto Payroll Processing Cron
 *
 *   GET /api/cron/payroll-auto-process?secret=CRON_SECRET
 *
 * Monthly sweep (vercel.json: 1st of every month) that processes salary for
 * every company whose PayrollSettings.processingMode = 'auto':
 *   • Platform DB + every active dedicated tenant DB are swept.
 *   • For each company with auto mode enabled the PREVIOUS month is processed
 *     (October salary runs on November 1st) with backfill ON so any missed
 *     months since the employee's joining are also filled.
 *   • Fully idempotent — existing payroll rows are never duplicated.
 *   • Per-tenant error isolation: one failing tenant does not stop the rest.
 *
 * Manual mode companies are untouched — the payroll head processes from the
 * Payroll Settings page instead.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getPlatformDb, getDbForTenantById } from '@/lib/tenant-db';
import { processPayrollForCompany } from '@/lib/payroll-engine';

const CRON_SECRET = process.env.CRON_SECRET || '3boxes-hrms-cron-2026';

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() { return NextResponse.json({}, { headers: cors() }); }

export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get('secret');
  if (secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: cors() });
  }

  const summary: Array<Record<string, unknown>> = [];
  const errors: string[] = [];

  // ── Collect all tenant DBs (platform + dedicated) ──
  const targets: Array<{ tenantId: string | null; label: string }> = [{ tenantId: null, label: 'platform' }];
  try {
    const platformDb = getPlatformDb();
    const tenants = await platformDb.tenantDatabase.findMany({
      where: { isActive: true },
      select: { tenantId: true, databaseName: true },
    });
    for (const t of tenants) targets.push({ tenantId: t.tenantId, label: t.databaseName });
  } catch (e) {
    errors.push(`tenant registry: ${e instanceof Error ? e.message : String(e)}`);
  }

  for (const target of targets) {
    try {
      const db = target.tenantId ? await getDbForTenantById(target.tenantId) : getPlatformDb();

      // Companies in this DB with auto processing enabled
      const autoCompanies = await db.payrollSettings.findMany({
        where: { processingMode: 'auto' },
        select: { companyId: true, autoProcessDay: true },
      });

      for (const cs of autoCompanies) {
        // Only run on/after the configured auto-process day of the month
        const today = new Date().getUTCDate();
        if (today < (cs.autoProcessDay || 1) && request.nextUrl.searchParams.get('ignoreDay') !== '1') {
          summary.push({ db: target.label, companyId: cs.companyId, skipped: `before autoProcessDay (${cs.autoProcessDay})` });
          continue;
        }
        const result = await processPayrollForCompany(db, {
          companyId: cs.companyId,
          backfill: true, // fill any gaps since joining
          processingMode: 'auto',
          processedBy: 'cron',
        });
        await db.auditLog.create({
          data: {
            userId: 'cron',
            action: 'PAYROLL_AUTO_PROCESS',
            module: 'payroll',
            details: `Auto payroll cron — ${result.targetPeriod} backfill: created ${result.created}, skipped ${result.skipped}, failed ${result.failed}, gross ₹${result.totalGross}, net ₹${result.totalNet}`,
          },
        }).catch(() => undefined);
        summary.push({
          db: target.label, companyId: cs.companyId, period: result.targetPeriod,
          created: result.created, skipped: result.skipped, failed: result.failed,
          gross: result.totalGross, net: result.totalNet,
        });
      }
    } catch (e) {
      errors.push(`${target.label}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return NextResponse.json({
    data: { ranAt: new Date().toISOString(), companies: summary.length, summary, errors },
  }, { headers: cors() });
}
