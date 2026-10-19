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
  versionName: '1.2.0',
  versionCode: 12,
  apkUrl: '/downloads/3boxes-hrms-mobile-v1.2.0.apk',
  updatedAt: '2026-10-19',
  notes:
    'FIXED the root cause of "errors in all modules + no token stored": the workspace auto-detect could land on a /login page URL, so the app signed in with no session. Login now always lands on the real API, the connection check reports truthfully, and the workspace self-heals on first launch. No uninstall needed — upgrades cleanly over v1.0.9.',
};
