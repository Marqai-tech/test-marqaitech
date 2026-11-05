/**
 * Task 142 — contract check (source needles + logic simulations) — MERGED
 * TREE edition. The release combines two parallel implementations:
 *   · parallel session: SMS+email dual-channel OTP (src/lib/sms.ts),
 *     /api/public/helpdesk-tickets (pre-auth Contact HR), v1.7.0 (34),
 *     compact dashboard + SmartHR chat restyle + SOP docs;
 *   · main agent: SMTP-first email delivery fix in src/lib/email.ts
 *     (ROOT CAUSE of "OTP not received"), email-identity OTP requests,
 *     password-saving Remember me.
 * Covers both sets.
 *
 * USAGE: node scripts/task142-contract-check.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = '/home/z/my-project';
let pass = 0, fail = 0;
const results = [];
const ok = (label, cond, extra = '') => {
  if (cond) { pass++; results.push(`  PASS  ${label}${extra ? ` — ${extra}` : ''}`); }
  else { fail++; results.push(`  FAIL  ${label}${extra ? ` — ${extra}` : ''}`); }
};
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// ═══ 1) WEB — email.ts: SMTP-first (root-cause fix) ═══
const email = read('src/lib/email.ts');
ok('email.ts imports nodemailer', email.includes("import nodemailer from 'nodemailer'"));
ok('email.ts SMTP transport builder', email.includes('function getSmtpTransport()'));
ok('email.ts SMTP tried FIRST in sendEmail', email.indexOf('1) SMTP (primary') < email.indexOf('2) Resend (fallback)') && email.includes('const smtp = getSmtpTransport();'));
ok('email.ts SMTP_FROM_NAME/EMAIL used', email.includes('SMTP_FROM_EMAIL'));
ok('email.ts placeholder-key guard', email.includes('function isPlaceholderResendKey') && email.includes("k.startsWith('[')"));
ok('email.ts marks delivery via field', email.includes("via?: 'smtp' | 'resend'"));

// ═══ 2) WEB — OTP route: dual-channel + email identities + loud failure ═══
const otp = read('src/app/api/auth/otp/route.ts');
ok('otp: dual-channel (sms + email)', otp.includes("from '@/lib/sms'") && otp.includes('sendSms'));
ok('otp: email identity branch', otp.includes('const isEmailIdentity = phone.includes') && otp.includes('findUserByEmail'));
ok('otp: email lookup SQL (User join Employee)', otp.includes('FROM "User" u LEFT JOIN "Employee" e'));
ok('otp: sweep honours email identity', otp.includes('? await findUserByEmail(sweepDb, phone).catch(() => null)'));
ok('otp: tenant resolution honours email identity', otp.includes('? await findUserByEmail(db, phone).catch(() => null)'));
ok('otp: loud failure when BOTH channels fail', otp.includes('channels: { email: false, sms: false }'));
ok('otp: per-channel status in response', otp.includes('channels: { email: emailDelivered, sms: smsDelivered }'));

// ═══ 3) WEB — pre-auth Contact HR ticket endpoint (parallel impl) ═══
const contact = read('src/app/api/public/helpdesk-tickets/route.ts');
ok('helpdesk-tickets: public POST route exists', contact.includes('export async function POST') || contact.includes('export async function PUT'));
ok('helpdesk-tickets: rate limited', /rate|Rate|RATE/.test(contact));
ok('helpdesk-tickets: creates a Ticket', contact.includes('ticket.create') || contact.includes('ticketId'));
ok('helpdesk-tickets: alerts admins (bell + email)', contact.includes('notification.create') && contact.includes('sendEmail'));
ok('helpdesk-tickets: employee-id lookup supported', contact.includes('employeeId') && /Employee|User/.test(contact));

// ═══ 4) WEB — SMS gateway lib (parallel impl) ═══
const sms = read('src/lib/sms.ts');
ok('sms.ts: Twilio + MSG91 + generic HTTP gateway support', sms.includes('TWILIO_ACCOUNT_SID') && sms.includes('MSG91_AUTH_KEY'));
ok('sms.ts: isSmsConfigured exported', sms.includes('export function isSmsConfigured'));

// ═══ 5) MOBILE — sign-in: keypad + remember-me (both impls) ═══
const signin = read('hrms_app/lib/screens/auth/signin_screen.dart');
ok('signin: dedicated focus nodes + tab switch unfocus', signin.includes('_phoneFocus = FocusNode()') && signin.includes('FocusScope.of(context).unfocus()') && signin.includes('void _switchTab({required bool mobile})'));
ok('signin: remember persists on BOTH tabs', signin.includes('_persistRemembered') && signin.includes("setRememberedKind('phone')") && signin.includes("setRememberedKind('identity')"));
ok('signin: PASSWORD auto-saved + restored (main agent graft)', signin.includes('setRememberedPassword(_password.text)') && signin.includes('getRememberedPassword()'));
ok('signin: unchecking wipes saved login', signin.includes("setRememberedPassword('')"));

const storage = read('hrms_app/lib/services/storage_service.dart');
ok('storage: kind + dial + password persisted', storage.includes("'remembered_kind'") && storage.includes("'remembered_dial'") && storage.includes("'remembered_password'"));
ok('storage: clearAll wipes new keys', storage.includes("prefs.remove('remembered_password')") && storage.includes("prefs.remove('remembered_dial')"));

const api = read('hrms_app/lib/services/api_service.dart');
ok('api: mobile calls the public helpdesk-ticket endpoint', api.includes('/api/public/helpdesk-tickets'));

// ═══ 6) MOBILE — one-screen dashboard + SmartHR chat (parallel impl) ═══
const home = read('hrms_app/lib/screens/home/home_screen.dart');
ok('home: compact dashboard shipped by parallel impl', !home.includes('_timeLogCard') && !home.includes('_quickLinks'));
ok('home: no standalone week-chart/month/org cards', !home.includes('_weekChartCard') && !home.includes('_monthCard') && !home.includes('_orgStatsCard'));
ok('home: SmartHR royal/violet palette present', home.includes('0xFF5B7FE8') && home.includes('0xFF7C6FF0'));

const chat = read('hrms_app/lib/screens/chat/chat_home_screen.dart');
ok('chat: SmartHR filter chips + counter chips shipped', chat.includes("String _filter = 'all'") && chat.includes('SmartHR filter chips') && chat.includes('Widget _chip(String label, int count'));

// ═══ 7) VERSION CHAIN 1.7.0 (34) ═══
ok('pubspec 1.7.0+34', read('hrms_app/pubspec.yaml').includes('version: 1.7.0+34'));
ok('app_info 1.7.0/34', read('hrms_app/lib/config/app_info.dart').includes("'1.7.0'") && read('hrms_app/lib/config/app_info.dart').includes('versionCode = 34'));
ok('constants 1.7.0', read('hrms_app/lib/config/constants.dart').includes("'1.7.0'"));
const av = read('src/lib/app-version.ts');
ok('app-version 1.7.0/34 + apk name', av.includes("versionName: '1.7.0'") && av.includes('versionCode: 34') && av.includes('3boxes-hrms-mobile-v1.7.0.apk'));
ok('downloads page 1.7.0', read('public/downloads/index.html').includes('1.7.0'));
const avWithoutNotes = av.replace(/Installs over v1\.6\.6[^']*',/, '');
ok('no stale 1.6.6 in version fields', !avWithoutNotes.includes('1.6.6') && !read('public/downloads/index.html').includes('1.6.6'));

// ═══ 8) phone-candidate simulation (regression guard) ═══
function phoneCandidates(rawPhone, dialCode) {
  const identityDigits = String(rawPhone || '').replace(/\D/g, '');
  const dialDigits = String(dialCode || '').replace(/\D/g, '');
  const set = new Set();
  if (identityDigits.length >= 6) {
    set.add(identityDigits);
    set.add(`+${identityDigits}`);
    if (dialDigits) { set.add(`${dialDigits}${identityDigits}`); set.add(`+${dialDigits}${identityDigits}`); }
    if (identityDigits.length > 10) set.add(identityDigits.slice(-10));
  }
  return [...set];
}
const c1 = phoneCandidates('98288 03789', '+91');
ok('phone candidates: 10-digit + dial variants', c1.length === 4 && c1.includes('919828803789'), c1.join(','));
ok('phone candidates: email identity yields none', phoneCandidates('hr@marqaitech.com', '+91').length === 0);

console.log(results.join('\n'));
console.log(`\n${pass} passed, ${fail} failed (${pass + fail} total)`);
process.exit(fail > 0 ? 1 : 0);
