// Task 164 — governance close-out: PATCH implement with deploy evidence.
const BASE = 'https://nexus-hrms-demo.vercel.app';
const T = { 'Content-Type': 'application/json' };
const CR_ID = 'cmvqpwxm2000007ifuodtg37h';
const DEPLOY_COMMIT = '6d2b589f';

const login = await fetch(BASE + '/api/auth/login', {
  method: 'POST', headers: T,
  body: JSON.stringify({ email: 'superadmin@3boxeshrms.com', password: 'MarqAI@2026' }),
});
const { token } = await login.json();
const H = { ...T, Authorization: `Bearer ${token}` };

const patch = await fetch(`${BASE}/api/super-admin/change-requests/${CR_ID}`, {
  method: 'PATCH', headers: H,
  body: JSON.stringify({
    action: 'implement',
    deployCommit: DEPLOY_COMMIT,
    evidence:
      'DEPLOYED 6d2b589f (Vercel auto-deploy from origin/main). ' +
      'POST-DEPLOY VERIFY (scripts/task164-postdeploy-verify.cjs): 11 PASS / 0 FAIL — ' +
      '(1) ALL THREE DOMAINS reachable: nexus-hrms-demo.vercel.app (307), marqaitechgroup.3boxeshrms.com (307), 3-boxes-hrms.vercel.app (200). ' +
      '(2) DASHBOARD PANEL: the /dashboard bundle carries the "Company Policies & Handbook" panel (chunk 05mor9_7b_zb_.js) — summary chip, PENDING/ACKNOWLEDGED per-policy cards, Read & Acknowledge CTA into /policies-handbook/[id]. Employee E2E with a REAL employee login (Madhuri MARQ008): GET /api/policies/handbook?summary=1 → 200 {total:1, pending:0, acknowledged:1}, Leave Policy=acknowledged. ' +
      '(3) BIOMETRIC ID MAPPING: production data applied pre-push (MARQ008 Madhuri N biometricId=007; MARQ007 Suresh V N biometricId=2 + autoPresentAllDays=true; code map seeded {"002":"MARQ007","007":"MARQ008"} — immediate protection on the live deployment). Post-deploy: admin POST /api/attendance/biometric/sync {rematch:true,reclassifyDays:31} → success (idempotent, 0 new / 0 unmatched); Madhuri punch-backed days 9/17/22 Oct all carry attendance rows (in+out recomputed); zero 007 punches attributed to MARQ007 (biometric map outranks the MARQxxx transform — the 007→MARQ007 mis-attribution path is dead). ' +
      '(4) SURESH ALL-DAYS-PRESENT: POST /api/attendance/auto-present {employeeId, backfillDays:31} → created 8 rows on the first run, second run idempotent "Nothing to change (1 management employee(s) in scope)" — forced inclusion via autoPresentAllDays works; final October state: every working day covered by real punches or auto-present rows (5 punchMethod=auto rows on punchless days; real punches won on the rest). ' +
      '(5) REMINDER WORKFLOW LIVE: GET /api/cron/policy-ack-reminders (admin-JWT manual path) → 200, tenants=1, 6 pending employees identified (Leave Policy v1.0, 75 days pending) with per-employee diag: employee reminder / RM alert / HR alert all dispatched+deduped (26 Oct delivery proven in NotificationDelivery: HR admin@marqaitech.com + hr@marqaitech.com + CEO mahesh@marqaitech.com + RM Vardhani Reddy received ack_pending identifying each employee and policy; ack_confirmed fired on 27 Oct as employees acknowledged). Daily schedule 03:00 UTC in vercel.json unchanged. ' +
      '(6) CHECKS: tsc 1843 == origin/main baseline (0 new); eslint 22 errors/39 warnings on the 6 touched files == identical baseline (0 new); no APK/version-chain changes (pure web). ' +
      'NOTE: employees Suresh V N (MARQ007) and Shardhamma (MARQ004) have no user login — their personal reminders cannot dispatch, but RM + HR alerts identify them (by design).',
  }),
});
console.log('implement patch:', patch.status);
