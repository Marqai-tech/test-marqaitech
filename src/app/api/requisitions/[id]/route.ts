import { NextResponse } from 'next/server';
import { getDb, getPlatformDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { createNotification, sendNotificationEmail } from '@/lib/notifications';

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

// Task 164: roles that can approve at each tier
const HR_ROLES = ['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_admin', 'company_hr_admin'];
const FINANCE_ROLES = ['super_admin', 'tenant_admin', 'ceo', 'admin', 'finance_admin'];

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });

    const { id } = await params;

    const requisition = await db.requisition.findUnique({
      where: { id },
      include: {
        department: { select: { id: true, name: true, code: true } },
        designation: { select: { id: true, title: true, level: true } },
        company: { select: { id: true, name: true } },
      },
    }).catch(async () => {
      // RAW SQL fallback
      const rows = await db.$queryRawUnsafe(
        `SELECT r.*, d."name" AS "deptName", des."title" AS "desgTitle"
         FROM "Requisition" r
         LEFT JOIN "Department" d ON d."id" = r."departmentId"
         LEFT JOIN "Designation" des ON des."id" = r."designationId"
         WHERE r."id" = $1 LIMIT 1`,
        id,
      ) as any[];
      return rows[0] || null;
    });

    if (!requisition) {
      return NextResponse.json({ error: 'Requisition not found' }, { status: 404, headers: corsHeaders() });
    }

    // Task 164: also fetch approval history from AuditLog
    let approvalHistory: any[] = [];
    try {
      approvalHistory = await db.auditLog.findMany({
        where: { module: 'requisitions', details: { contains: requisition.requisitionId || '' } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }) as any[];
    } catch {}

    return NextResponse.json({ requisition, approvalHistory }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Get requisition error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });

    const { id } = await params;
    const body = await request.json();
    const { action, comments, departmentId, designationId, positionType, numberOfOpenings,
            employmentType, skillsRequired, experienceRequired, qualification,
            salaryBudget, priority, expectedJoiningDate, reason } = body;

    // Task 164: fetch existing via RAW SQL fallback
    const existing = await db.requisition.findUnique({ where: { id } }).catch(async () => {
      const rows = await db.$queryRawUnsafe(`SELECT * FROM "Requisition" WHERE "id" = $1 LIMIT 1`, id) as any[];
      return rows[0] || null;
    });
    if (!existing) {
      return NextResponse.json({ error: 'Requisition not found' }, { status: 404, headers: corsHeaders() });
    }

    const userRole = (decoded.role as string) || '';
    const isHr = HR_ROLES.includes(userRole);
    const isFinance = FINANCE_ROLES.includes(userRole);
    const isRequester = existing.hiringManagerId === decoded.userId;

    // ─── Task 164: field edits (only requester or admin, only if draft/returned) ───
    const updateData: Record<string, unknown> = {};
    if (departmentId !== undefined) updateData.departmentId = departmentId;
    if (designationId !== undefined) updateData.designationId = designationId || null;
    if (positionType !== undefined) updateData.positionType = positionType;
    if (numberOfOpenings !== undefined) updateData.numberOfOpenings = numberOfOpenings;
    if (employmentType !== undefined) updateData.employmentType = employmentType;
    if (skillsRequired !== undefined) updateData.skillsRequired = skillsRequired || null;
    if (experienceRequired !== undefined) updateData.experienceRequired = experienceRequired || null;
    if (qualification !== undefined) updateData.qualification = qualification || null;
    if (salaryBudget !== undefined) updateData.salaryBudget = salaryBudget || null;
    if (priority !== undefined) updateData.priority = priority;
    if (expectedJoiningDate !== undefined) updateData.expectedJoiningDate = expectedJoiningDate ? new Date(expectedJoiningDate) : null;

    // Phase 3 fix: Persist positionTitle and reason in PATCH (were destructured but never stored)
    if (body.positionTitle !== undefined) (updateData as any).positionTitle = body.positionTitle || null;
    if (reason !== undefined) (updateData as any).reason = reason || null;

    // Phase 3 fix: Only allow field edits if requester or admin AND status is draft/returned
    if (Object.keys(updateData).length > 0 && !action) {
      if (!isRequester && !isHr) {
        return NextResponse.json({ error: 'Only the requester or HR can edit requisition fields' }, { status: 403, headers: corsHeaders() });
      }
      if (!['draft', 'returned'].includes(existing.approvalStatus)) {
        return NextResponse.json({ error: 'Cannot edit a requisition that is already ' + existing.approvalStatus + '. Return it first.' }, { status: 400, headers: corsHeaders() });
      }
    }

    // ─── Task 164: approval actions ───
    // Flow: draft → pending (submit) → hr_approved → budget_approved → approved
    //                                → rejected (at any stage)
    //                                → returned (HR returns to manager for correction)
    if (action) {
      const currentStatus = existing.approvalStatus;

      // ─── Submit (draft → pending): only requester ───
      if (action === 'submit') {
        if (!isRequester && !isHr) {
          return NextResponse.json({ error: 'Only the requester can submit' }, { status: 403, headers: corsHeaders() });
        }
        if (currentStatus !== 'draft' && currentStatus !== 'returned') {
          return NextResponse.json({ error: `Cannot submit: current status is ${currentStatus}` }, { status: 400, headers: corsHeaders() });
        }
        updateData.approvalStatus = 'pending';
        updateData.status = 'open';
        updateData.approvedBy = null;
        updateData.approvedAt = null;
        updateData.rejectionReason = null;
      }

      // ─── HR approve (pending → hr_approved): only HR ───
      else if (action === 'hr_approve') {
        if (!isHr) {
          return NextResponse.json({ error: 'Only HR can approve at this stage' }, { status: 403, headers: corsHeaders() });
        }
        if (currentStatus !== 'pending') {
          return NextResponse.json({ error: `Cannot approve: current status is ${currentStatus} (expected pending)` }, { status: 400, headers: corsHeaders() });
        }
        updateData.approvalStatus = 'hr_approved';
        updateData.approvedBy = decoded.userId;
        updateData.approvedAt = new Date();
      }

      // ─── Finance approve (hr_approved → budget_approved → approved): only Finance ───
      else if (action === 'finance_approve') {
        if (!isFinance) {
          return NextResponse.json({ error: 'Only Finance can approve at this stage' }, { status: 403, headers: corsHeaders() });
        }
        if (currentStatus !== 'hr_approved') {
          return NextResponse.json({ error: `Cannot approve: current status is ${currentStatus} (expected hr_approved)` }, { status: 400, headers: corsHeaders() });
        }
        updateData.approvalStatus = 'budget_approved';
        updateData.status = 'approved';
        updateData.approvedBy = decoded.userId;
        updateData.approvedAt = new Date();
      }

      // ─── HR reject (pending → rejected): only HR ───
      else if (action === 'hr_reject') {
        if (!isHr) {
          return NextResponse.json({ error: 'Only HR can reject at this stage' }, { status: 403, headers: corsHeaders() });
        }
        if (currentStatus !== 'pending') {
          return NextResponse.json({ error: `Cannot reject: current status is ${currentStatus}` }, { status: 400, headers: corsHeaders() });
        }
        updateData.approvalStatus = 'rejected';
        updateData.status = 'cancelled';
        updateData.rejectionReason = comments || 'Rejected by HR';
        updateData.approvedBy = decoded.userId;
        updateData.approvedAt = new Date();
      }

      // ─── Finance reject (hr_approved → rejected): only Finance ───
      else if (action === 'finance_reject') {
        if (!isFinance) {
          return NextResponse.json({ error: 'Only Finance can reject at this stage' }, { status: 403, headers: corsHeaders() });
        }
        if (currentStatus !== 'hr_approved') {
          return NextResponse.json({ error: `Cannot reject: current status is ${currentStatus}` }, { status: 400, headers: corsHeaders() });
        }
        updateData.approvalStatus = 'rejected';
        updateData.status = 'cancelled';
        updateData.rejectionReason = comments || 'Rejected by Finance';
        updateData.approvedBy = decoded.userId;
        updateData.approvedAt = new Date();
      }

      // ─── HR return (pending → returned): only HR ───
      else if (action === 'return') {
        if (!isHr) {
          return NextResponse.json({ error: 'Only HR can return a requisition' }, { status: 403, headers: corsHeaders() });
        }
        if (currentStatus !== 'pending') {
          return NextResponse.json({ error: `Cannot return: current status is ${currentStatus}` }, { status: 400, headers: corsHeaders() });
        }
        updateData.approvalStatus = 'returned';
        updateData.rejectionReason = comments || 'Returned for correction';
        updateData.approvedBy = decoded.userId;
        updateData.approvedAt = new Date();
      }

      else {
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400, headers: corsHeaders() });
      }
    }

    // ─── Update the requisition ───
    const requisition = await db.requisition.update({
      where: { id },
      data: updateData,
      include: {
        department: { select: { id: true, name: true } },
        designation: { select: { id: true, title: true } },
      },
    }).catch(async (err) => {
      // RAW SQL fallback
      console.warn('[Requisitions PATCH] Prisma update failed, trying RAW SQL:', err instanceof Error ? err.message : err);
      const sets: string[] = [];
      const vals: any[] = [];
      let idx = 1;
      for (const [k, v] of Object.entries(updateData)) {
        if (v instanceof Date) {
          sets.push(`"${k}" = $${idx++}::timestamp`);
        } else {
          sets.push(`"${k}" = $${idx++}`);
        }
        vals.push(v);
      }
      if (sets.length > 0) {
        vals.push(id);
        await db.$executeRawUnsafe(`UPDATE "Requisition" SET ${sets.join(', ')}, "updatedAt" = NOW() WHERE "id" = $${idx}`, ...vals);
      }
      // Fetch back
      const rows = await db.$queryRawUnsafe(
        `SELECT r.*, d."name" AS "deptName", des."title" AS "desgTitle"
         FROM "Requisition" r LEFT JOIN "Department" d ON d."id" = r."departmentId"
         LEFT JOIN "Designation" des ON des."id" = r."designationId"
         WHERE r."id" = $1 LIMIT 1`, id
      ) as any[];
      return rows[0] || { id, ...updateData };
    });

    // ─── Audit log + approval history ───
    const actionLabel = action ? ` — ${action}${comments ? `: ${comments}` : ''}` : '';
    await db.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: action ? 'REQUISITION_APPROVAL' : 'UPDATE_REQUISITION',
        module: 'requisitions',
        details: `${action ? action.toUpperCase() : 'Updated'} requisition ${existing.requisitionId}${actionLabel}`,
      },
    }).catch(() => null);

    // ─── Notifications ───
    if (action && decoded.tenantId) {
      try {
        const { dispatchNotification } = await import('@/lib/notification-center');
        const empName = decoded.name || decoded.email || 'Approver';

        // Notify the requester (Manager) of any decision
        if (existing.hiringManagerId) {
          let notifTitle = '';
          let notifMsg = '';
          if (action === 'hr_approve') { notifTitle = 'Requisition Approved by HR'; notifMsg = `Your requisition ${existing.requisitionId} was approved by HR. Pending Finance approval.`; }
          else if (action === 'finance_approve') { notifTitle = 'Requisition Fully Approved'; notifMsg = `Your requisition ${existing.requisitionId} has been fully approved. You can now create a job posting.`; }
          else if (action === 'hr_reject' || action === 'finance_reject') { notifTitle = 'Requisition Rejected'; notifMsg = `Your requisition ${existing.requisitionId} was rejected. Reason: ${comments || 'N/A'}`; }
          else if (action === 'return') { notifTitle = 'Requisition Returned for Correction'; notifMsg = `Your requisition ${existing.requisitionId} was returned. Please review and resubmit. Comments: ${comments || 'N/A'}`; }
          else if (action === 'submit') { notifTitle = 'Requisition Submitted'; notifMsg = `Your requisition ${existing.requisitionId} has been submitted for HR approval.`; }

          if (notifTitle) {
            // GAP FIX #3: Use dispatchNotification for fully-approved requisitions so the
            // recruitment.requisition.approved event template is used (with proper email +
            // delivery log). For other actions, keep the existing raw createNotification
            // which already sends in-app + email.
            if (action === 'finance_approve' && decoded.tenantId) {
              try {
                const { dispatchNotification } = await import('@/lib/notification-center');
                await dispatchNotification({
                  tenantId: decoded.tenantId as string,
                  module: 'recruitment',
                  eventKey: 'recruitment.requisition.approved',
                  recipients: [{ userId: existing.hiringManagerId }],
                  vars: {
                    Requisition_Title: existing.requisitionId,
                    Department: existing.department?.name || '—',
                    Requested_By: empName,
                    Openings: String(existing.numberOfOpenings || 1),
                  },
                  entity: { type: 'requisition', id: existing.id, link: '/requisitions' },
                }).catch(() => null);
              } catch { /* non-fatal */ }
            } else {
              // Keep existing raw notification for non-fully-approved actions
              const notif = await createNotification({
                tenantId: decoded.tenantId as string,
                userId: existing.hiringManagerId,
                title: notifTitle,
                message: notifMsg,
                type: action.includes('reject') ? 'warning' : action === 'return' ? 'info' : 'success',
                category: 'recruitment',
                link: '/requisitions',
              }).catch(() => null);
              const mgrUser = await db.user.findUnique({ where: { id: existing.hiringManagerId }, select: { email: true } }).catch(() => null);
              if (notif?.id && mgrUser?.email) {
                await sendNotificationEmail(db, decoded.tenantId as string, notif, mgrUser.email, notifTitle, `<p>${notifMsg}</p>`).catch(() => null);
              }
            }
          }
        }

        // Notify Finance when HR approves
        if (action === 'hr_approve') {
          const financeUsers = await db.user.findMany({
            where: { role: { in: FINANCE_ROLES }, status: 'active' },
            select: { id: true, email: true },
          }).catch(() => []);
          if (financeUsers.length > 0) {
            await dispatchNotification({
              tenantId: decoded.tenantId as string,
              module: 'recruitment',
              eventKey: 'recruitment.requisition.finance_approval_required',
              recipients: financeUsers.map((u: { id: string }) => ({ userId: u.id })),
              vars: {
                Requisition_Title: `${requisition.designation?.title || existing.requisitionId}`,
                Department: requisition.department?.name || '—',
              },
              entity: { type: 'requisition', id, link: '/requisitions' },
              origin: request.headers.get('origin') || undefined,
            }).catch(() => null);
          }
        }

        // Notify HR when Manager submits (or resubmits after return)
        if (action === 'submit') {
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
                Requisition_Title: `${requisition.designation?.title || existing.requisitionId}`,
                Department: requisition.department?.name || '—',
                Requested_By: decoded.name || decoded.email || 'Manager',
              },
              entity: { type: 'requisition', id, link: '/requisitions' },
              origin: request.headers.get('origin') || undefined,
            }).catch(() => null);
          }
        }
      } catch (e) {
        console.warn('[requisitions] notification failed (non-fatal):', (e as Error).message);
      }
    }

    return NextResponse.json({ requisition }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Patch requisition error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });

    const { id } = await params;
    const existing = await db.requisition.findUnique({ where: { id } }).catch(async () => {
      const rows = await db.$queryRawUnsafe(`SELECT * FROM "Requisition" WHERE "id" = $1 LIMIT 1`, id) as any[];
      return rows[0] || null;
    });
    if (!existing) return NextResponse.json({ error: 'Requisition not found' }, { status: 404, headers: corsHeaders() });

    // Phase 3 fix: Only requester or HR/Admin can delete, and only if draft/returned
    const userRole = (decoded.role as string) || '';
    const isHrOrAdmin = HR_ROLES.includes(userRole);
    const isRequester = existing.hiringManagerId === decoded.userId;
    if (!isRequester && !isHrOrAdmin) {
      return NextResponse.json({ error: 'Only the requester or HR/Admin can delete a requisition' }, { status: 403, headers: corsHeaders() });
    }
    if (!['draft', 'returned'].includes(existing.approvalStatus)) {
      return NextResponse.json({ error: 'Cannot delete a requisition that has been submitted or approved. Cancel it instead.' }, { status: 400, headers: corsHeaders() });
    }

    await db.requisition.delete({ where: { id } }).catch(async () => {
      await db.$executeRawUnsafe(`DELETE FROM "Requisition" WHERE "id" = $1`, id);
    });

    await db.auditLog.create({
      data: { userId: decoded.userId as string, action: 'DELETE_REQUISITION', module: 'requisitions', details: `Deleted requisition ${existing.requisitionId}` },
    }).catch(() => null);

    return NextResponse.json({ success: true }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Delete requisition error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
