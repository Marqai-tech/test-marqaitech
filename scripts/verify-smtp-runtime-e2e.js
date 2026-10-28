/**
 * E2E verify — confirm SMTP works from the VERCEL RUNTIME (the environment
 * that actually sends notification emails) on BOTH sites:
 *
 *   LIVE: https://marqaitechgroup.3boxeshrms.com  (hr@marqaitech.com)
 *   DEMO: https://nexus-hrms-mu.vercel.app        (admin@3boxeshrms.com)
 *
 * 1. POST /api/auth/login  { email, password }              -> Bearer token
 * 2. POST /api/settings/smtp  (verify SMTP connection)      -> stamps smtpVerifiedAt
 * 3. Probe Neon: smtpVerifiedAt freshly stamped?            -> runtime proof
 */
const { Client } = require('pg');

const BASE = {
  host: 'ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech',
  user: 'neondb_owner',
  password: 'npg_pxZd8woKe4WB',
  ssl: { rejectUnauthorized: false },
  connectionTimeout: 30000,
};

const SITES = [
  {
    label: 'LIVE',
    url: 'https://marqaitechgroup.3boxeshrms.com',
    tenantSlug: 'marqaitechgroup',
    email: 'hr@marqaitech.com',
    password: 'MarqAI@2026',
    db: 'tenant_marqaitechgroup',
  },
  {
    label: 'DEMO',
    url: 'https://nexus-hrms-mu.vercel.app',
    tenantSlug: '3boxes-hrms-demo',
    email: 'admin@3boxeshrms.com',
    password: 'MarqAI@2026',
    db: 'tenant_3boxes-hrms-demo',
  },
];

const SMTP_BODY = {
  smtpHost: 'md-in-59.webhostbox.net',
  smtpPort: 465,
  smtpUsername: 'noreply@3boxeshrms.com',
  smtpPassword: 'Boxes@001#$',
  smtpEncryption: 'ssl',
};

async function main() {
  let pass = 0, fail = 0;
  const ok = (name, cond, extra = '') => {
    if (cond) { pass++; console.log(`  PASS ${name}${extra ? ' — ' + extra : ''}`); }
    else { fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
  };

  for (const site of SITES) {
    console.log(`\n===== ${site.label} — ${site.url} =====`);
    let token = '';
    try {
      // 1. Login
      const loginRes = await fetch(`${site.url}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: site.email, password: site.password }),
        signal: AbortSignal.timeout(30000),
      });
      const login = await loginRes.json().catch(() => ({}));
      token = login.token || '';
      ok(`${site.label} login`, loginRes.status === 200 && !!token, `status=${loginRes.status}`);

      if (!token) continue;

      // 2. SMTP verify from Vercel runtime
      const verRes = await fetch(`${site.url}/api/settings/smtp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-tenant-slug': site.tenantSlug,
        },
        body: JSON.stringify(SMTP_BODY),
        signal: AbortSignal.timeout(45000),
      });
      const ver = await verRes.json().catch(() => ({}));
      ok(`${site.label} SMTP verify from Vercel runtime`, verRes.status === 200 && ver.success === true,
        verRes.status === 200 ? (ver.success ? 'connected+authed' : `error=${ver.error}`) : JSON.stringify(ver).slice(0, 120));

      // 3. Confirm smtpVerifiedAt stamped in tenant DB
      const c = new Client({ ...BASE, database: site.db });
      await c.connect();
      const r = await c.query(
        `SELECT "smtpVerifiedAt", left(coalesce("smtpVerifyError",''), 80) AS err FROM "CollaborationSettings" LIMIT 1`
      );
      await c.end();
      const stampedAt = r.rows[0]?.smtpVerifiedAt;
      const fresh = stampedAt && (Date.now() - new Date(stampedAt).getTime()) < 10 * 60 * 1000;
      ok(`${site.label} smtpVerifiedAt freshly stamped`, !!fresh, stampedAt ? `at=${stampedAt.toISOString?.() || stampedAt}` : 'null');
      if (r.rows[0]?.err) console.log(`   verifyError: ${r.rows[0].err}`);
    } catch (e) {
      ok(`${site.label} E2E flow`, false, e.message);
    }
  }

  console.log(`\n=== RESULT: ${pass} PASS / ${fail} FAIL ===`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
