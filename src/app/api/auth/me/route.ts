import { NextResponse } from 'next/server';
import { getDb, getPlatformDb, getDbForTenant, getDbForTenantById } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { isLiveMode, isDemoMode } from '@/lib/site-mode';
import { getHiddenSlugsForRequest } from '@/lib/tenant-filter';
import { getMeCached, setMeCached, ME_CACHE_MS } from '@/lib/me-response-cache';
import { profilePhotoPayloadError } from '@/lib/profile-photo';
import { canEditEmployeeRecords } from '@/lib/roleAccess';

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

export async function GET(request: Request) {
  const t0 = Date.now();
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json(
        { error: 'No token provided' },
        { status: 401, headers: corsHeaders() }
      );
    }

    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401, headers: corsHeaders() }
      );
    }

    const userId = decoded.userId as string;
    const tenantId = decoded.tenantId as string | undefined;
    const tenantSlug = request.headers.get('x-tenant-slug') || '';
    const jwtRole = (decoded.role as string) || '';
    const cacheKey = `${userId}:${request.headers.get('host') || ''}:${jwtRole}`;
    const cached = getMeCached(cacheKey);
    if (cached && Date.now() - cached.at < ME_CACHE_MS) {
      return NextResponse.json(cached.body, {
        headers: { ...corsHeaders(), 'Server-Timing': 'cache;desc="hit"' },
      });
    }

    // Super admin lives only on the platform DB. Nested tenant include + employee
    // lookup were extra Neon hops on every layout /api/auth/me.
    const platformDb = getPlatformDb();

    // ─── Interviewer toggle: ensure the User.isInterviewer column exists ───
    // schema-sync.js adds it at build time, but a tenant DB provisioned before
    // this feature (or a missed sync) would 500 every /api/auth/me below on
    // the explicit select. Self-heal with ADD COLUMN IF NOT EXISTS — the same
    // pattern the interviews route uses for candidateAttendance/panelAttendance.
    // Once present this is a single fast no-op round-trip per cold instance.
    await platformDb.$queryRawUnsafe(
      'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isInterviewer" BOOLEAN NOT NULL DEFAULT false'
    ).catch(() => null);

    const userSelectCore = {
      id: true,
      name: true,
      email: true,
      role: true,
      isInterviewer: true,
      avatar: true,
      status: true,
      lastLogin: true,
      createdAt: true,
      tenantId: true,
    };

    let user: any = null;
    let db: any = null;

    if (jwtRole === 'super_admin') {
      user = await platformDb.user.findUnique({
        where: { id: userId },
        select: userSelectCore,
      });
      db = platformDb;
    } else {
      const userSelect = {
        ...userSelectCore,
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            plan: true,
            currency: true,
            timezone: true,
            logo: true,
            status: true,
          },
        },
      };

      const platformUser = await platformDb.user.findUnique({
        where: { id: userId },
        select: userSelect,
      });

      if (platformUser) {
        user = platformUser;
        db = platformDb;
      } else {
        try {
          let tenantDb: any = null;
          if (tenantSlug) {
            tenantDb = await getDbForTenant(tenantSlug);
          } else if (tenantId) {
            tenantDb = await getDbForTenantById(tenantId);
          }

          if (tenantDb) {
            const tenantUser = await tenantDb.user.findUnique({
              where: { id: userId },
              select: userSelectCore,
            });

            if (tenantUser) {
              user = tenantUser;
              db = tenantDb;
              if (tenantUser.tenantId) {
                const tenant = await platformDb.tenant.findUnique({
                  where: { id: tenantUser.tenantId },
                  select: {
                    id: true,
                    name: true,
                    slug: true,
                    plan: true,
                    currency: true,
                    timezone: true,
                    logo: true,
                    status: true,
                  },
                });
                user.tenant = tenant;
              }
            }
          }
        } catch (tenantLookupErr) {
          console.error('[Auth/Me] Tenant DB lookup failed:', tenantLookupErr);
        }
      }
    }

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404, headers: corsHeaders() }
      );
    }

    if (user.role !== 'super_admin' && !user.tenant && user.tenantId) {
      try {
        user.tenant = await platformDb.tenant.findUnique({
          where: { id: user.tenantId },
          select: {
            id: true,
            name: true,
            slug: true,
            plan: true,
            currency: true,
            timezone: true,
            logo: true,
            status: true,
          },
        });
      } catch (e) {
        console.error('[Auth/Me] Failed to resolve tenant info:', e);
      }
    }

    // Step 2: Try to fetch employee data separately (graceful fallback)
    // Use the tenant-specific DB for employee/company lookups
    let dataDb = db;
    if (user.role !== 'super_admin' && user.tenantId && db === platformDb) {
      try {
        dataDb = await getDbForTenantById(user.tenantId);
      } catch (e) {
        console.error('[Auth/Me] Failed to get tenant DB for employee lookup:', e);
        dataDb = platformDb;
      }
    }

    let employeeData = null;
    let profileAvatar = user.avatar as string | null;
    if (user.role === 'super_admin') {
      // Super admin may still have a linked employee record (e.g. on the
      // platform DB or a tenant DB). Try to resolve it via cross-DB fallback
      // so /my-profile works for super_admin too. Previously this was
      // hard-set to null, which made /my-profile show "Profile unavailable".
      try {
        const platformEmp = await platformDb.employee.findUnique({
          where: { userId: user.id },
          select: { id: true, employeeId: true, firstName: true, lastName: true, avatar: true, companyId: true, status: true, salary: true, departmentId: true, designationId: true, branchId: true },
        });
        if (platformEmp) {
          if (platformEmp.avatar) profileAvatar = platformEmp.avatar;
          employeeData = {
            id: platformEmp.id,
            employeeId: platformEmp.employeeId,
            firstName: platformEmp.firstName,
            lastName: platformEmp.lastName,
            avatar: platformEmp.avatar || null,
            department: null,
            designation: null,
            branch: null,
            companyId: platformEmp.companyId,
            companyLogo: null,
            companyName: null,
            status: platformEmp.status,
            salary: platformEmp.salary,
            company: null,
            avatarPendingAt: null,
          };
        } else {
          // Try each tenant DB
          const tenants = await platformDb.tenant.findMany({ select: { id: true, slug: true } });
          for (const t of tenants) {
            if (!t.slug) continue;
            try {
              const tDb = await getDbForTenant(t.slug);
              const tEmp = await tDb.employee.findUnique({
                where: { userId: user.id },
                select: { id: true, employeeId: true, firstName: true, lastName: true, avatar: true, companyId: true, status: true, salary: true, departmentId: true, designationId: true, branchId: true },
              });
              if (tEmp) {
                if (tEmp.avatar) profileAvatar = tEmp.avatar;
                employeeData = {
                  id: tEmp.id,
                  employeeId: tEmp.employeeId,
                  firstName: tEmp.firstName,
                  lastName: tEmp.lastName,
                  avatar: tEmp.avatar || null,
                  department: null,
                  designation: null,
                  branch: null,
                  companyId: tEmp.companyId,
                  companyLogo: null,
                  companyName: null,
                  status: tEmp.status,
                  salary: tEmp.salary,
                  company: null,
                  avatarPendingAt: null,
                };
                break;
              }
            } catch { /* skip tenant DB */ }
          }
        }
      } catch (empErr) {
        console.error('[Auth/Me] Super admin employee fetch error (non-fatal):', empErr);
      }
    } else {
    /* Task 153 FIX — the old code special-cased tenant_admin/ceo here and
       returned ONLY the avatar (employeeData = null). The employee dashboard
       hero card depends on /api/auth/me to resolve `user.employee.id` before
       fetching /api/employees/[id], so management logins that HAVE a linked
       Employee row (e.g. MarqAI CEO → MARQ009, HR → MARQ001) rendered the
       hero card with every detail row showing "—". Management users now flow
       through the SAME graceful employee resolution as everyone else: null
       when no Employee row is linked, full detail when it is. */
    try {
      const employee = await dataDb.employee.findUnique({
        where: { userId: user.id },
        include: {
          department: { select: { name: true } },
          designation: { select: { title: true } },
          branch: { select: { name: true } },
          reportingManager: { select: { id: true, firstName: true, lastName: true, employeeId: true } },
        },
      });

      // ─── First-login profile backfill ───
      // Employees converted from candidates may have been created before the
      // employee-creation route started copying the candidate profile. When
      // this employee links to a PreboardingCandidate and the profile is still
      // mostly empty, populate the personal / address / bank fields from the
      // candidate's submitted portal details once, at login time.
      if (employee && !(employee as any).dateOfBirth) {
        try {
          await backfillEmployeeProfileFromCandidate(dataDb, employee.id);
        } catch (e) {
          console.warn('[Auth/Me] profile backfill skipped:', e instanceof Error ? e.message : e);
        }
      }

      // ─── Fetch leavePolicyIds (plural, runtime column not in Prisma schema) ───
      // The Employee table has both leavePolicyId (singular, Prisma) and
      // leavePolicyIds (plural, runtime ALTER TABLE column for multi-policy).
      // Both are needed for leave policy resolution on the apply page.
      let leavePolicyIdsRaw: string | null = null;
      if (employee) {
        try {
          const lpRows = await dataDb.$queryRawUnsafe(
            `SELECT "leavePolicyIds" FROM "Employee" WHERE "id" = $1 LIMIT 1`,
            employee.id,
          ) as any[];
          if (lpRows?.[0]?.leavePolicyIds) leavePolicyIdsRaw = lpRows[0].leavePolicyIds;
        } catch { /* column might not exist yet — non-fatal */ }
      }

      if (employee) {
        // Fetch company info with logo for the employee's company
        let companyData = null;
        try {
          if (employee.companyId) {
            const company = await dataDb.company.findUnique({
              where: { id: employee.companyId },
              select: { id: true, name: true, code: true, logo: true, city: true, state: true, country: true },
            });
            if (company) {
              companyData = {
                id: company.id,
                name: company.name,
                code: company.code,
                logo: company.logo,
                city: company.city,
                state: company.state,
                country: company.country,
              };
            }
          }
        } catch (compErr) {
          console.error('[Auth/Me] Company fetch error (non-fatal):', compErr);
        }

        if (employee.avatar) profileAvatar = employee.avatar;
        employeeData = {
          id: employee.id,
          employeeId: employee.employeeId,
          firstName: employee.firstName,
          lastName: employee.lastName,
          avatar: employee.avatar || null,
          department: employee.department?.name || null,
          designation: employee.designation?.title || null,
          branch: employee.branch?.name || null,
          companyId: employee.companyId,
          companyLogo: companyData?.logo || null,
          companyName: companyData?.name || null,
          status: employee.status,
          salary: employee.salary,
          company: companyData,
          // Task 139 — pending-photo state so mobile/web can badge it
          avatarPendingAt: (employee as Record<string, unknown>).avatarPendingAt || null,
          // ─── Policy/data fields (for leave policy + scope resolution) ───
          // These are the fields the leave apply page, leave balance API, and
          // approval workflow need to resolve which policies/rules apply to
          // this employee. Without them, the system can only use the User
          // table (which has role/email but NO policy assignments).
          leavePolicyId: (employee as Record<string, unknown>).leavePolicyId || null,
          leavePolicyIds: leavePolicyIdsRaw, // runtime column (JSON string of multiple policy IDs)
          branchId: (employee as Record<string, unknown>).branchId || null,
          departmentId: (employee as Record<string, unknown>).departmentId || null,
          employeeStatus: (employee as Record<string, unknown>).employeeStatus || null,
          gender: (employee as Record<string, unknown>).gender || null,
          employmentType: (employee as Record<string, unknown>).employmentType || null,
          dateOfJoining: (employee as Record<string, unknown>).dateOfJoining || null,
          reportingManagerId: (employee as Record<string, unknown>).reportingManagerId || null,
          reportingManager: employee.reportingManager
            ? { id: employee.reportingManager.id, firstName: employee.reportingManager.firstName, lastName: employee.reportingManager.lastName, employeeId: employee.reportingManager.employeeId }
            : null,
        };
      }
    } catch (empErr) {
      console.error('[Auth/Me] Employee fetch error (non-fatal):', empErr);
      // Continue without employee data — user can still be authenticated
    }

    // ─── Cross-DB fallback for non-super_admin ───
    // If employeeData is still null (employee not found in dataDb), try
    // the platform DB and all tenant DBs. This handles the case where a
    // tenant_admin/HR user was found on the platform DB but their employee
    // record lives in a tenant DB (Vercel serverless cold-start inconsistency).
    if (!employeeData && user.role !== 'super_admin') {
      try {
        // Try platform DB first
        const platformEmp = await platformDb.employee.findUnique({
          where: { userId: user.id },
          select: { id: true, employeeId: true, firstName: true, lastName: true, avatar: true, companyId: true, status: true, salary: true },
        });
        if (platformEmp) {
          if (platformEmp.avatar) profileAvatar = platformEmp.avatar;
          employeeData = {
            id: platformEmp.id,
            employeeId: platformEmp.employeeId,
            firstName: platformEmp.firstName,
            lastName: platformEmp.lastName,
            avatar: platformEmp.avatar || null,
            department: null,
            designation: null,
            branch: null,
            companyId: platformEmp.companyId,
            companyLogo: null,
            companyName: null,
            status: platformEmp.status,
            salary: platformEmp.salary,
            company: null,
            avatarPendingAt: null,
          };
        } else {
          // Try each tenant DB
          const tenants = await platformDb.tenant.findMany({ select: { id: true, slug: true } });
          for (const t of tenants) {
            if (!t.slug) continue;
            try {
              const tDb = await getDbForTenant(t.slug);
              if (tDb === dataDb) continue; // skip already-tried DB
              const tEmp = await tDb.employee.findUnique({
                where: { userId: user.id },
                select: { id: true, employeeId: true, firstName: true, lastName: true, avatar: true, companyId: true, status: true, salary: true, departmentId: true, designationId: true, branchId: true },
              });
              if (tEmp) {
                if (tEmp.avatar) profileAvatar = tEmp.avatar;
                employeeData = {
                  id: tEmp.id,
                  employeeId: tEmp.employeeId,
                  firstName: tEmp.firstName,
                  lastName: tEmp.lastName,
                  avatar: tEmp.avatar || null,
                  department: null,
                  designation: null,
                  branch: null,
                  companyId: tEmp.companyId,
                  companyLogo: null,
                  companyName: null,
                  status: tEmp.status,
                  salary: tEmp.salary,
                  company: null,
                  avatarPendingAt: null,
                };
                break;
              }
            } catch { /* skip tenant DB */ }
          }
        }
      } catch (crossDbErr) {
        console.error('[Auth/Me] Cross-DB employee fallback error (non-fatal):', crossDbErr);
      }
    }
    }

    // ─── GOLDEN RULE: Scrub hidden tenant from API response ───
    // On the LIVE site, if the user's tenant slug is hidden (e.g., '3boxeshrms'),
    // we null out tenantId and tenant so the client never receives
    // "Marq AI Tech Pvt Ltd". The client-side authStore also scrubs as a
    // second line of defense, but we enforce it server-side too.
    const hiddenSlugs = getHiddenSlugsForRequest(request);
    const isTenantHidden = user.tenant?.slug && hiddenSlugs.includes(user.tenant.slug);
    const safeTenantId = isTenantHidden ? null : user.tenantId;
    const safeTenant = isTenantHidden ? null : (user.tenant ? {
      id: user.tenant.id,
      name: user.tenant.name,
      slug: user.tenant.slug,
      plan: user.tenant.plan,
      currency: user.tenant.currency,
      timezone: user.tenant.timezone,
      logo: user.tenant.logo,
      status: user.tenant.status,
    } : null);

    const body = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isInterviewer: user.isInterviewer === true,
        avatar: profileAvatar,
        status: user.status,
        tenantId: safeTenantId,
        tenant: safeTenant,
        employee: employeeData,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt,
    };
    setMeCached(cacheKey, body);
    return NextResponse.json(
      body,
      { headers: { ...corsHeaders(), 'Server-Timing': `total;dur=${Date.now() - t0}` } }
    );
  } catch (error) {
    console.error('Get current user error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500, headers: corsHeaders() }
    );
  }
}

