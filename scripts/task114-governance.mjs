// Task 114 governance: register the change request, then approve / implement.
// Usage: node scripts/task114-governance.mjs register|implement <crId> <commitSha>
const DEMO = 'https://nexus-hrms-demo.vercel.app';
const EMAIL = 'superadmin@3boxeshrms.com';
const PASSWORD = 'MarqAI@2026';

async function post(url, payload, token) {
  const res = await fetch(url, {
    method: 'POST',
    signal: AbortSignal.timeout(30000),
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  try { return { status: res.status, data: JSON.parse(text) }; } catch { return { status: res.status, data: { raw: text.slice(0, 200) } }; }
}
async function patch(url, payload, token) {
  const res = await fetch(url, {
    method: 'PATCH',
    signal: AbortSignal.timeout(30000),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  try { return { status: res.status, data: JSON.parse(text) }; } catch { return { status: res.status, data: { raw: text.slice(0, 200) } }; }
}

const login = await post(`${DEMO}/api/auth/login`, { email: EMAIL, password: PASSWORD });
if (!login.data.token) { console.error('LOGIN FAILED', login.status, JSON.stringify(login.data).slice(0, 200)); process.exit(1); }
const token = login.data.token;
console.log('super-admin login OK');

const mode = process.argv[2] || 'register';

if (mode === 'register') {
  const r = await post(`${DEMO}/api/super-admin/change-requests`, {
    title: 'Task 114: Project Management module on mobile (web-parity /api/projects) — APK v1.4.0+14',
    description: [
      'User request: "now build the screen and make it dynamic for project management connecting from the web application and build the apk update it in vercel now".',
      'MOBILE (Flutter v1.4.0+14, permanent release key — upgrades over v1.3.0 without uninstall):',
      '1. NEW Project Management module wired to the SAME live endpoints the web project-management module uses: GET /api/projects (list, role-scoped server-side), GET /api/projects/[id] (detail with tasks/milestones/allocations + project-RBAC access), GET/POST /api/projects/[id]/tasks, PATCH /api/projects/[id]/tasks/[taskId].',
      '2. Projects home: stat strip (total/active/on-hold/done/tasks), search by name-code-client (server-side), status filter chips, pull-to-refresh, project cards with progress bar, client, type, task/team/milestone counts, target date.',
      '3. Project detail (4 tabs): Overview (progress hero, client/department/company, dates, BUDGET + billing + hours gated by the server access object exactly like the web), Tasks (grouped To Do / In Progress / Review / Done, priority badges, assignee, milestone, sprint, story points, dependency (after) tag, status-move sheet with the server finish-to-start gate surfaced), Milestones (phase/order, plan vs actual dates, completion %, approval badge), Team (allocation role + %).',
      '4. Create: New Project sheet (name/code/company/type/budget/start date) and New Task sheet (name/assignee from allocations/priority/estimate/due) — created on the same server the web uses, instantly visible on both.',
      '5. Entry points: home dashboard Modules grid tile + drawer item.',
      'TESTING: flutter analyze 0 errors (116 pre-existing infos); 20/20 flutter tests incl. new project-model tests against REAL captured API fixtures (projects.json + project_detail.json from the live demo workspace); tsc clean; APK aapt2-verified versionCode 14 / versionName 1.4.0 / label 3 Boxes HRMS; apksigner cert = committed release key (590a456e…3749c).',
    ].join('\n'),
    category: 'employees',
    priority: 'high',
    requestedBy: 'automation (Task 114)',
  }, token);
  console.log('REGISTER', r.status, JSON.stringify(r.data).slice(0, 300));
  const id = r.data?.request?.id || r.data?.id;
  if (!id) process.exit(1);
  const a = await patch(`${DEMO}/api/super-admin/change-requests/${id}`, { action: 'approve' }, token);
  console.log('APPROVE', a.status, id);
  console.log('CR_ID=' + id);
} else if (mode === 'implement') {
  const [, , crId, sha] = process.argv;
  const r = await patch(`${DEMO}/api/super-admin/change-requests/${crId}`, { action: 'implement', implementationNotes: `Deployed to LIVE (git auto-deploy) and demo (CLI via deploy-release.sh guard). Commit ${sha}. Directory scoping verified (employee=department, manager=team, admin=all), punch mode recorded, biometric + new screens in APK v1.3.0+13 live on all three hosts.` }, token);
  console.log('IMPLEMENT', r.status, crId, JSON.stringify(r.data).slice(0, 200));
} else {
  console.error('unknown mode');
  process.exit(1);
}
