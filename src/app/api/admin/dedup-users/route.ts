/**
 * POST /api/admin/dedup-users
 *
 * Super-admin-gated maintenance endpoint.
 *
 * Finds all User rows matching a given email on BOTH the platform DB and the
 * tenant's dedicated DB, keeps ONE canonical row, reassigns every foreign-key
 * reference from the duplicate IDs to the canonical ID, and DELETEs the
 * duplicates.
 *
 * Why this exists:
 *   Some tenant DBs have multiple User rows for the same email (legacy seed
 *   drift). Login picks one (Prisma findUnique by email) but the Employee
 *   table / Notification table / AuditLog may reference a DIFFERENT one — so
 *   the user logs in, sees no notifications, and profile-update workflow
 *   emails go to a ghost account. Dedup fixes all of that in one shot.
 *
 * Body:
 *   {
 *     "email": "madhuri@marqaitech.com",
 *     "tenantSlug": "test-marqaitech",
 *     "dryRun": false   // set true to get a plan without executing
 *   }
 *
 * Canonical-user selection:
 *   1. The User row that an Employee references via Employee.userId
 *   2. Tie-break: most recent lastLogin
 *   3. Tie-break: earliest createdAt (most established)
 *
 * FK tables reassigned (best-effort — skipped if the column doesn't exist):
 *   Employee.userId, Notification.userId, AuditLog.userId, LoginActivity.userId,
 *   UserRoleAssignment.userId, ChatRoomMember.userId, CallParticipant.userId,
 *   AIChatLog.userId, AIPromptLog.userId, AIKnowledgeQuery.userId,
 *   DLPScanLog.userId, WatermarkAccessLog.userId, SocialLike.userId,
 *   NotificationPreference.userId, AttendanceRegularization.userId,
 *   EmployeeUpdateRequest.requestedById, EmployeeUpdateRequest.approverUserId,
 *   EmployeeUpdateApprovalStep.approverUserId, PolicyAcknowledgment.acknowledgedById,
 *   DocAccessRule.userId, BankAccount.verifiedBy, GratuityLedger.processedBy,
 *   Role.createdBy
 *
 * For @unique userId columns (Employee, Contractor), if the canonical already
 * has a row, the duplicate's row is DELETED (data loss warning logged) rather
 * than causing a unique-violation.
 */
import { NextResponse } from 'next/server';
import { getPlatformDb, getDbForTenant } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { PrismaClient } from '@/generated/prisma/client';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

// Tables + columns to reassign. Each entry: [table, column, isUnique].
// isUnique=true means we must handle potential conflicts (delete dup's row
// if canonical already has one).
const FK_REASSIGN: Array<[string, string, boolean]> = [
  ['Employee', 'userId', true],
  ['Notification', 'userId', false],
  ['AuditLog', 'userId', false],
  ['LoginActivity', 'userId', false],
  ['UserRoleAssignment', 'userId', false],
  ['ChatRoomMember', 'userId', false],
  ['CallParticipant', 'userId', false],
  ['AIChatLog', 'userId', false],
  ['AIPromptLog', 'userId', false],
  ['AIKnowledgeQuery', 'userId', false],
  ['DLPScanLog', 'userId', false],
  ['WatermarkAccessLog', 'userId', false],
  ['SocialLike', 'userId', false],
  ['NotificationPreference', 'userId', false],
  ['AttendanceRegularization', 'userId', false],
  ['EmployeeUpdateRequest', 'requestedById', false],
  ['EmployeeUpdateRequest', 'approverUserId', false],
  ['EmployeeUpdateApprovalStep', 'approverUserId', false],
  ['PolicyAcknowledgment', 'acknowledgedById', false],
  ['DocAccessRule', 'userId', false],
  ['BankAccount', 'verifiedBy', false],
  ['GratuityLedger', 'processedBy', false],
  ['Role', 'createdBy', false],
  ['Contractor', 'userId', true],
];

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  lastLogin: Date | null;
  createdAt: Date;
  hasEmployee: boolean;
  employeeCount: number;
}

