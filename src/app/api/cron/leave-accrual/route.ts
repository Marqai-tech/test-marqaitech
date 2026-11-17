/**
 * Leave Accrual Cron — runs daily (Vercel cron) and processes monthly/yearly
 * accruals for all employees based on their resolved LeavePolicyRule.
 *
 * For each active employee × leave type with a policy that has:
 *   - accrualFrequency = 'monthly' → accrue accrualAmount on the 1st of each month
 *   - accrualFrequency = 'yearly'  → accrue annualQuota on Jan 1st (or policy year start)
 *   - accrualFrequency = 'fixed'   → no periodic accrual (opening balance only)
 *   - accrualFrequency = 'none'    → no accrual
 *
 * Appends 'accrue' entries to the LeaveLedger and updates LeaveBalance.
 *
 * Auth: CRON_SECRET bearer token (Vercel cron). Falls back to open access
 * in local dev when CRON_SECRET is unset.
 *
 * TEST ENVIRONMENT ONLY.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getPlatformDb, getDbForTenant } from '@/lib/tenant-db';
import { appendLedgerEntry, ensureLeaveLedgerTable, ensureLeaveModuleSchemaColumns } from '@/lib/leave-ledger';
import { resolveLeavePolicy } from '@/lib/leave-policy-resolver';

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (cronSecret) {
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-12
  const isMonthStart = now.getDate() === 1;
  const isYearStart = isMonthStart && currentMonth === 1;

  // Only run accruals on the 1st of each month (monthly) or Jan 1 (yearly).
  // For testing/demo, we also allow ?force=1 to run on any day.
  const forceRun = request.nextUrl.searchParams.get('force') === '1';
  if (!isMonthStart && !forceRun) {
    return NextResponse.json({ message: 'Accrual cron only runs on the 1st of each month. Use ?force=1 to test.', skipped: true });
  }

  let processed = 0;
  let accrued = 0;
  let errors = 0;
  const errorDetails: string[] = [];

  try {
    const platformDb = getPlatformDb();
    // Get all active tenants with dedicated databases
    const tenants = await platformDb.tenantDatabase.findMany({
      where: { isActive: true },
      select: { tenantId: true, tenant: { select: { slug: true, name: true } } },
    });

    for (const td of tenants) {
      if (!td.tenant?.slug) continue;
      try {
        const db = await getDbForTenant(td.tenant.slug);
        await ensureLeaveLedgerTable(db);
        await ensureLeaveModuleSchemaColumns(db);

        // Get all active employees
        const employees = await db.employee.findMany({
          where: { status: 'active' },
          select: { id: true, dateOfJoining: true, employeeStatus: true },
        }).catch(() => []);

        // Get all active leave types
        const leaveTypes = await db.leaveType.findMany({
          where: { status: 'active' },
          select: { id: true, name: true, code: true, defaultDays: true, isPaid: true },
        }).catch(() => []);

        for (const emp of employees) {
          for (const lt of leaveTypes) {
            try {
              // Resolve the applicable policy for this employee + leave type
              const policy = await resolveLeavePolicy(db, {
                employeeId: emp.id,
                leaveTypeId: lt.id,
              });

              if (policy.source === 'none') continue;
              const freq = policy.effective.accrualFrequency || 'none';
              const amount = policy.effective.accrualAmount || 0;
              const maxBalance = policy.effective.maxBalance || 0;

              let shouldAccrue = false;
              let accrueDays = 0;

              if (freq === 'monthly' && (isMonthStart || forceRun)) {
                shouldAccrue = true;
                accrueDays = amount;
              } else if (freq === 'yearly' && (isYearStart || forceRun)) {
                shouldAccrue = true;
                accrueDays = policy.effective.annualQuota || amount || lt.defaultDays || 0;
              }

              if (!shouldAccrue || accrueDays <= 0) continue;

              // Pro-rate for new joiners if enabled
              if (policy.effective.prorateNewJoiners && emp.dateOfJoining) {
                const joinDate = new Date(emp.dateOfJoining);
                if (joinDate.getFullYear() === currentYear) {
                  // Pro-rate: if joined mid-month, don't accrue for that month
                  const monthsActive = (currentYear - joinDate.getFullYear()) * 12 + (currentMonth - (joinDate.getMonth() + 1));
                  if (monthsActive < 0) continue; // not joined yet
                  if (joinDate.getDate() > 15 && freq === 'monthly') {
                    // Joined after 15th — skip this month's accrual
                    continue;
                  }
                }
              }

              // Check max balance cap
              if (maxBalance > 0) {
                const balance = await db.leaveBalance.findFirst({
                  where: { employeeId: emp.id, leaveTypeId: lt.id, year: currentYear },
                  select: { remaining: true },
                }).catch(() => null);
                const currentRemaining = balance ? Number(balance.remaining) : 0;
                if (currentRemaining >= maxBalance) {
                  continue; // Already at cap
                }
                // Cap the accrual to not exceed maxBalance
                accrueDays = Math.min(accrueDays, maxBalance - currentRemaining);
                if (accrueDays <= 0) continue;
              }

              // Check if already accrued this period (idempotency)
              const existingAccrual = await db.$queryRawUnsafe(
                `SELECT COUNT(*)::int as cnt FROM "LeaveLedger"
                 WHERE "employeeId" = $1 AND "leaveTypeId" = $2 AND "year" = $3
                   AND "transactionType" = 'accrue'
                   AND "sourceType" = 'accrual_cron'
                   AND EXTRACT(MONTH FROM "createdAt") = $4
                   AND EXTRACT(YEAR FROM "createdAt") = $5`,
                emp.id, lt.id, currentYear, currentMonth, currentYear,
              ).catch(() => [{ cnt: 0 }]);
              if (existingAccrual[0]?.cnt > 0) {
                continue; // Already accrued this month
              }

              // Accrue!
              await appendLedgerEntry(db, {
                employeeId: emp.id,
                leaveTypeId: lt.id,
                year: currentYear,
                transactionType: 'accrue',
                days: accrueDays,
                sourceType: 'accrual_cron',
                reason: `${freq} accrual (${accrueDays} day(s))`,
              });
              accrued++;
            } catch (e: any) {
              errors++;
              if (errorDetails.length < 10) {
                errorDetails.push(`Tenant ${td.tenant.slug}, emp ${emp.id}, lt ${lt.id}: ${e?.message || e}`);
              }
            }
            processed++;
          }
        }
      } catch (e: any) {
        errors++;
        if (errorDetails.length < 10) {
          errorDetails.push(`Tenant ${td.tenant.slug}: ${e?.message || e}`);
        }
      }
    }
  } catch (e: any) {
    return NextResponse.json({ error: 'Accrual cron failed', details: e?.message }, { status: 500 });
  }

  return NextResponse.json({
    message: 'Leave accrual cron completed',
    processed,
    accrued,
    errors,
    errorDetails: errorDetails.length > 0 ? errorDetails : undefined,
    timestamp: now.toISOString(),
  });
}
