/**
 * Targeted schema sync (Task 38 — L&D module): applies ONLY the new
 * Learning & Development tables. Additive-only (IF NOT EXISTS), idempotent.
 *
 * Usage: node scripts/apply-lnd-schema.js <connectionString>
 */
const { neon } = require('@neondatabase/serverless');

const TABLES = [
  `CREATE TABLE IF NOT EXISTS "Course" (
    "id" TEXT NOT NULL,
    "code" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'technical',
    "mode" TEXT NOT NULL DEFAULT 'e_learning',
    "provider" TEXT,
    "contentUrl" TEXT,
    "documentUrl" TEXT,
    "externalUrl" TEXT,
    "durationHours" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "level" TEXT NOT NULL DEFAULT 'beginner',
    "skills" JSONB,
    "objectives" TEXT,
    "isCompliance" BOOLEAN NOT NULL DEFAULT false,
    "complianceCategory" TEXT,
    "isPromotionGate" BOOLEAN NOT NULL DEFAULT false,
    "passingScore" DOUBLE PRECISION NOT NULL DEFAULT 60,
    "cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" TEXT NOT NULL DEFAULT 'published',
    "companyId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "CourseModule" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'video',
    "contentUrl" TEXT,
    "durationMins" INTEGER NOT NULL DEFAULT 15,
    "order" INTEGER NOT NULL DEFAULT 1,
    "isAssessment" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CourseModule_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "LearningPath" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'skill_upskilling',
    "targetRole" TEXT,
    "durationWeeks" INTEGER,
    "isPromotionTrack" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',
    "companyId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LearningPath_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "LearningPathCourse" (
    "id" TEXT NOT NULL,
    "pathId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 1,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LearningPathCourse_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "CourseAssignment" (
    "id" TEXT NOT NULL,
    "courseId" TEXT,
    "pathId" TEXT,
    "assigneeType" TEXT NOT NULL DEFAULT 'individual',
    "employeeId" TEXT,
    "departmentId" TEXT,
    "teamId" TEXT,
    "targetCount" INTEGER NOT NULL DEFAULT 0,
    "dueDate" TIMESTAMP(3),
    "isMandatory" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "companyId" TEXT,
    "assignedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CourseAssignment_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "CourseEnrollment" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "pathId" TEXT,
    "employeeId" TEXT NOT NULL,
    "assignmentId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'assigned',
    "status" TEXT NOT NULL DEFAULT 'assigned',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "dueDate" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "score" DOUBLE PRECISION,
    "preTestScore" DOUBLE PRECISION,
    "postTestScore" DOUBLE PRECISION,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "hoursSpent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "feedbackRating" DOUBLE PRECISION,
    "feedbackInstructor" DOUBLE PRECISION,
    "feedbackContent" DOUBLE PRECISION,
    "feedbackComments" TEXT,
    "goalId" TEXT,
    "okrId" TEXT,
    "companyId" TEXT,
    "modulesCompleted" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CourseEnrollment_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "Certificate" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT,
    "courseId" TEXT,
    "employeeId" TEXT NOT NULL,
    "certificateNo" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "score" DOUBLE PRECISION,
    "skillAwarded" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "renewalMonths" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastRenewedAt" TIMESTAMP(3),
    "remindersSent" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Certificate_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "TrainingRequest" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "courseId" TEXT,
    "pathId" TEXT,
    "title" TEXT,
    "requestType" TEXT NOT NULL DEFAULT 'self',
    "reason" TEXT,
    "expectedCost" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewedById" TEXT,
    "reviewComments" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "companyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TrainingRequest_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "ComplianceRequirement" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "courseId" TEXT,
    "frequency" TEXT NOT NULL DEFAULT 'annual',
    "appliesToDepartments" JSONB,
    "graceDays" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastAssignedAt" TIMESTAMP(3),
    "companyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ComplianceRequirement_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "PolicySignOff" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "policyVersion" TEXT,
    "description" TEXT,
    "documentUrl" TEXT,
    "requiresSignature" BOOLEAN NOT NULL DEFAULT true,
    "dueDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'published',
    "companyId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PolicySignOff_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "PolicySignOffAck" (
    "id" TEXT NOT NULL,
    "signOffId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "signedAt" TIMESTAMP(3),
    "signatureName" TEXT,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PolicySignOffAck_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "SkillGap" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "skill" TEXT NOT NULL,
    "currentLevel" TEXT,
    "requiredLevel" TEXT,
    "source" TEXT NOT NULL DEFAULT 'performance_review',
    "reviewId" TEXT,
    "suggestedCourseId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "resolvedEnrollmentId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SkillGap_pkey" PRIMARY KEY ("id")
  )`,
];

