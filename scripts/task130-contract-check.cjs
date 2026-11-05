/**
 * Task 130 — node source-contract checks (no DB, no build needed).
 * Verifies the payslip release gate + released-format PDF end to end
 * at the source level, mirroring the task123/125/126/129 check style.
 *
 * USAGE: node scripts/task130-contract-check.cjs
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
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, 'utf8');
}

// ── 1. Prisma schema: release columns on Payroll ──
const schema = read('prisma/schema.prisma') || '';
check('schema: Payroll.releasedAt', /releasedAt\s+DateTime\?/.test(schema));
check('schema: Payroll.releasedById', /releasedById\s+String\?/.test(schema));

// ── 2. Release API route ──
const rel = read('src/app/api/payroll/payslips/release/route.ts') || '';
check('release route: payroll-manager roles guard', rel.includes("PAYROLL_MANAGER_ROLES.includes(scope.role)") && rel.includes("scope.scope !== 'all'"));
check('release route: month+year+action body', rel.includes("action === 'revoke'") && rel.includes('parseInt(String(body?.month'));
check('release route: updateMany on processed/paid', rel.includes("status: { in: ['processed', 'paid'] }"));
check('release route: release stamps releasedAt/releasedById', rel.includes('releasedAt: new Date()') && rel.includes('releasedById: String(scope.userId'));
check('release route: revoke clears stamps', rel.includes('releasedAt: null'));

// ── 3. PDF route: gating + data ──
const pdf = read('src/app/api/payroll/payslips/[id]/pdf/route.ts') || '';
check('pdf route: release gate message', pdf.includes('Payslip not released yet'));
check('pdf route: admins bypass release gate', pdf.includes("const isPayrollManager = scope.scope === 'all'"));
check('pdf route: self must own the payslip', pdf.includes('payroll.employee.userId !== scope.userId'));
check('pdf route: draft payslips blocked', pdf.includes("['processed', 'paid'].includes(payroll.status)"));
check('pdf route: effectiveWorkDays from paidDays', pdf.includes('effectiveWorkDays: payroll.paidDays'));
check('pdf route: daysInMonth from totalDays', pdf.includes('daysInMonth: payroll.totalDays'));
check('pdf route: location city→branch→company', pdf.includes('payroll.employee.city ||') && pdf.includes('payroll.employee.branch?.name'));
check('pdf route: PDF response headers', pdf.includes("'Content-Type': 'application/pdf'") && pdf.includes('Content-Disposition'));
check('pdf route: remote logo JPEG-only (RGBA-PNG jsPDF inflation guard)', pdf.includes('\\.jpe?g'));

// ── 4. PDF builder: released MARQAI format ──
const builder = read('src/lib/payslip-pdf.ts') || '';
check('pdf builder: Salary Payslip - {Month} {Year} title', builder.includes('Salary Payslip - ${input.monthName} ${input.year}'));
check('pdf builder: rupee font registered', builder.includes("addFont('RupeeSans.ttf', 'RupeeSans', 'normal')"));
check('pdf builder: rupee glyph drawn with custom font', builder.includes("doc.text('₹', tx, baseY)"));
check('pdf builder: JPEG logo only (no PNG addImage)', builder.includes("addImage(logoB64, 'JPEG'") && !/addImage\([^)]*'PNG'/.test(builder));
check('pdf builder: info grid rows', builder.includes("'Employee Name'") && builder.includes("'Effective Work Days'") && builder.includes("'Days in Month'") && builder.includes("'Location'"));
check('pdf builder: earnings + deductions columns', builder.includes("'Earnings'") && builder.includes("'Deductions'") && builder.includes("'Amount ('"));
check('pdf builder: totals + net salary + zero-filtered rows', builder.includes('Total Earnings') && builder.includes('Total Deductions') && builder.includes('Net Salary') && builder.includes('.filter((e) => e.amount > 0.004)'));
check('pdf builder: amount in words + footer', builder.includes('amountInWordsINR(input.netPay)') && builder.includes('This is a system generated payslip and does not require any signature.'));
check('pdf builder: Indian number grouping', builder.includes("'en-IN'"));

// ── 5. Embedded assets ──
const assets = read('src/lib/payslip-assets.ts') || '';
check('assets: rupee font embedded', assets.includes('export const RUPEE_FONT_B64') && !/RUPEE_FONT_B64\s*=\s*''/.test(assets));
check('assets: MarqAI logo embedded', assets.includes('export const MARQAI_TECH_LOGO_B64') && assets.length > 15000);
check('assets: company-name fallback', assets.includes('isMarqAITechCompany'));

// ── 6. Amount in words ──
const words = read('src/lib/amount-in-words.ts') || '';
check('words: Indian system + singular rupee', words.includes('Crore') && words.includes('Lakh') && words.includes("rupees === 1 ? 'Rupee' : 'Rupees'"));

// ── 7. List routes: employee release gating ──
const list = read('src/app/api/payroll/payslips/route.ts') || '';
check('payslips list: self sees released only', /scope\.scope === 'self'[\s\S]{0,400}releasedAt = \{ not: null \}/.test(list));
const mobList = read('src/app/api/payroll/route.ts') || '';
check('mobile payroll list: self sees released only', /scope\.scope === 'self'[\s\S]{0,500}releasedAt = \{ not: null \}/.test(mobList));
const detail = read('src/app/api/payroll/payslips/[id]/route.ts') || '';
check('payslip detail: release gate for non-admins', detail.includes('scope.scope !== \'all\' && !payroll.releasedAt'));
check('payslip detail: exposes released flag', detail.includes('released: !!payroll.releasedAt'));

// ── 8. Web page ──
const web = read('src/app/(dashboard)/payroll/payslips/page.tsx') || '';
check('web: Release Payslips + Revoke buttons', web.includes('Release Payslips') && web.includes("handleReleasePayslips('revoke')"));
check('web: release needs month+year filter', web.includes('Select a month and year filter first'));
check('web: per-row PDF download with lock', web.includes('handleDownloadPdf') && web.includes('FiLock') && web.includes('/pdf?'));
check('web: Released/Unreleased chips', web.includes('> Released <') || web.includes('Released</span>') || (web.includes('FiUnlock') && web.includes('Unreleased')));
check('web: payroll-manager roles list', web.includes('company_hr_admin'));

// ── 9. Mobile ──
const model = read('hrms_app/lib/models/payroll.dart') || '';
check('mobile model: releasedAt + isReleased', model.includes('final DateTime? releasedAt;') && model.includes('bool get isReleased => releasedAt != null;'));
const svc = read('hrms_app/lib/services/api_service.dart') || '';
check('mobile service: getPayslipPdf bytes', svc.includes('Future<Uint8List> getPayslipPdf') && svc.includes('response.bodyBytes'));
const cfg = read('hrms_app/lib/config/api_config.dart') || '';
check('mobile api config: payslipPdf endpoint', cfg.includes("payslipPdf(String id) => '\$apiUrl/payroll/payslips/\$id/pdf'"));
const screen = read('hrms_app/lib/screens/payroll/payroll_home_screen.dart') || '';
check('mobile screen: download button + share', screen.includes('Download Payslip PDF') && screen.includes('Share.shareXFiles') && screen.includes('XFile.fromData(bytes'));
check('mobile screen: release chip + lock for staff', screen.includes('releaseLabel') && screen.includes('Locked Until Released') && screen.includes('_payrollManagerRoles'));

// ── 10. Version chain 1.6.1 (28) ──
const pubspec = read('hrms_app/pubspec.yaml') || '';
check('pubspec: 1.6.1+28', pubspec.includes('version: 1.6.1+28'));
const appInfo = read('hrms_app/lib/config/app_info.dart') || '';
check('app_info: 1.6.1 / 28', appInfo.includes("versionName = '1.6.1'") && appInfo.includes('versionCode = 28'));
const consts = read('hrms_app/lib/config/constants.dart') || '';
check('constants: 1.6.1', consts.includes("appVersion = '1.6.1'"));
const appVersion = read('src/lib/app-version.ts') || '';
check('app-version: 1.6.1 / 28 + apk url', appVersion.includes("versionName: '1.6.1'") && appVersion.includes('versionCode: 28') && appVersion.includes('3boxes-hrms-mobile-v1.6.1.apk'));
const dl = read('public/downloads/index.html') || '';
check('downloads page: v1.6.1 (28) + apk link', dl.includes('v1.6.1 (28)') && dl.includes('3boxes-hrms-mobile-v1.6.1.apk'));
const readme = read('public/downloads/README.txt') || '';
check('downloads README: 1.6.1 (28)', readme.includes('v1.6.1 (versionCode 28)'));
const t123 = read('hrms_app/test/task123_payroll_integration_test.dart') || '';
check('task123 test: 1.6.1 / 28 contracts', t123.includes("versionName, '1.6.1'") && t123.includes('versionCode, 28'));

// ── 11. Schema migration script covers 3 DBs ──
const mig = read('scripts/task130-schema.cjs') || '';
check('schema script: releasedAt + releasedById, idempotent', mig.includes('"releasedAt" TIMESTAMP(3)') && mig.includes('"releasedById" TEXT') && mig.includes('IF NOT EXISTS'));

console.log(`\n${pass}/${pass + fail} checks pass`);
process.exit(fail === 0 ? 0 : 1);
