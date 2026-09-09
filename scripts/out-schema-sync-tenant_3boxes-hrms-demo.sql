-- ADDITIVE-ONLY schema sync for tenant_3boxes-hrms-demo
-- generated from prisma migrate diff vs schema.prisma

ALTER TABLE "AttendanceWorkflowConfig" ADD COLUMN     "branchId" TEXT,
ADD COLUMN     "departmentId" TEXT,
ADD COLUMN     "employeeStatus" TEXT NOT NULL DEFAULT 'all',
ADD COLUMN     "employmentType" TEXT NOT NULL DEFAULT 'all',
ADD COLUMN     "policyDocumentId" TEXT;
ALTER TABLE "LeaveWorkflowConfig" ADD COLUMN     "branchId" TEXT,
ADD COLUMN     "companyId" TEXT,
ADD COLUMN     "departmentId" TEXT,
ADD COLUMN     "employeeStatus" TEXT NOT NULL DEFAULT 'all',
ADD COLUMN     "employmentType" TEXT NOT NULL DEFAULT 'all',
ADD COLUMN     "policyDocumentId" TEXT;
CREATE INDEX "AttendanceWorkflowConfig_employmentType_idx" ON "AttendanceWorkflowConfig"("employmentType");
CREATE INDEX "AttendanceWorkflowConfig_branchId_idx" ON "AttendanceWorkflowConfig"("branchId");
CREATE INDEX "AttendanceWorkflowConfig_departmentId_idx" ON "AttendanceWorkflowConfig"("departmentId");
CREATE INDEX "LeaveWorkflowConfig_employmentType_idx" ON "LeaveWorkflowConfig"("employmentType");
CREATE INDEX "LeaveWorkflowConfig_branchId_idx" ON "LeaveWorkflowConfig"("branchId");
CREATE INDEX "LeaveWorkflowConfig_departmentId_idx" ON "LeaveWorkflowConfig"("departmentId");