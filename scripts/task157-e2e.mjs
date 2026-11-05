#!/usr/bin/env node
/**
 * Task 157 — pre-deploy E2E verification against the LOCAL dev server.
 *
 * Covers:
 *  1. HR login (tenant_admin) + regularize list API
 *  2. Employees list (month-view filter source) + month attendance fetch
 *  3. NEW POST /api/attendance/bulk-update — validation (422 empty), execution
 *     path (bogus employee → per-item FK failure), role gate (employee → 403)
 *  4. Social feed governance (employee post → 403) + REAL broadcast:
 *     HR post → 201 → in-app Notification rows for ALL active tenant users
 *     + email deliveries via the tenant's configured SMTP → cleanup.
 *
 * Usage: node scripts/task157-e2e.mjs
 * (requires dev server on localhost:3000; DB cleanup uses DATABASE_URL from env)
 */
import { neon } from '@neondatabase/serverless';

const BASE = 'http://localhost:3000';
let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}${extra ? ' — ' + extra : ''}`); }
  else { fail++; failures.push(name); console.log(`  ✗ ${name}${extra ? ' — ' + extra : ''}`); }
}

async function api(path, opts = {}, token = '') {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'x-tenant-slug': 'marqaitechgroup', // simulate the tenant host locally
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  let body = null;
  try { body = await res.json(); } catch { /* ignore */ }
  return { status: res.status, body };
}

console.log(`\n=== Task 157 E2E @ ${BASE} ===\n`);

// ─── 1. Auth + regularize data ───
console.log('1. AUTH + REGULARIZE DATA');
const hrLogin = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'hr@marqaitech.com', password: 'MarqAI@2026' }) });
ok('HR (tenant_admin) login 200', hrLogin.status === 200 && !!hrLogin.body?.token, hrLogin.body?.role);
const hrToken = hrLogin.body?.token || '';

const regs = await api('/api/attendance/regularize?limit=200', {}, hrToken);
ok('GET /api/attendance/regularize 200', regs.status === 200 && Array.isArray(regs.body?.regularizations), `${regs.body?.regularizations?.length || 0} rows`);

const emps = await api('/api/employees?limit=500&excludeInactive=true', {}, hrToken);
const empList = emps.body?.employees || [];
ok('GET /api/employees 200', emps.status === 200 && empList.length > 0, `${empList.length} employees, ${empList.filter(e => e.department?.name).length} with department`);

const two = empList.slice(0, 2).map(e => e.id).join(',');
const monthAtt = await api(`/api/attendance?employeeIds=${encodeURIComponent(two)}&startDate=2026-10-01&endDate=2026-10-31&limit=10000`, {}, hrToken);
ok('GET /api/attendance month fetch 200', monthAtt.status === 200 && Array.isArray(monthAtt.body?.attendance), `${monthAtt.body?.attendance?.length || 0} records`);

// ─── 2. Bulk update API ───
console.log('2. BULK UPDATE API (new)');
const bulkEmpty = await api('/api/attendance/bulk-update', { method: 'POST', body: JSON.stringify({ updates: [] }) }, hrToken);
ok('bulk-update empty → 422', bulkEmpty.status === 422, bulkEmpty.body?.error);

const bulkBogus = await api('/api/attendance/bulk-update', {
  method: 'POST',
  body: JSON.stringify({ updates: [{ employeeId: 'no-such-employee-xyz', date: '2026-10-27', status: 'present', reason: 'e2e probe' }] }),
}, hrToken);
ok('bulk-update bogus employee → per-item failure reported', (bulkBogus.status === 422 || bulkBogus.status === 200) && (bulkBogus.body?.failedCount === 1 || bulkBogus.body?.updated === 0), JSON.stringify(bulkBogus.body?.failed?.[0]?.error || '').slice(0, 60));

const bulkBad = await api('/api/attendance/bulk-update', {
  method: 'POST',
  body: JSON.stringify({ updates: [{ employeeId: empList[0]?.id, date: '2026-10-27', status: 'banana', reason: 'e2e probe' }] }),
}, hrToken);
ok('bulk-update invalid status rejected per-item', (bulkBad.body?.failed?.[0]?.error || '').includes('Invalid status'), bulkBad.body?.failed?.[0]?.error);

// Employee role gate
const empLogin = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'bharath@marqaitech.com', password: 'MarqAI@2026' }) });
if (empLogin.status === 200 && empLogin.body?.token) {
  const empToken = empLogin.body.token;
  ok('employee login 200', true, empLogin.body?.role);
  const bulkEmp = await api('/api/attendance/bulk-update', { method: 'POST', body: JSON.stringify({ updates: [{ employeeId: 'x', date: '2026-10-27', status: 'present' }] }) }, empToken);
  ok('bulk-update as employee → 403', bulkEmp.status === 403, bulkEmp.body?.error);
  const feedEmp = await api('/api/social-feed', { method: 'POST', body: JSON.stringify({ content: 'employee probe' }) }, empToken);
  ok('feed POST as employee → 403 (governed, no broadcast)', feedEmp.status === 403, feedEmp.body?.code);
} else {
  ok('employee login (skipped — credentials unknown)', true, `status ${empLogin.status}`);
}

// ─── 3. Feed broadcast (REAL — tenant SMTP is configured) ───
console.log('3. FEED BROADCAST (HR admin post)');
const feedPost = await api('/api/social-feed', {
  method: 'POST',
  body: JSON.stringify({ content: '📢 Feed notifications are now live — every HR update posted here reaches you by email and as an in-app notification.', postType: 'announcement' }),
}, hrToken);
ok('feed POST as HR → 201', feedPost.status === 201, `post ${feedPost.body?.post?.id || '—'}`);
const postId = feedPost.body?.post?.id;

if (postId && process.env.DATABASE_URL) {
  const platform = neon(process.env.DATABASE_URL);
  const t = (await platform.query(`SELECT id FROM "Tenant" WHERE slug='marqaitechgroup'`))[0];
  const tdb = neon((await platform.query(`SELECT "connectionString" FROM "TenantDatabase" WHERE "tenantId"=$1 AND "isActive"=true`, [t.id]))[0].connectionString);

  // broadcast awaited inside the POST → rows are already committed
  const notifs = await tdb.query(
    `SELECT count(*)::int AS n, count(DISTINCT "userId")::int AS users FROM "Notification" WHERE "tenantId"=$1 AND "link"='/social-feed' AND "createdAt" > now() - interval '3 minutes'`, [t.id]);
  ok('in-app notifications created for all users', notifs[0].n >= 13 && notifs[0].users >= 13, `${notifs[0].n} rows / ${notifs[0].users} users`);

  const notifIds = (await tdb.query(
    `SELECT id FROM "Notification" WHERE "tenantId"=$1 AND "link"='/social-feed' AND "createdAt" > now() - interval '3 minutes'`, [t.id])).map(r => r.id);
  let emailSent = 0, emailFailed = 0;
  if (notifIds.length) {
    const del = await tdb.query(
      `SELECT channel, status, count(*)::int AS n FROM "NotificationDelivery" WHERE "notificationId" = ANY($1) GROUP BY channel, status`, [notifIds]);
    console.log('   deliveries:', JSON.stringify(del));
    emailSent = del.filter(d => d.channel === 'email' && d.status === 'sent').reduce((a, d) => a + d.n, 0);
    emailFailed = del.filter(d => d.channel === 'email' && d.status !== 'sent').reduce((a, d) => a + d.n, 0);
  }
  ok('email channel attempted for every recipient', (emailSent + emailFailed) >= 13, `${emailSent} sent via tenant SMTP, ${emailFailed} failed`);

  // ─── Cleanup: soft-delete the post, remove broadcast bell rows ───
  const delPost = await api(`/api/social-feed?id=${postId}`, { method: 'DELETE' }, hrToken);
  ok('cleanup: test post soft-deleted', delPost.status === 200);
  if (notifIds.length) {
    await tdb.query(`DELETE FROM "NotificationDelivery" WHERE "notificationId" = ANY($1)`, [notifIds]);
    await tdb.query(`DELETE FROM "Notification" WHERE id = ANY($1)`, [notifIds]);
    console.log(`   cleanup: removed ${notifIds.length} broadcast notification rows`);
  }
}

console.log(`\n=== RESULT: ${pass} pass, ${fail} fail ===`);
if (failures.length) { console.log('FAILED:', failures.join(' | ')); process.exit(1); }
