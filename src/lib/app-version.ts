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
  versionName: '1.5.5',
  versionCode: 22,
  apkUrl: '/downloads/3boxes-hrms-mobile-v1.5.5.apk',
  updatedAt: '2026-10-22',
  notes:
    'UPDATE: Chat governance — only HR/tenant admins (or staff you appoint in chat settings) can create, rename or delete group chats; every user can delete their direct chats to free space; deleted history stays auditable by Super Admin. Installs over v1.5.4 — no uninstall needed.',
};
