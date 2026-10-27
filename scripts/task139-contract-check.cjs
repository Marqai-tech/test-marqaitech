/**
 * Task 139 — contract check. Run: node scripts/task139-contract-check.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
let pass = 0, fail = 0;
const failures = [];
const check = (label, fn) => {
  try {
    if (fn()) { pass++; console.log(`  PASS  ${label}`); }
    else { fail++; failures.push(label); console.log(`  FAIL  ${label}`); }
  } catch (e) { fail++; failures.push(`${label} (threw ${e.message})`); console.log(`  FAIL  ${label} — ${e.message}`); }
};
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const has = (p, n) => read(p).includes(n);

console.log('── My Profile parity (web) ──');
check('GET /api/users/profile returns originalBirthday', () => has('src/app/api/users/profile/route.ts', "originalBirthday: toISOStr(rowVal(employee, 'originalBirthday'"));
check('GET returns interests + collections', () => has('src/app/api/users/profile/route.ts', 'interests: rowVal(employee') && has('src/app/api/users/profile/route.ts', 'FROM "Experience" WHERE "employeeId" = $1 ORDER BY') && has('src/app/api/users/profile/route.ts', 'FROM "EmployeeSkill"') && has('src/app/api/users/profile/route.ts', 'FROM "EmployeeAchievement"'));
check('PATCH accepts skills + dependents', () => has('src/app/api/users/profile/route.ts', 'experiences, achievements, skills, dependents, originalBirthday,'));
check('My Profile: interests editor', () => has('src/app/(dashboard)/my-profile/page.tsx', 'Interests (comma-separated'));
check('My Profile: technical skills editor', () => has('src/app/(dashboard)/my-profile/page.tsx', 'Technical Skills'));
check('My Profile: structured experience + letters + domains', () => has('src/app/(dashboard)/my-profile/page.tsx', 'Domains worked in') && has('src/app/(dashboard)/my-profile/page.tsx', 'Letters from this company'));
check('My Profile: achievements editor', () => has('src/app/(dashboard)/my-profile/page.tsx', 'Add Achievement'));
check('My Profile: family details editor', () => has('src/app/(dashboard)/my-profile/page.tsx', 'Family Details (Medical Insurance)'));
check('My Profile: original birthday view row', () => has('src/app/(dashboard)/my-profile/page.tsx', 'Original Birthday (birthday wishes)'));
check('My Profile: policies grid with View', () => has('src/app/(dashboard)/my-profile/page.tsx', 'Assigned Company Policies'));
check('My Profile: self-service tips', () => has('src/app/(dashboard)/my-profile/page.tsx', 'What you can change yourself'));
check('My Profile: avatar pending badge', () => has('src/app/(dashboard)/my-profile/page.tsx', 'pending HR/Admin approval'));

console.log('── Photo approval workflow ──');
check('Schema: avatarPending columns', () => has('prisma/schema.prisma', 'avatarPending    String?'));
check('Profile PATCH: pending for employees', () => has('src/app/api/users/profile/route.ts', 'avatarPendingSubmitted = true'));
check('auth/me PATCH: pending for employees (mobile path)', () => has('src/app/api/auth/me/route.ts', 'avatarPendingSubmitted'));
check('auth/me GET: avatarPendingAt exposed', () => has('src/app/api/auth/me/route.ts', 'avatarPendingAt:'));
check('Approvals API exists', () => fs.existsSync(path.join(ROOT, 'src/app/api/employees/avatar-approvals/route.ts')));
check('Approvals API: approve applies avatar', () => has('src/app/api/employees/avatar-approvals/route.ts', 'SET "avatar" = "avatarPending"'));
check('Notification events registered', () => has('src/lib/notification-events.ts', 'core_hr.profile.photo_submitted') && has('src/lib/notification-events.ts', 'core_hr.profile.photo_result'));
check('Update-requests page: Photo Approvals tab', () => has('src/app/(dashboard)/employees/update-requests/page.tsx', 'Photo Approvals'));
check('Mobile: pending badge + submit toast', () => has('hrms_app/lib/screens/profile/profile_screen.dart', 'Photo submitted — visible to others after HR/Admin approval'));

console.log('── Management role fix ──');
check('ROLE_LABEL has ceo', () => has('src/app/(dashboard)/employees/management/page.tsx', "ceo: 'CEO'"));
check('employees list select includes isManagement', () => has('src/app/api/employees/route.ts', 'isManagement: true,'));

console.log('── Update requests ──');
check('Locked fields removed from requestable list', () => !has('src/app/(dashboard)/employees/update-requests/page.tsx', "{ field: 'firstName', label: 'First Name'"));
check('originalBirthday requestable', () => has('src/app/(dashboard)/employees/update-requests/page.tsx', "field: 'originalBirthday'"));
check('FIELD_SENSITIVITY knows originalBirthday', () => has('src/lib/employee-update-request.ts', "originalBirthday:    { sensitivity: 'high'"));
check('Date coercion on apply', () => has('src/app/api/employees/update-requests/[id]/route.ts', "['originalBirthday', 'dateOfBirth'].includes(updateRequest.fieldName)"));
check('company_hr_admin is admin (GET + PATCH)', () => has('src/app/api/employees/update-requests/route.ts', "'company_hr_admin']") && read('src/app/api/employees/update-requests/[id]/route.ts').includes("'company_hr_admin']"));
check('Self-service picker locked to own profile', () => has('src/app/(dashboard)/employees/update-requests/page.tsx', 'Your own profile'));
check('Update-requests tips for employees', () => has('src/app/(dashboard)/employees/update-requests/page.tsx', 'Tips — what you can change yourself'));

console.log('── Documents & policies ──');
check('Shared document viewer util', () => fs.existsSync(path.join(ROOT, 'src/lib/document-viewer.ts')));
check('Policy View opens ORIGINAL document (view page)', () => has('src/app/(dashboard)/employees/[id]/page.tsx', 'openDocumentInNewTab(fileUrl, fileName'));
check('Policy View opens ORIGINAL document (form)', () => has('src/app/(dashboard)/employees/page.tsx', 'openDocumentInNewTab(fileUrl, fileName'));
check('Documents View: employee view page', () => has('src/app/(dashboard)/employees/[id]/page.tsx', '> View</button>'));
check('Documents View: add/edit form', () => has('src/app/(dashboard)/employees/page.tsx', '> View</button>'));
check('Documents View: my-profile', () => has('src/app/(dashboard)/my-profile/page.tsx', '> View\n'));
check('FiPin absent everywhere (build killer guard)', () => !read('src/components/employees/SocialFeedsSection.tsx').includes('FiPin'));

console.log('── Home raise actions ──');
check('Stat cards: Raise Leave', () => has('src/app/(dashboard)/dashboard/page.tsx', "raise: { label: 'Raise Leave', href: '/leave?action=apply' }"));
check('Stat cards: Raise Regularization', () => has('src/app/(dashboard)/dashboard/page.tsx', "href: '/attendance/regularize' }"));
check('Stat cards: Raise Ticket', () => has('src/app/(dashboard)/dashboard/page.tsx', "href: '/helpdesk?action=create' }"));
check('Helpdesk ?action=create deep-link', () => has('src/app/(dashboard)/helpdesk/page.tsx', "get('action') === 'create'"));

console.log('── Feeds attachments/comments ──');
check('Composer image/file wired (main page)', () => has('src/app/(dashboard)/social-feed/page.tsx', 'pickFeedFile'));
check('Emoji picker (main page)', () => has('src/app/(dashboard)/social-feed/page.tsx', 'FEED_EMOJIS'));
check('Attachments sent on create', () => has('src/app/(dashboard)/social-feed/page.tsx', 'attachments: (composerAttachments.length ? composerAttachments : modalAttachments)'));
check('Attachments rendered on cards', () => has('src/app/(dashboard)/social-feed/page.tsx', "a.type === 'image'"));
check('Dashboard section: comment input always visible', () => has('src/components/employees/SocialFeedsSection.tsx', 'comment input ALWAYS visible'));
check('Dashboard section: working attachment icons', () => has('src/components/employees/SocialFeedsSection.tsx', 'pickFeedAttachment'));

console.log('── Org stats API + mobile ──');
check('org-stats API exists', () => fs.existsSync(path.join(ROOT, 'src/app/api/employees/org-stats/route.ts')));
check('org-stats computes exits this month', () => has('src/app/api/employees/org-stats/route.ts', 'exitsThisMonth'));
check('Mobile: getOrgStats', () => has('hrms_app/lib/services/api_service.dart', 'getOrgStats'));
check('Mobile: org stats card on home', () => has('hrms_app/lib/screens/home/home_screen.dart', '_orgStatsCard()'));
check('Mobile: profile parity sections', () => has('hrms_app/lib/screens/profile/profile_screen.dart', '_paritySections()'));
check('Mobile: original birthday row', () => has('hrms_app/lib/screens/profile/profile_screen.dart', "add('Original Birthday'"));

console.log('── Version chain 1.6.5 (32) ──');
check('pubspec 1.6.5+32', () => has('hrms_app/pubspec.yaml', 'version: 1.6.5+32'));
check('app_info 1.6.5/32', () => has('hrms_app/lib/config/app_info.dart', "versionName = '1.6.5'") && has('hrms_app/lib/config/app_info.dart', 'versionCode = 32'));
check('constants 1.6.5', () => has('hrms_app/lib/config/constants.dart', "appVersion = '1.6.5'"));
check('app-version.ts 1.6.5/32', () => has('src/lib/app-version.ts', "versionName: '1.6.5'") && has('src/lib/app-version.ts', 'versionCode: 32'));
check('downloads page 1.6.5', () => has('public/downloads/index.html', 'v1.6.5 (32)'));
check('APK artifact present', () => fs.existsSync(path.join(ROOT, 'public/downloads/3boxes-hrms-mobile-v1.6.5.apk')));

console.log(`\n${pass} PASS / ${fail} FAIL`);
if (fail) { failures.forEach((f) => console.log('  - ' + f)); process.exit(1); }
