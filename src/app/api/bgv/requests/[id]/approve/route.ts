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
    const reqRows = await db.$queryRawUnsafe(`SELECT * FROM "BgvRequest" WHERE "id"=$1 LIMIT 1`, requestId).catch(() => []) as any[];
    if (reqRows.length === 0) return NextResponse.json({ error: 'Request not found' }, { status: 404, headers: CORS });
    const bgvReq = reqRows[0];
    if (bgvReq.status === 'approved_by_hr') return NextResponse.json({ error: 'Already approved' }, { status: 409, headers: CORS });

    // Update report + request status
    await db.$executeRawUnsafe(`UPDATE "BgvReport" SET "hrDecision"='approved',"hrDecisionById"=$1,"hrDecisionAt"=NOW() WHERE "bgvRequestId"=$2 AND "status"='submitted'`, auth.userId, requestId).catch(() => 0);
    await db.$executeRawUnsafe(`UPDATE "BgvRequest" SET "status"='approved_by_hr',"updatedAt"=NOW() WHERE "id"=$1`, requestId);

    // If there's a linked PreboardingCandidate, trigger activation
    if (bgvReq.preboardingCandidateId) {
      // Call the BGV approve logic by updating the preboarding candidate
      const pbRows = await db.$queryRawUnsafe(`SELECT * FROM "PreboardingCandidate" WHERE "id"=$1 LIMIT 1`, bgvReq.preboardingCandidateId).catch(() => []) as any[];
      if (pbRows.length > 0) {
        const pb = pbRows[0];
        if (pb.onboardingStatus !== 'active_employee') {
          // Generate sequential Employee ID
          let empCode = 'Marq001';
          try {
            const existingCodes = await db.$queryRawUnsafe(`SELECT "employeeId" FROM "Employee" WHERE "employeeId" ILIKE 'Marq%' ORDER BY "employeeId" DESC LIMIT 1`) as any[];
            if (existingCodes.length > 0 && existingCodes[0]?.employeeId) {
              const match = existingCodes[0].employeeId.match(/^Marq(\d+)$/i);
              if (match) { const next = parseInt(match[1],10)+1; empCode = `Marq${next<1000?String(next).padStart(3,'0'):String(next)}`; }
            }
          } catch {}

          const firstName = (pb.candidateName||'New').split(' ')[0];
          const lastName = (pb.candidateName||'Employee').split(' ').slice(1).join(' ') || 'Employee';
          const empData: Record<string, unknown> = { employeeId: empCode, firstName, lastName, email: pb.companyEmail || pb.candidateEmail, phone: pb.candidatePhone||null, dateOfJoining: pb.joiningDate||new Date(), employeeStatus: 'active', status: 'active' };
          if (pb.departmentId) empData.departmentId = pb.departmentId;
          if (pb.designationId) empData.designationId = pb.designationId;
          if (pb.reportingManagerId) empData.reportingManagerId = pb.reportingManagerId;

          const employee = await db.employee.create({ data: empData as any }).catch((e:any) => { throw new Error(`Employee create: ${e.message}`); });

          // Link User
          let user = await db.user.findUnique({ where: { email: pb.companyEmail || pb.candidateEmail }, select: { id: true, role: true } }).catch(() => null);
          if (user) { await db.employee.update({ where: { id: employee.id }, data: { userId: user.id } }).catch(() => null); }

          await db.$executeRawUnsafe(`UPDATE "PreboardingCandidate" SET "onboardingStatus"='active_employee',"status"='joined',"employeeId"=$1,"activatedAt"=NOW(),"backgroundCheckStatus"='cleared',"updatedAt"=NOW() WHERE "id"=$2`, employee.id, pb.id).catch(() => 0);

          // Send activation email to personal email
          try {
            const { sendEmail } = await import('@/lib/email');
            await sendEmail({ to: pb.candidateEmail, subject: 'Welcome! Your employee account is active',
              html: `<h2>Welcome aboard, ${firstName}!</h2><p>BGV approved. Your account is active.</p><table><tr><td>Employee ID:</td><td>${empCode}</td></tr><tr><td>Company Email:</td><td>${pb.companyEmail||pb.candidateEmail}</td></tr><tr><td>Password:</td><td>Welcome@123</td></tr><tr><td>Login URL:</td><td>https://3boxes-hrms-beta.vercel.app/login</td></tr></table>` }).catch(() => null);
          } catch {}

          if (user) { try { await db.notification.create({ data: { userId: user.id, title: 'Welcome!', message: `Account active. Employee ID: ${empCode}`, type: 'info', category: 'onboarding', isRead: false } }).catch(() => null); } catch {} }

          await db.auditLog.create({ data: { userId: auth.userId, action: 'BGV_APPROVED_EMPLOYEE_ACTIVATED', module: 'bgv', details: `BGV approved for ${pb.candidateName}. Employee ID: ${empCode}` } }).catch(() => null);
          return NextResponse.json({ message: `BGV Approved! Employee ID: ${empCode}. Activation email sent.`, employeeCode: empCode, status: 'approved_by_hr' }, { headers: CORS });
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
