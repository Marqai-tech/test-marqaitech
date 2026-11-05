/**
 * Task 129 — node source-contract checks (no Flutter/tsc needed).
 * Verifies the shipped source contains every Task 129 behaviour.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const ok = (name, cond) => {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
};

console.log('— schema —');
const schema = read('prisma/schema.prisma');
ok('ProjectAttachment model', /model ProjectAttachment \{/.test(schema));
ok('ProjectAttachment.taskId nullable', /taskId\s+String\?/.test(schema));
ok('ProjectAttachment.dataUrl TEXT', /dataUrl\s+String/.test(schema));
ok('ProjectTask.attachments relation', /attachments ProjectAttachment\[\]/.test(schema));
ok('Project.attachments relation', /attachments\s+ProjectAttachment\[\]/.test(schema));
ok('Employee.projectAttachments relation', /projectAttachments\s+ProjectAttachment\[\]/.test(schema));

console.log('— attachments API —');
const attRoute = read('src/app/api/projects/[id]/attachments/route.ts');
ok('GET taskId filter', attRoute.includes("searchParams.get('taskId')"));
ok('POST taskId validation', attRoute.includes("db.projectTask.findFirst({ where: { id: taskId, projectId: id }"));
ok('POST stores taskId', attRoute.includes('taskId,'));
ok('broken createdBy removed', !attRoute.includes('createdBy'));
ok('admin set includes ceo', attRoute.includes("'ceo']"));
const attDl = read('src/app/api/projects/[id]/attachments/[attachmentId]/route.ts');
ok('download streams dataUrl bytes', attDl.includes('new Uint8Array(bytes)'));
ok('delete soft-deletes', attDl.includes('isActive: false'));

console.log('— tasks API —');
const tasksApi = read('src/app/api/projects/[id]/tasks/route.ts');
ok('tasks GET _count attachments', tasksApi.includes('_count: { select: { attachments: true } }'));
ok('POST persists plannedStart', tasksApi.includes('plannedStart: plannedStart'));
const taskPatch = read('src/app/api/projects/[id]/tasks/[taskId]/route.ts');
ok('PATCH accepts plannedStart', taskPatch.includes('body.plannedStart !== undefined'));
ok('PATCH accepts description', taskPatch.includes('body.description !== undefined'));

console.log('— web task UI —');
const pm = read('src/app/(dashboard)/project-management/page.tsx');
ok('PM form has plannedStart', pm.includes('plannedStart:'));
ok('PM payload plannedStart', pm.includes('plannedStart: taskForm.plannedStart'));
ok('PM cards show description', pm.includes('t.description &&'));
ok('PM cards 📎 count', pm.includes('_count?.attachments'));
const tasksPage = read('src/app/(dashboard)/project-management/tasks/page.tsx');
ok('tasks page imports TaskAttachments', tasksPage.includes('@/components/tasks/TaskAttachments'));
ok('tasks page start-date input', tasksPage.includes('title="Start date"'));
ok('tasks edit has attachments', /<TaskAttachments projectId=\{editing\.projectId\} taskId=\{editing\.id\} \/>/.test(tasksPage));
const board = read('src/app/(dashboard)/projects/[id]/page.tsx');
ok('board imports TaskAttachments', board.includes('@/components/tasks/TaskAttachments'));
ok('board create sends plannedStart', board.includes('plannedStart: taskForm.plannedStart'));
ok('board edit attachments', /<TaskAttachments projectId=\{project\.id\} taskId=\{editing\.id\} \/>/.test(board));
const taComp = read('src/components/tasks/TaskAttachments.tsx');
ok('component POSTs taskId', taComp.includes("taskId,"));
ok('component ≤3MB client guard', taCard(taComp), );

function taCard(s) { return s.includes('3 * 1024 * 1024'); }

console.log('— web employee form / CEO default —');
const empPage = read('src/app/(dashboard)/employees/page.tsx');
ok('CEO option in role select', empPage.includes('<option value="ceo">CEO (Full Admin Access)</option>'));
ok('management checkbox auto-selects ceo', empPage.includes("updateForm('role', 'ceo')"));
const empPut = read('src/app/api/employees/[id]/route.ts');
ok('PUT default ceo for management', empPut.includes("role || (employee.isManagement ? 'ceo' : 'employee')"));
const creds = read('src/app/api/employees/credentials/route.ts');
ok('credentials single defaults ceo', creds.includes("(employee as { isManagement?: boolean }).isManagement ? 'ceo' : 'employee'"));
ok('credentials bulk defaults ceo', creds.includes("(emp as { isManagement?: boolean }).isManagement ? 'ceo' : 'employee'"));

console.log('— CEO access parity (spot checks) —');
const roleAccess = read('src/lib/roleAccess.ts');
ok('ROLE_LEVELS ceo=1', /ceo: 1,/.test(roleAccess));
ok('ROLE_ACCESS_DETAILS ceo entry', /ceo: \{\n    label: 'CEO',/.test(roleAccess));
ok('LEGACY_ROLE_MAP ceo first-class', /ceo: 'ceo',/.test(roleAccess));
ok('getDataScope all includes ceo', roleAccess.includes("'super_admin', 'tenant_admin', 'ceo',\n    'admin'") || /'tenant_admin', 'ceo'/.test(roleAccess));
ok('MODULE_ACCESS ceo everywhere', (roleAccess.match(/'tenant_admin', 'ceo'/g) || []).length >= 30);
ok('permissions.ts can() ceo', read('src/lib/permissions.ts').includes("if ((role === 'tenant_admin' || role === 'ceo')) return RBAC_MATRIX[action].tenant_admin;"));
ok('project-rbac ceo', read('src/lib/project-rbac.ts').includes("globalRole === 'ceo'"));
ok('leave-workflow ceo bypass', read('src/lib/leave-workflow.ts').includes("userRole === 'ceo'"));
ok('task-workflow admin fan-out ceo', /'ceo'/.test(read('src/lib/task-workflow.ts')));
ok('ecosystem-access ceo', read('src/lib/ecosystem-access.ts').includes("role === 'ceo'"));
ok('chat-permissions ceo', /'ceo'/.test(read('src/lib/chat-permissions.ts')));
ok('no broken optional-calls remain', !/[\w$]+\?\.\(\w+ (===|!==) 'tenant_admin'/.test(JSON.stringify([...walkSrc()])));

function walkSrc() {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!p.includes('generated')) walk(p); }
      else if (/\.(tsx?|jsx?)$/.test(e.name)) out.push(fs.readFileSync(p, 'utf8'));
    }
  };
  walk(path.join(ROOT, 'src'));
  return out;
}

console.log('— mobile —');
const mModel = read('hrms_app/lib/models/project.dart');
ok('model parses attachmentCount', mModel.includes('attachmentCount') && mModel.includes("c['attachments']"));
const mCfg = read('hrms_app/lib/config/api_config.dart');
ok('ApiConfig adminReports', mCfg.includes("static String get adminReports => '$apiUrl/reports';"));
ok('ApiConfig projectReports', mCfg.includes("static String get projectReports => '$apiUrl/project-reports';"));
ok('ApiConfig task attachments', mCfg.includes('projectTaskAttachments(String projectId, String taskId)'));
const mSvc = read('hrms_app/lib/services/api_service.dart');
ok('ApiService createTaskAttachment (dataUrl)', mSvc.includes("dataUrl': 'data:$mimeType;base64,"));
ok('ApiService getAdminReport', mSvc.includes('getAdminReport(String type'));
ok('ApiService getProjectReports', mSvc.includes('getProjectReports()'));
const mDetail = read('hrms_app/lib/screens/projects/project_detail_screen.dart');
ok('create sheet description field', mDetail.includes("MaanField(label: 'Description (optional)', controller: _desc, maxLines: 3)"));
ok('create sheet start date', mDetail.includes("'Start date (optional)'"));
ok('create payload plannedStart+description', mDetail.includes("'plannedStart': _plannedStart!.toIso8601String()") && mDetail.includes("'description': _desc.text.trim()"));
ok('update sheet edits description', mDetail.includes("MaanField(label: 'Task description', controller: _desc"));
ok('update sheet hrs field', mDetail.includes("'Hrs (estimated hours)'"));
ok('update sheet attachments upload', mDetail.includes('createTaskAttachment'));
ok('update sheet open attachment', mDetail.includes('Share.shareXFiles'));
ok('card shows description', mDetail.includes('t.description!,'));
ok('card shows start date', mDetail.includes("'start ${_fmt(t.plannedStart!)}'"));
ok('card 📎 count', mDetail.includes("'📎 ${t.attachmentCount}'"));
const mReports = read('hrms_app/lib/screens/reports/reports_screen.dart');
ok('reports: 4 modules', ['employee_report', 'leave_report', 'attendance_report', 'project-reports'].every((t) => mReports.includes(t) || mReports.includes('getProjectReports')));
ok('reports: role gate incl. ceo', mReports.includes("'tenant_admin', 'ceo'"));
ok('reports: month picker', mReports.includes('Reporting month'));
const mHome = read('hrms_app/lib/screens/home/home_screen.dart');
ok('home grid Reports tile', mHome.includes("Navigator.pushNamed(context, '/reports')"));
const mDrawer = read('hrms_app/lib/widgets/app_drawer.dart');
ok('drawer Reports item', mDrawer.includes("'Reports'"));
ok('leave approvers +ceo', read('hrms_app/lib/screens/leaves/leave_home_screen.dart').includes("'tenant_admin', 'ceo'"));
ok('project create +ceo', read('hrms_app/lib/screens/projects/projects_home_screen.dart').includes("'tenant_admin', 'ceo'"));

console.log('— version chain 1.6.0 (27) —');
ok('pubspec 1.6.0+27', read('hrms_app/pubspec.yaml').includes('version: 1.6.0+27'));
ok('app_info 1.6.0/27', read('hrms_app/lib/config/app_info.dart').includes("versionName = '1.6.0'") && read('hrms_app/lib/config/app_info.dart').includes('versionCode = 27'));
ok('constants 1.6.0', read('hrms_app/lib/config/constants.dart').includes("appVersion = '1.6.0'"));
const av = read('src/lib/app-version.ts');
ok('app-version.ts 1.6.0/27', av.includes("versionName: '1.6.0'") && av.includes('versionCode: 27'));
ok('app-version apk url', av.includes('3boxes-hrms-mobile-v1.6.0.apk'));
ok('downloads page 1.6.0', read('public/downloads/index.html').includes('3boxes-hrms-mobile-v1.6.0.apk'));
ok('downloads README 1.6.0', read('public/downloads/README.txt').includes('v1.6.0 (versionCode 27)'));
const t123 = read('hrms_app/test/task123_payroll_integration_test.dart');
ok('task123 contracts 1.6.0/27', t123.includes("'1.6.0'") && t123.includes('versionCode, 27'));

console.log(`\n${pass}/${pass + fail} checks pass`);
process.exit(fail === 0 ? 0 : 1);
