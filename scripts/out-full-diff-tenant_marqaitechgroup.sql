-- AlterTable
ALTER TABLE "Offer" ADD COLUMN     "approvalTiers" TEXT;

-- DropTable
DROP TABLE "Rejoin";

-- DropTable
DROP TABLE "Resignation";

-- DropTable
DROP TABLE "Termination";

-- DropTable
DROP TABLE "Transfer";

-- CreateTable
CREATE TABLE "RecruitmentWorkflowConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "workflowType" TEXT NOT NULL DEFAULT 'recruitment',
    "name" TEXT NOT NULL DEFAULT 'Recruitment Workflow',
    "description" TEXT,
    "config" TEXT NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecruitmentWorkflowConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecruitmentWorkflowConfig_tenantId_workflowType_idx" ON "RecruitmentWorkflowConfig"("tenantId", "workflowType");

-- CreateIndex
CREATE UNIQUE INDEX "RecruitmentWorkflowConfig_tenantId_workflowType_companyId_key" ON "RecruitmentWorkflowConfig"("tenantId", "workflowType", "companyId");

