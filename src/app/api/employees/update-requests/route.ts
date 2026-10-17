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
import { applyEmployeeFieldChange, FIELD_SENSITIVITY } from '@/lib/employee-update-request';
import { validateEmail, validatePhone, validateZipCode } from '@/lib/validators';

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

// BUG_046/047/048/049/054/055/056 fix: server-side validation for new-value
// inputs. The client also validates, but defence in depth — never trust the
// client. Returns a descriptive error string on failure, or '' on success.
function validateNewValueServerSide(fieldName: string, rawValue: string): string {
  const value = String(rawValue || '').trim();
  if (!value) return 'New value is required';

  if (fieldName === 'phone' || fieldName === 'emergencyContactPhone') {
    const phoneCheck = validatePhone(value);
    if (!phoneCheck.valid) return phoneCheck.error || 'Enter a valid 10-digit phone number';
  }
  if (fieldName === 'zipCode' || fieldName === 'currentZipCode') {
    const pinCheck = validateZipCode(value);
    if (!pinCheck.valid) return pinCheck.error || 'Enter a valid 6-digit PIN code';
  }
  if (fieldName === 'personalEmail') {
    const emailCheck = validateEmail(value);
    if (!emailCheck.valid) return emailCheck.error || 'Invalid email format';
  }
  if (fieldName === 'dateOfBirth') {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return 'Invalid date';
    const now = new Date();
    if (d.getTime() > now.getTime()) return 'Date of birth cannot be a future date';
    const ageYears = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    if (ageYears < 16) return 'Employee must be at least 16 years old';
    if (ageYears > 100) return 'Date of birth is unrealistic';
  }
  // BUG_055 fix: XSS guard — reject obvious script/HTML injection attempts.
  // The shared sanitizer in applyEmployeeFieldChange also strips tags, but we
  // reject here so the caller gets a clear 400 instead of a silently-cleaned
  // value (which can confuse users who typed something malicious).
  if (/<\s*(script|iframe|object|embed|link|style|meta|img[^>]*onerror)/i.test(value)) {
    return 'HTML/script tags are not allowed in this field';
  }
  if (/[<>]/.test(value) && /script|onerror|onload|javascript:/i.test(value)) {
    return 'Invalid input — special characters are not allowed';
  }
  // BUG_056 fix: cap reason length is done by the sanitizer; here we also
  // cap value length to prevent megabyte-scale payloads.
  if (value.length > 2000) return 'Value is too long (max 2000 characters)';
  return '';
}

export async function GET(req: NextRequest) {
  const db = await getDb(req);
  try {
    const auth = await getAuthInfo(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    const url = new URL(req.url);
    const scope = url.searchParams.get('scope') || 'mine';
    const isAdmin = ['super_admin', 'tenant_admin', 'admin', 'hr_admin'].includes(auth.role);

    let where: Record<string, unknown> = {};
    if (scope === 'inbox') {
      // Requests waiting for MY approval. BUG_051 fix: admins (super_admin,
      // tenant_admin, admin, hr_admin) should see ALL pending requests in
      // their inbox — not just the ones where they're the explicitly-
      // assigned current-tier approver. Previously an admin whose tenant
      // had no approval-step rows pointing at them saw an empty inbox
      // even when there were pending high-risk requests waiting somewhere.
      if (isAdmin) {
        where = { status: 'pending' };
      } else {
        const pendingSteps = await (db as any).employeeUpdateApprovalStep?.findMany({
          where: { status: 'pending', approverUserId: auth.userId },
          select: { updateRequestId: true },
          take: 200,
        }) || [];
        const ids = [...new Set(pendingSteps.map((s: { updateRequestId: string }) => s.updateRequestId))];
        where = { id: { in: ids }, status: 'pending' };
      }
    } else if (scope === 'all' && isAdmin) {
      // All requests (admin)
    } else {
      // scope === 'mine' — the employee's own requests
      // Find the employee record by userId
      const emp = await db.employee.findFirst({ where: { userId: auth.userId }, select: { id: true } });
      if (!emp) return NextResponse.json({ requests: [] }, { headers: corsHeaders() });
      where = { employeeId: emp.id };
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

    if (!fieldName || newValue === undefined) {
      return NextResponse.json({ error: 'fieldName and newValue are required' }, { status: 400, headers: corsHeaders() });
    }

    // BUG_046/047/048/049/054/055/056 fix: server-side validation. For
    // non-admin employees, employeeId is optional — the API resolves it
    // from the JWT. For admins, employeeId is required.
    const isAdmin = ['super_admin', 'tenant_admin', 'admin', 'hr_admin'].includes(auth.role);
    if (!employeeId && isAdmin) {
      return NextResponse.json({ error: 'employeeId is required' }, { status: 400, headers: corsHeaders() });
    }

    // Resolve the target employeeId for non-admins (their own record).
    let targetEmployeeId = employeeId;
    if (!isAdmin) {
      const ownEmp = await db.employee.findFirst({ where: { userId: auth.userId }, select: { id: true } });
      if (!ownEmp) {
        return NextResponse.json({ error: 'Your employee record was not found' }, { status: 404, headers: corsHeaders() });
      }
      targetEmployeeId = ownEmp.id;
    }

    // Validate the new value server-side before delegating to the engine.
    const valueError = validateNewValueServerSide(String(fieldName), String(newValue));
    if (valueError) {
      return NextResponse.json({ error: valueError }, { status: 400, headers: corsHeaders() });
    }

    // BUG_056 fix: cap reason length server-side (the engine also caps via
    // sanitizeMultiLineText, but we want a clear 400 here).
    if (reason && String(reason).length > 500) {
      return NextResponse.json({ error: 'Reason is too long (max 500 characters)' }, { status: 400, headers: corsHeaders() });
    }

    // Task 86: delegate to the shared engine (sensitivity, direct-apply vs
    // approval chain, approver fallback, tier-1 notification). Keeps the
    // "Request Change" modal and the ESS Edit Profile flow on one code path.
    const result = await applyEmployeeFieldChange(db as Record<string, any>, {
      auth: { userId: auth.userId, role: auth.role, tenantId: auth.tenantId },
      employeeId: targetEmployeeId,
      fieldName: String(fieldName),
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
