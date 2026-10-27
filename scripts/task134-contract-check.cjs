/**
 * Task 134 — source contract check (no runtime): verifies every edit point
 * of the self-service Change Password feature (web + mobile + API + version).
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function check(name, file, needles) {
  const src = fs.readFileSync(path.join('/home/z/my-project', file), 'utf8');
  const missing = needles.filter(n => !src.includes(n));
  if (missing.length === 0) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} — missing: ${missing.join(' | ')}`); }
}
function checkNot(name, file, forbidden) {
  const src = fs.readFileSync(path.join('/home/z/my-project', file), 'utf8');
  const present = forbidden.filter(n => src.includes(n));
  if (present.length === 0) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} — found forbidden: ${present.join(' | ')}`); }
}

// ── API route ──
check('api: change-password route core', 'src/app/api/auth/change-password/route.ts', [
  "import { hashPassword, verifyPassword, getTokenFromHeaders, verifyToken } from '@/lib/auth';",
  "import { getPlatformDb, getDbForTenant, getDbForTenantById } from '@/lib/tenant-db';",
  'export async function OPTIONS()',
  'export async function POST(request: Request) {',
  "const userId = decoded.userId as string;",
  "const tenantSlug = request.headers.get('x-tenant-slug') || '';",
  "const tenantId = decoded.tenantId as string | undefined;",
  "if (jwtRole === 'super_admin') {",
  'Current password and new password are required',
  'New password must be at least',
  'New password must be different from the current password',
  'Current password is incorrect',
  'No password has been set for this account yet',
  'const newHash = await hashPassword(newPassword);',
  'const currentOk = await verifyPassword(currentPassword, row.password);',
  'if (!row.password) {',
]);
check('api: mirror sync both directions', 'src/app/api/auth/change-password/route.ts', [
  'if (db !== platformDb) {',
  "const byId = await platformDb.user",
  "const byEmail = await platformDb.user",
  "} else if (row.tenantId) {",
  'const tenantDb = await getDbForTenantById(row.tenantId);',
  'const byId = await tenantDb.user',
  'const byEmail = await tenantDb.user',
  'carry DIFFERENT ids',
  "'Password changed successfully', mirrored",
]);
check('api: length bounds enforced', 'src/app/api/auth/change-password/route.ts', [
  'const MIN_LENGTH = 8;',
  'const MAX_LENGTH = 128;',
  'newPassword.length > MAX_LENGTH',
]);

// ── Web: shared modal ──
check('web: ChangePasswordModal exists + validates', 'src/components/ChangePasswordModal.tsx', [
  "import { getToken } from '@/lib/token-storage';",
  "import { useAuthStore } from '@/store/authStore';",
  "fetch('/api/auth/change-password', {",
  "method: 'POST',",
  'currentPassword, newPassword',
  'New password and confirmation do not match.',
  'const MIN_LENGTH = 8;',
  'aria-modal="true"',
  'autoComplete={f.label === \'Current Password\' ? \'current-password\' : \'new-password\'}',
  'disabled={submitting}',
]);

// ── Web: header dropdown (ALL users, NOT role-gated) ──
check('web: Header dropdown entry for every role', 'src/components/Header.tsx', [
  "import ChangePasswordModal from '@/components/ChangePasswordModal';",
  'FiLock',
  'const [showChangePassword, setShowChangePassword] = useState(false);',
  'Change Password',
  '<ChangePasswordModal open={showChangePassword} onClose={() => setShowChangePassword(false)} />',
]);
checkNot('web: header entry NOT wrapped in a role gate', 'src/components/Header.tsx', [
  "['super_admin', 'tenant_admin', 'ceo', 'admin'].includes(user?.role || '') && (\n              <button\n                onClick={() => {\n                  setShowUserMenu(false);\n                  setShowChangePassword(true);\n                }}",
]);

// ── Web: My Profile page ──
check('web: My Profile page button + modal', 'src/app/(dashboard)/my-profile/page.tsx', [
  'FiLock',
  'const [showChangePassword, setShowChangePassword] = useState(false);',
  'onClick={() => setShowChangePassword(true)}',
  '<ChangePasswordModal open={showChangePassword} onClose={() => setShowChangePassword(false)} />',
  'Change your account password',
]);

// ── Mobile ──
check('mobile: ApiConfig endpoint', 'hrms_app/lib/config/api_config.dart', [
  "static String get changePassword => '$apiUrl/auth/change-password';",
]);
check('mobile: ApiService method', 'hrms_app/lib/services/api_service.dart', [
  'static Future<void> changePassword({',
  "required String currentPassword,",
  "required String newPassword,",
  'final response = await _post(ApiConfig.changePassword, {',
]);
check('mobile: profile screen button + dialog', 'hrms_app/lib/screens/profile/profile_screen.dart', [
  "onPressed: _showChangePasswordDialog,",
  "const Text('Change Password', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),",
  'await ApiService.changePassword(',
  "'Password changed successfully'",
  'New password must be at least 8 characters.',
  'New password must be different from the current password.',
  'New password and confirmation do not match.',
  'Current Password',
  'Confirm New Password',
  'obscureText: obscure,',
]);

// ── Version chain 1.6.2 (29) ──
const versionChecks = [
  ['pubspec', 'hrms_app/pubspec.yaml', ['version: 1.6.2+29']],
  ['app-version.ts', 'src/lib/app-version.ts', ["versionName: '1.6.2',", 'versionCode: 29,', "apkUrl: '/downloads/3boxes-hrms-mobile-v1.6.2.apk'"]],
  ['app_info.dart', 'hrms_app/lib/config/app_info.dart', ["static const String versionName = '1.6.2';", 'static const int versionCode = 29;']],
  ['constants.dart', 'hrms_app/lib/config/constants.dart', ["static const String appVersion = '1.6.2';"]],
  ['downloads index.html', 'public/downloads/index.html', ['v1.6.2 (29)', '3boxes-hrms-mobile-v1.6.2.apk']],
  ['task123 test', 'hrms_app/test/task123_payroll_integration_test.dart', ["mobile version chain is 1.6.2 (29)", "expect(AppInfo.versionName, '1.6.2');", 'expect(AppInfo.versionCode, 29);', "expect(AppConstants.appVersion, '1.6.2');"]],
];
for (const [name, file, needles] of versionChecks) check(`version: ${name}`, file, needles);
checkNot('version: no stale 1.6.1 APK refs in index.html', 'public/downloads/index.html', ['3boxes-hrms-mobile-v1.6.1.apk']);

console.log(`\n${pass}/${pass + fail} checks pass`);
process.exit(fail === 0 ? 0 : 1);
