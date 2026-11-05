/**
 * Task 128 — source-contract checks (run with plain node, no Flutter needed).
 * Verifies every requested behavior exists in the source before push:
 *   1.  Schema: ProjectTask.taskType + workflowStep columns
 *   2.  API POST /api/projects/[id]/tasks accepts + validates the new fields
 *   3.  API PATCH: re_testing → back to assignee; other steps require assignee
 *   4.  API PATCH: step-change alerts (assignee + PM + admins, bell + email)
 *   5.  task-workflow lib constants (4 steps, 4 types)
 *   6.  PM dashboard: project cards clickable → /projects/[id]; REAL unified
 *       Create-Task modal (POSTs, no fake success toast)
 *   7.  Tasks page: story points replaced by workflow steps + task type
 *   8.  Board tab: same unification
 *   9.  Mobile: model parses new fields; create sheet + update sheet send them;
 *       re-testing keeps the assignee
 *   10. Mobile: bells dynamic → /notifications
 *   11. Employee status: displayStatus + API sync + data fix
 *   12. Version chain 1.5.9 (26) across all 6 files
 */
import { readFileSync } from 'node:fs';

const ROOT = '/home/z/my-project';
const read = (p) => readFileSync(`${ROOT}/${p}`, 'utf8');
let pass = 0, fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name}`); }
};

console.log('— 1. Schema —');
const schema = read('prisma/schema.prisma');
ok('ProjectTask.taskType column', /taskType\s+String\?/.test(schema));
ok('ProjectTask.workflowStep column', /workflowStep\s+String\?/.test(schema));

console.log('— 2. POST /api/projects/[id]/tasks —');
const post = read('src/app/api/projects/[id]/tasks/route.ts');
ok('destructures taskType + workflowStep', post.includes('taskType, workflowStep,'));
ok('validates taskType', post.includes('isTaskType(taskType)'));
ok('validates workflowStep', post.includes('isWorkflowStep(workflowStep)'));
ok('persists taskType', /taskType: taskType && isTaskType\(taskType\) \? taskType : null/.test(post));
ok('persists workflowStep', /workflowStep: workflowStep && isWorkflowStep\(workflowStep\) \? workflowStep : null/.test(post));

console.log('— 3/4. PATCH /api/projects/[id]/tasks/[taskId] —');
const patch = read('src/app/api/projects/[id]/tasks/[taskId]/route.ts');
ok('imports isReTesting', patch.includes('isReTesting'));
ok('imports notifyTaskStepChange', patch.includes('notifyTaskStepChange'));
ok('re_testing keeps the assignee itself', /isReTesting\(newStep\)[\s\S]{0,400}data\.assignedToId = task\.assignedToId/.test(patch));
ok('other steps require an assignee (400)', patch.includes('the assignee is asked again on every step change except re-testing'));
ok('step change fans out notifyTaskStepChange', /if \(stepChanged\)[\s\S]{0,400}notifyTaskStepChange\(/.test(patch));
ok('alerts include the project manager', patch.includes('projectManagerId'));

console.log('— 5. task-workflow lib —');
const lib = read('src/lib/task-workflow.ts');
for (const s of ['testing', 're_testing', 'production', 'delivery']) ok(`step ${s}`, lib.includes(`'${s}'`));
for (const t of ['customisation', 'rework', 'development', 'bug']) ok(`type ${t}`, lib.includes(`'${t}'`));
ok('sends in-app notifications', lib.includes('createNotification'));
ok('sends tenant emails', lib.includes('sendTenantEmail'));
ok("resolves admins from the tenant DB", lib.includes("role: { in: ['tenant_admin', 'admin', 'hr_admin'] }"));

console.log('— 6. PM dashboard —');
const dash = read('src/app/(dashboard)/project-management/page.tsx');
ok('project cards navigate to the workspace', dash.includes('router.push(`/projects/${p.id}`)'));
ok('list rows navigate too', /<tr key=\{p\.id\}[^>]*cursor-pointer/.test(dash));
ok('create-task modal POSTs the task API', dash.includes('submitCreateTask') && dash.includes('/tasks`, {\n        method: \'POST\''));
ok('create form sends taskType + workflowStep', dash.includes("taskType: taskForm.taskType || undefined,") && dash.includes("workflowStep: taskForm.workflowStep || undefined,"));
ok('no fake create-task toast', !dash.includes("toast.success('Task created successfully!')"));
ok('quick actions route to real pages', dash.includes("router.push('/projects')") && dash.includes("router.push('/project-management/sprints')"));
ok('kanban cards show task type + step', dash.includes('taskTypeLabel(t.taskType)') && dash.includes('workflowStepLabel(t.workflowStep)'));

console.log('— 7. Tasks page —');
const tasksPage = read('src/app/(dashboard)/project-management/tasks/page.tsx');
ok('no story-points badge', !tasksPage.includes('} pts</span>'));
ok('no story-points edit input', !tasksPage.includes('placeholder="Story points"'));
ok('task type select in create row', tasksPage.includes('TASK_TYPES.map((t) => <option'));
ok('workflow step select in create row', tasksPage.includes('WORKFLOW_STEPS.map((s) => <option'));
ok('edit modal enforces the re-testing rule', tasksPage.includes("editing.workflowStep !== 're_testing' && !editing.assignedToId"));
ok('re_testing PATCH omits explicit assignee', tasksPage.includes("editing.workflowStep === 're_testing'"));
ok('cards show type + step badges', tasksPage.includes('typeLabel(t.taskType)') && tasksPage.includes('stepLabel(t.workflowStep)'));

