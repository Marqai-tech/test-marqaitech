/**
 * Leave Configuration — centralized runtime schema sync.
 *
 * WHY: the project follows a runtime-DDL pattern (ALTER TABLE IF NOT EXISTS)
 * for tenant DBs that may not have been migrated yet. Previously each leave
 * API route ran its own scattered ALTER blocks. This module is the single
 * source of truth for the Leave Configuration schema.
 *
 * WHAT IT DOES:
 *  - Adds the extended LeavePolicyRule columns (quota/accrual/restrictions/
 *    year-end/encashment/audit) if they don't exist.
 *  - Adds createdBy/updatedBy to LeaveType.
 *  - Creates the LeaveTypePolicyMapping + LeaveCarryForwardRule tables.
 *
 * SAFETY: every statement is IF NOT EXISTS / ADD COLUMN IF NOT EXISTS, so
 * calling this on an already-migrated DB is a no-op. Wrapped in try/catch
 * per-statement so one failure doesn't block the rest. Idempotent.
 *
 * TEST-ENVIRONMENT ONLY: invoked from API routes that use the tenant-scoped
 * `getDb(request)` connection, so this only ever touches the test tenant DB.
 */
import type { PrismaClient } from '@prisma/client';

const LEAVE_POLICY_RULE_COLUMNS: string[] = [
  // Description
  `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "description" TEXT`,
  // Quota & Accrual
  `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "annualQuota" INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "accrualFrequency" TEXT NOT NULL DEFAULT 'yearly'`,
  `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "accrualAmount" DOUBLE PRECISION NOT NULL DEFAULT 0`,
  `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "maxBalance" DOUBLE PRECISION NOT NULL DEFAULT 0`,
  `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "openingBalance" DOUBLE PRECISION NOT NULL DEFAULT 0`,
  `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "prorateNewJoiners" BOOLEAN NOT NULL DEFAULT true`,
  `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "accrualStartDate" TEXT`,
  // Leave Restrictions
  `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "minAdvanceNotice" INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "maxFutureDays" INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "backdatedAllowed" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "backdatedMaxDays" INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "minConsecutiveDays" INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "maxConsecutiveDays" INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "halfDayEligible" BOOLEAN NOT NULL DEFAULT true`,
  `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "requireAttachment" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "requireAttachmentAfterDays" INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "overlappingLeaveAllowed" BOOLEAN NOT NULL DEFAULT false`,
  // Applicability (extended) — some may already exist from prior DDL
  `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "genderApplicability" TEXT NOT NULL DEFAULT 'all'`,
  `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "employeeIds" TEXT`,
  `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "effectiveFromDate" TIMESTAMP(3)`,
  `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "effectiveToDate" TIMESTAMP(3)`,
  // Year-End Processing
  `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "yearEndProcessingMode" TEXT NOT NULL DEFAULT 'carry_forward'`,
  `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "yearEndMaxCarryForward" INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "yearEndMaxEncashment" INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "yearEndExpiryDays" INTEGER NOT NULL DEFAULT 0`,
  // Encashment details (per-policy)
  `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "encashmentBasis" TEXT NOT NULL DEFAULT 'basic'`,
  `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "encashmentMaxDays" INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "encashmentAutoYearEnd" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "encashmentEmployeeInitiated" BOOLEAN NOT NULL DEFAULT true`,
  // Audit
  `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "createdBy" TEXT`,
  `ALTER TABLE "LeavePolicyRule" ADD COLUMN IF NOT EXISTS "updatedBy" TEXT`,
];

const LEAVE_TYPE_COLUMNS: string[] = [
  `ALTER TABLE "LeaveType" ADD COLUMN IF NOT EXISTS "createdBy" TEXT`,
  `ALTER TABLE "LeaveType" ADD COLUMN IF NOT EXISTS "updatedBy" TEXT`,
];

const LEAVE_TYPE_POLICY_MAPPING_DDL = `
CREATE TABLE IF NOT EXISTS "LeaveTypePolicyMapping" (
  "id" TEXT NOT NULL,
  "leaveTypeId" TEXT NOT NULL,
  "policyRuleId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 50,
  "branchId" TEXT,
  "departmentId" TEXT,
  "employmentType" TEXT NOT NULL DEFAULT 'all',
  "genderApplicability" TEXT NOT NULL DEFAULT 'all',
  "employeeIds" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdBy" TEXT,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeaveTypePolicyMapping_pkey" PRIMARY KEY ("id")
)`;

