import { NextResponse } from 'next/server';
import { getDb, getPlatformDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders, hashPassword } from '@/lib/auth';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

function toISOStr(val: any): string {
  if (!val) return '';
  try { return new Date(val).toISOString().split('T')[0]; } catch { return ''; }
}

// GET — Fetch current user profile using RAW SQL (bypasses all Prisma issues)
export async function GET(request: Request) {
  const db = await getDb(request);
  const platformDb = getPlatformDb();
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });

    // Step 1: Find user — try resolved DB, then platform DB, then by email
    let user: any = null;
    let foundInPlatform = false;

    // Try by ID in resolved DB
    try {
      user = await db.user.findUnique({ where: { id: decoded.userId as string }, include: { tenant: true } });
    } catch {}
    // Try by ID in platform DB
    if (!user) {
      try { user = await platformDb.user.findUnique({ where: { id: decoded.userId as string }, include: { tenant: true } }); if (user) foundInPlatform = true; } catch {}
    }
    // Try by email
    if (!user) {
      const email = (decoded as any).email;
      if (email) {
        try { user = await db.user.findUnique({ where: { email }, include: { tenant: true } }); } catch {}
        if (!user) { try { user = await platformDb.user.findUnique({ where: { email }, include: { tenant: true } }); if (user) foundInPlatform = true; } catch {} }
      }
    }

    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404, headers: corsHeaders() });

    // Collect ALL DBs to search for employee data
    const allDbs: any[] = [foundInPlatform ? platformDb : db];
    if (db !== (foundInPlatform ? platformDb : db)) allDbs.push(db);
    if (platformDb !== allDbs[0] && !allDbs.includes(platformDb)) allDbs.push(platformDb);

    // Step 2: Find employee using RAW SQL ONLY (bypasses P2022, P2009, etc.)
    let employee: any = null;
    let empDb: any = null;

    for (const tryDb of allDbs) {
      const dbName = tryDb === platformDb ? 'platformDb' : 'tenantDb';

      // Ensure Employee table exists
      try {
        await tryDb.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "Employee" ("id" TEXT NOT NULL, "employeeId" TEXT NOT NULL, "firstName" TEXT NOT NULL, "lastName" TEXT NOT NULL, "email" TEXT NOT NULL, "userId" TEXT, "departmentId" TEXT, "designationId" TEXT, "branchId" TEXT, "companyId" TEXT, "phone" TEXT, "avatar" TEXT, "personalEmail" TEXT, "reportingManagerId" TEXT, "dateOfJoining" TIMESTAMP(3), "dateOfBirth" TIMESTAMP(3), "gender" TEXT, "maritalStatus" TEXT, "nationality" TEXT, "address" TEXT, "city" TEXT, "state" TEXT, "zipCode" TEXT, "country" TEXT, "bloodGroup" TEXT, "emergencyContactName" TEXT, "emergencyContactPhone" TEXT, "status" TEXT NOT NULL DEFAULT 'active', "employeeStatus" TEXT, "employeeType" TEXT, "bankName" TEXT, "bankAccountNo" TEXT, "bankIfscCode" TEXT, "panNumber" TEXT, "aadhaarNumber" TEXT, "taxId" TEXT, "salary" DOUBLE PRECISION, "salaryCurrency" TEXT, "leavePolicyId" TEXT, "attendancePolicyId" TEXT, "travelPolicyId" TEXT, "salaryStructureId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(), CONSTRAINT "Employee_pkey" PRIMARY KEY ("id"))`);
      } catch {}

      // Try by userId
      try {
        const rows = await tryDb.$queryRawUnsafe(`SELECT * FROM "Employee" WHERE "userId" = $1 LIMIT 1`, user.id) as any[];
        if (rows && rows.length > 0) { employee = rows[0]; empDb = tryDb; console.log(`[Profile] Found employee by userId in ${dbName}`); break; }
      } catch (e) { console.error(`[Profile] SQL by userId in ${dbName}:`, e); }

      // Try by email
      if (!employee && user.email) {
        try {
          const rows = await tryDb.$queryRawUnsafe(`SELECT * FROM "Employee" WHERE "email" = $1 LIMIT 1`, user.email) as any[];
          if (rows && rows.length > 0) { employee = rows[0]; empDb = tryDb; console.log(`[Profile] Found employee by email in ${dbName}`); break; }
        } catch (e) { console.error(`[Profile] SQL by email in ${dbName}:`, e); }
      }
    }

    console.log('[Profile] Employee:', employee ? `${employee.firstname} ${employee.lastname}` : 'NOT FOUND');

    // Build employee data from raw SQL row (PostgreSQL returns lowercase column names)
    let employeeData = null;
    if (employee) {
      // Fetch relations via raw SQL
      let department = null, designation = null, branch = null;
      if (employee.departmentid) {
        try { const r = await empDb.$queryRawUnsafe(`SELECT "name" FROM "Department" WHERE "id" = $1`, employee.departmentid) as any[]; if (r?.[0]) department = r[0]; } catch {}
      }
      if (employee.designationid) {
        try { const r = await empDb.$queryRawUnsafe(`SELECT "title" FROM "Designation" WHERE "id" = $1`, employee.designationid) as any[]; if (r?.[0]) designation = r[0]; } catch {}
      }
      if (employee.branchid) {
        try { const r = await empDb.$queryRawUnsafe(`SELECT "name" FROM "Branch" WHERE "id" = $1`, employee.branchid) as any[]; if (r?.[0]) branch = r[0]; } catch {}
      }

      let dependents: any[] = [], qualifications: any[] = [], documents: any[] = [];
      try { dependents = await empDb.$queryRawUnsafe(`SELECT * FROM "Dependent" WHERE "employeeId" = $1`, employee.id) as any[]; } catch {}
      try { qualifications = await empDb.$queryRawUnsafe(`SELECT * FROM "Qualification" WHERE "employeeId" = $1`, employee.id) as any[]; } catch {}
      try { documents = await empDb.$queryRawUnsafe(`SELECT "id","name","type","status" FROM "Document" WHERE "employeeId" = $1`, employee.id) as any[]; } catch {}

      employeeData = {
        id: employee.id,
        employeeId: employee.employeeid,
        firstName: employee.firstname,
        lastName: employee.lastname,
        email: employee.email,
        personalEmail: employee.personalemail || '',
        employeeStatus: employee.employeestatus || 'confirmed',
        employeeType: employee.employeetype || 'full_time',
        phone: employee.phone || '',
        emergencyContactName: employee.emergencycontactname || '',
        emergencyContactPhone: employee.emergencycontactphone || '',
        address: employee.address || '',
        city: employee.city || '',
        state: employee.state || '',
        zipCode: employee.zipcode || '',
        country: employee.country || '',
        dateOfBirth: toISOStr(employee.dateofbirth),
        gender: employee.gender || '',
        maritalStatus: employee.maritalstatus || '',
        nationality: employee.nationality || '',
        bloodGroup: employee.bloodgroup || '',
        department: department?.name || '',
        designation: designation?.title || '',
        branch: branch?.name || '',
        dateOfJoining: toISOStr(employee.dateofjoining),
        status: employee.status || 'active',
        bankName: employee.bankname || '',
        bankAccountNo: employee.bankaccountno || '',
        bankIfscCode: employee.bankifsccode || '',
        panNumber: employee.pannumber || '',
        aadhaarNumber: employee.aadhaarnumber || '',
        taxId: employee.taxid || '',
        salary: employee.salary,
        salaryCurrency: employee.salarycurrency || 'INR',
        leavePolicyId: employee.leavepolicyid || '',
        attendancePolicyId: employee.attendancepolicyid || '',
        travelPolicyId: employee.travelpolicyid || '',
        salaryStructureId: employee.salarystructureid || '',
        dependents: dependents || [],
        qualifications: qualifications || [],
        experiences: [],
        documents: (documents || []).map((d: any) => ({ id: d.id, name: d.name, type: d.type, status: d.status })),
      };
    }

    // Resolve tenant info
    let tenantInfo = null;
    if (user.tenant) {
      tenantInfo = { id: user.tenant.id, name: user.tenant.name, slug: user.tenant.slug, plan: user.tenant.plan, currency: user.tenant.currency, timezone: user.tenant.timezone };
    } else if (user.tenantId) {
      try { const t = await platformDb.tenant.findUnique({ where: { id: user.tenantId }, select: { id: true, name: true, slug: true, plan: true, currency: true, timezone: true } }); if (t) tenantInfo = t; } catch {}
    }

    return NextResponse.json({
      id: user.id, name: user.name, email: user.email, role: user.role,
      avatar: user.avatar, status: user.status,
      tenant: tenantInfo, employee: employeeData,
      lastLogin: toISOStr(user.lastLogin), createdAt: toISOStr(user.createdAt),
      _debug: { foundInPlatform, hasEmployee: !!employeeData, empEmail: employeeData?.email },
    }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Get profile error:', error);
    return NextResponse.json({ error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown' }, { status: 500, headers: corsHeaders() });
  }
}

// PATCH — Update profile
export async function PATCH(request: Request) {
  const db = await getDb(request);
  const platformDb = getPlatformDb();
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });

    const body = await request.json();
    const { name, avatar, phone, emergencyContactName, emergencyContactPhone, address, city, state, zipCode, country, dateOfBirth, gender, bloodGroup } = body;

    const userUpdateData: Record<string, unknown> = {};
    if (name !== undefined) userUpdateData.name = name;
    if (avatar !== undefined) userUpdateData.avatar = avatar;

    // Try updating user in resolved DB, then platform DB
    let updatedUser = null;
    try { updatedUser = await db.user.update({ where: { id: decoded.userId as string }, data: userUpdateData, include: { tenant: true, employee: true } }); } catch {
      try { updatedUser = await platformDb.user.update({ where: { id: decoded.userId as string }, data: userUpdateData, include: { tenant: true, employee: true } }); } catch {}
    }
    if (!updatedUser) return NextResponse.json({ error: 'User not found' }, { status: 404, headers: corsHeaders() });

    // Update employee via raw SQL (avoids Prisma issues)
    const hasEmpUpdates = phone !== undefined || emergencyContactName !== undefined || emergencyContactPhone !== undefined || address !== undefined || city !== undefined || state !== undefined || zipCode !== undefined || country !== undefined || dateOfBirth !== undefined || gender !== undefined || bloodGroup !== undefined;

    if (hasEmpUpdates) {
      // Find employee via raw SQL
      let empId = null;
      for (const tryDb of [db, platformDb]) {
        try {
          const rows = await tryDb.$queryRawUnsafe(`SELECT "id" FROM "Employee" WHERE "userId" = $1 OR "email" = $2 LIMIT 1`, updatedUser.id, updatedUser.email) as any[];
          if (rows?.[0]?.id) { empId = rows[0].id; break; }
        } catch {}
      }

      if (empId) {
        // Build UPDATE query
        const sets: string[] = [];
        const params: any[] = [];
        let pIdx = 1;
        if (phone !== undefined) { sets.push(`"phone" = $${pIdx++}`); params.push(phone); }
        if (emergencyContactName !== undefined) { sets.push(`"emergencyContactName" = $${pIdx++}`); params.push(emergencyContactName); }
        if (emergencyContactPhone !== undefined) { sets.push(`"emergencyContactPhone" = $${pIdx++}`); params.push(emergencyContactPhone); }
        if (address !== undefined) { sets.push(`"address" = $${pIdx++}`); params.push(address); }
        if (city !== undefined) { sets.push(`"city" = $${pIdx++}`); params.push(city); }
        if (state !== undefined) { sets.push(`"state" = $${pIdx++}`); params.push(state); }
        if (zipCode !== undefined) { sets.push(`"zipCode" = $${pIdx++}`); params.push(zipCode); }
        if (country !== undefined) { sets.push(`"country" = $${pIdx++}`); params.push(country); }
        if (dateOfBirth !== undefined) { sets.push(`"dateOfBirth" = $${pIdx++}`); params.push(dateOfBirth ? new Date(dateOfBirth) : null); }
        if (gender !== undefined) { sets.push(`"gender" = $${pIdx++}`); params.push(gender); }
        if (bloodGroup !== undefined) { sets.push(`"bloodGroup" = $${pIdx++}`); params.push(bloodGroup); }
        params.push(empId);

        if (sets.length > 0) {
          const sql = `UPDATE "Employee" SET ${sets.join(', ')} WHERE "id" = $${pIdx}`;
          for (const tryDb of [db, platformDb]) {
            try { await tryDb.$executeRawUnsafe(sql, ...params); break; } catch {}
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Profile updated successfully',
      user: { id: updatedUser.id, name: updatedUser.name, email: updatedUser.email, avatar: updatedUser.avatar, role: updatedUser.role },
    }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Update profile error:', error);
    return NextResponse.json({ error: 'Failed to update profile', details: error instanceof Error ? error.message : 'Unknown' }, { status: 500, headers: corsHeaders() });
  }
}
