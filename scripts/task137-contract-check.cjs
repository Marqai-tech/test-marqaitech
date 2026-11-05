/**
 * Task 137 — contract check. Needle checks on every changed surface:
 *   1. Self-service lock (DOB / first / last name) server-side
 *   2. HR/Admin bell+email on direct (low-risk) self-edits
 *   3. New notification event core_hr.profile.self_updated
 *   4. Remember-me idle-lock exemption + durable flag
 *   5. Red asterisks + Mandatory/Optional chips in the employee form
 *   6. Dynamic experience rows + auto logo + category/level
 *   7. Interests + Technical Skills sections
 *   8. Insurance rename + family details editor
 *   9. Policies grid (view/download) in add/edit AND view
 *  10. EXP column in list + grid + server-side experienceYears
 *  11. Row-collection writers wired into POST + PUT
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const failures = [];

function check(label, file, needles) {
  const p = path.join(ROOT, file);
  let content;
  try { content = fs.readFileSync(p, 'utf8'); } catch (e) {
    fail++; failures.push(`${label}: FILE MISSING ${file}`); return;
  }
  for (const needle of needles) {
    if (content.includes(needle)) { pass++; }
    else { fail++; failures.push(`${label}: missing in ${file} → ${needle.slice(0, 90)}`); }
  }
}

check('1. self-service lock', 'src/lib/employee-update-request.ts', [
  "SELF_SERVICE_LOCKED_FIELDS = new Set(['firstName', 'lastName', 'dateOfBirth'])",
  'is locked for self-service — contact HR/Admin',
  "eventKey: 'core_hr.profile.self_updated'",
  'recipients: admins.map',
]);

check('2. profile PATCH lock', 'src/app/api/users/profile/route.ts', [
  'SELF_SERVICE_LOCKED_FIELDS',
  "skippedFields.push('Date of Birth (locked — contact HR/Admin)')",
  'companyLogo","companyCategory","companyLevel',
]);

check('3. notification event', 'src/lib/notification-events.ts', [
  "eventKey: 'core_hr.profile.self_updated'",
  "'{{Employee_Name}} updated their {{Field_Name}}'",
]);

check('4. remember-me', 'src/hooks/useSessionTimeout.ts', [
  "if (isRememberMe()) return; // Remember-me sessions are exempt from the idle lock",
  "import { isRememberMe } from '@/lib/token-storage';",
]);
check('4b. remember-me storage', 'src/lib/token-storage.ts', [
  "if (window.sessionStorage.getItem(REMEMBER_KEY) === '1') return true;",
  'rawGet(REMEMBER_KEY) === \'1\'',
]);

check('5. form asterisks+badges', 'src/app/(dashboard)/employees/page.tsx', [
  'SECTION_REQUIRED_FIELDS',
  'Mandatory section',
  'Optional section',
  '> Required field',
  "(SECTION_REQUIRED_FIELDS[t.key] || []).length > 0",
]);

check('6. dynamic experience', 'src/app/(dashboard)/employees/page.tsx', [
  'Add Experience',
  'fetchCompanyLogoFromWeb',
  'logo.clearbit.com',
  'google.com/s2/favicons',
  'COMPANY_CATEGORIES',
  'COMPANY_LEVELS',
  'Currently working here',
  'autoFetchExperienceLogo',
]);

check('7. interests + skills', 'src/app/(dashboard)/employees/page.tsx', [
  "placeholder=\"e.g., Gardening, Music, Chess, Photography (comma-separated)\"",
  'Technical Skills',
  'Add Skill',
  'emptySkill()',
]);
check('7b. schema interests', 'prisma/schema.prisma', ['interests             String?', 'companyLogo    String?', 'companyCategory String?', 'companyLevel    String?']);
check('7c. profile columns', 'src/lib/employee-profile-columns.ts', ["'interests',"]);

check('8. insurance+family', 'src/app/(dashboard)/employees/page.tsx', [
  '>Insurance</h4>',
  'Family Details (Medical Insurance)',
  'Add Family Member',
  'emptyDependent()',
]);

check('9. policies grid (form)', 'src/app/(dashboard)/employees/page.tsx', [
  'Assigned Company Policies',
  "fetch('/api/policies?status=active&includeFile=1&limit=100'",
]);

check('10. EXP column', 'src/app/(dashboard)/employees/page.tsx', [
  'formatExperienceYears(emp.experienceYears)',
  'title="Total experience"',
]);
check('10b. EXP server', 'src/app/api/employees/route.ts', [
  'computeExperienceYearsFromRows',
  'experiences: { select: { startDate: true, endDate: true, isCurrent: true } }',
  'replaceEmployeeExperience, replaceEmployeeSkills, replaceEmployeeDependents',
  "['interests', body.interests],",
]);
check('10c. experience lib', 'src/lib/employee-experience.ts', [
  'export function computeExperienceYearsFromRows',
]);
check('10d. row collections', 'src/lib/employee-row-collections.ts', [
  'export async function replaceEmployeeExperience',
  'export async function replaceEmployeeSkills',
  'export async function replaceEmployeeDependents',
  'INSERT INTO "EmployeeSkill"',
  'INSERT INTO "Dependent"',
  'INSERT INTO "Experience"',
]);
check('10e. PUT collections', 'src/app/api/employees/[id]/route.ts', [
  'replaceEmployeeExperience(db as unknown as Record<string, any>, actualId, body.experiences)',
  'replaceEmployeeSkills(db as unknown as Record<string, any>, actualId, body.skills)',
  'replaceEmployeeDependents(db as unknown as Record<string, any>, actualId, body.dependents)',
]);

check('11. view page', 'src/app/(dashboard)/employees/[id]/page.tsx', [
  'title="Insurance"',
  'Family Details (Medical Insurance)',
  'Assigned Company Policies',
  'Technical Skills',
  'title="Interests"',
  'Mandatory sections: Personal, Address, Employment, Bank, Emergency, Health',
  'companyLogo',
  'companyCategory',
  'companyLevel',
]);

check('12. my-profile lock', 'src/app/(dashboard)/my-profile/page.tsx', [
  'Locked — contact HR/Admin to change',
  'value={editForm.firstName || \'}\''.replace("'}'", "''} disabled"),
  'value={editForm.dateOfBirth || \'\'} disabled',
]);

check('13. schema script', 'scripts/task137-schema.cjs', [
  'ALTER TABLE "Experience" ADD COLUMN IF NOT EXISTS "companyLogo"',
  'ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "interests"',
]);

console.log(`\n=== Task 137 contract check: ${pass} PASS / ${fail} FAIL ===`);
if (failures.length) {
  console.log('FAILURES:');
  failures.forEach((f) => console.log('  ✗ ' + f));
  process.exit(1);
}
process.exit(0);
