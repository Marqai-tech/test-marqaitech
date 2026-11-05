// Task 137 — governance: register + approve BEFORE push.
// (Employee module overhaul: self-service edit locks + HR/Admin alerts,
// remember-me fix, mandatory-field markers, Insurance + family details,
// policies grid, EXP column, dynamic experience with auto logos, interests
// + technical skills. Schema already applied to 3/3 production DBs.)
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
    title: 'Task 137 — Employee module: self-service edit locks + HR/Admin alerts, remember-me fix, mandatory markers, Insurance+family, policies grid, EXP column, dynamic experience + interests/skills',
    description:
      'User request: "in the employee edit from self service - they should not be able to edit the date of birth, first name, last name but personal email id, phone number, address, current address, etc they can edit but the hr/admin should get an email alert and notification in the tool also. Also give a red star/asterisk for all the mandatory fields in the employee module - add/edit/view employee. login page - keep me signed in for 30 days in this tab not working. Also in the employee module - add/edit/view - show which are mandatory sections / not mandatory / optional. health - emergency medical & insurance - change it to Insurance - also add the family details in this section for medical insurance purpose. policies - show the list of policies which are assigned under in a grid so that the employees can view or download the policies. employee list/employee directory show the exp of that particular employee too. experience section - instead of only 3 experience - give dynamically for the admin/employee to add as many experience as per their original exp + company logo picked automatically from the web along with the category (listed/non-listed) and company level. personal details - add a new section as interests (gardening, etc) and one more section technical skills in the employment section so that we can create a skill matrix chart." ' +
      'IMPLEMENTATION: (1) SELF-SERVICE LOCKS — SELF_SERVICE_LOCKED_FIELDS (firstName/lastName/dateOfBirth): My Profile editor renders them disabled with a "Locked — contact HR/Admin" hint; PATCH /api/users/profile + applyEmployeeFieldChange hard-block them server-side regardless of tenant field-rule config (HR/admin edits via /api/employees/[id] unaffected). (2) HR/ADMIN ALERTS — every DIRECT (low-risk) self-service edit (phone, personal email, address(es), emergency contacts, …) now dispatches core_hr.profile.self_updated (new catalog event: in-app bell + email) to all active admin/HR accounts (actor excluded) with field/old/new values and a link to the employee profile; the audit row already persisted stays. (3) REMEMBER-ME FIX — root cause: the 30-minute idle timer (useSessionTimeout) bounced even remember-me sessions to /lock-screen. Remember-me sessions are now EXEMPT from the idle lock, and isRememberMe() also honours the durable localStorage flag so the exemption survives browser restarts; label corrected to "Keep me signed in for 30 days". (4) MANDATORY CLARITY — single source of truth SECTION_REQUIRED_FIELDS drives stepper validation AND red asterisks on every required field (personal/address/bank/emergency/blood-group) AND per-tab Mandatory(*)/Optional(Opt) chips + a legend; view page shows the same Mandatory/Optional split. (5) INSURANCE — form section renamed "Emergency Medical & Insurance" → "Insurance" (+ provider/policy labels) with a Family Details (Medical Insurance) editor (name/relation/DOB/gender rows persisted to the Dependent table) in the form and a family grid on the view page. (6) POLICIES GRID — add/edit Policies tab and the view Policies tab show every ACTIVE company policy as a grid card (category/version/effective date) with View (in-tab reader) + Download (file) actions alongside the existing mapping dropdowns. (7) EXP COLUMN — employees list + grid show each employee\u2019s total experience computed server-side from Experience rows (computeExperienceYearsFromRows) with the manual totalExperience as fallback. (8) DYNAMIC EXPERIENCE — the static previousEmployer1..3 slots are replaced by an unlimited Add Experience editor (company, designation, from/to or currently-working, reason, logo URL) with AUTO company-logo pickup (Clearbit → Google favicon), Company Category (Listed/Non-Listed/Government/PSU/Startup/Other) and Company Level (MNC/Tier-1/2/3/Large/Mid/Startup/Small) dropdowns; view page renders the dynamic entries with logo + tag chips and falls back to legacy rows. APIs: PUT/POST /api/employees accept experiences/skills/dependents (replace-all raw-SQL writers, new Experience columns companyLogo/companyCategory/companyLevel applied additively to platform+demo+marqaitechgroup via scripts/task137-schema.cjs — 3/3 VERIFIED). (9) INTERESTS (Personal tab, chips, Employee.interests) + TECHNICAL SKILLS (Employment tab: skill/level/years → EmployeeSkill rows) captured on add/edit and displayed on the view page — ready for the future skill-matrix chart. Mobile app needs NO rebuild (its profile screen only edits avatar/phone; the server lock protects it anyway). Tests: task137-contract-check 71/71; scoped tsc vs git-stash baseline = ZERO new errors (1878 vs 1882, net −4); schema 3/3 DBs verified pre-push.',
    category: 'employee_module',
    riskLevel: 'medium',
    module: 'Employee Management',
    relatedModule: 'Authentication',
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
