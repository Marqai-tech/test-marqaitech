-- DropForeignKey
ALTER TABLE "BankPaymentFile" DROP CONSTRAINT "BankPaymentFile_payrollRunId_fkey";

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
ALTER TABLE "User" DROP CONSTRAINT "User_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "WatermarkAccessLog" DROP CONSTRAINT "WatermarkAccessLog_fileId_fkey";

-- DropForeignKey
ALTER TABLE "WatermarkAccessLog" DROP CONSTRAINT "WatermarkAccessLog_userId_fkey";

-- DropIndex
DROP INDEX "ComplianceFiling_payrollRunId_idx";

-- DropIndex
DROP INDEX "Geofence_isActive_idx";

-- DropIndex
DROP INDEX "Holiday_country_idx";

-- DropIndex
DROP INDEX "Holiday_date_idx";

-- DropIndex
DROP INDEX "Holiday_type_idx";

-- DropIndex
DROP INDEX "LeaveBalance_leaveTypeId_idx";

-- AlterTable
ALTER TABLE "AttendancePolicyConfig" ADD COLUMN     "breakDurationMinutes" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "canteenEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "canteenFreeForGeneralShift" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "canteenFreeForNightShift" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "canteenOtfreeThresholdHours" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "gatePassEarlyHours" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "gatePassHalfDayNextDay" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "gatePassHalfDayOnExceed" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "gatePassMaxPerMonth" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "halfDayAfterMinutes" INTEGER NOT NULL DEFAULT 21,
ADD COLUMN     "lateMarkAllowancePerMonth" INTEGER NOT NULL DEFAULT 4,
ADD COLUMN     "lateMarkHalfDayOnExceed" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lateMarkNotApplicableOnTour" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "shiftEndDefault" TEXT NOT NULL DEFAULT '17:30',
ADD COLUMN     "shiftStartDefault" TEXT NOT NULL DEFAULT '09:00',
ALTER COLUMN "lateGraceMinutes" SET DEFAULT 15;

-- AlterTable
ALTER TABLE "CollaborationSettings" ADD COLUMN     "resendApiKey" TEXT,
ADD COLUMN     "resendFromAddress" TEXT,
ADD COLUMN     "smtpEncryption" TEXT NOT NULL DEFAULT 'tls',
ADD COLUMN     "smtpFromAddress" TEXT,
ADD COLUMN     "smtpFromName" TEXT,
ADD COLUMN     "smtpHost" TEXT,
ADD COLUMN     "smtpPassword" TEXT,
ADD COLUMN     "smtpPort" INTEGER NOT NULL DEFAULT 587,
ADD COLUMN     "smtpReplyTo" TEXT,
ADD COLUMN     "smtpUsername" TEXT,
ADD COLUMN     "smtpVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "smtpVerifyError" TEXT;

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "credentialsInvitedAt" TIMESTAMP(3),
ADD COLUMN     "credentialsInvitedBy" TEXT,
ADD COLUMN     "credentialsStatus" TEXT DEFAULT 'not_invited',
ALTER COLUMN "employeeStatus" DROP NOT NULL,
ALTER COLUMN "employeeType" DROP NOT NULL,
ALTER COLUMN "employeeType" SET DEFAULT 'full_time';

-- AlterTable
ALTER TABLE "Holiday" ALTER COLUMN "companyId" DROP DEFAULT;

-- AlterTable
ALTER TABLE "LeaveRequest" ADD COLUMN     "currentApproverId" TEXT,
ADD COLUMN     "workflowConfigSnapshot" TEXT,
ADD COLUMN     "workflowStage" TEXT;

-- AlterTable
ALTER TABLE "LeaveType" ADD COLUMN     "companyId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Policy" ADD COLUMN     "companyId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Shift" ADD COLUMN     "companyId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "TenantDatabase" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "Candidate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "avatar" TEXT,
    "currentJobTitle" TEXT,
    "currentCompany" TEXT,
    "currentLocation" TEXT,
    "totalExperience" DOUBLE PRECISION,
    "noticePeriod" INTEGER,
    "currentCTC" DOUBLE PRECISION,
    "expectedCTC" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "skills" TEXT,
    "highestQualification" TEXT,
    "university" TEXT,
    "graduationYear" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'direct',
    "sourceDetails" TEXT,
    "recruiterId" TEXT,
    "resumeUrl" TEXT,
    "coverLetterUrl" TEXT,
    "linkedinUrl" TEXT,
    "portfolioUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "subStatus" TEXT,
    "aiMatchScore" DOUBLE PRECISION,
    "aiSentimentScore" DOUBLE PRECISION,
    "aiRecommendedRole" TEXT,
    "lastContactedAt" TIMESTAMP(3),
    "nextFollowUpAt" TIMESTAMP(3),
    "communicationCount" INTEGER NOT NULL DEFAULT 0,
    "tags" TEXT,
    "category" TEXT,
    "pool" TEXT,
    "appliedAt" TIMESTAMP(3),
    "hiredAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "consentGiven" BOOLEAN NOT NULL DEFAULT false,
    "consentDate" TIMESTAMP(3),
    "dataRetentionDays" INTEGER NOT NULL DEFAULT 730,
    "anonymized" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Candidate_tenantId_idx" ON "Candidate"("tenantId");

-- CreateIndex
CREATE INDEX "Candidate_companyId_idx" ON "Candidate"("companyId");

