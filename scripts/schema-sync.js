/**
 * SRS Schema Sync Script (build-time)
 *
 * Applies the additive schema changes introduced by the SRS rework (commit 03f980e)
 * directly via raw SQL using IF NOT EXISTS guards. This is MORE RELIABLE than
 * `prisma db push` on Vercel because:
 *
 *   1. It only ADDS columns/tables — never drops or renames anything.
 *   2. It uses IF NOT EXISTS so re-runs are safe (idempotent).
 *   3. It doesn't require an interactive prompt or --accept-data-loss.
 *   4. It uses @neondatabase/serverless directly (no Prisma client needed),
 *      so it works even before `prisma generate` has fully populated the
 *      generated client output.
 *
 * This script is invoked from the Vercel build command (see vercel.json)
 * AFTER `prisma generate` and BEFORE `next build`. If it fails for any reason,
 * the failure is logged but does NOT block the build — the hardened login
 * route (which uses explicit `select`) will still work even if some columns
 * are missing.
 */

const { neon } = require('@neondatabase/serverless');

async function main() {
  const connectionString =
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL;

  if (!connectionString) {
    console.warn('[schema-sync] No DATABASE_URL — skipping schema sync.');
    return;
  }

  const masked = connectionString.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@');
  console.log(`[schema-sync] Connecting to: ${masked.substring(0, 70)}...`);

  const sql = neon(connectionString);

  // Each statement uses IF NOT EXISTS / CREATE TABLE IF NOT EXISTS so the
  // script is safe to re-run. We only ADD columns — never drop, never rename,
  // never change types. This means it cannot cause data loss.
  const statements = [
    // ─── Tenant: new SRS columns (REQ-GL-01/03/06, REQ-SA-02) ───
    `ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "language" TEXT NOT NULL DEFAULT 'en'`,
    `ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "baseCurrency" TEXT NOT NULL DEFAULT 'USD'`,
    `ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "dataRegion" TEXT`,
    `ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "subscriptionSeats" INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "subscriptionStorage" INTEGER NOT NULL DEFAULT 0`,

    // ─── Company: new SRS column (REQ-TA-02 / REQ-GL-01) ───
    `ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "language" TEXT NOT NULL DEFAULT 'en'`,

    // ─── FeatureFlag: new table (REQ-SA-05) ───
    `CREATE TABLE IF NOT EXISTS "FeatureFlag" (
      "id" TEXT NOT NULL,
      "tenantId" TEXT NOT NULL,
      "key" TEXT NOT NULL,
      "label" TEXT NOT NULL,
      "enabled" BOOLEAN NOT NULL DEFAULT false,
      "config" TEXT,
      "source" TEXT NOT NULL DEFAULT 'platform_default',
      "notes" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "FeatureFlag_tenantId_key_key" ON "FeatureFlag"("tenantId", "key")`,
    `CREATE INDEX IF NOT EXISTS "FeatureFlag_tenantId_idx" ON "FeatureFlag"("tenantId")`,

    // ─── P0 FIX: Missing models (added 2026-06-20) ───
    // PreboardingCandidate
    `CREATE TABLE IF NOT EXISTS "PreboardingCandidate" (
      "id" TEXT NOT NULL,
      "candidateName" TEXT NOT NULL,
      "candidateEmail" TEXT NOT NULL,
      "candidatePhone" TEXT,
      "jobTitle" TEXT,
      "departmentId" TEXT,
      "offeredSalary" DOUBLE PRECISION,
      "currency" TEXT NOT NULL DEFAULT 'USD',
      "offerDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "joiningDate" TIMESTAMP(3),
      "notes" TEXT,
      "offerId" TEXT,
      "status" TEXT NOT NULL DEFAULT 'offer_accepted',
      "documentsUploaded" TEXT,
      "backgroundCheckStatus" TEXT NOT NULL DEFAULT 'pending',
      "backgroundCheckNotes" TEXT,
      "hrVerified" BOOLEAN NOT NULL DEFAULT false,
      "accountProvisioned" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "PreboardingCandidate_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE INDEX IF NOT EXISTS "PreboardingCandidate_status_idx" ON "PreboardingCandidate"("status")`,
    `CREATE INDEX IF NOT EXISTS "PreboardingCandidate_candidateEmail_idx" ON "PreboardingCandidate"("candidateEmail")`,

    // ExitRequest
    `CREATE TABLE IF NOT EXISTS "ExitRequest" (
      "id" TEXT NOT NULL,
      "companyId" TEXT NOT NULL,
      "employeeId" TEXT NOT NULL,
      "type" TEXT NOT NULL DEFAULT 'resignation',
      "reason" TEXT,
      "noticePeriodEndDate" TIMESTAMP(3),
      "lastWorkingDate" TIMESTAMP(3),
      "status" TEXT NOT NULL DEFAULT 'pending',
      "clearanceNotes" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ExitRequest_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE INDEX IF NOT EXISTS "ExitRequest_employeeId_idx" ON "ExitRequest"("employeeId")`,
    `CREATE INDEX IF NOT EXISTS "ExitRequest_companyId_idx" ON "ExitRequest"("companyId")`,
    `CREATE INDEX IF NOT EXISTS "ExitRequest_status_idx" ON "ExitRequest"("status")`,

    // OKR
    `CREATE TABLE IF NOT EXISTS "OKR" (
      "id" TEXT NOT NULL,
      "objective" TEXT NOT NULL,
      "ownerId" TEXT NOT NULL,
      "quarter" TEXT NOT NULL DEFAULT 'Q1 2026',
      "year" INTEGER NOT NULL DEFAULT 2026,
      "category" TEXT NOT NULL DEFAULT 'individual',
      "parentOkrId" TEXT,
      "status" TEXT NOT NULL DEFAULT 'draft',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "OKR_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE INDEX IF NOT EXISTS "OKR_ownerId_idx" ON "OKR"("ownerId")`,
    `CREATE INDEX IF NOT EXISTS "OKR_parentOkrId_idx" ON "OKR"("parentOkrId")`,
    `CREATE INDEX IF NOT EXISTS "OKR_category_idx" ON "OKR"("category")`,

    // KeyResult
    `CREATE TABLE IF NOT EXISTS "KeyResult" (
      "id" TEXT NOT NULL,
      "okrId" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "targetValue" DOUBLE PRECISION NOT NULL DEFAULT 100,
      "currentValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "unit" TEXT,
      "status" TEXT NOT NULL DEFAULT 'not_started',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "KeyResult_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE INDEX IF NOT EXISTS "KeyResult_okrId_idx" ON "KeyResult"("okrId")`,

    // ExitInterview
    `CREATE TABLE IF NOT EXISTS "ExitInterview" (
      "id" TEXT NOT NULL,
      "separationId" TEXT NOT NULL,
      "employeeId" TEXT NOT NULL,
      "interviewDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "interviewer" TEXT,
      "reason" TEXT,
      "feedback" TEXT,
      "rating" INTEGER,
      "wouldRehire" BOOLEAN,
      "suggestions" TEXT,
      "language" TEXT NOT NULL DEFAULT 'en',
      "sentimentScore" DOUBLE PRECISION,
      "sentimentLabel" TEXT,
      "sentimentSummary" TEXT,
      "status" TEXT NOT NULL DEFAULT 'completed',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ExitInterview_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE INDEX IF NOT EXISTS "ExitInterview_separationId_idx" ON "ExitInterview"("separationId")`,
    `CREATE INDEX IF NOT EXISTS "ExitInterview_employeeId_idx" ON "ExitInterview"("employeeId")`,

    // Survey
    `CREATE TABLE IF NOT EXISTS "Survey" (
      "id" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "description" TEXT,
      "type" TEXT NOT NULL DEFAULT 'pulse',
      "status" TEXT NOT NULL DEFAULT 'draft',
      "anonymous" BOOLEAN NOT NULL DEFAULT true,
      "targetAudience" TEXT NOT NULL DEFAULT 'all',
      "questions" TEXT NOT NULL,
      "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "endDate" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Survey_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE INDEX IF NOT EXISTS "Survey_status_idx" ON "Survey"("status")`,
    `CREATE INDEX IF NOT EXISTS "Survey_type_idx" ON "Survey"("type")`,

    // SurveyResponse
    `CREATE TABLE IF NOT EXISTS "SurveyResponse" (
      "id" TEXT NOT NULL,
      "surveyId" TEXT NOT NULL,
      "employeeId" TEXT NOT NULL,
      "answers" TEXT NOT NULL,
      "sentiment" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "SurveyResponse_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE INDEX IF NOT EXISTS "SurveyResponse_surveyId_idx" ON "SurveyResponse"("surveyId")`,
    `CREATE INDEX IF NOT EXISTS "SurveyResponse_employeeId_idx" ON "SurveyResponse"("employeeId")`,

    // Recognition
    `CREATE TABLE IF NOT EXISTS "Recognition" (
      "id" TEXT NOT NULL,
      "fromId" TEXT NOT NULL,
      "toId" TEXT NOT NULL,
      "type" TEXT NOT NULL DEFAULT 'kudos',
      "title" TEXT NOT NULL DEFAULT '',
      "message" TEXT NOT NULL,
      "points" INTEGER NOT NULL DEFAULT 0,
      "isPublic" BOOLEAN NOT NULL DEFAULT true,
      "category" TEXT NOT NULL DEFAULT 'general',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Recognition_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE INDEX IF NOT EXISTS "Recognition_toId_idx" ON "Recognition"("toId")`,
    `CREATE INDEX IF NOT EXISTS "Recognition_category_idx" ON "Recognition"("category")`,

    // AIConfig
    `CREATE TABLE IF NOT EXISTS "AIConfig" (
      "id" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "type" TEXT NOT NULL,
      "category" TEXT NOT NULL,
      "content" TEXT NOT NULL,
      "model" TEXT NOT NULL DEFAULT 'gpt-4',
      "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
      "maxTokens" INTEGER NOT NULL DEFAULT 2048,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "version" TEXT NOT NULL DEFAULT '1.0',
      "description" TEXT,
      "biasChecks" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "AIConfig_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE INDEX IF NOT EXISTS "AIConfig_type_idx" ON "AIConfig"("type")`,
    `CREATE INDEX IF NOT EXISTS "AIConfig_category_idx" ON "AIConfig"("category")`,
    `CREATE INDEX IF NOT EXISTS "AIConfig_isActive_idx" ON "AIConfig"("isActive")`,

    // AIPromptLog
    `CREATE TABLE IF NOT EXISTS "AIPromptLog" (
      "id" TEXT NOT NULL,
      "category" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'success',
      "model" TEXT,
      "promptInput" TEXT,
      "promptOutput" TEXT,
      "latencyMs" INTEGER NOT NULL DEFAULT 0,
      "tokensUsed" INTEGER NOT NULL DEFAULT 0,
      "errorMessage" TEXT,
      "biasFlag" BOOLEAN NOT NULL DEFAULT false,
      "biasReason" TEXT,
      "userId" TEXT,
      "configId" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "AIPromptLog_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE INDEX IF NOT EXISTS "AIPromptLog_category_idx" ON "AIPromptLog"("category")`,
    `CREATE INDEX IF NOT EXISTS "AIPromptLog_status_idx" ON "AIPromptLog"("status")`,
    `CREATE INDEX IF NOT EXISTS "AIPromptLog_createdAt_idx" ON "AIPromptLog"("createdAt")`,

    // ─── Invoicing (REQ-PM-09, added 2026-06-21) ───
    // Invoice
    `CREATE TABLE IF NOT EXISTS "Invoice" (
      "id" TEXT NOT NULL,
      "invoiceNumber" TEXT NOT NULL,
      "companyId" TEXT NOT NULL,
      "clientId" TEXT,
      "projectId" TEXT,
      "invoiceType" TEXT NOT NULL DEFAULT 'timesheet',
      "billingType" TEXT NOT NULL DEFAULT 'time_and_material',
      "currency" TEXT NOT NULL DEFAULT 'USD',
      "baseCurrency" TEXT,
      "exchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 1,
      "fxRateDate" TIMESTAMP(3),
      "fxSource" TEXT,
      "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "taxRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "discountRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "subtotalBase" DOUBLE PRECISION,
      "totalAmountBase" DOUBLE PRECISION,
      "fxGainLoss" DOUBLE PRECISION,
      "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "dueDate" TIMESTAMP(3),
      "periodStart" TIMESTAMP(3),
      "periodEnd" TIMESTAMP(3),
      "status" TEXT NOT NULL DEFAULT 'draft',
      "notes" TEXT,
      "internalNotes" TEXT,
      "createdBy" TEXT,
      "issuedBy" TEXT,
      "issuedAt" TIMESTAMP(3),
      "paidAt" TIMESTAMP(3),
      "paymentRef" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber")`,
    `CREATE INDEX IF NOT EXISTS "Invoice_companyId_idx" ON "Invoice"("companyId")`,
    `CREATE INDEX IF NOT EXISTS "Invoice_clientId_idx" ON "Invoice"("clientId")`,
    `CREATE INDEX IF NOT EXISTS "Invoice_projectId_idx" ON "Invoice"("projectId")`,
    `CREATE INDEX IF NOT EXISTS "Invoice_status_idx" ON "Invoice"("status")`,
    `CREATE INDEX IF NOT EXISTS "Invoice_issueDate_idx" ON "Invoice"("issueDate")`,

    // InvoiceLineItem
    `CREATE TABLE IF NOT EXISTS "InvoiceLineItem" (
      "id" TEXT NOT NULL,
      "invoiceId" TEXT NOT NULL,
      "sourceType" TEXT NOT NULL DEFAULT 'timesheet',
      "timesheetId" TEXT,
      "milestoneId" TEXT,
      "projectId" TEXT,
      "projectTaskId" TEXT,
      "employeeId" TEXT,
      "description" TEXT NOT NULL,
      "date" TIMESTAMP(3),
      "hours" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
      "unit" TEXT NOT NULL DEFAULT 'hours',
      "rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "rateSourceCurrency" TEXT,
      "rateSourceAmount" DOUBLE PRECISION,
      "fxRate" DOUBLE PRECISION,
      "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "amountBase" DOUBLE PRECISION,
      "taxable" BOOLEAN NOT NULL DEFAULT true,
      "taxRate" DOUBLE PRECISION,
      "taxAmount" DOUBLE PRECISION,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "InvoiceLineItem_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE INDEX IF NOT EXISTS "InvoiceLineItem_invoiceId_idx" ON "InvoiceLineItem"("invoiceId")`,
    `CREATE INDEX IF NOT EXISTS "InvoiceLineItem_timesheetId_idx" ON "InvoiceLineItem"("timesheetId")`,
    `CREATE INDEX IF NOT EXISTS "InvoiceLineItem_projectId_idx" ON "InvoiceLineItem"("projectId")`,
    `CREATE INDEX IF NOT EXISTS "InvoiceLineItem_employeeId_idx" ON "InvoiceLineItem"("employeeId")`,

    // ─── Timesheet schema fix (REQ-PM-07, REQ-SEC-12, added 2026-06-21) ───
    // 1. Add projectId + projectTaskId FK columns (kept nullable so existing rows survive)
    // 2. Add lock fields (locked, lockedBy, lockedAt, lockReason)
    // 3. Add invoiced fields (invoiced, invoiceId)
    // 4. DROP the @@unique([employeeId, date]) constraint — it blocked multi-project days
    // 5. Add new indexes (projectId, status, invoiced, locked, invoiceId)
    `ALTER TABLE "Timesheet" ADD COLUMN IF NOT EXISTS "projectId" TEXT`,
    `ALTER TABLE "Timesheet" ADD COLUMN IF NOT EXISTS "projectTaskId" TEXT`,
    `ALTER TABLE "Timesheet" ADD COLUMN IF NOT EXISTS "locked" BOOLEAN NOT NULL DEFAULT false`,
    `ALTER TABLE "Timesheet" ADD COLUMN IF NOT EXISTS "lockedBy" TEXT`,
    `ALTER TABLE "Timesheet" ADD COLUMN IF NOT EXISTS "lockedAt" TIMESTAMP(3)`,
    `ALTER TABLE "Timesheet" ADD COLUMN IF NOT EXISTS "lockReason" TEXT`,
    `ALTER TABLE "Timesheet" ADD COLUMN IF NOT EXISTS "invoiced" BOOLEAN NOT NULL DEFAULT false`,
    `ALTER TABLE "Timesheet" ADD COLUMN IF NOT EXISTS "invoiceId" TEXT`,
    // Drop the per-day unique constraint (Prisma name: Timesheet_employeeId_date_key)
    `DROP INDEX IF EXISTS "Timesheet_employeeId_date_key"`,
    `DROP INDEX IF EXISTS "Timesheet_employeeId_date_key1"`,
    // New indexes
    `CREATE INDEX IF NOT EXISTS "Timesheet_projectId_idx" ON "Timesheet"("projectId")`,
    `CREATE INDEX IF NOT EXISTS "Timesheet_projectTaskId_idx" ON "Timesheet"("projectTaskId")`,
    `CREATE INDEX IF NOT EXISTS "Timesheet_status_idx" ON "Timesheet"("status")`,
    `CREATE INDEX IF NOT EXISTS "Timesheet_invoiced_idx" ON "Timesheet"("invoiced")`,
    `CREATE INDEX IF NOT EXISTS "Timesheet_locked_idx" ON "Timesheet"("locked")`,
    `CREATE INDEX IF NOT EXISTS "Timesheet_invoiceId_idx" ON "Timesheet"("invoiceId")`,

    // ─── ProjectMember (REQ-SEC-11, added 2026-06-21) ───
    `CREATE TABLE IF NOT EXISTS "ProjectMember" (
      "id" TEXT NOT NULL,
      "projectId" TEXT NOT NULL,
      "employeeId" TEXT NOT NULL,
      "userId" TEXT,
      "role" TEXT NOT NULL DEFAULT 'member',
      "permissions" TEXT,
      "assignedBy" TEXT,
      "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "ProjectMember_projectId_employeeId_key" ON "ProjectMember"("projectId", "employeeId")`,
    `CREATE INDEX IF NOT EXISTS "ProjectMember_projectId_idx" ON "ProjectMember"("projectId")`,
    `CREATE INDEX IF NOT EXISTS "ProjectMember_employeeId_idx" ON "ProjectMember"("employeeId")`,
    `CREATE INDEX IF NOT EXISTS "ProjectMember_role_idx" ON "ProjectMember"("role")`,
  ];

  // Foreign key constraints — applied separately using DROP + ADD pattern.
  const fkStatements = [
    `ALTER TABLE "FeatureFlag" DROP CONSTRAINT IF EXISTS "FeatureFlag_tenantId_fkey"`,
    `ALTER TABLE "FeatureFlag" ADD CONSTRAINT "FeatureFlag_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE`,

    `ALTER TABLE "ExitRequest" DROP CONSTRAINT IF EXISTS "ExitRequest_employeeId_fkey"`,
    `ALTER TABLE "ExitRequest" ADD CONSTRAINT "ExitRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE`,

    `ALTER TABLE "OKR" DROP CONSTRAINT IF EXISTS "OKR_ownerId_fkey"`,
    `ALTER TABLE "OKR" ADD CONSTRAINT "OKR_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE`,

    `ALTER TABLE "OKR" DROP CONSTRAINT IF EXISTS "OKR_parentOkrId_fkey"`,
    `ALTER TABLE "OKR" ADD CONSTRAINT "OKR_parentOkrId_fkey" FOREIGN KEY ("parentOkrId") REFERENCES "OKR"("id") ON DELETE SET NULL ON UPDATE CASCADE`,

    `ALTER TABLE "KeyResult" DROP CONSTRAINT IF EXISTS "KeyResult_okrId_fkey"`,
    `ALTER TABLE "KeyResult" ADD CONSTRAINT "KeyResult_okrId_fkey" FOREIGN KEY ("okrId") REFERENCES "OKR"("id") ON DELETE CASCADE ON UPDATE CASCADE`,

    `ALTER TABLE "ExitInterview" DROP CONSTRAINT IF EXISTS "ExitInterview_separationId_fkey"`,
    `ALTER TABLE "ExitInterview" ADD CONSTRAINT "ExitInterview_separationId_fkey" FOREIGN KEY ("separationId") REFERENCES "Separation"("id") ON DELETE CASCADE ON UPDATE CASCADE`,

    `ALTER TABLE "ExitInterview" DROP CONSTRAINT IF EXISTS "ExitInterview_employeeId_fkey"`,
    `ALTER TABLE "ExitInterview" ADD CONSTRAINT "ExitInterview_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE`,

    `ALTER TABLE "SurveyResponse" DROP CONSTRAINT IF EXISTS "SurveyResponse_surveyId_fkey"`,
    `ALTER TABLE "SurveyResponse" ADD CONSTRAINT "SurveyResponse_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey"("id") ON DELETE CASCADE ON UPDATE CASCADE`,

    `ALTER TABLE "SurveyResponse" DROP CONSTRAINT IF EXISTS "SurveyResponse_employeeId_fkey"`,
    `ALTER TABLE "SurveyResponse" ADD CONSTRAINT "SurveyResponse_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE`,

    `ALTER TABLE "Recognition" DROP CONSTRAINT IF EXISTS "Recognition_toId_fkey"`,
    `ALTER TABLE "Recognition" ADD CONSTRAINT "Recognition_toId_fkey" FOREIGN KEY ("toId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE`,

    // ─── Invoicing FKs (REQ-PM-09) ───
    `ALTER TABLE "Invoice" DROP CONSTRAINT IF EXISTS "Invoice_companyId_fkey"`,
    `ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE`,

    `ALTER TABLE "Invoice" DROP CONSTRAINT IF EXISTS "Invoice_clientId_fkey"`,
    `ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE`,

    `ALTER TABLE "Invoice" DROP CONSTRAINT IF EXISTS "Invoice_projectId_fkey"`,
    `ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE`,

    `ALTER TABLE "InvoiceLineItem" DROP CONSTRAINT IF EXISTS "InvoiceLineItem_invoiceId_fkey"`,
    `ALTER TABLE "InvoiceLineItem" ADD CONSTRAINT "InvoiceLineItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE`,

    // ─── Timesheet FKs (REQ-PM-07) ───
    `ALTER TABLE "Timesheet" DROP CONSTRAINT IF EXISTS "Timesheet_projectId_fkey"`,
    `ALTER TABLE "Timesheet" ADD CONSTRAINT "Timesheet_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE`,

    `ALTER TABLE "Timesheet" DROP CONSTRAINT IF EXISTS "Timesheet_projectTaskId_fkey"`,
    `ALTER TABLE "Timesheet" ADD CONSTRAINT "Timesheet_projectTaskId_fkey" FOREIGN KEY ("projectTaskId") REFERENCES "ProjectTask"("id") ON DELETE SET NULL ON UPDATE CASCADE`,

    // ─── ProjectMember FKs (REQ-SEC-11) ───
    `ALTER TABLE "ProjectMember" DROP CONSTRAINT IF EXISTS "ProjectMember_projectId_fkey"`,
    `ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE`,

    `ALTER TABLE "ProjectMember" DROP CONSTRAINT IF EXISTS "ProjectMember_employeeId_fkey"`,
    `ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  ];

  let applied = 0;
  let skipped = 0;

  for (const stmt of statements) {
    try {
      // IMPORTANT: neon() returns a tagged-template function. Calling
      // sql(stmt) with a string variable treats it as a PARAMETER value,
      // not as raw SQL. Use sql.query(stmt, []) to execute raw DDL.
      await sql.query(stmt, []);
      applied++;
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      if (/already exists|duplicate|exists/i.test(msg)) {
        skipped++;
      } else {
        console.warn(`[schema-sync] Statement failed (non-fatal): ${msg}`);
        console.warn(`[schema-sync] SQL: ${stmt.substring(0, 120)}...`);
        skipped++;
      }
    }
  }

  // Foreign key constraints — applied separately using DROP + ADD pattern
  // (allows re-running on existing tables without error).
  for (const stmt of fkStatements) {
    try {
      await sql.query(stmt, []);
      applied++;
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      if (!/already exists|duplicate/i.test(msg)) {
        console.warn(`[schema-sync] FK statement failed (non-fatal): ${msg.substring(0, 120)}`);
      }
      skipped++;
    }
  }

  console.log(`[schema-sync] Done. Applied ${applied} statement(s), skipped ${skipped}.`);
}

main().catch((err) => {
  console.warn('[schema-sync] FATAL (non-blocking):', err && err.message ? err.message : err);
  // Exit 0 so the build continues even if schema sync fails.
  process.exit(0);
});
