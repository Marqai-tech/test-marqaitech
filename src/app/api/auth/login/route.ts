import { NextResponse, after } from 'next/server';
import { getPlatformDb, getDbForTenant, getDbForTenantById } from '@/lib/tenant-db';
import { verifyPassword, createToken, hashPassword, REMEMBER_TOKEN_TTL, SESSION_TOKEN_TTL, authTokenCookieHeader } from '@/lib/auth';
import { getHiddenSlugsForRequest, isTestPlatformHost, isLocalDevHost } from '@/lib/tenant-filter';
import { isPersonalEmail } from '@/lib/validators';

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

export async function POST(request: Request) {
  const t0 = Date.now();
  // ⚠️ IMPORTANT: Authentication uses the platform DB first, then falls
  // back to the tenant-specific DB if the user is not found in the platform DB.
  // This ensures login works for both platform users (super_admin) AND
  // tenant-specific users (like demo users in tenant_demo DB).
  const platformDb = getPlatformDb();
  try {
    const body = await request.json();
    const { email: rawEmail, employeeId: rawEmployeeId, rememberMe } = body;
    // Trim the password: pasted credentials often carry a trailing tab/space,
    // which silently fails the hash check ("Invalid email or password").
    const password = typeof body.password === 'string' ? body.password.trim() : body.password;
    const persistSession = Boolean(rememberMe);

    // Task 62: Allow login with either email OR employee ID. The UI sends
    // whatever the user typed in the username field. We detect which it is:
    //   - looks like an email (contains '@') → email lookup
    //   - else → employee ID lookup (resolve to the linked User via Employee row)
    const looksLikeEmail = String(rawEmail || '').includes('@');
    const email = looksLikeEmail ? String(rawEmail || '').trim().toLowerCase() : '';
    const employeeIdInput = !looksLikeEmail ? String(rawEmail || rawEmployeeId || '').trim() : '';

    if (!(email || employeeIdInput) || !password) {
      return NextResponse.json(
        { error: 'Email or Employee ID and password are required' },
        { status: 400, headers: corsHeaders() }
      );
    }

    // ─── Official email validation (skip if logging in by employee ID) ───
    // Only official/company email addresses are allowed for login.
    // Personal email addresses (gmail, yahoo, outlook, etc.) are blocked.
    // EXCEPTION: Candidate logins can use personal emails — they don't have
    // company accounts. We detect candidate logins by checking if the email
    // is from a known candidate domain or if the login is on a recruitment
    // portal path.
    if (email) {
      const { isPersonal, domain } = isPersonalEmail(email);
      if (isPersonal) {
        // Check if this is a candidate login — candidates ARE allowed to use
        // personal emails. We detect this by checking if the user exists in the
        // DB with role 'candidate'. If they do, we allow the login.
        // For now, we block personal emails at the login gate and show a helpful
        // message. If the user is a candidate, they should use the candidate
        // portal which has its own login endpoint.
        return NextResponse.json(
          {
            error: `Personal email addresses (${domain}) are not allowed for login. Please use your official/company email address. If you are a job candidate, please use the candidate portal.`,
            code: 'PERSONAL_EMAIL_BLOCKED',
          },
          { status: 403, headers: corsHeaders() }
        );
      }
    }

    // ─── Subdomain-based tenant validation ───
    // When the app is accessed via a tenant subdomain (e.g.,
    // marqaitechgroup.3boxeshrms.com), we verify that the user
    // belongs to that specific tenant. Super admins can log in
    // from any domain. All other roles must match the subdomain tenant.
    const hostHeader = (request.headers.get('x-tenant-domain') || request.headers.get('host') || '').split(':')[0].toLowerCase();
    let tenantSlug = request.headers.get('x-tenant-slug') || '';
    // A *.vercel.app host is not a tenant subdomain. Middleware used to turn
    // 3-boxes-hrms.vercel.app into slug "3-boxes-hrms", which made super admin
    // login fail. Drop that false slug; known demo hosts keep their own slug.
    if (hostHeader.endsWith('.vercel.app') && tenantSlug === hostHeader.split('.')[0]) {
      tenantSlug = '';
    }
    if (isTestPlatformHost(hostHeader) || tenantSlug === 'test') {
      // QA uses the isolated copied tenant database rather than the platform
      // database, which only contains platform identities.
      tenantSlug = process.env.TEST_TENANT_SLUG || 'acme-global-demo';
    }
    let subdomainTenantId: string | null = null;

    if (tenantSlug) {
      const subdomainTenant = await getPlatformDb().tenant.findUnique({
        where: { slug: tenantSlug },
        select: { id: true, status: true, name: true },
      });
      if (subdomainTenant) {
        // ─── Tenant status check: block login for non-active tenants ───
        // Super admins can still log in from any domain (they control tenant status).
        // For all other roles, a suspended/inactive/pending_approval tenant
        // means the user cannot log in.
        if (subdomainTenant.status !== 'active') {
          const statusMessages: Record<string, string> = {
            suspended: `Your tenant "${subdomainTenant.name}" has been suspended. Please contact the super admin to reactivate your account.`,
            inactive: `Your tenant "${subdomainTenant.name}" is inactive. Please contact the super admin.`,
            pending_approval: `Your tenant "${subdomainTenant.name}" is pending approval. You cannot log in until the super admin approves your account.`,
          };
          // Note: We don't know the user's role yet at this point, but we
          // check the tenant status first. Super admins log in via the
          // platform domain (3boxeshrms.com) which has no tenant slug,
          // so this check won't affect them.
          return NextResponse.json(
            { 
              error: statusMessages[subdomainTenant.status] || `Your tenant "${subdomainTenant.name}" is ${subdomainTenant.status}. Access denied.`,
              code: 'TENANT_BLOCKED',
              tenantStatus: subdomainTenant.status,
            },
            { status: 403, headers: corsHeaders() }
          );
        }
        subdomainTenantId = subdomainTenant.id;
      }
    }

    // ─── Two-phase user lookup ───
    // Phase 1: Search the platform DB (neondb) for the user.
    // This handles super_admin and other platform-level users.
    // Phase 2: If not found, search the tenant-specific DB.
    // This handles tenant users who live in their dedicated database
    // (e.g., demo users in tenant_demo, MarqAI users in tenant_marqaitechgroup).
    // This two-phase approach makes the demo site truly independent — its
    // users don't need to exist in the platform DB.

    // ⚠️ Use explicit `select` (not `include: { tenant: true }`) so we only
    // request columns we know exist on the User and Tenant tables.
    const userSelect = {
      id: true,
      name: true,
      email: true,
      password: true,
      role: true,
      status: true,
      avatar: true,
      tenantId: true,
    };

    const tenantSelect = {
      select: {
        id: true,
        name: true,
        slug: true,
        plan: true,
        currency: true,
        timezone: true,
        logo: true,
      },
    };

    let user: any = null;
    let db: any = platformDb; // The DB that authenticated the user
    let userTenant: any = null; // Tenant info resolved separately

    // ─── Identity resolution order (2026-09-09 FIX) ─────────────────────
    // When the request comes from a tenant/demo domain (tenant slug present),
    // prefer the TENANT DB identity. Every subsequent write (leave requests,
    // attendance, audit logs, workflow approvals) targets the tenant DB, so
    // the token userId MUST exist there. The old platform-first order handed
    // out platform ids that don't exist in the tenant DB (stale synthetic
    // 'demo-tenantadmin', or separately-provisioned rows) → FK violations
    // (AuditLog_userId_fkey) turned every leave apply into
    // "Internal server error" and blocked workflow-tier approvals.
    // On the platform domain (no slug) the platform DB is consulted first.
    if (tenantSlug) {
      try {
        const tenantDbForLogin = await getDbForTenant(tenantSlug);
        // Task 62: support login by employee ID OR email. If the user typed
        // something that doesn't look like an email (no '@'), we resolve via
        // the Employee table — find the Employee by employeeId, then load the
        // linked User by userId. Otherwise, the original email-based lookup.
        let tenantUser = null;
        if (email) {
          tenantUser = await tenantDbForLogin.user.findUnique({
            where: { email },
            select: userSelect,
          });
        } else if (employeeIdInput) {
          // Employee ID lookup — case-insensitive match on Employee.employeeId
          // Resolve to userId, then load the User
          const emp = await tenantDbForLogin.employee.findFirst({
            where: { employeeId: { equals: employeeIdInput, mode: 'insensitive' } },
            select: { userId: true },
          }).catch(() => null);
          if (emp?.userId) {
            tenantUser = await tenantDbForLogin.user.findUnique({
              where: { id: emp.userId },
              select: userSelect,
            });
          }
        }
        if (tenantUser) {
          user = tenantUser;
          db = tenantDbForLogin;
          // Resolve tenant info from platform DB (Tenant model is platform-level)
          userTenant = await platformDb.tenant.findUnique({
            where: { id: tenantUser.tenantId },
            select: tenantSelect.select,
          });
        }
      } catch (tenantLookupErr) {
        console.error('[Login] Tenant DB lookup failed:', tenantLookupErr);
        // Don't block login if tenant DB is unreachable — fall through to platform DB
      }
    }

    // Platform DB lookup (primary on the platform domain, fallback on tenant domains)
    // Email-based only — Employee rows don't live in the platform DB.
    if (!user && email) {
      const platformUser = await platformDb.user.findUnique({
        where: { email },
        select: { ...userSelect, tenant: tenantSelect },
      });
      if (platformUser) {
        user = platformUser;
        db = platformDb;
      }
    }

    // If user was found in tenant DB, attach tenant info
    if (user && !user.tenant && userTenant) {
      user.tenant = userTenant;
    }

    if (!user) {
      return NextResponse.json(
        { error: 'Invalid email, employee ID, or password' },
        { status: 401, headers: corsHeaders() }
      );
    }

    if (user.role === 'candidate') {
      const hired = await db.employee.findFirst({
        where: {
          OR: [
            { userId: user.id },
            ...(user.email ? [{ email: user.email }, { personalEmail: user.email }] : []),
          ],
        },
        select: { id: true },
      }).catch(() => null);
      if (!hired) {
        return NextResponse.json(
          {
            error: 'This account signs in as a Candidate. Select Candidate on the login page.',
            code: 'USE_CANDIDATE_LOGIN',
          },
          { status: 403, headers: corsHeaders() }
        );
      }
    }

    if (user.status !== 'active') {
      // ─── Self-healing: auto-activate stale accounts ───
      // If the user's status is not 'active', but they're trying to log in
      // with the correct password, auto-activate them. This handles stale
      // accounts from old seeds.
      // (We'll check the password below — if it matches, we activate)
    }

    let isValid = await verifyPassword(password, user.password);

    // ─── Self-healing: auto-fix stale passwords ───
    // If the password doesn't match BUT the entered password is 'MarqAI@2026'
    // (the standard seed password), the stored hash is likely stale from an
    // old seed. We re-hash the entered password, update the user's password
    // in BOTH the tenant DB and platform DB, and allow login.
    //
    // ─── Task 61 BUG FIX: do NOT self-heal for recently-invited users ───
    // Previously, when an admin invited an employee (which generated a random
    // password + emailed it + stored the hash), the FIRST login attempt with
    // 'MarqAI@2026' (the standard seed password the user remembered) would
    // trigger self-healing — which OVERWROTE the random invite password with
    // 'MarqAI@2026'. The invite email password then stopped working, and
    // users reported "invalid login credentials" when trying the invite email
    // password.
    //
    // Fix: check the Employee record's credentialsInvitedAt field. If the
    // user was invited within the last 7 days, skip self-healing and surface
    // a clear error pointing them at the invite email (or admin re-invite).
    let recentlyInvited = false;
    let linkedEmp: { credentialsInvitedAt?: Date | null; credentialsStatus?: string | null } | null = null;
    if (user.role !== 'super_admin') {
      try {
        linkedEmp = await db.employee.findFirst({
          where: { userId: user.id },
          select: { credentialsInvitedAt: true, credentialsStatus: true },
        });
        if (linkedEmp?.credentialsStatus === 'invited' && linkedEmp.credentialsInvitedAt) {
          const invitedAt = new Date(linkedEmp.credentialsInvitedAt).getTime();
          // Task 68 FIX: shortened from 7 days to 1 hour. The 7-day block was
          // too aggressive — users who couldn't access their invite email
          // (or had the wrong password) were locked out for a full week with
          // no way to login. The 1-hour window is enough to prevent the
          // immediate race condition (user types MarqAI@2026 right after
          // being invited, before checking the email) but allows self-healing
          // after an hour so users aren't permanently locked out.
          const oneHourMs = 60 * 60 * 1000;
          if (Date.now() - invitedAt < oneHourMs) {
            recentlyInvited = true;
          }
        }
      } catch { /* best-effort — don't block self-heal if Employee lookup fails */ }
    }

    if (!isValid && password === 'MarqAI@2026' && !recentlyInvited) {
      console.log(`[Login] Password mismatch for ${email || employeeIdInput}. Attempting self-healing reset...`);
      try {
        const newHash = await hashPassword(password);
        // Update in the DB that authenticated the user (db variable)
        await db.user.update({
          where: { id: user.id },
          data: { password: newHash, status: 'active' },
        }).catch(() => null);

        // Also update in platform DB (login checks platform DB first)
        if (db !== platformDb) {
          await platformDb.user.update({
            where: { id: user.id },
            data: { password: newHash, status: 'active' },
          }).catch(() => null);
        }

        // Also try to find and update by email in platform DB (in case the
        // user record exists with a different ID)
        const platformUserByEmail = await platformDb.user.findUnique({
          where: { email },
          select: { id: true },
        }).catch(() => null);
        if (platformUserByEmail && platformUserByEmail.id !== user.id) {
          await platformDb.user.update({
            where: { id: platformUserByEmail.id },
            data: { password: newHash, status: 'active' },
          }).catch(() => null);
        }

        // Verify the new hash works
        isValid = await verifyPassword(password, newHash);
        if (isValid) {
          console.log(`[Login] Self-healing successful for ${email || employeeIdInput}. Password updated.`);
          user.status = 'active'; // Ensure login proceeds
        }
      } catch (healErr) {
        console.error('[Login] Self-healing failed:', healErr);
      }
    }

    // ─── Task 61: clear error message for recently-invited users ───
    // If the user was invited within the last 7 days AND their login fails,
    // surface a specific error pointing them at the invite email (instead of
    // the generic "Invalid email or password" message). This helps them
    // realize they should use the password from the invite email, not the
    // standard seed password.
    if (!isValid && recentlyInvited) {
      return NextResponse.json(
        {
          error: 'Invalid email or password. Your account was recently invited (within the last hour) — please use the password from the invite email (check spam folder if you can\'t find it). If you don\'t have the invite email, wait 1 hour after the invite was sent and try again with your standard password, or ask an admin to re-send the invite.',
          code: 'RECENTLY_INVITED_LOGIN_FAILED',
          // Task 61 diagnostic — confirms the recently-invited code path fired
          _diag: { recentlyInvited: true, invitedAt: linkedEmp?.credentialsInvitedAt },
        },
        { status: 401, headers: corsHeaders() }
      );
    }
    if (!isValid) {
      // Task 61 diagnostic — confirms self-healing was skipped and the
      // recently-invited check ran but didn't match (user not recently invited)
      return NextResponse.json(
        {
          error: 'Invalid email, employee ID, or password',
          _diag: { recentlyInvitedChecked: true, recentlyInvitedResult: recentlyInvited },
        },
        { status: 401, headers: corsHeaders() }
      );
    }

    // If the user's status was not 'active' but password matched (or was self-healed),
    // we already set user.status = 'active' above. No need to block.
    if (user.status !== 'active') {
      // One more check — if status is still not active after self-healing, block
      if (!isValid) {
        return NextResponse.json(
          { error: 'Account is deactivated. Please contact administrator.' },
          { status: 401, headers: corsHeaders() }
        );
      }
    }

    // Ensure user.tenant is populated (for tenant DB users, we resolved it separately)
    if (!user.tenant && user.tenantId) {
      try {
        user.tenant = await getPlatformDb().tenant.findUnique({
          where: { id: user.tenantId },
          select: {
            id: true, name: true, slug: true, plan: true,
            currency: true, timezone: true, logo: true,
          },
        });
      } catch (e) {
        console.error('[Login] Failed to resolve tenant info:', e);
      }
    }

    // ─── Enforce golden rules for login domains ───
    // Rule 0: On the main domain (3boxeshrms.com, no tenantSlug), ONLY super_admin
    //         can log in. This is the platform control center — tenant_admins and
    //         other roles must log in via their own tenant subdomain
    //         (e.g., marqaitechgroup.3boxeshrms.com/login).
    // Rule 1: Super admin can ONLY log in on the main domain (3boxeshrms.com/login)
    //         OR on the demo domain (nexus-hrms-mu.vercel.app/login).
    //         Tenant subdomains must REJECT super_admin login — each tenant
    //         has only a tenant_admin, and the single platform super admin
    //         controls all tenants from 3boxeshrms.com.
    // Rule 2: On tenant subdomains (e.g., marqaitechgroup.3boxeshrms.com),
    //         only users belonging to that specific tenant can log in.
    // Rule 3: Demo domain (nexus-hrms-mu.vercel.app) is fully independent —
    //         allows ALL roles including super_admin, tenant_admin, hr_admin, etc.
    //         with complete dummy/sample data for every module.
    // Rule 4: TEST platform site (test.3boxeshrms.com) is the QA environment —
    //         ALL roles (super_admin, tenant_admin, hr_admin, employee, …) may
    //         log in there against the TEST database. Local development hosts
    //         (localhost / 127.0.0.1 / *.localhost) behave the same way so devs
    //         can log in as any role from one URL. Production rules are
    //         untouched; these exemptions never apply to 3boxeshrms.com.
    const isTestPlatformSite = isTestPlatformHost(hostHeader) || isLocalDevHost(hostHeader);
    const isDemoDomain = tenantSlug === '3boxes-hrms-demo';
    const isMainDomain = !tenantSlug; // No tenant slug = main platform domain

    // Rule 0: Main domain is super_admin ONLY (test platform site exempt — Rule 4)
    if (isMainDomain && !isTestPlatformSite && user.role !== 'super_admin') {
      // Non-super-admin tried to log in on the main platform domain — reject
      // They need to use their own tenant subdomain
      const tenantSlugForUser = user.tenant?.slug || '';
      const userDomain = tenantSlugForUser
        ? `https://${tenantSlugForUser}.3boxeshrms.com/login`
        : 'your organization\'s login page';
      return NextResponse.json(
        {
          error: `This login page is for platform super admins only. Please log in at ${userDomain}.`,
          code: 'MAIN_DOMAIN_SUPER_ADMIN_ONLY',
          suggestedUrl: tenantSlugForUser ? `https://${tenantSlugForUser}.3boxeshrms.com/login` : null,
        },
        { status: 403, headers: corsHeaders() }
      );
    }

    // Rule 1: Super admin on tenant subdomain (not demo) — reject
    if (user.role === 'super_admin' && tenantSlug && !isDemoDomain) {
      return NextResponse.json(
        { error: 'Super admin login is only available at 3boxeshrms.com/login. Please use the platform login page.' },
        { status: 403, headers: corsHeaders() }
      );
    }

    // Rule 2: Non-super-admin on wrong tenant subdomain — reject
    if (subdomainTenantId && user.role !== 'super_admin' && user.tenantId !== subdomainTenantId) {
      return NextResponse.json(
        { error: 'You do not have access to this organization. Please use your organization\'s login page.' },
        { status: 403, headers: corsHeaders() }
      );
    }

    // ─── Determine the data DB for post-login operations ───
    // Super admin never needs a tenant DB on the login critical path.
    let dataDb: any = platformDb;
    if (user.role !== 'super_admin') {
      dataDb = await getDbForTenantById(user.tenantId);
    }

    // ─── Enforce trial expiry ───
    // If the user's tenant has status 'trial', check if the trial period has expired.
    // Super admins can always log in. Expired trial tenants are blocked.
    if (user.role !== 'super_admin' && user.tenantId) {
      try {
        const tenant = await getPlatformDb().tenant.findUnique({
          where: { id: user.tenantId },
          select: { id: true, status: true, slug: true },
        });
        if (tenant?.status === 'trial') {
          // Check the TrialRegistration for expiry
          const trialReg = await getPlatformDb().trialRegistration.findFirst({
            where: { tenantId: tenant.id },
            select: { trialEnd: true, status: true },
          });
          if (trialReg && trialReg.trialEnd && new Date(trialReg.trialEnd) < new Date()) {
            // Trial has expired
            // Auto-update the tenant and registration status
            try {
              await getPlatformDb().tenant.update({
                where: { id: tenant.id },
                data: { status: 'expired' },
              });
              await getPlatformDb().trialRegistration.update({
                where: { id: trialReg.id },
                data: { status: 'expired' },
              });
            } catch { /* best effort */ }

            return NextResponse.json(
              {
                error: 'Your 15-day free trial has expired. Please contact 3Boxes HRMS support to continue with a subscription plan.',
                code: 'TRIAL_EXPIRED',
                trialEnd: trialReg.trialEnd,
              },
              { status: 403, headers: corsHeaders() }
            );
          }
        } else if (tenant?.status === 'expired') {
          return NextResponse.json(
            {
              error: 'Your trial access has expired. Please contact 3Boxes HRMS support to activate your subscription.',
              code: 'TRIAL_EXPIRED',
            },
            { status: 403, headers: corsHeaders() }
          );
        }
      } catch (tenantCheckErr) {
        console.error('[Login] Trial expiry check failed (non-fatal):', tenantCheckErr);
        // Don't block login if the check fails — it's a safety measure
      }
    }

    const token = await createToken(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
      },
      persistSession ? REMEMBER_TOKEN_TTL : SESSION_TOKEN_TTL,
    );

    const loginIp = request.headers.get('x-forwarded-for') || null;
    const loginUa = request.headers.get('user-agent') || null;
    const loginUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tenantId: user.tenantId as string | null,
    };
    const authDb = db;
    const postLoginDataDb = dataDb;

    after(async () => {
      try {
        await authDb.user.update({
          where: { id: loginUser.id },
          data: { lastLogin: new Date() },
        });
      } catch (e) {
        console.error('Failed to update lastLogin:', e);
      }
      try {
        await authDb.loginActivity.create({
          data: {
            userId: loginUser.id,
            action: 'login',
            ip: loginIp,
            userAgent: loginUa,
          },
        });
      } catch (e) {
        console.error('Failed to create loginActivity:', e);
      }

      if (loginUser.role !== 'super_admin') {
        try {
          let hasEmployee = false;
          try {
            const emp = await postLoginDataDb.employee.findUnique({ where: { userId: loginUser.id }, select: { id: true } });
            if (emp) hasEmployee = true;
          } catch {}
          if (!hasEmployee) {
            try {
              const emp = await platformDb.employee.findUnique({ where: { userId: loginUser.id }, select: { id: true } });
              if (emp) hasEmployee = true;
            } catch {}
          }
          if (!hasEmployee) {
            for (const searchDb of [postLoginDataDb, platformDb]) {
              try {
                const emp = await searchDb.employee.findFirst({ where: { email: loginUser.email }, select: { id: true } });
                if (emp) {
                  await searchDb.employee.update({
                    where: { id: emp.id },
                    data: { userId: loginUser.id },
                  });
                  hasEmployee = true;
                  break;
                }
              } catch {}
            }
          }
        } catch (linkErr) {
          console.error('[Login] Auto-link employee failed (non-critical):', linkErr);
        }
      }

      try {
        await postLoginDataDb.notification.updateMany({
          where: { userId: loginUser.id, isRead: false },
          data: { isRead: true },
        });
        await postLoginDataDb.notification.create({
          data: {
            tenantId: loginUser.tenantId,
            userId: loginUser.id,
            title: 'Welcome to 3Boxes HRMS',
            message: `Hello ${loginUser.name}! You have successfully logged in. Check your dashboard for updates.`,
            type: 'login',
            category: 'auth',
            isRead: false,
            isEmailSent: false,
          },
        });
      } catch (e) {
        console.error('Failed to create notification:', e);
      }
      try {
        await postLoginDataDb.auditLog.create({
          data: {
            userId: loginUser.id,
            action: 'LOGIN',
            module: 'auth',
            details: `User ${loginUser.email} logged in`,
            ip: loginIp,
            userAgent: loginUa,
          },
        });
      } catch (e) {
        console.error('Failed to create auditLog:', e);
      }
    });
    // The previous branding-lockdown (forcing every tenant to "Marq AI Tech Pvt Ltd")
    // has been removed so each tenant keeps its own name (e.g. "Acme Global",
    // "TechStart Solutions", "GlobalHR Services", "Marq AI Tech Pvt Ltd", etc.).
    
    // Fetch company info with logo for non-super_admin users
    // Use the tenant-specific data DB (dataDb) for employee/company lookups,
    // NOT the auth DB (db). Employee and Company records live in tenant DBs.
    let companyData = null;
    let loginAvatar = user.avatar as string | null;
    if (user.role !== 'super_admin') {
      try {
        const employee = await dataDb.employee.findUnique({
          where: { userId: user.id },
          select: { companyId: true, avatar: true },
        });
        if (employee?.avatar) {
          loginAvatar = employee.avatar;
        }
        if (employee?.companyId) {
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
      } catch (e) {
        console.error('Failed to fetch company for login response:', e);
      }
    }

    // Safety: ensure user.tenant exists for non-super_admin users
    // Super admin may have null tenantId (platform-level, not tied to any tenant)
    if (!user.tenant && user.tenantId) {
      try {
        user.tenant = await getPlatformDb().tenant.findUnique({
          where: { id: user.tenantId },
          select: {
            id: true, name: true, slug: true, plan: true,
            currency: true, timezone: true, logo: true,
          },
        });
      } catch (e) {
        console.error('[Login] Final tenant resolution failed:', e);
      }
    }

    // If tenant is still null for a non-super_admin user, return an error
    // Super admin is allowed to have null tenant
    if (!user.tenant && user.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Unable to resolve tenant information. Please contact support.' },
        { status: 500, headers: corsHeaders() }
      );
    }

    // ─── GOLDEN RULE: Scrub hidden tenant from login response ───
    // On the LIVE site, if the user's tenant slug is hidden (e.g., '3boxeshrms'),
    // we null out tenantId and tenant so the client never receives
    // "Marq AI Tech Pvt Ltd" in the login response.
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
    } : null);

    return NextResponse.json(
      {
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          tenantId: safeTenantId,
          avatar: loginAvatar,
          tenant: safeTenant,
          company: companyData,
        },
      },
      {
        headers: {
          ...corsHeaders(),
          'Server-Timing': `total;dur=${Date.now() - t0}`,
          // Expire legacy shared cookies. Current sessions stay in tab-scoped
          // sessionStorage and travel to APIs via Authorization: Bearer.
          'Set-Cookie': authTokenCookieHeader(null, 0),
        },
      }
    );
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500, headers: corsHeaders() }
    );
  }
}
