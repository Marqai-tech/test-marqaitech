/**
 * Leave Setup Schema — runtime column/table ensure for spec + CR-03.
 * Additive ALTER TABLE ... ADD COLUMN IF NOT EXISTS + CREATE TABLE IF NOT EXISTS.
 * Safe to call on every request. No data loss.
 */
type RawExec = (sql: string) => Promise<unknown>;

const LEAVE_TYPE_COLS = [
  `ALTER TABLE "LeaveType" ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT 'paid'`,
  `ALTER TABLE "LeaveType" ADD COLUMN IF NOT EXISTS "smallestUnit" TEXT NOT NULL DEFAULT 'full_day'`,
  `ALTER TABLE "LeaveType" ADD COLUMN IF NOT EXISTS "displayOrder" INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE "LeaveType" ADD COLUMN IF NOT EXISTS "calendarColor" TEXT`,
  `ALTER TABLE "LeaveType" ADD COLUMN IF NOT EXISTS "halfDayAllowed" BOOLEAN NOT NULL DEFAULT true`,
  `ALTER TABLE "LeaveType" ADD COLUMN IF NOT EXISTS "documentRequirement" TEXT NOT NULL DEFAULT 'never'`,
];
const RULE_COLS = [
  `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "gender" TEXT NOT NULL DEFAULT 'both'`,
  `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "specificEmployeeIds" TEXT`,
  `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "onlyTheseEmployees" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "entitledDaysPerYear" DOUBLE PRECISION NOT NULL DEFAULT 0`,
  `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "advanceNoticeDays" INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "minDaysPerRequest" DOUBLE PRECISION NOT NULL DEFAULT 0.5`,
  `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "maxDaysPerRequest" DOUBLE PRECISION NOT NULL DEFAULT 0`,
  `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "carryForwardToNextYear" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "leaveEncashmentApplicable" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "leaveTypeId" TEXT`,
  `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "ruleCode" TEXT`,
];
const ADJUSTMENT_DDL = `
CREATE TABLE IF NOT EXISTS "LeaveAdjustment" (
  "id" TEXT NOT NULL, "employeeId" TEXT NOT NULL, "leaveTypeId" TEXT NOT NULL,
  "leaveRequestId" TEXT, "shortfallDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "modeA" BOOLEAN NOT NULL DEFAULT false, "modeADays" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "modeB" BOOLEAN NOT NULL DEFAULT false, "modeBDonorTypeId" TEXT, "modeBDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'pending', "managerApproverId" TEXT, "managerApprovedAt" TIMESTAMP(3),
  "managerRemarks" TEXT, "hrApproverId" TEXT, "hrApprovedAt" TIMESTAMP(3), "hrRemarks" TEXT, "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "LeaveAdjustmentLedger" (
  "id" TEXT NOT NULL, "adjustmentId" TEXT NOT NULL, "employeeId" TEXT NOT NULL,
  "leaveTypeId" TEXT NOT NULL, "entryType" TEXT NOT NULL, "days" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "year" INTEGER NOT NULL DEFAULT 0, "reversalOfId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "LeaveAdjustment_emp_idx" ON "LeaveAdjustment"("employeeId");
CREATE INDEX IF NOT EXISTS "LeaveAdjustment_status_idx" ON "LeaveAdjustment"("status");
CREATE INDEX IF NOT EXISTS "LeaveAdjustmentLedger_adj_idx" ON "LeaveAdjustmentLedger"("adjustmentId");
`;

export async function ensureLeaveSetupSchema(exec: RawExec): Promise<void> {
  for (const sql of [...LEAVE_TYPE_COLS, ...RULE_COLS]) { try { await exec(sql); } catch {} }
  for (const stmt of ADJUSTMENT_DDL.split(';').map(s => s.trim()).filter(Boolean)) { try { await exec(stmt + ';'); } catch {} }
}

export function withLeaveSetupSync(handler: Function): Function {
  return async function (req: Request, ...args: any[]) {
    try {
      const { getDb } = await import('@/lib/tenant-db');
      const db: any = await getDb(req);
      await ensureLeaveSetupSchema((sql: string) => db.$executeRawUnsafe(sql));
    } catch {}
    return handler(req, ...args);
  };
}
