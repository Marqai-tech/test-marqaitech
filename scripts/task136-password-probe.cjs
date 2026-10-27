#!/usr/bin/env node
/* Task 136-era probe — why does change-password return 200/mirrored but the
 * OLD password still logs in? Dump User rows (email, id, hash prefix) from
 * BOTH the tenant DB and the platform DB before/after a live rotation. */
const { neon } = require('@neondatabase/serverless');

const TENANT = 'https://marqaitechgroup.3boxeshrms.com';
const EMAIL = process.env.PROBE_EMAIL || 'amrutha@marqaitech.com';
const OLD_PW = 'MarqAI@2026';
const NEW_PW = 'Probe-Rotate#2026';

const PLATFORM_URL = process.env.DATABASE_URL;

async function tenantUrl() {
  if (process.env.TENANT_DB_URL) return process.env.TENANT_DB_URL;
  const { neon } = require('@neondatabase/serverless');
  const p = neon(PLATFORM_URL);
  const rows = await p`SELECT td."connectionString" AS cs FROM "TenantDatabase" td JOIN "Tenant" t ON t.id = td."tenantId" WHERE t.slug = 'marqaitechgroup' LIMIT 1`;
  return rows[0]?.cs || null;
}

function mask(h) { return h ? `${String(h).slice(0, 12)}…${String(h).slice(-6)} (len ${String(h).length})` : 'NULL'; }

async function getRows() {
  const out = {};
  const plat = neon(PLATFORM_URL);
  const p = await plat`SELECT id, email, "tenantId", substring(password,1,12) AS hp, length(password) AS pl FROM "User" WHERE lower(email) = ${EMAIL}`;
  out.platform = p;
  const turl = await tenantUrl();
  if (turl) {
    const t = neon(turl);
    const r = await t`SELECT id, email, "tenantId", substring(password,1,12) AS hp, length(password) AS pl FROM "User" WHERE lower(email) = ${EMAIL}`;
    out.tenant = r;
  }
  return out;
}

async function login(password) {
  const res = await fetch(`${TENANT}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password }),
  });
  return res.status;
}

(async () => {
  console.log(`probe ${EMAIL}`);
  console.log('before:', JSON.stringify(await getRows(), null, 1));
  console.log('login old(before):', await login(OLD_PW));

  const lr = await fetch(`${TENANT}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: OLD_PW }),
  });
  const lb = await lr.json();
  const token = lb?.token || lb?.data?.token;
  if (!token) { console.log('no token — abort'); return; }

  const cr = await fetch(`${TENANT}/api/auth/change-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ currentPassword: OLD_PW, newPassword: NEW_PW }),
  });
  console.log('change-password:', cr.status, JSON.stringify(await cr.json().catch(() => null)));

  console.log('after:', JSON.stringify(await getRows(), null, 1));
  console.log('login old(after):', await login(OLD_PW));
  console.log('login new(after):', await login(NEW_PW));

  // restore
  const lr2 = await fetch(`${TENANT}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: NEW_PW }),
  });
  const lb2 = await lr2.json();
  const token2 = lb2?.token || lb2?.data?.token;
  if (token2) {
    const rr = await fetch(`${TENANT}/api/auth/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token2}` },
      body: JSON.stringify({ currentPassword: NEW_PW, newPassword: OLD_PW }),
    });
    console.log('restore:', rr.status);
  }
  console.log('login old(restore):', await login(OLD_PW));
  console.log('final rows:', JSON.stringify(await getRows(), null, 1));
})();
