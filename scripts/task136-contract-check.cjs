#!/usr/bin/env node
/**
 * Task 136 — contract checks.
 *  A) Original Birthday field: schema + employee APIs (POST create, PUT update,
 *     change-log label) + web add/edit form + detail views + mobile model/form/detail.
 *  B) Birthdays dashboard: GET /api/birthdays (today + upcoming + wishedByMe),
 *     POST /api/birthdays/wish (manual greetings card), dashboard card mounted.
 *  C) Auto greetings: /api/cron/birthday-greetings (dual auth + tenant sweep +
 *     auto dedupe) + vercel.json cron entry + shared lib.
 *  D) Version chain 1.6.4 (31).
 */
const fs = require('fs');
const path = require('path');
const ROOT = '/home/z/my-project';
let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}`); } };
const read = (p) => { try { return fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch { return ''; } };

console.log('A) Original Birthday field');
const schema = read('prisma/schema.prisma');
check('Employee.originalBirthday in schema', /originalBirthday\s+DateTime\?/.test(schema));
check('BirthdayGreeting model + back-relation', /model BirthdayGreeting \{/.test(schema) && /birthdayGreetings\s+BirthdayGreeting\[\]/.test(schema));
const empPost = read('src/app/api/employees/route.ts');
check('POST /api/employees persists originalBirthday', /originalBirthday,\n/.test(empPost) && /originalBirthday: originalBirthday \? new Date\(originalBirthday\) : null/.test(empPost));
const empPut = read('src/app/api/employees/[id]/route.ts');
check('PUT /api/employees/[id] updates originalBirthday', /originalBirthday, gender, maritalStatus,/.test(empPut) && /updateData\.originalBirthday = originalBirthday \? new Date\(originalBirthday\) : null/.test(empPut));
check('change-log label registered', /originalBirthday:\s+\{ label: 'Original Birthday'/.test(empPut));
const empForm = read('src/app/(dashboard)/employees/page.tsx');
check('web form: state + prefill + input + helper text', /originalBirthday: ''/.test(empForm) && /updateForm\('originalBirthday'/.test(empForm) && /Real birth date for birthday wishes/.test(empForm) && /originalBirthday: \(emp as Record<string, unknown>\)\.originalBirthday/.test(empForm));
const empDetail = read('src/app/(dashboard)/employees/[id]/page.tsx');
check('web detail shows Original Birthday (both views)', (empDetail.match(/label="Original Birthday"/g) || []).length === 2);
const model = read('hrms_app/lib/models/employee.dart');
check('mobile EmployeeModel.originalBirthday parsed', /final DateTime\? originalBirthday;/.test(model) && /DateTime\.tryParse\(json\['originalBirthday'\]/.test(model));
const addEmp = read('hrms_app/lib/screens/employees/add_employee_screen.dart');
check('mobile add form: picker + payload', /_pickOriginalBirthday/.test(addEmp) && /'originalBirthday': '\$\{_originalBirthday!/.test(addEmp));
const detScr = read('hrms_app/lib/screens/employees/employee_detail_screen.dart');
check('mobile detail shows Original Birthday tile', /'Original Birthday'/.test(detScr) && /Icons\.cake_rounded/.test(detScr));

console.log('B) Birthdays dashboard + wishes');
const bdayRoute = read('src/app/api/birthdays/route.ts');
check('GET /api/birthdays: today + upcoming + wishedByMe', /today: todayOut/.test(bdayRoute) && /upcoming:/.test(bdayRoute) && /wishedByMe:/.test(bdayRoute));
check('GET /api/birthdays: any authenticated user (no role gate)', !/getDataScope/.test(bdayRoute) && /verifyToken/.test(bdayRoute));
const wishRoute = read('src/app/api/birthdays/wish/route.ts');
check('POST /api/birthdays/wish: birthday-day guard', /not this employee's birthday today/.test(wishRoute));
check('POST /api/birthdays/wish: one wish per sender per year', /senderUserId: decoded\.userId/.test(wishRoute) && /alreadyWished/.test(wishRoute));
check('wish delivers row + bell + email via shared lib', /deliverBirthdayGreeting\(\{/.test(wishRoute));
const lib = read('src/lib/birthday-greetings.ts');
check('lib: IST today + month-day match + ensureBirthdayTables + card HTML', /istToday\(\)/.test(lib) && /birthdayMonthDay/.test(lib) && /ensureBirthdayTables/.test(lib) && /birthdayCardHtml/.test(lib) && /\\uD83C\\uDF82/.test(JSON.stringify(lib).slice(0, -0)) === false || /🎂/.test(lib));
check('lib: createNotification + sendTenantEmail wired', /from '@\/lib\/notifications'/.test(lib) && /from '@\/lib\/notification-channels'/.test(lib));
const dash = read('src/app/(dashboard)/dashboard/page.tsx');
check('BirthdaysCard mounted on self-service dashboard', /import BirthdaysCard from '@\/components\/dashboard\/BirthdaysCard'/.test(dash) && /<BirthdaysCard \/>/.test(dash));
const card = read('src/components/dashboard/BirthdaysCard.tsx');
check('card: Send Wishes button + wished state', /Send Wishes/.test(card) && /\/api\/birthdays\/wish/.test(card));
const home = read('hrms_app/lib/screens/home/home_screen.dart');
check('mobile home: birthdays card + send wish', /_birthdaysCard\(\)/.test(home) && /sendBirthdayWish/.test(home));
const svc = read('hrms_app/lib/services/api_service.dart');
check('mobile ApiService: getBirthdays + sendBirthdayWish', /getBirthdays\(\)/.test(svc) && /sendBirthdayWish\(String employeeId\)/.test(svc));
const cfg = read('hrms_app/lib/config/api_config.dart');
check('mobile ApiConfig: birthdays + birthdayWish', /birthdays =>/.test(cfg) && /birthdayWish =>/.test(cfg));

console.log('C) Auto-greeting cron');
const cron = read('src/app/api/cron/birthday-greetings/route.ts');
check('cron: CRON_SECRET auth + admin JWT mode', /CRON_SECRET/.test(cron) && /adminTenantId/.test(cron));
check('cron: dedicated tenant sweep + source=auto dedupe', /tenantDatabase\.findMany/.test(cron) && /source: 'auto'/.test(cron) && /already/.test(cron));
check('cron: deliverBirthdayGreeting per birthday employee', /deliverBirthdayGreeting\(\{/.test(cron));
const vercel = read('vercel.json');
check('vercel.json cron entry (daily 08:00 IST)', /"path": "\/api\/cron\/birthday-greetings"/.test(vercel) && /"schedule": "30 2 \* \* \*"/.test(vercel));
const ddl = read('scripts/task136-schema.cjs');
check('DDL script: originalBirthday + BirthdayGreeting + IF NOT EXISTS', /ADD COLUMN IF NOT EXISTS "originalBirthday"/.test(ddl) && /CREATE TABLE IF NOT EXISTS "BirthdayGreeting"/.test(ddl));

console.log('D) Version chain 1.6.4 (31)');
const pubspec = read('hrms_app/pubspec.yaml');
check('pubspec 1.6.4+31', /^version: 1\.6\.4\+31$/m.test(pubspec));
const appInfo = read('hrms_app/lib/config/app_info.dart');
check('app_info.dart 1.6.4 / 31', /versionName = '1\.6\.4'/.test(appInfo) && /versionCode = 31/.test(appInfo));
const consts = read('hrms_app/lib/config/constants.dart');
check('constants.dart 1.6.4', /appVersion = '1\.6\.4'/.test(consts));
const av = read('src/lib/app-version.ts');
check('app-version.ts 1.6.4 / 31 + apk url', /versionName: '1\.6\.4'/.test(av) && /versionCode: 31/.test(av) && /3boxes-hrms-mobile-v1\.6\.4\.apk/.test(av));
const dl = read('public/downloads/index.html');
check('downloads page v1.6.4 (31)', /v1\.6\.4 \(31\)/.test(dl) && /3boxes-hrms-mobile-v1\.6\.4\.apk/.test(dl));
const t123 = read('hrms_app/test/task123_payroll_integration_test.dart');
check('task123 test expects 1.6.4 (31)', /1\.6\.4/.test(t123) && /versionCode, 31/.test(t123));

console.log(`\n${pass}/${pass + fail} PASS`);
process.exit(fail === 0 ? 0 : 1);
