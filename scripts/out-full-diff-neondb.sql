-- DropForeignKey
ALTER TABLE "CalendarSync" DROP CONSTRAINT "CalendarSync_employeeId_fkey";

-- DropForeignKey
ALTER TABLE "CallLog" DROP CONSTRAINT "CallLog_initiatorId_fkey";

-- DropForeignKey
ALTER TABLE "CallParticipant" DROP CONSTRAINT "CallParticipant_callId_fkey";

-- DropForeignKey
ALTER TABLE "CallParticipant" DROP CONSTRAINT "CallParticipant_userId_fkey";

-- DropForeignKey
ALTER TABLE "CandidateSentimentScore" DROP CONSTRAINT "CandidateSentimentScore_jobApplicationId_fkey";

-- DropForeignKey
ALTER TABLE "CandidateTalentPool" DROP CONSTRAINT "CandidateTalentPool_jobApplicationId_fkey";

-- DropForeignKey
ALTER TABLE "ChatMessage" DROP CONSTRAINT "ChatMessage_parentMessageId_fkey";

-- DropForeignKey
ALTER TABLE "ChatMessage" DROP CONSTRAINT "ChatMessage_roomId_fkey";

-- DropForeignKey
ALTER TABLE "ChatMessage" DROP CONSTRAINT "ChatMessage_senderId_fkey";

-- DropForeignKey
ALTER TABLE "ChatRoomMember" DROP CONSTRAINT "ChatRoomMember_roomId_fkey";

-- DropForeignKey
ALTER TABLE "ChatSummary" DROP CONSTRAINT "ChatSummary_roomId_fkey";

-- DropForeignKey
ALTER TABLE "DLPScanLog" DROP CONSTRAINT "DLPScanLog_userId_fkey";

-- DropForeignKey
ALTER TABLE "DocumentIntelligenceResult" DROP CONSTRAINT "DocumentIntelligenceResult_employeeId_fkey";

-- DropForeignKey
ALTER TABLE "DottedLineManager" DROP CONSTRAINT "DottedLineManager_employeeId_fkey";

-- DropForeignKey
ALTER TABLE "DottedLineManager" DROP CONSTRAINT "DottedLineManager_managerId_fkey";

-- DropForeignKey
ALTER TABLE "EmailMessage" DROP CONSTRAINT "EmailMessage_companyId_fkey";

-- DropForeignKey
ALTER TABLE "EmployeeCustomFieldValue" DROP CONSTRAINT "EmployeeCustomFieldValue_employeeId_fkey";

-- DropForeignKey
ALTER TABLE "EmployeeCustomFieldValue" DROP CONSTRAINT "EmployeeCustomFieldValue_fieldId_fkey";

-- DropForeignKey
ALTER TABLE "FileNode" DROP CONSTRAINT "FileNode_ownerEmployeeId_fkey";

-- DropForeignKey
ALTER TABLE "FileNode" DROP CONSTRAINT "FileNode_parentId_fkey";

-- DropForeignKey
ALTER TABLE "FileNode" DROP CONSTRAINT "FileNode_uploadedById_fkey";

-- DropForeignKey
ALTER TABLE "FileShareLink" DROP CONSTRAINT "FileShareLink_createdBy_fkey";

-- DropForeignKey
ALTER TABLE "FileShareLink" DROP CONSTRAINT "FileShareLink_fileId_fkey";

-- DropForeignKey
ALTER TABLE "FileVersion" DROP CONSTRAINT "FileVersion_fileId_fkey";

-- DropForeignKey
ALTER TABLE "FileVersion" DROP CONSTRAINT "FileVersion_uploadedById_fkey";

-- DropForeignKey
ALTER TABLE "GDPRAnonymizationRequest" DROP CONSTRAINT "GDPRAnonymizationRequest_employeeId_fkey";

-- DropForeignKey
ALTER TABLE "JobBoardPosting" DROP CONSTRAINT "JobBoardPosting_jobPostingId_fkey";

