-- ADDITIVE-ONLY schema sync for tenant_marqaitechgroup
-- generated from prisma migrate diff vs schema.prisma

ALTER TABLE "Employee" ADD COLUMN     "defaultWeeklyHours" INTEGER,
ADD COLUMN     "timezone" TEXT;
ALTER TABLE "KanbanBoard" ADD COLUMN     "projectId" TEXT;
ALTER TABLE "KanbanCard" ADD COLUMN     "projectTaskId" TEXT;
ALTER TABLE "Project" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedBy" TEXT,
ADD COLUMN     "businessObjective" TEXT,
ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "costCenter" TEXT,
ADD COLUMN     "executiveSponsor" TEXT,
ADD COLUMN     "intakeStatus" TEXT,
ADD COLUMN     "methodology" TEXT,
ADD COLUMN     "signOffBy" TEXT,
ADD COLUMN     "signOffNotes" TEXT,
ADD COLUMN     "sprintDuration" INTEGER NOT NULL DEFAULT 14,
ADD COLUMN     "submittedAt" TIMESTAMP(3),
ADD COLUMN     "targetCompletionDate" TIMESTAMP(3),
ADD COLUMN     "travelBudgetRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "workspaceBoardId" TEXT,
ADD COLUMN     "workspaceRoomId" TEXT;
ALTER TABLE "ProjectMilestone" ADD COLUMN     "budgetCap" DOUBLE PRECISION,
ADD COLUMN     "isPhase" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sequence" INTEGER;
ALTER TABLE "ProjectTask" ADD COLUMN     "dependsOnId" TEXT,
ADD COLUMN     "sprintId" TEXT,
ADD COLUMN     "storyPoints" INTEGER;
CREATE TABLE "Sprint" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "goal" TEXT,
    "sprintNumber" INTEGER NOT NULL DEFAULT 1,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "committedPoints" INTEGER NOT NULL DEFAULT 0,
    "completedPoints" INTEGER NOT NULL DEFAULT 0,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sprint_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ProjectRoleRequirement" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "requiredSkills" TEXT,
    "estimatedHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "allocationPct" INTEGER,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'open',
    "matchedEmployees" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectRoleRequirement_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "EmployeeCostRate" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "hourlyCostRateEnc" TEXT NOT NULL,
    "hourlyBillableRateEnc" TEXT,
    "weeklyHours" INTEGER NOT NULL DEFAULT 40,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeCostRate_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ProjectApprovalStep" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "gateType" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "level" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT,
    "approverType" TEXT NOT NULL,
    "approverValue" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "comments" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectApprovalStep_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ProjectIntegration" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "baseUrl" TEXT,
    "projectKey" TEXT,
    "username" TEXT,
    "tokenEnc" TEXT,
    "mapping" TEXT,
    "status" TEXT NOT NULL DEFAULT 'connected',
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncResult" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectIntegration_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ProjectReview" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "reviewerEmployeeId" TEXT NOT NULL,
    "reviewType" TEXT NOT NULL DEFAULT 'post_mortem',
    "deliveryQuality" INTEGER NOT NULL DEFAULT 3,
    "communication" INTEGER NOT NULL DEFAULT 3,
    "speed" INTEGER NOT NULL DEFAULT 3,
    "overall" INTEGER,
    "comments" TEXT,
    "skillUpgradeSuggestion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectReview_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ProjectActivity" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "employeeId" TEXT,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "meta" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectActivity_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ProjectWorkflowConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "name" TEXT NOT NULL DEFAULT 'Project Delivery Workflow',
    "description" TEXT,
    "config" TEXT NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectWorkflowConfig_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Sprint_projectId_idx" ON "Sprint"("projectId");
CREATE INDEX "Sprint_status_idx" ON "Sprint"("status");
CREATE UNIQUE INDEX "Sprint_projectId_sprintNumber_key" ON "Sprint"("projectId", "sprintNumber");
CREATE INDEX "ProjectRoleRequirement_projectId_idx" ON "ProjectRoleRequirement"("projectId");
CREATE INDEX "ProjectRoleRequirement_status_idx" ON "ProjectRoleRequirement"("status");
CREATE INDEX "EmployeeCostRate_employeeId_idx" ON "EmployeeCostRate"("employeeId");
CREATE INDEX "ProjectApprovalStep_projectId_gateType_idx" ON "ProjectApprovalStep"("projectId", "gateType");
CREATE INDEX "ProjectApprovalStep_entityType_entityId_idx" ON "ProjectApprovalStep"("entityType", "entityId");
CREATE INDEX "ProjectIntegration_projectId_idx" ON "ProjectIntegration"("projectId");
CREATE UNIQUE INDEX "ProjectIntegration_projectId_provider_key" ON "ProjectIntegration"("projectId", "provider");
CREATE INDEX "ProjectReview_employeeId_idx" ON "ProjectReview"("employeeId");
CREATE UNIQUE INDEX "ProjectReview_projectId_employeeId_key" ON "ProjectReview"("projectId", "employeeId");
CREATE INDEX "ProjectActivity_projectId_idx" ON "ProjectActivity"("projectId");
CREATE INDEX "ProjectActivity_createdAt_idx" ON "ProjectActivity"("createdAt");
CREATE INDEX "ProjectWorkflowConfig_tenantId_idx" ON "ProjectWorkflowConfig"("tenantId");
CREATE UNIQUE INDEX "ProjectWorkflowConfig_tenantId_companyId_key" ON "ProjectWorkflowConfig"("tenantId", "companyId");
ALTER TABLE "ProjectTask" ADD CONSTRAINT "ProjectTask_sprintId_fkey" FOREIGN KEY ("sprintId") REFERENCES "Sprint"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectTask" ADD CONSTRAINT "ProjectTask_dependsOnId_fkey" FOREIGN KEY ("dependsOnId") REFERENCES "ProjectTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Sprint" ADD CONSTRAINT "Sprint_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectRoleRequirement" ADD CONSTRAINT "ProjectRoleRequirement_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeCostRate" ADD CONSTRAINT "EmployeeCostRate_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectApprovalStep" ADD CONSTRAINT "ProjectApprovalStep_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectIntegration" ADD CONSTRAINT "ProjectIntegration_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectReview" ADD CONSTRAINT "ProjectReview_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectReview" ADD CONSTRAINT "ProjectReview_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectReview" ADD CONSTRAINT "ProjectReview_reviewerEmployeeId_fkey" FOREIGN KEY ("reviewerEmployeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectActivity" ADD CONSTRAINT "ProjectActivity_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectActivity" ADD CONSTRAINT "ProjectActivity_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "KanbanCard" ADD CONSTRAINT "KanbanCard_projectTaskId_fkey" FOREIGN KEY ("projectTaskId") REFERENCES "ProjectTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;