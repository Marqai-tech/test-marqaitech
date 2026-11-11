import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { getAuthInfo } from '@/lib/companyScope';
import { hashPassword } from '@/lib/auth';

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

      const existingEmp = await db.employee.findFirst({ where: { email: pb.companyEmail || pb.candidateEmail }, select: { id: true } }).catch(() => null);
      if (existingEmp) return NextResponse.json({ error: 'Employee with this email already exists' }, { status: 409, headers: CORS });

      let empCode = 'Marq001';
      try {
        const existingCodes = await db.$queryRawUnsafe(`SELECT "employeeId" FROM "Employee" WHERE "employeeId" ILIKE 'Marq%' ORDER BY "employeeId" DESC LIMIT 1`) as any[];
        if (existingCodes.length > 0 && existingCodes[0]?.employeeId) {
          const match = existingCodes[0].employeeId.match(/^Marq(\d+)$/i);
          if (match) { const next = parseInt(match[1],10)+1; empCode = `Marq${next<1000?String(next).padStart(3,'0'):String(next)}`; }
        }
      } catch {}

      let deptId = pb.departmentId;
      if (!deptId) { const d = await db.department.findFirst({ select: { id: true } }).catch(() => null); deptId = d?.id || null; }
      let desigId = pb.designationId;
      if (!desigId) { const d = await db.designation.findFirst({ select: { id: true } }).catch(() => null); desigId = d?.id || null; }

      const firstName = (pb.candidateName||'New').split(' ')[0];
      const lastName = (pb.candidateName||'Employee').split(' ').slice(1).join(' ') || 'Employee';
      const empData: Record<string, unknown> = { employeeId: empCode, firstName, lastName, email: pb.companyEmail || pb.candidateEmail, phone: pb.candidatePhone || null, dateOfJoining: pb.joiningDate || new Date(), employeeStatus: 'active', status: 'active' };
      if (deptId) empData.departmentId = deptId;
      if (desigId) empData.designationId = desigId;
      if (pb.reportingManagerId) empData.reportingManagerId = pb.reportingManagerId;

      const employee = await db.employee.create({ data: empData as any }).catch((e:any) => { throw new Error(`Employee create failed: ${e.message}`); });

      let user = await db.user.findUnique({ where: { email: pb.companyEmail || pb.candidateEmail }, select: { id: true, role: true, status: true } }).catch(() => null);
      if (!user) {
        const hashed = await hashPassword('Welcome@123');
        user = await db.user.create({ data: { email: pb.companyEmail || pb.candidateEmail, password: hashed, name: pb.candidateName, role: 'employee', status: 'active', tenantId: auth.tenantId || null } });
      } else {
        if (user.role !== 'employee' || !user.role) { await db.user.update({ where: { id: user.id }, data: { role: 'employee', status: 'active' } }); }
      }
      if (user) { await db.employee.update({ where: { id: employee.id }, data: { userId: user.id } }).catch(() => null); }

      await db.$executeRawUnsafe(`UPDATE "PreboardingCandidate" SET "onboardingStatus"='active_employee',"status"='joined',"employeeId"=$1,"activatedAt"=NOW(),"backgroundCheckStatus"='cleared',"updatedAt"=NOW() WHERE "id"=$2`, employee.id, preboardingCandidateId).catch(() => 0);

      try {
        const { sendEmail } = await import('@/lib/email');
        await sendEmail({ to: pb.candidateEmail, subject: 'Welcome to the team! Your employee account is now active',
          html: `<h2>Welcome aboard, ${firstName}!</h2><p>BGV approved. Account active.</p><table><tr><td>Employee ID:</td><td>${empCode}</td></tr><tr><td>Company Email:</td><td>${pb.companyEmail||pb.candidateEmail}</td></tr><tr><td>Password:</td><td>Welcome@123</td></tr><tr><td>Login URL:</td><td>https://3boxes-hrms-beta.vercel.app/login</td></tr></table>` }).catch(() => null);
      } catch {}

      if (user) { try { await db.notification.create({ data: { userId: user.id, title: 'Welcome to the team!', message: `Account active. Employee ID: ${empCode}`, type: 'info', category: 'onboarding', isRead: false } }).catch(() => null); } catch {} }

      await db.auditLog.create({ data: { userId: auth.userId, action: 'BGV_APPROVED_EMPLOYEE_ACTIVATED', module: 'onboarding', details: `BGV approved for ${pb.candidateName}. Employee ID: ${empCode}` } }).catch(() => null);
      return NextResponse.json({ message: `BGV Approved! Employee ID: ${empCode}.`, bgvStatus: 'approved', onboardingStatus: 'active_employee', employeeId: employee.id, employeeCode: empCode }, { headers: CORS });

    } else if (bgvStatus === 'failed') {
      await db.$executeRawUnsafe(`UPDATE "PreboardingCandidate" SET "onboardingStatus"='bgv_failed',"updatedAt"=NOW() WHERE "id"=$1`, preboardingCandidateId).catch(() => 0);
      await db.$executeRawUnsafe(`INSERT INTO "CandidateMessage" ("id","candidateEmail","senderRole","message","createdAt","updatedAt") VALUES ($1,$2,'system',$3,NOW(),NOW())`, `msg-${Date.now()}`, pb.candidateEmail, `Your background verification has not been cleared. Please contact HR.`).catch(() => 0);
      await db.auditLog.create({ data: { userId: auth.userId, action: 'BGV_FAILED', module: 'onboarding', details: `BGV failed for ${pb.candidateName}` } }).catch(() => null);
      return NextResponse.json({ message: 'BGV Failed.', bgvStatus: 'failed', onboardingStatus: 'bgv_failed' }, { headers: CORS });

    } else {
      await db.auditLog.create({ data: { userId: auth.userId, action: `BGV_STATUS_${bgvStatus.toUpperCase()}`, module: 'onboarding', details: `BGV status → ${bgvStatus}` } }).catch(() => null);
      return NextResponse.json({ message: `BGV status: ${bgvStatus}`, bgvStatus }, { headers: CORS });
    }
  } catch (error) {
    console.error('BGV update error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500, headers: CORS });
  }
}