const INDEXES = [
  `CREATE INDEX IF NOT EXISTS "Course_companyId_idx" ON "Course"("companyId")`,
  `CREATE INDEX IF NOT EXISTS "Course_status_idx" ON "Course"("status")`,
  `CREATE INDEX IF NOT EXISTS "Course_category_idx" ON "Course"("category")`,
  `CREATE INDEX IF NOT EXISTS "CourseModule_courseId_idx" ON "CourseModule"("courseId")`,
  `CREATE INDEX IF NOT EXISTS "LearningPath_companyId_idx" ON "LearningPath"("companyId")`,
  `CREATE INDEX IF NOT EXISTS "LearningPathCourse_pathId_idx" ON "LearningPathCourse"("pathId")`,
  `CREATE INDEX IF NOT EXISTS "LearningPathCourse_courseId_idx" ON "LearningPathCourse"("courseId")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "LearningPathCourse_pathId_courseId_key" ON "LearningPathCourse"("pathId","courseId")`,
  `CREATE INDEX IF NOT EXISTS "CourseAssignment_companyId_idx" ON "CourseAssignment"("companyId")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "CourseEnrollment_courseId_employeeId_key" ON "CourseEnrollment"("courseId","employeeId")`,
  `CREATE INDEX IF NOT EXISTS "CourseEnrollment_employeeId_idx" ON "CourseEnrollment"("employeeId")`,
  `CREATE INDEX IF NOT EXISTS "CourseEnrollment_status_idx" ON "CourseEnrollment"("status")`,
  `CREATE INDEX IF NOT EXISTS "CourseEnrollment_pathId_idx" ON "CourseEnrollment"("pathId")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Certificate_certificateNo_key" ON "Certificate"("certificateNo")`,
  `CREATE INDEX IF NOT EXISTS "Certificate_employeeId_idx" ON "Certificate"("employeeId")`,
  `CREATE INDEX IF NOT EXISTS "Certificate_validUntil_idx" ON "Certificate"("validUntil")`,
  `CREATE INDEX IF NOT EXISTS "TrainingRequest_employeeId_idx" ON "TrainingRequest"("employeeId")`,
  `CREATE INDEX IF NOT EXISTS "TrainingRequest_status_idx" ON "TrainingRequest"("status")`,
  `CREATE INDEX IF NOT EXISTS "ComplianceRequirement_companyId_idx" ON "ComplianceRequirement"("companyId")`,
  `CREATE INDEX IF NOT EXISTS "PolicySignOff_companyId_idx" ON "PolicySignOff"("companyId")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "PolicySignOffAck_signOffId_employeeId_key" ON "PolicySignOffAck"("signOffId","employeeId")`,
  `CREATE INDEX IF NOT EXISTS "PolicySignOffAck_employeeId_idx" ON "PolicySignOffAck"("employeeId")`,
  `CREATE INDEX IF NOT EXISTS "SkillGap_employeeId_idx" ON "SkillGap"("employeeId")`,
  `CREATE INDEX IF NOT EXISTS "SkillGap_status_idx" ON "SkillGap"("status")`,
];

const FKS = [
  ['CourseModule', 'courseId', 'Course', 'CASCADE'],
  ['LearningPathCourse', 'pathId', 'LearningPath', 'CASCADE'],
  ['LearningPathCourse', 'courseId', 'Course', 'CASCADE'],
  ['CourseAssignment', 'courseId', 'Course', 'CASCADE'],
  ['CourseAssignment', 'pathId', 'LearningPath', 'CASCADE'],
  ['CourseEnrollment', 'courseId', 'Course', 'CASCADE'],
  ['CourseEnrollment', 'assignmentId', 'CourseAssignment', 'SET NULL'],
  ['Certificate', 'enrollmentId', 'CourseEnrollment', 'SET NULL'],
  ['Certificate', 'courseId', 'Course', 'SET NULL'],
  ['TrainingRequest', 'courseId', 'Course', 'SET NULL'],
  ['ComplianceRequirement', 'courseId', 'Course', 'SET NULL'],
  ['PolicySignOffAck', 'signOffId', 'PolicySignOff', 'CASCADE'],
  ['SkillGap', 'suggestedCourseId', 'Course', 'SET NULL'],
];

async function main() {
  const cs = process.argv[2];
  if (!cs) { console.error('Usage: node scripts/apply-lnd-schema.js <connectionString>'); process.exit(1); }
  const sql = neon(cs);
  for (const stmt of TABLES) await sql.query(stmt);
  for (const stmt of INDEXES) await sql.query(stmt);
  for (const [table, col, ref, action] of FKS) {
    const name = `${table}_${col}_fkey`;
    try {
      await sql.query(`DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${name}') THEN
          ALTER TABLE "${table}" ADD CONSTRAINT "${name}"
          FOREIGN KEY ("${col}") REFERENCES "${ref}"("id") ON DELETE ${action} ON UPDATE CASCADE;
        END IF;
      END $$;`);
    } catch (e) {
      console.log(`[lnd-sync] FK ${name} skipped: ${String(e.message).split('\n')[0]}`);
    }
  }
  // Employee FKs (skip silently if referenced rows differ across DBs)
  for (const [table, action] of [['CourseEnrollment', 'CASCADE'], ['Certificate', 'CASCADE'], ['TrainingRequest', 'CASCADE'], ['PolicySignOffAck', 'CASCADE'], ['SkillGap', 'CASCADE']]) {
    const name = `${table}_employeeId_fkey`;
    try {
      await sql.query(`DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${name}') THEN
          ALTER TABLE "${table}" ADD CONSTRAINT "${name}"
          FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE ${action} ON UPDATE CASCADE;
        END IF;
      END $$;`);
    } catch (e) { /* skip */ }
  }
  console.log(`[lnd-sync] OK — ${TABLES.length} tables + ${INDEXES.length} indexes ensured`);
}

main().catch((e) => { console.error('[lnd-sync] FAILED:', e.message); process.exit(1); });
