import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { getAuthInfo } from '@/lib/companyScope';

const CORS = { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization' };
export async function OPTIONS() { return NextResponse.json({}, { headers: CORS }); }

/** POST /api/bgv/requests/[id]/approve — HR approves BGV → triggers employee activation */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(req);
  try {
    const auth = await getAuthInfo(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
    const isAdmin = ['super_admin','tenant_admin','ceo','admin','hr_admin','company_hr_admin'].includes(auth.role);
    if (!isAdmin) return NextResponse.json({ error: 'Forbidden — HR/Admin only' }, { status: 403, headers: CORS });

    const { id: requestId } = await params;
    const body = await req.json().catch(() => ({}));
    const reason = String(body?.reason || '').slice(0, 1000);
    const reqRows = await db.$queryRawUnsafe(`SELECT * FROM "BgvRequest" WHERE "id"=$1 LIMIT 1`, requestId).catch(() => []) as any[];
    if (reqRows.length === 0) return NextResponse.json({ error: 'Request not found' }, { status: 404, headers: CORS });
    const bgvReq = reqRows[0];
    if (bgvReq.status === 'approved_by_hr') return NextResponse.json({ error: 'Already approved' }, { status: 409, headers: CORS });
    if (['rejected_by_hr', 'cancelled'].includes(bgvReq.status)) {
      return NextResponse.json({ error: `Case is ${bgvReq.status} — it cannot be approved.` }, { status: 409, headers: CORS });
    }

    // Update the LATEST submitted report version + request status.
    await db.$executeRawUnsafe(`UPDATE "BgvReport" SET "hrDecision"='approved',"hrDecisionById"=$1,"hrDecisionAt"=NOW(),"hrDecisionReason"=$2 WHERE "bgvRequestId"=$3 AND "version" = (SELECT MAX("version") FROM "BgvReport" WHERE "bgvRequestId"=$3)`, auth.userId, reason || null, requestId).catch(() => 0);
    await db.$executeRawUnsafe(`UPDATE "BgvRequest" SET "status"='approved_by_hr',"updatedAt"=NOW() WHERE "id"=$1`, requestId);

    // Notify vendor admin(s) + investigator of the final approval.
    try {
      const { notifyBgvEvent } = await import('@/lib/bgv');
      const recipients = await db.$queryRawUnsafe(
        `SELECT "email","id" FROM "VendorUser" WHERE "vendorCompanyId"=$1 AND "status"='active' AND ("role"='vendor_admin' OR "id"=$2) LIMIT 5`,
        bgvReq.vendorCompanyId, bgvReq.assignedVendorUserId || '__none__',
      ).catch(() => []) as any[];
      for (const r of recipients) {
        await notifyBgvEvent({
          db, event: 'approved', recipient: r.email, bgvRequestId: requestId,
          vendorCompanyId: bgvReq.vendorCompanyId, vendorUserId: r.id,
          subject: `BGV decision: approved — case ${bgvReq.caseNumber || requestId}`,
          html: `<p>HR approved BGV case <b>${bgvReq.caseNumber || requestId}</b> (${bgvReq.candidateName || bgvReq.candidateEmail}).</p><p>The vendor report v-latest was accepted; the case is closed. Candidate onboarding is handled by HR.</p>`,
        });
      }
    } catch { /* notification must never fail the API */ }

    // If there's a linked PreboardingCandidate, trigger activation
    if (bgvReq.preboardingCandidateId) {
      const pbRows = await db.$queryRawUnsafe(`SELECT * FROM "PreboardingCandidate" WHERE "id"=$1 LIMIT 1`, bgvReq.preboardingCandidateId).catch(() => []) as any[];
      if (pbRows.length > 0) {
        const pb = pbRows[0];
        if (pb.onboardingStatus !== 'active_employee') {
          // ─── Generate sequential MarqNNN employee code ───
          let empCode = 'Marq001';
          try {
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
          } catch {}

          let deptId = pb.departmentId;
          if (!deptId) { const d = await db.$queryRawUnsafe(`SELECT id FROM "Department" ORDER BY "createdAt" ASC LIMIT 1`).catch(() => []) as any[]; deptId = d[0]?.id || null; }
          let desigId = pb.designationId;
          if (!desigId) { const d = await db.$queryRawUnsafe(`SELECT id FROM "Designation" ORDER BY "createdAt" ASC LIMIT 1`).catch(() => []) as any[]; desigId = d[0]?.id || null; }

          const firstName = (pb.candidateName||'New').split(' ')[0];
          const lastName = (pb.candidateName||'Employee').split(' ').slice(1).join(' ') || 'Employee';
          const userEmail = (pb.companyEmail || pb.candidateEmail || '').toLowerCase();

          // ─── Ensure User row exists ───
          let user = await db.user.findUnique({ where: { email: userEmail }, select: { id: true, role: true, status: true } }).catch(() => null);
          if (!user) {
            const { hashPassword } = await import('@/lib/auth');
            const hashed = await hashPassword('Welcome@123');
            user = await db.user.create({ data: { email: userEmail, password: hashed, name: pb.candidateName, role: 'employee', status: 'active', tenantId: auth.tenantId || null } }).catch((e:any) => { throw new Error(`User create: ${e.message}`); }) as any;
          } else {
            if (user.role !== 'employee' || user.status !== 'active') {
              await db.user.update({ where: { id: user.id }, data: { role: 'employee', status: 'active' } }).catch(() => null);
            }
          }
          if (!user) {
            // create failed or missing — abort the activation cleanly instead of writing orphan rows
            return NextResponse.json({ error: 'Unable to resolve or create the candidate user account for activation' }, { status: 500, headers: CORS });
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
              phone: pb.candidatePhone || null, userId: user.id,
              departmentId: deptId, designationId: desigId,
              reportingManagerId: pb.reportingManagerId || null,
              dateOfJoining: pb.joiningDate ? new Date(pb.joiningDate) : new Date(),
              employeeStatus: 'probation', employeeType: 'full_time',
              status: 'active', credentialsStatus: 'active',
            };
            const employee = await db.employee.create({ data: empData as any }).catch((e:any) => { throw new Error(`Employee create: ${e.message}`); });
            employeeId = employee.id;
          }

          await db.$executeRawUnsafe(`UPDATE "PreboardingCandidate" SET "onboardingStatus"='active_employee',"status"='joined',"employeeId"=$1,"activatedAt"=NOW(),"backgroundCheckStatus"='cleared',"updatedAt"=NOW() WHERE "id"=$2`, employeeId, pb.id).catch(() => 0);

          // Send activation email to personal email
          try {
            const { sendEmail } = await import('@/lib/email');
            await sendEmail({ to: pb.candidateEmail, subject: 'Welcome! Your employee account is active',
              html: `<h2>Welcome aboard, ${firstName}!</h2>
                     <p>BGV approved. Your account is active.</p>
                     <table style="border-collapse:collapse;font-family:Arial;">
                       <tr><td style="padding:6px 12px;background:#F0FDFA;border:1px solid #99F6E4;"><b>Employee ID:</b></td><td style="padding:6px 12px;border:1px solid #99F6E4;"><b style="color:#0F766E;font-size:16px;">${empCode}</b></td></tr>
                       <tr><td style="padding:6px 12px;background:#F0FDFA;border:1px solid #99F6E4;"><b>Company Email:</b></td><td style="padding:6px 12px;border:1px solid #99F6E4;">${pb.companyEmail||pb.candidateEmail}</td></tr>
                       <tr><td style="padding:6px 12px;background:#F0FDFA;border:1px solid #99F6E4;"><b>Password:</b></td><td style="padding:6px 12px;border:1px solid #99F6E4;">Welcome@123</td></tr>
                       <tr><td style="padding:6px 12px;background:#F0FDFA;border:1px solid #99F6E4;"><b>Login URL:</b></td><td style="padding:6px 12px;border:1px solid #99F6E4;"><a href="https://3boxes-hrms-beta.vercel.app/login">https://3boxes-hrms-beta.vercel.app/login</a></td></tr>
                     </table>
                     <p style="margin-top:16px;font-size:13px;color:#475569;">Log in with either your <b>Employee ID</b> (${empCode}) or your <b>company email</b> (${pb.companyEmail || pb.candidateEmail}). Your password is <code>Welcome@123</code>.</p>` }).catch(() => null);
          } catch {}

          if (user && auth.tenantId) { try { await db.notification.create({ data: { userId: user.id, tenantId: auth.tenantId, title: 'Welcome!', message: `Account active. Employee ID: ${empCode}`, type: 'success', category: 'onboarding', isRead: false, isEmailSent: false } }).catch(() => null); } catch {} }

          await db.auditLog.create({ data: { userId: auth.userId, action: 'BGV_APPROVED_EMPLOYEE_ACTIVATED', module: 'bgv', details: `BGV approved for ${pb.candidateName}. Employee ID: ${empCode} (upgrade=${isUpgrade})` } }).catch(() => null);
          return NextResponse.json({ message: `BGV Approved! Employee ID: ${empCode}. Activation email sent.`, employeeCode: empCode, status: 'approved_by_hr', isUpgrade }, { headers: CORS });
        }
      }
    }

    await db.auditLog.create({ data: { userId: auth.userId, action: 'BGV_APPROVED', module: 'bgv', details: `Approved BGV request ${requestId}` } }).catch(() => null);
    return NextResponse.json({ message: 'BGV approved.', status: 'approved_by_hr' }, { headers: CORS });
  } catch (error) {
    console.error('BGV approve error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500, headers: CORS });
  }
}