-- DropForeignKey
ALTER TABLE "Note" DROP CONSTRAINT "Note_createdById_fkey";

-- DropForeignKey
ALTER TABLE "OKR" DROP CONSTRAINT "OKR_ownerId_fkey";

-- DropForeignKey
ALTER TABLE "ResumeParse" DROP CONSTRAINT "ResumeParse_jobApplicationId_fkey";

-- DropForeignKey
ALTER TABLE "SocialProfile" DROP CONSTRAINT "SocialProfile_employeeId_fkey";

-- DropForeignKey
ALTER TABLE "Team" DROP CONSTRAINT "Team_leadId_fkey";

-- DropForeignKey
ALTER TABLE "TeamMember" DROP CONSTRAINT "TeamMember_employeeId_fkey";

-- DropForeignKey
ALTER TABLE "TeamMember" DROP CONSTRAINT "TeamMember_teamId_fkey";

-- DropForeignKey
ALTER TABLE "TodoTask" DROP CONSTRAINT "TodoTask_createdById_fkey";

-- DropForeignKey
ALTER TABLE "WatermarkAccessLog" DROP CONSTRAINT "WatermarkAccessLog_fileId_fkey";

-- DropForeignKey
ALTER TABLE "WatermarkAccessLog" DROP CONSTRAINT "WatermarkAccessLog_userId_fkey";

-- DropIndex
DROP INDEX "Geofence_isActive_idx";

-- DropIndex
DROP INDEX "Holiday_country_idx";

-- DropIndex
DROP INDEX "Holiday_date_idx";

-- DropIndex
DROP INDEX "Holiday_type_idx";

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "defaultWeeklyHours" INTEGER,
ADD COLUMN     "timezone" TEXT;

-- AlterTable
ALTER TABLE "EmployeeWorkflowConfig" ADD COLUMN     "workflowType" TEXT NOT NULL DEFAULT 'update_profile';

-- AlterTable
ALTER TABLE "KanbanBoard" ADD COLUMN     "projectId" TEXT;

-- AlterTable
ALTER TABLE "KanbanCard" ADD COLUMN     "projectTaskId" TEXT;

-- AlterTable
ALTER TABLE "LeaveType" ADD COLUMN     "companyId" TEXT NOT NULL,
ADD COLUMN     "employeeStatus" TEXT NOT NULL DEFAULT 'all',
ADD COLUMN     "employmentType" TEXT NOT NULL DEFAULT 'all',
ADD COLUMN     "probationRestricted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sandwichRuleEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Offer" ADD COLUMN     "accessToken" TEXT,
ADD COLUMN     "approvalTiers" TEXT,
ADD COLUMN     "candidateSignature" TEXT,
ADD COLUMN     "candidateSignedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "OnboardingTask" ADD COLUMN     "kra" TEXT,
ADD COLUMN     "lastRemindedAt" TIMESTAMP(3),
ADD COLUMN     "mentorEmployeeId" TEXT,
ADD COLUMN     "priority" TEXT NOT NULL DEFAULT 'medium',
ADD COLUMN     "remindersEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "trainingModule" TEXT;

-- AlterTable
ALTER TABLE "Policy" ADD COLUMN     "companyId" TEXT NOT NULL,
ADD COLUMN     "fileMimeType" TEXT,
ADD COLUMN     "fileName" TEXT,
ADD COLUMN     "fileSize" INTEGER,
ADD COLUMN     "fileUrl" TEXT;

-- AlterTable
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

-- AlterTable
ALTER TABLE "ProjectMilestone" ADD COLUMN     "budgetCap" DOUBLE PRECISION,
ADD COLUMN     "isPhase" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sequence" INTEGER;

-- AlterTable
ALTER TABLE "ProjectTask" ADD COLUMN     "dependsOnId" TEXT,
ADD COLUMN     "sprintId" TEXT,
ADD COLUMN     "storyPoints" INTEGER;

