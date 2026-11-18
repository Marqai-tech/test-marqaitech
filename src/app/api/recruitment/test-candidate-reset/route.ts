import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { getTokenFromHeaders, verifyToken } from '@/lib/auth';

const ADMIN_ROLES = ['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_admin', 'company_hr_admin'];

export async function DELETE(req: NextRequest) {
  const token = getTokenFromHeaders(req);
  const decoded = token ? await verifyToken(token) : null;
  if (!decoded || !ADMIN_ROLES.includes(String(decoded.role))) {
    return NextResponse.json({ error: 'HR/Admin access required' }, { status: 403 });
  }
  const { email, confirmation } = await req.json().catch(() => ({}));
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail || confirmation !== `DELETE ${normalizedEmail}`) {
    return NextResponse.json({ error: `Type DELETE ${normalizedEmail || '<email>'} to confirm` }, { status: 400 });
  }

  const db = await getDb(req);
  const deleted: Record<string, number> = {};
  const remove = async (table: string, column: string) => {
    const safeTable = table.replace(/"/g, '');
    const safeColumn = column.replace(/"/g, '');
    const count = await db.$executeRawUnsafe(`DELETE FROM "${safeTable}" WHERE LOWER("${safeColumn}") = LOWER($1)`, normalizedEmail).catch(() => 0);
    if (count) deleted[safeTable] = Number(count);
  };

  // BGV tables intentionally use raw IDs rather than Prisma relations, so
  // remove their request children before the request itself.
  for (const [table, column] of [
    ['BgvEvidence', 'requestId'], ['BgvCheck', 'requestId'], ['BgvNotification', 'requestId'],
    ['BgvReport', 'requestId'], ['BgvAssignment', 'requestId'], ['BgvDocumentShare', 'requestId'],
  ]) {
    await db.$executeRawUnsafe(
      `DELETE FROM "${table}" WHERE "${column}" IN (SELECT "id" FROM "BgvRequest" WHERE LOWER("candidateEmail") = LOWER($1))`,
      normalizedEmail,
    ).catch(() => 0);
  }

  // Child records with cascade relations are removed with their parent rows.
  for (const [table, column] of [
    ['InterviewSession', 'candidateEmail'], ['InterviewInvitation', 'candidateEmail'],
    ['BgvRequest', 'candidateEmail'], ['PreboardingCandidate', 'candidateEmail'],
    ['Offer', 'candidateEmail'], ['JobApplication', 'candidateEmail'],
    ['CandidatePortalUser', 'email'], ['Candidate', 'email'],
  ]) await remove(table, column);

  await db.auditLog.create({ data: { userId: String(decoded.userId), action: 'RESET_TEST_CANDIDATE', module: 'recruitment', details: `Reset test candidate data for ${normalizedEmail}` } }).catch(() => null);
  return NextResponse.json({ message: 'Test candidate data reset', email: normalizedEmail, deleted });
}
