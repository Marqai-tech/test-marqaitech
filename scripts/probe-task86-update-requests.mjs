// Task 86 probe — read-only check of update-request workflow infrastructure
// 1. Do EmployeeUpdateRequest / EmployeeUpdateApprovalStep / EmployeeWorkflowConfig
//    tables exist on the LIVE tenant DB + platform DB?
// 2. Is there an active EmployeeWorkflowConfig row for update_profile?
// 3. Do any EmployeeUpdateRequest rows exist at all?
// 4. Does the notification/email event exist for profile.update_requested?
import { neon } from '@neondatabase/serverless';

const PLATFORM_CS = 'postgresql://neondb_owner:npg_pxZd8woKe4WB@ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require';

async function tablesExist(sql, label) {
  const rows = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('EmployeeUpdateRequest','EmployeeUpdateApprovalStep','EmployeeWorkflowConfig')`;
  console.log(`[${label}] tables found:`, rows.map(r => r.table_name).join(', ') || 'NONE');
  return new Set(rows.map(r => r.table_name));
}

// ---- Platform DB ----
const platform = neon(PLATFORM_CS);
const pSet = await tablesExist(platform, 'platform neondb');
const tenants = await platform`SELECT t.id, t.name, t.slug, td."connectionString" AS cs, td."databaseName" FROM "Tenant" t LEFT JOIN "TenantDatabase" td ON td."tenantId" = t.id ORDER BY t."createdAt"`;
for (const t of tenants) console.log('tenant:', t.slug, '| db:', (t.cs || 'PLATFORM(shared)').replace(/\/\/([^:]+):[^@]+@/, '//***@').slice(0, 90));

// ---- Each tenant DB ----
for (const t of tenants) {
  if (!t.cs) { console.log(`[${t.slug}] shared/platform mode — already probed`); continue; }
  try {
    const db = neon(t.cs);
    const set = await tablesExist(db, t.slug);
    if (set.has('EmployeeWorkflowConfig')) {
      const cfg = await db`SELECT id, name, "workflowType", "isActive", config FROM "EmployeeWorkflowConfig" WHERE "workflowType"='update_profile' ORDER BY "updatedAt" DESC LIMIT 3`;
      console.log(`[${t.slug}] update_profile configs:`, JSON.stringify(cfg));
    }
    if (set.has('EmployeeUpdateRequest')) {
      const cnt = await db`SELECT status, COUNT(*)::int AS n FROM "EmployeeUpdateRequest" GROUP BY status`;
      console.log(`[${t.slug}] update requests by status:`, JSON.stringify(cnt));
      const steps = await db`SELECT status, COUNT(*)::int AS n FROM "EmployeeUpdateApprovalStep" GROUP BY status`;
      console.log(`[${t.slug}] approval steps by status:`, JSON.stringify(steps));
    }
    // Notification templates for the profile update event
    try {
      const tpl = await db`SELECT "eventKey", channel, enabled FROM "NotificationEvent" WHERE "eventKey" LIKE '%profile%' OR "eventKey" LIKE '%update%' LIMIT 10`;
      console.log(`[${t.slug}] notification events (profile/update):`, JSON.stringify(tpl));
    } catch (e) { console.log(`[${t.slug}] NotificationEvent probe:`, e.message.slice(0, 120)); }
  } catch (e) {
    console.log(`[${t.slug}] DB error:`, e.message.slice(0, 200));
  }
}
console.log('PROBE DONE');
