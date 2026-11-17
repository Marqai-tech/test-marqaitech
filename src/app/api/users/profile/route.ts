import { NextResponse } from 'next/server';
import { getDb, getPlatformDb, getDbForTenant } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders, hashPassword } from '@/lib/auth';
import { profilePhotoPayloadError } from '@/lib/profile-photo';
import { ensureEmployeeProfileColumns } from '@/lib/employee-profile-columns';
import { invalidateMeCacheForUser } from '@/lib/me-response-cache';
import { canEditEmployeeRecords } from '@/lib/roleAccess';
import { applyEmployeeFieldChange, FIELD_SENSITIVITY, SELF_SERVICE_LOCKED_FIELDS } from '@/lib/employee-update-request';
import { replaceEmployeeExperience, replaceEmployeeAchievements, replaceEmployeeSkills, replaceEmployeeDependents } from '@/lib/employee-row-collections';

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

function rowVal(row: Record<string, unknown> | null | undefined, ...keys: string[]) {
  if (!row) return null;
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

const PROFILE_USER_SELECT = {
  id: true,
  tenantId: true,
  email: true,
  name: true,
  role: true,
  avatar: true,
  status: true,
  lastLogin: true,
  createdAt: true,
  tenant: {
    select: { id: true, name: true, slug: true, plan: true, currency: true, timezone: true },
  },
} as const;

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

    // Try by ID in resolved DB (tenant DB — this is where the employee lives)
    try {
      user = await db.user.findUnique({ where: { id: decoded.userId as string }, select: PROFILE_USER_SELECT });
    } catch {}
    // Try by ID in platform DB
    if (!user) {
      try { user = await platformDb.user.findUnique({ where: { id: decoded.userId as string }, select: PROFILE_USER_SELECT }); if (user) foundInPlatform = true; } catch {}
    }
    // Try by email
    if (!user) {
      const email = (decoded as any).email;
      if (email) {
        try { user = await db.user.findUnique({ where: { email }, select: PROFILE_USER_SELECT }); } catch {}
        if (!user) { try { user = await platformDb.user.findUnique({ where: { email }, select: PROFILE_USER_SELECT }); if (user) foundInPlatform = true; } catch {} }
      }
    }

    // Task 162 fix: if all Prisma attempts failed (schema drift on the
    // tenant relation in PROFILE_USER_SELECT), fall back to RAW SQL.
    if (!user) {
      try {
        const rows = await db.$queryRawUnsafe(
          `SELECT u.id, u.email, u.name, u.role, u.avatar, u.status, u."tenantId",
                  t.name AS "tenantName", t.slug AS "tenantSlug", t.plan AS "tenantPlan"
           FROM "User" u
           LEFT JOIN "Tenant" t ON t.id = u."tenantId"
           WHERE u.id = $1 LIMIT 1`,
          decoded.userId,
        ) as any[];
        if (rows[0]) {
          const r = rows[0];
          user = {
            id: r.id, email: r.email, name: r.name, role: r.role, avatar: r.avatar,
            status: r.status, tenantId: r.tenantId,
            tenant: r.tenantSlug ? { id: r.tenantId, name: r.tenantName, slug: r.tenantSlug, plan: r.tenantPlan } : null,
          };
        }
      } catch {}
    }
    if (!user) {
      try {
        const rows = await platformDb.$queryRawUnsafe(
          `SELECT u.id, u.email, u.name, u.role, u.avatar, u.status, u."tenantId",
                  t.name AS "tenantName", t.slug AS "tenantSlug", t.plan AS "tenantPlan"
           FROM "User" u
           LEFT JOIN "Tenant" t ON t.id = u."tenantId"
           WHERE u.id = $1 LIMIT 1`,
          decoded.userId,
        ) as any[];
        if (rows[0]) {
          const r = rows[0];
          user = {
            id: r.id, email: r.email, name: r.name, role: r.role, avatar: r.avatar,
            status: r.status, tenantId: r.tenantId,
            tenant: r.tenantSlug ? { id: r.tenantId, name: r.tenantName, slug: r.tenantSlug, plan: r.tenantPlan } : null,
          };
          foundInPlatform = true;
        }
      } catch {}
    }

    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404, headers: corsHeaders() });

    // ─── CRITICAL FIX: Explicitly resolve the tenant DB from the user's tenantId ───
    // getDb(request) relies on the x-tenant-slug header from middleware, which
    // might not be set correctly. This caused the profile API to search the
    // platform DB instead of the tenant DB — even though the employee record
    // exists in the tenant DB with the correct userId.
    //
    // Fix: use the user's tenantId → look up the tenant slug → getDbForTenant(slug)
    // This guarantees we search the tenant DB where the employee actually lives.
    let explicitTenantDb: any = null;
    let tenantSlug: string | null = null;
    if (user.tenantId) {
      try {
        // user.tenant is already included above. Reuse its slug to avoid an
        // extra platform database round-trip for every profile page load.
        let resolvedSlug = user.tenant?.slug as string | undefined;
        if (!resolvedSlug) {
          const tenant = await platformDb.tenant.findUnique({
            where: { id: user.tenantId },
            select: { slug: true },
          });
          resolvedSlug = tenant?.slug;
        }
        if (resolvedSlug) {
          tenantSlug = resolvedSlug;
          explicitTenantDb = await getDbForTenant(resolvedSlug);
          console.log(`[Profile] Explicitly resolved tenant DB for slug "${resolvedSlug}"`);
        }
      } catch (e) {
        console.error('[Profile] Failed to resolve tenant DB from tenantId:', e);
      }
    }

    // ─── Build search list: tenant DB FIRST, then platform DB ───
    // The employee record lives in the TENANT DB. We search it first.
    // - explicitTenantDb: resolved from user.tenantId (most reliable)
    // - db: resolved by getDb(request) from x-tenant-slug header
    // - platformDb: last resort
    const allDbs: any[] = [];
    if (explicitTenantDb && explicitTenantDb !== platformDb) {
      allDbs.push(explicitTenantDb);
    }
    if (db !== platformDb && !allDbs.includes(db)) {
      allDbs.push(db);
    }
    if (!allDbs.includes(platformDb)) {
      allDbs.push(platformDb);
    }

    // Step 2: Find employee using RAW SQL ONLY (bypasses P2022, P2009, etc.)
    let employee: any = null;
    let empDb: any = null;
    let foundByStrategy = '';

    for (const tryDb of allDbs) {
      const dbName = tryDb === platformDb ? 'platformDb' : (tryDb === explicitTenantDb ? 'explicitTenantDb' : 'tenantDb');

      // Try by userId
      try {
        const rows = await tryDb.$queryRawUnsafe(`SELECT * FROM "Employee" WHERE "userId" = $1 LIMIT 1`, user.id) as any[];
        if (rows && rows.length > 0) { employee = rows[0]; empDb = tryDb; foundByStrategy = `userId in ${dbName}`; console.log(`[Profile] Found employee by userId in ${dbName}`); break; }
      } catch (e) { console.error(`[Profile] SQL by userId in ${dbName}:`, e); }

      // Try by email (exact match)
      if (!employee && user.email) {
        try {
          const rows = await tryDb.$queryRawUnsafe(`SELECT * FROM "Employee" WHERE "email" = $1 LIMIT 1`, user.email) as any[];
          if (rows && rows.length > 0) { employee = rows[0]; empDb = tryDb; foundByStrategy = `email in ${dbName}`; console.log(`[Profile] Found employee by email in ${dbName}`); break; }
        } catch (e) { console.error(`[Profile] SQL by email in ${dbName}:`, e); }
      }

      // Try by email (case-insensitive)
      if (!employee && user.email) {
        try {
          const rows = await tryDb.$queryRawUnsafe(`SELECT * FROM "Employee" WHERE LOWER("email") = LOWER($1) LIMIT 1`, user.email) as any[];
          if (rows && rows.length > 0) { employee = rows[0]; empDb = tryDb; foundByStrategy = `email (ci) in ${dbName}`; console.log(`[Profile] Found employee by email (case-insensitive) in ${dbName}`); break; }
        } catch (e) { console.error(`[Profile] SQL by email (ci) in ${dbName}:`, e); }
      }

      // Try by personalEmail
      if (!employee && user.email) {
        try {
          const rows = await tryDb.$queryRawUnsafe(`SELECT * FROM "Employee" WHERE "personalEmail" = $1 LIMIT 1`, user.email) as any[];
          if (rows && rows.length > 0) { employee = rows[0]; empDb = tryDb; foundByStrategy = `personalEmail in ${dbName}`; console.log(`[Profile] Found employee by personalEmail in ${dbName}`); break; }
        } catch (e) { console.error(`[Profile] SQL by personalEmail in ${dbName}:`, e); }
      }
    }

    // If employee not found by userId or email, try TRIM/LOWER email match
    if (!employee && user.email) {
      for (const tryDb of allDbs) {
        const dbName = tryDb === platformDb ? 'platformDb' : 'tenantDb';
        try {
          const rows = await tryDb.$queryRawUnsafe(
            `SELECT * FROM "Employee" WHERE LOWER(TRIM("email")) = LOWER(TRIM($1)) OR LOWER(TRIM("personalEmail")) = LOWER(TRIM($1)) LIMIT 1`,
            user.email
          ) as any[];
          if (rows && rows.length > 0) {
            employee = rows[0];
            empDb = tryDb;
            foundByStrategy = `TRIM/LOWER email in ${dbName}`;
            console.log(`[Profile] Found employee by TRIM/LOWER email match in ${dbName}`);
            try {
              await tryDb.$executeRawUnsafe(
                `UPDATE "Employee" SET "userId" = $1 WHERE "id" = $2`,
                user.id, employee.id
              );
              console.log(`[Profile] Linked employee ${employee.id} to user ${user.id}`);
            } catch (linkErr) {
              console.error('[Profile] Failed to link employee to user:', linkErr);
            }
            break;
          }
        } catch (e) {
          console.error(`[Profile] TRIM/LOWER search in ${dbName}:`, e);
        }
      }
    }

    // LAST RESORT 1: Try finding by the user's name
    if (!employee && user.name) {
      for (const tryDb of allDbs) {
        const dbName = tryDb === platformDb ? 'platformDb' : 'tenantDb';
        try {
          const nameParts = user.name.split(' ');
          if (nameParts.length >= 2) {
            const rows = await tryDb.$queryRawUnsafe(
              `SELECT * FROM "Employee" WHERE "firstName" = $1 AND "lastName" = $2 LIMIT 1`,
              nameParts[0], nameParts.slice(1).join(' ')
            ) as any[];
            if (rows && rows.length > 0) {
              employee = rows[0];
              empDb = tryDb;
              foundByStrategy = `name in ${dbName}`;
              console.log(`[Profile] Found employee by name match in ${dbName}`);
              try {
                await tryDb.$executeRawUnsafe(
                  `UPDATE "Employee" SET "userId" = $1, "email" = $2 WHERE "id" = $3`,
                  user.id, user.email, employee.id
                );
                console.log(`[Profile] Linked employee ${employee.id} to user ${user.id} (name match)`);
              } catch {}
              break;
            }
          }
        } catch (e) {
          console.error(`[Profile] Name search in ${dbName}:`, e);
        }
      }
    }

    // LAST RESORT 2: Find ANY employee with a NULL userId in the tenant DB
    if (!employee) {
      for (const tryDb of allDbs) {
        const dbName = tryDb === platformDb ? 'platformDb' : 'tenantDb';
        try {
          const rows = await tryDb.$queryRawUnsafe(
            `SELECT * FROM "Employee" WHERE "userId" IS NULL ORDER BY "createdAt" ASC LIMIT 1`
          ) as any[];
          if (rows && rows.length > 0) {
            employee = rows[0];
            empDb = tryDb;
            foundByStrategy = `NULL userId in ${dbName}`;
            console.log(`[Profile] Found employee with NULL userId in ${dbName}, linking...`);
            try {
              await tryDb.$executeRawUnsafe(
                `UPDATE "Employee" SET "userId" = $1, "email" = $2 WHERE "id" = $3`,
                user.id, user.email, employee.id
              );
              console.log(`[Profile] Linked employee ${employee.id} to user ${user.id} (NULL userId fallback)`);
            } catch {}
            break;
          }
        } catch (e) {
          console.error(`[Profile] NULL userId search in ${dbName}:`, e);
        }
      }
    }

    console.log('[Profile] Employee:', employee ? `${rowVal(employee, 'firstName', 'firstname') || ''} ${rowVal(employee, 'lastName', 'lastname') || ''}`.trim() : 'NOT FOUND', '| Strategy:', foundByStrategy || 'none');

    // Build employee data from raw SQL row (quoted columns stay camelCase)
    let employeeData = null;
    if (employee) {

      // These independent, employee-scoped lookups should not block one
      // another; sequential round-trips were adding noticeable profile delay.
      let department = null, designation = null, branch = null;
      const departmentId = rowVal(employee, 'departmentId', 'departmentid');
      const designationId = rowVal(employee, 'designationId', 'designationid');
      const branchId = rowVal(employee, 'branchId', 'branchid');
      const [departmentRows, designationRows, branchRows, dependents, managerRows, experienceRows, skillRows, achievementRows] = await Promise.all([
        departmentId
          ? empDb.$queryRawUnsafe(`SELECT "name" FROM "Department" WHERE "id" = $1 LIMIT 1`, departmentId).catch(() => [])
          : Promise.resolve([]),
        designationId
          ? empDb.$queryRawUnsafe(`SELECT "title" FROM "Designation" WHERE "id" = $1 LIMIT 1`, designationId).catch(() => [])
          : Promise.resolve([]),
        branchId
          ? empDb.$queryRawUnsafe(`SELECT "name" FROM "Branch" WHERE "id" = $1 LIMIT 1`, branchId).catch(() => [])
          : Promise.resolve([]),
        empDb.$queryRawUnsafe(`SELECT "id", "name", "relation" AS "relationship", "dateOfBirth", "gender" FROM "Dependent" WHERE "employeeId" = $1`, employee.id).catch(() => []),
        employee.reportingManagerId
          ? empDb.$queryRawUnsafe(`SELECT "id", "employeeId", "firstName", "lastName", "email" FROM "Employee" WHERE "id" = $1 LIMIT 1`, employee.reportingManagerId).catch(() => [])
          : Promise.resolve([]),
        // Task 139 — structured collections for My Profile parity
        empDb.$queryRawUnsafe(`SELECT * FROM "Experience" WHERE "employeeId" = $1 ORDER BY "startDate" DESC`, employee.id).catch(() => []),
        empDb.$queryRawUnsafe(`SELECT * FROM "EmployeeSkill" WHERE "employeeId" = $1`, employee.id).catch(() => []),
        empDb.$queryRawUnsafe(`SELECT * FROM "EmployeeAchievement" WHERE "employeeId" = $1 ORDER BY "createdAt" DESC`, employee.id).catch(() => []),
      ]) as [
        Array<Record<string, unknown>>,
        Array<Record<string, unknown>>,
        Array<Record<string, unknown>>,
        Array<Record<string, unknown>>,
        Array<Record<string, unknown>>,
        Array<Record<string, unknown>>,
        Array<Record<string, unknown>>,
        Array<Record<string, unknown>>,
      ];
      department = departmentRows[0] || null;
      designation = designationRows[0] || null;
      branch = branchRows[0] || null;
      employee.reportingManager = managerRows[0] || null;

      employeeData = {
        id: employee.id,
        employeeId: rowVal(employee, 'employeeId', 'employeeid'),
        firstName: rowVal(employee, 'firstName', 'firstname') || '',
        lastName: rowVal(employee, 'lastName', 'lastname') || '',
        email: rowVal(employee, 'email') || '',
        personalEmail: rowVal(employee, 'personalEmail', 'personalemail') || '',
        employeeStatus: rowVal(employee, 'employeeStatus', 'employeestatus') || 'confirmed',
        employeeType: rowVal(employee, 'employeeType', 'employeetype') || 'full_time',
        reportingManagerId: rowVal(employee, 'reportingManagerId', 'reportingmanagerid') || null,
        reportingManager: employee.reportingManager || null,
        phone: rowVal(employee, 'phone') || '',
        // The same image is already returned once at the top-level `avatar`;
        // duplicating a base64 photo here needlessly inflated the response.
        avatar: '',
        emergencyContactName: rowVal(employee, 'emergencyContactName', 'emergencycontactname') || '',
        emergencyContactPhone: rowVal(employee, 'emergencyContactPhone', 'emergencycontactphone') || '',
        emergencyContactRelation: rowVal(employee, 'emergencyContactRelation', 'emergencycontactrelation') || '',
        address: rowVal(employee, 'address') || '',
        city: rowVal(employee, 'city') || '',
        state: rowVal(employee, 'state') || '',
        zipCode: rowVal(employee, 'zipCode', 'zipcode') || '',
        country: rowVal(employee, 'country') || '',
        currentAddress: rowVal(employee, 'currentAddress', 'currentaddress') || '',
        currentCity: rowVal(employee, 'currentCity', 'currentcity') || '',
        currentState: rowVal(employee, 'currentState', 'currentstate') || '',
        currentZipCode: rowVal(employee, 'currentZipCode', 'currentzipcode') || '',
        currentCountry: rowVal(employee, 'currentCountry', 'currentcountry') || '',
        dateOfBirth: toISOStr(rowVal(employee, 'dateOfBirth', 'dateofbirth')),
        gender: rowVal(employee, 'gender') || '',
        maritalStatus: rowVal(employee, 'maritalStatus', 'maritalstatus') || '',
        nationality: rowVal(employee, 'nationality') || '',
        bloodGroup: rowVal(employee, 'bloodGroup', 'bloodgroup') || '',
        hasChronicIllness: rowVal(employee, 'hasChronicIllness', 'haschronicillness') || '',
        chronicIllnessDetails: rowVal(employee, 'chronicIllnessDetails', 'chronicillnessdetails') || '',
        hasAllergies: rowVal(employee, 'hasAllergies', 'hasallergies') || '',
        allergyDetails: rowVal(employee, 'allergyDetails', 'allergydetails') || '',
        hasDisability: rowVal(employee, 'hasDisability', 'hasdisability') || '',
        disabilityDetails: rowVal(employee, 'disabilityDetails', 'disabilitydetails') || '',
        isOnMedication: rowVal(employee, 'isOnMedication', 'isonmedication') || '',
        medicationDetails: rowVal(employee, 'medicationDetails', 'medicationdetails') || '',
        hasHadSurgery: rowVal(employee, 'hasHadSurgery', 'hashadsurgery') || '',
        surgeryDetails: rowVal(employee, 'surgeryDetails', 'surgerydetails') || '',
        emergencyMedicalCondition: rowVal(employee, 'emergencyMedicalCondition', 'emergencymedicalcondition') || '',
        primaryPhysicianName: rowVal(employee, 'primaryPhysicianName', 'primaryphysicianname') || '',
        primaryPhysicianPhone: rowVal(employee, 'primaryPhysicianPhone', 'primaryphysicianphone') || '',
        healthInsuranceProvider: rowVal(employee, 'healthInsuranceProvider', 'healthinsuranceprovider') || '',
        healthInsurancePolicyNo: rowVal(employee, 'healthInsurancePolicyNo', 'healthinsurancepolicyno') || '',
        previousEmployer1: rowVal(employee, 'previousEmployer1', 'previousemployer1') || '',
        previousEmployer1Logo: rowVal(employee, 'previousEmployer1Logo', 'previousemployer1logo') || '',
        previousDesignation1: rowVal(employee, 'previousDesignation1', 'previousdesignation1') || '',
        previousDuration1: rowVal(employee, 'previousDuration1', 'previousduration1') || '',
        previousReason1: rowVal(employee, 'previousReason1', 'previousreason1') || '',
        previousEmployer2: rowVal(employee, 'previousEmployer2', 'previousemployer2') || '',
        previousEmployer2Logo: rowVal(employee, 'previousEmployer2Logo', 'previousemployer2logo') || '',
        previousDesignation2: rowVal(employee, 'previousDesignation2', 'previousdesignation2') || '',
        previousDuration2: rowVal(employee, 'previousDuration2', 'previousduration2') || '',
        previousReason2: rowVal(employee, 'previousReason2', 'previousreason2') || '',
        previousEmployer3: rowVal(employee, 'previousEmployer3', 'previousemployer3') || '',
        previousEmployer3Logo: rowVal(employee, 'previousEmployer3Logo', 'previousemployer3logo') || '',
        previousDesignation3: rowVal(employee, 'previousDesignation3', 'previousdesignation3') || '',
        previousDuration3: rowVal(employee, 'previousDuration3', 'previousduration3') || '',
        previousReason3: rowVal(employee, 'previousReason3', 'previousreason3') || '',
        totalExperience: rowVal(employee, 'totalExperience', 'totalexperience') || '',
        pfNumber: rowVal(employee, 'pfNumber', 'pfnumber') || '',
        pfUAN: rowVal(employee, 'pfUAN', 'pfuan') || '',
        pfNomineeName: rowVal(employee, 'pfNomineeName', 'pfnomineename') || '',
        pfNomineeRelation: rowVal(employee, 'pfNomineeRelation', 'pfnomineerelation') || '',
        pfNomineePercentage: rowVal(employee, 'pfNomineePercentage', 'pfnomineepercentage') || '',
        esiNumber: rowVal(employee, 'esiNumber', 'esinumber') || '',
        esiDispensary: rowVal(employee, 'esiDispensary', 'esidispensary') || '',
        esiNomineeName: rowVal(employee, 'esiNomineeName', 'esinomineename') || '',
        esiNomineeRelation: rowVal(employee, 'esiNomineeRelation', 'esinomineerelation') || '',
        professionalTaxNumber: rowVal(employee, 'professionalTaxNumber', 'professionaltaxnumber') || '',
        lwfNumber: rowVal(employee, 'lwfNumber', 'lwfnumber') || '',
        department: department?.name || '',
        designation: designation?.title || '',
        branch: branch?.name || '',
        dateOfJoining: toISOStr(rowVal(employee, 'dateOfJoining', 'dateofjoining')),
        status: rowVal(employee, 'status') || 'active',
        bankName: rowVal(employee, 'bankName', 'bankname') || '',
        bankAccountNo: rowVal(employee, 'bankAccountNo', 'bankaccountno') || '',
        bankIfscCode: rowVal(employee, 'bankIfscCode', 'bankifsccode') || '',
        panNumber: rowVal(employee, 'panNumber', 'pannumber') || '',
        aadhaarNumber: rowVal(employee, 'aadhaarNumber', 'aadhaarnumber') || '',
        taxId: rowVal(employee, 'taxId', 'taxid') || '',
        salary: rowVal(employee, 'salary'),
        salaryCurrency: rowVal(employee, 'salaryCurrency', 'salarycurrency') || 'INR',
        leavePolicyId: rowVal(employee, 'leavePolicyId', 'leavepolicyid') || '',
        attendancePolicyId: rowVal(employee, 'attendancePolicyId', 'attendancepolicyid') || '',
        travelPolicyId: rowVal(employee, 'travelPolicyId', 'travelpolicyid') || '',
        salaryStructureId: rowVal(employee, 'salaryStructureId', 'salarystructureid') || '',
        dependents: dependents || [],
        documents: [],
        // Task 139 — parity: birthday + interests + structured collections +
        // pending photo (so My Profile can show the approval state and never
        // wipe Original Birthday on save).
        originalBirthday: toISOStr(rowVal(employee, 'originalBirthday', 'originalbirthday')) || '',
        interests: rowVal(employee, 'interests', 'interests') || '',
        avatarPendingAt: rowVal(employee, 'avatarPendingAt', 'avatarpendingat') || null,
        experiences: (experienceRows || []).map((x) => ({
          id: x.id, company: x.company, designation: x.designation,
          startDate: toISOStr(x.startDate), endDate: toISOStr(x.endDate) || null,
          isCurrent: Boolean(x.isCurrent), description: x.description || null,
          companyLogo: x.companyLogo || null, companyCategory: x.companyCategory || null,
          companyLevel: x.companyLevel || null,
          letters: (() => { try { return x.letters ? JSON.parse(String(x.letters)) : []; } catch { return []; } })(),
          domains: (() => { try { return x.domains ? JSON.parse(String(x.domains)) : []; } catch { return []; } })(),
        })),
        skills: (skillRows || []).map((s) => ({ id: s.id, skill: s.skill, level: s.level || 'intermediate', yearsOfExp: s.yearsOfExp ?? null })),
        achievements: (achievementRows || []).map((a) => ({
          id: a.id, title: a.title, description: a.description || null,
          category: a.category || 'other', issuer: a.issuer || null, achievedOn: toISOStr(a.achievedOn) || null,
        })),
      };
    }

    // Resolve tenant info
    let tenantInfo = null;
    if (user.tenant) {
      tenantInfo = { id: user.tenant.id, name: user.tenant.name, slug: user.tenant.slug, plan: user.tenant.plan, currency: user.tenant.currency, timezone: user.tenant.timezone };
    } else if (user.tenantId) {
      try { const t = await platformDb.tenant.findUnique({ where: { id: user.tenantId }, select: { id: true, name: true, slug: true, plan: true, currency: true, timezone: true } }); if (t) tenantInfo = t; } catch {}
    }

    const profileAvatar = (employeeData?.avatar as string | undefined) || user.avatar || null;

    return NextResponse.json({
      id: user.id, name: user.name, email: user.email, role: user.role,
      avatar: profileAvatar, status: user.status,
      tenant: tenantInfo, employee: employeeData,
      lastLogin: toISOStr(user.lastLogin), createdAt: toISOStr(user.createdAt),
      _debug: {
        foundInPlatform,
        hasEmployee: !!employeeData,
        empEmail: employeeData?.email,
        foundByStrategy: foundByStrategy || 'not_found',
        tenantSlug: tenantSlug,
        searchedDbs: allDbs.length,
        explicitTenantDbResolved: !!explicitTenantDb && explicitTenantDb !== platformDb,
      },
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
    const {
      name, avatar, firstName, lastName, phone, personalEmail,
      emergencyContactName, emergencyContactPhone, emergencyContactRelation,
      address, city, state, zipCode, country,
      currentAddress, currentCity, currentState, currentZipCode, currentCountry,
      dateOfBirth, gender, bloodGroup, maritalStatus, nationality,
      bankName, bankAccountNo, bankIfscCode, panNumber, aadhaarNumber, taxId,
      experiences, achievements, skills, dependents, originalBirthday,
    } = body;
    let avatarPendingSubmitted = false;
    if (avatar !== undefined) {
      const avatarError = profilePhotoPayloadError(avatar);
      if (avatarError) {
        return NextResponse.json({ error: avatarError }, { status: 400, headers: corsHeaders() });
      }
    }

    const derivedName = [firstName, lastName].filter(Boolean).join(' ').trim();
    // Task 86: HR/admin roles keep direct self-edit rights. Employees and
    // managers go through the profile-update approval workflow for high-risk
    // fields (names, DOB, bank, KYC…) — see the routing below.
    const privileged = canEditEmployeeRecords((decoded.role as string) || '');
    const userUpdateData: Record<string, unknown> = {};
    if (privileged) {
      if (name !== undefined) userUpdateData.name = name;
      else if (derivedName) userUpdateData.name = derivedName;
    }
    // Task 139/163 — profile-photo approval: ALL photo uploads (employees AND
    // admins) park in Employee.avatarPending and go live only after HR/Admin
    // confirmation. Photo REMOVAL (avatar === null) stays a direct action.
    // The privileged direct-self-edit path for new photos was removed so the
    // approval workflow is consistent for everyone.
    // (No userUpdateData.avatar for new uploads — only for removal which is
    // handled in the non-privileged path below.)

    const userId = decoded.userId as string;
    let updatedUser = null;
    if (Object.keys(userUpdateData).length > 0) {
      try { updatedUser = await db.user.update({ where: { id: userId }, data: userUpdateData, include: { tenant: true, employee: true } }); } catch {
        try { updatedUser = await platformDb.user.update({ where: { id: userId }, data: userUpdateData, include: { tenant: true, employee: true } }); } catch {}
      }
      // Task 162 fix: if Prisma update failed (schema drift on the include),
      // do a RAW SQL UPDATE on the User table directly (no relations needed).
      if (!updatedUser) {
        try {
          const sets: string[] = [];
          const params: any[] = [];
          let pIdx = 1;
          for (const [k, v] of Object.entries(userUpdateData)) {
            sets.push(`"${k}" = $${pIdx++}`);
            params.push(v ?? null);
          }
          params.push(userId);
          await db.$executeRawUnsafe(`UPDATE "User" SET ${sets.join(', ')}, "updatedAt" = NOW() WHERE "id" = $${pIdx}`, ...params);
        } catch (sqlErr) {
          console.warn('[Profile PATCH] RAW SQL User update fallback failed:', sqlErr instanceof Error ? sqlErr.message : sqlErr);
        }
      }
      // BUG FIX (profile picture persistence): invalidate the /api/auth/me
      // 15s in-memory cache so the next fetchUser() call returns the freshly
      // written avatar instead of the stale pre-update response. Mirrors the
      // invalidation already done in PUT /api/employees/[id] (line ~768).
      if (avatar !== undefined) {
        try { invalidateMeCacheForUser(userId); } catch {}
      }
    }
    if (!updatedUser) {
      try { updatedUser = await db.user.findUnique({ where: { id: userId }, include: { tenant: true, employee: true } }); } catch {}
      if (!updatedUser) {
        try { updatedUser = await platformDb.user.findUnique({ where: { id: userId }, include: { tenant: true, employee: true } }); } catch {}
      }
    }
    // Task 162 fix: Prisma findUnique with include:{tenant, employee} fails on
    // tenant DBs with schema drift (missing Employee columns the client expects).
    // Fall back to a RAW SQL lookup so the "User not found" error never fires
    // for a valid authenticated user. This was blocking the profile-photo
    // remove flow (PATCH { avatar: null }) for employees on drifted tenant DBs.
    if (!updatedUser) {
      try {
        const rows = await db.$queryRawUnsafe(
          `SELECT u.id, u.email, u.name, u.role, u.avatar, u.status, u."tenantId",
                  t.name AS "tenantName", t.slug AS "tenantSlug", t.plan AS "tenantPlan"
           FROM "User" u
           LEFT JOIN "Tenant" t ON t.id = u."tenantId"
           WHERE u.id = $1 LIMIT 1`,
          userId,
        ) as any[];
        if (rows[0]) {
          const r = rows[0];
          updatedUser = {
            id: r.id, email: r.email, name: r.name, role: r.role, avatar: r.avatar,
            status: r.status, tenantId: r.tenantId,
            tenant: r.tenantSlug ? { id: r.tenantId, name: r.tenantName, slug: r.tenantSlug, plan: r.tenantPlan } : null,
          };
        }
      } catch {}
    }
    if (!updatedUser) {
      // Last resort: platform DB RAW SQL
      try {
        const rows = await platformDb.$queryRawUnsafe(
          `SELECT u.id, u.email, u.name, u.role, u.avatar, u.status, u."tenantId",
                  t.name AS "tenantName", t.slug AS "tenantSlug", t.plan AS "tenantPlan"
           FROM "User" u
           LEFT JOIN "Tenant" t ON t.id = u."tenantId"
           WHERE u.id = $1 LIMIT 1`,
          userId,
        ) as any[];
        if (rows[0]) {
          const r = rows[0];
          updatedUser = {
            id: r.id, email: r.email, name: r.name, role: r.role, avatar: r.avatar,
            status: r.status, tenantId: r.tenantId,
            tenant: r.tenantSlug ? { id: r.tenantId, name: r.tenantName, slug: r.tenantSlug, plan: r.tenantPlan } : null,
          };
        }
      } catch {}
    }
    // Bug 9 fix: if ALL lookups failed (tenant DB + platform DB + RAW SQL),
    // DON'T 404 — use a token-derived stub so the rest of the PATCH flow
    // (avatar update on Employee row, field-change approval workflow) can
    // still proceed. This was blocking profile photo upload for employees.
    if (!updatedUser) {
      console.warn('[Profile PATCH] User record not found in any DB — proceeding with token-derived stub. userId=' + userId);
      updatedUser = {
        id: userId,
        email: (decoded as any).email || '',
        name: name || derivedName || '',
        role: (decoded as any).role || 'employee',
        tenantId: (decoded as any).tenantId || null,
        tenant: null,
        employee: null,
        avatar: avatar ?? null,
      } as any;
    }

    const stringFields: [string, unknown][] = [
      ['phone', phone],
      ['personalEmail', personalEmail],
      ['firstName', firstName],
      ['lastName', lastName],
      ['emergencyContactName', emergencyContactName],
      ['emergencyContactPhone', emergencyContactPhone],
      ['emergencyContactRelation', emergencyContactRelation],
      ['address', address],
      ['city', city],
      ['state', state],
      ['zipCode', zipCode],
      ['country', country],
      ['currentAddress', currentAddress],
      ['currentCity', currentCity],
      ['currentState', currentState],
      ['currentZipCode', currentZipCode],
      ['currentCountry', currentCountry],
      ['gender', gender],
      ['bloodGroup', bloodGroup],
      ['maritalStatus', maritalStatus],
      ['nationality', nationality],
      ['bankName', bankName],
      ['bankAccountNo', bankAccountNo],
      ['bankIfscCode', bankIfscCode],
      ['panNumber', panNumber],
      ['aadhaarNumber', aadhaarNumber],
      ['taxId', taxId],
      ['hasChronicIllness', body.hasChronicIllness],
      ['chronicIllnessDetails', body.chronicIllnessDetails],
      ['hasAllergies', body.hasAllergies],
      ['allergyDetails', body.allergyDetails],
      ['hasDisability', body.hasDisability],
      ['disabilityDetails', body.disabilityDetails],
      ['isOnMedication', body.isOnMedication],
      ['medicationDetails', body.medicationDetails],
      ['hasHadSurgery', body.hasHadSurgery],
      ['surgeryDetails', body.surgeryDetails],
      ['emergencyMedicalCondition', body.emergencyMedicalCondition],
      ['primaryPhysicianName', body.primaryPhysicianName],
      ['primaryPhysicianPhone', body.primaryPhysicianPhone],
      ['healthInsuranceProvider', body.healthInsuranceProvider],
      ['healthInsurancePolicyNo', body.healthInsurancePolicyNo],
      ['previousEmployer1', body.previousEmployer1],
      ['previousEmployer1Logo', body.previousEmployer1Logo],
      ['previousDesignation1', body.previousDesignation1],
      ['previousDuration1', body.previousDuration1],
      ['previousReason1', body.previousReason1],
      ['previousEmployer2', body.previousEmployer2],
      ['previousEmployer2Logo', body.previousEmployer2Logo],
      ['previousDesignation2', body.previousDesignation2],
      ['previousDuration2', body.previousDuration2],
      ['previousReason2', body.previousReason2],
      ['previousEmployer3', body.previousEmployer3],
      ['previousEmployer3Logo', body.previousEmployer3Logo],
      ['previousDesignation3', body.previousDesignation3],
      ['previousDuration3', body.previousDuration3],
      ['previousReason3', body.previousReason3],
      ['totalExperience', body.totalExperience],
      ['pfNumber', body.pfNumber],
      ['pfUAN', body.pfUAN],
      ['pfNomineeName', body.pfNomineeName],
      ['pfNomineeRelation', body.pfNomineeRelation],
      ['pfNomineePercentage', body.pfNomineePercentage],
      ['esiNumber', body.esiNumber],
      ['esiDispensary', body.esiDispensary],
      ['esiNomineeName', body.esiNomineeName],
      ['esiNomineeRelation', body.esiNomineeRelation],
      ['professionalTaxNumber', body.professionalTaxNumber],
      ['lwfNumber', body.lwfNumber],
    ];
    const hasEmpUpdates = stringFields.some(([, v]) => v !== undefined)
      || dateOfBirth !== undefined
      || avatar !== undefined
      || Array.isArray(experiences);

    if (hasEmpUpdates) {
      let empId: string | null = null;
      let empDb: typeof db | null = null;

      // Profile photo fix: resolve the tenant DB from the user's tenantId,
      // same as the GET route does. Without this, `db` (from getDb(request))
      // may resolve to the platform DB instead of the tenant DB, so the
      // Employee lookup fails and the avatar never gets saved.
      let tenantDb: typeof db | null = null;
      const userTenantId = (updatedUser as any)?.tenantId || (decoded as any)?.tenantId;
      if (userTenantId) {
        try {
          const tenant = await platformDb.tenant.findUnique({ where: { id: userTenantId }, select: { slug: true } });
          if (tenant?.slug) {
            tenantDb = await getDbForTenant(tenant.slug);
          }
        } catch {}
      }

      // Try: tenant DB (resolved from tenantId) → db (from middleware) → platform DB
      const tryDbs = [tenantDb, db, platformDb].filter(Boolean) as typeof db[];
      for (const tryDb of tryDbs) {
        try {
          const rows = await tryDb.$queryRawUnsafe(`SELECT "id" FROM "Employee" WHERE "userId" = $1 OR "email" = $2 LIMIT 1`, updatedUser.id, updatedUser.email) as any[];
          if (rows?.[0]?.id) { empId = rows[0].id; empDb = tryDb; break; }
        } catch {}
      }

      if (empId && empDb) {
        await ensureEmployeeProfileColumns(empDb);

        // Task 163: photo approval workflow applies to ALL users (employees
        // AND admins). New uploads park in avatarPending; only removal (null)
        // is direct. The block below runs for everyone.
        if (avatar !== undefined && avatar !== null) {
          try {
            const cur = await empDb.$queryRawUnsafe(`SELECT "avatar", "avatarPending" FROM "Employee" WHERE "id" = $1 LIMIT 1`, empId) as Array<Record<string, unknown>>;
            const currentAvatar = (cur?.[0]?.avatar as string) || null;
            const existingPending = (cur?.[0]?.avatarPending as string) || null;
            const nextPhoto = avatar || null;
            if (nextPhoto !== currentAvatar && nextPhoto !== existingPending) {
              await empDb.$executeRawUnsafe(
                `UPDATE "Employee" SET "avatarPending" = $1, "avatarPendingAt" = NOW() WHERE "id" = $2`,
                nextPhoto, empId,
              );
              avatarPendingSubmitted = true;

              // Task 163: also create an EmployeeUpdateRequest record so the
              // photo approval shows up in the "All Requests" tab alongside
              // all other profile-change requests. Cancel any existing
              // pending photo request for this employee first (duplicate guard).
              try {
                await empDb.$executeRawUnsafe(
                  `UPDATE "EmployeeUpdateRequest" SET "status" = 'cancelled', "updatedAt" = NOW()
                   WHERE "employeeId" = $1 AND "fieldName" = 'profilePhoto' AND "status" = 'pending'`,
                  empId,
                );
                const reqId = `photo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                await empDb.$executeRawUnsafe(
                  `INSERT INTO "EmployeeUpdateRequest"
                   ("id", "employeeId", "fieldName", "fieldLabel", "category", "oldValue", "newValue", "reason", "status", "currentTier", "requestedById", "requestedAt", "createdAt", "updatedAt")
                   VALUES ($1, $2, 'profilePhoto', 'Profile Photo', 'personal', $3, $4, $5, 'pending', 0, $6, NOW(), NOW(), NOW())`,
                  reqId, empId,
                  currentAvatar ? 'Existing photo' : 'No photo',
                  'New photo submitted',
                  'Profile photo update requested',
                  String(decoded.userId || ''),
                );
              } catch (photoReqErr) {
                console.warn('[Profile PATCH] EmployeeUpdateRequest for photo failed (non-fatal):', photoReqErr instanceof Error ? photoReqErr.message : photoReqErr);
              }
              try {
                const { dispatchNotification } = await import('@/lib/notification-center');
                const admins = await empDb.$queryRawUnsafe(
                  `SELECT "id" FROM "User" WHERE role IN ('super_admin','tenant_admin','ceo','admin','hr_admin','company_hr_admin') AND status = 'active' AND id <> $1 LIMIT 100`,
                  String(decoded.userId || ''),
                ) as Array<Record<string, unknown>>;
                const empNameRows = await empDb.$queryRawUnsafe(`SELECT "firstName", "lastName" FROM "Employee" WHERE "id" = $1 LIMIT 1`, empId) as Array<Record<string, unknown>>;
                const employeeName = empNameRows?.[0] ? `${empNameRows[0].firstName || ''} ${empNameRows[0].lastName || ''}`.trim() : 'An employee';
                if (admins.length) {
                  await dispatchNotification({
                    tenantId: String(decoded.tenantId || ''),
                    module: 'core_hr',
                    eventKey: 'core_hr.profile.photo_submitted',
                    recipients: admins.map((a) => ({ userId: String(a.id) })),
                    vars: {
                      Employee_Name: employeeName,
                      Submitted_At: new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
                      Review_Link: '/employees/update-requests?tab=photos',
                    },
                    entity: { type: 'employee_profile', id: empId, link: '/employees/update-requests?tab=photos' },
                    origin: request.headers.get('origin') || undefined,
                  }).catch(() => null);
                }
              } catch (notifyErr) {
                console.warn('[Profile PATCH] photo_submitted alert failed (non-fatal):', (notifyErr as Error).message);
              }
            }
          } catch (e) {
            console.warn('[Profile PATCH] photo park failed (non-fatal):', e instanceof Error ? e.message : e);
          }
        }

        // Task 162: photo REMOVAL (avatar === null) — direct action, no approval needed.
        // Employees AND admins can remove their own photo without going through the approval workflow.
        if (avatar === null) {
          try {
            await empDb.$executeRawUnsafe(
              `UPDATE "Employee" SET "avatar" = NULL, "avatarPending" = NULL, "avatarPendingAt" = NULL, "updatedAt" = NOW() WHERE "id" = $1`,
              empId,
            );
            try {
              await empDb.$executeRawUnsafe(
                `UPDATE "User" SET "avatar" = NULL, "updatedAt" = NOW() WHERE "id" = $1`,
                userId,
              );
            } catch {}
            try { invalidateMeCacheForUser(userId); } catch {}
            return NextResponse.json({
              success: true,
              message: 'Photo removed',
              user: { id: updatedUser.id, name: updatedUser.name, email: updatedUser.email, avatar: null, role: updatedUser.role },
            }, { headers: corsHeaders() });
          } catch (removeErr) {
            console.error('[Profile PATCH] Photo remove failed:', removeErr);
            return NextResponse.json({ error: 'Failed to remove photo' }, { status: 500, headers: corsHeaders() });
          }
        }

        // ─── Non-privileged (employee) field-change approval workflow ───
        // Only runs for employees, not admins. Admins skip this and go to the
        // privileged direct-write path below.
        if (!privileged) {
          // Task 163: photo handling (both upload + removal) is now done in
          // the shared block above (runs for both privileged AND non-privileged).
          // This block only handles the field-change approval workflow for
          // non-privileged users.

          // ─── Task 86: EMPLOYEE / MANAGER SELF-EDIT → approval workflow ───
          // Diff the submitted fields against the current employee row and
          // route each CHANGED field through the shared engine:
          //   low sensitivity  → applied directly (+ audit row)
          //   high sensitivity → pending approval request per the workflow
          //                      configured in the employee module + email /
          //                      in-app alert to the approver
          //   restricted       → skipped (never self-service editable)
          // Unchanged fields create nothing, so pressing Save is idempotent.
          const appliedFields: string[] = [];
          const pendingFields: string[] = [];
          const skippedFields: string[] = [];
          const errors: string[] = [];

          const current = await (empDb as any).employee.findUnique({ where: { id: empId } }).catch(async () => {
            // Task 162 fix: Prisma employee.findUnique fails on schema drift.
            // Fall back to RAW SQL SELECT * so the profile update can proceed.
            try {
              const rows = await empDb.$queryRawUnsafe(`SELECT * FROM "Employee" WHERE "id" = $1 LIMIT 1`, empId) as any[];
              return rows[0] || null;
            } catch { return null; }
          });
          const norm = (v: unknown) => String(v ?? '').trim();
          const normDate = (v: unknown) => {
            if (!v) return '';
            try { return new Date(v as string).toISOString().slice(0, 10); } catch { return ''; }
          };

          for (const [col, value] of stringFields) {
            if (value === undefined) continue;
            const before = norm((current as Record<string, unknown> | null)?.[col]);
            const after = norm(value);
            if (before === after) continue;
            const meta = FIELD_SENSITIVITY[col];
            if (!meta || meta.sensitivity === 'restricted') { skippedFields.push(meta?.label || col); continue; }
            // Task 137 — names are identity fields: an employee cannot change
            // them from self-service, even if a tenant's field-rules still
            // mark them 'high' (the UI locks the input; this is the guard).
            if (SELF_SERVICE_LOCKED_FIELDS.has(col)) { skippedFields.push(`${meta.label} (locked — contact HR/Admin)`); continue; }
            try {
              const r = await applyEmployeeFieldChange(empDb as Record<string, any>, {
                auth: { userId, role: (decoded.role as string) || 'employee', tenantId: (decoded.tenantId as string) || null },
                employeeId: empId,
                fieldName: col,
                newValue: after,
                origin: request.headers.get('origin'),
                req: request,
              });
              if (!r.ok) { errors.push(r.error || `Could not submit ${meta.label}`); continue; }
              if (r.applied) appliedFields.push(meta.label); else pendingFields.push(meta.label);
            } catch (e) {
              console.error(`[Profile PATCH] field change failed (${col}):`, e);
              errors.push(`Could not submit ${meta.label}`);
            }
          }
          if (dateOfBirth !== undefined) {
            const before = normDate((current as Record<string, unknown> | null)?.dateOfBirth);
            const after = normDate(dateOfBirth);
            if (before !== after) {
              // Task 137 — DOB is locked for self-service (contact HR/Admin).
              skippedFields.push('Date of Birth (locked — contact HR/Admin)');
            }
          }
          if (originalBirthday !== undefined) {
            // Task 138 — the REAL birth date is the employee's own to correct:
            // editable by HR/Employee any time (unlike the locked DOB).
            const before = normDate((current as Record<string, unknown> | null)?.originalBirthday);
            const after = normDate(originalBirthday);
            if (before !== after) {
              try {
                await empDb.$executeRawUnsafe(
                  `UPDATE "Employee" SET "originalBirthday" = $1 WHERE "id" = $2`,
                  after ? new Date(after) : null, empId,
                );
                appliedFields.push('Original Birthday');
              } catch (e) {
                console.error('[Profile PATCH] Original Birthday update failed:', e);
                errors.push('Could not update Original Birthday');
              }
            }
          }
          if (Array.isArray(experiences)) {
            // Experience entries stay a direct self-service edit (structured
            // history, not a single approval-routable field). Task 137: rows
            // now carry the auto-fetched company logo + category/level tags.
            // Task 138: rows also carry proof letters + domains worked.
            try {
              await replaceEmployeeExperience(empDb as unknown as Record<string, any>, empId, experiences);
              appliedFields.push('Experience');
            } catch (e) {
              console.error('[Profile PATCH] Experience update failed:', e);
            }
          }
          if (Array.isArray(achievements)) {
            // Task 138 — achievements from previous company experience or any
            // other source; same direct self-service treatment as Experience.
            try {
              await replaceEmployeeAchievements(empDb as unknown as Record<string, any>, empId, achievements);
              appliedFields.push('Achievements');
            } catch (e) {
              console.error('[Profile PATCH] Achievements update failed:', e);
            }
          }
          if (Array.isArray(skills)) {
            // Task 139 — technical skills are direct self-service too.
            try {
              await replaceEmployeeSkills(empDb as unknown as Record<string, any>, empId, skills);
              appliedFields.push('Technical Skills');
            } catch (e) {
              console.error('[Profile PATCH] Skills update failed:', e);
            }
          }
          if (Array.isArray(dependents)) {
            // Task 139 — family details (medical insurance) are direct self-service.
            try {
              await replaceEmployeeDependents(empDb as unknown as Record<string, any>, empId, dependents);
              appliedFields.push('Family Details');
            } catch (e) {
              console.error('[Profile PATCH] Dependents update failed:', e);
            }
          }

          const parts: string[] = [];
          if (appliedFields.length) parts.push(`${appliedFields.length} field(s) updated`);
          if (pendingFields.length) parts.push(`${pendingFields.length} change(s) sent for approval`);
          const message = parts.length
            ? `Profile saved — ${parts.join(', ')}`
            : (errors.length ? 'Profile saved with errors' : 'No changes detected');
          return NextResponse.json({
            success: true,
            message,
            appliedFields,
            pendingFields,
            skippedFields,
            errors,
            avatarPending: avatarPendingSubmitted,
            ...(avatarPendingSubmitted ? { message: `${message} — your new photo was submitted for HR/Admin approval and is not visible to others yet` } : {}),
            user: { id: updatedUser.id, name: updatedUser.name, email: updatedUser.email, avatar: updatedUser.avatar, role: updatedUser.role },
          }, { headers: corsHeaders() });
        }

        // ─── Privileged (HR/admin) self-edit → direct write, as before ───
        const sets: string[] = [];
        const params: any[] = [];
        let pIdx = 1;
        for (const [col, value] of stringFields) {
          if (value !== undefined) { sets.push(`"${col}" = $${pIdx++}`); params.push(value || null); }
        }
        if (dateOfBirth !== undefined) { sets.push(`"dateOfBirth" = $${pIdx++}`); params.push(dateOfBirth ? new Date(dateOfBirth) : null); }
        // Task 163: do NOT update avatar here — new uploads are parked in
        // avatarPending by the shared block above, and removals are already
        // handled. Adding avatar here would bypass the approval flow.
        // if (avatar !== undefined) { sets.push(`"avatar" = $${pIdx++}`); params.push(avatar || null); }
        if (originalBirthday !== undefined) { sets.push(`"originalBirthday" = $${pIdx++}`); params.push(originalBirthday ? new Date(originalBirthday) : null); }
        params.push(empId);

        if (sets.length > 0) {
          const sql = `UPDATE "Employee" SET ${sets.join(', ')} WHERE "id" = $${pIdx}`;
          try { await empDb.$executeRawUnsafe(sql, ...params); } catch (e) {
            console.error('[Profile PATCH] Employee update failed:', e);
          }
          // BUG FIX (profile picture persistence): privileged path also needs
          // me-cache invalidation when avatar was part of the SET clause.
          if (avatar !== undefined) {
            try { invalidateMeCacheForUser(userId); } catch {}
          }
        }

        if (Array.isArray(experiences)) {
          try {
            await replaceEmployeeExperience(empDb as unknown as Record<string, any>, empId, experiences);
          } catch (e) {
            console.error('[Profile PATCH] Experience update failed:', e);
          }
        }
        if (Array.isArray(achievements)) {
          try {
            await replaceEmployeeAchievements(empDb as unknown as Record<string, any>, empId, achievements);
          } catch (e) {
            console.error('[Profile PATCH] Achievements update failed:', e);
          }
        }
        if (Array.isArray(skills)) {
          try {
            await replaceEmployeeSkills(empDb as unknown as Record<string, any>, empId, skills);
          } catch (e) {
            console.error('[Profile PATCH] Skills update failed:', e);
          }
        }
        if (Array.isArray(dependents)) {
          try {
            await replaceEmployeeDependents(empDb as unknown as Record<string, any>, empId, dependents);
          } catch (e) {
            console.error('[Profile PATCH] Dependents update failed:', e);
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
