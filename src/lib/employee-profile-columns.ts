import type { PrismaClient } from '@prisma/client';

/** Extra Employee TEXT columns used by profile/detail UIs (not all are in Prisma schema). */
export const EXTRA_PROFILE_KEYS = [
  'currentAddress', 'currentCity', 'currentState', 'currentZipCode', 'currentCountry',
  'emergencyContactRelation',
  'hasChronicIllness', 'chronicIllnessDetails', 'hasAllergies', 'allergyDetails',
  'hasDisability', 'disabilityDetails', 'isOnMedication', 'medicationDetails',
  'hasHadSurgery', 'surgeryDetails', 'emergencyMedicalCondition',
  'primaryPhysicianName', 'primaryPhysicianPhone', 'healthInsuranceProvider', 'healthInsurancePolicyNo',
  'previousEmployer1', 'previousDesignation1', 'previousDuration1', 'previousReason1', 'previousEmployer1Logo',
  'previousEmployer2', 'previousDesignation2', 'previousDuration2', 'previousReason2', 'previousEmployer2Logo',
  'previousEmployer3', 'previousDesignation3', 'previousDuration3', 'previousReason3', 'previousEmployer3Logo',
  'totalExperience',
  'pfNumber', 'pfUAN', 'pfNomineeName', 'pfNomineeRelation', 'pfNomineePercentage',
  'esiNumber', 'esiDispensary', 'esiNomineeName', 'esiNomineeRelation',
  'professionalTaxNumber', 'lwfNumber',
  // Task 137 — interests chips (comma-separated) captured in the Personal tab
  'interests',
  // Bug 6/8: Skills + Achievements stored as JSON strings
  'skillsJson', 'achievementsJson',
] as const;

