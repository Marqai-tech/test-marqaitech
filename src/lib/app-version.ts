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
  versionName: '1.4.1',
  versionCode: 15,
  apkUrl: '/downloads/3boxes-hrms-mobile-v1.4.1.apk',
  updatedAt: '2026-10-20',
  notes:
    'FIX: projects you create now open correctly for YOUR account — the creator is set as project manager, so opening the project and adding tasks works right away (managers and employees included). Task creation is now properly permission-checked. Installs over v1.4.0 — no uninstall needed.',
};