console.log('— 8. Board tab —');
const board = read('src/app/(dashboard)/projects/[id]/page.tsx');
ok('create form sends taskType + workflowStep', board.includes('taskType: taskForm.taskType || undefined') && board.includes('workflowStep: taskForm.workflowStep || undefined'));
ok('no story-points input on the board', !board.includes('placeholder="Story points"'));
ok('board badges show type + step', board.includes('taskTypeLabel(t.taskType)') && board.includes('workflowStepLabel(t.workflowStep)'));
ok('edit modal has the step-change hint', board.includes('Re-testing: this task goes back to the assignee itself'));

console.log('— 9. Mobile project model + sheets —');
const model = read('hrms_app/lib/models/project.dart');
ok('parses taskType', model.includes("taskType: j['taskType']?.toString(),"));
ok('parses workflowStep', model.includes("workflowStep: j['workflowStep']?.toString(),"));
ok('step/type label getters', model.includes('taskTypeLabel') && model.includes('workflowStepLabel'));
const detail = read('hrms_app/lib/screens/projects/project_detail_screen.dart');
ok('_TaskUpdateSheet exists', detail.includes('class _TaskUpdateSheet'));
ok('create sheet sends taskType', detail.includes("'taskType': _taskType,"));
ok('create sheet sends workflowStep', detail.includes("'workflowStep': _workflowStep,"));
ok('create sheet requires assignee except re-testing', detail.includes("_workflowStep != 're_testing' && _assigneeId == null"));
ok('update sheet omits assignee for re-testing', /if \(_step == 're_testing'\) \{\s*\/\/ re-testing/.test(detail));
ok('update sheet sends assignee for other steps', detail.includes("body['assignedToId'] = _assigneeId;"));
ok('task cards show type + step chips', detail.includes('t.taskTypeLabel!') && detail.includes('t.workflowStepLabel!'));
const provider = read('hrms_app/lib/providers/project_provider.dart');
ok('provider.updateTask added', provider.includes('Future<void> updateTask(String taskId, Map<String, dynamic> body)'));

console.log('— 10. Mobile bells —');
const home = read('hrms_app/lib/screens/home/home_screen.dart');
ok('home bell navigates to /notifications', home.includes("onTap: () => Navigator.pushNamed(context, '/notifications')"));
const theme = read('hrms_app/lib/config/maan_theme.dart');
ok('header bell navigates to /notifications', theme.includes("onPressed: () => Navigator.pushNamed(context, '/notifications')"));
ok('no "coming up in the next app release" placeholder', !theme.includes('coming up in the next app release'));

console.log('— 11. Employee terminated status —');
const empModel = read('hrms_app/lib/models/employee.dart');
ok('displayStatus getter', empModel.includes('String get displayStatus'));
ok('terminated wins over employeeStatus', empModel.includes("if (s == 'terminated') return 'Terminated';"));
const empDetail = read('hrms_app/lib/screens/employees/employee_detail_screen.dart');
ok('detail uses displayStatus', empDetail.includes('employee.displayStatus'));
ok('terminated shown in red', empDetail.includes('employee.isTerminated || employee.isResigned'));
const empMgr = read('hrms_app/lib/screens/employees/employee_management_screen.dart');
ok('management card shows the status label', empMgr.includes('statusLabel: e.displayStatus'));
const empApi = read('src/app/api/employees/[id]/route.ts');
ok('DELETE syncs employeeStatus', /data: \{ status: 'terminated', employeeStatus: 'terminated' \}/.test(empApi));
ok('PUT syncs employeeStatus on termination', empApi.includes("['terminated', 'resigned'].includes(status)"));
ok('data-fix script exists', read('scripts/task128-fix-employee-status.cjs').includes("SET \"employeeStatus\" = \"status\""));

console.log('— 12. Version chain 1.5.9 (26) —');
ok('pubspec 1.5.9+26', read('hrms_app/pubspec.yaml').includes('version: 1.5.9+26'));
ok('app_info 1.5.9 / 26', read('hrms_app/lib/config/app_info.dart').includes("versionName = '1.5.9'") && read('hrms_app/lib/config/app_info.dart').includes('versionCode = 26'));
ok('constants 1.5.9', read('hrms_app/lib/config/constants.dart').includes("appVersion = '1.5.9'"));
const av = read('src/lib/app-version.ts');
ok('app-version.ts 1.5.9 / 26', av.includes("versionName: '1.5.9'") && av.includes('versionCode: 26') && av.includes('3boxes-hrms-mobile-v1.5.9.apk'));
ok('downloads page links v1.5.9', read('public/downloads/index.html').includes('3boxes-hrms-mobile-v1.5.9.apk'));
ok('task123 test contract 1.5.9', read('hrms_app/test/task123_payroll_integration_test.dart').includes("'1.5.9'"));
ok('downloads README 1.5.9', read('public/downloads/README.txt').includes('v1.5.9 (versionCode 26)'));

console.log(`\n${pass}/${pass + fail} contract checks pass`);
if (fail > 0) process.exit(1);
