/**
 * Database Schema Push Endpoint
 *
 * POST /api/db-push — Creates missing database tables using raw SQL
 * This is needed because prisma db push can't run during Vercel build
 * and some newer tables don't exist in the production database.
 *
 * This endpoint uses Prisma's raw SQL execution to create the missing tables.
 */
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function POST() {
  try {
    console.log('[DB Push] Starting database schema push...');

    const results: string[] = [];

    // First, drop and recreate tables that have WRONG schema (old schema from a different model)
    // PayrollRun had old columns: month, year, status, totalAmount, employeeCount
    // Prisma expects: legalEntityId, payrollPeriod, runType, runStatus, etc.
    const dropAndRecreateStatements = [
      // Drop PayrollRun and recreate with correct schema
      `DROP TABLE IF EXISTS "PayrollRun" CASCADE`,
    ];

    for (const sql of dropAndRecreateStatements) {
      try {
        await db.$executeRawUnsafe(sql);
        results.push('✅ Dropped old PayrollRun table');
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        results.push(`⚠️ Drop failed: ${errMsg.substring(0, 100)}`);
      }
    }

    // Define CREATE TABLE statements for missing tables
    // These match the Prisma schema definitions exactly
    const createTableStatements = [
      // PayrollRun (recreated with correct schema matching Prisma)
      `CREATE TABLE IF NOT EXISTS "PayrollRun" (
        "id" TEXT NOT NULL,
        "legalEntityId" TEXT NOT NULL,
        "payrollPeriod" TEXT NOT NULL,
        "periodStartDate" TIMESTAMP(3) NOT NULL,
        "periodEndDate" TIMESTAMP(3) NOT NULL,
        "payDate" TIMESTAMP(3) NOT NULL,
        "runType" TEXT NOT NULL DEFAULT 'REGULAR',
        "runStatus" TEXT NOT NULL DEFAULT 'OPEN',
        "currencyCode" TEXT NOT NULL DEFAULT 'USD',
        "exchangeRateDate" TIMESTAMP(3),
        "taxProjectionMethod" TEXT NOT NULL DEFAULT 'CUMULATIVE',
        "includeStatutory" BOOLEAN NOT NULL DEFAULT true,
        "processingMode" TEXT NOT NULL DEFAULT 'FULL',
        "initiatedBy" TEXT,
        "companyId" TEXT,
        "totalEmployees" INTEGER NOT NULL DEFAULT 0,
        "totalGrossPay" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "totalDeductions" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "totalNetPay" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "totalEmployerContrib" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "PayrollRun_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "PayrollRun_legalEntityId_payrollPeriod_runType_key" UNIQUE ("legalEntityId", "payrollPeriod", "runType")
      )`,

      // PayrollHold
      `CREATE TABLE IF NOT EXISTS "PayrollHold" (
        "id" TEXT NOT NULL,
        "employeeId" TEXT NOT NULL,
        "holdType" TEXT NOT NULL DEFAULT 'FULL_HOLD',
        "reason" TEXT,
        "holdFromPeriod" TEXT,
        "holdToPeriod" TEXT,
        "heldComponents" TEXT,
        "releasedDate" TIMESTAMP(3),
        "releasedBy" TEXT,
        "status" TEXT NOT NULL DEFAULT 'active',
        "createdBy" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "PayrollHold_pkey" PRIMARY KEY ("id")
      )`,

      // BankPaymentFile
      `CREATE TABLE IF NOT EXISTS "BankPaymentFile" (
        "id" TEXT NOT NULL,
        "payrollRunId" TEXT,
        "fileName" TEXT NOT NULL,
        "fileFormat" TEXT NOT NULL DEFAULT 'NACH',
        "bankCode" TEXT,
        "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "totalRecords" INTEGER NOT NULL DEFAULT 0,
        "fileContent" TEXT,
        "generatedBy" TEXT,
        "generatedAt" TIMESTAMP(3),
        "status" TEXT NOT NULL DEFAULT 'generated',
        "companyId" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "BankPaymentFile_pkey" PRIMARY KEY ("id")
      )`,

      // PayrollDefinition
      `CREATE TABLE IF NOT EXISTS "PayrollDefinition" (
        "id" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "companyId" TEXT NOT NULL,
        "payFrequency" TEXT NOT NULL DEFAULT 'MONTHLY',
        "processingCutOff" INTEGER NOT NULL DEFAULT 25,
        "paymentDay" INTEGER NOT NULL DEFAULT 1,
        "currencyCode" TEXT NOT NULL DEFAULT 'USD',
        "countryCode" TEXT,
        "allowDirectDeposit" BOOLEAN NOT NULL DEFAULT true,
        "allowCheque" BOOLEAN NOT NULL DEFAULT false,
        "allowCash" BOOLEAN NOT NULL DEFAULT false,
        "costingSegments" TEXT,
        "status" TEXT NOT NULL DEFAULT 'active',
        "effectiveFrom" TIMESTAMP(3),
        "effectiveTo" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "PayrollDefinition_pkey" PRIMARY KEY ("id")
      )`,

      // EmployeePaymentMethod
      `CREATE TABLE IF NOT EXISTS "EmployeePaymentMethod" (
        "id" TEXT NOT NULL,
        "employeeId" TEXT NOT NULL,
        "paymentType" TEXT NOT NULL DEFAULT 'DIRECT_DEPOSIT',
        "bankName" TEXT,
        "bankAccountNo" TEXT,
        "bankIfscCode" TEXT,
        "bankBranch" TEXT,
        "accountType" TEXT,
        "currencyCode" TEXT NOT NULL DEFAULT 'USD',
        "splitType" TEXT,
        "splitValue" DOUBLE PRECISION,
        "isPrimary" BOOLEAN NOT NULL DEFAULT false,
        "priority" INTEGER NOT NULL DEFAULT 1,
        "effectiveFrom" TIMESTAMP(3),
        "effectiveTo" TIMESTAMP(3),
        "status" TEXT NOT NULL DEFAULT 'active',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "EmployeePaymentMethod_pkey" PRIMARY KEY ("id")
      )`,

      // Loan
      `CREATE TABLE IF NOT EXISTS "Loan" (
        "id" TEXT NOT NULL,
        "employeeId" TEXT NOT NULL,
        "loanType" TEXT NOT NULL DEFAULT 'PERSONAL',
        "loanAmount" DOUBLE PRECISION NOT NULL,
        "interestRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "tenureMonths" INTEGER NOT NULL,
        "emiAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "outstandingBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "disbursedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "disbursedDate" TIMESTAMP(3),
        "startDate" TIMESTAMP(3),
        "endDate" TIMESTAMP(3),
        "recoveredAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "remainingEmis" INTEGER NOT NULL DEFAULT 0,
        "recoverySchedule" TEXT,
        "status" TEXT NOT NULL DEFAULT 'active',
        "approvedBy" TEXT,
        "approvedAt" TIMESTAMP(3),
        "remarks" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "Loan_pkey" PRIMARY KEY ("id")
      )`,

      // OvertimeRecord
      `CREATE TABLE IF NOT EXISTS "OvertimeRecord" (
        "id" TEXT NOT NULL,
        "employeeId" TEXT NOT NULL,
        "date" TIMESTAMP(3) NOT NULL,
        "hours" DOUBLE PRECISION NOT NULL,
        "rateType" TEXT NOT NULL DEFAULT 'HOURLY_RATE',
        "rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "reason" TEXT,
        "project" TEXT,
        "approvedBy" TEXT,
        "approvedAt" TIMESTAMP(3),
        "status" TEXT NOT NULL DEFAULT 'pending',
        "payrollRunId" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "OvertimeRecord_pkey" PRIMARY KEY ("id")
      )`,

      // FNFCalculation (might also be missing)
      `CREATE TABLE IF NOT EXISTS "FNFCalculation" (
        "id" TEXT NOT NULL,
        "employeeId" TEXT,
        "separationId" TEXT,
        "lastWorkingDate" TIMESTAMP(3),
        "basicSalary" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "da" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "hra" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "conveyance" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "medical" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "otherAllowances" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "grossSalary" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "pf" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "esi" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "tax" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "professionalTax" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "otherDeductions" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "totalDeductions" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "netSalary" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "leaveEncashment" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "gratuity" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "bonus" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "noticePay" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "noticeRecovery" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "loanRecovery" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "otherRecoveries" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "totalFnFAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "status" TEXT NOT NULL DEFAULT 'pending',
        "processedBy" TEXT,
        "processedAt" TIMESTAMP(3),
        "approvedBy" TEXT,
        "approvedAt" TIMESTAMP(3),
        "companyId" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "FNFCalculation_pkey" PRIMARY KEY ("id")
      )`,

      // PayrollValidation (might also be missing)
      `CREATE TABLE IF NOT EXISTS "PayrollValidation" (
        "id" TEXT NOT NULL,
        "payrollRunId" TEXT,
        "companyId" TEXT,
        "validationType" TEXT NOT NULL DEFAULT 'PRE_PAYROLL',
        "status" TEXT NOT NULL DEFAULT 'pending',
        "missingPaymentMethods" TEXT,
        "missingSalaryBasis" TEXT,
        "heldEmployees" TEXT,
        "newJoiners" TEXT,
        "terminations" TEXT,
        "errors" TEXT,
        "warnings" TEXT,
        "totalEmployees" INTEGER NOT NULL DEFAULT 0,
        "validEmployees" INTEGER NOT NULL DEFAULT 0,
        "invalidEmployees" INTEGER NOT NULL DEFAULT 0,
        "runBy" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "PayrollValidation_pkey" PRIMARY KEY ("id")
      )`,

      // ComplianceFiling (might also be missing)
      `CREATE TABLE IF NOT EXISTS "ComplianceFiling" (
        "id" TEXT NOT NULL,
        "payrollRunId" TEXT,
        "obligationId" TEXT,
        "filingPeriod" TEXT,
        "dueDate" TIMESTAMP(3),
        "filedDate" TIMESTAMP(3),
        "filedBy" TEXT,
        "status" TEXT NOT NULL DEFAULT 'pending',
        "challanNumber" TEXT,
        "challanDate" TIMESTAMP(3),
        "challanAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "receiptNumber" TEXT,
        "remarks" TEXT,
        "companyId" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "ComplianceFiling_pkey" PRIMARY KEY ("id")
      )`,
    ];

    // Create indexes separately
    const indexStatements = [
      `CREATE INDEX IF NOT EXISTS "PayrollRun_runStatus_idx" ON "PayrollRun"("runStatus")`,
      `CREATE INDEX IF NOT EXISTS "PayrollRun_companyId_idx" ON "PayrollRun"("companyId")`,
      `CREATE INDEX IF NOT EXISTS "PayrollRun_payrollPeriod_idx" ON "PayrollRun"("payrollPeriod")`,
      `CREATE INDEX IF NOT EXISTS "PayrollHold_employeeId_idx" ON "PayrollHold"("employeeId")`,
      `CREATE INDEX IF NOT EXISTS "PayrollHold_status_idx" ON "PayrollHold"("status")`,
      `CREATE INDEX IF NOT EXISTS "BankPaymentFile_payrollRunId_idx" ON "BankPaymentFile"("payrollRunId")`,
      `CREATE INDEX IF NOT EXISTS "BankPaymentFile_companyId_idx" ON "BankPaymentFile"("companyId")`,
      `CREATE INDEX IF NOT EXISTS "PayrollDefinition_companyId_idx" ON "PayrollDefinition"("companyId")`,
      `CREATE INDEX IF NOT EXISTS "EmployeePaymentMethod_employeeId_idx" ON "EmployeePaymentMethod"("employeeId")`,
      `CREATE INDEX IF NOT EXISTS "Loan_employeeId_idx" ON "Loan"("employeeId")`,
      `CREATE INDEX IF NOT EXISTS "Loan_status_idx" ON "Loan"("status")`,
      `CREATE INDEX IF NOT EXISTS "OvertimeRecord_employeeId_idx" ON "OvertimeRecord"("employeeId")`,
      `CREATE INDEX IF NOT EXISTS "OvertimeRecord_date_idx" ON "OvertimeRecord"("date")`,
      `CREATE INDEX IF NOT EXISTS "FNFCalculation_employeeId_idx" ON "FNFCalculation"("employeeId")`,
      `CREATE INDEX IF NOT EXISTS "PayrollValidation_payrollRunId_idx" ON "PayrollValidation"("payrollRunId")`,
      `CREATE INDEX IF NOT EXISTS "PayrollValidation_companyId_idx" ON "PayrollValidation"("companyId")`,
      `CREATE INDEX IF NOT EXISTS "ComplianceFiling_payrollRunId_idx" ON "ComplianceFiling"("payrollRunId")`,
      `CREATE INDEX IF NOT EXISTS "ComplianceFiling_obligationId_idx" ON "ComplianceFiling"("obligationId")`,
    ];

    // Add missing columns to existing tables (Prisma db push might have missed these)
    const alterTableStatements = [
      // PayrollTransactionLine - add employee relation if missing
      `ALTER TABLE "PayrollTransactionLine" ADD COLUMN IF NOT EXISTS "ytdAmount" DOUBLE PRECISION`,
      `ALTER TABLE "PayrollTransactionLine" ADD COLUMN IF NOT EXISTS "mtdAmount" DOUBLE PRECISION`,
      // PayrollInput - add missing columns
      `ALTER TABLE "PayrollInput" ADD COLUMN IF NOT EXISTS "source" TEXT`,
      `ALTER TABLE "PayrollInput" ADD COLUMN IF NOT EXISTS "remarks" TEXT`,
      // Add unique constraint for PayrollComponent if missing
      `ALTER TABLE "PayrollComponent" DROP CONSTRAINT IF EXISTS "PayrollComponent_code_countryCode_key"`,
      `ALTER TABLE "PayrollComponent" ADD CONSTRAINT "PayrollComponent_code_countryCode_key" UNIQUE ("code", "countryCode")`,

      // ─── Multi-tenancy quota / employee strength barriers ───
      // Tenant: max companies the tenant_admin can create (0 = unlimited)
      `ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "maxCompaniesAllowed" INTEGER NOT NULL DEFAULT 0`,
      // CompanyGroup: employee strength limits + per-group company cap + notes
      `ALTER TABLE "CompanyGroup" ADD COLUMN IF NOT EXISTS "employeeLimitMode" TEXT NOT NULL DEFAULT 'group_total'`,
      `ALTER TABLE "CompanyGroup" ADD COLUMN IF NOT EXISTS "maxEmployees" INTEGER`,
      `ALTER TABLE "CompanyGroup" ADD COLUMN IF NOT EXISTS "maxCompanies" INTEGER`,
      `ALTER TABLE "CompanyGroup" ADD COLUMN IF NOT EXISTS "notes" TEXT`,
      // Company: per-company employee strength barrier + planned strength (informational)
      `ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "maxEmployees" INTEGER`,
      `ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "plannedEmployeeCount" INTEGER`,
    ];

    let altersExecuted = 0;
    for (const sql of alterTableStatements) {
      try {
        await db.$executeRawUnsafe(sql);
        altersExecuted++;
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        // Column might already exist or constraint might already exist, that's fine
        if (!errMsg.includes('already exists') && !errMsg.includes('already has')) {
          // Log unusual errors
          const desc = sql.substring(0, 80);
          console.log(`[DB Push] ALTER skipped: ${desc} - ${errMsg.substring(0, 100)}`);
        }
      }
    }
    results.push(`✅ Applied ${altersExecuted} ALTER TABLE statements`);

    // Add foreign key constraints separately
    const fkStatements = [
      `ALTER TABLE "PayrollHold" DROP CONSTRAINT IF EXISTS "PayrollHold_employeeId_fkey"`,
      `ALTER TABLE "PayrollHold" ADD CONSTRAINT "PayrollHold_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
      `ALTER TABLE "BankPaymentFile" DROP CONSTRAINT IF EXISTS "BankPaymentFile_payrollRunId_fkey"`,
      `ALTER TABLE "BankPaymentFile" ADD CONSTRAINT "BankPaymentFile_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
      `ALTER TABLE "PayrollDefinition" DROP CONSTRAINT IF EXISTS "PayrollDefinition_companyId_fkey"`,
      `ALTER TABLE "PayrollDefinition" ADD CONSTRAINT "PayrollDefinition_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
      `ALTER TABLE "EmployeePaymentMethod" DROP CONSTRAINT IF EXISTS "EmployeePaymentMethod_employeeId_fkey"`,
      `ALTER TABLE "EmployeePaymentMethod" ADD CONSTRAINT "EmployeePaymentMethod_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
      `ALTER TABLE "Loan" DROP CONSTRAINT IF EXISTS "Loan_employeeId_fkey"`,
      `ALTER TABLE "Loan" ADD CONSTRAINT "Loan_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
      `ALTER TABLE "OvertimeRecord" DROP CONSTRAINT IF EXISTS "OvertimeRecord_employeeId_fkey"`,
      `ALTER TABLE "OvertimeRecord" ADD CONSTRAINT "OvertimeRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    ];

    // Execute CREATE TABLE statements
    let tablesCreated = 0;
    for (const sql of createTableStatements) {
      try {
        const tableName = sql.match(/CREATE TABLE IF NOT EXISTS "(\w+)"/)?.[1] || 'unknown';
        await db.$executeRawUnsafe(sql);
        results.push(`✅ Created table: ${tableName}`);
        tablesCreated++;
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        const tableName = sql.match(/CREATE TABLE IF NOT EXISTS "(\w+)"/)?.[1] || 'unknown';
        if (errMsg.includes('already exists')) {
          results.push(`⏭️ Table already exists: ${tableName}`);
        } else {
          results.push(`❌ Failed to create table: ${tableName} - ${errMsg.substring(0, 200)}`);
        }
      }
    }

    // Execute index statements
    let indexesCreated = 0;
    for (const sql of indexStatements) {
      try {
        await db.$executeRawUnsafe(sql);
        indexesCreated++;
      } catch {
        // Index might already exist, that's fine
      }
    }
    results.push(`✅ Created ${indexesCreated} indexes`);

    // Execute FK statements
    let fksCreated = 0;
    for (const sql of fkStatements) {
      try {
        await db.$executeRawUnsafe(sql);
        fksCreated++;
      } catch (err: unknown) {
        // FK might fail if referenced table doesn't exist, that's OK
        const errMsg = err instanceof Error ? err.message : String(err);
        if (!errMsg.includes('already exists')) {
          // Log but don't fail
        }
      }
    }
    results.push(`✅ Created ${fksCreated} foreign keys`);

    return NextResponse.json({
      success: true,
      tablesCreated,
      totalStatements: createTableStatements.length,
      results,
    }, { headers: corsHeaders });

  } catch (error: unknown) {
    const err = error as Error;
    console.error('[DB Push] Error:', err);
    return NextResponse.json({
      success: false,
      error: err.message || 'Unknown error',
    }, { status: 500, headers: corsHeaders });
  }
}

export async function GET() {
  return POST();
}
