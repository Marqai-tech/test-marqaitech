// Task 171 (a76484f5) post-deploy E2E — embedded create-task form on 4 surfaces,
// create-task API contract, My Duty Roster (Task 169) regression.
const BASE = process.argv[2] || 'https://marqaitechgroup.3boxeshrms.com';
const T = { 'Content-Type': 'application/json' };

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => { console.log((cond ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : '')); cond ? pass++ : fail++; };

async function pageChunks(route, cookie) {
  const html = await (await fetch(BASE + route, { headers: { Cookie: `tb_token=${cookie}` } })).text();
  return [...new Set([...html.matchAll(/src="(\/_next\/static\/[^"]+\.js[^"]*)"/g)].map((m) => m[1]))];
}
async function bundleMarkers(route, markers, cookie) {
  const chunks = await pageChunks(route, cookie);
  const found = [], missing = [];
  for (const mk of markers) {
    let hit = false;
    for (const c of chunks) {
      const js = await (await fetch(BASE + c)).text();
      if (js.includes(mk)) { hit = true; break; }
    }
    (hit ? found : missing).push(mk);
  }
  return { found, missing, chunkCount: chunks.length };
}

(async () => {
  const EMAIL = process.argv[3] || 'hr@marqaitech.com';
  const PASSWORD = process.argv[4] || 'MarqAI@2026';
  const login = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: T, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) });
  const { token } = await login.json();
  if (!token) { console.log('LOGIN FAILED'); process.exit(1); }
  const H = { ...T, Authorization: `Bearer ${token}` };

  console.log('=== 1. BUNDLE MARKERS — embedded form on all 4 surfaces ===');
  const M = ['The form lives right here in the page', 'Close form'];
  const pm = await bundleMarkers('/project-management', M, token);
  ok('PM dashboard chunks carry embedded-form markers', pm.missing.length === 0, `chunks=${pm.chunkCount} found=[${pm.found}] missing=[${pm.missing}]`);
  const tk = await bundleMarkers('/project-management/tasks', M, token);
  ok('Tasks page chunks carry embedded-form markers', tk.missing.length === 0, `chunks=${tk.chunkCount} missing=[${tk.missing}]`);
  const cl = await bundleMarkers('/project-management/clients', ['Raise Issue'], token);
  ok('Clients page chunks carry Raise-Issue flow', cl.missing.length === 0, `chunks=${cl.chunkCount} missing=[${cl.missing}]`);

  console.log('=== 2. PROJECT BOARD PAGE (real id) ===');
  const pr = await fetch(BASE + '/api/projects?limit=5', { headers: H });
  const prj = await pr.json().catch(() => null);
  const projects = prj?.projects || prj?.data || [];
  ok('GET /api/projects returns list', pr.status === 200 && projects.length > 0, `n=${projects.length}`);
  if (projects.length > 0) {
    const pid = projects[0].id;
    const bd = await bundleMarkers(`/projects/${pid}`, M, token);
    ok('delivery-board chunks carry embedded-form markers', bd.missing.length === 0, `project=${projects[0].name} chunks=${bd.chunkCount} missing=[${bd.missing}]`);

    console.log('=== 3. CREATE-TASK API CONTRACT (unchanged, still accepts breakdown fields) ===');
    const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const ct = await fetch(BASE + `/api/projects/${pid}/tasks`, {
      method: 'POST', headers: H,
      body: JSON.stringify({
        name: `[Task 171 E2E] Embedded form smoke ${stamp}`, priority: 'low', taskType: 'development', workflowStep: 'testing',
        module: 'E2E', subModule: 'Embedded form', subSection: 'Smoke', softwareLink: 'https://example.com/task171',
      }),
    });
    const ctj = await ct.json().catch(() => null);
    const task = ctj?.task || ctj?.data || ctj;
    ok('POST task with breakdown fields succeeds', ct.ok, `status=${ct.status} id=${task?.id || '?'}`);
    if (task?.id) {
      ok('stored module path', (task.module === 'E2E' && task.subModule === 'Embedded form'), JSON.stringify({ module: task.module, subModule: task.subModule, subSection: task.subSection, softwareLink: task.softwareLink }));
      const del = await fetch(BASE + `/api/projects/${pid}/tasks/${task.id}`, { method: 'DELETE', headers: H });
      ok('E2E task cleaned up', del.ok, `status=${del.status}`);
    }
  }

  console.log('=== 4. REGRESSION — my-roster + bulk-update contracts ===');
  const mr = await fetch(BASE + '/api/attendance/my-roster?month=2026-10', { headers: H });
  ok('GET /api/attendance/my-roster 200 (Task 169 intact)', mr.status === 200, String(mr.status));
  const anon = await fetch(BASE + '/api/attendance/bulk-update', { method: 'POST', headers: T, body: '{}' });
  ok('unauthenticated POST bulk-update -> 401 JSON', anon.status === 401, String(anon.status));

  console.log(`\nRESULT: ${pass} PASS / ${fail} FAIL on ${BASE}`);
  process.exit(fail === 0 ? 0 : 1);
})();
