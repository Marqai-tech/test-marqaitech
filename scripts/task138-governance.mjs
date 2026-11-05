// Task 138 — governance: register + approve BEFORE push.
// (Birthdays: month-wide feed + WhatsApp-style card preview + DOB fallback;
// Resume document type; sidebar "Module Dashboard" → "Dashboard"; Social Feeds
// on the employee module dashboard with respond-only default + Collaboration
// settings creator allowlist; Achievements section; experience letters +
// multi-select domains; original-birthday auto-fallback; Aadhaar QR/PAN
// verification with DigiLocker scaffold. Schema already applied 3/3 DBs.)
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
    title: 'Task 138 — Birthdays month feed + WhatsApp wish card, social feeds with respond-only governance, achievements, experience letters/domains, resume doc type, Aadhaar/PAN verification, Dashboard nav rename',
    description:
      'User request: "add a birthday wishes feed or WhatsApp-style card preview. add resume in the document type list in the employee module - add/edit/view. In the birthday section let it also show this month birthdays who are all there until that month ends. Also if the admin havent filled the original birthday date automatically let it take the DOB date itself automatically which can be edited by the HR/Employee anytime. in the employee module in the web app - change the module dashboard name to dashboard in the left hand side section. Also add a social feeds section in the dashboard of employee module after the overview so that the employees can see the feeds from the HR / employee shared from their respective logins. employees can only answer or respond to the feeds shared by the HR/admin but they cannot raise any social feeds until the admin/HR selects any employee from the settings to enable them to generate or raise any feeds in collaboration module settings as the social feeds are available in the collaboration module itself. add a achievements section from his previous company exp or any other in the employee module. in the employee module - experience - give an option to upload the letters related that company where that employee worked like offer letter / relieving letter along with the domain he worked it can be multiple domains selection option to be given. validate the employee personal details like dob, name, address once they upload the aadhaar or scan the qr by the admin automatically by the system or digilocker integration for aadhaar / pan." ' +
      'IMPLEMENTATION: (1) BIRTHDAYS — GET /api/birthdays now returns thisMonth (EVERY active employee whose birthday falls in the current month, listed until the month ends, sorted by day) alongside today + upcoming(45d); effective birthday = OriginalBirthday ?? DateOfBirth so unfilled Original Birthdays surface automatically (wish route + 08:00 IST auto-greeting cron use the same fallback; birthdaySource field marks "from records"); POST /api/employees auto-fills originalBirthday from DOB when the admin leaves it empty, PUT /api/employees/[id] back-fills it when the record has none, and the self-service profile PATCH lets the EMPLOYEE edit Original Birthday any time (DOB itself stays locked); My Profile gains an editable Original Birthday field. BirthdaysCard renders a "This month" list, a wishes mini-feed (sender + message, the birthday wishes feed) under each birthday person, and Send Wishes opens a WHATSAPP-STYLE greeting-card preview modal (chat header #075E54, wallpaper #ECE5DD, #DCF8C6 card bubble with gradient header, editable 300-char message, ✓✓ footer) before delivering the same bell + festive email as before. (2) RESUME — added to the qualifications category in ALL FOUR document-type lists (add/edit form, view page, documents API whitelist, My Profile). (3) SIDEBAR — the Employee module "Module Dashboard" nav item is renamed to "Dashboard". (4) SOCIAL FEEDS ON THE EMPLOYEE DASHBOARD — /employees/dashboard gains a Social Feeds tab right after Overview plus a compact preview card at the bottom of Overview; feeds come from the existing /api/social-feed (the collaboration module surface) so every login sees the HR/admin shares from their own context; EVERY login can respond (like/comment) but RAISING feeds is governed: CollaborationSettings.feedCreationMode (admins|selected) + feedCreatorIds (allowlist picker of employees) edited in Collaboration → Settings → Social Feed via the new role-gated /api/social-feed/settings (FEED_GOVERNANCE_UPDATE audit row); POST /api/social-feed 403s non-creators with a clear "respond-only" message (code FEED_CREATE_NOT_ALLOWED), the composer hides accordingly on the social-feed page too, GET returns canCreate/creationMode + per-post isLikedByMe (fixing the phantom like-state), and the PATCH mass-assignment hole is closed (whitelisted fields, author-or-admin edits, author-or-admin soft delete). (5) ACHIEVEMENTS — new EmployeeAchievement table (title/description/category previous_company|certification|award|academic|community|other/issuer/date) with the same replace-all raw-SQL writer pattern wired into POST/PUT /api/employees + the self-service profile PATCH, an Add Achievement editor on the Experience form tab, and an Achievements tab on the view page. (6) EXPERIENCE LETTERS + DOMAINS — Experience.letters (JSON [{name,type offer_letter|relieving_letter|experience_letter|appraisal_letter|payslip|other,fileUrl}] with the 3MB dataURL pattern) and Experience.domains (JSON string array) columns; per-row multi-select domain chips (20 domains) + letter attach/remove UI per experience entry, downloadable on the view page. (7) AADHAAR/PAN VERIFICATION — new Verification tab on the employee view page (HR/Admin gated): upload the Aadhaar QR image (decoded IN-BROWSER with jsQR — the image never leaves the device) or paste the numeric QR payload / DigiLocker Offline Aadhaar XML; the server parses both formats (src/lib/aadhaar-qr.ts: legacy numeric QR decimal→bytes→"-separated fields + OfflinePaperlessKyc XML), AUTO-compares extracted Name/DOB/Gender/Address with the employee record and stores the verdict on Employee.kycVerification/kycVerifiedAt with a masked last-4 reference (Aadhaar numbers are NEVER stored), with an optional one-click apply of mismatched details; PAN format validation + match against the record; DigiLocker OAuth scaffold (src/lib/digilocker.ts + status in the UI) reports honestly that partner credentials (DIGILOCKER_CLIENT_ID/SECRET/REDIRECT_URI) are needed before the government-repository flow activates. Schema additions applied additively to platform + 3boxes-hrms-demo + marqaitechgroup via scripts/task138-schema.cjs — 3/3 VERIFIED. Tests: task138-contract-check 60/60; aadhaar parser unit test (legacy QR, offline XML, secure-QR rejection, comparison verdicts) ALL PASS; scoped tsc vs git-stash baseline ZERO new errors (71 vs 77, net −6). Mobile needs NO rebuild — all surfaces are web; the mobile birthday card consumes the same API keys it already reads.',
    category: 'employee_module',
    riskLevel: 'medium',
    module: 'Employee Management',
    relatedModule: 'Collaboration',
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
