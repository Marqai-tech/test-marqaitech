import { NextResponse } from 'next/server';
import { getDb, getPlatformDb, getDbForTenant } from '@/lib/tenant-db';
import { hashPassword, getTokenFromHeaders, verifyToken } from '@/lib/auth';
import { getDataScope } from '@/lib/roleAccess';
import { isServerLiveSite } from '@/lib/tenant-filter';

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

/** Generate a strong random password */
function generateRandomPassword(length = 12): string {
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const digits = '0123456789';
  const special = '!@#$%&*';
  const all = upper + lower + digits + special;

  // Ensure at least one of each category
  let pwd = '';
  pwd += upper[Math.floor(Math.random() * upper.length)];
  pwd += lower[Math.floor(Math.random() * lower.length)];
  pwd += digits[Math.floor(Math.random() * digits.length)];
  pwd += special[Math.floor(Math.random() * special.length)];

  for (let i = pwd.length; i < length; i++) {
    pwd += all[Math.floor(Math.random() * all.length)];
  }

  // Shuffle
  return pwd.split('').sort(() => Math.random() - 0.5).join('');
}

/** GET — list all employees with their login credential status */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const departmentId = searchParams.get('departmentId') || '';
    const companyId = searchParams.get('companyId') || '';
    const tenantId = searchParams.get('tenantId') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');

    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });

    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });

    // ─── Resolve the correct tenant DB ───
    let db = await getDb(request);

    // Decode JWT role
    const jwtRole = (decoded.role as string) || 'employee';

    // For super_admin, resolve tenant DB from tenantId or companyId query param
    if (jwtRole === 'super_admin') {
      if (tenantId) {
        const tenant = await getPlatformDb().tenant.findUnique({
          where: { id: tenantId },
          select: { slug: true },
        });
        if (tenant?.slug) {
          db = await getDbForTenant(tenant.slug);
        }
      } else if (companyId) {
        let company = await db.company.findUnique({ where: { id: companyId }, select: { companyGroupId: true } }).catch(() => null);
        if (!company) company = await getPlatformDb().company.findUnique({ where: { id: companyId }, select: { companyGroupId: true } }).catch(() => null);
        if (company?.companyGroupId) {
          let group = await db.companyGroup.findUnique({ where: { id: company.companyGroupId }, select: { tenantId: true } }).catch(() => null);
          if (!group) group = await getPlatformDb().companyGroup.findUnique({ where: { id: company.companyGroupId }, select: { tenantId: true } }).catch(() => null);
          if (group?.tenantId) {
            const tenant = await getPlatformDb().tenant.findUnique({ where: { id: group.tenantId }, select: { slug: true } });
            if (tenant?.slug) db = await getDbForTenant(tenant.slug);
          }
        }
      }
    }

    // Get user info — try resolved db first, then platform DB
    let user = await db.user.findUnique({
      where: { id: decoded.userId as string },
      select: { id: true, role: true, tenantId: true },
    }).catch(() => null);
    if (!user) {
      // If not found in tenant DB (might be super_admin in platform DB), try platform DB
      user = await getPlatformDb().user.findUnique({
        where: { id: decoded.userId as string },
        select: { id: true, role: true, tenantId: true },
      });
    }
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404, headers: corsHeaders() });

    const userRole = user.role;
    const userId = user.id;
    const scope = getDataScope(userRole);

    // Build where clause — SAME approach as /api/employees (which works)
    const where: Record<string, unknown> = {};

    if (departmentId) where.departmentId = departmentId;

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { employeeId: { contains: search, mode: 'insensitive' } },
      ];
    }

    // ─── Company scope filter (from CompanySwitcher) ───
    if (companyId) {
      where.companyId = companyId;
    }

    // ─── Tenant scope filter (super_admin only, when no companyId) ───
    // Employee has no `company` relation — only a bare companyId field.
    // To filter by tenant, we need to first find all companies under that tenant,
    // then filter employees by those company IDs.
    if (!companyId && tenantId && effectiveRole === 'super_admin') {
      const tenantGroups = await db.companyGroup.findMany({
        where: { tenantId },
        select: { id: true },
      });
      const groupIds = tenantGroups.map(g => g.id);
      if (groupIds.length > 0) {
        const tenantCompanies = await db.company.findMany({
          where: { companyGroupId: { in: groupIds } },
          select: { id: true },
        });
        const companyIds = tenantCompanies.map(c => c.id);
        if (companyIds.length > 0) {
          where.companyId = { in: companyIds };
        } else {
          // No companies in this tenant → return empty
          where.id = '__never__';
        }
      } else {
        where.id = '__never__';
      }
    }

    // ─── Data scope filtering ───
    // For super_admin: use jwtRole (from JWT) which is more reliable
    const effectiveRole = userRole || jwtRole;
    const effectiveScope = getDataScope(effectiveRole);
    if (effectiveScope === 'self' && userId) {
      where.userId = userId;
    } else if (effectiveScope === 'team' && userId) {
      const ownEmp = await db.employee.findFirst({
        where: { userId, status: 'active' },
        select: { departmentId: true },
      });
      if (ownEmp) {
        where.departmentId = ownEmp.departmentId;
      }
    }
    // scope === 'all' → no additional tenant/company filtering (tenant_admin, admin, super_admin)

    console.log('[Credentials GET] where:', JSON.stringify(where, null, 2));
    console.log('[Credentials GET] jwtRole:', jwtRole, 'effectiveRole:', effectiveRole, 'scope:', effectiveScope, 'tenantId:', tenantId, 'companyId:', companyId);

    const [employees, total] = await Promise.all([
      db.employee.findMany({
        where,
        select: {
          id: true,
          employeeId: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          status: true,
          department: { select: { name: true } },
          designation: { select: { title: true } },
          userId: true,
          user: { select: { id: true, email: true, status: true, lastLogin: true, role: true } },
        },
        orderBy: { firstName: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.employee.count({ where }),
    ]);

    console.log('[Credentials GET] Found', employees.length, 'of', total, 'employees');

    const result = employees.map((emp) => ({
      id: emp.id,
      employeeId: emp.employeeId,
      firstName: emp.firstName,
      lastName: emp.lastName,
      email: emp.email,
      phone: emp.phone,
      status: emp.status,
      department: emp.department?.name || '—',
      designation: emp.designation?.title || '—',
      hasLoginAccount: !!emp.userId,
      loginEmail: emp.user?.email || emp.email,
      loginStatus: emp.user?.status || 'no_account',
      lastLogin: emp.user?.lastLogin || null,
      userRole: emp.user?.role || null,
    }));

    return NextResponse.json({ employees: result, total, page, limit }, { headers: corsHeaders() });
  } catch (error) {
    console.error('[Credentials GET] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

/** POST — Create/reset passwords for single, multiple, or all employees */
export async function POST(request: Request) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });

    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });

    const body = await request.json();
    const { mode, employeeIds, password, tenantId } = body;

    // Validate
    if (!mode || !['single', 'selected', 'all'].includes(mode)) {
      return NextResponse.json({ error: 'mode must be single, selected, or all' }, { status: 400, headers: corsHeaders() });
    }
    if (mode === 'single' && (!employeeIds || employeeIds.length !== 1)) {
      return NextResponse.json({ error: 'single mode requires exactly one employeeId' }, { status: 400, headers: corsHeaders() });
    }
    if (mode === 'selected' && (!employeeIds || employeeIds.length === 0)) {
      return NextResponse.json({ error: 'selected mode requires at least one employeeId' }, { status: 400, headers: corsHeaders() });
    }

    // Get admin user
    const admin = await db.user.findUnique({
      where: { id: decoded.userId as string },
      select: { id: true, role: true, tenantId: true },
    });
    if (!admin) return NextResponse.json({ error: 'Admin not found' }, { status: 404, headers: corsHeaders() });

    // Build where clause — same approach as GET (matching /api/employees)
    const where: Record<string, unknown> = {};
    if (mode !== 'all' && employeeIds) {
      where.id = { in: employeeIds };
    }

    const results: Array<{
      employeeId: string;
      name: string;
      email: string;
      password: string;
      action: string;
      success: boolean;
      error?: string;
    }> = [];

    const employees = await db.employee.findMany({
      where,
      select: { id: true, employeeId: true, firstName: true, lastName: true, email: true, userId: true },
    });

    if (employees.length === 0) {
      return NextResponse.json({ error: 'No employees found' }, { status: 404, headers: corsHeaders() });
    }

    for (const emp of employees) {
      try {
        const pwd = password || generateRandomPassword();
        const hashedPwd = await hashPassword(pwd);

        if (emp.userId) {
          // Update existing user password
          await db.user.update({
            where: { id: emp.userId },
            data: { password: hashedPwd, status: 'active' },
          });
          results.push({
            employeeId: emp.employeeId,
            name: `${emp.firstName} ${emp.lastName}`,
            email: emp.email,
            password: pwd,
            action: 'password_reset',
            success: true,
          });
        } else {
          // Create new user account
          const newUser = await db.user.create({
            data: {
              email: emp.email,
              password: hashedPwd,
              name: `${emp.firstName} ${emp.lastName}`,
              role: 'employee',
              tenantId: admin.tenantId,
              status: 'active',
            },
          });
          // Link employee to user
          await db.employee.update({
            where: { id: emp.id },
            data: { userId: newUser.id },
          });
          results.push({
            employeeId: emp.employeeId,
            name: `${emp.firstName} ${emp.lastName}`,
            email: emp.email,
            password: pwd,
            action: 'account_created',
            success: true,
          });
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        // Handle unique email constraint - user might already exist with different employee
        if (errorMsg.includes('Unique constraint') || errorMsg.includes('unique')) {
          // Try to find existing user by email and link
          try {
            const existingUser = await db.user.findUnique({ where: { email: emp.email } });
            if (existingUser) {
              const pwd = password || generateRandomPassword();
              const hashedPwd = await hashPassword(pwd);
              await db.user.update({
                where: { id: existingUser.id },
                data: { password: hashedPwd, status: 'active' },
              });
              await db.employee.update({
                where: { id: emp.id },
                data: { userId: existingUser.id },
              });
              results.push({
                employeeId: emp.employeeId,
                name: `${emp.firstName} ${emp.lastName}`,
                email: emp.email,
                password: pwd,
                action: 'linked_and_reset',
                success: true,
              });
            } else {
              results.push({
                employeeId: emp.employeeId,
                name: `${emp.firstName} ${emp.lastName}`,
                email: emp.email,
                password: '',
                action: 'failed',
                success: false,
                error: errorMsg,
              });
            }
          } catch (linkErr) {
            results.push({
              employeeId: emp.employeeId,
              name: `${emp.firstName} ${emp.lastName}`,
              email: emp.email,
              password: '',
              action: 'failed',
              success: false,
              error: linkErr instanceof Error ? linkErr.message : 'Link failed',
            });
          }
        } else {
          results.push({
            employeeId: emp.employeeId,
            name: `${emp.firstName} ${emp.lastName}`,
            email: emp.email,
            password: '',
            action: 'failed',
            success: false,
            error: errorMsg,
          });
        }
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    return NextResponse.json({
      message: `Processed ${results.length} employees: ${successCount} succeeded, ${failCount} failed`,
      results,
      summary: { total: results.length, succeeded: successCount, failed: failCount },
    }, { headers: corsHeaders() });
  } catch (error) {
    console.error('[Credentials POST] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

/** PUT — Update a single employee's login email or password */
export async function PUT(request: Request) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });

    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });

    const body = await request.json();
    const { employeeId, email, password, action } = body;

    if (!employeeId) {
      return NextResponse.json({ error: 'employeeId is required' }, { status: 400, headers: corsHeaders() });
    }

    const employee = await db.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, employeeId: true, firstName: true, lastName: true, email: true, userId: true },
    });

    if (!employee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404, headers: corsHeaders() });
    }

    if (action === 'update_email' && email) {
      // Update the user's login email
      if (employee.userId) {
        await db.user.update({
          where: { id: employee.userId },
          data: { email },
        });
        // Also update employee email
        await db.employee.update({
          where: { id: employeeId },
          data: { email },
        });
      }
      return NextResponse.json({ message: 'Email updated successfully' }, { headers: corsHeaders() });
    }

    if (action === 'reset_password') {
      const pwd = password || generateRandomPassword();
      const hashedPwd = await hashPassword(pwd);

      if (employee.userId) {
        await db.user.update({
          where: { id: employee.userId },
          data: { password: hashedPwd },
        });
      } else {
        // Create account if doesn't exist
        const admin = await db.user.findUnique({
          where: { id: decoded.userId as string },
          select: { tenantId: true },
        });
        const newUser = await db.user.create({
          data: {
            email: employee.email,
            password: hashedPwd,
            name: `${employee.firstName} ${employee.lastName}`,
            role: 'employee',
            tenantId: admin?.tenantId || '',
            status: 'active',
          },
        });
        await db.employee.update({
          where: { id: employeeId },
          data: { userId: newUser.id },
        });
      }

      return NextResponse.json({
        message: 'Password reset successfully',
        password: pwd,
        email: employee.email,
      }, { headers: corsHeaders() });
    }

    if (action === 'toggle_status') {
      if (!employee.userId) {
        return NextResponse.json({ error: 'Employee has no login account' }, { status: 400, headers: corsHeaders() });
      }
      const currentUser = await db.user.findUnique({ where: { id: employee.userId }, select: { status: true } });
      const newStatus = currentUser?.status === 'active' ? 'inactive' : 'active';
      await db.user.update({
        where: { id: employee.userId },
        data: { status: newStatus },
      });
      return NextResponse.json({ message: `Account ${newStatus === 'active' ? 'enabled' : 'disabled'}` }, { headers: corsHeaders() });
    }

    if (action === 'delete_account') {
      if (!employee.userId) {
        return NextResponse.json({ error: 'Employee has no login account' }, { status: 400, headers: corsHeaders() });
      }
      // Unlink employee first
      await db.employee.update({
        where: { id: employeeId },
        data: { userId: null },
      });
      // Delete user
      await db.user.delete({
        where: { id: employee.userId },
      });
      return NextResponse.json({ message: 'Login account deleted' }, { headers: corsHeaders() });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400, headers: corsHeaders() });
  } catch (error) {
    console.error('[Credentials PUT] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
