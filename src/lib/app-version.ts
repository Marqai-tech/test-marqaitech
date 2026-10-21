// Task 110b — single source of truth for the mobile app release.
// Bump BOTH fields on every APK release (must match hrms_app/pubspec.yaml
// version: <versionName>+<versionCode>). The web login page and the app's
// in-app updater both read this.
//
// v1.0.9 (10) ships a PERMANENT release signing key (hrms_app key.properties +
// release-key.jks, committed) — previous builds were signed with whatever
// debug keystore the build sandbox happened to generate, so users could never
// upgrade over an existing install (signature mismatch = silent "App not
// installed" = the device keeps running the old, erroring build). One-time
// uninstall of any older install is required; the web login page explains it.
// The in-app login-page download link was REMOVED per user request — the web
// login page is now the only download source.
export const APP_RELEASE = {
  versionName: '1.5.2',
  versionCode: 19,
  apkUrl: '/downloads/3boxes-hrms-mobile-v1.5.2.apk',
  updatedAt: '2026-10-21',
  notes:
    'UPDATE: FIXED the empty chat screen — tapping a teammate now opens the conversation properly, with one-tap greeting shortcuts on fresh chats. Installs over v1.5.1 — no uninstall needed.',
};
