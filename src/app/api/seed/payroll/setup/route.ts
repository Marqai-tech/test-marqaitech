/**
 * Schema Push + Payroll Setup Endpoint
 * Call GET /api/seed/payroll/setup to create payroll tables
 * Then call GET /api/seed/payroll to seed data
 */
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    console.log('[Payroll Setup] Checking if payroll tables exist...');

    // Check if PayrollComponent table exists
    let tableExists = false;
    try {
      await db.payrollComponent.count();
      tableExists = true;
    } catch {
      console.log('[Payroll Setup] Tables missing, creating...');
    }

    if (!tableExists) {
      const sqls = [
        `CREATE TABLE IF NOT EXISTS "PayrollComponent" (
          "id" TEXT NOT NULL, "code" TEXT NOT NULL, "name" TEXT NOT NULL,
          "componentType" TEXT NOT NULL, "componentCategory" TEXT NOT NULL DEFAULT 'NORMAL',
          "countryCode" TEXT NOT NULL DEFAULT 'IND', "calculationType" TEXT NOT NULL,
          "defaultValue" DOUBLE PRECISION, "percentageBase" TEXT, "formulaId" TEXT, "slabTableId" TEXT,
          "isTaxable" BOOLEAN NOT NULL DEFAULT true, "taxTreatment" TEXT, "exemptionSection" TEXT,
          "maxExemptionAmt" DOUBLE PRECISION, "affectsGross" BOOLEAN NOT NULL DEFAULT true,
          "affectsNet" BOOLEAN NOT NULL DEFAULT true, "affectsCTC" BOOLEAN NOT NULL DEFAULT true,
          "paymentFrequency" TEXT NOT NULL DEFAULT 'MONTHLY', "prorationApplicable" BOOLEAN NOT NULL DEFAULT true,
          "roundingRule" TEXT, "isActive" BOOLEAN NOT NULL DEFAULT true,
          "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "effectiveTo" TIMESTAMP(3),
          "companyId" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "PayrollComponent_pkey" PRIMARY KEY ("id")
        );`,
        `CREATE UNIQUE INDEX IF NOT EXISTS "PayrollComponent_code_countryCode_key" ON "PayrollComponent"("code", "countryCode");`,
        `CREATE INDEX IF NOT EXISTS "PayrollComponent_countryCode_idx" ON "PayrollComponent"("countryCode");`,
        `CREATE INDEX IF NOT EXISTS "PayrollComponent_componentCategory_idx" ON "PayrollComponent"("componentCategory");`,
        `CREATE INDEX IF NOT EXISTS "PayrollComponent_componentType_idx" ON "PayrollComponent"("componentType");`,
        `CREATE INDEX IF NOT EXISTS "PayrollComponent_companyId_idx" ON "PayrollComponent"("companyId");`,

        `CREATE TABLE IF NOT EXISTS "StatutoryComponent" (
          "id" TEXT NOT NULL, "componentId" TEXT NOT NULL, "componentCode" TEXT NOT NULL,
          "componentName" TEXT NOT NULL, "countryCode" TEXT NOT NULL, "authorityName" TEXT NOT NULL,
          "authorityCode" TEXT, "partyType" TEXT NOT NULL, "calculationBasis" TEXT NOT NULL,
          "basisComponentId" TEXT, "ratePercentage" DOUBLE PRECISION, "wageCeiling" DOUBLE PRECISION,
          "maxContributionAmt" DOUBLE PRECISION, "minContributionAmt" DOUBLE PRECISION,
          "slabTableId" TEXT, "remittanceFrequency" TEXT NOT NULL DEFAULT 'MONTHLY',
          "remittanceDueDay" INTEGER, "filingFrequency" TEXT, "filingFormat" TEXT,
          "penaltyRatePct" DOUBLE PRECISION, "isChallanRequired" BOOLEAN NOT NULL DEFAULT false,
          "challanFormat" TEXT, "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "effectiveTo" TIMESTAMP(3),
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "StatutoryComponent_pkey" PRIMARY KEY ("id")
        );`,
        `CREATE INDEX IF NOT EXISTS "StatutoryComponent_componentId_idx" ON "StatutoryComponent"("componentId");`,
        `CREATE INDEX IF NOT EXISTS "StatutoryComponent_countryCode_idx" ON "StatutoryComponent"("countryCode");`,

        `CREATE TABLE IF NOT EXISTS "CTCTemplate" (
          "id" TEXT NOT NULL, "name" TEXT NOT NULL, "countryCode" TEXT NOT NULL DEFAULT 'IND',
          "legalEntityId" TEXT, "currencyCode" TEXT NOT NULL DEFAULT 'INR',
          "ctcType" TEXT NOT NULL DEFAULT 'ANNUAL',
          "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "effectiveTo" TIMESTAMP(3),
          "version" INTEGER NOT NULL DEFAULT 1, "status" TEXT NOT NULL DEFAULT 'DRAFT',
          "isDefault" BOOLEAN NOT NULL DEFAULT false, "basePayPct" DOUBLE PRECISION,
          "createdBy" TEXT, "companyId" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "CTCTemplate_pkey" PRIMARY KEY ("id")
        );`,
        `CREATE INDEX IF NOT EXISTS "CTCTemplate_countryCode_idx" ON "CTCTemplate"("countryCode");`,
        `CREATE INDEX IF NOT EXISTS "CTCTemplate_status_idx" ON "CTCTemplate"("status");`,
        `CREATE INDEX IF NOT EXISTS "CTCTemplate_companyId_idx" ON "CTCTemplate"("companyId");`,

        `CREATE TABLE IF NOT EXISTS "CTCComponentMapping" (
          "id" TEXT NOT NULL, "ctcTemplateId" TEXT NOT NULL, "componentId" TEXT,
          "componentName" TEXT NOT NULL, "componentCategory" TEXT NOT NULL DEFAULT 'EARNING',
          "allocationMethod" TEXT NOT NULL DEFAULT 'PERCENTAGE_OF_CTC',
          "allocationValue" DOUBLE PRECISION NOT NULL DEFAULT 0, "baseComponentId" TEXT,
          "formulaExpression" TEXT, "calculationSequence" INTEGER NOT NULL DEFAULT 1,
          "isStatutory" BOOLEAN NOT NULL DEFAULT false, "isTaxable" BOOLEAN NOT NULL DEFAULT true,
          "taxExemptionLimit" DOUBLE PRECISION, "frequency" TEXT NOT NULL DEFAULT 'MONTHLY',
          "prorationRule" TEXT, "minAmount" DOUBLE PRECISION, "maxAmount" DOUBLE PRECISION,
          "roundingRule" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "CTCComponentMapping_pkey" PRIMARY KEY ("id")
        );`,
        `CREATE INDEX IF NOT EXISTS "CTCComponentMapping_ctcTemplateId_idx" ON "CTCComponentMapping"("ctcTemplateId");`,

        `CREATE TABLE IF NOT EXISTS "TaxSlabTable" (
          "id" TEXT NOT NULL, "name" TEXT NOT NULL, "countryCode" TEXT NOT NULL,
          "taxYear" TEXT NOT NULL, "filingStatus" TEXT, "regimeType" TEXT,
          "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "effectiveTo" TIMESTAMP(3),
          "companyId" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "TaxSlabTable_pkey" PRIMARY KEY ("id")
        );`,
        `CREATE INDEX IF NOT EXISTS "TaxSlabTable_countryCode_idx" ON "TaxSlabTable"("countryCode");`,
        `CREATE INDEX IF NOT EXISTS "TaxSlabTable_taxYear_idx" ON "TaxSlabTable"("taxYear");`,

        `CREATE TABLE IF NOT EXISTS "TaxSlabRateLine" (
          "id" TEXT NOT NULL, "slabTableId" TEXT NOT NULL, "sequence" INTEGER NOT NULL,
          "incomeFrom" DOUBLE PRECISION NOT NULL DEFAULT 0, "incomeTo" DOUBLE PRECISION,
          "ratePercentage" DOUBLE PRECISION NOT NULL DEFAULT 0, "fixedAmount" DOUBLE PRECISION,
          "surchargeRate" DOUBLE PRECISION, "cessRate" DOUBLE PRECISION, "componentId" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "TaxSlabRateLine_pkey" PRIMARY KEY ("id")
        );`,
        `CREATE INDEX IF NOT EXISTS "TaxSlabRateLine_slabTableId_idx" ON "TaxSlabRateLine"("slabTableId");`,

        `CREATE TABLE IF NOT EXISTS "PayrollInput" (
          "id" TEXT NOT NULL, "payrollRunId" TEXT, "employeeId" TEXT NOT NULL,
          "inputType" TEXT NOT NULL, "componentCode" TEXT NOT NULL,
          "inputValueNumeric" DOUBLE PRECISION, "unitType" TEXT,
          "inputDateFrom" TIMESTAMP(3), "inputDateTo" TIMESTAMP(3),
          "currencyCode" TEXT DEFAULT 'USD', "exchangeRate" DOUBLE PRECISION,
          "approvalStatus" TEXT NOT NULL DEFAULT 'PENDING', "approvedBy" TEXT,
          "approvalDate" TIMESTAMP(3), "source" TEXT NOT NULL DEFAULT 'MANUAL',
          "referenceDocument" TEXT, "remarks" TEXT, "createdBy" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "PayrollInput_pkey" PRIMARY KEY ("id")
        );`,
        `CREATE INDEX IF NOT EXISTS "PayrollInput_employeeId_idx" ON "PayrollInput"("employeeId");`,
        `CREATE INDEX IF NOT EXISTS "PayrollInput_payrollRunId_idx" ON "PayrollInput"("payrollRunId");`,

        `CREATE TABLE IF NOT EXISTS "CurrencyConfig" (
          "id" TEXT NOT NULL, "legalEntityId" TEXT NOT NULL,
          "baseCurrency" TEXT NOT NULL DEFAULT 'USD', "payrollCurrency" TEXT NOT NULL DEFAULT 'USD',
          "reportingCurrency" TEXT, "exchangeRateSource" TEXT NOT NULL DEFAULT 'MANUAL',
          "rateType" TEXT NOT NULL DEFAULT 'SPOT', "autoFetchEnabled" BOOLEAN NOT NULL DEFAULT false,
          "fetchFrequency" TEXT, "roundingPrecision" INTEGER NOT NULL DEFAULT 2,
          "roundingRule" TEXT NOT NULL DEFAULT 'NEAREST', "gainLossAccount" TEXT, "companyId" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "CurrencyConfig_pkey" PRIMARY KEY ("id")
        );`,
        `CREATE INDEX IF NOT EXISTS "CurrencyConfig_legalEntityId_idx" ON "CurrencyConfig"("legalEntityId");`,

        `CREATE TABLE IF NOT EXISTS "ExchangeRate" (
          "id" TEXT NOT NULL, "fromCurrency" TEXT NOT NULL, "toCurrency" TEXT NOT NULL,
          "exchangeRate" DOUBLE PRECISION NOT NULL, "rateDate" TIMESTAMP(3) NOT NULL,
          "rateType" TEXT NOT NULL DEFAULT 'SPOT', "source" TEXT NOT NULL DEFAULT 'Manual Entry',
          "inverseRate" DOUBLE PRECISION, "isActive" BOOLEAN NOT NULL DEFAULT true,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
        );`,
        `CREATE INDEX IF NOT EXISTS "ExchangeRate_fromCurrency_toCurrency_rateDate_idx" ON "ExchangeRate"("fromCurrency", "toCurrency", "rateDate");`,

        `CREATE TABLE IF NOT EXISTS "DimensionDefinition" (
          "id" TEXT NOT NULL, "code" TEXT NOT NULL, "name" TEXT NOT NULL,
          "dimensionType" TEXT NOT NULL DEFAULT 'STANDARD',
          "hierarchyEnabled" BOOLEAN NOT NULL DEFAULT false,
          "allocationMethod" TEXT NOT NULL DEFAULT 'PERCENTAGE',
          "isMandatory" BOOLEAN NOT NULL DEFAULT false, "allowMultiple" BOOLEAN NOT NULL DEFAULT true,
          "maxAllocations" INTEGER, "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "companyId" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "DimensionDefinition_pkey" PRIMARY KEY ("id")
        );`,
        `CREATE INDEX IF NOT EXISTS "DimensionDefinition_code_idx" ON "DimensionDefinition"("code");`,

        `CREATE TABLE IF NOT EXISTS "EmployeeDimensionAllocation" (
          "id" TEXT NOT NULL, "employeeId" TEXT NOT NULL, "dimensionId" TEXT NOT NULL,
          "dimensionValueId" TEXT NOT NULL, "allocationPct" DOUBLE PRECISION NOT NULL DEFAULT 100,
          "allocationAmount" DOUBLE PRECISION,
          "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "effectiveTo" TIMESTAMP(3),
          "isPrimary" BOOLEAN NOT NULL DEFAULT true,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "EmployeeDimensionAllocation_pkey" PRIMARY KEY ("id")
        );`,
        `CREATE INDEX IF NOT EXISTS "EmployeeDimensionAllocation_employeeId_idx" ON "EmployeeDimensionAllocation"("employeeId");`,

        `CREATE TABLE IF NOT EXISTS "PayrollRun" (
          "id" TEXT NOT NULL, "legalEntityId" TEXT NOT NULL, "payrollPeriod" TEXT NOT NULL,
          "periodStartDate" TIMESTAMP(3) NOT NULL, "periodEndDate" TIMESTAMP(3) NOT NULL,
          "payDate" TIMESTAMP(3) NOT NULL, "runType" TEXT NOT NULL DEFAULT 'REGULAR',
          "runStatus" TEXT NOT NULL DEFAULT 'OPEN', "currencyCode" TEXT NOT NULL DEFAULT 'USD',
          "exchangeRateDate" TIMESTAMP(3), "taxProjectionMethod" TEXT NOT NULL DEFAULT 'CUMULATIVE',
          "includeStatutory" BOOLEAN NOT NULL DEFAULT true, "processingMode" TEXT NOT NULL DEFAULT 'FULL',
          "initiatedBy" TEXT, "companyId" TEXT,
          "totalEmployees" INTEGER NOT NULL DEFAULT 0, "totalGrossPay" DOUBLE PRECISION NOT NULL DEFAULT 0,
          "totalDeductions" DOUBLE PRECISION NOT NULL DEFAULT 0, "totalNetPay" DOUBLE PRECISION NOT NULL DEFAULT 0,
          "totalEmployerContrib" DOUBLE PRECISION NOT NULL DEFAULT 0,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "PayrollRun_pkey" PRIMARY KEY ("id")
        );`,
        `CREATE UNIQUE INDEX IF NOT EXISTS "PayrollRun_legalEntityId_payrollPeriod_runType_key" ON "PayrollRun"("legalEntityId", "payrollPeriod", "runType");`,
        `CREATE INDEX IF NOT EXISTS "PayrollRun_runStatus_idx" ON "PayrollRun"("runStatus");`,
        `CREATE INDEX IF NOT EXISTS "PayrollRun_companyId_idx" ON "PayrollRun"("companyId");`,

        `CREATE TABLE IF NOT EXISTS "PayrollTransactionLine" (
          "id" TEXT NOT NULL, "payrollRunId" TEXT NOT NULL, "employeeId" TEXT NOT NULL,
          "componentId" TEXT, "componentCode" TEXT NOT NULL, "componentType" TEXT NOT NULL,
          "componentCategory" TEXT NOT NULL, "calculatedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
          "overrideAmount" DOUBLE PRECISION, "finalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
          "currencyCode" TEXT NOT NULL DEFAULT 'USD', "exchangeRate" DOUBLE PRECISION,
          "baseCurrencyAmount" DOUBLE PRECISION, "ytdAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
          "mtdAmount" DOUBLE PRECISION NOT NULL DEFAULT 0, "prorationFactor" DOUBLE PRECISION,
          "inputSourceId" TEXT, "formulaTrace" TEXT, "dimensionSplitJson" TEXT,
          "glAccountCode" TEXT, "costCenterCode" TEXT, "isReversal" BOOLEAN NOT NULL DEFAULT false,
          "reversedTransactionId" TEXT, "taxTreatment" TEXT, "statutoryReference" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "PayrollTransactionLine_pkey" PRIMARY KEY ("id")
        );`,
        `CREATE INDEX IF NOT EXISTS "PayrollTransactionLine_payrollRunId_idx" ON "PayrollTransactionLine"("payrollRunId");`,
        `CREATE INDEX IF NOT EXISTS "PayrollTransactionLine_employeeId_idx" ON "PayrollTransactionLine"("employeeId");`,

        `CREATE TABLE IF NOT EXISTS "ComplianceObligation" (
          "id" TEXT NOT NULL, "name" TEXT NOT NULL, "countryCode" TEXT NOT NULL,
          "authorityName" TEXT NOT NULL, "filingType" TEXT NOT NULL, "frequency" TEXT NOT NULL,
          "dueDateRule" TEXT NOT NULL, "graceDays" INTEGER, "penaltyType" TEXT,
          "penaltyValue" DOUBLE PRECISION, "responsibleRole" TEXT NOT NULL DEFAULT 'PAYROLL_ADMIN',
          "escalationRole" TEXT, "reminderDaysBefore" TEXT, "autoGenerate" BOOLEAN NOT NULL DEFAULT false,
          "filingFormat" TEXT, "isActive" BOOLEAN NOT NULL DEFAULT true, "companyId" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "ComplianceObligation_pkey" PRIMARY KEY ("id")
        );`,
        `CREATE INDEX IF NOT EXISTS "ComplianceObligation_countryCode_idx" ON "ComplianceObligation"("countryCode");`,

        `CREATE TABLE IF NOT EXISTS "ComplianceFiling" (
          "id" TEXT NOT NULL, "complianceId" TEXT NOT NULL, "payrollRunId" TEXT,
          "filingPeriod" TEXT NOT NULL, "filingStatus" TEXT NOT NULL DEFAULT 'GENERATED',
          "generatedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "submittedDate" TIMESTAMP(3),
          "acknowledgementRef" TEXT, "filingAmount" DOUBLE PRECISION, "penaltyAmount" DOUBLE PRECISION,
          "filePath" TEXT, "submittedBy" TEXT, "reviewedBy" TEXT, "rejectionReason" TEXT,
          "resubmissionDate" TIMESTAMP(3),
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "ComplianceFiling_pkey" PRIMARY KEY ("id")
        );`,
        `CREATE INDEX IF NOT EXISTS "ComplianceFiling_complianceId_idx" ON "ComplianceFiling"("complianceId");`,

        `CREATE TABLE IF NOT EXISTS "GLAccountMapping" (
          "id" TEXT NOT NULL, "legalEntityId" TEXT NOT NULL, "componentId" TEXT NOT NULL,
          "debitAccount" TEXT NOT NULL, "creditAccount" TEXT NOT NULL,
          "costCenterSource" TEXT NOT NULL DEFAULT 'EMPLOYEE_DEFAULT', "specificCostCenter" TEXT,
          "postingType" TEXT NOT NULL DEFAULT 'ACTUAL', "intercompanyAccount" TEXT,
          "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "effectiveTo" TIMESTAMP(3),
          "companyId" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "GLAccountMapping_pkey" PRIMARY KEY ("id")
        );`,
        `CREATE INDEX IF NOT EXISTS "GLAccountMapping_legalEntityId_idx" ON "GLAccountMapping"("legalEntityId");`,

        // Foreign keys
        `DO $$ BEGIN ALTER TABLE "StatutoryComponent" ADD CONSTRAINT "StatutoryComponent_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "PayrollComponent"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN OTHERS THEN NULL; END $$;`,
        `DO $$ BEGIN ALTER TABLE "CTCComponentMapping" ADD CONSTRAINT "CTCComponentMapping_ctcTemplateId_fkey" FOREIGN KEY ("ctcTemplateId") REFERENCES "CTCTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN OTHERS THEN NULL; END $$;`,
        `DO $$ BEGIN ALTER TABLE "TaxSlabRateLine" ADD CONSTRAINT "TaxSlabRateLine_slabTableId_fkey" FOREIGN KEY ("slabTableId") REFERENCES "TaxSlabTable"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN OTHERS THEN NULL; END $$;`,
        `DO $$ BEGIN ALTER TABLE "PayrollInput" ADD CONSTRAINT "PayrollInput_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON UPDATE CASCADE; EXCEPTION WHEN OTHERS THEN NULL; END $$;`,
        `DO $$ BEGIN ALTER TABLE "EmployeeDimensionAllocation" ADD CONSTRAINT "EmployeeDimensionAllocation_dimensionId_fkey" FOREIGN KEY ("dimensionId") REFERENCES "DimensionDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN OTHERS THEN NULL; END $$;`,
        `DO $$ BEGIN ALTER TABLE "PayrollTransactionLine" ADD CONSTRAINT "PayrollTransactionLine_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN OTHERS THEN NULL; END $$;`,
        `DO $$ BEGIN ALTER TABLE "PayrollTransactionLine" ADD CONSTRAINT "PayrollTransactionLine_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "PayrollComponent"("id") ON UPDATE CASCADE; EXCEPTION WHEN OTHERS THEN NULL; END $$;`,
        `DO $$ BEGIN ALTER TABLE "ComplianceFiling" ADD CONSTRAINT "ComplianceFiling_complianceId_fkey" FOREIGN KEY ("complianceId") REFERENCES "ComplianceObligation"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN OTHERS THEN NULL; END $$;`,
        `DO $$ BEGIN ALTER TABLE "ComplianceFiling" ADD CONSTRAINT "ComplianceFiling_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON UPDATE CASCADE; EXCEPTION WHEN OTHERS THEN NULL; END $$;`,
        `DO $$ BEGIN ALTER TABLE "GLAccountMapping" ADD CONSTRAINT "GLAccountMapping_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "PayrollComponent"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN OTHERS THEN NULL; END $$;`,
      ];

      for (const sql of sqls) {
        try {
          await db.$executeRawUnsafe(sql);
        } catch (e: any) {
          // Continue - table/index/constraint may already exist
          console.log(`[Setup SQL note]: ${e.message?.substring(0, 80)}`);
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: tableExists
        ? 'Payroll tables already exist. Call /api/seed/payroll to seed data.'
        : 'Payroll tables created. Call /api/seed/payroll to seed data.',
      tableStatus: tableExists ? 'existed' : 'created'
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
