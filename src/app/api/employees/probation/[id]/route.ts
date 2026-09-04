import { NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

/**
 * GET /api/employees/probation/[id]
 * Returns a single probation review by ID.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(request);
  try {
    const { id } = await params;
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });

    const review = await db.performanceReview.findUnique({
      where: { id },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            employeeId: true,
            avatar: true,
            department: { select: { name: true } },
            designation: { select: { title: true } },
          },
        },
      },
    });

    if (!review) {
      return NextResponse.json({ error: 'Probation review not found' }, { status: 404, headers: corsHeaders() });
    }

    // Parse the comments JSON
    let probationData: any = {};
    try {
      if (review.comments && review.comments.startsWith('{')) {
        probationData = JSON.parse(review.comments);
      }
    } catch { /* not JSON */ }

    const emp = (review as any).employee || {};
    let endDate: string | null = null;
    const startDateStr = probationData.probationStartDate || null;
    if (startDateStr && probationData.probationPeriod) {
      try {
        const start = new Date(startDateStr);
        const end = new Date(start);
        end.setMonth(end.getMonth() + Number(probationData.probationPeriod) + Number(probationData.extensionPeriod || 0));
        endDate = end.toISOString();
      } catch { /* invalid date */ }
    }

    return NextResponse.json({
      probation: {
        id: review.id,
        employeeId: review.employeeId,
        employee: review.employee,
        employeeName: `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || 'Unknown',
        employeeCode: emp.employeeId || '—',
        startDate: startDateStr,
        endDate,
        probationPeriod: Number(probationData.probationPeriod) || 0,
        probationStartDate: probationData.probationStartDate || null,
        extensionPeriod: probationData.extensionPeriod || 0,
        performanceRating: probationData.performanceRating || (review as any).overallRating || 0,
        reviewComments: probationData.reviewComments || review.comments || '',
        kpiStatus: probationData.kpiStatus || 'pending',
        decision: probationData.decision || 'pending',
        effectiveDate: probationData.effectiveDate || null,
        confirmationLetter: probationData.confirmationLetter || null,
        // Workflow fields
        status: review.status,
        reviewerId: review.reviewerId,
        reviewDate: review.reviewDate,
        createdAt: review.createdAt,
        updatedAt: review.updatedAt,
      },
    }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Get probation review error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

/**
 * PUT /api/employees/probation/[id]
 * Edit an existing probation review (before HR approval).
 * Only reviews with status='pending' can be edited.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(request);
  try {
    const { id } = await params;
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });

    const body = await request.json();
    const {
      probationStartDate,
      probationPeriod,
      extensionPeriod,
      performanceRating,
      reviewComments,
      kpiStatus,
      decision,
      effectiveDate,
      confirmationLetter,
    } = body;

    // Check if the review exists
    const existing = await db.performanceReview.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Probation review not found' }, { status: 404, headers: corsHeaders() });
    }

    // Only allow editing if the review is still pending
    if (existing.status !== 'pending') {
      return NextResponse.json({
        error: `Cannot edit a probation review that has already been ${existing.status}. Only pending reviews can be edited.`,
      }, { status: 400, headers: corsHeaders() });
    }

    // Build the updated probation data JSON
    // Merge with existing data to preserve fields not being updated
    let existingData: any = {};
    try {
      if (existing.comments && existing.comments.startsWith('{')) {
        existingData = JSON.parse(existing.comments);
      }
    } catch { /* not JSON */ }

    const updatedProbationData = JSON.stringify({
      probationStartDate: probationStartDate !== undefined ? probationStartDate : existingData.probationStartDate,
      probationPeriod: probationPeriod !== undefined ? probationPeriod : existingData.probationPeriod,
      extensionPeriod: extensionPeriod !== undefined ? extensionPeriod : (existingData.extensionPeriod || 0),
      performanceRating: performanceRating !== undefined ? performanceRating : (existingData.performanceRating || 0),
      reviewComments: reviewComments !== undefined ? reviewComments : (existingData.reviewComments || ''),
      kpiStatus: kpiStatus !== undefined ? kpiStatus : (existingData.kpiStatus || 'pending'),
      decision: decision !== undefined ? decision : (existingData.decision || 'pending'),
      effectiveDate: effectiveDate !== undefined ? effectiveDate : existingData.effectiveDate,
      confirmationLetter: confirmationLetter !== undefined ? confirmationLetter : existingData.confirmationLetter,
    });

    const review = await db.performanceReview.update({
      where: { id },
      data: {
        comments: updatedProbationData,
        rating: performanceRating !== undefined ? performanceRating : existing.rating,
        overallRating: performanceRating !== undefined ? performanceRating : existing.overallRating,
        reviewPeriod: probationPeriod ? `Probation (${probationPeriod} months)` : existing.reviewPeriod,
        reviewDate: effectiveDate ? new Date(effectiveDate) : existing.reviewDate,
      },
      include: {
        employee: { select: { firstName: true, lastName: true, employeeId: true } },
      },
    });

    // Audit log
    try {
      await db.auditLog.create({
        data: {
          userId: decoded.userId as string,
          action: 'UPDATE_PROBATION_REVIEW',
          module: 'employees',
          details: `Updated probation review for ${(review as any).employee?.firstName} ${(review as any).employee?.lastName}`,
        },
      });
    } catch { /* non-critical */ }

    return NextResponse.json({
      success: true,
      message: 'Probation review updated successfully',
      probation: { id: review.id, status: review.status },
    }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Update probation review error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

/**
 * PATCH /api/employees/probation/[id]
 * Approve/reject/extend a probation review (HR/Admin only).
 *
 * Body:
 *   { action: 'approve' | 'extend' | 'reject', comments?: string, extensionPeriod?: number }
 *
 * - approve: status → 'completed', decision → 'confirm'
 * - extend: status → 'in_progress', decision → 'extend', extensionPeriod updated
 * - reject: status → 'rejected', decision → 'terminate'
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(request);
  try {
    const { id } = await params;
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });

    // Only HR/Admin can approve/reject
    const userRole = (decoded.role as string) || 'employee';
    if (!['super_admin', 'tenant_admin', 'admin', 'company_hr_admin', 'hr_admin', 'manager'].includes(userRole.toLowerCase())) {
      return NextResponse.json({ error: 'Only HR/Admin can approve or reject probation reviews' }, { status: 403, headers: corsHeaders() });
    }

    const body = await request.json();
    const { action, comments, extensionPeriod } = body;

    if (!action || !['approve', 'extend', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'action must be approve, extend, or reject' }, { status: 400, headers: corsHeaders() });
    }

    const existing = await db.performanceReview.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Probation review not found' }, { status: 404, headers: corsHeaders() });
    }

    if (existing.status !== 'pending') {
      return NextResponse.json({
        error: `This probation review has already been ${existing.status}. Cannot ${action} it again.`,
      }, { status: 400, headers: corsHeaders() });
    }

    // Map action → status + decision
    let newStatus = 'pending';
    let newDecision = 'pending';
    if (action === 'approve') {
      newStatus = 'completed';
      newDecision = 'confirm';
    } else if (action === 'extend') {
      newStatus = 'in_progress';
      newDecision = 'extend';
    } else if (action === 'reject') {
      newStatus = 'rejected';
      newDecision = 'terminate';
    }

    // Parse existing probation data
    let probationData: any = {};
    try {
      if (existing.comments && existing.comments.startsWith('{')) {
        probationData = JSON.parse(existing.comments);
      }
    } catch { /* not JSON */ }

    // Update the probation data with the HR decision
    probationData.decision = newDecision;
    probationData.hrAction = action;
    probationData.hrComments = comments || '';
    probationData.hrActionedBy = decoded.userId;
    probationData.hrActionDate = new Date().toISOString();
    if (action === 'extend' && extensionPeriod) {
      probationData.extensionPeriod = extensionPeriod;
    }

    const review = await db.performanceReview.update({
      where: { id },
      data: {
        status: newStatus,
        comments: JSON.stringify(probationData),
        improvements: comments || null, // Store HR comments in the improvements field too
        reviewDate: new Date(),
      },
      include: {
        employee: { select: { firstName: true, lastName: true, employeeId: true } },
      },
    });

    // Audit log
    try {
      await db.auditLog.create({
        data: {
          userId: decoded.userId as string,
          action: `PROBATION_${action.toUpperCase()}`,
          module: 'employees',
          details: `${action.charAt(0).toUpperCase() + action.slice(1)}ed probation review for ${(review as any).employee?.firstName} ${(review as any).employee?.lastName}`,
        },
      });
    } catch { /* non-critical */ }

    return NextResponse.json({
      success: true,
      message: `Probation review ${action}d successfully`,
      probation: { id: review.id, status: review.status, decision: newDecision },
    }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Approve/Reject probation review error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

/**
 * DELETE /api/employees/probation/[id]
 * Delete a probation review (HR/Admin only, pending reviews only).
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(request);
  try {
    const { id } = await params;
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });

    // Only HR/Admin can delete
    const userRole = (decoded.role as string) || 'employee';
    if (!['super_admin', 'tenant_admin', 'admin', 'company_hr_admin', 'hr_admin'].includes(userRole.toLowerCase())) {
      return NextResponse.json({ error: 'Only HR/Admin can delete probation reviews' }, { status: 403, headers: corsHeaders() });
    }

    const existing = await db.performanceReview.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Probation review not found' }, { status: 404, headers: corsHeaders() });
    }

    // Only allow deleting pending reviews
    if (existing.status !== 'pending') {
      return NextResponse.json({
        error: `Cannot delete a probation review that has been ${existing.status}. Only pending reviews can be deleted.`,
      }, { status: 400, headers: corsHeaders() });
    }

    await db.performanceReview.delete({ where: { id } });

    // Audit log
    try {
      await db.auditLog.create({
        data: {
          userId: decoded.userId as string,
          action: 'DELETE_PROBATION_REVIEW',
          module: 'employees',
          details: `Deleted probation review ${id}`,
        },
      });
    } catch { /* non-critical */ }

    return NextResponse.json({ success: true, message: 'Probation review deleted successfully' }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Delete probation review error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
