/**
 * Leave Ledger Service — immutable transaction history for all leave balance
 * mutations.
 *
 * Every time a leave balance changes (grant, accrue, consume, reverse,
 * carry_forward, expire, encash, manual_adjust), a row is appended to the
 * LeaveLedger table inside a database transaction. This provides a full
 * audit trail and enables reversal of past operations.
 *
 * The LeaveBalance table holds the running totals (total/used/remaining/
 * carryForward). The LeaveLedger table holds the history of how they got
 * there. Together they form a double-entry-style system: the balance is
 * the current state, the ledger is the transaction log.
 *
 * TEST ENVIRONMENT ONLY — operates on the tenant-scoped `db` passed in.
 */
import type { PrismaClient } from '@prisma/client';

export type LedgerTransactionType =
  | 'grant'
  | 'accrue'
  | 'consume'
  | 'reverse'
  | 'carry_forward'
  | 'expire'
  | 'encash'
  | 'manual_adjust';

export interface LedgerEntryInput {
  employeeId: string;
  leaveTypeId: string;
  year: number;
  transactionType: LedgerTransactionType;
  /** Days: positive = credit, negative = debit */
  days: number;
  /** Source type (what caused this transaction) */
  sourceType?: string;
  /** Source ID (the LeaveRequest/EncashmentRequest ID) */
  sourceId?: string;
  reason?: string;
  createdBy?: string;
  leaveRequestId?: string;
}

export interface LedgerEntryResult {
  id: string;
  balanceBefore: number;
  balanceAfter: number;
  days: number;
}

/**
 * Ensure the LeaveLedger table exists on the given DB.
 * Idempotent — safe to call on every request.
 */
export async function ensureLeaveLedgerTable(db: any): Promise<void> {
  try {
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "LeaveLedger" (
        "id" TEXT NOT NULL,
        "employeeId" TEXT NOT NULL,
        "leaveTypeId" TEXT NOT NULL,
        "year" INTEGER NOT NULL,
        "transactionType" TEXT NOT NULL,
        "days" DOUBLE PRECISION NOT NULL,
        "balanceBefore" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "balanceAfter" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "sourceType" TEXT,
        "sourceId" TEXT,
        "reason" TEXT,
        "createdBy" TEXT,
        "leaveRequestId" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
        CONSTRAINT "LeaveLedger_pkey" PRIMARY KEY ("id")
      )
    `);
    await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "LeaveLedger_employeeId_leaveTypeId_year_idx" ON "LeaveLedger"("employeeId", "leaveTypeId", "year")`);
    await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "LeaveLedger_sourceType_sourceId_idx" ON "LeaveLedger"("sourceType", "sourceId")`);
    await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "LeaveLedger_employeeId_idx" ON "LeaveLedger"("employeeId")`);
  } catch {
    /* ignore — table may already exist */
  }
}

/**
 * Ensure the new LeaveType columns exist (calendarColor, halfDayAllowed, documentRequirement)
 * and the new LeaveRequest columns exist (chargeableDays, reversedAt, cancellationReason).
 */
export async function ensureLeaveModuleSchemaColumns(db: any): Promise<void> {
  const statements = [
    `ALTER TABLE "LeaveType" ADD COLUMN IF NOT EXISTS "calendarColor" TEXT`,
    `ALTER TABLE "LeaveType" ADD COLUMN IF NOT EXISTS "halfDayAllowed" BOOLEAN NOT NULL DEFAULT true`,
    `ALTER TABLE "LeaveType" ADD COLUMN IF NOT EXISTS "documentRequirement" TEXT NOT NULL DEFAULT 'never'`,
    `ALTER TABLE "LeaveRequest" ADD COLUMN IF NOT EXISTS "chargeableDays" DOUBLE PRECISION`,
    `ALTER TABLE "LeaveRequest" ADD COLUMN IF NOT EXISTS "reversedAt" TIMESTAMP(3)`,
    `ALTER TABLE "LeaveRequest" ADD COLUMN IF NOT EXISTS "cancellationReason" TEXT`,
    `ALTER TABLE "LeaveTypePolicyMapping" ADD COLUMN IF NOT EXISTS "designationId" TEXT`,
    `ALTER TABLE "LeaveTypePolicyMapping" ADD COLUMN IF NOT EXISTS "effectiveFrom" TIMESTAMP(3)`,
    `ALTER TABLE "LeaveTypePolicyMapping" ADD COLUMN IF NOT EXISTS "effectiveTo" TIMESTAMP(3)`,
  ];
  for (const sql of statements) {
    try { await db.$executeRawUnsafe(sql); } catch { /* ignore */ }
  }
}

/**
 * Append a ledger entry AND update the LeaveBalance running totals in a
 * single atomic operation. MUST be called inside a $transaction for safety.
 *
 * If no LeaveBalance row exists, one is created with the entry as the
 * opening balance.
 *
 * Returns the ledger entry ID + balance before/after.
 */
