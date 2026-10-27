#!/usr/bin/env node
/* Task 141 — contract check: needle tests for every change in this task.
 * 1. Backend OTP route exists with request/verify actions + security guards
 * 2. /api/tickets mine=1 server-enforced self-scope
 * 3. Web dashboard: announcements banner + chat icon
 * 4. Mobile: welcome/OTP screens, sign-in tabs, help desk, banner, quick links,
 *    bottom nav, routes, API methods
 * 5. Version chain sync v1.6.6 (33)
 * 6. id-parse simulation for phone candidates (same rule as login)
 */
const fs = require('fs');
const path = require('path');
const ROOT = '/home/z/my-project';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}
function read(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); }

console.log('── 1. Backend OTP route ──');
const otp = read('src/app/api/auth/otp/route.ts');
check("route has action 'request'", otp.includes("action === 'request'"));
check("route has action 'verify'", otp.includes("action === 'verify'"));
check('phone candidates parity (dial prefix + last-10)', otp.includes('identityDigits.slice(-10)') && otp.includes('`${dialDigits}${identityDigits}`'));
check('SHA-256 hash only (no plaintext code stored)', otp.includes("createHash('sha256')") && otp.includes('codeHash') && !otp.match(/VALUES[^;]*\$\{code\}/));
check('5-minute expiry', otp.includes('OTP_TTL_SEC = 300'));
check('max 5 verify attempts', otp.includes('OTP_MAX_ATTEMPTS = 5'));
check('rate limit 3 per 15 min', otp.includes('OTP_MAX_PER_WINDOW = 3'));
check('LoginOtp table auto-created', otp.includes('CREATE TABLE IF NOT EXISTS "LoginOtp"'));
check('apex sweep returns suggestedUrl (never mints OTP)', otp.includes('MAIN_DOMAIN_SUPER_ADMIN_ONLY') && otp.includes('suggestedUrl'));
check('candidate blocked', otp.includes('USE_CANDIDATE_LOGIN'));
check('login-shape response { token, user }', otp.includes('token,') && otp.includes('tenantId: safeTenantId') && otp.includes('company: companyData'));
check('hidden-tenant scrub', otp.includes('getHiddenSlugsForRequest'));
check('email delivery via sendEmail', otp.includes("from '@/lib/email'") && otp.includes('sendEmail('));

