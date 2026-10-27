// Task 104: probe demo APIs — response shapes for dashboard/employees/leaves/attendance/payroll + role accounts
const BASE = 'https://nexus-hrms-demo.vercel.app';
const T = { 'Content-Type': 'application/json' };

// 1. candidate role logins
const candidates = [
  'admin@acme-global.com', 'hr@acme-global.com', 'manager@acme-global.com', 'employee@acme-global.com',
  'employee.acme@3boxeshrms.com', 'hr.acme@3boxeshrms.com', 'tenantadmin.acme@3boxeshrms.com',
  'employee@3boxeshrms.com', 'hr@3boxeshrms.com', 'tenantadmin@3boxeshrms.com',
  'employee.nova@3boxeshrms.com', 'employee.zenith@3boxeshrms.com',
];
const working = [];
for (const email of candidates) {
  const r = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: T, body: JSON.stringify({ email, password: 'MarqAI@2026' }) });
  let role = '';
  try { const j = await r.json(); role = j?.user?.role || ''; } catch {}
  if (r.ok) working.push({ email, role });
  console.log(`${r.ok ? '✅' : '❌'} ${email} → ${role || 'HTTP ' + r.status}`);
}

// 2. API shapes with tenant-admin token
const login = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: T, body: JSON.stringify({ email: 'admin@acme-global.com', password: 'MarqAI@2026' }) });
const { token } = await login.json();
const H = { Authorization: `Bearer ${token}` };
const brief = (o, depth = 0) => {
  if (o === null || typeof o !== 'object') return JSON.stringify(o);
  if (Array.isArray(o)) return `[${o.length}× ${o.length ? brief(o[0], depth + 1) : ''}]`;
  if (depth > 1) return '{…}';
  return '{' + Object.entries(o).slice(0, 14).map(([k, v]) => `${k}: ${brief(v, depth + 1)}`).join(', ') + '}';
};

for (const path of ['/api/dashboard', '/api/employees?limit=1', '/api/leaves', '/api/attendance', '/api/attendance/my-summary', '/api/payroll', '/api/notifications?limit=1']) {
  try {
    const r = await fetch(BASE + path, { headers: H });
    const txt = await r.text();
    let j; try { j = JSON.parse(txt); } catch { console.log(`\n## ${path} → HTTP ${r.status} (non-JSON: ${txt.slice(0, 80)})`); continue; }
    console.log(`\n## ${path} → HTTP ${r.status}\n  ${brief(j)}`);
  } catch (e) { console.log(`\n## ${path} → ERR ${e.message}`); }
}
console.log('\nWORKING ACCOUNTS:', JSON.stringify(working));
