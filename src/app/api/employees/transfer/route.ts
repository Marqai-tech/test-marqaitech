import { NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { createNotification, sendNotificationEmail } from '@/lib/notifications';
import { loadEmployeeSetting } from '@/lib/employee-config';
import { sanitizeMultiLineText } from '@/lib/sanitize';
import { buildBrandedEmailForTenant } from '@/lib/tenant-branding';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

async function ensureTransferSchema(db: any) {
  const statements = [
    `ALTER TABLE "Transfer" ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT`,
    `ALTER TABLE "Transfer" ADD COLUMN IF NOT EXISTS "decisionDate" TIMESTAMP(3)`,
    `ALTER TABLE "Transfer" ADD COLUMN IF NOT EXISTS "approverId" TEXT`,
    `ALTER TABLE "Transfer" ADD COLUMN IF NOT EXISTS "notificationHistory" JSONB`,
    `ALTER TABLE "Transfer" ADD COLUMN IF NOT EXISTS "approvalHistory" JSONB`,
    `ALTER TABLE "Transfer" ADD COLUMN IF NOT EXISTS "currentApprovalLevel" INTEGER NOT NULL DEFAULT 0`,
    `CREATE INDEX IF NOT EXISTS "Transfer_employee_pending_idx" ON "Transfer"("employeeId", "status")`,
  ];
  for (const sql of statements) { try { await db.$executeRawUnsafe(sql); } catch { /* older databases are upgraded lazily */ } }
}

async function notifyTransfer(db: any, tenantId: string, userId: string | null, email: string | null, title: string, message: string, link = '/employees/transfer') {
  const withTimeout = <T>(promise: Promise<T>, fallback: T) => Promise.race([
    promise,
    new Promise<T>(resolve => setTimeout(() => resolve(fallback), 2500)),
  ]);
  const inApp = userId ? await withTimeout(createNotification({ tenantId, userId, title, message, type: 'info', category: 'workflow', link }).catch(() => null), null) : null;
  // Task 161: use sendNotificationEmail so isEmailSent is updated on success
  let emailSent = false;
  if (email && inApp?.id) {
    emailSent = await withTimeout((async () => {
      try {
        const html = await buildBrandedEmailForTenant(tenantId, { title, bodyText: message });
        return await sendNotificationEmail(db, tenantId, inApp, email, title, html);
      } catch { return false; }
    })().catch(() => false), false);
  }
  return { userId, email, inApp: !!inApp, emailSent };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

/**
 * GET /api/employees/transfer
 *
 * Returns transfer request records. Stored in the `Transfer` table
 * (auto-created via inline schema-sync on first call).
 *
 * Query params:
 *   ?employeeId=<id>  — filter by employee
 *   ?status=<status>  — filter by status (pending, approved, rejected, cancelled)
 *   ?page=<n>         — pagination (default 1)
 *   ?limit=<n>        — page size (default 20)
 */
export async function GET(request: Request) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const employeeId = searchParams.get('employeeId');
    const status = searchParams.get('status');

    // ─── Inline schema-sync for Transfer table ───
    try {
      const syncStatements = [
        `CREATE TABLE IF NOT EXISTS "Transfer" ("id" TEXT NOT NULL, "employeeId" TEXT NOT NULL, "fromDepartmentId" TEXT, "toDepartmentId" TEXT, "fromDesignationId" TEXT, "toDesignationId" TEXT, "fromBranchId" TEXT, "toBranchId" TEXT, "transferDate" TIMESTAMP(3), "transferType" TEXT, "reason" TEXT, "reportingManagerId" TEXT, "comments" TEXT, "status" TEXT NOT NULL DEFAULT 'pending', "submittedById" TEXT, "approvedById" TEXT, "approvedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(), CONSTRAINT "Transfer_pkey" PRIMARY KEY ("id"))`,
        `CREATE INDEX IF NOT EXISTS "Transfer_employeeId_idx" ON "Transfer"("employeeId")`,
        `CREATE INDEX IF NOT EXISTS "Transfer_status_idx" ON "Transfer"("status")`,
      ];
      for (const sql of syncStatements) {
        try { await db.$executeRawUnsafe(sql); } catch { /* already exists */ }
      }
    } catch { /* non-fatal */ }

    // Build raw SQL query (more reliable than Prisma across tenant DBs that may
    // not have the Transfer model in their generated client)
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (employeeId) {
      params.push(employeeId);
      conditions.push(`"employeeId" = $${params.length}`);
    }
    if (status) {
      params.push(status);
      conditions.push(`"status" = $${params.length}`);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count total
    let total = 0;
    try {
      const countRows = await db.$queryRawUnsafe(
        `SELECT COUNT(*)::int AS count FROM "Transfer" ${whereClause}`,
        ...params,
      ) as any[];
      total = countRows?.[0]?.count || 0;
    } catch (err) {
      console.error('[Transfer GET] count failed:', err);
    }

    // Fetch rows with employee + department + designation join
    let rows: any[] = [];
    try {
      const offset = (page - 1) * limit;
      const queryParams = [...params, limit, offset];
      rows = await db.$queryRawUnsafe(
        `SELECT t.*,
           e."firstName" AS "employeeFirstName",
           e."lastName"  AS "employeeLastName",
           e."employeeId" AS "employeeCode",
           fd."name" AS "fromDepartmentName",
           td."name" AS "toDepartmentName",
           fdes."title" AS "fromDesignationTitle",
           tdes."title" AS "toDesignationTitle",
           fb."name" AS "fromBranchName",
           tb."name" AS "toBranchName"
         FROM "Transfer" t
         LEFT JOIN "Employee" e ON e."id" = t."employeeId"
         LEFT JOIN "Department" fd ON fd."id" = t."fromDepartmentId"
         LEFT JOIN "Department" td ON td."id" = t."toDepartmentId"
         LEFT JOIN "Designation" fdes ON fdes."id" = t."fromDesignationId"
         LEFT JOIN "Designation" tdes ON tdes."id" = t."toDesignationId"
         LEFT JOIN "Branch" fb ON fb."id" = t."fromBranchId"
         LEFT JOIN "Branch" tb ON tb."id" = t."toBranchId"
         ${whereClause}
         ORDER BY t."createdAt" DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        ...queryParams,
      ) as any[];
    } catch (err) {
      console.error('[Transfer GET] query failed:', err);
      return NextResponse.json({
        transfers: [],
        pagination: { page, limit, total: 0, totalPages: 0 },
      }, { headers: corsHeaders() });
    }

    // Map rows to the TransferRecord shape expected by the UI
    const transfers = rows.map((r: any) => ({
      id: r.id,
      employeeId: r.employeeId,
      employeeName: `${r.employeeFirstName || ''} ${r.employeeLastName || ''}`.trim() || 'Unknown',
      employeeCode: r.employeeCode || '—',
      fromDepartment: r.fromDepartmentName || '—',
      toDepartment: r.toDepartmentName || '—',
      fromDesignation: r.fromDesignationTitle || '—',
      toDesignation: r.toDesignationTitle || '—',
      fromLocation: r.fromBranchName || '—',
      toLocation: r.toBranchName || '—',
      transferDate: r.transferDate,
      transferType: r.transferType || 'permanent',
      reason: r.reason || '',
      status: r.status,
      comments: r.comments || '',
      reportingManagerId: r.reportingManagerId || null,
      approverId: r.approverId || r.approvedById || null,
      decisionDate: r.decisionDate || r.approvedAt || null,
      rejectionReason: r.rejectionReason || null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));

    return NextResponse.json(
      { transfers, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } },
      { headers: corsHeaders() }
    );
  } catch (error) {
    console.error('Get transfers error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders() }
    );
  }
}

/**
 * POST /api/employees/transfer
 *
 * Creates a transfer request record. Status starts as 'pending' and
 * requires HR/Admin approval before the employee's department/designation/branch
 * are actually updated.
 *
 * Side effects:
 *   1. Insert row into Transfer table
 *   2. Send notification to HR/Admin users in the same tenant
 *   3. Create audit log entry
 */
export async function POST(request: Request) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });

    const body = await request.json();
    const configuredTransfer = await loadEmployeeSetting(db as Record<string, any>, request, 'employee_transfer_config', {
      enabled: true,
      defaultTransferType: 'permanent',
      approvalRoles: ['tenant_admin', 'ceo', 'admin'],
      notifyReportingManager: true,
    });
    // Merge defaults for older partial tenant settings. Missing `enabled`
    // must not turn a previously configured workflow off.
    Object.assign(configuredTransfer as Record<string, any>, {
      enabled: true,
      defaultTransferType: 'permanent',
      approvalRoles: ['tenant_admin', 'ceo', 'admin'],
      notifyReportingManager: true,
    }, configuredTransfer);
    if (!configuredTransfer.enabled) return NextResponse.json({ error: 'Employee transfers are disabled in Employee Settings' }, { status: 409, headers: corsHeaders() });
    const {
      employeeId,
      currentDepartment,
      currentDesignation,
      currentLocation,
      newDepartment,
      newDesignation,
      newLocation,
      transferDate,
      transferType,
      reason,
      reportingManager,
      comments,
    } = body;

    if (!employeeId) {
      return NextResponse.json(
        { error: 'Employee ID is required' },
        { status: 400, headers: corsHeaders() }
      );
    }
    if (!newDepartment) {
      return NextResponse.json(
        { error: 'New Department is required' },
        { status: 400, headers: corsHeaders() }
      );
    }
    if (!reportingManager) {
      return NextResponse.json(
        { error: 'Please select a Reporting Manager before submitting the transfer request.' },
        { status: 400, headers: corsHeaders() }
      );
    }
    const employee = await db.employee.findUnique({ where: { id: employeeId }, select: { id: true, firstName: true, lastName: true, email: true, userId: true, reportingManagerId: true } });
    if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404, headers: corsHeaders() });
    const manager = await db.employee.findUnique({ where: { id: reportingManager }, select: { id: true } }).catch(() => null);
    if (!manager) return NextResponse.json({ error: 'Selected Reporting Manager is invalid.' }, { status: 400, headers: corsHeaders() });

    // ─── Inline schema-sync for Transfer table ───
    try {
      const syncStatements = [
        `CREATE TABLE IF NOT EXISTS "Transfer" ("id" TEXT NOT NULL, "employeeId" TEXT NOT NULL, "fromDepartmentId" TEXT, "toDepartmentId" TEXT, "fromDesignationId" TEXT, "toDesignationId" TEXT, "fromBranchId" TEXT, "toBranchId" TEXT, "transferDate" TIMESTAMP(3), "transferType" TEXT, "reason" TEXT, "reportingManagerId" TEXT, "comments" TEXT, "status" TEXT NOT NULL DEFAULT 'pending', "submittedById" TEXT, "approvedById" TEXT, "approvedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(), CONSTRAINT "Transfer_pkey" PRIMARY KEY ("id"))`,
        `CREATE INDEX IF NOT EXISTS "Transfer_employeeId_idx" ON "Transfer"("employeeId")`,
        `CREATE INDEX IF NOT EXISTS "Transfer_status_idx" ON "Transfer"("status")`,
      ];
      for (const sql of syncStatements) {
        try { await db.$executeRawUnsafe(sql); } catch { /* already exists */ }
      }
    } catch { /* non-fatal */ }
    await ensureTransferSchema(db);

    const pending = await db.$queryRawUnsafe(`SELECT "id" FROM "Transfer" WHERE "employeeId" = $1 AND "status" = 'pending' LIMIT 1`, employeeId) as any[];
    if (pending?.length) {
      return NextResponse.json({ error: 'An active transfer request is already pending for this employee.' }, { status: 409, headers: corsHeaders() });
    }

    const transferId = `trf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const submittedById = decoded.userId as string;

    // Insert the transfer record
    try {
      await db.$executeRawUnsafe(
        `INSERT INTO "Transfer"
           ("id", "employeeId", "fromDepartmentId", "toDepartmentId",
            "fromDesignationId", "toDesignationId", "fromBranchId", "toBranchId",
            "transferDate", "transferType", "reason", "reportingManagerId",
            "comments", "status", "submittedById", "createdAt", "updatedAt")
         VALUES
           ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'pending', $14, NOW(), NOW())`,
        transferId,
        employeeId,
        currentDepartment || null,
        newDepartment,
        currentDesignation || null,
        newDesignation || null,
        currentLocation || null,
        newLocation || null,
        transferDate ? new Date(transferDate) : new Date(),
        transferType || configuredTransfer.defaultTransferType,
        sanitizeMultiLineText(reason, 2000) || null,
        reportingManager || null,
        sanitizeMultiLineText(comments, 5000) || null,
        submittedById,
      );
    } catch (insertErr) {
      console.error('[Transfer POST] insert failed:', insertErr);
      return NextResponse.json(
        { error: 'Failed to create transfer record', details: String(insertErr) },
        { status: 500, headers: corsHeaders() }
      );
    }

    // Fetch the inserted row + employee info for the response
    let transferRow: any = null;
    try {
      const rows = await db.$queryRawUnsafe(
        `SELECT t.*, e."firstName", e."lastName", e."employeeId" AS "employeeCode"
         FROM "Transfer" t
         LEFT JOIN "Employee" e ON e."id" = t."employeeId"
         WHERE t."id" = $1`,
        transferId,
      ) as any[];
      if (rows?.[0]) transferRow = rows[0];
    } catch { /* non-critical */ }

    // Send notifications to HR/Admin users in the tenant
    try {
      // Find HR/Admin users (role: tenant_admin, admin) in the same tenant
      const tenantId = (decoded as any).tenantId;
      if (tenantId) {
        const adminUsers = await db.user.findMany({
          where: {
            tenantId,
            role: { in: configuredTransfer.approvalRoles },
            status: 'active',
          },
          select: { id: true, email: true },
        }).catch(() => []);

        const empName = transferRow ? `${transferRow.firstName || ''} ${transferRow.lastName || ''}`.trim() : 'an employee';
        for (const admin of adminUsers) {
          const notif = await createNotification({
            tenantId,
            userId: admin.id,
            title: 'New Transfer Request Submitted',
            message: `A transfer request has been submitted for ${empName}. Please review and approve/reject.`,
            type: 'info',
            category: 'employee_lifecycle',
            link: '/employees/transfer',
          }).catch(() => null);
          if (admin.email && notif?.id) {
            try {
              const html = await buildBrandedEmailForTenant(tenantId, {
                title: 'New Transfer Request Submitted',
                bodyText: `A transfer request has been submitted for ${empName}. Please review it in Employee > Transfer.`,
              });
              await sendNotificationEmail(db, tenantId, notif, admin.email, 'New Transfer Request Submitted', html);
            } catch { /* non-fatal */ }
          }
        }
      }
    } catch (e) {
      console.error('[Transfer POST] notification failed:', e);
    }

    // Notify the employee's reporting manager if specified
    try {
      if (reportingManager && configuredTransfer.notifyReportingManager) {
        const tenantId = (decoded as any).tenantId;
        if (tenantId) {
          await createNotification({
            tenantId,
            userId: reportingManager,
            title: 'Transfer Request Requires Your Review',
            message: `A transfer request has been submitted for an employee reporting to you. Please review.`,
            type: 'info',
            category: 'employee_lifecycle',
            link: '/employees/transfer',
          }).catch(() => {});
        }
      }
    } catch (e) {
      console.error('[Transfer POST] manager notification failed:', e);
    }

    // Audit log
    try {
      await db.auditLog.create({
        data: {
          userId: submittedById,
          action: 'CREATE_TRANSFER_REQUEST',
          module: 'employees',
          details: `Created transfer request for employee ${employeeId} → dept ${newDepartment}, desg ${newDesignation || 'N/A'}, branch ${newLocation || 'N/A'}`,
        },
      });
    } catch { /* non-critical */ }

    if (employee.userId || employee.email) {
      await notifyTransfer(db, String((decoded as any).tenantId || ''), employee.userId, employee.email,
        'Transfer Request Submitted',
        `Your transfer request for ${new Date(transferDate || new Date()).toLocaleDateString('en-IN')} was submitted and is pending approval.`).catch(() => {});
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Transfer request submitted successfully. HR/Admin has been notified for approval.',
        transfer: {
          id: transferId,
          employeeId,
          employeeName: transferRow ? `${transferRow.firstName || ''} ${transferRow.lastName || ''}`.trim() : '',
          employeeCode: transferRow?.employeeCode || '',
          fromDepartment: currentDepartment || null,
          toDepartment: newDepartment,
          transferDate,
          transferType: transferType || configuredTransfer.defaultTransferType,
          reason: reason || '',
          status: 'pending',
          createdAt: new Date().toISOString(),
        },
      },
      { status: 201, headers: corsHeaders() }
    );
  } catch (error) {
    console.error('Create transfer error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500, headers: corsHeaders() }
    );
  }
}

/** Approve or reject a pending transfer. Employee data is changed only on approval. */
export async function PATCH(request: Request) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    const decoded = token ? await verifyToken(token) : null;
    if (!decoded) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    const body = await request.json();
    const transferId = String(body.transferId || body.id || '');
    const action = String(body.action || '').toLowerCase();
    const rejectionReason = sanitizeMultiLineText(body.rejectionReason || body.reason, 2000);
    if (!transferId || !['approve', 'reject'].includes(action)) return NextResponse.json({ error: 'transferId and action (approve/reject) are required' }, { status: 400, headers: corsHeaders() });
    if (action === 'reject' && !rejectionReason) return NextResponse.json({ error: 'A rejection reason is required.' }, { status: 400, headers: corsHeaders() });
    await ensureTransferSchema(db);

    const actorId = String((decoded as any).userId);
    const role = String((decoded as any).role || '');
    const configured = await loadEmployeeSetting(db as Record<string, any>, request, 'employee_transfer_config', { approvalRoles: ['tenant_admin', 'ceo', 'admin'] });
    const approvalRoles = Array.isArray(configured.approvalRoles) && configured.approvalRoles.length ? configured.approvalRoles : ['tenant_admin', 'ceo', 'admin'];
    const rows = await db.$queryRawUnsafe(`SELECT t.*, e."firstName", e."lastName", e."email", e."userId" AS "employeeUserId" FROM "Transfer" t LEFT JOIN "Employee" e ON e."id"=t."employeeId" WHERE t."id"=$1 LIMIT 1`, transferId) as any[];
    const transfer = rows?.[0];
    if (!transfer) return NextResponse.json({ error: 'Transfer request not found.' }, { status: 404, headers: corsHeaders() });
    if (transfer.status !== 'pending') return NextResponse.json({ error: `Transfer request is already ${transfer.status}.` }, { status: 409, headers: corsHeaders() });
    const approvalLevel = Number(transfer.currentApprovalLevel || 0);
    const expectedRole = approvalRoles[approvalLevel] || approvalRoles[approvalRoles.length - 1];
    if (role !== 'super_admin' && role !== expectedRole) return NextResponse.json({ error: `This request is awaiting approval from role: ${expectedRole}.` }, { status: 403, headers: corsHeaders() });

    const decisionDate = new Date();
    const approvalHistory = Array.isArray(transfer.approvalHistory) ? transfer.approvalHistory : [];
    approvalHistory.push({ action, actorId, role, level: approvalLevel, decisionDate: decisionDate.toISOString(), rejectionReason: rejectionReason || null });
    if (action === 'approve' && approvalLevel < approvalRoles.length - 1) {
      const nextRole = approvalRoles[approvalLevel + 1];
      await db.$executeRawUnsafe(`UPDATE "Transfer" SET "currentApprovalLevel"=$1, "approvalHistory"=$2::jsonb, "updatedAt"=NOW() WHERE "id"=$3`, approvalLevel + 1, JSON.stringify(approvalHistory), transferId);
      const tenantId = String((decoded as any).tenantId || '');
      const nextApprovers = await db.user.findMany({ where: { tenantId, role: nextRole, status: 'active' }, select: { id: true, email: true } }).catch(() => []);
      for (const next of nextApprovers) await notifyTransfer(db, tenantId, next.id, next.email, 'Transfer Request Awaiting Approval', `Transfer request for ${transfer.firstName || ''} ${transfer.lastName || ''} is awaiting your approval.`);
      await db.auditLog.create({ data: { userId: actorId, action: 'APPROVE_TRANSFER_LEVEL', module: 'employees', details: JSON.stringify({ transferId, employeeId: transfer.employeeId, level: approvalLevel, nextRole, decisionDate }) } }).catch(() => null);
      return NextResponse.json({ success: true, status: 'pending', transferId, approvalLevel: approvalLevel + 1, nextApproverRole: nextRole, decisionDate }, { headers: corsHeaders() });
    }
    if (action === 'approve') {
      // Task 160: the original tx.employee.update() inside the transaction
      // failed on tenant DBs with schema drift, which rolled back the ENTIRE
      // transaction (including the Transfer status='approved' UPDATE) —
      // leaving the request stuck in 'pending' forever. Fix: do the Employee
      // update OUTSIDE the transaction with a Prisma-first + RAW SQL
      // fallback (same pattern as Task 159), then run the Transfer status +
      // auditLog in a separate transaction. If the Employee update fails
      // completely, we still mark the Transfer 'approved' so the admin can
      // manually retry (matching the profile-update 'reapply' pattern).
      let employeeUpdateOk = false;
      try {
        try {
          await db.employee.update({
            where: { id: transfer.employeeId },
            data: {
              departmentId: transfer.toDepartmentId,
              designationId: transfer.toDesignationId,
              branchId: transfer.toBranchId,
              reportingManagerId: transfer.reportingManagerId,
            },
          });
          employeeUpdateOk = true;
        } catch (prismaErr) {
          console.warn('[Transfer PATCH] Prisma employee.update failed, trying RAW SQL fallback:', prismaErr instanceof Error ? prismaErr.message : prismaErr);
          // RAW SQL fallback — only update the non-null columns to avoid FK violations
          const sets: string[] = [];
          const params: unknown[] = [];
          let pIdx = 1;
          const cols: Array<[string, unknown]> = [
            ['departmentId', transfer.toDepartmentId],
            ['designationId', transfer.toDesignationId],
            ['branchId', transfer.toBranchId],
            ['reportingManagerId', transfer.reportingManagerId],
          ];
          for (const [col, val] of cols) {
            if (val !== null && val !== undefined) {
              sets.push(`"${col}" = $${pIdx++}`);
              params.push(val);
            } else {
              sets.push(`"${col}" = NULL`);
            }
          }
          params.push(transfer.employeeId);
          await db.$executeRawUnsafe(
            `UPDATE "Employee" SET ${sets.join(', ')}, "updatedAt" = NOW() WHERE "id" = $${pIdx}`,
            ...params,
          );
          employeeUpdateOk = true;
        }
      } catch (empErr) {
        console.error('[Transfer PATCH] Employee update failed (both Prisma + RAW SQL):', empErr);
      }

      // Mark Transfer status='approved' + audit log. Done in a transaction
      // so the Transfer status + auditLog are atomic. The Employee update
      // is already committed (or failed) above.
      await db.$transaction(async (tx: any) => {
        await tx.$executeRawUnsafe(`UPDATE "Transfer" SET "status"='approved', "approvedById"=$1, "approverId"=$1, "approvedAt"=$2, "decisionDate"=$2, "updatedAt"=NOW() WHERE "id"=$3`, actorId, decisionDate, transferId);
        await tx.auditLog.create({ data: { userId: actorId, action: 'APPROVE_TRANSFER_REQUEST', module: 'employees', details: JSON.stringify({ transferId, employeeId: transfer.employeeId, effectiveDate: transfer.transferDate, decisionDate, employeeUpdateOk }) } }).catch(() => null);
      });
    } else {
      await db.$executeRawUnsafe(`UPDATE "Transfer" SET "status"='rejected', "rejectionReason"=$1, "approvedById"=$2, "approverId"=$2, "approvedAt"=$3, "decisionDate"=$3, "updatedAt"=NOW() WHERE "id"=$4`, rejectionReason, actorId, decisionDate, transferId);
      await db.auditLog.create({ data: { userId: actorId, action: 'REJECT_TRANSFER_REQUEST', module: 'employees', details: JSON.stringify({ transferId, employeeId: transfer.employeeId, rejectionReason, decisionDate }) } }).catch(() => null);
    }
    const tenantId = String((decoded as any).tenantId || '');
    const employeeName = `${transfer.firstName || ''} ${transfer.lastName || ''}`.trim();
    const message = action === 'approve'
      ? `Your transfer request has been approved. Effective ${new Date(transfer.transferDate).toLocaleDateString('en-IN')}, your new department, designation, location, and Reporting Manager will be updated.`
      : `Your transfer request has been rejected. Reason: ${rejectionReason}`;
    const notification = await notifyTransfer(db, tenantId, transfer.employeeUserId, transfer.email, action === 'approve' ? 'Transfer Request Approved' : 'Transfer Request Rejected', message);
    await db.$executeRawUnsafe(`UPDATE "Transfer" SET "notificationHistory"=$1::jsonb, "approvalHistory"=$2::jsonb WHERE "id"=$3`, JSON.stringify([{ action, actorId, decisionDate: decisionDate.toISOString(), rejectionReason: rejectionReason || null, notification }]), JSON.stringify(approvalHistory), transferId).catch(() => null);
    return NextResponse.json({ success: true, status: action === 'approve' ? 'approved' : 'rejected', transferId, employeeName, decisionDate, rejectionReason: rejectionReason || null, notification }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Transfer decision error:', error);
    return NextResponse.json({ error: 'Failed to process transfer decision', details: error instanceof Error ? error.message : 'Unknown' }, { status: 500, headers: corsHeaders() });
  }
}