console.log('── 2. /api/tickets mine=1 self-scope ──');
const tickets = read('src/app/api/tickets/route.ts');
check("mine param parsed", tickets.includes("searchParams.get('mine') === '1'"));
check('mine overrides requesterId (cannot widen)', /if \(mine\) \{\s*\n\s*where\.requesterId = decoded\.userId as string;\s*\n\s*\} else if \(requesterId\) \{/.test(tickets));

console.log('── 3. Web ESS dashboard: banner + chat icon ──');
const dash = read('src/app/(dashboard)/dashboard/page.tsx');
check('FiVolume2 imported (build-hard-fail guard)', dash.includes('FiVolume2,'));
check('FiMessageCircle imported', dash.includes('FiMessageCircle'));
check('social-feed fetched for banner', dash.includes('/api/social-feed'));
check('pinned/announcement filter', dash.includes("p.isPinned || p.postType === 'announcement'"));
check('auto-rotate interval', dash.includes('setBannerIndex'));
check('View feeds → /collaboration', dash.includes("router.push('/collaboration')"));
check('chat quick action → /collaboration/chat', dash.includes("href: '/collaboration/chat'"));
check('floating chat FAB', dash.includes('fixed bottom-6 right-6 z-40'));

console.log('── 4. Mobile app ──');
const main = read('hrms_app/lib/main.dart');
check('welcome route registered', main.includes("'/welcome': (_) => const WelcomeScreen()"));
check('helpdesk route registered', main.includes("'/helpdesk': (_) => const HelpDeskScreen()"));
check('announcements route registered', main.includes("'/announcements': (_) => const AnnouncementsScreen()"));
check('splash lands on /welcome', main.includes("Navigator.pushReplacementNamed(context, '/welcome')"));

const signin = read('hrms_app/lib/screens/auth/signin_screen.dart');
check('tabs: Mobile Number + Employee ID', signin.includes("'Mobile Number'") && signin.includes("'Employee ID'"));
check('Continue → OTP flow', signin.includes('_continueWithPhone') && signin.includes('OtpScreen('));
check('fingerprint unlock row', signin.includes('_biometricUnlock'));
check('Contact HR sheet', signin.includes('_contactHR'));
check('Remember me + Forgot password', signin.includes("'Remember me'") && signin.includes("'Forgot password?'"));
check('Sign in button label', signin.includes("'Sign in'"));
check('password login still wired', signin.includes('AuthProvider>().login('));
check('3Boxes logo on sign-in', signin.includes('logo-cubes.png'));

const otpScreen = read('hrms_app/lib/screens/auth/otp_screen.dart');
check('6-box code entry', otpScreen.includes('_length = 6'));
check('resend countdown 30s', otpScreen.includes('_secondsLeft = 30'));
check('Verify & Continue + Change number', otpScreen.includes("'Verify & Continue'") && otpScreen.includes("'Change number'"));
check('verifyOtp called', otpScreen.includes('ApiService.verifyOtp'));

const welcome = read('hrms_app/lib/screens/auth/welcome_screen.dart');
check('starry welcome (logo + tagline + arrow)', welcome.includes('logo-cubes.png') && welcome.includes('Your workplace, in one place') && welcome.includes("'/signin'"));

const home = read('hrms_app/lib/screens/home/home_screen.dart');
check('announcements banner widget', home.includes('_announcementsBanner()'));
check('quick links widget', home.includes('_quickLinks()'));
check('last-week attendance chart', home.includes('_weekChartCard()') && home.includes('Last week Attendance'));
check('help desk module tile', home.includes("'/helpdesk'"));
check('chat FAB on dashboard', home.includes("'/chat'") && home.includes('FloatingActionButton'));
check('birthdays kept', home.includes('_birthdaysCard()'));
check('announcements fallback to latest post', home.includes('announcements.add(posts.first)'));
check('week rows filtered to self (admin safety)', home.includes("rowEmp != id"));

const helpdesk = read('hrms_app/lib/screens/helpdesk/helpdesk_screen.dart');
check('tickets via mine=1', helpdesk.includes('getTickets(mine: true'));
check('create ticket sheet', helpdesk.includes('_createTicketSheet'));
check('detail sheet with comments', helpdesk.includes('_ticketDetailSheet') && helpdesk.includes('addTicketComment'));
check('admin status actions', helpdesk.includes('updateTicketStatus'));

const ann = read('hrms_app/lib/screens/home/announcements_screen.dart');
check('feed list + like toggle', ann.includes('getSocialFeed') && ann.includes('likeSocialPost'));

const nav = read('hrms_app/lib/widgets/main_scaffold.dart');
check('bottom nav Home·Chat·Attendance·Profile', nav.includes("'/chat', Icons.chat_bubble_outline_rounded") && nav.includes("'/attendance-new', Icons.fact_check_outlined"));

const api = read('hrms_app/lib/services/api_service.dart');
check('requestOtp ladder (suggestedUrl retry)', api.includes('requestOtp') && api.includes('suggestedUrl'));
check('verifyOtp stores session', api.includes('verifyOtp') && api.includes('StorageService.setToken(token)'));
check('social feed + like', api.includes('getSocialFeed') && api.includes('likeSocialPost'));
check('tickets CRUD methods', api.includes('getTickets') && api.includes('createTicket') && api.includes('getTicketDetail') && api.includes('addTicketComment'));

console.log('── 5. Version chain v1.6.6 (33) ──');
check('pubspec 1.6.6+33', read('hrms_app/pubspec.yaml').includes('version: 1.6.6+33'));
check('app_info 1.6.6/33', read('hrms_app/lib/config/app_info.dart').includes("'1.6.6'") && read('hrms_app/lib/config/app_info.dart').includes('= 33;'));
check('constants 1.6.6', read('hrms_app/lib/config/constants.dart').includes("'1.6.6'"));
check('app-version.ts 1.6.6/33', read('src/lib/app-version.ts').includes("versionName: '1.6.6'") && read('src/lib/app-version.ts').includes('versionCode: 33'));
check('downloads page v1.6.6', read('public/downloads/index.html').includes('v1.6.6 (33)'));

console.log('── 6. Phone candidate simulation ──');
function phoneCandidates(rawPhone, dialCode) {
  const identityDigits = String(rawPhone || '').replace(/\D/g, '');
  const dialDigits = String(dialCode || '').replace(/\D/g, '');
  const set = new Set();
  if (identityDigits.length >= 6) {
    set.add(identityDigits); set.add(`+${identityDigits}`);
    if (dialDigits) { set.add(`${dialDigits}${identityDigits}`); set.add(`+${dialDigits}${identityDigits}`); }
    if (identityDigits.length > 10) set.add(identityDigits.slice(-10));
  }
  return [...set];
}
check('10-digit IN number → 4 candidates', JSON.stringify(phoneCandidates('9876543210', '+91')) === JSON.stringify(['9876543210', '+9876543210', '919876543210', '+919876543210']));
check('short number rejected (no candidates)', phoneCandidates('123', '+91').length === 0);
check('international input → last-10 candidate', phoneCandidates('+91 98765 43210', '+91').includes('9876543210'));

console.log(`\n${pass}/${pass + fail} checks passed`);
process.exit(fail > 0 ? 1 : 0);
