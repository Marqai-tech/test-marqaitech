import type { PrismaClient } from '@/generated/prisma/client';

/**
 * Task 108 — Runtime schema ensure for the Employee remote check-in columns.
 *
 * Tenant databases are provisioned once and are NOT touched by the
 * build-time schema-sync (which only runs against the platform DB), so any
 * additive Employee columns must be created at request time — the same
 * pattern as ensureAttendanceColumns / ensurePunchEventTable in the punch
 * route. All statements are idempotent (IF NOT EXISTS) and safe to re-run.
 *
 * A WeakSet cache skips repeat work for already-patched PrismaClient
 * instances (tenant clients are cached in tenant-db.ts, so each tenant DB
 * is patched once per server instance).
 */
const ensured = new WeakSet<object>();

const STATEMENTS = [
  `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "wfhPreApproved" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "mobileCheckInEnabled" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "webCheckInEnabled" BOOLEAN NOT NULL DEFAULT false`,
];

export async function ensureEmployeeRemoteColumns(db: PrismaClient | any): Promise<void> {
  if (!db || ensured.has(db as object)) return;
  for (const sql of STATEMENTS) {
    await db.$executeRawUnsafe(sql).catch(() => null);
  }
  ensured.add(db as object);
}
