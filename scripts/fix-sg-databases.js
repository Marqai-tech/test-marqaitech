/**
 * Task 78 FINAL FIX — update the ACTUAL databases the LIVE Vercel app uses:
 *   - ep-icy-star (ap-southeast-1) tenant_marqaitechgroup: add the 3 missing
 *     columns (isManagement / earlyLogout / PolicyAcknowledgment.action).
 *   - SG platform neondb: strip channel_binding=require from the
 *     marqaitechgroup registry row (root cause of the original 503s).
 * All changes additive + idempotent. No data touched.
 */
const { neon } = require('@neondatabase/serverless');
const fs = require('fs');

const TENANT_CS_RAW = fs.readFileSync('/tmp/icy_tenant_cs.txt', 'utf8').trim();
const TENANT_CS = TENANT_CS_RAW.replace(/([?&])channel_binding=[^&]*&?/, '$1').replace(/[?&]$/, '');
const PLATFORM_SG = TENANT_CS.replace(/\/tenant_marqaitechgroup\?/, '/neondb?');

const DDL = [
  `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "isManagement" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "Attendance" ADD COLUMN IF NOT EXISTS "earlyLogout" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "PolicyAcknowledgment" ADD COLUMN IF NOT EXISTS "action" TEXT NOT NULL DEFAULT 'accepted'`,
];

async function main() {
  // ---- 1) tenant DB: add the 3 missing columns ----
  const tenant = neon(TENANT_CS);
  console.log('[1] SG tenant_marqaitechgroup:');
  for (const ddl of DDL) {
    await tenant.query(ddl);
    console.log('    OK:', ddl.slice(0, 70) + '…');
  }
  const verify = await tenant.query(
    `SELECT table_name, column_name, data_type, column_default FROM information_schema.columns
     WHERE (table_name='Employee' AND column_name='isManagement')
        OR (table_name='Attendance' AND column_name='earlyLogout')
        OR (table_name='PolicyAcknowledgment' AND column_name='action')`
  );
  for (const v of verify) console.log(`    verified: ${v.table_name}.${v.column_name} ${v.data_type} default ${v.column_default}`);
  const n = await tenant.query(`SELECT COUNT(*)::int AS n FROM "Employee"`);
  console.log(`    Employee rows reachable: ${n[0].n}`);

  // ---- 2) SG platform registry: strip channel_binding from marqaitechgroup row ----
  const platform = neon(PLATFORM_SG);
  console.log('[2] SG platform registry:');
  const rows = await platform.query(
    `SELECT td.id, td."connectionString" AS cs FROM "TenantDatabase" td JOIN "Tenant" t ON t.id = td."tenantId" WHERE t.slug = 'marqaitechgroup'`
  );
  const r = rows[0];
  if (r && r.cs.includes('channel_binding')) {
    const fixed = r.cs.replace(/([?&])channel_binding=[^&]*&?/, '$1').replace(/\?&/, '?').replace(/[?&]$/, '');
    await platform.query(`UPDATE "TenantDatabase" SET "connectionString" = $1 WHERE id = $2`, [fixed, r.id]);
    console.log('    OK: channel_binding stripped from connectionString');
    console.log('    new host:', fixed.split('@')[1]?.split('/')[0]);
  } else {
    console.log('    no channel_binding found — nothing to change');
  }

  // ---- 3) end-to-end shape check: the exact findMany the app runs ----
  console.log('[3] app-shaped findMany smoke test:');
  const probe = await tenant.query(
    `SELECT e.id, e."firstName", e."isManagement" FROM "Employee" e ORDER BY e."createdAt" DESC LIMIT 3`
  );
  for (const p of probe) console.log(`    - ${p.firstName} | isManagement=${p.isManagement}`);
  console.log('[done]');
}

main().catch(e => { console.error('FAILED:', e.message.split('\n')[0]); process.exit(1); });
