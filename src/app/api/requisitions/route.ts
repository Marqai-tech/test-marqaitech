import { NextResponse } from 'next/server';
import { getDb, getPlatformDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { createNotification, sendNotificationEmail } from '@/lib/notifications';
import { isSuperAdminWithoutScope } from '@/lib/superAdminGuard';
import { resolveRequisitionConfig } from '@/lib/recruitment-workflow';
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

    // NEW-8/NEW-9: annotate each requisition with its next pending approval
    // tier + whether the current user can act on it — the UI renders
    // approve/return buttons from this (works for any tier count, not just
    // the legacy 2-tier statuses). Exact enforcement stays in the PATCH
    // handler of [id]/route.ts; this annotation is display-only.
    const STATUS_TO_TIER: Record<string, number> = { pending: 0, hr_approved: 1, tier_2_approved: 2, tier_3_approved: 3, tier_4_approved: 4, tier_5_approved: 5, tier_6_approved: 6, tier_7_approved: 7, tier_8_approved: 8, tier_9_approved: 9 };
    const LEGACY_TIERS = [
      { tier: 1, approverType: 'hr_admin', label: 'HR Approval' },
      { tier: 2, approverType: 'finance', label: 'Finance Approval' },
    ];
    let wfTiers: Array<{ tier: number; approverType: string; label?: string; approverUserId?: string | null }> | null = null;
    const hasActiveRows = (requisitions as any[]).some((r) => {
      const s = r.approvalStatus || 'pending';
      return !['draft', 'rejected', 'returned', 'budget_approved'].includes(s);
    });
    if (hasActiveRows) {
      try {
        const wfConfig: any = await resolveRequisitionConfig(db, decoded.tenantId as string | undefined, undefined).catch(() => null);
        wfTiers = wfConfig?.tiers || LEGACY_TIERS;
      } catch { wfTiers = LEGACY_TIERS; }
    }
    if (wfTiers) {
      // Resolve department heads once for department_head tiers
      const deptIds = Array.from(new Set((requisitions as any[]).filter((r) => r.departmentId).map((r) => r.departmentId)));
      const headUserByDept = new Map<string, string | null>();
      if (deptIds.length > 0) {
        try {
          const headRows = await db.$queryRawUnsafe(
            `SELECT d."id" AS "deptId", u."id" AS "userId" FROM "Department" d
               JOIN "Employee" e ON e."id" = d."headId"
               LEFT JOIN "User" u ON u."id" = e."userId"
              WHERE d."id" IN (${deptIds.map((_, i) => `$${i + 1}`).join(',')})`,
            ...deptIds,
          ) as any[];
          headRows.forEach((row: any) => headUserByDept.set(row.deptId, row.userId || null));
        } catch {}
      }
      const userRoleL = (decoded.role as string) || '';
      for (const r of requisitions as any[]) {
        const s = r.approvalStatus || 'pending';
        if (['draft', 'rejected', 'returned', 'budget_approved'].includes(s)) { r.nextTier = null; continue; }
        const idx = STATUS_TO_TIER[s] ?? 0;
        if (idx >= (wfTiers?.length || 0)) { r.nextTier = null; continue; }
        const tier = wfTiers![idx];
        let eligible = false;
        if (tier.approverType === 'reporting_manager') eligible = !!r.hiringManagerId && r.hiringManagerId === decoded.userId;
        else if (tier.approverType === 'department_head') {
          const headUserId = headUserByDept.get(r.departmentId) || null;
          // Real head approves; if the department has no head, HR roles may
          // (matches the PATCH fallback so buttons never deadlock).
          eligible = headUserId ? headUserId === decoded.userId : HR_ROLES.includes(userRoleL);
        }
        else if (tier.approverType === 'specific_user') eligible = !!tier.approverUserId && tier.approverUserId === decoded.userId;
        else if (tier.approverType === 'finance') eligible = FINANCE_ROLES.includes(userRoleL);
        else if (tier.approverType === 'hr_admin') eligible = HR_ROLES.includes(userRoleL);
        else if (tier.approverType === 'tenant_admin') eligible = ['super_admin', 'tenant_admin'].includes(userRoleL);
        else if (tier.approverType === 'ceo') eligible = ['super_admin', 'ceo'].includes(userRoleL);
        r.nextTier = { approverType: tier.approverType, label: tier.label || tier.approverType, eligible };
      }
    }

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
      interviewPlan,
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

    // ─── NEW-8: Department Manager enforcement (server-side, cannot be bypassed) ───
    // If the requester is the HEAD of a department (Department.headId → Employee),
    // the requisition department is FORCED to their own department and the
    // client-sent value cannot override it. The hiring manager stays the
    // requester (hiringManagerId = decoded.userId below).
    const managedDeptRows = await db.$queryRawUnsafe(
      `SELECT d."id", d."name" FROM "Department" d
         JOIN "Employee" e ON e."id" = d."headId"
        WHERE e."userId" = $1
        LIMIT 1`,
      decoded.userId,
    ).catch(() => []) as any[];
    const managedDepartment: { id: string; name: string } | null = managedDeptRows[0] || null;
    if (managedDepartment) {
      resolvedDepartmentId = managedDepartment.id;
    }

    let normalizedInterviewPlan: string | null = null;
    if (interviewPlan !== undefined && interviewPlan !== null && String(interviewPlan).trim()) {
      try {
        const parsed = typeof interviewPlan === 'string' ? JSON.parse(interviewPlan) : interviewPlan;
        if (!Array.isArray(parsed) || parsed.length === 0 || parsed.some((r: any) => !String(r?.name || '').trim() || !['technical', 'hr', 'ai', 'client'].includes(r?.type))) {
          return NextResponse.json({ error: 'Interview plan must contain at least one round with a name and valid type.' }, { status: 400, headers: corsHeaders() });
        }
        normalizedInterviewPlan = JSON.stringify(parsed.map((r: any, i: number) => ({ sequence: i + 1, name: String(r.name).trim(), type: r.type })));
      } catch {
        return NextResponse.json({ error: 'Interview plan must be valid JSON.' }, { status: 400, headers: corsHeaders() });
      }
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

    // ─── NEW-8: managed-department position guard ───
    // A department manager may only request positions (designations) that
    // belong to their own department.
    if (managedDepartment && resolvedDesignationId) {
      const desigDeptRows = await db.$queryRawUnsafe(
        `SELECT "departmentId" FROM "Designation" WHERE "id" = $1 LIMIT 1`,
        resolvedDesignationId,
      ).catch(() => []) as any[];
      if (desigDeptRows[0]?.departmentId && desigDeptRows[0].departmentId !== managedDepartment.id) {
        return NextResponse.json({ error: 'Position/Designation must belong to your own department.' }, { status: 403, headers: corsHeaders() });
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
        // Phase 3 fix: persist positionTitle and reason (were only in SQL fallback)
        positionTitle: positionTitle || null,
        reason: reason || null,
        interviewPlan: normalizedInterviewPlan,
      } as any, // cast to any to allow optional fields not in the Prisma schema yet
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
          "priority", "expectedJoiningDate", "approvalStatus", "status", "positionTitle", "interviewPlan", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, NOW(), NOW())`,
        id, requisitionId, resolvedCompanyId, branchId || null, resolvedDepartmentId, resolvedDesignationId || null,
        decoded.userId, positionType || 'new', replacementEmployeeId || null, numberOfOpenings ?? 1, employmentType || 'full-time',
        skillsRequired || null, experienceRequired || null, qualification || null, salaryBudget || null,
        projectId || null, clientId || null, priority || 'medium',
        expectedJoiningDate ? new Date(expectedJoiningDate) : null,
        approvalStatus, isDraft ? 'draft' : 'open', positionTitle || null, normalizedInterviewPlan
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