-- AlterTable
ALTER TABLE "Shift" ADD COLUMN     "companyId" TEXT NOT NULL;

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateIndex
CREATE INDEX "Sprint_projectId_idx" ON "Sprint"("projectId");

-- CreateIndex
CREATE INDEX "Sprint_status_idx" ON "Sprint"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Sprint_projectId_sprintNumber_key" ON "Sprint"("projectId", "sprintNumber");

-- CreateIndex
CREATE INDEX "ProjectRoleRequirement_projectId_idx" ON "ProjectRoleRequirement"("projectId");

-- CreateIndex
CREATE INDEX "ProjectRoleRequirement_status_idx" ON "ProjectRoleRequirement"("status");

-- CreateIndex
CREATE INDEX "EmployeeCostRate_employeeId_idx" ON "EmployeeCostRate"("employeeId");

-- CreateIndex
CREATE INDEX "ProjectApprovalStep_projectId_gateType_idx" ON "ProjectApprovalStep"("projectId", "gateType");

-- CreateIndex
CREATE INDEX "ProjectApprovalStep_entityType_entityId_idx" ON "ProjectApprovalStep"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "ProjectIntegration_projectId_idx" ON "ProjectIntegration"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectIntegration_projectId_provider_key" ON "ProjectIntegration"("projectId", "provider");

-- CreateIndex
CREATE INDEX "ProjectReview_employeeId_idx" ON "ProjectReview"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectReview_projectId_employeeId_key" ON "ProjectReview"("projectId", "employeeId");

-- CreateIndex
CREATE INDEX "ProjectActivity_projectId_idx" ON "ProjectActivity"("projectId");

-- CreateIndex
CREATE INDEX "ProjectActivity_createdAt_idx" ON "ProjectActivity"("createdAt");

-- CreateIndex
CREATE INDEX "ProjectWorkflowConfig_tenantId_idx" ON "ProjectWorkflowConfig"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectWorkflowConfig_tenantId_companyId_key" ON "ProjectWorkflowConfig"("tenantId", "companyId");

-- CreateIndex
CREATE INDEX "LeaveType_companyId_idx" ON "LeaveType"("companyId");

-- CreateIndex
CREATE INDEX "LeaveType_employmentType_idx" ON "LeaveType"("employmentType");

-- CreateIndex
CREATE UNIQUE INDEX "Offer_accessToken_key" ON "Offer"("accessToken");

-- CreateIndex
CREATE INDEX "Policy_companyId_idx" ON "Policy"("companyId");

-- CreateIndex
CREATE INDEX "Shift_companyId_idx" ON "Shift"("companyId");

