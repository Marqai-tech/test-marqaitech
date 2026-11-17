/**
 * Task 95 — create the SuperAdminChangeRequest table in the DEMO platform DB.
 * Idempotent: IF NOT EXISTS everywhere.
 */
const { Client } = require('pg');

const PLATFORM_CS = 'postgresql://neondb_owner:npg_pxZd8woKe4WB@ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require';

async function main() {
  const c = new Client({ connectionString: PLATFORM_CS });
  await c.connect();
  await c.query(`
    CREATE TABLE IF NOT EXISTS "SuperAdminChangeRequest" (
      "id" TEXT PRIMARY KEY,
      "title" TEXT NOT NULL,
      "description" TEXT NOT NULL,
      "module" TEXT NOT NULL DEFAULT 'super-admin',
      "requestedBy" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'pending_approval',
      "approvedBy" TEXT,
      "approvalMethod" TEXT,
      "approvedAt" TIMESTAMP(3),
      "rejectedReason" TEXT,
      "implementedAt" TIMESTAMP(3),
      "deployCommit" TEXT,
      "approvalToken" TEXT,
      "tokenExpiresAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL
    )`);
  await c.query(`CREATE UNIQUE INDEX IF NOT EXISTS "SuperAdminChangeRequest_approvalToken_key" ON "SuperAdminChangeRequest"("approvalToken")`);
  await c.query(`CREATE INDEX IF NOT EXISTS "SuperAdminChangeRequest_status_idx" ON "SuperAdminChangeRequest"("status")`);
  await c.query(`CREATE INDEX IF NOT EXISTS "SuperAdminChangeRequest_createdAt_idx" ON "SuperAdminChangeRequest"("createdAt")`);
  const r = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='SuperAdminChangeRequest' ORDER BY ordinal_position`);
  console.log('TABLE READY. columns:', r.rows.map((x) => x.column_name).join(', '));
  await c.end();
}

main().catch((e) => { console.error('ERR', e.message); process.exit(1); });
