// Task 110 — single source of truth for the mobile app release.
// Bump BOTH fields on every APK release (must match hrms_app/pubspec.yaml
// version: <versionName>+<versionCode>). The web login page and the app's
// in-app updater both read this.
export const APP_RELEASE = {
  versionName: '1.0.8',
  versionCode: 9,
  apkUrl: '/downloads/3boxes-hrms-mobile.apk',
  updatedAt: '2026-10-19',
  notes:
    'Session-expiry recovery (auto sign-out to login instead of module errors), employee-detail fix, login-page APK download & self-update, connection diagnostics.',
};
