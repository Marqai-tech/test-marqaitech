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
  versionName: '1.4.0',
  versionCode: 14,
  apkUrl: '/downloads/3boxes-hrms-mobile-v1.4.0.apk',
  updatedAt: '2026-10-20',
  notes:
    'NEW: Project Management module on mobile — projects list with live progress, tasks with status moves (To Do / In Progress / Review / Done), milestones and team per project, create projects and tasks right from the phone; everything stays in sync with the web app in real time. Installs over v1.3.0 — no uninstall needed.',
};
