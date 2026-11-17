/**
 * Task 96 diag — find the "Internal Server Error" on the tenant link.
 * Authenticated probes against LIVE tenant site + LIVE super admin + demo.
 * READ-ONLY: GET requests only.
 */
const HDRS = { 'Content-Type': 'application/json' };

const TARGETS = [
  {
    name: 'LIVE tenant (marqaitechgroup.3boxeshrms.com)',
    base: 'https://marqaitechgroup.3boxeshrms.com',
    login: { email: 'hr@gmail.com', password: 'MarqAI@2026' },
    paths: [
      '/api/me/context', '/api/dashboard', '/api/employees', '/api/attendance',
      '/api/leaves', '/api/leave-requests', '/api/payroll', '/api/companies',
      '/api/departments', '/api/designations', '/api/branches', '/api/holidays',
      '/api/notifications', '/api/tickets', '/api/reports/attendance?period=monthly',
      '/api/my-profile', '/api/announcements', '/api/settings', '/api/collaboration-settings',
    ],
  },
  {
    name: 'LIVE super admin (3boxeshrms.com)',
    base: 'https://3boxeshrms.com',
    login: { email: 'superadmin@3boxeshrms.com', password: 'MarqAI@2026' },
    paths: [
      '/api/me/context', '/api/super-admin/dashboard', '/api/super-admin/dashboard?full=1',
      '/api/tenants', '/api/subscriptions', '/api/tickets', '/api/companies',
      '/api/super-admin/audit-logs?limit=5', '/api/super-admin/change-requests',
      '/api/super-admin/feature-flags', '/api/super-admin/packages',
      '/api/super-admin/trial-requests', '/api/super-admin/purchase-transactions',
      '/api/super-admin/tenant-usage', '/api/super-admin/storage-quotas',
      '/api/super-admin/sso-providers', '/api/super-admin/domain',
      '/api/super-admin/collab-features', '/api/super-admin/ai-settings',
      '/api/super-admin/ediscovery', '/api/super-admin/rbac',
    ],
  },
];

async function main() {
  for (const t of TARGETS) {
    console.log(`\n===== ${t.name} =====`);
    let token = null;
    try {
      const r = await fetch(`${t.base}/api/auth/login`, { method: 'POST', headers: HDRS, body: JSON.stringify(t.login) });
      const b = await r.json().catch(() => ({}));
      token = b.token || b.accessToken;
      console.log(`login: HTTP ${r.status} ${token ? 'OK' : 'FAIL ' + JSON.stringify(b).slice(0, 200)}`);
    } catch (e) {
      console.log(`login EXC: ${e.message}`);
      continue;
    }
    if (!token) continue;
    const auth = { Authorization: `Bearer ${token}` };
    for (const p of t.paths) {
      try {
        const r = await fetch(`${t.base}${p}`, { headers: auth });
        const mark = r.status >= 500 ? '*** 5xx ***' : r.status >= 400 ? '4xx' : 'ok';
        console.log(`${mark.padEnd(10)} ${r.status}  GET ${p}`);
        if (r.status >= 500) {
          const txt = await r.text();
          console.log(`    body: ${txt.slice(0, 300)}`);
        }
      } catch (e) {
        console.log(`EXC         GET ${p}  ${e.message}`);
      }
    }
  }
}

main().catch((e) => { console.log('FATAL', e); process.exit(1); });
