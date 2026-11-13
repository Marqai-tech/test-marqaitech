import { NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

const CORS = { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, PUT, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization' };

// Wizard sections (BRD 5.4 portal stepper — steps 2–6 collect form data)
const PORTAL_SECTIONS = ['personal', 'address', 'family', 'education', 'bank'] as const;
type PortalSection = typeof PORTAL_SECTIONS[number];

function parsePortalDetails(raw: unknown): Record<string, any> {
  if (!raw) return {};
  if (typeof raw === 'string') { try { const v = JSON.parse(raw); return v && typeof v === 'object' ? v : {}; } catch { return {}; } }
  return raw as Record<string, any>;
}

// Minimum required fields per section for Submit-to-HR validation (BRD 5.5–5.7)
const SECTION_REQUIRED: Record<PortalSection, string[]> = {
  personal: ['firstName', 'lastName', 'dateOfBirth', 'gender', 'mobileNumber'],
  address: ['permanentAddressLine1', 'permanentCity', 'permanentState', 'permanentPincode'],
  family: ['emergencyContactName', 'emergencyContactRelation', 'emergencyContactMobile'],
  education: [],            // education records list — validated separately (at least one record OR fresher flag)
  bank: ['accountHolderName', 'bankName', 'accountNumber', 'ifscCode'],
};
export async function OPTIONS() { return NextResponse.json({}, { headers: CORS }); }

/** GET /api/candidate-portal/onboarding — candidate's onboarding data (incl. attendance + leave when Employee exists) */
export async function GET(request: Request) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token' }, { status: 401, headers: CORS });
    const decoded = await verifyToken(token);
    if (!decoded || (decoded as any).kind !== 'candidate')
      return NextResponse.json({ error: 'Invalid candidate token' }, { status: 401, headers: CORS });
    const candidateEmail = (decoded as any).email as string;

    const pbRows = await db.$queryRawUnsafe(
      `SELECT * FROM "PreboardingCandidate" WHERE "candidateEmail" = $1 ORDER BY "createdAt" DESC LIMIT 1`, candidateEmail.toLowerCase(),
    ).catch(() => []) as any[];
    if (pbRows.length === 0)
      return NextResponse.json({ error: 'Not in onboarding pipeline', code: 'NOT_IN_ONBOARDING' }, { status: 404, headers: CORS });
    const pb = pbRows[0];

    const docs = await db.$queryRawUnsafe(
      `SELECT * FROM "OnboardingDocument" WHERE "preboardingCandidateId" = $1 ORDER BY "createdAt" ASC`, pb.id,
    ).catch(() => []) as any[];

    // Resolve department + designation names
    let departmentName = null, designationName = null;
    if (pb.departmentId) { try { const r = await db.$queryRawUnsafe(`SELECT name FROM "Department" WHERE id=$1 LIMIT 1`, pb.departmentId) as any[]; departmentName = r[0]?.name||null; } catch {} }
    if (pb.designationId) { try { const r = await db.$queryRawUnsafe(`SELECT title FROM "Designation" WHERE id=$1 LIMIT 1`, pb.designationId) as any[]; designationName = r[0]?.title||null; } catch {} }

    // ─── BRD 5.4 header/dashboard: company name + HR contact ───
    let companyName: string | null = null;
    try {
      const cRows = await db.$queryRawUnsafe(
        `SELECT name FROM "Company" ORDER BY "createdAt" ASC LIMIT 1`,
      ).catch(() => []) as any[];
      companyName = cRows[0]?.name || null;
    } catch { companyName = null; }

    let hrContact: { name?: string | null; email?: string | null; phone?: string | null } | null = null;
    try {
      const hrRows = await db.$queryRawUnsafe(
        `SELECT name, email FROM "User"
         WHERE role IN ('super_admin','tenant_admin','hr_admin','company_hr_admin','admin','ceo','hr_manager')
           AND status = 'active'
         ORDER BY "createdAt" ASC LIMIT 1`,
      ).catch(() => []) as any[];
      if (hrRows.length > 0) hrContact = { name: hrRows[0].name, email: hrRows[0].email, phone: null };
    } catch { hrContact = null; }

    let employeeCode = null;
    let attendanceSummary: any = null;
    let leaveBalances: any = null;
    let recentAttendance: any[] = [];

    // ─── If linked Employee exists, fetch attendance + leave ───
    if (pb.employeeId) {
      try {
        const empRows = await db.$queryRawUnsafe(`SELECT * FROM "Employee" WHERE "id"=$1 LIMIT 1`, pb.employeeId) as any[];
        const emp = empRows[0];
        if (emp) {
          employeeCode = emp.employeeId;

          // Only show attendance + leave if Employee has a non-PROV employeeId OR is in provisional_employee state
          // (so before mark-joined, the candidate sees no attendance/leave yet)
          const isProvisionalOrActive = pb.onboardingStatus === 'provisional_employee' || pb.onboardingStatus === 'active_employee';
          if (isProvisionalOrActive) {
            // Last 30 days attendance summary
            try {
              const attSummary = await db.$queryRawUnsafe(
                `SELECT
                   status,
                   COUNT(*)::int AS count
                 FROM "Attendance"
                 WHERE "employeeId" = $1 AND "date" >= NOW() - INTERVAL '30 days'
                 GROUP BY status`,
                emp.id,
              ) as any[];
              const totalRow = await db.$queryRawUnsafe(
                `SELECT COUNT(*)::int AS total FROM "Attendance" WHERE "employeeId" = $1 AND "date" >= NOW() - INTERVAL '30 days'`,
                emp.id,
              ) as any[];
              attendanceSummary = {
                last30Days: attSummary.reduce((acc: Record<string, number>, row: any) => {
                  acc[row.status] = row.count; return acc;
                }, {}),
                totalRecords: totalRow[0]?.total || 0,
              };
            } catch {}

            // Recent attendance records (last 10)
            try {
              recentAttendance = await db.$queryRawUnsafe(
                `SELECT "date", status, "checkInTime", "checkOutTime", "workHours", "lateMinutes"
                 FROM "Attendance"
                 WHERE "employeeId" = $1
                 ORDER BY "date" DESC
                 LIMIT 10`,
                emp.id,
              ) as any[];
            } catch {}

            // Leave balances for current year
            try {
              const year = new Date().getFullYear();
              const leaveRows = await db.$queryRawUnsafe(
                `SELECT lb.id, lb.total, lb.used, lb."carryForward", lb.year,
                        lt.id AS "leaveTypeId", lt.name AS "leaveTypeName", lt.code AS "leaveTypeCode"
                 FROM "LeaveBalance" lb
                 LEFT JOIN "LeaveType" lt ON lt.id = lb."leaveTypeId"
                 WHERE lb."employeeId" = $1 AND lb.year = $2
                 ORDER BY lt.name ASC`,
                emp.id, year,
              ) as any[];
              leaveBalances = leaveRows.map((r: any) => ({
                id: r.id, leaveTypeName: r.leaveTypeName || 'Leave',
                leaveTypeCode: r.leaveTypeCode, year: r.year,
                total: r.total || 0, used: r.used || 0,
                remaining: (r.total || 0) - (r.used || 0),
                carryForward: r.carryForward || 0,
              }));
            } catch {}
          }
        }
      } catch {}
    }

    return NextResponse.json({
      preboardingCandidateId: pb.id,
      candidateName: pb.candidateName,
      candidateEmail: pb.candidateEmail,
      candidatePhone: pb.candidatePhone || null,
      jobTitle: pb.jobTitle || null,
      department: departmentName,
      designation: designationName,
      employmentType: pb.employmentType || 'full-time',
      ctc: pb.ctc || pb.offeredSalary || null,
      workLocation: pb.workLocation || null,
      joiningDate: pb.joiningDate || null,
      companyEmail: pb.companyEmail || null,
      onboardingStatus: pb.onboardingStatus || 'pending',
      bgvStatus: pb.backgroundCheckStatus || 'pending',
      bgvNotes: pb.bgvNotes || null,
      employeeId: employeeCode,
      activatedAt: pb.activatedAt || null,
      // ─── BRD Preboarding Portal Wizard state ───
      portalDetails: parsePortalDetails(pb.portalDetails),
      portalSubmittedAt: pb.portalSubmittedAt || null,
      declarationAcceptedAt: pb.declarationAcceptedAt || null,
      declarationName: pb.declarationName || null,
      correctionNote: pb.correctionNote || null,
      correctionSetAt: pb.correctionSetAt || null,
      documents: docs.map((d:any) => ({
        id: d.id, documentType: d.documentType, documentLabel: d.documentLabel,
        fileUrl: d.fileUrl, fileName: d.fileName, fileSize: d.fileSize, mimeType: d.mimeType,
        status: d.status, reviewedAt: d.reviewedAt, reviewNotes: d.reviewNotes, uploadedAt: d.uploadedAt,
        // BRD 5.8 (Part 7): metadata + versioning must reach the candidate
        // wizard too — this mapping previously dropped them, so doc number /
        // issue / expiry / version / required never rendered after a PATCH.
        documentNumber: d.documentNumber ?? null,
        issueDate: d.issueDate ?? null,
        expiryDate: d.expiryDate ?? null,
        version: d.version ?? 0,
        required: d.required ?? true,
      })),
      hrContact,
      companyName,
      attendanceSummary,
      recentAttendance,
      leaveBalances,
    }, { headers: CORS });
  } catch (error) {
    console.error('Candidate onboarding GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}

/**
 * PUT /api/candidate-portal/onboarding — save one wizard section (save-and-resume).
 * body: { section: 'personal'|'address'|'family'|'education'|'bank', data: {...} }
 *
 * Merges the section into PreboardingCandidate.portalDetails (JSON). After the
 * candidate has submitted to HR, saving is blocked unless HR returned the
 * details for correction (correctionNote set / portalSubmittedAt cleared).
 */
export async function PUT(request: Request) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token' }, { status: 401, headers: CORS });
    const decoded = await verifyToken(token);
    if (!decoded || (decoded as any).kind !== 'candidate')
      return NextResponse.json({ error: 'Invalid candidate token' }, { status: 401, headers: CORS });
    const candidateEmail = ((decoded as any).email as string).toLowerCase();

    const body = await request.json().catch(() => ({}));
    const section = String(body.section || '');
    const data = body.data;
    if (!PORTAL_SECTIONS.includes(section as PortalSection))
      return NextResponse.json({ error: `section must be one of: ${PORTAL_SECTIONS.join(', ')}` }, { status: 400, headers: CORS });
    if (!data || typeof data !== 'object')
      return NextResponse.json({ error: 'data object required' }, { status: 400, headers: CORS });

    const pbRows = await db.$queryRawUnsafe(
      `SELECT id, "portalDetails", "portalSubmittedAt" FROM "PreboardingCandidate" WHERE "candidateEmail" = $1 ORDER BY "createdAt" DESC LIMIT 1`, candidateEmail,
    ).catch(() => []) as any[];
    if (pbRows.length === 0)
      return NextResponse.json({ error: 'Not in onboarding pipeline', code: 'NOT_IN_ONBOARDING' }, { status: 404, headers: CORS });
    const pb = pbRows[0];

    if (pb.portalSubmittedAt) {
      return NextResponse.json({ error: 'Details already submitted to HR. Please contact HR if you need to make changes.', code: 'ALREADY_SUBMITTED' }, { status: 409, headers: CORS });
    }

    const details = parsePortalDetails(pb.portalDetails);
    details[section] = { ...(details[section] || {}), ...data, savedAt: new Date().toISOString() };

    await db.$executeRawUnsafe(
      `UPDATE "PreboardingCandidate" SET "portalDetails" = $1::jsonb, "correctionNote" = NULL, "updatedAt" = NOW() WHERE "id" = $2`,
      JSON.stringify(details), pb.id,
    );

    return NextResponse.json({ message: `${section} saved`, section }, { headers: CORS });
  } catch (error) {
    console.error('Candidate onboarding PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}