// ─── PATCH /api/auth/me — SELF-SERVICE profile update (Task 112) ───
// The mobile My Profile screen's "Image Change" button (design #19) needs a
// way for ANY signed-in user to update their OWN avatar without the
// admin-only PUT /api/employees/[id] gate (canEditEmployeeRecords).
// Accepted body: { avatar?: string(data-URI|http url), phone?: string }.
// - avatar is validated with the same profilePhotoPayloadError() used
//   everywhere (5MB cap) and written to BOTH the User row and the linked
//   Employee row (the web admin list reads Employee.avatar, the header
//   reads User.avatar — keeping them in sync prevents the Task 107
//   "admin photo missing" class of bugs).
// - phone is written to the linked Employee row (User has no phone field).
// Cross-tenant safety: the linked employee is resolved by userId in the
// SAME db that holds the user — no employeeId param is ever accepted.
export async function PATCH(request: Request) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    }
    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    }
    const userId = decoded.userId as string;
    const jwtRole = (decoded.role as string) || '';
    const tenantSlug = request.headers.get('x-tenant-slug') || '';
    const tenantId = decoded.tenantId as string | undefined;

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: corsHeaders() });
    }

    const updates: Record<string, unknown> = {};
    if (body.avatar !== undefined) {
      const avatarError = profilePhotoPayloadError(body.avatar);
      if (avatarError) return NextResponse.json({ error: avatarError }, { status: 400, headers: corsHeaders() });
      updates.avatar = body.avatar === '' ? null : body.avatar;
    }
    if (body.phone !== undefined) {
      const phone = String(body.phone).trim().slice(0, 30);
      if (phone && !/^[+()\-\s\d]{6,30}$/.test(phone)) {
        return NextResponse.json({ error: 'Invalid phone number' }, { status: 400, headers: corsHeaders() });
      }
      updates.phone = phone || null;
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Nothing to update (send avatar and/or phone)' }, { status: 400, headers: corsHeaders() });
    }

    // Resolve the db that actually holds this user (same ladder as GET).
    const platformDb = getPlatformDb();
    let db: any = null;
    if (jwtRole === 'super_admin') {
      db = platformDb;
    } else {
      try {
        db = tenantSlug ? await getDbForTenant(tenantSlug) : tenantId ? await getDbForTenantById(tenantId) : null;
      } catch { db = null; }
      if (!db) db = platformDb;
      const tenantUser = await db.user.findUnique({ where: { id: userId }, select: { id: true } }).catch(() => null);
      if (!tenantUser && db !== platformDb) {
        // Token tenant points elsewhere — fall back to the platform db.
        const platformUser = await platformDb.user.findUnique({ where: { id: userId }, select: { id: true } }).catch(() => null);
        if (platformUser) db = platformDb;
      }
    }
    const userRow = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!userRow) {
      return NextResponse.json({ error: 'User not found' }, { status: 404, headers: corsHeaders() });
    }

    // Task 139 — profile-photo approval: employee-submitted photos park in
    // Employee.avatarPending until HR/Admin confirm them. HR/Admin roles keep
    // the direct path. Phone stays direct (low-risk, Task 137 alerting covers it).
    const privileged = canEditEmployeeRecords(jwtRole);
    const photoPending = updates.avatar !== undefined && !privileged;

    const userUpdate: Record<string, unknown> = {};
    if (updates.avatar !== undefined && !photoPending) userUpdate.avatar = updates.avatar;
    if (Object.keys(userUpdate).length > 0) {
      await db.user.update({ where: { id: userId }, data: userUpdate });
    }

    let employeeUpdated = false;
    let avatarPendingSubmitted = false;
    if (updates.phone !== undefined || updates.avatar !== undefined) {
      try {
        const emp = await db.employee.findFirst({ where: { userId }, select: { id: true } });
        if (emp) {
          const empUpdate: Record<string, unknown> = {};
          if (updates.avatar !== undefined && !photoPending) empUpdate.avatar = updates.avatar;
          if (updates.phone !== undefined) empUpdate.phone = updates.phone;
          if (Object.keys(empUpdate).length > 0) {
            await db.employee.update({ where: { id: emp.id }, data: empUpdate });
            employeeUpdated = true;
          }
          if (photoPending) {
            const cur = await (db as any).$queryRawUnsafe(
              `SELECT "avatar", "avatarPending" FROM "Employee" WHERE "id" = $1 LIMIT 1`, emp.id,
            ) as Array<Record<string, unknown>>;
            const currentAvatar = (cur?.[0]?.avatar as string) || null;
            const existingPending = (cur?.[0]?.avatarPending as string) || null;
            const nextPhoto = (updates.avatar as string) || null;
            if (nextPhoto !== currentAvatar && nextPhoto !== existingPending) {
              await (db as any).$executeRawUnsafe(
                `UPDATE "Employee" SET "avatarPending" = $1, "avatarPendingAt" = NOW() WHERE "id" = $2`,
                nextPhoto, emp.id,
              );
              avatarPendingSubmitted = true;
              try {
                const { dispatchNotification } = await import('@/lib/notification-center');
                const admins = await (db as any).$queryRawUnsafe(
                  `SELECT "id" FROM "User" WHERE role IN ('super_admin','tenant_admin','ceo','admin','hr_admin','company_hr_admin') AND status = 'active' AND id <> $1 LIMIT 100`,
                  userId,
                ) as Array<Record<string, unknown>>;
                const empNameRows = await (db as any).$queryRawUnsafe(`SELECT "firstName", "lastName" FROM "Employee" WHERE "id" = $1 LIMIT 1`, emp.id) as Array<Record<string, unknown>>;
                const employeeName = empNameRows?.[0] ? `${empNameRows[0].firstName || ''} ${empNameRows[0].lastName || ''}`.trim() : 'An employee';
                if (admins?.length && tenantId) {
                  await dispatchNotification({
                    tenantId,
                    module: 'core_hr',
                    eventKey: 'core_hr.profile.photo_submitted',
                    recipients: admins.map((a) => ({ userId: String(a.id) })),
                    vars: {
                      Employee_Name: employeeName,
                      Submitted_At: new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
                      Review_Link: '/employees/update-requests?tab=photos',
                    },
                    entity: { type: 'employee_profile', id: emp.id, link: '/employees/update-requests?tab=photos' },
                    origin: request.headers.get('origin') || undefined,
                  }).catch(() => null);
                }
              } catch (notifyErr) {
                console.warn('[Auth/Me PATCH] photo_submitted alert failed (non-fatal):', (notifyErr as Error).message);
              }
            }
          }
        }
      } catch (e) {
        console.error('[Auth/Me PATCH] Linked employee update failed (non-fatal):', e);
      }
    }

    const fresh = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true, avatar: true, status: true },
    });
    return NextResponse.json(
      { message: avatarPendingSubmitted ? 'Photo submitted — pending HR/Admin approval' : 'Profile updated', user: fresh, employeeUpdated, avatarPending: avatarPendingSubmitted },
      { headers: corsHeaders() }
    );
  } catch (error) {
    console.error('Patch current user error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500, headers: corsHeaders() }
    );
  }
}

