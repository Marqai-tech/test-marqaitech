import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { getAuthInfo } from '@/lib/companyScope';
import { hashPassword } from '@/lib/auth';
import { findJoiningBlockers } from '@/lib/onboarding-documents';

const CORS = { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'PATCH, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization' };
export async function OPTIONS() { return NextResponse.json({}, { headers: CORS }); }

export async function PATCH(req: NextRequest) {
  const db = await getDb(req);
  try {
    const auth = await getAuthInfo(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
    const isAdmin = ['super_admin','tenant_admin','ceo','admin','hr_admin','company_hr_admin'].includes(auth.role);
    if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: CORS });

    const body = await req.json();
    const { preboardingCandidateId, bgvStatus, notes } = body || {};
    if (!preboardingCandidateId) return NextResponse.json({ error: 'preboardingCandidateId required' }, { status: 400, headers: CORS });
    if (!['pending','in_progress','approved','failed'].includes(bgvStatus))
      return NextResponse.json({ error: 'bgvStatus must be: pending, in_progress, approved, or failed' }, { status: 400, headers: CORS });

    const pbRows = await db.$queryRawUnsafe(`SELECT * FROM "PreboardingCandidate" WHERE "id" = $1 LIMIT 1`, preboardingCandidateId).catch(() => []) as any[];
    if (pbRows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: CORS });
    const pb = pbRows[0];

    const dbStatus = bgvStatus === 'approved' ? 'cleared' : bgvStatus === 'in_progress' ? 'in_progress' : bgvStatus === 'failed' ? 'failed' : 'pending';
    await db.$executeRawUnsafe(`UPDATE "PreboardingCandidate" SET "backgroundCheckStatus"=$1,"bgvNotes"=$2,"updatedAt"=NOW() WHERE "id"=$3`, dbStatus, notes||null, preboardingCandidateId).catch(() => 0);

    if (bgvStatus === 'approved') {
      if (pb.onboardingStatus === 'active_employee') return NextResponse.json({ error: 'Already activated' }, { status: 409, headers: CORS });

      // BRD 5.9/6.2 — employee activation requires every required document
      // approved; rejected/pending required docs block BGV approval.
      const blockers = await findJoiningBlockers(db, preboardingCandidateId);
      if (blockers.length) {
        return NextResponse.json({
          error: `Cannot approve BGV / activate employee — ${blockers.length} required document${blockers.length > 1 ? 's are' : ' is'} not approved: ${blockers.map((b) => `${b.documentLabel} (${b.status})`).join(', ')}. Resolve document verification first (BRD 5.9).`,
          code: 'DOCUMENTS_NOT_APPROVED', blockers,
        }, { status: 409, headers: CORS });
      }

      // ─── Generate sequential MarqNNN employee code ───
      let empCode = 'Marq001';
      try {
        // Only consider Marq-prefixed codes (ignore PROV- placeholders). Sort by numeric suffix DESC.
        const existingCodes = await db.$queryRawUnsafe(
          `SELECT "employeeId" FROM "Employee"
           WHERE "employeeId" ~ '^Marq[0-9]+$'
           ORDER BY CAST(SUBSTRING("employeeId" FROM 'Marq([0-9]+)') AS INTEGER) DESC
           LIMIT 1`
        ) as any[];
        if (existingCodes.length > 0 && existingCodes[0]?.employeeId) {
          const match = existingCodes[0].employeeId.match(/^Marq(\d+)$/i);
          if (match) { const next = parseInt(match[1],10)+1; empCode = `Marq${next<1000?String(next).padStart(3,'0'):String(next)}`; }
        }
      } catch (e:any) { console.warn('[BGV approve] Could not query latest Marq code:', e.message); }

      let deptId = pb.departmentId;
      if (!deptId) { const d = await db.$queryRawUnsafe(`SELECT id FROM "Department" ORDER BY "createdAt" ASC LIMIT 1`).catch(() => []) as any[]; deptId = d[0]?.id || null; }
      let desigId = pb.designationId;
      if (!desigId) { const d = await db.$queryRawUnsafe(`SELECT id FROM "Designation" ORDER BY "createdAt" ASC LIMIT 1`).catch(() => []) as any[]; desigId = d[0]?.id || null; }

      const firstName = (pb.candidateName||'New').split(' ')[0];
      const lastName = (pb.candidateName||'Employee').split(' ').slice(1).join(' ') || 'Employee';
      const userEmail = (pb.companyEmail || pb.candidateEmail || '').toLowerCase();

      // ─── Ensure User row exists (created at convert-to-draft time) ───
      let user = await db.user.findUnique({ where: { email: userEmail }, select: { id: true, role: true, status: true } }).catch(() => null);
      if (!user) {
        const hashed = await hashPassword('Welcome@123');
        user = await db.user.create({ data: { email: userEmail, password: hashed, name: pb.candidateName, role: 'employee', status: 'active', tenantId: auth.tenantId || null } }).catch((e:any) => { throw new Error(`User create failed: ${e.message}`); }) as any;
      } else {
        if (user.role !== 'employee' || user.status !== 'active') {
          await db.user.update({ where: { id: user.id }, data: { role: 'employee', status: 'active' } }).catch(() => null);
        }
      }

      // ─── Determine if there's already a provisional Employee to upgrade ───
      const existingEmpRows = await db.$queryRawUnsafe(
        `SELECT id, "employeeId" FROM "Employee" WHERE "id" = $1 OR "email" = $2 LIMIT 1`,
        pb.employeeId || '__none__', userEmail,
      ).catch(() => []) as any[];

      let employeeId: string;
      let isUpgrade = false;

      if (existingEmpRows.length > 0) {
        // UPDATE existing provisional Employee — assign Marq code + activate
        const existingEmp = existingEmpRows[0];
        employeeId = existingEmp.id;
        isUpgrade = true;
        await db.$executeRawUnsafe(
          `UPDATE "Employee" SET "employeeId" = $1, "status" = 'active', "employeeStatus" = 'probation',
                                  "userId" = COALESCE("userId", $2),
                                  "departmentId" = $3, "designationId" = $4,
                                  "reportingManagerId" = $5,
                                  "dateOfJoining" = $6,
                                  "firstName" = $7, "lastName" = $8,
                                  "phone" = COALESCE("phone", $9),
                                  "credentialsStatus" = 'active',
                                  "updatedAt" = NOW()
           WHERE "id" = $10`,
          empCode, user.id, deptId, desigId, pb.reportingManagerId||null,
          pb.joiningDate ? new Date(pb.joiningDate) : new Date(),
          firstName, lastName, pb.candidatePhone||null,
          employeeId,
        ).catch((e:any) => { throw new Error(`Employee upgrade failed: ${e.message}`); });
      } else {
        // CREATE a new Employee (fallback for legacy flow without mark-joined)
        const empData: Record<string, unknown> = {
          employeeId: empCode, firstName, lastName, email: userEmail,
          phone: pb.candidatePhone || null,
          userId: user.id,
          departmentId: deptId, designationId: desigId,
          reportingManagerId: pb.reportingManagerId || null,
          dateOfJoining: pb.joiningDate ? new Date(pb.joiningDate) : new Date(),
          employeeStatus: 'probation', employeeType: 'full_time',
          status: 'active', credentialsStatus: 'active',
        };
        const employee = await db.employee.create({ data: empData as any }).catch((e:any) => { throw new Error(`Employee create failed: ${e.message}`); });
        employeeId = employee.id;
      }

      await db.$executeRawUnsafe(
        `UPDATE "PreboardingCandidate" SET "onboardingStatus"='active_employee',"status"='joined',"employeeId"=$1,"activatedAt"=NOW(),"backgroundCheckStatus"='cleared',"updatedAt"=NOW() WHERE "id"=$2`,
        employeeId, preboardingCandidateId,
      ).catch(() => 0);

      // ─── Send activation email to personal email ───
      try {
        const { sendEmail } = await import('@/lib/email');
        await sendEmail({
          to: pb.candidateEmail,
          subject: 'Welcome to the team! Your employee account is now active',
          html: `<h2>Welcome aboard, ${firstName}!</h2>
                 <p>Your background verification has been approved. Your employee account is now active.</p>
                 <table style="border-collapse:collapse;font-family:Arial;">
                   <tr><td style="padding:6px 12px;background:#F0FDFA;border:1px solid #99F6E4;"><b>Employee ID:</b></td><td style="padding:6px 12px;border:1px solid #99F6E4;"><b style="color:#0F766E;font-size:16px;">${empCode}</b></td></tr>
                   <tr><td style="padding:6px 12px;background:#F0FDFA;border:1px solid #99F6E4;"><b>Company Email:</b></td><td style="padding:6px 12px;border:1px solid #99F6E4;">${pb.companyEmail || pb.candidateEmail}</td></tr>
                   <tr><td style="padding:6px 12px;background:#F0FDFA;border:1px solid #99F6E4;"><b>Password:</b></td><td style="padding:6px 12px;border:1px solid #99F6E4;">Welcome@123</td></tr>
                   <tr><td style="padding:6px 12px;background:#F0FDFA;border:1px solid #99F6E4;"><b>Login URL:</b></td><td style="padding:6px 12px;border:1px solid #99F6E4;"><a href="https://3boxes-hrms-beta.vercel.app/login">https://3boxes-hrms-beta.vercel.app/login</a></td></tr>
                 </table>
                 <p style="margin-top:16px;font-size:13px;color:#475569;">You can now log in with either your <b>Employee ID</b> (${empCode}) or your <b>company email</b> (${pb.companyEmail || pb.candidateEmail}). Your password is <code>Welcome@123</code> — please change it after your first login.</p>`,
        }).catch(() => null);
      } catch (e:any) { console.warn('[BGV approve] Email send failed:', e.message); }

      // ─── In-app notification ───
      if (user) {
        try {
          await db.notification.create({ data: {
            userId: user.id, tenantId: auth.tenantId,
            title: 'Welcome to the team!',
            message: `Account active. Employee ID: ${empCode}. Log in with Marq ID + Welcome@123.`,
            type: 'success', category: 'onboarding', isRead: false, isEmailSent: false,
          } }).catch(() => null);
        } catch {}
      }

      await db.auditLog.create({ data: { userId: auth.userId, action: 'BGV_APPROVED_EMPLOYEE_ACTIVATED', module: 'onboarding', details: `BGV approved for ${pb.candidateName}. Employee ID: ${empCode} (upgrade=${isUpgrade})` } }).catch(() => null);

      return NextResponse.json({
        message: `BGV Approved! Employee ID: ${empCode}.`,
        bgvStatus: 'approved',
        onboardingStatus: 'active_employee',
        employeeId,
        employeeCode: empCode,
        loginEmail: pb.companyEmail || pb.candidateEmail,
        isUpgrade,
      }, { headers: CORS });

    } else if (bgvStatus === 'failed') {
      await db.$executeRawUnsafe(`UPDATE "PreboardingCandidate" SET "onboardingStatus"='bgv_failed',"updatedAt"=NOW() WHERE "id"=$1`, preboardingCandidateId).catch(() => 0);
      await db.$executeRawUnsafe(`INSERT INTO "CandidateMessage" ("id","candidateEmail","senderRole","message","createdAt","updatedAt") VALUES ($1,$2,'system',$3,NOW(),NOW())`, `msg-${Date.now()}`, pb.candidateEmail, `Your background verification has not been cleared. Please contact HR.`).catch(() => 0);
      await db.auditLog.create({ data: { userId: auth.userId, action: 'BGV_FAILED', module: 'onboarding', details: `BGV failed for ${pb.candidateName}` } }).catch(() => null);
      return NextResponse.json({ message: 'BGV Failed. Employee NOT terminated.', bgvStatus: 'failed', onboardingStatus: 'bgv_failed' }, { headers: CORS });

    } else {
      await db.auditLog.create({ data: { userId: auth.userId, action: `BGV_STATUS_${bgvStatus.toUpperCase()}`, module: 'onboarding', details: `BGV status → ${bgvStatus}` } }).catch(() => null);
      return NextResponse.json({ message: `BGV status: ${bgvStatus}`, bgvStatus }, { headers: CORS });
    }
  } catch (error) {
    console.error('BGV update error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500, headers: CORS });
  }
}
