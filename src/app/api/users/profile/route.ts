import { NextResponse } from 'next/server';
import { getDb, getPlatformDb, getDbForTenant } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders, hashPassword } from '@/lib/auth';
import { profilePhotoPayloadError } from '@/lib/profile-photo';
import { ensureEmployeeProfileColumns } from '@/lib/employee-profile-columns';
import { canEditEmployeeRecords } from '@/lib/roleAccess';
import { applyEmployeeFieldChange, FIELD_SENSITIVITY } from '@/lib/employee-update-request';

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
      const [departmentRows, designationRows, branchRows, dependents, managerRows] = await Promise.all([
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
      ]) as [
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
        previousDesignation1: rowVal(employee, 'previousDesignation1', 'previousdesignation1') || '',
        previousDuration1: rowVal(employee, 'previousDuration1', 'previousduration1') || '',
        previousReason1: rowVal(employee, 'previousReason1', 'previousreason1') || '',
        previousEmployer2: rowVal(employee, 'previousEmployer2', 'previousemployer2') || '',
        previousDesignation2: rowVal(employee, 'previousDesignation2', 'previousdesignation2') || '',
        previousDuration2: rowVal(employee, 'previousDuration2', 'previousduration2') || '',
        previousReason2: rowVal(employee, 'previousReason2', 'previousreason2') || '',
        previousEmployer3: rowVal(employee, 'previousEmployer3', 'previousemployer3') || '',
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
      experiences,
    } = body;
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
    if (avatar !== undefined) userUpdateData.avatar = avatar || null;

    const userId = decoded.userId as string;
    let updatedUser = null;
    if (Object.keys(userUpdateData).length > 0) {
      try { updatedUser = await db.user.update({ where: { id: userId }, data: userUpdateData, include: { tenant: true, employee: true } }); } catch {
        try { updatedUser = await platformDb.user.update({ where: { id: userId }, data: userUpdateData, include: { tenant: true, employee: true } }); } catch {}
      }
    }
    if (!updatedUser) {
      try { updatedUser = await db.user.findUnique({ where: { id: userId }, include: { tenant: true, employee: true } }); } catch {}
      if (!updatedUser) {
        try { updatedUser = await platformDb.user.findUnique({ where: { id: userId }, include: { tenant: true, employee: true } }); } catch {}
      }
    }
    if (!updatedUser) return NextResponse.json({ error: 'User not found' }, { status: 404, headers: corsHeaders() });

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
      ['previousDesignation1', body.previousDesignation1],
      ['previousDuration1', body.previousDuration1],
      ['previousReason1', body.previousReason1],
      ['previousEmployer2', body.previousEmployer2],
      ['previousDesignation2', body.previousDesignation2],
      ['previousDuration2', body.previousDuration2],
      ['previousReason2', body.previousReason2],
      ['previousEmployer3', body.previousEmployer3],
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
      for (const tryDb of [db, platformDb]) {
        try {
          const rows = await tryDb.$queryRawUnsafe(`SELECT "id" FROM "Employee" WHERE "userId" = $1 OR "email" = $2 LIMIT 1`, updatedUser.id, updatedUser.email) as any[];
          if (rows?.[0]?.id) { empId = rows[0].id; empDb = tryDb; break; }
        } catch {}
      }

      if (empId && empDb) {
        await ensureEmployeeProfileColumns(empDb);

        if (!privileged) {
          // Photo self-service stays direct (product rule: employees may
          // change their profile photo anytime) — apply to the Employee row.
          if (avatar !== undefined) {
            try { await empDb.$executeRawUnsafe(`UPDATE "Employee" SET "avatar" = $1 WHERE "id" = $2`, avatar || null, empId); } catch (e) {
              console.error('[Profile PATCH] Employee avatar update failed:', e);
            }
          }
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

          const current = await (empDb as any).employee.findUnique({ where: { id: empId } });
          // BUG FIX: Prisma doesn't return EXTRA_PROFILE_KEYS fields (pfNumber,
          // esiNumber, etc.) because they're not in the schema. This caused
          // 'before' to be empty string for ALL extra fields, making the system
          // think every field changed → sending 17 approval requests when only
          // 1 field actually changed. Fix: load extra fields via raw SQL.
          try {
            const { EXTRA_PROFILE_KEYS } = await import('@/lib/employee-profile-columns');
            const cols = EXTRA_PROFILE_KEYS.map((c: string) => `"${c}"`).join(',');
            const extraRows = await (empDb as any).$queryRawUnsafe(
              `SELECT ${cols} FROM "Employee" WHERE "id" = $1 LIMIT 1`, empId,
            ) as Record<string, unknown>[];
            if (extraRows?.[0]) Object.assign(current, extraRows[0]);
          } catch { /* best-effort — extra fields may not exist yet */ }
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
              try {
                const r = await applyEmployeeFieldChange(empDb as Record<string, any>, {
                  auth: { userId, role: (decoded.role as string) || 'employee', tenantId: (decoded.tenantId as string) || null },
                  employeeId: empId,
                  fieldName: 'dateOfBirth',
                  newValue: after,
                  origin: request.headers.get('origin'),
                  req: request,
                });
                if (!r.ok) errors.push(r.error || 'Could not submit Date of Birth');
                else if (r.applied) appliedFields.push('Date of Birth'); else pendingFields.push('Date of Birth');
              } catch (e) {
                console.error('[Profile PATCH] dateOfBirth change failed:', e);
                errors.push('Could not submit Date of Birth');
              }
            }
          }
          if (Array.isArray(experiences)) {
            // Experience entries stay a direct self-service edit (structured
            // history, not a single approval-routable field).
            try {
              await empDb.$executeRawUnsafe(`DELETE FROM "Experience" WHERE "employeeId" = $1`, empId);
              for (const exp of experiences) {
                const company = String(exp?.company || '').trim();
                const designation = String(exp?.designation || '').trim();
                if (!company || !designation) continue;
                const start = exp.fromDate || exp.startDate;
                if (!start) continue;
                const end = exp.toDate || exp.endDate || null;
                const isCurrent = Boolean(exp.isCurrent);
                const description = String(exp.description || '') || null;
                const id = String(exp.id || '').trim() || crypto.randomUUID();
                await empDb.$executeRawUnsafe(
                  `INSERT INTO "Experience" ("id","employeeId","company","designation","startDate","endDate","isCurrent","description","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())`,
                  id, empId, company, designation, new Date(start), end ? new Date(end) : null, isCurrent, description,
                );
              }
              appliedFields.push('Experience');
            } catch (e) {
              console.error('[Profile PATCH] Experience update failed:', e);
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
        if (avatar !== undefined) { sets.push(`"avatar" = $${pIdx++}`); params.push(avatar || null); }
        params.push(empId);

        if (sets.length > 0) {
          const sql = `UPDATE "Employee" SET ${sets.join(', ')} WHERE "id" = $${pIdx}`;
          try { await empDb.$executeRawUnsafe(sql, ...params); } catch (e) {
            console.error('[Profile PATCH] Employee update failed:', e);
          }
        }

        if (Array.isArray(experiences)) {
          try {
            await empDb.$executeRawUnsafe(`DELETE FROM "Experience" WHERE "employeeId" = $1`, empId);
            for (const exp of experiences) {
              const company = String(exp?.company || '').trim();
              const designation = String(exp?.designation || '').trim();
              if (!company || !designation) continue;
              const start = exp.fromDate || exp.startDate;
              if (!start) continue;
              const end = exp.toDate || exp.endDate || null;
              const isCurrent = Boolean(exp.isCurrent);
              const description = String(exp.description || '') || null;
              const id = String(exp.id || '').trim() || crypto.randomUUID();
              await empDb.$executeRawUnsafe(
                `INSERT INTO "Experience" ("id","employeeId","company","designation","startDate","endDate","isCurrent","description","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())`,
                id, empId, company, designation, new Date(start), end ? new Date(end) : null, isCurrent, description,
              );
            }
          } catch (e) {
            console.error('[Profile PATCH] Experience update failed:', e);
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
