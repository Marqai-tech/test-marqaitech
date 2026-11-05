/**
 * Leave Year-End Processing Cron — runs on Jan 1st (or manually via ?force=1).
 *
 * For each active employee × leave type, reads the resolved policy's
 * yearEndProcessingMode and applies:
 *   - 'carry_forward' → carry forward all remaining balance (up to yearEndMaxCarryForward cap)
 *   - 'expire'        → all unused balance expires (zero out)
 *   - 'payout_all'    → all remaining balance is paid out (encashment record created)
 *   - 'pay_n_carry_rest' → pay up to yearEndMaxEncashment days, carry forward the rest (up to yearEndMaxCarryForward)
 *   - 'carry_n_pay_rest' → carry up to yearEndMaxCarryForward days, pay out the rest
 *
 * Appends 'carry_forward', 'expire', or 'encash' entries to the LeaveLedger.
 * Creates the new year's LeaveBalance rows with the carried-forward amount.
 *
 * Auth: CRON_SECRET bearer token (Vercel cron).
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
  const previousYear = currentYear - 1;
  const isYearStart = now.getDate() === 1 && now.getMonth() === 0;

  const forceRun = request.nextUrl.searchParams.get('force') === '1';
  const targetYear = request.nextUrl.searchParams.get('year') ? parseInt(request.nextUrl.searchParams.get('year')!) : previousYear;

  if (!isYearStart && !forceRun) {
    return NextResponse.json({ message: 'Year-end cron only runs on Jan 1st. Use ?force=1 to test.', skipped: true });
  }

  let processed = 0;
  let carriedForward = 0;
  let expired = 0;
  let encashed = 0;
  let errors = 0;
  const errorDetails: string[] = [];

  try {
    const platformDb = getPlatformDb();
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
          select: { id: true },
        }).catch(() => []);

        // Get all active leave types
        const leaveTypes = await db.leaveType.findMany({
          where: { status: 'active' },
          select: { id: true, name: true, code: true, isPaid: true, encashmentAllowed: true, encashmentBasis: true },
        }).catch(() => []);

        for (const emp of employees) {
          for (const lt of leaveTypes) {
            try {
              // Skip unpaid/LOP leave types — no year-end processing
              if (!lt.isPaid) continue;

              // Get the current year's balance
              const balance = await db.leaveBalance.findFirst({
                where: { employeeId: emp.id, leaveTypeId: lt.id, year: targetYear },
                select: { id: true, total: true, used: true, remaining: true, carryForward: true },
              }).catch(() => null);

              if (!balance || Number(balance.remaining) <= 0) continue;

              const remaining = Number(balance.remaining);

              // Resolve the applicable policy
              const policy = await resolveLeavePolicy(db, {
                employeeId: emp.id,
                leaveTypeId: lt.id,
              });

              const mode = policy.effective.yearEndProcessingMode || 'carry_forward';
              const maxCF = policy.effective.yearEndMaxCarryForward || 0;
              const maxEncash = policy.effective.yearEndMaxEncashment || 0;

              let carryDays = 0;
              let encashDays = 0;
              let expireDays = 0;

              switch (mode) {
                case 'carry_forward':
                  carryDays = maxCF > 0 ? Math.min(remaining, maxCF) : remaining;
                  expireDays = remaining - carryDays;
                  break;
                case 'expire':
                  expireDays = remaining;
                  break;
                case 'payout_all':
                  encashDays = remaining;
                  break;
                case 'pay_n_carry_rest':
                  encashDays = maxEncash > 0 ? Math.min(remaining, maxEncash) : 0;
                  const restAfterPay = remaining - encashDays;
                  carryDays = maxCF > 0 ? Math.min(restAfterPay, maxCF) : restAfterPay;
                  expireDays = restAfterPay - carryDays;
                  break;
                case 'carry_n_pay_rest':
                  carryDays = maxCF > 0 ? Math.min(remaining, maxCF) : 0;
                  const restAfterCarry = remaining - carryDays;
                  encashDays = maxEncash > 0 ? Math.min(restAfterCarry, maxEncash) : restAfterCarry;
                  expireDays = restAfterCarry - encashDays;
                  break;
              }

              // Apply carry-forward: create a 'carry_forward' ledger entry in the NEW year
              if (carryDays > 0) {
                await appendLedgerEntry(db, {
                  employeeId: emp.id,
                  leaveTypeId: lt.id,
                  year: currentYear, // new year
                  transactionType: 'carry_forward',
                  days: carryDays,
                  sourceType: 'year_end',
                  reason: `Year-end carry-forward from ${targetYear} (${carryDays} day(s))`,
                });
                carriedForward++;
              }

              // Apply encashment: create an encashment request + 'encash' ledger entry
              if (encashDays > 0 && lt.encashmentAllowed) {
                await appendLedgerEntry(db, {
                  employeeId: emp.id,
                  leaveTypeId: lt.id,
                  year: targetYear, // old year
                  transactionType: 'encash',
                  days: -encashDays,
                  sourceType: 'year_end',
                  reason: `Year-end encashment (${encashDays} day(s))`,
                });
                encashed++;
              }

              // Apply expiry: 'expire' ledger entry in the old year
              if (expireDays > 0) {
                await appendLedgerEntry(db, {
                  employeeId: emp.id,
                  leaveTypeId: lt.id,
                  year: targetYear, // old year
                  transactionType: 'expire',
                  days: -expireDays,
                  sourceType: 'year_end',
                  reason: `Year-end expiry (${expireDays} day(s))`,
                });
                expired++;
              }

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
    return NextResponse.json({ error: 'Year-end cron failed', details: e?.message }, { status: 500 });
  }

  return NextResponse.json({
    message: 'Leave year-end processing completed',
    targetYear,
    newYear: currentYear,
    processed,
    carriedForward,
    expired,
    encashed,
    errors,
    errorDetails: errorDetails.length > 0 ? errorDetails : undefined,
    timestamp: now.toISOString(),
  });
}
