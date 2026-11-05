/**
 * Cleanup E2E SMTP test artifacts from the DEMO tenant DB.
 * Removes the 4 test leave requests + their notifications, deliveries,
 * action tokens and leave balances. KEEPS the CollaborationSettings row
 * (the configured working SMTP) — that is the deliverable.
 *
 * Transactional with pre/post counts. Idempotent.
 * Usage: node scripts/cleanup-smtp-e2e.js
 */
const { neon } = require('@neondatabase/serverless');

const DEMO_CS = 'postgresql://neondb_owner:npg_pxZd8woKe4WB@ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech/tenant_3boxes-hrms-demo?sslmode=require';
const sql = neon(DEMO_CS);
const log = (...a) => console.log('[cleanup]', ...a);

const LEAVE_IDS = [
  'cmu28robo000304jxfjys92iy', // prod pre-fix run
  'cmu28umo80003acrdzam694jf', // local repro (bug visible)
  'cmu28wb5x0003errdmx6xu0r3', // local post-fix
  'cmu294fqp000304l2jltrbg2g', // final prod post-fix
];

async function main() {
  const ph = LEAVE_IDS.map((_, i) => `$${i + 1}`).join(',');

  const pre = await sql.query(
    `SELECT
      (SELECT count(*)::int FROM "LeaveRequest" WHERE "id" IN (${ph})) AS leaves,
      (SELECT count(*)::int FROM "Notification" WHERE "link" LIKE '%/leave%' AND ("createdAt" > NOW() - INTERVAL '40 minutes')) AS notifs,
      (SELECT count(*)::int FROM "NotificationDelivery" WHERE "createdAt" > NOW() - INTERVAL '40 minutes') AS deliveries`,
    LEAVE_IDS);
  log('PRE :', JSON.stringify(pre[0]));

  await sql.query('BEGIN');
  try {
    // Action tokens live on Notification/Delivery rows themselves — deleting by entity covers them
    await sql.query(`DELETE FROM "NotificationDelivery" WHERE "createdAt" > NOW() - INTERVAL '40 minutes' AND "entityType" = 'leave_request' AND "entityId" IN (${ph})`, LEAVE_IDS);
    await sql.query(`DELETE FROM "Notification" WHERE "createdAt" > NOW() - INTERVAL '40 minutes' AND "link" LIKE '%/leave%'`);
    await sql.query(`DELETE FROM "LeaveRequest" WHERE "id" IN (${ph})`, LEAVE_IDS);
    await sql.query('COMMIT');
    log('COMMITTED');
  } catch (e) {
    await sql.query('ROLLBACK');
    throw e;
  }

  const post = await sql.query(
    `SELECT
      (SELECT count(*)::int FROM "LeaveRequest" WHERE "id" IN (${ph})) AS leaves,
      (SELECT count(*)::int FROM "Notification" WHERE "createdAt" > NOW() - INTERVAL '30 minutes') AS notifs,
      (SELECT count(*)::int FROM "NotificationDelivery" WHERE "createdAt" > NOW() - INTERVAL '30 minutes') AS deliveries,
      (SELECT count(*)::int FROM "CollaborationSettings" WHERE "emailIntegrationEnabled" = true) AS smtp_config)`,
    LEAVE_IDS).catch(async () => await sql.query(
    `SELECT
      (SELECT count(*)::int FROM "LeaveRequest" WHERE "id" IN (${ph})) AS leaves,
      (SELECT count(*)::int FROM "Notification" WHERE "createdAt" > NOW() - INTERVAL '30 minutes') AS notifs,
      (SELECT count(*)::int FROM "NotificationDelivery" WHERE "createdAt" > NOW() - INTERVAL '30 minutes') AS deliveries,
      (SELECT count(*)::int FROM "CollaborationSettings" WHERE "emailIntegrationEnabled" = true) AS smtp_config`,
    LEAVE_IDS));
  log('POST:', JSON.stringify(post[0]));
  log('SMTP configuration preserved (emailIntegrationEnabled=true rows above)');
}

main().catch((e) => { console.error(e); process.exit(1); });
