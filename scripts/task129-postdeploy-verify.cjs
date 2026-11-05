/**
 * Task 129 — post-deploy production E2E against the LIVE tenant.
 * Verifies: app-version 1.6.0/27 + APK 200 on all 3 hosts, task create with
 * description/dates/hrs, attachment upload/list/download/delete + count badge,
 * admin reports payloads (4 modules), CEO role wiring (management user),
 * payroll/validations still fine. Cleans up created test data.
 */
const BASE = process.env.TENANT_BASE || 'https://marqaitechgroup.3boxeshrms.com';
const DEMO = 'https://nexus-hrms-demo.vercel.app';
const APEX = 'https://3boxeshrms.com';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  PASS ${name}${extra ? ' — ' + extra : ''}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
};
const T = { 'Content-Type': 'application/json' };

(async () => {
  // ── 1. version + APK on all three hosts ──
  for (const [label, base] of [['tenant', BASE], ['apex', APEX], ['demo', DEMO]]) {
    try {
      const r = await fetch(base + '/api/public/app-version');
      const j = await r.json();
      const v = j?.release || j;
      ok(`app-version ${label}`, v?.versionName === '1.6.0' && v?.versionCode === 27, `${v?.versionName}(${v?.versionCode})`);
    } catch (e) { ok(`app-version ${label}`, false, e.message); }
    try {
      const r = await fetch(base + '/downloads/3boxes-hrms-mobile-v1.6.0.apk', { method: 'HEAD' });
      ok(`APK 200 ${label}`, r.status === 200, `${r.status}`);
    } catch (e) { ok(`APK 200 ${label}`, false, e.message); }
  }

  // ── 2. tenant login ──
  const login = await fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: T,
    body: JSON.stringify({ email: 'hr@gmail.com', password: 'MarqAI@2026' }),
  });
  const lj = await login.json().catch(() => ({}));
  const token = lj?.token;
  ok('tenant login', !!token, lj?.user?.role);
  const H = { ...T, Authorization: `Bearer ${token}` };

  // ── 3. projects + tasks with new fields ──
  const pr = await fetch(BASE + '/api/projects?limit=5', { headers: H });
  const pj = await pr.json();
  const projects = pj?.projects || pj?.data || [];
  ok('projects list', pr.status === 200 && projects.length > 0, `${projects.length} projects`);
  const project = projects[0];

  let taskId = null;
  if (project?.id) {
    const tr = await fetch(`${BASE}/api/projects/${project.id}/tasks`, {
      method: 'POST', headers: H,
      body: JSON.stringify({
        name: 'T129 E2E — task details + attachments',
        priority: 'medium',
        workflowStep: 'testing',
        description: 'Task 129 E2E description — DELETE ME',
        plannedStart: '2026-10-23',
        plannedEnd: '2026-10-30',
        estimatedHours: 6,
      }),
    });
    const tj = await tr.json().catch(() => ({}));
    taskId = tj?.task?.id || tj?.id;
    ok('create task with description+dates+hrs', tr.ok && !!taskId, tr.status);
    if (taskId) {
      const gr = await fetch(`${BASE}/api/projects/${project.id}/tasks`, { headers: H });
      const gj = await gr.json();
      const row = (gj?.tasks || []).find((t) => t.id === taskId);
      ok('task persists description', row?.description === 'Task 129 E2E description — DELETE ME');
      ok('task persists plannedStart/End', !!row?.plannedStart && !!row?.plannedEnd);
      ok('task persists estimatedHours=6', Number(row?.estimatedHours) === 6);
      ok('tasks payload has _count.attachments', row?._count && typeof row._count.attachments === 'number', `${row?._count?.attachments}`);

      // ── 4. attachments: upload → list → download → delete ──
      const dataUrl = 'data:image/png;base64,' + Buffer.from(
        '89504e470d0a1a0a0000000d4948445200000001000000010806000000' + '1f15c4890000000d49444154789c63' + '00' + '010000' + '000500018b' + '3b' + '4d' + 'ad' + '4b' + '0000000049454e44ae426082', 'hex'
      ).toString('base64');
      const up = await fetch(`${BASE}/api/projects/${project.id}/attachments`, {
        method: 'POST', headers: H,
        body: JSON.stringify({ fileName: 't129-e2e.png', mimeType: 'image/png', size: 70, dataUrl, taskId, category: 'task' }),
      });
      const uj = await up.json().catch(() => ({}));
      const attId = uj?.attachment?.id;
      ok('upload task attachment', up.ok && !!attId, up.status);
      const lst = await fetch(`${BASE}/api/projects/${project.id}/attachments?taskId=${taskId}`, { headers: H });
      const lj2 = await lst.json();
      ok('list attachments ?taskId=', lst.ok && (lj2?.attachments || []).some((a) => a.id === attId));
      if (attId) {
        const dl = await fetch(`${BASE}/api/projects/${project.id}/attachments/${attId}`, { headers: H });
        ok('download streams bytes', dl.status === 200 && (await dl.arrayBuffer()).byteLength > 0);
        const del = await fetch(`${BASE}/api/projects/${project.id}/attachments/${attId}`, { method: 'DELETE', headers: H });
        ok('delete attachment', del.ok);
      }
      // patch description update round-trip
      const pa = await fetch(`${BASE}/api/projects/${project.id}/tasks/${taskId}`, {
        method: 'PATCH', headers: H,
        body: JSON.stringify({ description: 'Task 129 E2E updated — DELETE ME', estimatedHours: 8 }),
      });
      ok('PATCH description+hrs', pa.ok);

      // cleanup
      const de = await fetch(`${BASE}/api/projects/${project.id}/tasks/${taskId}`, { method: 'DELETE', headers: H });
      ok('cleanup test task', de.ok);
    }
  }

  // ── 5. admin reports (4 modules) ──
  for (const t of ['employee_report', 'leave_report', 'attendance_report']) {
    const r = await fetch(`${BASE}/api/reports?type=${t}&month=09&year=2026`, { headers: H });
    const j = await r.json().catch(() => ({}));
    ok(`report ${t}`, r.status === 200 && !j?.error, r.status);
  }
  const prr = await fetch(BASE + '/api/project-reports', { headers: H });
  const prj = await prr.json().catch(() => ({}));
  ok('project-reports summaryStats', prr.status === 200 && !!prj?.summaryStats, prr.status);

  // ── 6. CEO wiring — tenant_admin-granted modules still reachable; ceo role row present via RBAC roles API ──
  const rbac = await fetch(BASE + '/api/rbac/roles', { headers: H });
  const rbj = await rbac.json().catch(() => ({}));
  const roles = rbj?.roles || rbj?.data || [];
  ok('RBAC lists CEO role', Array.isArray(roles) && roles.some((r) => r.key === 'ceo'), roles.map((r) => r.key).slice(0, 8).join(','));

  // ── 7. payroll validations page still 200 (Task 126 guard intact) ──
  const pv = await fetch(BASE + '/payroll/validations', { headers: { Authorization: `Bearer ${token}` } });
  ok('/payroll/validations 200', pv.status === 200, `${pv.status}`);

  console.log(`\n${pass}/${pass + fail} E2E checks pass`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
