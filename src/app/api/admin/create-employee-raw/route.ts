import { NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders, hashPassword } from '@/lib/auth';
import { randomBytes } from 'crypto';

/**
 * POST /api/admin/create-employee-raw
 *
 * Admin-only endpoint to create an Employee + linked User via raw SQL,
 * bypassing Prisma's strict column-presence check (which fails on tenant
 * databases that haven't been ALTERed to add newer columns like
 * kycVerification, avatarPending, etc.).
 *
 * Body:
 *   {
 *     employeeId: "MARQ002",
 *     firstName: "Suresh",
 *     lastName: "V N",
 *     email: "suresh.v.n@marqaitech.com",
 *     password: "MarqAI@2026",
 *     departmentId, designationId, branchId, companyId,
 *     phone?, dateOfJoining?
 *   }
 */
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

const EMPLOYEE_COLUMN_DDLS = [
  `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "kycVerification" TEXT`,
  `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "avatarPending" TEXT`,
  `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "avatarPendingAt" TIMESTAMP(3)`,
  `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "avatarPendingStatus" TEXT`,
  `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "originalBirthday" TIMESTAMP(3)`,
  `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "wfhPreApproved" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "mobileCheckInEnabled" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "webCheckInEnabled" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "holidayWeekendPunchEnabled" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "personalEmail" TEXT`,
  `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "employeeStatus" TEXT NOT NULL DEFAULT 'confirmed'`,
  `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "employeeType" TEXT NOT NULL DEFAULT 'full_time'`,
  `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "maritalStatus" TEXT`,
  `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "nationality" TEXT`,
  `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "avatar" TEXT`,
  `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "reportingManagerId" TEXT`,
  `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "reportingManager" TEXT`,
  `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "previousEmployer1" TEXT`,
  `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "previousEmployer2" TEXT`,
  `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "previousEmployer3" TEXT`,
  `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "previousDesignation1" TEXT`,
  `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "previousDesignation2" TEXT`,
  `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "previousDesignation3" TEXT`,
  `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "previousDuration1" TEXT`,
  `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "previousDuration2" TEXT`,
  `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "previousDuration3" TEXT`,
  `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "previousReason1" TEXT`,
  `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "previousReason2" TEXT`,
  `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "previousReason3" TEXT`,
  `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "previousEmployer1Logo" TEXT`,
  `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "previousEmployer2Logo" TEXT`,
  `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "previousEmployer3Logo" TEXT`,
  `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "punchMethod" TEXT`,
];

const USER_COLUMN_DDLS = [
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "avatar" TEXT`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastLogin" TIMESTAMP(3)`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phone" TEXT`,
];

function newId(prefix: string): string {
  return `${prefix}${randomBytes(8).toString('hex')}${Date.now().toString(36).slice(-4)}`;
}

export async function POST(request: Request) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });
    if (!['super_admin', 'tenant_admin', 'admin'].includes(decoded.role as string)) {
      return NextResponse.json({ error: 'Only admins can use this endpoint' }, { status: 403, headers: corsHeaders() });
    }

    const body = await request.json();
    const { employeeId, firstName, lastName, email, password, departmentId, designationId, branchId, companyId, phone, dateOfJoining } = body;

    if (!employeeId || !firstName || !lastName || !email || !password || !departmentId || !designationId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400, headers: corsHeaders() });
    }

    // tenantId from the decoded token — kept for reference (not used in
    // INSERT statements because the tenant DB itself is tenant-scoped).
    const _tenantId = (decoded as any).tenantId || null;
    void _tenantId;

    // ── Step 1: Bring the tenant DB schema up to date ──
    console.log('[create-employee-raw] Syncing Employee + User columns...');
    for (const ddl of EMPLOYEE_COLUMN_DDLS) {
      try { await db.$executeRawUnsafe(ddl); } catch (e) { /* ignore — column may already exist */ }
    }
    for (const ddl of USER_COLUMN_DDLS) {
      try { await db.$executeRawUnsafe(ddl); } catch (e) { /* ignore */ }
    }

    // ── Step 2: Check email uniqueness ──
    const existingUsers = await db.$queryRawUnsafe(
      `SELECT id FROM "User" WHERE email = $1 LIMIT 1`,
      email,
    ) as Array<{ id: string }>;
    if (existingUsers.length > 0) {
      return NextResponse.json({ error: 'Email already in use' }, { status: 400, headers: corsHeaders() });
    }

    // ── Step 3: Check employeeId uniqueness ──
    const existingEmps = await db.$queryRawUnsafe(
      `SELECT id FROM "Employee" WHERE "employeeId" = $1 LIMIT 1`,
      employeeId,
    ) as Array<{ id: string }>;
    if (existingEmps.length > 0) {
      return NextResponse.json({ error: 'Employee ID already in use' }, { status: 400, headers: corsHeaders() });
    }

    // ── Step 4: Hash password ──
    const passwordHash = await hashPassword(password);

    // ── Step 5: Create User ──
    // Note: User table in the tenant DB has no tenantId column (implicit —
    // the DB itself is tenant-scoped). Only the platform DB User has it.
    const userId = newId('cmu');
    const userName = `${firstName} ${lastName}`.trim();
    await db.$executeRawUnsafe(
      `INSERT INTO "User" ("id", "email", "name", "password", "role", "status", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, 'employee', 'active', NOW(), NOW())`,
      userId, email, userName, passwordHash,
    );

    // ── Step 6: Create Employee ──
    const empId = newId('cme');
    const doj = dateOfJoining ? new Date(dateOfJoining) : new Date();
    // Note: Employee table does NOT have a tenantId column in the tenant DB
    // (the tenantId is implicit — the tenant DB IS the tenant). Only User has it.
    await db.$executeRawUnsafe(
      `INSERT INTO "Employee" (
        "id", "employeeId", "firstName", "lastName", "email", "userId",
        "departmentId", "designationId", "branchId", "companyId",
        "phone", "status", "employeeStatus", "employeeType",
        "dateOfJoining", "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'active', 'active', 'permanent', $12, NOW(), NOW())`,
      empId, employeeId, firstName, lastName, email, userId,
      departmentId, designationId, branchId || null, companyId || null,
      phone || null, doj,
    );

    return NextResponse.json({
      success: true,
      employee: {
        id: empId,
        employeeId,
        email,
        name: userName,
        firstName,
        lastName,
        userId,
      },
    }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Create employee raw error:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: 'Internal server error', details: msg }, { status: 500, headers: corsHeaders() });
  }
}
