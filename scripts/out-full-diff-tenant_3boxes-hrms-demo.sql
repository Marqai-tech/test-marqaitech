-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'other',
ADD COLUMN     "expiryAlertDays" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "expiryAlertSent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "fileNodeId" TEXT,
ADD COLUMN     "isRequested" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maxFileSizeMb" INTEGER,
ADD COLUMN     "requestedAt" TIMESTAMP(3),
ADD COLUMN     "requestedById" TEXT,
ADD COLUMN     "requiredFormat" TEXT,
ADD COLUMN     "uploadedById" TEXT;

-- AlterTable
ALTER TABLE "LeaveType" ADD COLUMN     "employeeStatus" TEXT NOT NULL DEFAULT 'all',
ADD COLUMN     "employmentType" TEXT NOT NULL DEFAULT 'all',
ADD COLUMN     "probationRestricted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sandwichRuleEnabled" BOOLEAN NOT NULL DEFAULT true;

-- DropTable
DROP TABLE "Rejoin";

-- DropTable
DROP TABLE "Resignation";

-- DropTable
DROP TABLE "Termination";

-- DropTable
DROP TABLE "Transfer";

-- CreateTable
CREATE TABLE "EmployeeUpdateRequest" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "fieldLabel" TEXT,
    "category" TEXT NOT NULL DEFAULT 'personal',
    "oldValue" TEXT,
    "newValue" TEXT NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "currentTier" INTEGER NOT NULL DEFAULT 1,
    "configSnapshot" TEXT,
    "documentId" TEXT,
    "requestedById" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approverUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approverComments" TEXT,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeUpdateRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeUpdateApprovalStep" (
    "id" TEXT NOT NULL,
    "updateRequestId" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "approverType" TEXT NOT NULL,
    "approverUserId" TEXT,
    "approverName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "comments" TEXT,
    "actedAt" TIMESTAMP(3),
    "slaAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeUpdateApprovalStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeWorkflowConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "name" TEXT NOT NULL DEFAULT 'Default Employee Update Workflow',
    "description" TEXT,
    "config" TEXT NOT NULL,
    "employmentType" TEXT NOT NULL DEFAULT 'all',
    "branchId" TEXT,
    "departmentId" TEXT,
    "employeeStatus" TEXT NOT NULL DEFAULT 'all',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeWorkflowConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmployeeUpdateRequest_employeeId_idx" ON "EmployeeUpdateRequest"("employeeId");

-- CreateIndex
CREATE INDEX "EmployeeUpdateRequest_status_idx" ON "EmployeeUpdateRequest"("status");

-- CreateIndex
CREATE INDEX "EmployeeUpdateRequest_fieldName_idx" ON "EmployeeUpdateRequest"("fieldName");

-- CreateIndex
CREATE INDEX "EmployeeUpdateApprovalStep_updateRequestId_idx" ON "EmployeeUpdateApprovalStep"("updateRequestId");

-- CreateIndex
CREATE INDEX "EmployeeUpdateApprovalStep_approverUserId_status_idx" ON "EmployeeUpdateApprovalStep"("approverUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeUpdateApprovalStep_updateRequestId_tier_key" ON "EmployeeUpdateApprovalStep"("updateRequestId", "tier");

-- CreateIndex
CREATE INDEX "EmployeeWorkflowConfig_tenantId_idx" ON "EmployeeWorkflowConfig"("tenantId");

-- CreateIndex
CREATE INDEX "EmployeeWorkflowConfig_employmentType_idx" ON "EmployeeWorkflowConfig"("employmentType");

-- CreateIndex
CREATE INDEX "Document_category_idx" ON "Document"("category");

-- CreateIndex
CREATE INDEX "Document_type_idx" ON "Document"("type");

-- CreateIndex
CREATE INDEX "Document_expiryDate_idx" ON "Document"("expiryDate");

-- CreateIndex
CREATE INDEX "LeaveType_employmentType_idx" ON "LeaveType"("employmentType");

-- AddForeignKey
ALTER TABLE "EmployeeUpdateRequest" ADD CONSTRAINT "EmployeeUpdateRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeUpdateApprovalStep" ADD CONSTRAINT "EmployeeUpdateApprovalStep_updateRequestId_fkey" FOREIGN KEY ("updateRequestId") REFERENCES "EmployeeUpdateRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

