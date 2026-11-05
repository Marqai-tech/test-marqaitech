// Task 127 — source contract checks (Node-only; runs without Flutter/TS).
// Verifies every fix for: Dussehra phantom punches + 4 mobile gaps + version chain.
import fs from 'node:fs';
import path from 'node:path';
const ROOT = '/home/z/my-project';
let fail = 0;
const ok = (name, cond) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
  if (!cond) fail += 1;
};
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const has = (p, needle) => read(p).includes(needle);

// ── 1. Attendance / holiday fixes (web) ──
ok('working-days: festival holidays included in getHolidaysInRange',
  has('src/lib/working-days.ts', "'public', 'company', 'national', 'country', 'festival'"));
ok('payroll-engine: derives missing absents before processing',
  has('src/lib/payroll-engine.ts', 'deriveMissingAbsents') &&
  has('src/lib/payroll-engine.ts', 'absent derivation failed (non-fatal)'));
ok('payroll-absent-derivation: gated on attendance-in-use + skips weekends/holidays/leave/future',
  has('src/lib/payroll-absent-derivation.ts', 'attendanceInUse') &&
  has('src/lib/payroll-absent-derivation.ts', 'skippedWeekend') &&
  has('src/lib/payroll-absent-derivation.ts', 'skippedHoliday') &&
  has('src/lib/payroll-absent-derivation.ts', "status: 'absent'"));
ok('data-fix script: normalizes 18:30 buckets + dedupes + holiday rebuild',
  has('scripts/task127-fix-attendance.cjs', "date::time = '18:30:00'") &&
  has('scripts/task127-fix-attendance.cjs', "2026-10-21") &&
  has('scripts/task127-fix-attendance.cjs', "'holiday'"));

// ── 2. Login country code + phone auth ──
ok('login route: phone candidates built from digits + dialCode',
  has('src/app/api/auth/login/route.ts', 'identityDigits') &&
  has('src/app/api/auth/login/route.ts', 'body.dialCode') &&
  has('src/app/api/auth/login/route.ts', 'phoneCandidates'));
ok('mobile signin: country picker sheet + tappable prefix (no dead decoration)',
  has('hrms_app/lib/screens/auth/signin_screen.dart', '_CountryPickerSheet') &&
  has('hrms_app/lib/screens/auth/signin_screen.dart', '_pickCountry') &&
  !has('hrms_app/lib/screens/auth/signin_screen.dart', "Text('🇺🇸'"));
ok('mobile signin: India default +91 and dialCode sent for digit identities',
  has('hrms_app/lib/screens/auth/signin_screen.dart', "String _dialCode = '+91';") &&
  has('hrms_app/lib/screens/auth/signin_screen.dart', 'dialCode: isPhone ? _dialCode : null'));
ok('mobile auth provider + api service thread dialCode into the login POST',
  has('hrms_app/lib/providers/auth_provider.dart', 'login(String email, String password, {String? dialCode})') &&
  has('hrms_app/lib/services/api_service.dart', "if (dialCode != null) 'dialCode': dialCode,"));

// ── 3. Mobile payroll filters + full deduction rows ──
ok('mobile payroll: month/employee/status filter bar applied to runs + payslips',
  has('hrms_app/lib/screens/payroll/payroll_home_screen.dart', '_FilterBar') &&
  has('hrms_app/lib/screens/payroll/payroll_home_screen.dart', '_applyFilters') &&
  has('hrms_app/lib/screens/payroll/payroll_home_screen.dart', 'All Employees'));
ok('mobile payroll: payslip sheet shows ALL component rows (zero included)',
  has('hrms_app/lib/screens/payroll/payroll_home_screen.dart', 'render ALL rows') &&
  !has('hrms_app/lib/screens/payroll/payroll_home_screen.dart', "where((r) => r.\$2 != 0)"));
ok('web payslips page: zero-value rows no longer filtered (parity)',
  !has('src/app/(dashboard)/payroll/payslips/page.tsx', ".filter(({ value }) => Number(value) !== 0)"));
ok('mobile payroll provider fetches a 200-row page (no truncation)',
  has('hrms_app/lib/providers/payroll_provider.dart', 'getPayrolls(limit: 200)'));

// ── 4. Chat group members ──
ok('chat room: tappable group/project name opens the members sheet',
  has('hrms_app/lib/screens/chat/chat_room_screen.dart', '_showMembersSheet') &&
  has('hrms_app/lib/screens/chat/chat_room_screen.dart', 'onTap: widget.room.isDirect ? null : _showMembersSheet') &&
  has('hrms_app/lib/screens/chat/chat_room_screen.dart', 'class _ChatMembersSheet'));
ok('api service: GET chat room members wired to the members endpoint',
  has('hrms_app/lib/services/api_service.dart', 'getChatRoomMembers') &&
  has('hrms_app/lib/config/api_config.dart', 'chatRoomMembers(String roomId)'));

// ── 5. Version chain 1.5.8 (25) ──
ok('pubspec 1.5.8+25', has('hrms_app/pubspec.yaml', 'version: 1.5.8+25'));
ok('app_info 1.5.8 / 25', has('hrms_app/lib/config/app_info.dart', "versionName = '1.5.8';") &&
  has('hrms_app/lib/config/app_info.dart', 'versionCode = 25;'));
ok('constants 1.5.8', has('hrms_app/lib/config/constants.dart', "appVersion = '1.5.8';"));
ok('app-version.ts 1.5.8 / 25 + new apk url + task127 notes',
  has('src/lib/app-version.ts', "versionName: '1.5.8',") &&
  has('src/lib/app-version.ts', 'versionCode: 25,') &&
  has('src/lib/app-version.ts', '/downloads/3boxes-hrms-mobile-v1.5.8.apk') &&
  has('src/lib/app-version.ts', 'country-code selector'));
ok('downloads page points to v1.5.8 (25)',
  has('public/downloads/index.html', 'v1.5.8 (25)') &&
  has('public/downloads/index.html', '/downloads/3boxes-hrms-mobile-v1.5.8.apk'));
ok('task123 test version contracts updated',
  has('hrms_app/test/task123_payroll_integration_test.dart', "'1.5.8'") &&
  has('hrms_app/test/task123_payroll_integration_test.dart', 'versionCode, 25'));

console.log(fail === 0 ? '\nTASK 127 CONTRACT CHECK: ALL PASS' : `\nTASK 127 CONTRACT CHECK: ${fail} FAILURES`);
process.exit(fail === 0 ? 0 : 1);
