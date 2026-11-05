/**
 * Task 130 — governance: register + approve BEFORE push.
 * (Released payslip PDF downloads: attached MARQAI format with logo;
 * payroll-manager release gate on web + mobile + Vercel.)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;

function check(name, cond, reason) {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`FAIL  ${name} — ${reason}`); }
}

function read(p) {
  const full = path.join(ROOT, p);
  return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : null;
}

// ── 1. Biometric login (mobile) ──
const svc = read('hrms_app/lib/services/api_service.dart') || '';
check('mobile login sends rememberMe (30-day session for biometric)', svc.includes("'rememberMe': true"));
const signin = read('hrms_app/lib/screens/auth/signin_screen.dart') || '';
check('biometric setup dialog passes dialCode for phone identities', signin.includes('dialCode: isPhone ? _dialCode : null') && signin.includes('_setupBiometricDialog'));
check('session expiry no longer disables the biometric flag', !signin.includes('await BiometricService.setEnabled(false);') && signin.includes('fingerprint login keeps working'));

// ── 2. Mobile task attachments (visible + at creation) ──
const projDetail = read('hrms_app/lib/screens/projects/project_detail_screen.dart') || '';
check('create sheet: ATTACHMENTS section at creation', projDetail.includes("'Screenshots, PDFs, docs (≤3 MB) — uploaded when the task is created.'"));
check('create sheet: uploads picked files after task create', projDetail.includes('uploaded when the task is created') && projDetail.includes('_pendingFiles') && projDetail.includes('createTaskAttachment('));
check('provider.createTask returns the created task id', (read('hrms_app/lib/providers/project_provider.dart') || '').includes("Future<String?> createTask") && (read('hrms_app/lib/providers/project_provider.dart') || '').includes("data['task'] ?? data['data'] ?? data"));
check('update sheet keeps the full attachments editor', projDetail.includes("'No attachments yet — attach screenshots, PDFs, docs (≤3 MB).'"));

// ── 3. Web create-task form unified (shared component on all 3 pages) ──
const modal = read('src/components/tasks/CreateTaskModal.tsx') || '';
check('shared CreateTaskModal exists with full field set', modal.includes('Task Title') && modal.includes('Task Type') && modal.includes('Workflow Step') && modal.includes('Priority') && modal.includes('Assignee') && modal.includes('Start Date') && modal.includes('End Date') && modal.includes('Hrs') && modal.includes('Description') && modal.includes('Attachments'));
check('shared modal: re-testing rule + assignee requirement', modal.includes("workflowStep !== 're_testing' && !assignedToId"));
check('shared modal: uploads attachments after create', modal.includes('readFileDataUrl') && modal.includes('/attachments'));
check('PM dashboard uses the shared modal', (read('src/app/(dashboard)/project-management/page.tsx') || '').includes('<CreateTaskModal'));
check('Tasks page uses the shared modal', (read('src/app/(dashboard)/project-management/tasks/page.tsx') || '').includes('<CreateTaskModal'));
check('delivery board uses the shared modal (fixed project)', (read('src/app/(dashboard)/projects/[id]/page.tsx') || '').includes('fixedProjectId={project.id}'));
check('board inline form removed (taskForm retired)', !(read('src/app/(dashboard)/projects/[id]/page.tsx') || '').includes("taskForm, setTaskForm"));

// ── 4. CEO role — full data visibility ──
const roleAccess = read('src/lib/roleAccess.ts') || '';
check("getDataScope: 'ceo' → 'all' scope", /'super_admin', 'tenant_admin', 'ceo', 'admin',\s*\n\s*'company_hr_admin'/.test(roleAccess));
check('canEditEmployeeRecords includes ceo', roleAccess.includes("['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_admin'"));
const perm = read('src/lib/permissions.ts') || '';
check('permissions can(): ceo = tenant_admin matrix', perm.includes("role === 'tenant_admin' || role === 'ceo'"));
check('reports API uses getDataScope (ceo covered centrally)', (read('src/app/api/reports/route.ts') || '').includes("getDataScope(userRole)"));
const mobileReports = read('hrms_app/lib/screens/reports/reports_screen.dart') || '';
check('mobile reports gate includes ceo', mobileReports.includes("'ceo'"));

// ── 5. Task 130 still intact (release gate + PDF) ──
const schema = read('prisma/schema.prisma') || '';
check('T130 schema: Payroll.releasedAt intact', /releasedAt\s+DateTime\?/.test(schema));
check('T130 pdf route intact', !!read('src/app/api/payroll/payslips/[id]/pdf/route.ts'));
check('T130 release route intact', !!read('src/app/api/payroll/payslips/release/route.ts'));
check('T130 shared PDF builder intact', (read('src/lib/payslip-pdf.ts') || '').includes('Salary Payslip - ${input.monthName} ${input.year}'));
check('T130 web release UI intact', (read('src/app/(dashboard)/payroll/payslips/page.tsx') || '').includes('Release Payslips'));

console.log(`\n${pass}/${pass + fail} checks pass`);
if (fail > 0) process.exit(1);
