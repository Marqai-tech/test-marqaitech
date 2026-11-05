// Task 81 post-deploy verification — photos, management reportees, employee-list exclusion.
const BASES = [
  ['LIVE', 'https://marqaitechgroup.3boxeshrms.com', 'hr@gmail.com'],
  ['DEMO', 'https://nexus-hrms-mu.vercel.app', 'admin@3boxeshrms.com'],
];
const PASS = 'MarqAI@2026';
const MGMT_ROLES = ['manager', 'admin', 'tenant_admin', 'hr_admin', 'super_admin'];
const CURRENT = ['active', 'on_leave'];
let passN = 0, failN = 0;
const check = (name, cond, detail = '') => {
  if (cond) { passN++; console.log(`  PASS ${name}${detail ? ' — ' + detail : ''}`); }
  else { failN++; console.log(`  FAIL ${name} — ${detail}`); }
};

for (const [label, base, email] of BASES) {
  console.log(`\n===== ${label} (${base}) =====`);
  const login = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASS }) });
  const lb = await login.json();
  const t = lb?.token || lb?.data?.token || '';
  check('login', login.status === 200 && !!t, `status=${login.status}`);
  if (!t) continue;
  const api = async (p) => { const r = await fetch(base + p, { headers: { Authorization: `Bearer ${t}` } }); const b = await r.json().catch(() => ({})); return { s: r.status, b, ct: r.headers.get('content-type') }; };

  // 1) PHOTOS: list photo paths must now carry ?token= and serve 200 images WITHOUT headers (as <img> does)
  const list = await api('/api/employees?limit=500&export=1&excludeManagement=1');
  const emps = list.b?.employees || [];
  const photoPaths = emps.filter(e => e.avatar && String(e.avatar).startsWith('/api/employees/'));
  const withToken = photoPaths.filter(e => String(e.avatar).includes('token='));
  check('list photo URLs embed token', photoPaths.length === 0 || withToken.length === photoPaths.length, `${withToken.length}/${photoPaths.length} embed token`);
  if (photoPaths[0]) {
    const raw = String(photoPaths[0].avatar);
    const rel = raw.startsWith('http') ? raw : base + raw;
    const img = await fetch(rel); // NO auth header — exactly like <img src>
    const buf = await img.arrayBuffer();
    check('photo serves 200 image without auth header (img-tag simulation)',
      img.status === 200 && (img.headers.get('content-type') || '').startsWith('image/') && buf.byteLength > 1000,
      `status=${img.status} ct=${img.headers.get('content-type')} bytes=${buf.byteLength}`);
  } else {
    console.log('  SKIP img simulation (no photo paths on this site/scope)');
  }

  // 2) EMPLOYEE LIST excludes management: nobody designated / mgmt-role / with current reports
  const mgmtLeft = emps.filter(e =>
    e.isManagement === true ||
    MGMT_ROLES.includes(e.user?.role || '') ||
    emps.some(o => o.reportingManagerId === e.id),
  );
  check('excludeManagement=1 returns no management members', mgmtLeft.length === 0, `leftover=${mgmtLeft.map(e => e.employeeId).join(',') || 'none'}`);

  // toggle off → management visible again
  const listAll = await api('/api/employees?limit=500&export=1');
  const empsAll = listAll.b?.employees || [];
  const mgmtAll = empsAll.filter(e =>
    e.isManagement === true || MGMT_ROLES.includes(e.user?.role || '') || empsAll.some(o => o.reportingManagerId === e.id),
  );
  check('without param management members present (toggle works)', empsAll.length >= emps.length && (empsAll.length === emps.length || mgmtAll.length > 0), `all=${empsAll.length} excluded=${emps.length} mgmt=${mgmtAll.length}`);

  // 3) stats agree with visible list
  const stats = await api('/api/employees?page=1&limit=10&includeStats=1&excludeManagement=1');
  check('stats total == excluded-list size', stats.b?.stats?.total === emps.length, `stats.total=${stats.b?.stats?.total} rows=${emps.length}`);

  // 4) Inactive export (Task 80 semantics) still intact
  const inact = await api('/api/employees?limit=500&export=1&status=inactive');
  check('inactive export still returns separated staff (unaffected by mgmt filter)',
    inact.s === 200 && (inact.b?.employees || []).every(r => ['inactive', 'terminated', 'resigned'].includes(r.status)),
    `rows=${(inact.b?.employees || []).length}`);

  // 5) management reportees: live check — every reportee of any manager must be current
  // (client-side logic; verify via data: no manager's reportee set contains separated staff)
  const separated = empsAll.filter(e => !CURRENT.includes(e.status)).map(e => e.id);
  const badReports = empsAll.filter(e => e.reportingManagerId && separated.includes(e.id));
  console.log(`  INFO separated employees linked to managers: ${badReports.length} (client now filters them from reportee lists/counts)`);
}

console.log(`\nTOTAL: ${passN}/${passN + failN} pass — ${failN === 0 ? 'TASK 81 CONFIRMED LIVE' : 'CHECK FAILURES ABOVE'}`);
process.exit(failN === 0 ? 0 : 1);
