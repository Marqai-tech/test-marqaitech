/**
 * Probe LIVE data structures to diagnose email-alert routing.
 * READ-ONLY — looks at employees (user links), update-requests approver
 * resolution, and workflow config on the LIVE tenant.
 */
const LIVE = 'https://marqaitechgroup.3boxeshrms.com';
const SLUG = 'marqaitechgroup';

async function main() {
  const login = await fetch(`${LIVE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'hr@gmail.com', password: 'MarqAI@2026' }),
    signal: AbortSignal.timeout(30000),
  }).then(r => r.json());
  const H = { Authorization: `Bearer ${login.token}`, 'x-tenant-slug': SLUG };
  console.log('hr userId:', login.user?.id, '| role:', login.user?.role);

  const dump = async (label, path) => {
    try {
      const res = await fetch(`${LIVE}${path}`, { headers: H, signal: AbortSignal.timeout(30000) });
      const body = await res.json().catch(() => null);
      console.log(`\n=== ${label} ${path} -> ${res.status} ===`);
      if (!body) { console.log('  (non-JSON)'); return; }
      const arr = Array.isArray(body) ? body : (body.employees || body.requests || body.configs || body.config || body.data || null);
      if (Array.isArray(arr)) {
        console.log('  count:', arr.length);
        arr.slice(0, 6).forEach(x => {
          const e = x.employee || x;
          console.log('  -', JSON.stringify({ id: x.id, email: e.email || x.email, name: e.firstName ? e.firstName + ' ' + (e.lastName || '') : (e.name || x.name), userId: e.userId || x.userId, status: e.status || x.status, role: e.role || x.role, approverType: x.approverType, approverName: x.approverName }).slice(0, 220));
        });
      } else if (body.config || body.configs) {
        console.log(JSON.stringify(body).slice(0, 1200));
      } else {
        console.log(JSON.stringify(body).slice(0, 800));
      }
    } catch (e) { console.log(`\n=== ${label} ${path} -> ERR ${e.message}`); }
  };

  await dump('EMPLOYEES', '/api/employees?limit=8&includePhotos=0');
  await dump('WORKFLOW-CONFIG update_profile', '/api/employees/workflow-config?type=update_profile');
  await dump('UPDATE-REQUESTS mine', '/api/employees/update-requests?box=mine&limit=5');
  await dump('UPDATE-REQUESTS approver', '/api/employees/update-requests?box=approver&limit=5');
}
main().catch(e => { console.error('ERR:', e.message); process.exit(1); });
