-- ADDITIVE-ONLY schema sync for tenant_marqaitechgroup
-- generated from prisma migrate diff vs schema.prisma

ALTER TABLE "User" DROP CONSTRAINT "User_tenantId_fkey";
DROP INDEX "User_id_key";
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
ALTER TABLE "BankAccount" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "Candidate" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "CompanyPolicy" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "Employee" ADD COLUMN     "credentialsInvitedAt" TIMESTAMP(3),
ADD COLUMN     "credentialsInvitedBy" TEXT,
ADD COLUMN     "credentialsStatus" TEXT DEFAULT 'not_invited',
ALTER COLUMN "employeeStatus" DROP NOT NULL,
ALTER COLUMN "employeeType" DROP NOT NULL,
ALTER COLUMN "employeeType" SET DEFAULT 'full_time';
ALTER TABLE "GratuityLedger" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "LeaveRequest" ADD COLUMN     "currentApproverId" TEXT,
ADD COLUMN     "workflowConfigSnapshot" TEXT,
ADD COLUMN     "workflowStage" TEXT;
ALTER TABLE "Setting" ALTER COLUMN "updatedAt" DROP DEFAULT;
CREATE TABLE "BackupRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "triggeredBy" TEXT NOT NULL,
    "triggeredByName" TEXT NOT NULL,
    "backupType" TEXT NOT NULL DEFAULT 'manual',
    "status" TEXT NOT NULL DEFAULT 'completed',
    "totalTables" INTEGER NOT NULL DEFAULT 0,
    "totalRecords" INTEGER NOT NULL DEFAULT 0,
    "tableDetails" TEXT,
    "storageLocation" TEXT,
    "fileSizeBytes" INTEGER,
    "backupNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BackupRecord_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "LeaveWorkflowConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leaveTypeId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "config" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Default Leave Approval Workflow',
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveWorkflowConfig_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "LeaveApprovalStep" (
    "id" TEXT NOT NULL,
    "leaveRequestId" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "approverType" TEXT NOT NULL,
    "approverUserId" TEXT,
    "actionByUserId" TEXT,
    "action" TEXT,
    "comments" TEXT,
    "actionAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaveApprovalStep_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "LeavePolicyRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "policyId" TEXT,
    "companyId" TEXT NOT NULL,
    "employmentType" TEXT NOT NULL DEFAULT 'all',
    "branchId" TEXT,
    "departmentId" TEXT,
    "leaveTypeAllocations" TEXT NOT NULL DEFAULT '[]',
    "sandwichRuleEnabled" BOOLEAN NOT NULL DEFAULT true,
    "proRataEnabled" BOOLEAN NOT NULL DEFAULT false,
    "probationRestriction" BOOLEAN NOT NULL DEFAULT true,
    "probationMonths" INTEGER NOT NULL DEFAULT 6,
    "encashmentAllowed" BOOLEAN NOT NULL DEFAULT false,
    "carryForwardGlobal" BOOLEAN NOT NULL DEFAULT true,
    "maxCarryForwardDays" INTEGER NOT NULL DEFAULT 5,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeavePolicyRule_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AttendancePolicyRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "policyId" TEXT,
    "companyId" TEXT NOT NULL,
    "employmentType" TEXT NOT NULL DEFAULT 'all',
    "branchId" TEXT,
    "departmentId" TEXT,
    "shiftStartDefault" TEXT NOT NULL DEFAULT '09:00',
    "shiftEndDefault" TEXT NOT NULL DEFAULT '17:30',
    "breakDurationMinutes" INTEGER NOT NULL DEFAULT 30,
    "lateGraceMinutes" INTEGER NOT NULL DEFAULT 15,
    "earlyGraceMinutes" INTEGER NOT NULL DEFAULT 10,
    "lateMarkAllowancePerMonth" INTEGER NOT NULL DEFAULT 4,
    "lateMarkHalfDayOnExceed" BOOLEAN NOT NULL DEFAULT true,
    "halfDayAfterMinutes" INTEGER NOT NULL DEFAULT 21,
    "lateMarkNotApplicableOnTour" BOOLEAN NOT NULL DEFAULT true,
    "autoOvertimeEnabled" BOOLEAN NOT NULL DEFAULT true,
    "overtimeThresholdMinutes" INTEGER NOT NULL DEFAULT 480,
    "gatePassMaxPerMonth" INTEGER NOT NULL DEFAULT 1,
    "gatePassHalfDayOnExceed" BOOLEAN NOT NULL DEFAULT true,
    "gatePassHalfDayNextDay" BOOLEAN NOT NULL DEFAULT true,
    "gatePassEarlyHours" INTEGER NOT NULL DEFAULT 1,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendancePolicyRule_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "eventType" TEXT NOT NULL DEFAULT 'meeting',
    "startDateTime" TIMESTAMP(3) NOT NULL,
    "endDateTime" TIMESTAMP(3) NOT NULL,
    "isAllDay" BOOLEAN NOT NULL DEFAULT false,
    "location" TEXT,
    "color" TEXT,
    "createdBy" TEXT NOT NULL,
    "companyId" TEXT,
    "attendees" TEXT,
    "recurrence" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "EmailMessage" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "fromName" TEXT,
    "toAddresses" TEXT NOT NULL,
    "ccAddresses" TEXT,
    "bccAddresses" TEXT,
    "folder" TEXT NOT NULL DEFAULT 'inbox',
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "isStarred" BOOLEAN NOT NULL DEFAULT false,
    "hasAttachments" BOOLEAN NOT NULL DEFAULT false,
    "attachments" TEXT,
    "labels" TEXT,
    "senderId" TEXT,
    "threadId" TEXT,
    "repliedToId" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "companyId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "TodoTask" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'Medium',
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "category" TEXT,
    "dueDate" TIMESTAMP(3),
    "assignedToId" TEXT,
    "createdById" TEXT NOT NULL,
    "companyId" TEXT,
    "completedAt" TIMESTAMP(3),
    "subtasks" TEXT,
    "tags" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TodoTask_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'personal',
    "color" TEXT NOT NULL DEFAULT '#3B82F6',
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "companyId" TEXT,
    "tags" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SocialPost" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "postType" TEXT NOT NULL DEFAULT 'general',
    "authorId" TEXT NOT NULL,
    "companyId" TEXT,
    "likesCount" INTEGER NOT NULL DEFAULT 0,
    "commentsCount" INTEGER NOT NULL DEFAULT 0,
    "sharesCount" INTEGER NOT NULL DEFAULT 0,
    "attachments" TEXT,
    "hashtags" TEXT,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialPost_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SocialComment" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialComment_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SocialLike" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialLike_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "KanbanBoard" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "companyId" TEXT,
    "createdById" TEXT NOT NULL,
    "columns" TEXT NOT NULL DEFAULT 'Backlog,To Do,In Progress,Done',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KanbanBoard_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "KanbanCard" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "column" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'Medium',
    "category" TEXT,
    "assignedToId" TEXT,
    "dueDate" TIMESTAMP(3),
    "subtasks" TEXT,
    "tags" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KanbanCard_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "CollaborationSettings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "encryptionEnabled" BOOLEAN NOT NULL DEFAULT true,
    "fileSharingLimitMB" INTEGER NOT NULL DEFAULT 25,
    "messageRetentionDays" INTEGER NOT NULL DEFAULT 90,
    "calendarSyncEnabled" BOOLEAN NOT NULL DEFAULT true,
    "calendarSyncProvider" TEXT NOT NULL DEFAULT 'google',
    "emailIntegrationEnabled" BOOLEAN NOT NULL DEFAULT false,
    "emailProvider" TEXT NOT NULL DEFAULT 'smtp',
    "smtpHost" TEXT,
    "smtpPort" INTEGER NOT NULL DEFAULT 587,
    "smtpUsername" TEXT,
    "smtpPassword" TEXT,
    "smtpEncryption" TEXT NOT NULL DEFAULT 'tls',
    "smtpFromName" TEXT,
    "smtpFromAddress" TEXT,
    "smtpReplyTo" TEXT,
    "smtpVerifiedAt" TIMESTAMP(3),
    "smtpVerifyError" TEXT,
    "resendApiKey" TEXT,
    "resendFromAddress" TEXT,
    "autoDeleteMessages" BOOLEAN NOT NULL DEFAULT false,
    "maxCallDurationMin" INTEGER NOT NULL DEFAULT 60,
    "allowExternalSharing" BOOLEAN NOT NULL DEFAULT true,
    "watermarkEnabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollaborationSettings_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BackupRecord_tenantId_idx" ON "BackupRecord"("tenantId");
CREATE INDEX "BackupRecord_createdAt_idx" ON "BackupRecord"("createdAt");
CREATE INDEX "LeaveWorkflowConfig_tenantId_idx" ON "LeaveWorkflowConfig"("tenantId");
CREATE INDEX "LeaveWorkflowConfig_leaveTypeId_idx" ON "LeaveWorkflowConfig"("leaveTypeId");
CREATE INDEX "LeaveApprovalStep_leaveRequestId_idx" ON "LeaveApprovalStep"("leaveRequestId");
CREATE INDEX "LeaveApprovalStep_approverUserId_idx" ON "LeaveApprovalStep"("approverUserId");
CREATE INDEX "LeavePolicyRule_companyId_idx" ON "LeavePolicyRule"("companyId");
CREATE INDEX "LeavePolicyRule_employmentType_idx" ON "LeavePolicyRule"("employmentType");
CREATE INDEX "LeavePolicyRule_branchId_idx" ON "LeavePolicyRule"("branchId");
CREATE INDEX "AttendancePolicyRule_companyId_idx" ON "AttendancePolicyRule"("companyId");
CREATE INDEX "AttendancePolicyRule_employmentType_idx" ON "AttendancePolicyRule"("employmentType");
CREATE INDEX "AttendancePolicyRule_branchId_idx" ON "AttendancePolicyRule"("branchId");
CREATE INDEX "CalendarEvent_createdBy_idx" ON "CalendarEvent"("createdBy");
CREATE INDEX "CalendarEvent_startDateTime_idx" ON "CalendarEvent"("startDateTime");
CREATE INDEX "CalendarEvent_companyId_idx" ON "CalendarEvent"("companyId");
CREATE INDEX "EmailMessage_folder_idx" ON "EmailMessage"("folder");
CREATE INDEX "EmailMessage_senderId_idx" ON "EmailMessage"("senderId");
CREATE INDEX "EmailMessage_isRead_idx" ON "EmailMessage"("isRead");
CREATE INDEX "EmailMessage_threadId_idx" ON "EmailMessage"("threadId");
CREATE INDEX "EmailMessage_companyId_idx" ON "EmailMessage"("companyId");
CREATE INDEX "TodoTask_assignedToId_idx" ON "TodoTask"("assignedToId");
CREATE INDEX "TodoTask_createdById_idx" ON "TodoTask"("createdById");
CREATE INDEX "TodoTask_status_idx" ON "TodoTask"("status");
CREATE INDEX "TodoTask_companyId_idx" ON "TodoTask"("companyId");
CREATE INDEX "Note_createdById_idx" ON "Note"("createdById");
CREATE INDEX "Note_category_idx" ON "Note"("category");
CREATE INDEX "Note_companyId_idx" ON "Note"("companyId");
CREATE INDEX "SocialPost_authorId_idx" ON "SocialPost"("authorId");
CREATE INDEX "SocialPost_postType_idx" ON "SocialPost"("postType");
CREATE INDEX "SocialPost_companyId_idx" ON "SocialPost"("companyId");
CREATE INDEX "SocialComment_postId_idx" ON "SocialComment"("postId");
CREATE INDEX "SocialComment_authorId_idx" ON "SocialComment"("authorId");
CREATE INDEX "SocialLike_postId_idx" ON "SocialLike"("postId");
CREATE UNIQUE INDEX "SocialLike_postId_userId_key" ON "SocialLike"("postId", "userId");
CREATE INDEX "KanbanBoard_companyId_idx" ON "KanbanBoard"("companyId");
CREATE INDEX "KanbanBoard_createdById_idx" ON "KanbanBoard"("createdById");
CREATE INDEX "KanbanCard_boardId_idx" ON "KanbanCard"("boardId");
CREATE INDEX "KanbanCard_column_idx" ON "KanbanCard"("column");
CREATE INDEX "KanbanCard_assignedToId_idx" ON "KanbanCard"("assignedToId");
CREATE UNIQUE INDEX "CollaborationSettings_tenantId_key" ON "CollaborationSettings"("tenantId");
CREATE INDEX "CollaborationSettings_tenantId_idx" ON "CollaborationSettings"("tenantId");
CREATE INDEX "LeaveRequest_currentApproverId_idx" ON "LeaveRequest"("currentApproverId");
CREATE INDEX "LeaveRequest_workflowStage_idx" ON "LeaveRequest"("workflowStage");
ALTER TABLE "BackupRecord" ADD CONSTRAINT "BackupRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_reportingManagerId_fkey" FOREIGN KEY ("reportingManagerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LeaveApprovalStep" ADD CONSTRAINT "LeaveApprovalStep_leaveRequestId_fkey" FOREIGN KEY ("leaveRequestId") REFERENCES "LeaveRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeavePolicyRule" ADD CONSTRAINT "LeavePolicyRule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeavePolicyRule" ADD CONSTRAINT "LeavePolicyRule_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LeavePolicyRule" ADD CONSTRAINT "LeavePolicyRule_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AttendancePolicyRule" ADD CONSTRAINT "AttendancePolicyRule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendancePolicyRule" ADD CONSTRAINT "AttendancePolicyRule_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AttendancePolicyRule" ADD CONSTRAINT "AttendancePolicyRule_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TodoTask" ADD CONSTRAINT "TodoTask_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TodoTask" ADD CONSTRAINT "TodoTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Note" ADD CONSTRAINT "Note_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialComment" ADD CONSTRAINT "SocialComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "SocialPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialComment" ADD CONSTRAINT "SocialComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KanbanBoard" ADD CONSTRAINT "KanbanBoard_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KanbanCard" ADD CONSTRAINT "KanbanCard_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "KanbanBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KanbanCard" ADD CONSTRAINT "KanbanCard_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;