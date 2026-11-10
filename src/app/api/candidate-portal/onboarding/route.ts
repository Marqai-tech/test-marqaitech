import { NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

const CORS = { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization' };
export async function OPTIONS() { return NextResponse.json({}, { headers: CORS }); }

/** GET /api/candidate-portal/onboarding — candidate's onboarding data */
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

    let employeeCode = null;
    if (pb.employeeId) { try { const r = await db.$queryRawUnsafe(`SELECT "employeeId" FROM "Employee" WHERE id=$1 LIMIT 1`, pb.employeeId) as any[]; employeeCode = r[0]?.employeeId||null; } catch {} }

    return NextResponse.json({
      preboardingCandidateId: pb.id,
      candidateName: pb.candidateName,
      candidateEmail: pb.candidateEmail,
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
      documents: docs.map((d:any) => ({
        id: d.id, documentType: d.documentType, documentLabel: d.documentLabel,
        fileUrl: d.fileUrl, fileName: d.fileName, fileSize: d.fileSize, mimeType: d.mimeType,
        status: d.status, reviewedAt: d.reviewedAt, reviewNotes: d.reviewNotes, uploadedAt: d.uploadedAt,
      })),
    }, { headers: CORS });
  } catch (error) {
    console.error('Candidate onboarding GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}
