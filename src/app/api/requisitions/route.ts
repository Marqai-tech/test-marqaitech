import { NextResponse } from 'next/server';
import { getDb, getPlatformDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { createNotification, sendNotificationEmail } from '@/lib/notifications';
import { isSuperAdminWithoutScope } from '@/lib/superAdminGuard';
import type { PrismaClient } from '@/generated/prisma/client';

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

// Task 164 fix: pass db as parameter (was referencing out-of-scope db variable)
async function generateRequisitionId(db: PrismaClient): Promise<string> {
  try {
    const lastReq = await db.requisition.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { requisitionId: true },
    });
    let nextNum = 1;
    if (lastReq && lastReq.requisitionId) {
      const match = lastReq.requisitionId.match(/REQ-(\d+)/);
      if (match) nextNum = parseInt(match[1]) + 1;
    }
    return `REQ-${nextNum.toString().padStart(4, '0')}`;
  } catch {
    return `REQ-${Date.now().toString().slice(-6)}`;
  }
}

// Task 164: roles that can approve at each tier
const HR_ROLES = ['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_admin', 'company_hr_admin'];
const FINANCE_ROLES = ['super_admin', 'tenant_admin', 'ceo', 'admin', 'finance_admin'];

export async function GET(request: Request) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const companyId = searchParams.get('companyId');
    const tenantId = searchParams.get('tenantId');
    const departmentId = searchParams.get('departmentId');
    const approvalStatus = searchParams.get('approvalStatus');
    const status = searchParams.get('status');
    const priority = searchParams.get('priority');
    const scope = searchParams.get('scope'); // 'mine' = my requests only

    if (isSuperAdminWithoutScope(decoded, companyId, tenantId, request)) {
      return NextResponse.json({ requisitions: [], pagination: { page, limit, total: 0, totalPages: 0 } }, { headers: corsHeaders() });
    }

    const where: Record<string, unknown> = {};
    if (companyId) where.companyId = companyId;
    if (departmentId) where.departmentId = departmentId;
    if (approvalStatus) where.approvalStatus = approvalStatus;
    if (status) where.status = status;
    if (priority) where.priority = priority;
    // Task 164: 'mine' filter — Manager can track their own requests
    if (scope === 'mine' && decoded.userId) {
      where.hiringManagerId = decoded.userId;
    }

    const [requisitions, total] = await Promise.all([
      db.requisition.findMany({
        where,
        include: {
          department: { select: { id: true, name: true, code: true } },
          designation: { select: { id: true, title: true, level: true } },
          company: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.requisition.count({ where }),
    ]);

    return NextResponse.json({ requisitions, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Get requisitions error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

export async function POST(request: Request) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });

    const body = await request.json();
    const {
      companyId, branchId, departmentId, designationId,
      positionType, replacementEmployeeId, numberOfOpenings, employmentType,
      skillsRequired, experienceRequired, qualification, salaryBudget,
      projectId, clientId, priority, expectedJoiningDate,
      reason, // Task 164: reason/justification for hiring
      action, // Task 164: 'draft' | 'submit' (default: 'submit')
      positionTitle, // Task 167: raw position name (e.g. "Data Engineer 2")
    } = body;

    if (!departmentId) {
      return NextResponse.json({ error: 'Missing required field: departmentId' }, { status: 400, headers: corsHeaders() });
    }

    // Task 167 fix: resolve companyId + departmentId from names to IDs if needed.
    // The frontend sends user.tenantId as companyId (which is the tenant ID, not
    // a company ID) and the user types department/designation names (not IDs).
    // We need to resolve these to valid FK IDs before creating the Requisition.
    let resolvedCompanyId = companyId;
    let resolvedDepartmentId = departmentId;
    let resolvedDesignationId = designationId;

    // Resolve companyId: if it looks like a tenant ID (not a company ID),
    // find the first company for this tenant.
    if (resolvedCompanyId) {
      const isCompanyId = await db.$queryRawUnsafe(
        `SELECT "id" FROM "Company" WHERE "id" = $1 LIMIT 1`, resolvedCompanyId,
      ).catch(() => []) as any[];
      if (isCompanyId.length === 0) {
        // It's not a valid company ID — find the employee's company
        const empRows = await db.$queryRawUnsafe(
          `SELECT "companyId" FROM "Employee" WHERE "userId" = $1 LIMIT 1`, decoded.userId,
        ).catch(() => []) as any[];
        if (empRows[0]?.companyId) {
          resolvedCompanyId = empRows[0].companyId;
        } else {
          // Fall back to first company in the tenant DB
          const firstCompany = await db.$queryRawUnsafe(
            `SELECT "id" FROM "Company" LIMIT 1`,
          ).catch(() => []) as any[];
          if (firstCompany[0]?.id) resolvedCompanyId = firstCompany[0].id;
        }
      }
    } else {
      // No companyId provided — find from employee record
      const empRows = await db.$queryRawUnsafe(
        `SELECT "companyId" FROM "Employee" WHERE "userId" = $1 LIMIT 1`, decoded.userId,
      ).catch(() => []) as any[];
      if (empRows[0]?.companyId) {
        resolvedCompanyId = empRows[0].companyId;
      } else {
        const firstCompany = await db.$queryRawUnsafe(
          `SELECT "id" FROM "Company" LIMIT 1`,
        ).catch(() => []) as any[];
        if (firstCompany[0]?.id) resolvedCompanyId = firstCompany[0].id;
      }
    }

    if (!resolvedCompanyId) {
      return NextResponse.json({ error: 'Could not resolve company. Please contact admin.' }, { status: 400, headers: corsHeaders() });
    }

    // Resolve departmentId: if it's a name (not a CUID), look it up or create it
    if (resolvedDepartmentId && !resolvedDepartmentId.startsWith('cm')) {
      const deptRows = await db.$queryRawUnsafe(
        `SELECT "id" FROM "Department" WHERE LOWER("name") = LOWER($1) LIMIT 1`,
        resolvedDepartmentId,
      ).catch(() => []) as any[];
      if (deptRows[0]?.id) {
        resolvedDepartmentId = deptRows[0].id;
      } else {
        // No matching department — create a new one with the typed name
        // (per user request: "if no dropdowns, whatever we provide should be taken")
        const newDeptId = `cm${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
        try {
          await db.$executeRawUnsafe(
            `INSERT INTO "Department" ("id", "name", "companyId") VALUES ($1, $2, $3)`,
            newDeptId, resolvedDepartmentId, resolvedCompanyId,
          );
          resolvedDepartmentId = newDeptId;
        } catch (createErr) {
          // If create fails (e.g. missing columns), fall back to first available department
          const firstDept = await db.$queryRawUnsafe(
            `SELECT "id" FROM "Department" WHERE "companyId" = $1 LIMIT 1`, resolvedCompanyId,
          ).catch(() => []) as any[];
          if (firstDept[0]?.id) resolvedDepartmentId = firstDept[0].id;
        }
      }
    }

    // Resolve designationId: if it's a name (not a CUID), look it up or create it
    if (resolvedDesignationId && !resolvedDesignationId.startsWith('cm')) {
      const desigRows = await db.$queryRawUnsafe(
        `SELECT "id" FROM "Designation" WHERE LOWER("title") = LOWER($1) LIMIT 1`,
        resolvedDesignationId,
      ).catch(() => []) as any[];
      if (desigRows[0]?.id) {
        resolvedDesignationId = desigRows[0].id;
      } else {
        // No matching designation — create a new one with the typed title
        const newDesigId = `cm${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
        try {
          await db.$executeRawUnsafe(
            `INSERT INTO "Designation" ("id", "title") VALUES ($1, $2)`,
            newDesigId, resolvedDesignationId,
          );
          resolvedDesignationId = newDesigId;
        } catch (createErr) {
          // If create fails, leave it null (designation is optional)
          resolvedDesignationId = null;
        }
      }
    }

    const requisitionId = await generateRequisitionId(db);

    // Task 167: ensure positionTitle column exists at runtime
    try {
      await db.$executeRawUnsafe(`ALTER TABLE "Requisition" ADD COLUMN IF NOT EXISTS "positionTitle" TEXT`);
    } catch { /* already exists */ }

    // Task 164: draft vs submit
    const isDraft = action === 'draft';
    const approvalStatus = isDraft ? 'draft' : 'pending';

    const requisition = await db.requisition.create({
      data: {
        requisitionId,
        companyId: resolvedCompanyId,
        branchId,
        departmentId: resolvedDepartmentId,
        designationId: resolvedDesignationId,
        hiringManagerId: decoded.userId as string,
        positionType: positionType || 'new',
        replacementEmployeeId,
        numberOfOpenings: numberOfOpenings ?? 1,
        employmentType: employmentType || 'full-time',
        skillsRequired,
        experienceRequired,
        qualification,
        salaryBudget,
        projectId,
        clientId,
        priority: priority || 'medium',
        expectedJoiningDate: expectedJoiningDate ? new Date(expectedJoiningDate) : null,
        approvalStatus,
        status: isDraft ? 'draft' : 'open',
      },
      include: {
        department: { select: { id: true, name: true } },
        designation: { select: { id: true, title: true } },
      },
    }).catch(async (err) => {
      // Fallback to RAW SQL if Prisma fails (schema drift)
      console.warn('[Requisitions POST] Prisma create failed, trying RAW SQL:', err instanceof Error ? err.message : err);
      const id = `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await db.$executeRawUnsafe(
        `INSERT INTO "Requisition" ("id", "requisitionId", "companyId", "branchId", "departmentId", "designationId",
          "hiringManagerId", "positionType", "replacementEmployeeId", "numberOfOpenings", "employmentType",
          "skillsRequired", "experienceRequired", "qualification", "salaryBudget", "projectId", "clientId",
          "priority", "expectedJoiningDate", "approvalStatus", "status", "positionTitle", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, NOW(), NOW())`,
        id, requisitionId, resolvedCompanyId, branchId || null, resolvedDepartmentId, resolvedDesignationId || null,
        decoded.userId, positionType || 'new', replacementEmployeeId || null, numberOfOpenings ?? 1, employmentType || 'full-time',
        skillsRequired || null, experienceRequired || null, qualification || null, salaryBudget || null,
        projectId || null, clientId || null, priority || 'medium',
        expectedJoiningDate ? new Date(expectedJoiningDate) : null,
        approvalStatus, isDraft ? 'draft' : 'open', positionTitle || null
      );
      return { id, requisitionId, ...body, positionTitle, department: { name: departmentId }, designation: { title: positionTitle || designationId || '' } };
    });

    await db.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: isDraft ? 'CREATE_REQUISITION_DRAFT' : 'CREATE_REQUISITION',
        module: 'requisitions',
        details: `${isDraft ? 'Drafted' : 'Submitted'} requisition ${requisitionId}${reason ? ` — ${reason}` : ''}`,
      },
    }).catch(() => null);

    // Task 164: notify HR on submit (NOT on draft)
    if (!isDraft && decoded.tenantId) {
      try {
        const { dispatchNotification } = await import('@/lib/notification-center');
        // Find HR users to notify
        const hrUsers = await db.user.findMany({
          where: { role: { in: HR_ROLES }, status: 'active' },
          select: { id: true, email: true },
        }).catch(() => []);
        if (hrUsers.length > 0) {
          await dispatchNotification({
            tenantId: decoded.tenantId as string,
            module: 'recruitment',
            eventKey: 'recruitment.requisition.submitted',
            recipients: hrUsers.map((u: { id: string }) => ({ userId: u.id })),
            vars: {
              Requisition_Title: `${requisition.designation?.title || 'Position'} (${requisitionId})`,
              Department: requisition.department?.name || '—',
              Requested_By: decoded.name || decoded.email || 'Manager',
              Openings: String(numberOfOpenings ?? 1),
            },
            entity: { type: 'requisition', id: requisition.id, link: `/requisitions` },
            origin: request.headers.get('origin') || undefined,
          }).catch(() => null);
        }
      } catch (e) {
        console.warn('[requisitions] HR notification failed (non-fatal):', (e as Error).message);
      }
    }

    return NextResponse.json({ requisition }, { status: 201, headers: corsHeaders() });
  } catch (error) {
    console.error('Create requisition error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