const EMPLOYEE_WRITE_COLUMNS: { name: string; ddl: string }[] = [
  { name: 'avatar', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "avatar" TEXT` },
  { name: 'personalEmail', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "personalEmail" TEXT` },
  { name: 'employeeStatus', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "employeeStatus" TEXT NOT NULL DEFAULT 'confirmed'` },
  { name: 'employeeType', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "employeeType" TEXT NOT NULL DEFAULT 'full_time'` },
  { name: 'maritalStatus', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "maritalStatus" TEXT` },
  { name: 'nationality', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "nationality" TEXT` },
  { name: 'address', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "address" TEXT` },
  { name: 'city', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "city" TEXT` },
  { name: 'state', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "state" TEXT` },
  { name: 'zipCode', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "zipCode" TEXT` },
  { name: 'country', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "country" TEXT` },
  { name: 'status', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'active'` },
  { name: 'createdAt', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW()` },
  { name: 'updatedAt', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW()` },
  { name: 'reportingManagerId', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "reportingManagerId" TEXT` },
  { name: 'designationId', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "designationId" TEXT` },
  { name: 'dateOfJoining', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "dateOfJoining" TIMESTAMP(3)` },
  { name: 'bloodGroup', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "bloodGroup" TEXT` },
  { name: 'emergencyContactName', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "emergencyContactName" TEXT` },
  { name: 'emergencyContactPhone', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "emergencyContactPhone" TEXT` },
  { name: 'emergencyContactRelation', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "emergencyContactRelation" TEXT` },
  { name: 'currentAddress', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "currentAddress" TEXT` },
  { name: 'currentCity', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "currentCity" TEXT` },
  { name: 'currentState', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "currentState" TEXT` },
  { name: 'currentZipCode', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "currentZipCode" TEXT` },
  { name: 'currentCountry', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "currentCountry" TEXT` },
  { name: 'hasChronicIllness', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "hasChronicIllness" TEXT` },
  { name: 'chronicIllnessDetails', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "chronicIllnessDetails" TEXT` },
  { name: 'hasAllergies', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "hasAllergies" TEXT` },
  { name: 'allergyDetails', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "allergyDetails" TEXT` },
  { name: 'hasDisability', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "hasDisability" TEXT` },
  { name: 'disabilityDetails', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "disabilityDetails" TEXT` },
  { name: 'isOnMedication', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "isOnMedication" TEXT` },
  { name: 'medicationDetails', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "medicationDetails" TEXT` },
  { name: 'hasHadSurgery', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "hasHadSurgery" TEXT` },
  { name: 'surgeryDetails', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "surgeryDetails" TEXT` },
  { name: 'emergencyMedicalCondition', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "emergencyMedicalCondition" TEXT` },
  { name: 'primaryPhysicianName', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "primaryPhysicianName" TEXT` },
  { name: 'primaryPhysicianPhone', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "primaryPhysicianPhone" TEXT` },
  { name: 'healthInsuranceProvider', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "healthInsuranceProvider" TEXT` },
  { name: 'healthInsurancePolicyNo', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "healthInsurancePolicyNo" TEXT` },
  { name: 'previousEmployer1', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "previousEmployer1" TEXT` },
  { name: 'previousDesignation1', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "previousDesignation1" TEXT` },
  { name: 'previousDuration1', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "previousDuration1" TEXT` },
  { name: 'previousReason1', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "previousReason1" TEXT` },
  { name: 'previousEmployer2', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "previousEmployer2" TEXT` },
  { name: 'previousDesignation2', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "previousDesignation2" TEXT` },
  { name: 'previousDuration2', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "previousDuration2" TEXT` },
  { name: 'previousReason2', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "previousReason2" TEXT` },
  { name: 'previousEmployer3', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "previousEmployer3" TEXT` },
  { name: 'previousDesignation3', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "previousDesignation3" TEXT` },
  { name: 'previousDuration3', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "previousDuration3" TEXT` },
  { name: 'previousReason3', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "previousReason3" TEXT` },
  { name: 'totalExperience', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "totalExperience" TEXT` },
  { name: 'interests', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "interests" TEXT` },
  { name: 'pfNumber', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "pfNumber" TEXT` },
  { name: 'pfUAN', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "pfUAN" TEXT` },
  { name: 'pfNomineeName', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "pfNomineeName" TEXT` },
  { name: 'pfNomineeRelation', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "pfNomineeRelation" TEXT` },
  { name: 'pfNomineePercentage', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "pfNomineePercentage" TEXT` },
  { name: 'esiNumber', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "esiNumber" TEXT` },
  { name: 'esiDispensary', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "esiDispensary" TEXT` },
  { name: 'esiNomineeName', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "esiNomineeName" TEXT` },
  { name: 'esiNomineeRelation', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "esiNomineeRelation" TEXT` },
  { name: 'professionalTaxNumber', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "professionalTaxNumber" TEXT` },
  { name: 'lwfNumber', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "lwfNumber" TEXT` },
  { name: 'bankName', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "bankName" TEXT` },
  { name: 'bankAccountNo', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "bankAccountNo" TEXT` },
  { name: 'bankIfscCode', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "bankIfscCode" TEXT` },
  { name: 'panNumber', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "panNumber" TEXT` },
  { name: 'aadhaarNumber', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "aadhaarNumber" TEXT` },
  { name: 'taxId', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "taxId" TEXT` },
  { name: 'salary', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "salary" DOUBLE PRECISION` },
  { name: 'salaryCurrency', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "salaryCurrency" TEXT NOT NULL DEFAULT 'INR'` },
  { name: 'leavePolicyId', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "leavePolicyId" TEXT` },
  { name: 'attendancePolicyId', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "attendancePolicyId" TEXT` },
  { name: 'travelPolicyId', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "travelPolicyId" TEXT` },
  { name: 'salaryStructureId', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "salaryStructureId" TEXT` },
  { name: 'isManagement', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "isManagement" BOOLEAN NOT NULL DEFAULT false` },
  { name: 'credentialsStatus', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "credentialsStatus" TEXT DEFAULT 'not_invited'` },
  { name: 'credentialsInvitedAt', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "credentialsInvitedAt" TIMESTAMP(3)` },
  { name: 'credentialsInvitedBy', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "credentialsInvitedBy" TEXT` },
  // Bug 6/8: Skills + Achievements JSON columns
  { name: 'skillsJson', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "skillsJson" TEXT` },
  { name: 'achievementsJson', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "achievementsJson" TEXT` },
  // Bug 10 fix: kycVerification + other Prisma-schema columns that may be
  // missing from the tenant DB, causing P2022 on create/findUnique.
  { name: 'kycVerification', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "kycVerification" TEXT` },
  { name: 'avatarPending', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "avatarPending" TEXT` },
  { name: 'avatarPendingAt', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "avatarPendingAt" TIMESTAMP(3)` },
  { name: 'avatarPendingStatus', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "avatarPendingStatus" TEXT` },
  { name: 'originalBirthday', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "originalBirthday" TIMESTAMP(3)` },
  { name: 'interests', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "interests" TEXT` },
  { name: 'wfhPreApproved', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "wfhPreApproved" BOOLEAN NOT NULL DEFAULT false` },
  { name: 'mobileCheckInEnabled', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "mobileCheckInEnabled" BOOLEAN NOT NULL DEFAULT false` },
  { name: 'webCheckInEnabled', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "webCheckInEnabled" BOOLEAN NOT NULL DEFAULT false` },
  { name: 'holidayWeekendPunchEnabled', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "holidayWeekendPunchEnabled" BOOLEAN NOT NULL DEFAULT false` },
  // Additional Prisma-schema columns that may be missing
  { name: 'kycVerifiedAt', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "kycVerifiedAt" TIMESTAMP(3)` },
  { name: 'timezone', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "timezone" TEXT` },
  { name: 'defaultWeeklyHours', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "defaultWeeklyHours" INTEGER` },
  { name: 'previousEmployer1Logo', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "previousEmployer1Logo" TEXT` },
  { name: 'previousEmployer2Logo', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "previousEmployer2Logo" TEXT` },
  { name: 'previousEmployer3Logo', ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "previousEmployer3Logo" TEXT` },
];