async function findUsersByEmail(db: PrismaClient, email: string): Promise<UserRow[]> {
  const rows = await db.$queryRawUnsafe(
    `SELECT u.id, u.name, u.email, u.role, u.status, u."lastLogin", u."createdAt",
            (SELECT COUNT(*) FROM "Employee" e WHERE e."userId" = u.id) AS "employeeCount"
     FROM "User" u
     WHERE LOWER(u.email) = LOWER($1)
     ORDER BY u."createdAt" ASC`,
    email,
  ) as any[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    role: r.role,
    status: r.status,
    lastLogin: r.lastLogin,
    createdAt: r.createdAt,
    hasEmployee: Number(r.employeeCount) > 0,
    employeeCount: Number(r.employeeCount),
  }));
}

function pickCanonical(users: UserRow[]): UserRow {
  // Prefer the one linked to an Employee. Tie-break: most recent lastLogin,
  // then earliest createdAt.
  const withEmployee = users.filter((u) => u.hasEmployee);
  const pool = withEmployee.length > 0 ? withEmployee : users;
  return [...pool].sort((a, b) => {
    const aLogin = a.lastLogin ? new Date(a.lastLogin).getTime() : 0;
    const bLogin = b.lastLogin ? new Date(b.lastLogin).getTime() : 0;
    if (aLogin !== bLogin) return bLogin - aLogin; // most recent first
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(); // earliest first
  })[0];
}

async function columnExists(db: PrismaClient, table: string, column: string): Promise<boolean> {
  try {
    const rows = await db.$queryRawUnsafe(
      `SELECT 1 FROM information_schema.columns
       WHERE table_name = $1 AND column_name = $2
       LIMIT 1`,
      table,
      column,
    ) as any[];
    return rows.length > 0;
  } catch {
    return false;
  }
}

async function tableExists(db: PrismaClient, table: string): Promise<boolean> {
  try {
    const rows = await db.$queryRawUnsafe(
      `SELECT 1 FROM information_schema.tables WHERE table_name = $1 LIMIT 1`,
      table,
    ) as any[];
    return rows.length > 0;
  } catch {
    return false;
  }
}

