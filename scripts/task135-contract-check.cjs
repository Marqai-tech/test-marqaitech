#!/usr/bin/env node
/**
 * Task 135 — contract checks.
 *  A) Task-CREATED notifications: notifyTaskCreated fan-out wired into the
 *     single creation endpoint shared by web + mobile; diagnostics surfaced;
 *     the old assignee-only silent bell removed.
 *  B) Mobile Team Attendance: new screen (Daily Status + Team Report),
 *     role-gated entries (home grid + drawer + reports tab) + route.
 *  C) On-behalf context: web /attendance/apply-by-hr + /leave/apply-by-hr and
 *     the mobile apply sheet fetch the picked employee's leave balances,
 *     regularization dates, recent punches and pending requests.
 *  D) Version chain synced to 1.6.3 (30).
 */
const fs = require('fs');
const path = require('path');
const ROOT = '/home/z/my-project';
let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}`); } };
const read = (p) => { try { return fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch { return ''; } };

console.log('A) Task-created notification fan-out');
const wf = read('src/lib/task-workflow.ts');
check('notifyTaskCreated exported from task-workflow.ts', /export async function notifyTaskCreated/.test(wf));
check('recipient roles tracked (assignee/manager/admin)', /role: RecipientRole/.test(wf) && /'assignee' \| 'manager' \| 'admin'/.test(wf));
check('shared fan-out writes bell + email', /fanOutTaskAlert/.test(wf) && /createNotification\(/.test(wf) && /sendTenantEmail\(/.test(wf));
check('step-change alert preserved (no regression)', /export async function notifyTaskStepChange/.test(wf));
const createRoute = read('src/app/api/projects/[id]/tasks/route.ts');
check('creation route imports notifyTaskCreated', /import \{[^}]*notifyTaskCreated[^}]*\} from '@\/lib\/task-workflow'/.test(createRoute));
check('creation route calls notifyTaskCreated with assignee + projectManagerId', /notifyTaskCreated\(\{/.test(createRoute) && /assigneeEmployeeId: assignedToId \|\| null/.test(createRoute) && /managerEmployeeId: \(project as any\)\?\.projectManagerId \|\| null/.test(createRoute));
check('creation route returns taskAlert diagnostics', /\{ task, \.\.\.\(taskAlert \? \{ taskAlert \} : \{\}\) \}/.test(createRoute));
check('old assignee-only silent bell REMOVED', !/Task assigned to you"\s*,\s*\n\s*message: `"\$\{name\}" \(priority/.test(createRoute) && !/has been assigned to you\./.test(createRoute));