const extraReady = new WeakMap<object, Promise<void>>();
const writeReady = new WeakMap<object, Promise<void>>();

async function existingEmployeeColumns(db: PrismaClient): Promise<Set<string>> {
  const rows = await db.$queryRawUnsafe(
    `SELECT column_name::text AS column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Employee'`,
  ) as Array<{ column_name: string }>;
  return new Set(rows.map((r) => r.column_name));
}

/** Write-path only: ALTER missing extra profile columns after one information_schema check. Never call from GET. */
export async function ensureEmployeeProfileColumns(db: PrismaClient): Promise<void> {
  const cached = extraReady.get(db);
  if (cached) return cached;
  const run = (async () => {
    const existing = await existingEmployeeColumns(db);
    const missing = EXTRA_PROFILE_KEYS.filter((col) => !existing.has(col));
    for (const col of missing) {
      await db.$executeRawUnsafe(`ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "${col}" TEXT`);
    }
  })();
  extraReady.set(db, run);
  try {
    await run;
  } catch (err) {
    extraReady.delete(db);
    throw err;
  }
}

/** Write-path only (employee POST): add missing Employee columns after one catalog check. */
export async function ensureEmployeeWriteColumns(db: PrismaClient): Promise<void> {
  const cached = writeReady.get(db);
  if (cached) return cached;
  const run = (async () => {
    const existing = await existingEmployeeColumns(db);
    const missing = EMPLOYEE_WRITE_COLUMNS.filter((c) => !existing.has(c.name));
    for (const col of missing) {
      try {
        await db.$executeRawUnsafe(col.ddl);
      } catch {
        /* column already exists or type mismatch — create will surface a real error */
      }
    }
  })();
  writeReady.set(db, run);
  try {
    await run;
  } catch (err) {
    writeReady.delete(db);
    throw err;
  }
}
