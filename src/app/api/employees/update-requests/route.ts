/**
 * Employee Update Requests API
 *
 *   GET  /api/employees/update-requests              — list (mine | inbox | all)
 *   POST /api/employees/update-requests              — submit a new profile-change request
 *
 * Field sensitivity:
 *   'low'        — direct update (phone, address, emergency contact)
 *   'high'       — requires approval (bank details, legal name, PAN, Aadhaar)
 *   'restricted' — never editable by employee (salary, employeeId, userId)
 */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { getAuthInfo } from '@/lib/companyScope';
import { canEditEmployeeRecords } from '@/lib/roleAccess';
import { applyEmployeeFieldChange, FIELD_SENSITIVITY } from '@/lib/employee-update-request';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

// Field sensitivity classification now lives in @/lib/employee-update-request
// (shared with PATCH /api/users/profile so the ESS Edit Profile flow routes
// through the same approval workflow).

export async function GET(req: NextRequest) {
  const db = await getDb(req);
  try {
    const auth = await getAuthInfo(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    const url = new URL(req.url);
    const scope = url.searchParams.get('scope') || 'mine';
    const isAdmin = ['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_admin', 'company_hr_admin'].includes(auth.role);

    let where: Record<string, unknown> = {};
    // Optional client-side filters (edit-log page dropdowns)
    const statusFilter = url.searchParams.get('status');
    const categoryFilter = url.searchParams.get('category');
    if (scope === 'inbox') {
      // Requests waiting for MY approval
      const pendingSteps = await (db as any).employeeUpdateApprovalStep?.findMany({
        where: { status: 'pending', approverUserId: auth.userId },
        select: { updateRequestId: true },
        take: 200,
      }) || [];
      const ids = [...new Set(pendingSteps.map((s: { updateRequestId: string }) => s.updateRequestId))];
      where = { id: { in: ids }, status: 'pending' };
    } else if (scope === 'all' && isAdmin) {
      // All requests (admin) — apply optional status/category filters
      if (statusFilter) where.status = statusFilter;
      if (categoryFilter) where.category = categoryFilter;
    } else {
      // scope === 'mine' — the employee's own requests
      // Find the employee record by userId
      const emp = await db.employee.findFirst({ where: { userId: auth.userId }, select: { id: true } });
      if (!emp) return NextResponse.json({ requests: [] }, { headers: corsHeaders() });
      where = { employeeId: emp.id };
      if (statusFilter) where.status = statusFilter;
      if (categoryFilter) where.category = categoryFilter;
    }

    const requests = await db.employeeUpdateRequest.findMany({
      where,
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, employeeId: true, email: true } },
        approvalSteps: { orderBy: { tier: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return NextResponse.json({ requests }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Employee update requests GET error:', error);
    return NextResponse.json({ requests: [] }, { headers: corsHeaders() });
  }
}

export async function POST(req: NextRequest) {
  const db = await getDb(req);
  try {
    const auth = await getAuthInfo(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    const body = await req.json();
    const { employeeId, fieldName, newValue, reason, documentId } = body;

    if (!employeeId || !fieldName || newValue === undefined) {
      return NextResponse.json({ error: 'employeeId, fieldName, and newValue are required' }, { status: 400, headers: corsHeaders() });
    }

    const ownEmployee = await db.employee.findFirst({ where: { userId: auth.userId }, select: { id: true } });
    if (!canEditEmployeeRecords(auth.role) && ownEmployee?.id !== employeeId) {
      return NextResponse.json({ error: 'You can only submit changes for your own profile' }, { status: 403, headers: corsHeaders() });
    }

    // Task 86: delegate to the shared engine (sensitivity, direct-apply vs
    // approval chain, approver fallback, tier-1 notification). Keeps the
    // "Request Change" modal and the ESS Edit Profile flow on one code path.
    const result = await applyEmployeeFieldChange(db as Record<string, any>, {
      auth: { userId: auth.userId, role: auth.role, tenantId: auth.tenantId },
      employeeId,
      fieldName,
      newValue: String(newValue),
      reason,
      documentId: documentId || null,
      origin: req.headers.get('origin'),
      req,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status || 400, headers: corsHeaders() });
    }
    return NextResponse.json({ request: result.request, message: result.message, applied: result.applied }, { status: 201, headers: corsHeaders() });
  } catch (error) {
    console.error('Employee update request POST error:', error);
    return NextResponse.json({ error: 'Failed to create update request' }, { status: 500, headers: corsHeaders() });
  }
}

export { FIELD_SENSITIVITY };
