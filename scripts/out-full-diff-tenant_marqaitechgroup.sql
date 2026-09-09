-- AlterTable
ALTER TABLE "AttendanceWorkflowConfig" ADD COLUMN     "branchId" TEXT,
ADD COLUMN     "departmentId" TEXT,
ADD COLUMN     "employeeStatus" TEXT NOT NULL DEFAULT 'all',
ADD COLUMN     "employmentType" TEXT NOT NULL DEFAULT 'all',
ADD COLUMN     "policyDocumentId" TEXT;

-- AlterTable
ALTER TABLE "LeaveWorkflowConfig" ADD COLUMN     "branchId" TEXT,
ADD COLUMN     "companyId" TEXT,
ADD COLUMN     "departmentId" TEXT,
ADD COLUMN     "employeeStatus" TEXT NOT NULL DEFAULT 'all',
ADD COLUMN     "employmentType" TEXT NOT NULL DEFAULT 'all',
ADD COLUMN     "policyDocumentId" TEXT;

-- DropTable
DROP TABLE "Rejoin";

-- DropTable
DROP TABLE "Resignation";

-- DropTable
DROP TABLE "Termination";

-- DropTable
DROP TABLE "Transfer";

-- CreateIndex
CREATE INDEX "AttendanceWorkflowConfig_employmentType_idx" ON "AttendanceWorkflowConfig"("employmentType");

-- CreateIndex
CREATE INDEX "AttendanceWorkflowConfig_branchId_idx" ON "AttendanceWorkflowConfig"("branchId");

-- CreateIndex
CREATE INDEX "AttendanceWorkflowConfig_departmentId_idx" ON "AttendanceWorkflowConfig"("departmentId");

-- CreateIndex
CREATE INDEX "LeaveWorkflowConfig_employmentType_idx" ON "LeaveWorkflowConfig"("employmentType");

-- CreateIndex
CREATE INDEX "LeaveWorkflowConfig_branchId_idx" ON "LeaveWorkflowConfig"("branchId");

-- CreateIndex
CREATE INDEX "LeaveWorkflowConfig_departmentId_idx" ON "LeaveWorkflowConfig"("departmentId");