export async function appendLedgerEntry(
  db: any,
  input: LedgerEntryInput,
): Promise<LedgerEntryResult> {
  await ensureLeaveLedgerTable(db);

  const { employeeId, leaveTypeId, year, transactionType, days, sourceType, sourceId, reason, createdBy, leaveRequestId } = input;

  // Fetch or create the LeaveBalance row
  let balance = await db.leaveBalance.findFirst({
    where: { employeeId, leaveTypeId, year },
    select: { id: true, total: true, used: true, remaining: true, carryForward: true },
  }).catch(() => null);

  // Use raw SQL fallback if Prisma client doesn't have the model cached
  if (!balance) {
    try {
      const rows: any[] = await db.$queryRawUnsafe(
        `SELECT "id", "total", "used", "remaining", "carryForward" FROM "LeaveBalance" WHERE "employeeId" = $1 AND "leaveTypeId" = $2 AND "year" = $3 LIMIT 1`,
        employeeId, leaveTypeId, year,
      );
      if (rows && rows.length > 0) balance = rows[0];
    } catch { /* ignore */ }
  }

  const balanceBefore = balance ? Number(balance.remaining) : 0;
  const totalBefore = balance ? Number(balance.total) : 0;
  const usedBefore = balance ? Number(balance.used) : 0;

  // Compute new totals based on transaction type
  let newRemaining = balanceBefore;
  let newUsed = usedBefore;
  let newTotal = totalBefore;

  if (transactionType === 'grant' || transactionType === 'accrue' || transactionType === 'carry_forward') {
    // Credit: increases total + remaining
    newTotal = totalBefore + days;
    newRemaining = balanceBefore + days;
  } else if (transactionType === 'consume' || transactionType === 'expire' || transactionType === 'encash') {
    // Debit: increases used, decreases remaining
    newUsed = usedBefore + Math.abs(days);
    newRemaining = balanceBefore - Math.abs(days);
  } else if (transactionType === 'reverse') {
    // Reverse a previous consumption: decreases used, increases remaining
    newUsed = Math.max(0, usedBefore - Math.abs(days));
    newRemaining = balanceBefore + Math.abs(days);
  } else if (transactionType === 'manual_adjust') {
    // Manual adjustment: days can be positive or negative
    if (days > 0) {
      newTotal = totalBefore + days;
      newRemaining = balanceBefore + days;
    } else {
      newUsed = usedBefore + Math.abs(days);
      newRemaining = balanceBefore + days;
    }
  }

  const balanceAfter = newRemaining;
  const ledgerId = `ll_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  // Insert the ledger entry via raw SQL (table may not be in Prisma client cache)
  await db.$executeRawUnsafe(
    `INSERT INTO "LeaveLedger" ("id", "employeeId", "leaveTypeId", "year", "transactionType", "days", "balanceBefore", "balanceAfter", "sourceType", "sourceId", "reason", "createdBy", "leaveRequestId", "createdAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())`,
    ledgerId, employeeId, leaveTypeId, year, transactionType, days,
    balanceBefore, balanceAfter,
    sourceType || null, sourceId || null, reason || null, createdBy || null, leaveRequestId || null,
  );

  // Update or create the LeaveBalance row
  if (balance) {
    await db.leaveBalance.update({
      where: { id: balance.id },
      data: {
        total: newTotal,
        used: newUsed,
        remaining: newRemaining,
      },
    }).catch(async () => {
      // Fallback to raw SQL if Prisma client doesn't have the model
      await db.$executeRawUnsafe(
        `UPDATE "LeaveBalance" SET "total" = $1, "used" = $2, "remaining" = $3, "updatedAt" = NOW() WHERE "id" = $4`,
        newTotal, newUsed, newRemaining, balance.id,
      ).catch(() => {});
    });
  } else {
    // Create a new LeaveBalance row
    try {
      await db.leaveBalance.create({
        data: {
          employeeId, leaveTypeId, year,
          total: newTotal, used: newUsed, remaining: newRemaining,
          carryForward: transactionType === 'carry_forward' ? days : 0,
        },
      });
    } catch {
      // Fallback to raw SQL
      const newBalanceId = `lb_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      await db.$executeRawUnsafe(
        `INSERT INTO "LeaveBalance" ("id", "employeeId", "leaveTypeId", "year", "total", "used", "remaining", "carryForward", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
        newBalanceId, employeeId, leaveTypeId, year, newTotal, newUsed, newRemaining,
        transactionType === 'carry_forward' ? days : 0,
      ).catch(() => {});
    }
  }

  return { id: ledgerId, balanceBefore, balanceAfter, days };
}

/**
 * Get the ledger history for an employee + leave type + year.
 * Returns entries ordered by createdAt DESC.
 */
export async function getLedgerHistory(
  db: any,
  params: { employeeId: string; leaveTypeId?: string; year?: number; limit?: number },
): Promise<any[]> {
  await ensureLeaveLedgerTable(db);
  const { employeeId, leaveTypeId, year, limit = 100 } = params;

  let sql = `SELECT * FROM "LeaveLedger" WHERE "employeeId" = $1`;
  const vals: any[] = [employeeId];
  let pIdx = 2;
  if (leaveTypeId) { sql += ` AND "leaveTypeId" = $${pIdx++}`; vals.push(leaveTypeId); }
  if (year) { sql += ` AND "year" = $${pIdx++}`; vals.push(year); }
  sql += ` ORDER BY "createdAt" DESC LIMIT $${pIdx}`;
  vals.push(limit);

  try {
    return await db.$queryRawUnsafe(sql, ...vals);
  } catch {
    return [];
  }
}

/**
 * Initialize leave balance for a new employee based on the resolved policy's
 * opening balance. Called on employee creation.
 */
export async function initializeEmployeeLeaveBalance(
  db: any,
  params: { employeeId: string; leaveTypeId: string; year: number; openingBalance: number; createdBy?: string },
): Promise<void> {
  if (params.openingBalance <= 0) return;
  await appendLedgerEntry(db, {
    employeeId: params.employeeId,
    leaveTypeId: params.leaveTypeId,
    year: params.year,
    transactionType: 'grant',
    days: params.openingBalance,
    sourceType: 'employee_creation',
    reason: 'Initial leave grant on employee creation',
    createdBy: params.createdBy,
  });
}
