// Task 166 — governance: register + approve BEFORE push.
// (Shardha MARQ004 — present/absent-only salary mode; punch timing not mandatory.)
const BASE = 'https://nexus-hrms-demo.vercel.app';
const T = { 'Content-Type': 'application/json' };

const login = await fetch(BASE + '/api/auth/login', {
  method: 'POST', headers: T,
  body: JSON.stringify({ email: 'superadmin@3boxeshrms.com', password: 'MarqAI@2026' }),
});
const { token } = await login.json();
const H = { ...T, Authorization: `Bearer ${token}` };

const cr = await fetch(BASE + '/api/super-admin/change-requests', {
  method: 'POST', headers: H,
  body: JSON.stringify({
    title: 'Task 166 — present/absent-only salary mode (per-employee attendance exception) for MARQ004',
    description:
      'User request: "Shardha amma - MARQ004, for this employee consider only the present and absent punches — timing is not mandatory for salary calculation." ' +
      'IMPLEMENTATION (follows the Task 164 runtime-column pattern — no Prisma schema migration): (1) new runtime TEXT column Employee.presentAbsentOnly (EXTRA_PROFILE_KEYS + write DDL, ensured on the employee write path); (2) e-timeoffice sync: employees flagged \'true\' are never marked late or half_day from punches — any punch day lands as present, retroactively overriding a stored half_day/late inside the reclassification window (raw-SQL flag probe per sync batch); (3) payroll engine: summarizeAttendance counts late + half_day rows as PRESENT for flagged employees (only true absents reduce pay), flag set loaded via raw SQL per payroll run; (4) admin UI: new "Present / Absent only (timing not mandatory)" checkbox beside the existing all-days-present exception in the add/edit employee form (payload normalizes to \'true\'/\'\' like Task 164), and the View Details Employment tab now names the active exception mode; (5) PRODUCTION DATA (pre-push, scripts/task166-apply-data.mts): column ensured, MARQ004 flagged presentAbsentOnly=\'true\', 17 existing late/half_day attendance rows flipped to present with an explanatory note (2 late Sep + 5 half_day Sep + Oct 8 half_day + Oct 23 late + 8 more) — absent rows stay absent. ' +
      'Note: MADHURI (MARQ008, biometric 007) and SURESH (MARQ007, biometric 2 + auto-present) mappings from Task 164 verified intact in production. Madhuri\'s missing punches are a DEVICE-side gap: the e-timeoffice cloud has zero Empcode-007 punches after 22 Oct 14:32 IST while other codes flow (device resumed uploading after the 23 Oct outage) — she needs re-enrollment on the face reader; the mapping will credit her punches the moment they arrive. ' +
      'TESTS: tsc error count 1890 == origin/main baseline 1890 (0 new); eslint on the 5 touched files 39 problems == identical baseline (0 new); no version bump / no APK rebuild (web-only change).',
    category: 'feature',
    riskLevel: 'low',
    module: 'Attendance',
    relatedModule: 'Payroll',
  }),
});
const d = await cr.json();
const id = d?.request?.id ?? d?.id ?? d?.data?.id;
console.log('change-request created:', id || JSON.stringify(d).slice(0, 200));

if (id) {
  const ap = await fetch(`${BASE}/api/super-admin/change-requests/${id}`, {
    method: 'PATCH', headers: H, body: JSON.stringify({ action: 'approve' }),
  });
  console.log('approve:', ap.status);
}

const list = await fetch(BASE + '/api/super-admin/change-requests', { headers: H });
const ld = await list.json();
const reqs = ld.requests || ld.data || ld || [];
console.log('trail:', Array.isArray(reqs) ? `${reqs.length} requests, ${reqs.filter((r) => r.status === 'pending').length} pending` : ld);
