/**
 * POST /api/admin/promote-tenant-admin
 *
 * Super-admin-gated maintenance endpoint.
 *
 * Promotes a user to `tenant_admin` on BOTH the platform DB and the tenant's
 * dedicated DB, and (optionally) sets them as the reporting manager of another
 * employee. Uses the SAME getPlatformDb()/getDbForTenant() routing the rest of
 * the app uses, so it operates on whichever Neon project the deployment is
 * connected to (production, test, or preview).
 *
 * Body:
 *   {
 *     "email": "madhuri@marqaitech.com",          // user to promote
 *     "tenantSlug": "marqaitechgroup",             // tenant whose DB to update
 *     "reportingManagerOf": {                      // optional
 *       "email": "manoj@marqaitech.com"            // employee whose reportingManagerId should point at the promoted user
 *     }
 *   }
 *
 * Returns before/after for every step.
 */
import { NextResponse } from 'next/server';
import { getPlatformDb, getDbForTenant } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { PrismaClient } from '@/generated/prisma/client';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(request: Request) {
  try {
    // ─── Auth: super_admin only ───
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    }
    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    }
    if (decoded.role !== 'super_admin') {
      return NextResponse.json({ error: 'Only super admins can run this operation' }, { status: 403, headers: corsHeaders() });
    }

    const body = await request.json().catch(() => ({}));
    const email = String(body.email || '').trim().toLowerCase();
    const tenantSlug = String(body.tenantSlug || '').trim();
    const rmOf = body.reportingManagerOf && body.reportingManagerOf.email
      ? String(body.reportingManagerOf.email).trim().toLowerCase()
      : '';

    if (!email || !tenantSlug) {
      return NextResponse.json(
        { error: 'Both `email` and `tenantSlug` are required.' },
        { status: 400, headers: corsHeaders() }
      );
    }

    const platformDb = getPlatformDb();
    const result: Record<string, unknown> = {
      email,
      tenantSlug,
      reportingManagerOf: rmOf || null,
      steps: [] as Array<Record<string, unknown>>,
    };

    // ─── Step 1: Platform DB — promote User.role → tenant_admin ───
    // Use raw SQL so we update ALL users with this email (some platform DBs
    // have duplicate User rows for the same email due to legacy seed drift,
    // and Prisma findUnique on a non-unique email would throw).
    try {
      const beforePlatRows = await platformDb.$queryRaw<Array<{ id: string; name: string; email: string; role: string; status: string }>>`
        SELECT id, name, email, role, status FROM "User" WHERE email = ${email}
      `;
      if (beforePlatRows.length === 0) {
        (result.steps as Array<Record<string, unknown>>).push({
          step: 'platform-user',
          status: 'not_found',
        });
      } else {
        await platformDb.$executeRaw`
          UPDATE "User" SET role = 'tenant_admin', "updatedAt" = NOW() WHERE email = ${email}
        `;
        const afterPlatRows = await platformDb.$queryRaw<Array<{ id: string; name: string; email: string; role: string; status: string }>>`
          SELECT id, name, email, role, status FROM "User" WHERE email = ${email}
        `;
        (result.steps as Array<Record<string, unknown>>).push({
          step: 'platform-user',
          status: 'updated',
          count: beforePlatRows.length,
          before: beforePlatRows.map((u) => ({ id: u.id, name: u.name, role: u.role })),
          after: afterPlatRows.map((u) => ({ id: u.id, name: u.name, role: u.role })),
        });
      }
    } catch (e) {
      (result.steps as Array<Record<string, unknown>>).push({
        step: 'platform-user',
        status: 'error',
        error: e instanceof Error ? e.message : String(e),
      });
    }

    // ─── Step 2: Tenant DB — promote User.role → tenant_admin ───
    let tenantDb: PrismaClient | null = null;
    try {
      tenantDb = await getDbForTenant(tenantSlug);
    } catch (e) {
      (result.steps as Array<Record<string, unknown>>).push({
        step: 'tenant-db-connect',
        status: 'error',
        error: e instanceof Error ? e.message : String(e),
      });
      return NextResponse.json(result, { status: 200, headers: corsHeaders() });
    }

    if (tenantDb) {
      // Tenant User role update — use raw SQL to avoid Prisma column-validation
      // drift (some tenant DBs lack nullable cols the client expects).
      // IMPORTANT: update ALL users with this email (some tenant DBs have
      // duplicate User rows for the same email due to legacy seed drift).
      try {
        const beforeRows = await tenantDb.$queryRaw<Array<{ id: string; name: string; email: string; role: string; status: string }>>`
          SELECT id, name, email, role, status FROM "User" WHERE email = ${email}
        `;
        if (beforeRows.length === 0) {
          (result.steps as Array<Record<string, unknown>>).push({
            step: 'tenant-user',
            status: 'not_found',
          });
        } else {
          await tenantDb.$executeRaw`
            UPDATE "User" SET role = 'tenant_admin', "updatedAt" = NOW() WHERE email = ${email}
          `;
          const afterRows = await tenantDb.$queryRaw<Array<{ id: string; name: string; email: string; role: string; status: string }>>`
            SELECT id, name, email, role, status FROM "User" WHERE email = ${email}
          `;
          (result.steps as Array<Record<string, unknown>>).push({
            step: 'tenant-user',
            status: 'updated',
            count: beforeRows.length,
            before: beforeRows.map((u) => ({ id: u.id, name: u.name, role: u.role })),
            after: afterRows.map((u) => ({ id: u.id, name: u.name, role: u.role })),
          });
        }
      } catch (e) {
        (result.steps as Array<Record<string, unknown>>).push({
          step: 'tenant-user',
          status: 'error',
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    // ─── Step 3: Tenant DB — set promoted user as reporting manager ───
    if (tenantDb && rmOf) {
      try {
        // Find the promoted user's Employee.id (they will become the manager)
        const mgrRows = await tenantDb.$queryRaw<Array<{ id: string; employeeId: string; email: string; firstName: string; lastName: string }>>`
          SELECT id, "employeeId", email, "firstName", "lastName" FROM "Employee" WHERE email = ${email} LIMIT 1
        `;
        const mgr = mgrRows[0];
        if (!mgr) {
          (result.steps as Array<Record<string, unknown>>).push({
            step: 'reporting-manager',
            status: 'manager_employee_not_found',
            email,
          });
        } else {
          // Find the report's Employee row (the person who will report to the manager)
          const repRows = await tenantDb.$queryRaw<Array<{ id: string; employeeId: string; email: string; firstName: string; lastName: string; reportingManagerId: string | null }>>`
            SELECT id, "employeeId", email, "firstName", "lastName", "reportingManagerId" FROM "Employee" WHERE email = ${rmOf} LIMIT 1
          `;
          const rep = repRows[0];
          if (!rep) {
            (result.steps as Array<Record<string, unknown>>).push({
              step: 'reporting-manager',
              status: 'report_employee_not_found',
              email: rmOf,
            });
          } else {
            await tenantDb.$executeRaw`
              UPDATE "Employee" SET "reportingManagerId" = ${mgr.id} WHERE email = ${rmOf}
            `;
            // Verify via JOIN
            const verifyRows = await tenantDb.$queryRaw<Array<{ empCode: string; empFirst: string; empEmail: string; mgrFirst: string; mgrLast: string; mgrEmail: string }>>`
              SELECT e."employeeId" AS "empCode", e."firstName" AS "empFirst", e.email AS "empEmail",
                     m."firstName" AS "mgrFirst", m."lastName" AS "mgrLast", m.email AS "mgrEmail"
              FROM "Employee" e
              LEFT JOIN "Employee" m ON m.id = e."reportingManagerId"
              WHERE e.email = ${rmOf}
              LIMIT 1
            `;
            (result.steps as Array<Record<string, unknown>>).push({
              step: 'reporting-manager',
              status: 'updated',
              before: { reportingManagerId: rep.reportingManagerId },
              after: { reportingManagerId: mgr.id },
              manager: { id: mgr.id, employeeId: mgr.employeeId, email: mgr.email, name: `${mgr.firstName} ${mgr.lastName}`.trim() },
              report: { id: rep.id, employeeId: rep.employeeId, email: rep.email, name: `${rep.firstName} ${rep.lastName}`.trim() },
              verify: verifyRows[0] || null,
            });
          }
        }
      } catch (e) {
        (result.steps as Array<Record<string, unknown>>).push({
          step: 'reporting-manager',
          status: 'error',
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return NextResponse.json(result, { status: 200, headers: corsHeaders() });
  } catch (error) {
    console.error('[promote-tenant-admin] error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500, headers: corsHeaders() }
    );
  }
}