const LEAVE_TYPE_POLICY_MAPPING_INDEXES = [
  `CREATE UNIQUE INDEX IF NOT EXISTS "LeaveTypePolicyMapping_leaveTypeId_policyRuleId_companyId_key" ON "LeaveTypePolicyMapping"("leaveTypeId", "policyRuleId", "companyId")`,
  `CREATE INDEX IF NOT EXISTS "LeaveTypePolicyMapping_leaveTypeId_idx" ON "LeaveTypePolicyMapping"("leaveTypeId")`,
  `CREATE INDEX IF NOT EXISTS "LeaveTypePolicyMapping_policyRuleId_idx" ON "LeaveTypePolicyMapping"("policyRuleId")`,
  `CREATE INDEX IF NOT EXISTS "LeaveTypePolicyMapping_companyId_idx" ON "LeaveTypePolicyMapping"("companyId")`,
];

const LEAVE_CARRY_FORWARD_RULE_DDL = `
CREATE TABLE IF NOT EXISTS "LeaveCarryForwardRule" (
  "id" TEXT NOT NULL,
  "policyRuleId" TEXT NOT NULL,
  "leaveTypeId" TEXT,
  "conditionField" TEXT NOT NULL DEFAULT 'balance',
  "conditionOperator" TEXT NOT NULL DEFAULT 'gte',
  "conditionValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "carryForwardDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "encashmentDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "remainingTreatment" TEXT NOT NULL DEFAULT 'expire',
  "priority" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdBy" TEXT,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeaveCarryForwardRule_pkey" PRIMARY KEY ("id")
)`;

const LEAVE_CARRY_FORWARD_RULE_INDEXES = [
  `CREATE INDEX IF NOT EXISTS "LeaveCarryForwardRule_policyRuleId_idx" ON "LeaveCarryForwardRule"("policyRuleId")`,
  `CREATE INDEX IF NOT EXISTS "LeaveCarryForwardRule_leaveTypeId_idx" ON "LeaveCarryForwardRule"("leaveTypeId")`,
];

let _synced = new WeakSet<PrismaClient>();

/**
 * Ensure the Leave Configuration schema exists on the given tenant DB.
 * Idempotent — skips if already synced for this client instance.
 * Safe to call on every request (cheap no-op after first run).
 */
export async function syncLeaveConfigSchema(db: any): Promise<void> {
  if (!db || _synced.has(db)) return;
  const statements = [
    ...LEAVE_POLICY_RULE_COLUMNS,
    ...LEAVE_TYPE_COLUMNS,
    LEAVE_TYPE_POLICY_MAPPING_DDL,
    ...LEAVE_TYPE_POLICY_MAPPING_INDEXES,
    LEAVE_CARRY_FORWARD_RULE_DDL,
    ...LEAVE_CARRY_FORWARD_RULE_INDEXES,
  ];
  for (const sql of statements) {
    try {
      await db.$executeRawUnsafe(sql);
    } catch {
      // ignore — column/index/table already exists or DDL not supported
    }
  }
  _synced.add(db);
}

/**
 * Force re-sync (for admin "refresh schema" actions). Bypasses the cache.
 */
export async function forceSyncLeaveConfigSchema(db: any): Promise<{ applied: number; failed: number }> {
  let applied = 0;
  let failed = 0;
  const statements = [
    ...LEAVE_POLICY_RULE_COLUMNS,
    ...LEAVE_TYPE_COLUMNS,
    LEAVE_TYPE_POLICY_MAPPING_DDL,
    ...LEAVE_TYPE_POLICY_MAPPING_INDEXES,
    LEAVE_CARRY_FORWARD_RULE_DDL,
    ...LEAVE_CARRY_FORWARD_RULE_INDEXES,
  ];
  for (const sql of statements) {
    try {
      await db.$executeRawUnsafe(sql);
      applied++;
    } catch {
      failed++;
    }
  }
  return { applied, failed };
}