-- CreateIndex
CREATE INDEX "Candidate_status_idx" ON "Candidate"("status");

-- CreateIndex
CREATE INDEX "Candidate_source_idx" ON "Candidate"("source");

-- CreateIndex
CREATE INDEX "Candidate_aiMatchScore_idx" ON "Candidate"("aiMatchScore");

-- CreateIndex
CREATE UNIQUE INDEX "Candidate_tenantId_email_key" ON "Candidate"("tenantId", "email");

-- CreateIndex
CREATE INDEX "LeaveRequest_currentApproverId_idx" ON "LeaveRequest"("currentApproverId");

-- CreateIndex
CREATE INDEX "LeaveRequest_workflowStage_idx" ON "LeaveRequest"("workflowStage");

-- CreateIndex
CREATE INDEX "LeaveType_companyId_idx" ON "LeaveType"("companyId");

-- CreateIndex
CREATE INDEX "Policy_companyId_idx" ON "Policy"("companyId");

-- CreateIndex
CREATE INDEX "Shift_companyId_idx" ON "Shift"("companyId");

-- AddForeignKey
ALTER TABLE "BackupRecord" ADD CONSTRAINT "BackupRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobApplication" ADD CONSTRAINT "JobApplication_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveType" ADD CONSTRAINT "LeaveType_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveApprovalStep" ADD CONSTRAINT "LeaveApprovalStep_leaveRequestId_fkey" FOREIGN KEY ("leaveRequestId") REFERENCES "LeaveRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Policy" ADD CONSTRAINT "Policy_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Holiday" ADD CONSTRAINT "Holiday_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OKR" ADD CONSTRAINT "OKR_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollInput" ADD CONSTRAINT "PayrollInput_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollTransactionLine" ADD CONSTRAINT "PayrollTransactionLine_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceFiling" ADD CONSTRAINT "ComplianceFiling_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankPaymentFile" ADD CONSTRAINT "BankPaymentFile_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
ALTER TABLE "WfhRequest" ADD CONSTRAINT "WfhRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeavePolicyRule" ADD CONSTRAINT "LeavePolicyRule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeavePolicyRule" ADD CONSTRAINT "LeavePolicyRule_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeavePolicyRule" ADD CONSTRAINT "LeavePolicyRule_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendancePolicyRule" ADD CONSTRAINT "AttendancePolicyRule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendancePolicyRule" ADD CONSTRAINT "AttendancePolicyRule_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendancePolicyRule" ADD CONSTRAINT "AttendancePolicyRule_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveAttachment" ADD CONSTRAINT "LeaveAttachment_leaveRequestId_fkey" FOREIGN KEY ("leaveRequestId") REFERENCES "LeaveRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletBucket" ADD CONSTRAINT "WalletBucket_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_bucketId_fkey" FOREIGN KEY ("bucketId") REFERENCES "WalletBucket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceOrder" ADD CONSTRAINT "MarketplaceOrder_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceOrder" ADD CONSTRAINT "MarketplaceOrder_productId_fkey" FOREIGN KEY ("productId") REFERENCES "MarketplaceProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsurancePolicy" ADD CONSTRAINT "InsurancePolicy_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceClaim" ADD CONSTRAINT "InsuranceClaim_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "InsurancePolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
ALTER TABLE "Gift" ADD CONSTRAINT "Gift_productId_fkey" FOREIGN KEY ("productId") REFERENCES "MarketplaceProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardPointsLedger" ADD CONSTRAINT "RewardPointsLedger_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceFraudFlag" ADD CONSTRAINT "MarketplaceFraudFlag_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialStressFlag" ADD CONSTRAINT "FinancialStressFlag_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletBudgetAllocation" ADD CONSTRAINT "WalletBudgetAllocation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletBudgetAllocation" ADD CONSTRAINT "WalletBudgetAllocation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contractor" ADD CONSTRAINT "Contractor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeCompanyMapping" ADD CONSTRAINT "EmployeeCompanyMapping_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeCompanyMapping" ADD CONSTRAINT "EmployeeCompanyMapping_designationId_fkey" FOREIGN KEY ("designationId") REFERENCES "Designation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeCompanyMapping" ADD CONSTRAINT "EmployeeCompanyMapping_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantConfiguration" ADD CONSTRAINT "TenantConfiguration_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantCountryAccess" ADD CONSTRAINT "TenantCountryAccess_tenantConfigId_fkey" FOREIGN KEY ("tenantConfigId") REFERENCES "TenantConfiguration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantCurrencyAccess" ADD CONSTRAINT "TenantCurrencyAccess_tenantConfigId_fkey" FOREIGN KEY ("tenantConfigId") REFERENCES "TenantConfiguration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantLanguageAccess" ADD CONSTRAINT "TenantLanguageAccess_tenantConfigId_fkey" FOREIGN KEY ("tenantConfigId") REFERENCES "TenantConfiguration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantPayrollPolicy" ADD CONSTRAINT "TenantPayrollPolicy_tenantConfigId_fkey" FOREIGN KEY ("tenantConfigId") REFERENCES "TenantConfiguration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TodoTask" ADD CONSTRAINT "TodoTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialComment" ADD CONSTRAINT "SocialComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "SocialPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialComment" ADD CONSTRAINT "SocialComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KanbanBoard" ADD CONSTRAINT "KanbanBoard_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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

