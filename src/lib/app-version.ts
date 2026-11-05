// Task 110b — single source of truth for the mobile app release.
// Bump BOTH fields on every APK release (must match mobile-app/pubspec.yaml
// version: <versionName>+<versionCode>). The web login page and the app's
// in-app updater both read this.
//
// v1.0.9 (10) ships a PERMANENT release signing key (key.properties +
// release-key.jks, committed) — previous builds were signed with whatever
// debug keystore the build sandbox happened to generate, so users could never
// upgrade over an existing install (signature mismatch = silent "App not
// installed" = the device keeps running the old, erroring build). One-time
// uninstall of any older install is required; the web login page explains it.
// The in-app login-page download link was REMOVED per user request — the web
// login page is now the only download source.
//
// Task 145 — v1.7.1 (35) was the last NATIVE release (hrms_app sources).
//
// Task 155 — v1.8.0 (36) is the new WebView-shell app (mobile-app sources)
// with applicationId aligned to com.threeboxes.hrms_app + the SAME permanent
// signing key, so it installs right over v1.7.1 as an update. It ships the
// first-launch onboarding carousel + rebuilt native login (Task 154) and a
// shell that renders the LIVE tenant web app — so the app now shows every
// deployed web feature automatically, including the PhonePe-style footer dock
// with the raised, centred violet AI Assistant button.
export const APP_RELEASE = {
  versionName: '1.8.0',
  versionCode: 36,
  apkUrl: '/downloads/3boxes-hrms-mobile-v1.8.0.apk',
  updatedAt: '2026-10-26',
  notes:
    'UPDATE v1.8.0 — fresh new app experience: a guided first-launch intro carousel and a redesigned native sign-in screen. The app now renders your live company workspace, so everything you see on the web — dashboard, attendance, payroll, chats, AI Assistant and the new centred violet AI button in the bottom dock — works in the app the moment it ships. Installs right over v1.6.x / v1.7.x — no uninstall needed.',
};
