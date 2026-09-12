-- ADDITIVE-ONLY schema sync for tenant_marqaitechgroup
-- generated from prisma migrate diff vs schema.prisma

ALTER TABLE "Offer" ADD COLUMN     "approvalTiers" TEXT;
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
CREATE INDEX "RecruitmentWorkflowConfig_tenantId_workflowType_idx" ON "RecruitmentWorkflowConfig"("tenantId", "workflowType");
CREATE UNIQUE INDEX "RecruitmentWorkflowConfig_tenantId_workflowType_companyId_key" ON "RecruitmentWorkflowConfig"("tenantId", "workflowType", "companyId");