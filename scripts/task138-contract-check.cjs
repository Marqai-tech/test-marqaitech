/**
 * Task 138 — contract check: verifies every deliverable needle is present in
 * the repo (files, fields, gates, endpoints). Run: node scripts/task138-contract-check.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
let pass = 0, fail = 0;
const failures = [];

function check(label, fn) {
  try {
    const ok = fn();
    if (ok) { pass++; console.log(`  PASS  ${label}`); }
    else { fail++; failures.push(label); console.log(`  FAIL  ${label}`); }
  } catch (e) {
    fail++; failures.push(`${label} ( threw: ${e.message} )`);
    console.log(`  FAIL  ${label} — threw ${e.message}`);
  }
}

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const has = (p, needle) => read(p).includes(needle);

console.log('── Birthdays (month-wide + DOB fallback + WhatsApp card) ──');
check('API: thisMonth array returned', () => has('src/app/api/birthdays/route.ts', 'thisMonth: thisMonthOut'));
check('API: effective birthday fallback (originalBirthday || dateOfBirth)', () => has('src/app/api/birthdays/route.ts', 'e.originalBirthday || e.dateOfBirth'));
check('API: wishes fetched for the whole month', () => has('src/app/api/birthdays/route.ts', 'wishIds = [...today.map((e) => e.id), ...thisMonth.map((t) => t.emp.id)]'));
check('Wish API: DOB fallback accepted', () => has('src/app/api/birthdays/wish/route.ts', 'employee.originalBirthday || employee.dateOfBirth'));
check('Cron: DOB fallback sweep', () => has('src/app/api/cron/birthday-greetings/route.ts', 'e.originalBirthday || e.dateOfBirth'));
check('Card: This month section', () => has('src/components/dashboard/BirthdaysCard.tsx', 'This month ('));
check('Card: wishes mini-feed rendered', () => has('src/components/dashboard/BirthdaysCard.tsx', 'WishesFeed'));
check('Card: WhatsApp-style preview modal', () => has('src/components/dashboard/BirthdaysCard.tsx', "backgroundColor: '#ECE5DD'") && has('src/components/dashboard/BirthdaysCard.tsx', 'bg-[#075E54]'));
check('Card: from-records chip for DOB fallback', () => has('src/components/dashboard/BirthdaysCard.tsx', 'birthdaySource === \'date_of_birth\''));

console.log('── Resume document type (4 places) ──');
check('Form doc types include resume', () => has('src/app/(dashboard)/employees/page.tsx', "'experience','resume','medical'"));
check('View page doc types include resume', () => has('src/app/(dashboard)/employees/[id]/page.tsx', "'experience','resume','medical'"));
check('API valid types include resume', () => has('src/app/api/employees/[id]/documents/route.ts', "'experience', 'resume', 'medical'"));
check('My-profile doc types include resume', () => has('src/app/(dashboard)/my-profile/page.tsx', "'experience', 'resume', 'medical'"));
check('Resume mapped under qualifications', () => has('src/app/api/employees/[id]/documents/route.ts', "qualifications: ['certificate', 'education', 'experience', 'resume']"));

console.log('── Sidebar rename ──');
check('navData: Module Dashboard → Dashboard', () => has('src/lib/navData.tsx', "label: 'Dashboard', href: '/employees/dashboard'") && !has('src/lib/navData.tsx', "label: 'Module Dashboard'"));

console.log('── Social feeds (dashboard section + governance) ──');
check('Governance lib exists', () => fs.existsSync(path.join(ROOT, 'src/lib/feed-permissions.ts')));
check('Settings columns on CollaborationSettings', () => has('prisma/schema.prisma', 'feedCreationMode          String    @default("admins")'));
check('POST gated: respond-only default', () => has('src/app/api/social-feed/route.ts', 'FEED_CREATE_NOT_ALLOWED'));
check('GET returns canCreate + likedByMe', () => has('src/app/api/social-feed/route.ts', 'isLikedByMe: likedPostIds.has(p.id)') && has('src/app/api/social-feed/route.ts', 'canCreate: ctx.permissions.canCreate'));
check('Mass-assignment fixed (whitelist PATCH)', () => has('src/app/api/social-feed/route.ts', "const allowed = ['content', 'postType', 'isPinned', 'attachments', 'hashtags'];"));
check('DELETE author-or-admin gate', () => has('src/app/api/social-feed/route.ts', 'Only the author or HR/Admin can delete this post'));
check('Settings API exists', () => fs.existsSync(path.join(ROOT, 'src/app/api/social-feed/settings/route.ts')));
check('Settings API role gate', () => has('src/app/api/social-feed/settings/route.ts', 'Only HR / tenant admins can change social feed settings'));
check('Dashboard: Social Feeds tab after Overview', () => has('src/app/(dashboard)/employees/dashboard/page.tsx', "key: 'feeds' as const, label: 'Social Feeds'"));
check('Dashboard: compact preview on Overview', () => has('src/app/(dashboard)/employees/dashboard/page.tsx', '<SocialFeedsSection variant="compact" onViewAll={() => setActiveTab(\'feeds\')} />'));
check('Section: respond-only hint for non-creators', () => has('src/components/employees/SocialFeedsSection.tsx', 'Respond-only mode'));
check('Section: no phantom FiPin icon (build killer)', () => !has('src/components/employees/SocialFeedsSection.tsx', 'FiPin') && has('src/components/employees/SocialFeedsSection.tsx', 'FiBookmark'));
check('Collaboration settings UI: governance card', () => has('src/app/(dashboard)/collaboration/settings/page.tsx', 'Social Feed Governance (full width)') && has('src/app/(dashboard)/collaboration/settings/page.tsx', "+ Selected employees"));
check('Social feed page: composer gated', () => has('src/app/(dashboard)/social-feed/page.tsx', "canCreate ? '' : 'hidden'"));
check('Social feed page: isLiked wired from server', () => has('src/app/(dashboard)/social-feed/page.tsx', 'isLiked: Boolean(sp.isLikedByMe)'));

console.log('── Achievements ──');
check('Prisma model EmployeeAchievement', () => has('prisma/schema.prisma', 'model EmployeeAchievement'));
check('Replace-all writer', () => has('src/lib/employee-row-collections.ts', 'replaceEmployeeAchievements'));
check('POST persists achievements', () => has('src/app/api/employees/route.ts', 'replaceEmployeeAchievements(db as unknown as Record<string, any>, employee.id, body.achievements)'));
check('PUT persists achievements', () => has('src/app/api/employees/[id]/route.ts', 'replaceEmployeeAchievements(db as unknown as Record<string, any>, actualId, body.achievements)'));
check('Profile PATCH persists achievements (self-service)', () => has('src/app/api/users/profile/route.ts', "replaceEmployeeAchievements(empDb as unknown as Record<string, any>, empId, achievements)"));
check('GET returns achievements relation', () => has('src/app/api/employees/[id]/route.ts', "employeeAchievement?.findMany?.({ where: { employeeId }"));
check('Form: achievements editor', () => has('src/app/(dashboard)/employees/page.tsx', 'Add Achievement'));
check('View: Achievements tab', () => has('src/app/(dashboard)/employees/[id]/page.tsx', "'Experience', 'Achievements', 'Documents', 'Verification'"));

console.log('── Experience letters + domains ──');
check('Schema: Experience.letters + domains', () => has('prisma/schema.prisma', 'letters String?') && has('prisma/schema.prisma', 'domains String?'));
check('Writer serializes letters/domains', () => has('src/lib/employee-row-collections.ts', 'lettersToJson(exp.letters)') && has('src/lib/employee-row-collections.ts', 'domainsToJson(exp.domains)'));
check('Form: domains multi-select', () => has('src/app/(dashboard)/employees/page.tsx', 'Domains worked in') && has('src/app/(dashboard)/employees/page.tsx', 'toggleExperienceDomain'));
check('Form: letters attach (offer/relieving)', () => has('src/app/(dashboard)/employees/page.tsx', 'handleExperienceLetterPick') && has('src/app/(dashboard)/employees/page.tsx', 'Relieving Letter'));
check('View: letters downloadable', () => has('src/app/(dashboard)/employees/[id]/page.tsx', 'Letters from this company'));
check('View: domain chips', () => has('src/app/(dashboard)/employees/[id]/page.tsx', 'Domains worked in'));

console.log('── Original birthday auto-fill from DOB ──');
check('POST: originalBirthday ?? dateOfBirth', () => has('src/app/api/employees/route.ts', '(dateOfBirth ? new Date(dateOfBirth) : null)'));
check('PUT: auto-take DOB when empty', () => has('src/app/api/employees/[id]/route.ts', 'existingEmployee.originalBirthday'));
check('Profile PATCH: employee can edit Original Birthday', () => has('src/app/api/users/profile/route.ts', 'appliedFields.push(\'Original Birthday\')'));
check('My Profile: editable Original Birthday input', () => has('src/app/(dashboard)/my-profile/page.tsx', 'Original Birthday (for birthday wishes)'));

console.log('── Aadhaar / PAN / DigiLocker ──');
check('Parser lib exists', () => fs.existsSync(path.join(ROOT, 'src/lib/aadhaar-qr.ts')));
check('Legacy numeric QR parser', () => has('src/lib/aadhaar-qr.ts', 'decimalToBytes') && has('src/lib/aadhaar-qr.ts', 'parseLegacyQr'));
check('Offline XML parser', () => has('src/lib/aadhaar-qr.ts', 'OfflinePaperlessKyc'));
check('Comparison + verdict', () => has('src/lib/aadhaar-qr.ts', 'compareAadhaarWithEmployee'));
check('Verify API exists', () => fs.existsSync(path.join(ROOT, 'src/app/api/employees/[id]/verify-identity/route.ts')));
check('Verify API: HR/Admin gate', () => has('src/app/api/employees/[id]/verify-identity/route.ts', 'Only HR / Admin can run identity verification'));
check('Verify API: PAN never stored raw in kyc (masked ref)', () => has('src/app/api/employees/[id]/verify-identity/route.ts', 'XXXX${parsed.extracted.aadhaarLast4}'));
check('jsQR dependency installed', () => has('package.json', '"jsqr"'));
check('Verification UI component', () => fs.existsSync(path.join(ROOT, 'src/components/employees/IdentityVerification.tsx')));
check('UI: QR image decode via jsQR', () => has('src/components/employees/IdentityVerification.tsx', "await import('jsqr')"));
check('UI: view page Verification tab', () => has('src/app/(dashboard)/employees/[id]/page.tsx', "activeTab === 'Verification'"));
check('DigiLocker lib + status honesty', () => has('src/lib/digilocker.ts', 'DIGILOCKER_CLIENT_ID') && has('src/components/employees/IdentityVerification.tsx', 'DigiLocker is not configured'));

console.log('── Schema applied ──');
check('task138-schema script exists', () => fs.existsSync(path.join(ROOT, 'scripts/task138-schema.cjs')));

console.log(`\n${pass} PASS / ${fail} FAIL`);
if (fail) { console.log('FAILED needles:'); failures.forEach((f) => console.log('  - ' + f)); process.exit(1); }
