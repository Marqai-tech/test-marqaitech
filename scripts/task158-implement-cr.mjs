// Task 158 — governance close-out: PATCH implement with deploy evidence.
const BASE = 'https://nexus-hrms-demo.vercel.app';
const T = { 'Content-Type': 'application/json' };
const CR_ID = 'cmvqg2zzt000008jnazbiyuae';
const DEPLOY_COMMIT = '4f26089e';

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
      'DEPLOYED 4f26089e (Vercel auto-deploy from origin/main; three pushes: 2eebc611 feature after parallel-session rebase over Tasks 159-163, 00d1aff8 workflow-config request fix, 4f26089e health raw-SQL applier fix). ' +
      'POST-DEPLOY VERIFY (scripts/task158-postdeploy-verify.mjs): 23 PASS / 0 FAIL — ' +
      '(1) ALL THREE DOMAINS reachable: nexus-hrms-demo.vercel.app (307), marqaitechgroup.3boxeshrms.com (307), 3-boxes-hrms.vercel.app (200). ' +
      '(2) AI ASSISTANT FIX live on all three hosts: POST /api/ai-chat {message}-only now returns 200 with server-issued sessionId (srv-...) + reply — the old "Message and sessionId are required" 400 is gone; second message reusing the sessionId returns the SAME session id (conversation continuity). currencySymbol chunk verified live. ' +
      '(3) BIOMETRIC: GET sync status reports lastPunchAt=2026-10-23T09:10:00Z lastPunchAgeDays=4 (device offline warning surfaces correctly); POST {rematch:true,reclassifyDays:31} → success, 0 new/0 duplicates (HRMS = time-office parity re-proven on live). Pre-deploy investigation: per-employee + ALL + alternate-endpoint + other-month-table probes prove the e-timeoffice cloud has NO punches after 23 Oct 14:40 IST (terminal stopped uploading — on-site device/network issue; 26-27 Oct working days empty upstream); checkpoint rewind to 102026$1 re-downloaded all 316 October records with 0 imported / 316 deduped (exact parity, idempotent); October attendance re-classified in production via the bundled real lib (esbuild runner). ' +
      '(4) SECTION EDIT E2E on the live tenant (mahesh@marqaitech.com submits, hr@marqaitech.com approves): health request → 201 pending; duplicate while pending → 409; invalid verification payload → 400; request visible in admin list as "Health (section edit)" with readable payload; approve → 200 "Request approved and applied to employee record (2 item(s))"; employee row verified in DB: bloodGroup=O+ + emergencyMedicalCondition written via the runtime-column raw-SQL path; request row status=applied. A real Verification section submission (Aadhaar details) is left PENDING for HR to exercise the approve/reject UI. ' +
      '(5) CHECKS: tsc 1843 == origin/main baseline (0 new; merged tree after resolving 4 conflicts with Tasks 159-163 — sync engine merged into Task 161 multi-batch architecture with reclassify window + auto-row override preserved); eslint 24 errors/21 warnings across the 11 touched files == baseline patterns (my new code clean; FloatingAIAssistant/ai-chatbot sessionId now generated post-await so the purity rule passes). ' +
      'NOTA BENE for HR: the 23 Oct attendance rows, statuses (late/half-day via the 3-late rule) and work hours were recomputed from the actual punch data; 24-25 Oct = weekend, 26-27 Oct have NO punches because the face-reader is offline from the cloud — please check the BIO-PARK D01 device network on site.',
  }),
});
console.log('implement patch:', patch.status, await patch.json().then((d) => JSON.stringify(d)).catch(() => ''));
