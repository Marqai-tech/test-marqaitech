/**
 * Configure + E2E-prove SMTP on BOTH Vercel sites THROUGH THE APP APIs
 * (writes land in whatever DB each site actually uses).
 *
 *  1. PATCH /api/settings/smtp  — full correct config incl. real password
 *  2. GET  /api/settings/smtp   — confirm persisted (updatedAt advances)
 *  3. POST /api/settings/smtp   — runtime SMTP verify (auth from Vercel IP)
 *  4. POST /api/email (folder=sent, loopback to noreply@3boxeshrms.com)
 *     — REAL SMTP send through the tenant notification path; response
 *       includes sendResult from the runtime.
 */
const SITES = [
  {
    label: 'LIVE',
    url: 'https://marqaitechgroup.3boxeshrms.com',
    tenantSlug: 'marqaitechgroup',
    email: 'hr@marqaitech.com',
    password: 'MarqAI@2026',
    fromName: 'HR',
  },
  {
    label: 'DEMO',
    url: 'https://nexus-hrms-mu.vercel.app',
    tenantSlug: '3boxes-hrms-demo',
    email: 'admin@3boxeshrms.com',
    password: 'MarqAI@2026',
    fromName: 'Admin',
  },
];

const SMTP_CONFIG = {
  emailProvider: 'smtp',
  emailIntegrationEnabled: true,
  smtpHost: 'md-in-59.webhostbox.net',
  smtpPort: 465,
  smtpUsername: 'noreply@3boxeshrms.com',
  smtpPassword: 'Boxes@001#$',
  smtpEncryption: 'ssl',
  smtpFromName: '3 Boxes HRMS',
  smtpFromAddress: 'noreply@3boxeshrms.com',
  smtpReplyTo: 'noreply@3boxeshrms.com',
};

async function main() {
  let pass = 0, fail = 0;
  const ok = (name, cond, extra = '') => {
    if (cond) { pass++; console.log(`  PASS ${name}${extra ? ' — ' + extra : ''}`); }
    else { fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
  };

  for (const site of SITES) {
    console.log(`\n========== ${site.label} — ${site.url} ==========`);
    try {
      // Login
      const login = await fetch(`${site.url}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: site.email, password: site.password }),
        signal: AbortSignal.timeout(30000),
      }).then(r => r.json());
      const token = login.token || '';
      ok(`${site.label} login`, !!token);
      if (!token) continue;
      const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'x-tenant-slug': site.tenantSlug };

      // 1. PATCH full config (real password — lands in the site's real DB)
      const patchRes = await fetch(`${site.url}/api/settings/smtp`, {
        method: 'PATCH', headers: H, body: JSON.stringify(SMTP_CONFIG), signal: AbortSignal.timeout(30000),
      });
      const patchBody = await patchRes.json().catch(() => ({}));
      ok(`${site.label} PATCH settings`, patchRes.status === 200 && !!patchBody.settings,
        patchRes.status !== 200 ? JSON.stringify(patchBody).slice(0, 120) : '');

      // 2. GET confirm
      const getRes = await fetch(`${site.url}/api/settings/smtp`, { headers: H, signal: AbortSignal.timeout(30000) });
      const s = (await getRes.json().catch(() => ({}))).settings || {};
      ok(`${site.label} config persisted`, s.smtpHost === SMTP_CONFIG.smtpHost && s.smtpPort === 465 && s.emailProvider === 'smtp' && s.emailIntegrationEnabled === true,
        `host=${s.smtpHost} port=${s.smtpPort} provider=${s.emailProvider} enabled=${s.emailIntegrationEnabled} updatedAt=${s.updatedAt}`);

      // 3. Runtime verify
      const verRes = await fetch(`${site.url}/api/settings/smtp`, {
        method: 'POST', headers: H,
        body: JSON.stringify({ smtpHost: SMTP_CONFIG.smtpHost, smtpPort: 465, smtpUsername: SMTP_CONFIG.smtpUsername, smtpPassword: SMTP_CONFIG.smtpPassword, smtpEncryption: 'ssl' }),
        signal: AbortSignal.timeout(45000),
      });
      const ver = await verRes.json().catch(() => ({}));
      ok(`${site.label} SMTP verify from Vercel runtime`, verRes.status === 200 && ver.success === true,
        ver.success ? 'connected+authed' : `error=${ver.error}`);

      // 4. REAL loopback send through the tenant SMTP path
      const sendRes = await fetch(`${site.url}/api/email`, {
        method: 'POST', headers: H,
        body: JSON.stringify({
          subject: `[${site.label}] SMTP delivery test — ${new Date().toISOString()}`,
          body: 'Automated SMTP delivery test from 3Boxes HRMS. No action needed.',
          toAddresses: ['noreply@3boxeshrms.com'],
          folder: 'sent',
        }),
        signal: AbortSignal.timeout(60000),
      });
      const sendBody = await sendRes.json().catch(() => ({}));
      const sr = sendBody.sendResult || sendBody.result || null;
      ok(`${site.label} real SMTP send (loopback)`, sendRes.status === 200 && sr && sr.success === true,
        sr ? (sr.success ? `provider=${sr.provider} messageId=${(sr.messageId || '').slice(0, 40)}` : `send error=${sr.error}`) : JSON.stringify(sendBody).slice(0, 140));
    } catch (e) {
      ok(`${site.label} flow`, false, e.message);
    }
  }

  console.log(`\n=== RESULT: ${pass} PASS / ${fail} FAIL ===`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