/**
 * One-time profile backfill for employees converted from preboarding
 * candidates before the profile-copy logic existed. Populates only EMPTY
 * columns, so it never overwrites data the employee/HR already entered.
 */
async function backfillEmployeeProfileFromCandidate(db: any, employeeRowId: string) {
  const empRows = await db.$queryRawUnsafe(
    `SELECT * FROM "Employee" WHERE "id"=$1 LIMIT 1`,
    employeeRowId,
  ).catch(() => []) as any[];
  const emp = empRows[0];
  if (!emp) return;

  // Find the linked preboarding record (direct link, else by personal email).
  let pb: any = null;
  const linkRows = emp.preboardingCandidateId
    ? await db.$queryRawUnsafe(`SELECT * FROM "PreboardingCandidate" WHERE "id"=$1 LIMIT 1`, emp.preboardingCandidateId).catch(() => []) as any[]
    : [];
  pb = linkRows[0] || null;
  if (!pb && emp.personalEmail) {
    const pbRows = await db.$queryRawUnsafe(
      `SELECT * FROM "PreboardingCandidate" WHERE LOWER("candidateEmail")=$1 AND "employeeId" IS NOT NULL ORDER BY "createdAt" DESC LIMIT 1`,
      String(emp.personalEmail).toLowerCase(),
    ).catch(() => []) as any[];
    pb = pbRows[0] || null;
  }
  if (!pb) return;

  const details = typeof pb.portalDetails === 'string'
    ? (() => { try { return JSON.parse(pb.portalDetails || '{}'); } catch { return {}; } })()
    : (pb.portalDetails || {});
  const personal = details.personal || {};
  const address = details.address || {};
  const family = details.family || {};
  const bank = details.bank || {};
  const v = (x: unknown) => (x === null || x === undefined || String(x).trim() === '' ? null : String(x).trim());

  const sets: string[] = [];
  const params: unknown[] = [];
  const add = (col: string, value: unknown) => { params.push(value); sets.push(`"${col}"=$${params.length}`); };

  if (!emp.dateOfBirth && v(personal.dateOfBirth)) add('dateOfBirth', new Date(personal.dateOfBirth as string));
  if (!emp.gender && v(personal.gender)) add('gender', v(personal.gender));
  if (!emp.maritalStatus && v(personal.maritalStatus)) add('maritalStatus', v(personal.maritalStatus));
  if (!emp.nationality && v(personal.nationality)) add('nationality', v(personal.nationality));
  if (!emp.address && (v(address.permanentAddressLine1) || v(address.currentAddressLine1))) {
    add('address', [v(address.permanentAddressLine1), v(address.permanentAddressLine2)].filter(Boolean).join(', ') || v(address.currentAddressLine1));
  }
  if (!emp.city && v(address.permanentCity)) add('city', v(address.permanentCity));
  if (!emp.state && v(address.permanentState)) add('state', v(address.permanentState));
  if (!emp.zipCode && v(address.permanentPincode)) add('zipCode', v(address.permanentPincode));
  if (!emp.country && v(address.permanentCountry)) add('country', v(address.permanentCountry));
  if (!emp.emergencyContactName && v(family.emergencyContactName)) add('emergencyContactName', v(family.emergencyContactName));
  if (!emp.emergencyContactPhone && v(family.emergencyContactMobile)) add('emergencyContactPhone', v(family.emergencyContactMobile));
  if (!emp.bankName && v(bank.bankName)) add('bankName', v(bank.bankName));
  if (!emp.bankAccountNo && v(bank.accountNumber)) add('bankAccountNo', v(bank.accountNumber));
  if (!emp.bankIfscCode && v(bank.ifscCode)) add('bankIfscCode', v(bank.ifscCode));
  if (!emp.panNumber && v(bank.panNumber)) add('panNumber', v(bank.panNumber));
  if (!emp.companyId && pb.departmentId) {
    try {
      const d = await db.$queryRawUnsafe(`SELECT "companyId" FROM "Department" WHERE "id"=$1 LIMIT 1`, pb.departmentId) as any[];
      if (d[0]?.companyId) add('companyId', d[0].companyId);
    } catch { /* ignore */ }
  }
  if (!emp.preboardingCandidateId) add('preboardingCandidateId', pb.id);
  if (sets.length === 0) return;

  params.push(employeeRowId);
  await db.$executeRawUnsafe(
    `UPDATE "Employee" SET ${sets.join(', ')}, "updatedAt"=NOW() WHERE "id"=$${params.length}`,
    ...params,
  );
  console.log(`[Auth/Me] backfilled ${sets.length} profile fields from candidate for employee ${employeeRowId}`);
}
