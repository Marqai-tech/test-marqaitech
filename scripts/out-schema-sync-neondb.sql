-- ADDITIVE-ONLY schema sync for neondb
-- generated from prisma migrate diff vs schema.prisma

ALTER TABLE "BankPaymentFile" DROP CONSTRAINT "BankPaymentFile_payrollRunId_fkey";
ALTER TABLE "CalendarSync" DROP CONSTRAINT "CalendarSync_employeeId_fkey";
ALTER TABLE "CallLog" DROP CONSTRAINT "CallLog_initiatorId_fkey";
ALTER TABLE "CallParticipant" DROP CONSTRAINT "CallParticipant_callId_fkey";
ALTER TABLE "CallParticipant" DROP CONSTRAINT "CallParticipant_userId_fkey";
ALTER TABLE "CandidateSentimentScore" DROP CONSTRAINT "CandidateSentimentScore_jobApplicationId_fkey";
ALTER TABLE "CandidateTalentPool" DROP CONSTRAINT "CandidateTalentPool_jobApplicationId_fkey";
ALTER TABLE "ChatMessage" DROP CONSTRAINT "ChatMessage_parentMessageId_fkey";
ALTER TABLE "ChatMessage" DROP CONSTRAINT "ChatMessage_roomId_fkey";
ALTER TABLE "ChatMessage" DROP CONSTRAINT "ChatMessage_senderId_fkey";
ALTER TABLE "ChatRoomMember" DROP CONSTRAINT "ChatRoomMember_roomId_fkey";
ALTER TABLE "ChatSummary" DROP CONSTRAINT "ChatSummary_roomId_fkey";
ALTER TABLE "DLPScanLog" DROP CONSTRAINT "DLPScanLog_userId_fkey";
ALTER TABLE "DocumentIntelligenceResult" DROP CONSTRAINT "DocumentIntelligenceResult_employeeId_fkey";
ALTER TABLE "DottedLineManager" DROP CONSTRAINT "DottedLineManager_employeeId_fkey";
ALTER TABLE "DottedLineManager" DROP CONSTRAINT "DottedLineManager_managerId_fkey";
ALTER TABLE "EmailMessage" DROP CONSTRAINT "EmailMessage_companyId_fkey";
ALTER TABLE "EmployeeCustomFieldValue" DROP CONSTRAINT "EmployeeCustomFieldValue_employeeId_fkey";
ALTER TABLE "EmployeeCustomFieldValue" DROP CONSTRAINT "EmployeeCustomFieldValue_fieldId_fkey";
ALTER TABLE "FileNode" DROP CONSTRAINT "FileNode_ownerEmployeeId_fkey";
ALTER TABLE "FileNode" DROP CONSTRAINT "FileNode_parentId_fkey";
ALTER TABLE "FileNode" DROP CONSTRAINT "FileNode_uploadedById_fkey";
ALTER TABLE "FileShareLink" DROP CONSTRAINT "FileShareLink_createdBy_fkey";
ALTER TABLE "FileShareLink" DROP CONSTRAINT "FileShareLink_fileId_fkey";
ALTER TABLE "FileVersion" DROP CONSTRAINT "FileVersion_fileId_fkey";
ALTER TABLE "FileVersion" DROP CONSTRAINT "FileVersion_uploadedById_fkey";
ALTER TABLE "GDPRAnonymizationRequest" DROP CONSTRAINT "GDPRAnonymizationRequest_employeeId_fkey";
ALTER TABLE "JobBoardPosting" DROP CONSTRAINT "JobBoardPosting_jobPostingId_fkey";
ALTER TABLE "Note" DROP CONSTRAINT "Note_createdById_fkey";
ALTER TABLE "OKR" DROP CONSTRAINT "OKR_ownerId_fkey";
ALTER TABLE "ResumeParse" DROP CONSTRAINT "ResumeParse_jobApplicationId_fkey";
ALTER TABLE "SocialProfile" DROP CONSTRAINT "SocialProfile_employeeId_fkey";
ALTER TABLE "Team" DROP CONSTRAINT "Team_leadId_fkey";
ALTER TABLE "TeamMember" DROP CONSTRAINT "TeamMember_employeeId_fkey";
ALTER TABLE "TeamMember" DROP CONSTRAINT "TeamMember_teamId_fkey";
ALTER TABLE "TodoTask" DROP CONSTRAINT "TodoTask_createdById_fkey";
ALTER TABLE "User" DROP CONSTRAINT "User_tenantId_fkey";
ALTER TABLE "WatermarkAccessLog" DROP CONSTRAINT "WatermarkAccessLog_fileId_fkey";
ALTER TABLE "WatermarkAccessLog" DROP CONSTRAINT "WatermarkAccessLog_userId_fkey";
DROP INDEX "ComplianceFiling_payrollRunId_idx";
DROP INDEX "Geofence_isActive_idx";
DROP INDEX "Holiday_country_idx";
DROP INDEX "Holiday_date_idx";
DROP INDEX "Holiday_type_idx";
DROP INDEX "LeaveBalance_leaveTypeId_idx";
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
ALTER TABLE "Employee" ADD COLUMN     "credentialsInvitedAt" TIMESTAMP(3),
ADD COLUMN     "credentialsInvitedBy" TEXT,
ADD COLUMN     "credentialsStatus" TEXT DEFAULT 'not_invited',
ALTER COLUMN "employeeStatus" DROP NOT NULL,
ALTER COLUMN "employeeType" DROP NOT NULL,
ALTER COLUMN "employeeType" SET DEFAULT 'full_time';
ALTER TABLE "Holiday" ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "LeaveRequest" ADD COLUMN     "currentApproverId" TEXT,
ADD COLUMN     "workflowConfigSnapshot" TEXT,
ADD COLUMN     "workflowStage" TEXT;
ALTER TABLE "LeaveType" ADD COLUMN     "companyId" TEXT NOT NULL;
ALTER TABLE "Policy" ADD COLUMN     "companyId" TEXT NOT NULL;
ALTER TABLE "Shift" ADD COLUMN     "companyId" TEXT NOT NULL;
ALTER TABLE "TenantDatabase" ALTER COLUMN "updatedAt" DROP DEFAULT;
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
CREATE INDEX "Candidate_tenantId_idx" ON "Candidate"("tenantId");
CREATE INDEX "Candidate_companyId_idx" ON "Candidate"("companyId");
CREATE INDEX "Candidate_status_idx" ON "Candidate"("status");
CREATE INDEX "Candidate_source_idx" ON "Candidate"("source");
CREATE INDEX "Candidate_aiMatchScore_idx" ON "Candidate"("aiMatchScore");
CREATE UNIQUE INDEX "Candidate_tenantId_email_key" ON "Candidate"("tenantId", "email");
CREATE INDEX "LeaveRequest_currentApproverId_idx" ON "LeaveRequest"("currentApproverId");
CREATE INDEX "LeaveRequest_workflowStage_idx" ON "LeaveRequest"("workflowStage");
CREATE INDEX "LeaveType_companyId_idx" ON "LeaveType"("companyId");
CREATE INDEX "Policy_companyId_idx" ON "Policy"("companyId");
CREATE INDEX "Shift_companyId_idx" ON "Shift"("companyId");
ALTER TABLE "BackupRecord" ADD CONSTRAINT "BackupRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobApplication" ADD CONSTRAINT "JobApplication_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LeaveType" ADD CONSTRAINT "LeaveType_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeaveApprovalStep" ADD CONSTRAINT "LeaveApprovalStep_leaveRequestId_fkey" FOREIGN KEY ("leaveRequestId") REFERENCES "LeaveRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Policy" ADD CONSTRAINT "Policy_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Holiday" ADD CONSTRAINT "Holiday_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OKR" ADD CONSTRAINT "OKR_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PayrollInput" ADD CONSTRAINT "PayrollInput_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PayrollTransactionLine" ADD CONSTRAINT "PayrollTransactionLine_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComplianceFiling" ADD CONSTRAINT "ComplianceFiling_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BankPaymentFile" ADD CONSTRAINT "BankPaymentFile_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeCustomFieldValue" ADD CONSTRAINT "EmployeeCustomFieldValue_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeCustomFieldValue" ADD CONSTRAINT "EmployeeCustomFieldValue_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "EmployeeCustomField"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DottedLineManager" ADD CONSTRAINT "DottedLineManager_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DottedLineManager" ADD CONSTRAINT "DottedLineManager_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Team" ADD CONSTRAINT "Team_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialProfile" ADD CONSTRAINT "SocialProfile_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalendarSync" ADD CONSTRAINT "CalendarSync_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatRoomMember" ADD CONSTRAINT "ChatRoomMember_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "ChatRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "ChatRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_parentMessageId_fkey" FOREIGN KEY ("parentMessageId") REFERENCES "ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CallLog" ADD CONSTRAINT "CallLog_initiatorId_fkey" FOREIGN KEY ("initiatorId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CallParticipant" ADD CONSTRAINT "CallParticipant_callId_fkey" FOREIGN KEY ("callId") REFERENCES "CallLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CallParticipant" ADD CONSTRAINT "CallParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FileNode" ADD CONSTRAINT "FileNode_ownerEmployeeId_fkey" FOREIGN KEY ("ownerEmployeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FileNode" ADD CONSTRAINT "FileNode_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "FileNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FileNode" ADD CONSTRAINT "FileNode_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FileVersion" ADD CONSTRAINT "FileVersion_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "FileNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FileVersion" ADD CONSTRAINT "FileVersion_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FileShareLink" ADD CONSTRAINT "FileShareLink_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "FileNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FileShareLink" ADD CONSTRAINT "FileShareLink_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentIntelligenceResult" ADD CONSTRAINT "DocumentIntelligenceResult_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ChatSummary" ADD CONSTRAINT "ChatSummary_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "ChatRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DLPScanLog" ADD CONSTRAINT "DLPScanLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GDPRAnonymizationRequest" ADD CONSTRAINT "GDPRAnonymizationRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WatermarkAccessLog" ADD CONSTRAINT "WatermarkAccessLog_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "FileNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WatermarkAccessLog" ADD CONSTRAINT "WatermarkAccessLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResumeParse" ADD CONSTRAINT "ResumeParse_jobApplicationId_fkey" FOREIGN KEY ("jobApplicationId") REFERENCES "JobApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CandidateSentimentScore" ADD CONSTRAINT "CandidateSentimentScore_jobApplicationId_fkey" FOREIGN KEY ("jobApplicationId") REFERENCES "JobApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobBoardPosting" ADD CONSTRAINT "JobBoardPosting_jobPostingId_fkey" FOREIGN KEY ("jobPostingId") REFERENCES "JobPosting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WfhRequest" ADD CONSTRAINT "WfhRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeavePolicyRule" ADD CONSTRAINT "LeavePolicyRule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeavePolicyRule" ADD CONSTRAINT "LeavePolicyRule_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LeavePolicyRule" ADD CONSTRAINT "LeavePolicyRule_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AttendancePolicyRule" ADD CONSTRAINT "AttendancePolicyRule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendancePolicyRule" ADD CONSTRAINT "AttendancePolicyRule_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AttendancePolicyRule" ADD CONSTRAINT "AttendancePolicyRule_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LeaveAttachment" ADD CONSTRAINT "LeaveAttachment_leaveRequestId_fkey" FOREIGN KEY ("leaveRequestId") REFERENCES "LeaveRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WalletBucket" ADD CONSTRAINT "WalletBucket_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_bucketId_fkey" FOREIGN KEY ("bucketId") REFERENCES "WalletBucket"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MarketplaceOrder" ADD CONSTRAINT "MarketplaceOrder_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketplaceOrder" ADD CONSTRAINT "MarketplaceOrder_productId_fkey" FOREIGN KEY ("productId") REFERENCES "MarketplaceProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InsurancePolicy" ADD CONSTRAINT "InsurancePolicy_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InsuranceClaim" ADD CONSTRAINT "InsuranceClaim_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "InsurancePolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InsuranceClaim" ADD CONSTRAINT "InsuranceClaim_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EWARequest" ADD CONSTRAINT "EWARequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LoanMarketplaceListing" ADD CONSTRAINT "LoanMarketplaceListing_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Gift" ADD CONSTRAINT "Gift_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Gift" ADD CONSTRAINT "Gift_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Gift" ADD CONSTRAINT "Gift_productId_fkey" FOREIGN KEY ("productId") REFERENCES "MarketplaceProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RewardPointsLedger" ADD CONSTRAINT "RewardPointsLedger_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketplaceFraudFlag" ADD CONSTRAINT "MarketplaceFraudFlag_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinancialStressFlag" ADD CONSTRAINT "FinancialStressFlag_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WalletBudgetAllocation" ADD CONSTRAINT "WalletBudgetAllocation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WalletBudgetAllocation" ADD CONSTRAINT "WalletBudgetAllocation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Contractor" ADD CONSTRAINT "Contractor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmployeeCompanyMapping" ADD CONSTRAINT "EmployeeCompanyMapping_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmployeeCompanyMapping" ADD CONSTRAINT "EmployeeCompanyMapping_designationId_fkey" FOREIGN KEY ("designationId") REFERENCES "Designation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmployeeCompanyMapping" ADD CONSTRAINT "EmployeeCompanyMapping_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TenantConfiguration" ADD CONSTRAINT "TenantConfiguration_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TenantCountryAccess" ADD CONSTRAINT "TenantCountryAccess_tenantConfigId_fkey" FOREIGN KEY ("tenantConfigId") REFERENCES "TenantConfiguration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TenantCurrencyAccess" ADD CONSTRAINT "TenantCurrencyAccess_tenantConfigId_fkey" FOREIGN KEY ("tenantConfigId") REFERENCES "TenantConfiguration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TenantLanguageAccess" ADD CONSTRAINT "TenantLanguageAccess_tenantConfigId_fkey" FOREIGN KEY ("tenantConfigId") REFERENCES "TenantConfiguration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TenantPayrollPolicy" ADD CONSTRAINT "TenantPayrollPolicy_tenantConfigId_fkey" FOREIGN KEY ("tenantConfigId") REFERENCES "TenantConfiguration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TodoTask" ADD CONSTRAINT "TodoTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Note" ADD CONSTRAINT "Note_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialComment" ADD CONSTRAINT "SocialComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "SocialPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialComment" ADD CONSTRAINT "SocialComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KanbanBoard" ADD CONSTRAINT "KanbanBoard_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;