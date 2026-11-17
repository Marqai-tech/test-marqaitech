// Task 119 — post-deploy regression sweep across LIVE tenant, apex and demo.
const CHECKS = [
  { name: 'LIVE tenant login (hr@gmail.com)', url: 'https://marqaitechgroup.3boxeshrms.com/api/auth/login', method: 'POST', body: { email: 'hr@gmail.com', password: 'MarqAI@2026' } },
  { name: 'Demo admin login', url: 'https://nexus-hrms-demo.vercel.app/api/auth/login', method: 'POST', body: { email: 'admin@acme-global.com', password: 'MarqAI@2026' } },
  { name: 'Super admin login @ apex', url: 'https://3boxeshrms.com/api/auth/login', method: 'POST', body: { email: 'superadmin@3boxeshrms.com', password: 'MarqAI@2026' } },
];

const j = (r) => r.json();

async function main() {
  // 1. Logins
  const tokens = {};
  for (const c of CHECKS) {
    const r = await fetch(c.url, { method: c.method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c.body) });
    const d = await j(r);
    tokens[c.name] = d.token;
    console.log(`${r.status === 200 && d.token ? 'PASS' : 'FAIL'} — ${c.name} (${r.status}, role=${d.user?.role})`);
  }

  // 2. Chat endpoints on LIVE tenant (already-seeded room from verify script)
  const H = { Authorization: `Bearer ${tokens['LIVE tenant login (hr@gmail.com)']}` };
  const rooms = await fetch('https://marqaitechgroup.3boxeshrms.com/api/collaboration/chat/rooms', { headers: H }).then(j);
  console.log(`${rooms.rooms ? 'PASS' : 'FAIL'} — LIVE chat rooms (${rooms.rooms?.length} rooms, preview of #1: ${JSON.stringify(rooms.rooms?.[0]?.messages?.[0]?.body?.slice(0, 40))})`);

  // 3. Employees (directory) on LIVE
  const emps = await fetch('https://marqaitechgroup.3boxeshrms.com/api/employees?limit=200', { headers: H }).then(j);
  console.log(`${emps.employees || emps.data ? 'PASS' : 'FAIL'} — LIVE employees directory (${(emps.employees || emps.data || []).length})`);

  // 4. Projects API on LIVE (Task 114 regression)
  const projects = await fetch('https://marqaitechgroup.3boxeshrms.com/api/projects', { headers: H }).then(j);
  const plist = projects.projects || projects.data || projects;
  console.log(`${Array.isArray(plist) ? 'PASS' : 'FAIL'} — LIVE projects (${Array.isArray(plist) ? plist.length : 'n/a'})`);

  // 5. Diagnostics + login page on LIVE
  for (const [name, url] of [
    ['LIVE /diagnostics', 'https://marqaitechgroup.3boxeshrms.com/diagnostics'],
    ['LIVE login page', 'https://marqaitechgroup.3boxeshrms.com/login'],
    ['Apex login page', 'https://3boxeshrms.com/login'],
    ['Demo login page', 'https://nexus-hrms-demo.vercel.app/login'],
  ]) {
    const r = await fetch(url);
    const html = await r.text();
    const showsNew = html.includes('1.5.2');
    console.log(`${r.status === 200 ? 'PASS' : 'FAIL'} — ${name} (${r.status}${name.includes('login') ? `, shows v1.5.2: ${showsNew}` : ''})`);
  }
}

main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
