// Task 164 — governance: register + approve BEFORE push.
// (1) Company Policies & Handbook + Policy Acknowledgement section surfaced on
//     the Employee Dashboard (the old Employee Home was retired in Task 163 and
//     employees are redirected straight to /dashboard — the section became
//     unreachable). (2) Biometric ID mapping: Employee.biometricId runtime
//     column (defaults to the Employee ID), admin-editable from the employee
//     form; the punch sync resolves reader codes through the admin biometric
//     map FIRST (outranks the learned code map and the MARQxxx transform) so
//     Madhuri N (MARQ008, reader 007) can never be stolen into MARQ007
//     (Suresh V N, reader 002/2). (3) Suresh auto-present all-days exception.
//     (4) 30-day pending-reminder workflow verified live (HR + RM + employee
//     dispatches proven in the production DB on 26 Oct).
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
    title: 'Task 164 — Policies & Acknowledgement on the Employee Dashboard + employee Biometric ID mapping (Madhuri 007 / Suresh 2) + Suresh all-days-present exception',
    description:
      'User request: "The Company Policies & Handbook section and the Policy Acknowledgement workflow were previously implemented on the Employee Home screen. However, the Home screen is currently not accessible to employees. Could you please arrange to make these features accessible through the Employee Dashboard? Additionally, the Policy Acknowledgement – Pending Reminder notification/email workflow has been implemented. If an employee does not acknowledge an assigned policy within one month, HR and the Reporting Manager (RM) should receive a notification identifying the employee and the pending policy. Please ensure that both the policy acknowledgement section and the pending reminder workflow are accessible and functioning as expected for employees, HR, and the Reporting Manager." (plus the standing request from the previous batch: "Madhuri N - MARQ008 has to be mapped to punches as her id in the face reader is 007... create a biometric id in the employee profile and map the biometric id to the emp id... by default keep the biometric id as the emp id itself... same way for suresh - Suresh V N - MARQ007 - biometric id - 2, keep for suresh also all days present in the attendance module by default as an exception.") ' +
      'CHANGE 1 (dashboard): a "Company Policies & Handbook" panel now sits on the Employee Dashboard (/dashboard) — summary chip (N Pending Acknowledgements / All policies acknowledged), per-policy cards with version + effective date + PENDING/ACKNOWLEDGED state + acknowledged-on date, amber "Read & Acknowledge" CTA straight into the viewer (/policies-handbook/[id]) where the read-confirmation → Accept / Reject-with-reason workflow lives, plus a "View all policies & handbook" link. Data from the employee-scoped /api/policies/handbook?summary=1 (added to the dashboard fetch batch). CHANGE 2 (biometric ID): new runtime columns Employee.biometricId + autoPresentAllDays (EXTRA_PROFILE_KEYS + write DDL; ensured on the write path); the employee add/edit form gains a "Biometric ID" field (placeholder = employee ID, defaults to the Employee ID itself when empty — explained in helper text) and a "Present on all days by default" attendance-exception checkbox next to the Management flag; the View Details Employment tab shows both. The e-timeoffice sync now loads a tenant-scoped admin biometric map (raw SQL; padded/unpadded variants: 007↔7, 2↔002) and resolves EVERY punch — new inserts, rematch orphans, and name-fallback resolutions — through biometricId FIRST, then the learned code map, then the MARQxxx transform, then exact/fuzzy name. This kills the latent mis-attribution where hrmsEmployeeCode(\'007\') → MARQ007 would have credited Madhuri\'s future punches to Suresh. Production data applied + verified: MARQ008 Madhuri N biometricId=007, MARQ007 Suresh V N biometricId=2 + autoPresentAllDays=true, code map seeded {"002":"MARQ007","007":"MARQ008"} (immediate protection on the live deployment, before this push). Attribution audit of all October punches: 34×Empcode-007 rows correctly linked to Madhuri (name path), 68×Empcode-002 rows to Suresh; zero unmatched rows. CHANGE 3 (all-days-present): the Task 82 auto-present engine now force-includes employees with autoPresentAllDays=\'true\' (raw-SQL probe) in the management roster — real punches, approved leave, weekends and holidays still win. Suresh is backfilled via the engine post-deploy. CHANGE 4 (reminder workflow — verification, no code change needed): the Task 88 cron (vercel.json daily 03:00 UTC, 30-day threshold + 7-day follow-up, dedupe via NotificationDelivery) is proven LIVE in production — 26 Oct sweep dispatched core_hr.policy.ack_pending to HR (admin@marqaitech.com, hr@marqaitech.com) AND the CEO, plus RM alerts (Vardhani Reddy MARQ001 = RM of Suresh & Madhuri AND hr@ recipient) and ack_employee_reminder to logged-in employees, each identifying the employee and their pending policy; ack_confirmed events fired as employees acknowledged on 27 Oct. Live state: Leave Policy v1.0 (assigned 13 Aug, 75 days) 6/12 accepted → reminder-eligible; Attendance Policy effective 31 Dec (future) → not yet listed. ' +
      'Checks: tsc 1843 == 1843 origin/main baseline (0 new); eslint on the 6 touched files 22 errors/39 warnings == identical baseline (0 new); no APK/version-chain changes (pure web).',
    category: 'attendance',
    riskLevel: 'medium',
    module: 'Attendance',
    relatedModule: 'Core HR, Employee Dashboard, Policies',
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
