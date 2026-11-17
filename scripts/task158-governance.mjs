// Task 158 — governance: register + approve BEFORE push.
// (1) AI assistant "Message and sessionId are required" — web chat clients
//     sent no sessionId; API hardened + clients fixed. (2) My Profile payroll
//     showed dollars — now renders in the employee's salaryCurrency (₹ INR).
// (3) Biometric punches "stopped" from 23 Oct — proven upstream (device→cloud
//     upload stopped 23 Oct 14:40 IST; HRMS in exact parity, 316/316 records
//     re-verified idempotent); sync engine gains rewind+reclassify resync,
//     auto-row override, transaction timeout, staleness display + admin
//     "Re-sync & recalculate" button. (4) Employee profile edit requests for
//     Experience/Achievements/Documents/Verification/Health now route through
//     the HR approval chain (section payloads on EmployeeUpdateRequest).
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
    title: 'Task 158 — AI assistant session fix + My Profile ₹ currency + biometric resync/recalc engine + employee section edit requests with HR approval',
    description:
      'User request: "Employee profile edit with HR approval — enable employees to submit edits to Experience, Achievements, Documents, Verification, and Health from their login; each submission routes to HR for approval... Payroll currency fix — My Profile payroll showing dollars ($); switch to INR (₹)... Biometric punch sync fix — investigate why face-reader/biometric punches stopped flowing into Biometric Punches view and Attendance Dashboard from 23rd Oct onwards, correct the calculation, re-sync with the time office data... when i ask anything to the ai assistant it is giving error - Message and sessionId are required... Deploy to Vercel production and verify on all three domains." ' +
      'FIX 1 (AI assistant, root-caused): FloatingAIAssistant FAB sent {message} WITHOUT sessionId and AIChatbot page sent neither sessionId nor a Bearer token — /api/ai-chat answers 400 "Message and sessionId are required" / 401. Clients fixed to send the Bearer token and reuse ONE conversation sessionId (server issues one on the first message and returns it; later messages send it back for AI context continuity). API hardened: message stays mandatory, a missing sessionId is auto-generated server-side and returned, malformed JSON body can no longer crash the route. FIX 2 (payroll currency): the My Profile Payroll tab (shared EmployeeDetailPage) hard-coded "$" on Gross/Deductions/Net; a currencySymbol() helper now renders the employee salaryCurrency (system default INR → ₹, USD/EUR/GBP/AED supported), and the Salary stat card shows the symbol instead of the raw code. FIX 3 (biometric, investigation + engine): production probes prove the e-timeoffice cloud has NO punches after Fri 23 Oct 2026 14:40 IST (per-employee + ALL + alternate-endpoint + other-month-table probes all empty; global latest = TextFileData102026 ID 1241) while the 5-minute cron sync is healthy (state success, checkpoint 1241 = upstream max) — the face-reader terminal stopped uploading to the cloud (on-site network/device issue, must be fixed at the device; 24-25 Oct weekend, 26-27 Oct working days have zero upstream punches). Data re-sync executed in production: checkpoint rewound to 102026$1, all 316 October records re-downloaded → 0 imported / 316 duplicates skipped = HRMS ↔ time-office EXACT parity, idempotent. Engine upgrades shipped: (a) sync accepts {rewindToRecord, reclassifyFrom/To} — re-classifies attendance for ALL biometric-punch days in a window (recomputes check-in/out, work hours, late/half-day from stored punches); (b) auto-present placeholder rows (punchMethod=auto) no longer block real punches from taking over a day; (c) transaction timeout raised to 180s for large backfills; (d) sync status now reports lastPunchAt/lastPunchAgeDays and the admin Biometric page shows "Newest punch received ... days ago" with an offline-device warning + a "Re-sync & recalculate" button (rewinds to month start, re-downloads idempotently, recalculates 31 days). FIX 4 (section edit requests): employees submit whole-section edits from My Profile — Experience, Achievements, Documents, Verification, Health — via a new ProfileSectionEditRequest modal on the shared EmployeeDetailPage (self view shows a "Request Edit" banner + pending-approval chip per tab and a "My Profile Edit Requests" panel on Overview). Section payloads ride the EXISTING EmployeeUpdateRequest machinery (fieldName = section key, newValue = sanitized JSON; whitelist validation + 30-entry cap; documents are non-destructive metadata edits, verification merges into the kycVerification block as employee-submitted/pending, health only whitelisted yes/no+text fields) and ALWAYS route through the tenant approval tiers (never direct-apply). The approve route applies them via applyProfileSectionChange (replace experience/achievement rows, update/create document metadata, merge verification, update health fields) and notifies the employee. The Update Requests approval cards render human-readable current-vs-requested section payloads instead of raw JSON. ' +
      'Checks: tsc 1844 == 1844 stash baseline (0 new); eslint 23 errors/21 warnings == identical baseline (0 new) across all 11 touched files; local next build OOMs on the 3.9GB sandbox (known limit) — Vercel build is the gate. Production data ops already executed + verified (resync runner output above). No APK/version-chain changes (pure web).',
    category: 'employee_experience',
    riskLevel: 'medium',
    module: 'Core HR',
    relatedModule: 'Attendance, AI Assistant, My Profile',
  }),
});
const d = await cr.json();
const id = d?.request?.id ?? d?.id ?? d?.data?.id;
console.log('change-request created:', id || d);

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