-- AddForeignKey
ALTER TABLE "LeaveType" ADD CONSTRAINT "LeaveType_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Policy" ADD CONSTRAINT "Policy_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyDocumentVersion" ADD CONSTRAINT "PolicyDocumentVersion_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "Policy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyAcknowledgment" ADD CONSTRAINT "PolicyAcknowledgment_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "Policy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyAcknowledgment" ADD CONSTRAINT "PolicyAcknowledgment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Holiday" ADD CONSTRAINT "Holiday_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTask" ADD CONSTRAINT "ProjectTask_sprintId_fkey" FOREIGN KEY ("sprintId") REFERENCES "Sprint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTask" ADD CONSTRAINT "ProjectTask_dependsOnId_fkey" FOREIGN KEY ("dependsOnId") REFERENCES "ProjectTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sprint" ADD CONSTRAINT "Sprint_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectRoleRequirement" ADD CONSTRAINT "ProjectRoleRequirement_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeCostRate" ADD CONSTRAINT "EmployeeCostRate_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectApprovalStep" ADD CONSTRAINT "ProjectApprovalStep_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectIntegration" ADD CONSTRAINT "ProjectIntegration_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectReview" ADD CONSTRAINT "ProjectReview_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectReview" ADD CONSTRAINT "ProjectReview_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectReview" ADD CONSTRAINT "ProjectReview_reviewerEmployeeId_fkey" FOREIGN KEY ("reviewerEmployeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectActivity" ADD CONSTRAINT "ProjectActivity_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectActivity" ADD CONSTRAINT "ProjectActivity_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OKR" ADD CONSTRAINT "OKR_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeCustomFieldValue" ADD CONSTRAINT "EmployeeCustomFieldValue_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeCustomFieldValue" ADD CONSTRAINT "EmployeeCustomFieldValue_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "EmployeeCustomField"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DottedLineManager" ADD CONSTRAINT "DottedLineManager_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DottedLineManager" ADD CONSTRAINT "DottedLineManager_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialProfile" ADD CONSTRAINT "SocialProfile_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarSync" ADD CONSTRAINT "CalendarSync_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatRoomMember" ADD CONSTRAINT "ChatRoomMember_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "ChatRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "ChatRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_parentMessageId_fkey" FOREIGN KEY ("parentMessageId") REFERENCES "ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallLog" ADD CONSTRAINT "CallLog_initiatorId_fkey" FOREIGN KEY ("initiatorId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallParticipant" ADD CONSTRAINT "CallParticipant_callId_fkey" FOREIGN KEY ("callId") REFERENCES "CallLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallParticipant" ADD CONSTRAINT "CallParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileNode" ADD CONSTRAINT "FileNode_ownerEmployeeId_fkey" FOREIGN KEY ("ownerEmployeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileNode" ADD CONSTRAINT "FileNode_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "FileNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileNode" ADD CONSTRAINT "FileNode_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileVersion" ADD CONSTRAINT "FileVersion_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "FileNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileVersion" ADD CONSTRAINT "FileVersion_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileShareLink" ADD CONSTRAINT "FileShareLink_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "FileNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileShareLink" ADD CONSTRAINT "FileShareLink_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentIntelligenceResult" ADD CONSTRAINT "DocumentIntelligenceResult_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatSummary" ADD CONSTRAINT "ChatSummary_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "ChatRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DLPScanLog" ADD CONSTRAINT "DLPScanLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GDPRAnonymizationRequest" ADD CONSTRAINT "GDPRAnonymizationRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatermarkAccessLog" ADD CONSTRAINT "WatermarkAccessLog_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "FileNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatermarkAccessLog" ADD CONSTRAINT "WatermarkAccessLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResumeParse" ADD CONSTRAINT "ResumeParse_jobApplicationId_fkey" FOREIGN KEY ("jobApplicationId") REFERENCES "JobApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateSentimentScore" ADD CONSTRAINT "CandidateSentimentScore_jobApplicationId_fkey" FOREIGN KEY ("jobApplicationId") REFERENCES "JobApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobBoardPosting" ADD CONSTRAINT "JobBoardPosting_jobPostingId_fkey" FOREIGN KEY ("jobPostingId") REFERENCES "JobPosting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveAttachment" ADD CONSTRAINT "LeaveAttachment_leaveRequestId_fkey" FOREIGN KEY ("leaveRequestId") REFERENCES "LeaveRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletBucket" ADD CONSTRAINT "WalletBucket_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceOrder" ADD CONSTRAINT "MarketplaceOrder_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsurancePolicy" ADD CONSTRAINT "InsurancePolicy_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceClaim" ADD CONSTRAINT "InsuranceClaim_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EWARequest" ADD CONSTRAINT "EWARequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanMarketplaceListing" ADD CONSTRAINT "LoanMarketplaceListing_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gift" ADD CONSTRAINT "Gift_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gift" ADD CONSTRAINT "Gift_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardPointsLedger" ADD CONSTRAINT "RewardPointsLedger_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceFraudFlag" ADD CONSTRAINT "MarketplaceFraudFlag_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialStressFlag" ADD CONSTRAINT "FinancialStressFlag_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletBudgetAllocation" ADD CONSTRAINT "WalletBudgetAllocation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantCountryAccess" ADD CONSTRAINT "TenantCountryAccess_tenantConfigId_fkey" FOREIGN KEY ("tenantConfigId") REFERENCES "TenantConfiguration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantCurrencyAccess" ADD CONSTRAINT "TenantCurrencyAccess_tenantConfigId_fkey" FOREIGN KEY ("tenantConfigId") REFERENCES "TenantConfiguration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantLanguageAccess" ADD CONSTRAINT "TenantLanguageAccess_tenantConfigId_fkey" FOREIGN KEY ("tenantConfigId") REFERENCES "TenantConfiguration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantPayrollPolicy" ADD CONSTRAINT "TenantPayrollPolicy_tenantConfigId_fkey" FOREIGN KEY ("tenantConfigId") REFERENCES "TenantConfiguration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TodoTask" ADD CONSTRAINT "TodoTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KanbanCard" ADD CONSTRAINT "KanbanCard_projectTaskId_fkey" FOREIGN KEY ("projectTaskId") REFERENCES "ProjectTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "AIKnowledgeQuery_user_idx" RENAME TO "AIKnowledgeQuery_userId_idx";

-- RenameIndex
ALTER INDEX "CalendarSync_employee_idx" RENAME TO "CalendarSync_employeeId_idx";

-- RenameIndex
ALTER INDEX "CallLog_initiator_idx" RENAME TO "CallLog_initiatorId_idx";

-- RenameIndex
ALTER INDEX "CallLog_room_idx" RENAME TO "CallLog_roomId_idx";

-- RenameIndex
ALTER INDEX "CallLog_started_idx" RENAME TO "CallLog_startedAt_idx";

-- RenameIndex
ALTER INDEX "CallParticipant_call_idx" RENAME TO "CallParticipant_callId_idx";

-- RenameIndex
ALTER INDEX "ChatMessage_parent_idx" RENAME TO "ChatMessage_parentMessageId_idx";

-- RenameIndex
ALTER INDEX "ChatMessage_room_created_idx" RENAME TO "ChatMessage_roomId_createdAt_idx";

-- RenameIndex
ALTER INDEX "ChatMessage_sender_idx" RENAME TO "ChatMessage_senderId_idx";

-- RenameIndex
ALTER INDEX "ChatRoom_company_idx" RENAME TO "ChatRoom_companyId_idx";

-- RenameIndex
ALTER INDEX "ChatRoom_project_idx" RENAME TO "ChatRoom_projectId_idx";

-- RenameIndex
ALTER INDEX "ChatRoomMember_room_idx" RENAME TO "ChatRoomMember_roomId_idx";

-- RenameIndex
ALTER INDEX "ChatRoomMember_user_idx" RENAME TO "ChatRoomMember_userId_idx";

-- RenameIndex
ALTER INDEX "CollabFeatureFlag_tenant_idx" RENAME TO "CollaborationFeatureFlag_tenantId_idx";

-- RenameIndex
ALTER INDEX "CommunicationPolicy_tenant_idx" RENAME TO "CommunicationPolicy_tenantId_idx";

-- RenameIndex
ALTER INDEX "DLPScanLog_source_idx" RENAME TO "DLPScanLog_sourceType_sourceId_idx";

-- RenameIndex
ALTER INDEX "DLPScanLog_user_idx" RENAME TO "DLPScanLog_userId_idx";

-- RenameIndex
ALTER INDEX "DocIntelligence_doc_idx" RENAME TO "DocumentIntelligenceResult_documentId_idx";

-- RenameIndex
ALTER INDEX "DocIntelligence_employee_idx" RENAME TO "DocumentIntelligenceResult_employeeId_idx";

-- RenameIndex
ALTER INDEX "DocIntelligence_file_idx" RENAME TO "DocumentIntelligenceResult_fileId_idx";

-- RenameIndex
ALTER INDEX "DottedLineManager_employee_idx" RENAME TO "DottedLineManager_employeeId_idx";

-- RenameIndex
ALTER INDEX "DottedLineManager_manager_idx" RENAME TO "DottedLineManager_managerId_idx";

-- RenameIndex
ALTER INDEX "EmployeeCustomField_scope_country_company_idx" RENAME TO "EmployeeCustomField_scope_countryCode_companyId_idx";

-- RenameIndex
ALTER INDEX "EmployeeCustomFieldValue_employee_idx" RENAME TO "EmployeeCustomFieldValue_employeeId_idx";

-- RenameIndex
ALTER INDEX "EmployeeCustomFieldValue_field_idx" RENAME TO "EmployeeCustomFieldValue_fieldId_idx";

-- RenameIndex
ALTER INDEX "FileNode_drive_company_idx" RENAME TO "FileNode_driveType_companyId_idx";

-- RenameIndex
ALTER INDEX "FileNode_drive_owner_idx" RENAME TO "FileNode_driveType_ownerEmployeeId_idx";

-- RenameIndex
ALTER INDEX "FileNode_drive_project_idx" RENAME TO "FileNode_driveType_projectId_idx";

-- RenameIndex
ALTER INDEX "FileNode_parent_idx" RENAME TO "FileNode_parentId_idx";

-- RenameIndex
ALTER INDEX "FileShareLink_file_idx" RENAME TO "FileShareLink_fileId_idx";

-- RenameIndex
ALTER INDEX "FileShareLink_url_idx" RENAME TO "FileShareLink_shareUrl_idx";

-- RenameIndex
ALTER INDEX "FileVersion_file_version_idx" RENAME TO "FileVersion_fileId_versionNumber_idx";

-- RenameIndex
ALTER INDEX "GDPRAnon_employee_idx" RENAME TO "GDPRAnonymizationRequest_employeeId_idx";

-- RenameIndex
ALTER INDEX "GDPRAnon_status_idx" RENAME TO "GDPRAnonymizationRequest_status_idx";

-- RenameIndex
ALTER INDEX "LegalHold_target_user_idx" RENAME TO "LegalHold_targetUserId_idx";

-- RenameIndex
ALTER INDEX "LegalHold_tenant_status_idx" RENAME TO "LegalHold_tenantId_status_idx";

-- RenameIndex
ALTER INDEX "SSOProvider_tenant_idx" RENAME TO "SSOProvider_tenantId_idx";

-- RenameIndex
ALTER INDEX "SocialProfile_employee_idx" RENAME TO "SocialProfile_employeeId_idx";

-- RenameIndex
ALTER INDEX "StorageAnalytics_company_drive_idx" RENAME TO "StorageAnalytics_companyId_driveType_idx";

-- RenameIndex
ALTER INDEX "StorageAnalytics_tenant_snapshot_idx" RENAME TO "StorageAnalytics_tenantId_snapshotDate_idx";

-- RenameIndex
ALTER INDEX "StorageQuota_tenant_idx" RENAME TO "StorageQuota_tenantId_idx";

-- RenameIndex
ALTER INDEX "Team_company_idx" RENAME TO "Team_companyId_idx";

-- RenameIndex
ALTER INDEX "TeamMember_employee_idx" RENAME TO "TeamMember_employeeId_idx";

-- RenameIndex
ALTER INDEX "TeamMember_team_idx" RENAME TO "TeamMember_teamId_idx";

-- RenameIndex
ALTER INDEX "Watermark_file_created_idx" RENAME TO "WatermarkAccessLog_fileId_createdAt_idx";

-- RenameIndex
ALTER INDEX "Watermark_user_idx" RENAME TO "WatermarkAccessLog_userId_idx";

