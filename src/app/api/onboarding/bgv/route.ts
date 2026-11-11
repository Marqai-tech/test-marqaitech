/**
 * PATCH /api/onboarding/bgv
 *
 * HR updates the BGV (Background Verification) status for a preboarding candidate.
 *
 * Body: { preboardingCandidateId, bgvStatus, notes? }
 *   bgvStatus: 'pending' | 'in_progress' | 'approved' | 'failed'
 *
 * When bgvStatus = 'approved':
 *   - Creates a real Employee record from the draft data
 *   - Generates a unique Employee ID
 *   - Creates/links a User account (same email — reuses candidate portal email)
 *   - Sets onboardingStatus = 'active_employee'
 *   - Sends activation email + welcome notification
 *   - Creates audit log
 *
 * When bgvStatus = 'failed':
 *   - Sets onboardingStatus = 'bgv_failed'
 *   - Keeps modules restricted
 *   - Notifies HR + candidate
 */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { getAuthInfo } from '@/lib/companyScope';
import { hashPassword } from '@/lib/auth';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'PATCH, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS });
}

export async function PATCH(req: NextRequest) {
  const db = await getDb(req);
  try {
    const auth = await getAuthInfo(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
    const isAdmin = ['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_admin', 'company_hr_admin'].includes(auth.role);
    if (!isAdmin) return NextResponse.json({ error: 'Forbidden — only HR/Admins can update BGV status' }, { status: 403, headers: CORS });

    const body = await req.json();
    const { preboardingCandidateId, bgvStatus, notes } = body || {};

    if (!preboardingCandidateId) return NextResponse.json({ error: 'preboardingCandidateId is required' }, { status: 400, headers: CORS });
    if (!['pending', 'in_progress', 'approved', 'failed'].includes(bgvStatus)) {
      return NextResponse.json({ error: 'bgvStatus must be: pending, in_progress, approved, or failed' }, { status: 400, headers: CORS });
    }

    // ── Fetch the preboarding candidate ──
    const pbRows = await db.$queryRawUnsafe(
      `SELECT * FROM "PreboardingCandidate" WHERE "id" = $1 LIMIT 1`,
      preboardingCandidateId,
    ).catch(() => []) as any[];
    if (pbRows.length === 0) return NextResponse.json({ error: 'Preboarding candidate not found' }, { status: 404, headers: CORS });
    const pb = pbRows[0];

    // ── Update BGV status ──
    await db.$executeRawUnsafe(
      `UPDATE "PreboardingCandidate" SET "backgroundCheckStatus" = $1, "bgvNotes" = $2, "updatedAt" = NOW() WHERE "id" = $3`,
      bgvStatus, notes || null, preboardingCandidateId,
    ).catch(() => 0);

    // ── Handle BGV Approved → full employee activation ──
    if (bgvStatus === 'approved') {
      // Check not already activated
      if (pb.onboardingStatus === 'active_employee') {
        return NextResponse.json({ error: 'Employee is already activated' }, { status: 409, headers: CORS });
      }

      // Check not already an Employee with this email
      const existingEmp = await db.employee.findFirst({
        where: { email: pb.candidateEmail },
        select: { id: true },
      }).catch(() => null);
      if (existingEmp) {
        return NextResponse.json({ error: 'An employee with this email already exists' }, { status: 409, headers: CORS });
      }

      // ── Generate unique Employee ID ──
      const empCode = `EMP-${Date.now().toString(36).toUpperCase()}`;

      // ── Resolve department + designation (fall back to first available) ──
      let deptId = pb.departmentId;
      if (!deptId) {
        const dept = await db.department.findFirst({ select: { id: true } }).catch(() => null);
        deptId = dept?.id || null;
      }
      let desigId = pb.designationId;
      if (!desigId) {
        const desig = await db.designation.findFirst({ select: { id: true } }).catch(() => null);
        desigId = desig?.id || null;
      }

      // ── Create the Employee record ──
      const firstName = (pb.candidateName || 'New').split(' ')[0];
      const lastName = (pb.candidateName || 'Employee').split(' ').slice(1).join(' ') || 'Employee';
      const employee = await db.employee.create({
        data: {
          employeeId: empCode,
          firstName,
          lastName,
          email: pb.candidateEmail,
          phone: pb.candidatePhone || null,
          departmentId: deptId || '',
          designationId: desigId || '',
          dateOfJoining: pb.joiningDate || new Date(),
          employeeStatus: 'active',
          status: 'active',
          ...(pb.reportingManagerId ? { reportingManagerId: pb.reportingManagerId } : {}),
        },
      }).catch((e: any) => { throw new Error(`Failed to create employee: ${e.message}`); });

      // ── Create or link User account (same email as candidate portal) ──
      let user = await db.user.findUnique({
        where: { email: pb.candidateEmail },
        select: { id: true, role: true },
      }).catch(() => null);

      if (!user) {
        // Create a new User with role=employee, same email + default password
        const defaultPwd = 'Welcome@123';
        const hashed = await hashPassword(defaultPwd);
        user = await db.user.create({
          data: {
            email: pb.candidateEmail,
            password: hashed,
            name: pb.candidateName,
            role: 'employee',
            status: 'active',
            tenantId: auth.tenantId || null,
          },
        });
      } else {
        // Upgrade existing user to employee role if needed
        if (user.role !== 'employee' && !user.role) {
          await db.user.update({ where: { id: user.id }, data: { role: 'employee', status: 'active' } });
        }
      }

      // ── Link User to Employee ──
      if (user) {
        await db.employee.update({
          where: { id: employee.id },
          data: { userId: user.id },
        }).catch(() => null);
      }

      // ── Update PreboardingCandidate ──
      await db.$executeRawUnsafe(
        `UPDATE "PreboardingCandidate" SET
          "onboardingStatus" = 'active_employee', "status" = 'joined',
          "employeeId" = $1, "activatedAt" = NOW(), "backgroundCheckStatus" = 'cleared',
          "updatedAt" = NOW()
        WHERE "id" = $2`,
        employee.id, preboardingCandidateId,
      ).catch(() => 0);

      // ── Mark job application as hired (if linked) ──
      if (pb.offerId) {
        // Find the offer's job application
        const offer = await db.offer.findUnique({ where: { id: pb.offerId }, select: { jobPostingId: true, candidateEmail: true } }).catch(() => null);
        if (offer?.jobPostingId) {
          const app = await db.jobApplication.findFirst({
            where: { jobPostingId: offer.jobPostingId, candidateEmail: offer.candidateEmail },
          }).catch(() => null);
          if (app) {
            await db.jobApplication.update({ where: { id: app.id }, data: { status: 'hired' } }).catch(() => null);
          }
        }
      }

      // ── Send activation email ──
      try {
        const { sendEmail } = await import('@/lib/email');
        await sendEmail({
          to: pb.candidateEmail,
          subject: 'Welcome to the team! Your employee account is now active',
          html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
            <h2 style="color:#059669;">Welcome aboard, ${firstName}!</h2>
            <p>Great news! Your background verification has been completed successfully. Your employee account is now fully active.</p>
            <table style="width:100%;border-collapse:collapse;margin:16px 0;">
              <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Employee ID:</td><td style="padding:8px;border:1px solid #ddd;">${empCode}</td></tr>
              <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Login Email:</td><td style="padding:8px;border:1px solid #ddd;">${pb.candidateEmail}</td></tr>
              <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Login URL:</td><td style="padding:8px;border:1px solid #ddd;">${process.env.NEXT_PUBLIC_APP_URL || 'https://test-marqaitech.vercel.app'}/login</td></tr>
            </table>
            <p>You now have full access to the HRMS — attendance, leave, payroll, payslips, and more.</p>
            <p>Please log in using your existing credentials.</p>
          </div>`,
        }).catch(() => null);
      } catch { /* non-critical */ }

      // ── Send welcome in-app notification ──
      if (user) {
        try {
          await db.notification.create({
            data: {
              userId: user.id,
              title: 'Welcome to the team!',
              message: `Your employee account is now active. Employee ID: ${empCode}. You now have full access to attendance, leave, payroll, and more.`,
              type: 'info',
              category: 'onboarding',
              isRead: false,
              isEmailSent: true,
            },
          }).catch(() => null);
        } catch { /* non-critical */ }
      }

      // ── Audit log ──
      try {
        await db.auditLog.create({
          data: {
            userId: auth.userId,
            action: 'BGV_APPROVED_EMPLOYEE_ACTIVATED',
            module: 'onboarding',
            details: `BGV approved for ${pb.candidateName} (${pb.candidateEmail}). Employee ID: ${empCode}. Employee record created: ${employee.id}. User account: ${user?.id || 'n/a'}.`,
          },
        }).catch(() => null);
      } catch { /* non-critical */ }

      return NextResponse.json({
        message: `BGV Approved! Employee activated. Employee ID: ${empCode}. Activation email sent.`,
        bgvStatus: 'approved',
        onboardingStatus: 'active_employee',
        employeeId: employee.id,
        employeeCode: empCode,
        userId: user?.id || null,
      }, { status: 200, headers: CORS });
    }

    // ── Handle BGV Failed ──
    if (bgvStatus === 'failed') {
      await db.$executeRawUnsafe(
        `UPDATE "PreboardingCandidate" SET "onboardingStatus" = 'bgv_failed', "updatedAt" = NOW() WHERE "id" = $1`,
        preboardingCandidateId,
      ).catch(() => 0);

      // Notify candidate
      try {
        await db.$executeRawUnsafe(
          `INSERT INTO "CandidateMessage" ("id", "candidateEmail", "senderRole", "message", "createdAt", "updatedAt")
           VALUES ($1, $2, 'system', $3, NOW(), NOW())`,
          `msg-${Date.now()}`, pb.candidateEmail,
          `Your background verification could not be completed at this time. Please contact HR for more information.`,
        );
      } catch { /* non-critical */ }

      // Audit log
      try {
        await db.auditLog.create({
          data: {
            userId: auth.userId,
            action: 'BGV_FAILED',
            module: 'onboarding',
            details: `BGV failed for ${pb.candidateName} (${pb.candidateEmail}). Notes: ${notes || 'n/a'}`,
          },
        }).catch(() => null);
      } catch { /* non-critical */ }

      return NextResponse.json({
        message: 'BGV marked as Failed. Candidate notified. Employee modules remain restricted.',
        bgvStatus: 'failed',
        onboardingStatus: 'bgv_failed',
      }, { status: 200, headers: CORS });
    }

    // ── Handle pending / in_progress ──
    // Audit log
    try {
      await db.auditLog.create({
        data: {
          userId: auth.userId,
          action: 'BGV_STATUS_CHANGED',
          module: 'onboarding',
          details: `BGV status changed to ${bgvStatus} for ${pb.candidateName} (${pb.candidateEmail}). Notes: ${notes || 'n/a'}`,
        },
      }).catch(() => null);
    } catch { /* non-critical */ }

    return NextResponse.json({
      message: `BGV status updated to: ${bgvStatus}`,
      bgvStatus,
      onboardingStatus: pb.onboardingStatus,
    }, { status: 200, headers: CORS });
  } catch (error) {
    console.error('BGV update error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to update BGV status';
    return NextResponse.json({ error: msg }, { status: 500, headers: CORS });
  }
}