async function dedupOnDb(
  dbLabel: string,
  db: PrismaClient,
  email: string,
  dryRun: boolean,
): Promise<Record<string, unknown>> {
  const report: Record<string, unknown> = { dbLabel, email };

  const users = await findUsersByEmail(db, email);
  report['usersFound'] = users.length;
  report['users'] = users.map((u) => ({
    id: u.id,
    name: u.name,
    role: u.role,
    status: u.status,
    hasEmployee: u.hasEmployee,
    lastLogin: u.lastLogin,
    createdAt: u.createdAt,
  }));

  if (users.length <= 1) {
    report['action'] = 'no_duplicates';
    return report;
  }

  const canonical = pickCanonical(users);
  const duplicates = users.filter((u) => u.id !== canonical.id);
  report['canonical'] = {
    id: canonical.id,
    name: canonical.name,
    role: canonical.role,
    hasEmployee: canonical.hasEmployee,
  };
  report['duplicates'] = duplicates.map((u) => ({ id: u.id, name: u.name, role: u.role }));
  report['dryRun'] = dryRun;

  if (dryRun) {
    report['action'] = 'dry_run_plan';
    return report;
  }

  // Reassign FKs for each duplicate → canonical
  const reassignReport: Array<Record<string, unknown>> = [];
  for (const dup of duplicates) {
    const dupReport: Record<string, unknown> = { duplicateId: dup.id, tables: [] as Array<Record<string, unknown>> };
    for (const [table, column, isUnique] of FK_REASSIGN) {
      const tblExists = await tableExists(db, table);
      if (!tblExists) continue;
      const colExists = await columnExists(db, table, column);
      if (!colExists) continue;

      try {
        if (isUnique) {
          // For unique columns (Employee.userId, Contractor.userId):
          // if canonical already has a row, we can't reassign — delete dup's row instead.
          const canonicalHas = await db.$queryRawUnsafe(
            `SELECT COUNT(*)::int AS cnt FROM "${table}" WHERE "${column}" = $1`,
            canonical.id,
          ) as any[];
          if (Number(canonicalHas[0]?.cnt) > 0) {
            // Delete the dup's rows in this table (data loss — log it)
            const delRows = await db.$executeRawUnsafe(
              `DELETE FROM "${table}" WHERE "${column}" = $1`,
              dup.id,
            );
            (dupReport.tables as Array<Record<string, unknown>>).push({
              table, column, action: 'deleted_dup_rows', rows: delRows,
            });
          } else {
            // Reassign
            const updRows = await db.$executeRawUnsafe(
              `UPDATE "${table}" SET "${column}" = $1 WHERE "${column}" = $2`,
              canonical.id, dup.id,
            );
            (dupReport.tables as Array<Record<string, unknown>>).push({
              table, column, action: 'reassigned', rows: updRows,
            });
          }
        } else {
          // Non-unique column — straight reassign
          const updRows = await db.$executeRawUnsafe(
            `UPDATE "${table}" SET "${column}" = $1 WHERE "${column}" = $2`,
            canonical.id, dup.id,
          );
          if (updRows > 0) {
            (dupReport.tables as Array<Record<string, unknown>>).push({
              table, column, action: 'reassigned', rows: updRows,
            });
          }
        }
      } catch (e) {
        (dupReport.tables as Array<Record<string, unknown>>).push({
          table, column, action: 'error',
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    // Now delete the duplicate User row
    try {
      const deleted = await db.$executeRawUnsafe(
        `DELETE FROM "User" WHERE id = $1`,
        dup.id,
      );
      dupReport['userDeleted'] = deleted === 1;
    } catch (e) {
      dupReport['userDeleted'] = false;
      dupReport['deleteError'] = e instanceof Error ? e.message : String(e);
    }

    reassignReport.push(dupReport);
  }

  report['action'] = 'deduplicated';
  report['reassignReport'] = reassignReport;

  // Verify
  const remaining = await findUsersByEmail(db, email);
  report['usersAfter'] = remaining.length;
  report['remainingUser'] = remaining[0]
    ? { id: remaining[0].id, name: remaining[0].name, role: remaining[0].role, hasEmployee: remaining[0].hasEmployee }
    : null;

  return report;
}

export async function POST(request: Request) {
  try {
    // ─── Auth: super_admin only ───
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    }
    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    }
    if (decoded.role !== 'super_admin') {
      return NextResponse.json({ error: 'Only super admins can run this operation' }, { status: 403, headers: corsHeaders() });
    }

    const body = await request.json().catch(() => ({}));
    const email = String(body.email || '').trim().toLowerCase();
    const tenantSlug = String(body.tenantSlug || '').trim();
    const dryRun = body.dryRun === true;

    if (!email || !tenantSlug) {
      return NextResponse.json(
        { error: 'Both `email` and `tenantSlug` are required.' },
        { status: 400, headers: corsHeaders() }
      );
    }

    const platformDb = getPlatformDb();
    const result: Record<string, unknown> = { email, tenantSlug, dryRun, dbs: [] as Array<Record<string, unknown>> };

    // 1. Platform DB
    try {
      const platReport = await dedupOnDb('platform', platformDb, email, dryRun);
      (result.dbs as Array<Record<string, unknown>>).push(platReport);
    } catch (e) {
      (result.dbs as Array<Record<string, unknown>>).push({
        dbLabel: 'platform',
        error: e instanceof Error ? e.message : String(e),
      });
    }

    // 2. Tenant DB
    try {
      const tenantDb = await getDbForTenant(tenantSlug);
      const tenantReport = await dedupOnDb(`tenant:${tenantSlug}`, tenantDb, email, dryRun);
      (result.dbs as Array<Record<string, unknown>>).push(tenantReport);
    } catch (e) {
      (result.dbs as Array<Record<string, unknown>>).push({
        dbLabel: `tenant:${tenantSlug}`,
        error: e instanceof Error ? e.message : String(e),
      });
    }

    return NextResponse.json(result, { status: 200, headers: corsHeaders() });
  } catch (error) {
    console.error('[dedup-users] error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500, headers: corsHeaders() }
    );
  }
}
