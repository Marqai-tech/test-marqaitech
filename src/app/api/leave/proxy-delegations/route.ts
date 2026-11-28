import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

/**
 * Ensures the LeaveProxyDelegation table exists with all required columns.
 * Called on every request (idempotent — IF NOT EXISTS).
 */
async function ensureProxyTable(db: any) {
  try {
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "LeaveProxyDelegation" (
        "id" TEXT NOT NULL,
        "tenantId" TEXT NOT NULL,
        "approverId" TEXT NOT NULL,
        "proxyId" TEXT NOT NULL,
        "startDate" DATE NOT NULL,
        "endDate" DATE NOT NULL,
        "activationCondition" TEXT NOT NULL DEFAULT 'sla_timeout',
        "slaHours" INTEGER NOT NULL DEFAULT 24,
        "leaveTypeIds" TEXT,
        "maxLeaveDays" INTEGER NOT NULL DEFAULT 0,
        "branchIds" TEXT,
        "departmentIds" TEXT,
        "designationIds" TEXT,
        "canApprove" BOOLEAN NOT NULL DEFAULT true,
        "canReject" BOOLEAN NOT NULL DEFAULT true,
        "canReturnForClarification" BOOLEAN NOT NULL DEFAULT true,
        "canModifyDates" BOOLEAN NOT NULL DEFAULT false,
        "canChangeLeaveType" BOOLEAN NOT NULL DEFAULT false,
        "canPartiallyApprove" BOOLEAN NOT NULL DEFAULT false,
        "canCancelApproved" BOOLEAN NOT NULL DEFAULT false,
        "canRedelegate" BOOLEAN NOT NULL DEFAULT false,
        "reason" TEXT,
        "notifyOriginalApprover" BOOLEAN NOT NULL DEFAULT true,
        "showProxyNameToEmployee" BOOLEAN NOT NULL DEFAULT true,
        "isEnabled" BOOLEAN NOT NULL DEFAULT true,
        "status" TEXT NOT NULL DEFAULT 'active',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
        CONSTRAINT "LeaveProxyDelegation_pkey" PRIMARY KEY ("id")
      )
    `);
    await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "LeaveProxyDelegation_tenantId_idx" ON "LeaveProxyDelegation"("tenantId")`);
    await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "LeaveProxyDelegation_approverId_idx" ON "LeaveProxyDelegation"("approverId")`);
    // Add branchIds/departmentIds/designationIds columns if they don't exist (for existing tables)
    await db.$executeRawUnsafe(`ALTER TABLE "LeaveProxyDelegation" ADD COLUMN IF NOT EXISTS "branchIds" TEXT`).catch(() => {});
    await db.$executeRawUnsafe(`ALTER TABLE "LeaveProxyDelegation" ADD COLUMN IF NOT EXISTS "departmentIds" TEXT`).catch(() => {});
    await db.$executeRawUnsafe(`ALTER TABLE "LeaveProxyDelegation" ADD COLUMN IF NOT EXISTS "designationIds" TEXT`).catch(() => {});
  } catch (e) {
    console.warn('[proxy-delegations] ensureProxyTable failed (non-fatal):', e);
  }
}

/**
 * Compute the status of a delegation based on dates + isEnabled:
 * - 'expired' if endDate < today
 * - 'scheduled' if startDate > today
 * - 'disabled' if isEnabled = false
 * - 'active' if startDate <= today <= endDate AND isEnabled = true
 */
function computeStatus(start: string, end: string, isEnabled: boolean): string {
  if (!isEnabled) return 'disabled';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const s = new Date(start);
  const e = new Date(end);
  if (e < today) return 'expired';
  if (s > today) return 'scheduled';
  return 'active';
}

/**
 * GET /api/leave/proxy-delegations
 * Returns all proxy delegations for the current tenant.
 */
export async function GET(request: NextRequest) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });

    const tenantId = (decoded as any).tenantId;
    if (!tenantId) return NextResponse.json({ error: 'No tenant context' }, { status: 400, headers: corsHeaders() });

    await ensureProxyTable(db);

    const rows = await db.$queryRawUnsafe(
      `SELECT * FROM "LeaveProxyDelegation" WHERE "tenantId" = $1 ORDER BY "createdAt" DESC`,
      tenantId,
    ) as any[];

    // Compute status + resolve approver/proxy names
    // The IDs stored in the delegation are Employee IDs (from the /api/employees
    // dropdown). We look up names from BOTH the Employee table (firstName +
    // lastName + branch + department + designation) AND the User table (name +
    // email + role) to handle both cases.
    const enriched = await Promise.all((rows || []).map(async (r: any) => {
      const status = computeStatus(r.startDate, r.endDate, r.isEnabled);
      let approverName = 'Unknown';
      let approverEmail = '';
      let approverBranch = '';
      let approverDept = '';
      let approverDesignation = '';
      let approverRole = '';
      let proxyName = 'Unknown';
      let proxyEmail = '';
      let proxyBranch = '';
      let proxyDept = '';
      let proxyDesignation = '';
      let proxyRole = '';

      // Helper: look up a person by ID from both Employee and User tables
      const lookupPerson = async (id: string) => {
        let result: { name: string; email: string; branch: string; dept: string; designation: string; role: string } = {
          name: 'Unknown', email: '', branch: '', dept: '', designation: '', role: ''
        };
        // Try Employee table first (the dropdown stores Employee.id)
        try {
          const eRows = await db.$queryRawUnsafe(
            `SELECT e."firstName", e."lastName", e.email, e."employeeId",
                    d.name AS dept, des.title AS designation, b.name AS branch,
                    u.role, u.email AS user_email
             FROM "Employee" e
             LEFT JOIN "Department" d ON d.id = e."departmentId"
             LEFT JOIN "Designation" des ON des.id = e."designationId"
             LEFT JOIN "Branch" b ON b.id = e."branchId"
             LEFT JOIN "User" u ON u.id = e."userId"
             WHERE e.id = $1 LIMIT 1`,
            id
          ) as any[];
          if (eRows?.[0]) {
            const e = eRows[0];
            result.name = `${e.firstName || ''} ${e.lastName || ''}`.trim() || 'Unknown';
            result.email = e.email || e.user_email || '';
            result.branch = e.branch || '';
            result.dept = e.dept || '';
            result.designation = e.designation || '';
            result.role = e.role || '';
            return result;
          }
        } catch {}
        // Fallback: try User table directly
        try {
          const uRows = await db.$queryRawUnsafe(
            `SELECT u."name", u.email, u.role FROM "User" u WHERE u.id = $1 LIMIT 1`, id
          ) as any[];
          if (uRows?.[0]) {
            result.name = uRows[0].name || uRows[0].email || 'Unknown';
            result.email = uRows[0].email || '';
            result.role = uRows[0].role || '';
          }
        } catch {}
        return result;
      };

      const approverInfo = await lookupPerson(r.approverId);
      approverName = approverInfo.name;
      approverEmail = approverInfo.email;
      approverBranch = approverInfo.branch;
      approverDept = approverInfo.dept;
      approverDesignation = approverInfo.designation;
      approverRole = approverInfo.role;

      const proxyInfo = await lookupPerson(r.proxyId);
      proxyName = proxyInfo.name;
      proxyEmail = proxyInfo.email;
      proxyBranch = proxyInfo.branch;
      proxyDept = proxyInfo.dept;
      proxyDesignation = proxyInfo.designation;
      proxyRole = proxyInfo.role;

      let leaveTypeNames: string[] = [];
      try {
        const ltRaw = typeof r.leaveTypeIds === 'string' ? JSON.parse(r.leaveTypeIds) : r.leaveTypeIds;
        if (Array.isArray(ltRaw) && ltRaw.length > 0 && ltRaw[0] !== 'all') {
          const ltRows = await db.$queryRawUnsafe(
            `SELECT code FROM "LeaveType" WHERE id = ANY($1::text[])`, ltRaw
          ) as any[];
          leaveTypeNames = ltRows.map((lt: any) => lt.code);
        } else {
          leaveTypeNames = ['All Types'];
        }
      } catch { leaveTypeNames = ['All Types']; }

      return {
        id: r.id,
        approverId: r.approverId,
        approverName,
        approverEmail,
        approverBranch,
        approverDept,
        approverDesignation,
        approverRole,
        proxyId: r.proxyId,
        proxyName,
        proxyEmail,
        proxyBranch,
        proxyDept,
        proxyDesignation,
        proxyRole,
        startDate: r.startDate instanceof Date ? r.startDate.toISOString().split('T')[0] : String(r.startDate),
        endDate: r.endDate instanceof Date ? r.endDate.toISOString().split('T')[0] : String(r.endDate),
        activationCondition: r.activationCondition,
        slaHours: r.slaHours,
        leaveTypeIds: typeof r.leaveTypeIds === 'string' ? JSON.parse(r.leaveTypeIds || '["all"]') : (r.leaveTypeIds || ['all']),
        leaveTypeNames,
        maxLeaveDays: r.maxLeaveDays,
        branchIds: typeof r.branchIds === 'string' ? JSON.parse(r.branchIds || '[]') : (r.branchIds || []),
        departmentIds: typeof r.departmentIds === 'string' ? JSON.parse(r.departmentIds || '[]') : (r.departmentIds || []),
        designationIds: typeof r.designationIds === 'string' ? JSON.parse(r.designationIds || '[]') : (r.designationIds || []),
        permissions: {
          canApprove: r.canApprove,
          canReject: r.canReject,
          canReturnForClarification: r.canReturnForClarification,
          canModifyDates: r.canModifyDates,
          canChangeLeaveType: r.canChangeLeaveType,
          canPartiallyApprove: r.canPartiallyApprove,
          canCancelApproved: r.canCancelApproved,
          canRedelegate: r.canRedelegate,
        },
        reason: r.reason || '',
        notifyOriginalApprover: r.notifyOriginalApprover,
        showProxyNameToEmployee: r.showProxyNameToEmployee,
        isEnabled: r.isEnabled,
        status,
        createdAt: r.createdAt,
      };
    }));

    return NextResponse.json({ data: enriched }, { headers: corsHeaders() });
  } catch (error) {
    console.error('[proxy-delegations GET] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

/**
 * POST /api/leave/proxy-delegations
 * Create a new proxy delegation.
 */
export async function POST(request: NextRequest) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });

    const role = decoded.role as string;
    if (!['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_admin'].includes(role)) {
      return NextResponse.json({ error: 'Only admins can manage proxy delegations' }, { status: 403, headers: corsHeaders() });
    }

    const tenantId = (decoded as any).tenantId;
    if (!tenantId) return NextResponse.json({ error: 'No tenant context' }, { status: 400, headers: corsHeaders() });

    await ensureProxyTable(db);

    const body = await request.json();
    const {
      approverId, proxyId, startDate, endDate,
      activationCondition = 'sla_timeout', slaHours = 24,
      leaveTypeIds = ['all'], maxLeaveDays = 0,
      branchIds = [], departmentIds = [], designationIds = [],
      reason = '', notifyOriginalApprover = true, showProxyNameToEmployee = true,
      isEnabled = true,
    } = body;

    const perms = body.permissions || {};
    const canApprove = perms.canApprove !== false;
    const canReject = perms.canReject !== false;
    const canReturnForClarification = perms.canReturnForClarification !== false;
    const canModifyDates = perms.canModifyDates === true;
    const canChangeLeaveType = perms.canChangeLeaveType === true;
    const canPartiallyApprove = perms.canPartiallyApprove === true;
    const canCancelApproved = perms.canCancelApproved === true;
    const canRedelegate = perms.canRedelegate === true;

    if (!approverId || !proxyId || !startDate || !endDate) {
      return NextResponse.json({ error: 'approverId, proxyId, startDate, endDate are required' }, { status: 400, headers: corsHeaders() });
    }
    if (approverId === proxyId) {
      return NextResponse.json({ error: 'Approver and proxy cannot be the same person' }, { status: 400, headers: corsHeaders() });
    }

    const id = `pxd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const ltJson = JSON.stringify(leaveTypeIds || ['all']);
    const brJson = JSON.stringify(branchIds || []);
    const deptJson = JSON.stringify(departmentIds || []);
    const desigJson = JSON.stringify(designationIds || []);

    await db.$executeRawUnsafe(
      `INSERT INTO "LeaveProxyDelegation"
       ("id", "tenantId", "approverId", "proxyId", "startDate", "endDate",
        "activationCondition", "slaHours", "leaveTypeIds", "maxLeaveDays",
        "branchIds", "departmentIds", "designationIds",
        "canApprove", "canReject", "canReturnForClarification", "canModifyDates",
        "canChangeLeaveType", "canPartiallyApprove", "canCancelApproved", "canRedelegate",
        "reason", "notifyOriginalApprover", "showProxyNameToEmployee", "isEnabled",
        "status", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, 'active', NOW(), NOW())`,
      id, tenantId, approverId, proxyId, startDate, endDate,
      activationCondition, slaHours, ltJson, maxLeaveDays,
      brJson, deptJson, desigJson,
      canApprove, canReject, canReturnForClarification, canModifyDates,
      canChangeLeaveType, canPartiallyApprove, canCancelApproved, canRedelegate,
      reason || null, notifyOriginalApprover, showProxyNameToEmployee, isEnabled,
    );

    return NextResponse.json({ success: true, id, message: 'Proxy delegation created' }, { status: 201, headers: corsHeaders() });
  } catch (error) {
    console.error('[proxy-delegations POST] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

/**
 * PUT /api/leave/proxy-delegations
 * Update a proxy delegation (send id in body).
 */
export async function PUT(request: NextRequest) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });

    const role = decoded.role as string;
    if (!['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_admin'].includes(role)) {
      return NextResponse.json({ error: 'Only admins can manage proxy delegations' }, { status: 403, headers: corsHeaders() });
    }

    await ensureProxyTable(db);

    const body = await request.json();
    const { id, ...updates } = body;
    if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400, headers: corsHeaders() });

    const sets: string[] = [];
    const vals: any[] = [];
    let pi = 1;

    const fieldMap: Record<string, string> = {
      approverId: '"approverId"', proxyId: '"proxyId"', startDate: '"startDate"', endDate: '"endDate"',
      activationCondition: '"activationCondition"', slaHours: '"slaHours"', maxLeaveDays: '"maxLeaveDays"',
      reason: '"reason"', notifyOriginalApprover: '"notifyOriginalApprover"',
      showProxyNameToEmployee: '"showProxyNameToEmployee"', isEnabled: '"isEnabled"',
    };
    for (const [bodyKey, col] of Object.entries(fieldMap)) {
      if (updates[bodyKey] !== undefined) {
        vals.push(updates[bodyKey]);
        sets.push(`${col} = $${pi++}`);
      }
    }
    if (updates.leaveTypeIds !== undefined) {
      vals.push(JSON.stringify(updates.leaveTypeIds || ['all']));
      sets.push(`"leaveTypeIds" = $${pi++}`);
    }
    if (updates.branchIds !== undefined) {
      vals.push(JSON.stringify(updates.branchIds || []));
      sets.push(`"branchIds" = $${pi++}`);
    }
    if (updates.departmentIds !== undefined) {
      vals.push(JSON.stringify(updates.departmentIds || []));
      sets.push(`"departmentIds" = $${pi++}`);
    }
    if (updates.designationIds !== undefined) {
      vals.push(JSON.stringify(updates.designationIds || []));
      sets.push(`"designationIds" = $${pi++}`);
    }
    if (updates.permissions) {
      const p = updates.permissions;
      const permMap: Record<string, string> = {
        canApprove: '"canApprove"', canReject: '"canReject"', canReturnForClarification: '"canReturnForClarification"',
        canModifyDates: '"canModifyDates"', canChangeLeaveType: '"canChangeLeaveType"',
        canPartiallyApprove: '"canPartiallyApprove"', canCancelApproved: '"canCancelApproved"', canRedelegate: '"canRedelegate"',
      };
      for (const [k, col] of Object.entries(permMap)) {
        if (p[k] !== undefined) { vals.push(Boolean(p[k])); sets.push(`${col} = $${pi++}`); }
      }
    }
    sets.push(`"updatedAt" = NOW()`);
    vals.push(id);

    if (sets.length > 1) {
      await db.$executeRawUnsafe(
        `UPDATE "LeaveProxyDelegation" SET ${sets.join(', ')} WHERE "id" = $${pi}`,
        ...vals,
      );
    }

    return NextResponse.json({ success: true, message: 'Proxy delegation updated' }, { headers: corsHeaders() });
  } catch (error) {
    console.error('[proxy-delegations PUT] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

/**
 * DELETE /api/leave/proxy-delegations?id=xxx
 */
export async function DELETE(request: NextRequest) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });

    const role = decoded.role as string;
    if (!['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_admin'].includes(role)) {
      return NextResponse.json({ error: 'Only admins can delete proxy delegations' }, { status: 403, headers: corsHeaders() });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400, headers: corsHeaders() });

    await ensureProxyTable(db);
    await db.$executeRawUnsafe(`DELETE FROM "LeaveProxyDelegation" WHERE "id" = $1`, id);

    return NextResponse.json({ success: true, message: 'Proxy delegation deleted' }, { headers: corsHeaders() });
  } catch (error) {
    console.error('[proxy-delegations DELETE] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