console.log('B) Mobile Team Attendance (admin/CEO/HR)');
const tas = read('hrms_app/lib/screens/attendance/team_attendance_screen.dart');
check('team_attendance_screen.dart exists with Daily Status + Team Report tabs', /'Daily Status'/.test(tas) && /'Team Report'/.test(tas));
check('daily board merges roster + rows (weekend/holiday/absent/not_marked derivation)', /_buildDayBoard/.test(tas) && /'not_marked'/.test(tas) && /_holidayDates/.test(tas));
check('late-by uses per-employee shiftWindows (Task 133 parity)', /_lateBy/.test(tas) && /shiftWindows/.test(tas));
check('team report consumes attendance_report records', /getAdminReport\(\s*'attendance_report'/.test(tas) && /_reportByEmployee/.test(tas));
const svc = read('hrms_app/lib/services/api_service.dart');
check('ApiService.getTeamAttendanceForDate', /getTeamAttendanceForDate/.test(svc));
check('ApiService on-behalf context methods', /getEmployeeLeaveBalance/.test(svc) && /getEmployeeRecentLeaves/.test(svc) && /getLeaveTypes/.test(svc) && /getHolidays/.test(svc));
const cfg = read('hrms_app/lib/config/api_config.dart');
check('ApiConfig endpoints (leave-types, balance, leave, holidays)', /leaveTypes =>/.test(cfg) && /employeeLeaveBalance\(String employeeId\)/.test(cfg) && /employeeLeaves\(String employeeId/.test(cfg) && /holidays =>/.test(cfg));
const main = read('hrms_app/lib/main.dart');
check("route '/team-attendance' registered", /'\/team-attendance': \(_\) => const TeamAttendanceScreen\(\)/.test(main));
const home = read('hrms_app/lib/screens/home/home_screen.dart');
check('home grid tile gated by ReportsScreen.canSee', /canSeeReports\)\s*\n\s*_tile\('Team\\nAttendance'/.test(home));
const drawer = read('hrms_app/lib/widgets/app_drawer.dart');
check('drawer item gated by ReportsScreen.canSee', /canSee\(context\.watch<AuthProvider>\(\)\.user\?\.role\)\)\s*\n\s*_item\(context, Icons\.groups_rounded, 'Team Attendance'/.test(drawer));
const rep = read('hrms_app/lib/screens/reports/reports_screen.dart');
check('Reports attendance tab links to team screen', /'Team attendance & daily status'/.test(rep) && /pushNamed\(context, '\/team-attendance'\)/.test(rep));

console.log('C) On-behalf employee context');
const attHr = read('src/app/(dashboard)/attendance/apply-by-hr/page.tsx');
check('attendance apply-by-hr fetches context on select', /fetchEmployeeContext\(emp\)/.test(attHr) && /handleSelectEmployee = \(emp: Employee\) =>/.test(attHr));
check('attendance context = punches + regularizations + pending + balances', /\/api\/attendance\?employeeId=\$\{emp\.id\}/.test(attHr) && /\/api\/attendance\/regularize\?employeeId=/.test(attHr) && /\/api\/attendance\/requests\?scope=all&status=pending/.test(attHr) && /\/api\/leave\/balance\?employeeId=/.test(attHr));
check('attendance context panel rendered (Employee Context + shift chip)', /Employee Context/.test(attHr) && /empContext\.shift/.test(attHr));
const lvHr = read('src/app/(dashboard)/leave/apply-by-hr/page.tsx');
check('leave apply-by-hr fetches regularization dates + pending requests', /\/api\/attendance\/regularize\?employeeId=\$\{employee\.id\}/.test(lvHr) && /\/api\/attendance\/requests\?scope=all&status=pending/.test(lvHr));
check('leave apply-by-hr shows Attendance & Regularizations panel', /Attendance & Regularizations|Attendance &amp; Regularizations/.test(lvHr) && /attendanceContext/.test(lvHr));
const lvs = read('hrms_app/lib/screens/leaves/leave_home_screen.dart');
check('mobile apply sheet loads employee context on pick', /_loadEmployeeContext\(\)/.test(lvs) && /_employeeContextCard\(\)/.test(lvs));
check('mobile apply sheet uses REAL leave types (fallback only)', /_fallbackLeaveTypes/.test(lvs) && /getLeaveTypes\(\)/.test(lvs));
check('mobile apply sheet sends leaveTypeId when resolved', /payload\['leaveTypeId'\] = leaveTypeId/.test(lvs));

console.log('D) Version chain 1.6.3 (30)');
const pubspec = read('hrms_app/pubspec.yaml');
check('pubspec 1.6.3+30', /^version: 1\.6\.3\+30$/m.test(pubspec));
const appInfo = read('hrms_app/lib/config/app_info.dart');
check('app_info.dart 1.6.3 / 30', /versionName = '1\.6\.3'/.test(appInfo) && /versionCode = 30/.test(appInfo));
const consts = read('hrms_app/lib/config/constants.dart');
check('constants.dart 1.6.3', /appVersion = '1\.6\.3'/.test(consts));
const av = read('src/lib/app-version.ts');
check('app-version.ts 1.6.3 / 30 + apk url', /versionName: '1\.6\.3'/.test(av) && /versionCode: 30/.test(av) && /3boxes-hrms-mobile-v1\.6\.3\.apk/.test(av));
const dl = read('public/downloads/index.html');
check('downloads page v1.6.3 (30)', /v1\.6\.3 \(30\)/.test(dl) && /3boxes-hrms-mobile-v1\.6\.3\.apk/.test(dl));
const t123 = read('hrms_app/test/task123_payroll_integration_test.dart');
check('task123 test expects 1.6.3 (30)', /1\.6\.3/.test(t123) && /versionCode, 30/.test(t123));

console.log(`\n${pass}/${pass + fail} PASS`);
process.exit(fail === 0 ? 0 : 1);
