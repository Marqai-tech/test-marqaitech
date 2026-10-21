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
  versionName: '1.5.3',
  versionCode: 20,
  apkUrl: '/downloads/3boxes-hrms-mobile-v1.5.3.apk',
  updatedAt: '2026-10-21',
  notes:
    'UPDATE: ADD MEMBERS to group chats after creation (person-add button inside any group chat) + terminated/resigned employees are now hidden from the Chat, Leave, Attendance and Projects modules. Installs over v1.5.2 — no uninstall needed.',
};
