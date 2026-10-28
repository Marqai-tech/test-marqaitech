// Probe notification deliveries for profile update events on LIVE (fixed columns)
import { neon } from '@neondatabase/serverless';
const PLATFORM_CS = 'postgresql://neondb_owner:npg_pxZd8woKe4WB@ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require';
const platform = neon(PLATFORM_CS);
const t = await platform`SELECT td."connectionString" AS cs FROM "Tenant" t JOIN "TenantDatabase" td ON td."tenantId" = t.id WHERE t.slug='marqaitechgroup'`;
const db = neon(t[0].cs);
const del = await db`SELECT "eventKey", channel, status, COUNT(*)::int n, MIN("error") sample_err FROM "NotificationDelivery" WHERE "eventKey" LIKE '%profile%' GROUP BY "eventKey", channel, status`;
console.log('deliveries (profile events):', JSON.stringify(del, null, 1));
const recent = await db`SELECT "eventKey", channel, status, "recipientAddress", "createdAt" FROM "NotificationDelivery" WHERE "eventKey" LIKE '%profile%' ORDER BY "createdAt" DESC LIMIT 8`;
console.log('recent:', JSON.stringify(recent, null, 1));
const cs = await db`SELECT "emailIntegrationEnabled", "emailProvider", "smtpHost", "fromEmail" FROM "CollaborationSettings" LIMIT 3`;
console.log('CollaborationSettings:', JSON.stringify(cs));
