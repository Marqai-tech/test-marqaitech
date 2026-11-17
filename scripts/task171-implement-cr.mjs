// Task 171 — implement the approved CR with deploy evidence.
const BASE = 'https://nexus-hrms-demo.vercel.app';
const T = { 'Content-Type': 'application/json' };
const CR_ID = 'cmvthhnos000108lc4qtr1pgl';
const DEPLOY_COMMIT = 'a76484f5';

const login = await fetch(BASE + '/api/auth/login', {
  method: 'POST', headers: T,
  body: JSON.stringify({ email: 'superadmin@3boxeshrms.com', password: 'MarqAI@2026' }),
});
const { token } = await login.json();
const H = { ...T, Authorization: `Bearer ${token}` };

const evidence = [
  'DEPLOY: commit ' + DEPLOY_COMMIT + ' pushed to marqai+origin; Vercel build LIVE on marqaitechgroup.3boxeshrms.com AND nexus-hrms-demo.vercel.app (bundle-marker scan: "The form lives right here in the page" + "Close form" found in authenticated page chunks).',
  'E2E marqaitechgroup (hr@marqaitech.com): 10/10 PASS — embedded-form bundle markers on /project-management, /project-management/tasks, /project-management/clients, /projects/3-BOXES-LUXURY-PORTAL board (chunks=22/19/19/20); POST task with module/subModule/subSection/softwareLink -> 201 + fields stored; DELETE cleanup 200; GET /api/attendance/my-roster 200 (Task 169 intact); anonymous POST /api/attendance/bulk-update 401 JSON (build-alive contract).',
  'E2E nexus-hrms-demo (superadmin): 10/10 PASS — same matrix vs project "HR Portal Rollout" (task id cmvti0l48000408jpnmmms6ix created+deleted).',
  'nexus-hrms-mu.vercel.app: /api/auth/login answers 404 (platform-down, pre-existing since Task 169 close-out — NOT caused by this release).',
  'CHECKS pre-push: tsc 1844 == pristine stash baseline (0 new), eslint == pristine on 4 modified pages (12/3/20/101) + 0 on new component, duplicate-import scan clean on all 5 touched files, dev-mode compile of the 4 pages 200 OK / 0 compile errors.',
].join(' ');

const r = await fetch(`${BASE}/api/super-admin/change-requests/${CR_ID}`, {
  method: 'PATCH', headers: H,
  body: JSON.stringify({ action: 'implement', deployCommit: DEPLOY_COMMIT, evidence }),
});
console.log('implement:', r.status, JSON.stringify(await r.json().catch(() => ({}))).slice(0, 300));
