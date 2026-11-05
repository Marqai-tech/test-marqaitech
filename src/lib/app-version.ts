// Task 110b — single source of truth for the mobile app releases.
// Task 156 — the platform now ships TWO Android editions of the same
// workspace app (applicationId com.threeboxes.hrms_app, SAME permanent
// signing key, SAME versionCode) so users can install EITHER and switch
// freely — each installs right over the other:
//
//   1) NATIVE app  (hrms_app/ sources)      — full Flutter UI with the
//      PhonePe-style raised violet AI Assistant centre dock + native chat on
//      /api/ai-chat. Files: 3boxes-hrms-native-v<ver>.apk (+ alias
//      3boxes-hrms-native.apk).
//   2) LITE WebView shell (mobile-app/ sources) — native sign-in + a WebView
//      that renders the LIVE tenant web workspace, so every deployed web
//      feature (including the web footer AI dock) appears in the app
//      instantly. Files: 3boxes-hrms-mobile-v<ver>.apk (+ alias
//      3boxes-hrms-mobile.apk).
//
// Bump BOTH editions together (same versionCode) on every APK release so
// users can always move in either direction. The web login page and both
// apps' in-app updaters read from here.
//
// v1.9.0 (37) NATIVE — NEW: PhonePe-style violet AI dock (Home · Chat ·
// [AI Assistant] · Attendance · Profile) + native AI Assistant chat screen,
// in-app one-tap updater and a "Download an app edition" sheet listing both
// editions.
// v1.8.1 (37) LITE SHELL — same live-workspace WebView app released as
// v1.8.0 (36), bumped to versionCode 37 purely so it remains installable
// over (and under) the native 37 build — users can switch editions freely.
// Task 157 — the LITE shell's launcher icon (which still shipped the default
// Flutter logo) is now the 3 Boxes HRMS cubes logo re-coloured ROYAL BLUE, so
// the shell edition is instantly distinguishable from the native app's
// green-icon edition in the device drawer.

export const NATIVE_APP_RELEASE = {
  versionName: '1.9.0',
  versionCode: 37,
  apkUrl: '/downloads/3boxes-hrms-native-v1.9.0.apk',
  updatedAt: '2026-10-26',
  notes:
    'UPDATE v1.9.0 — the AI Assistant now lives in your bottom dock: a raised violet AI button centred between Home/Chat and Attendance/Profile, exactly like PhonePe. Tap it to chat with the 3Boxes AI about leave, attendance, payroll and policies — right inside the app. Check for updates now downloads and installs straight from the app, and Settings can download the Lite WebView edition too. Installs right over v1.7.x / v1.8.x — no uninstall needed.',
};

export const SHELL_APP_RELEASE = {
  versionName: '1.8.1',
  versionCode: 37,
  apkUrl: '/downloads/3boxes-hrms-mobile-v1.8.1.apk',
  updatedAt: '2026-10-26',
  notes:
    'LITE APP v1.8.1 — new app icon: this edition now carries the 3 Boxes HRMS cubes logo in royal blue, so it is easy to tell apart from the Native edition\'s green icon. The light WebView edition renders your live company workspace, so everything you see on the web — dashboard, attendance, payroll, chats, AI Assistant and the centred violet AI button in the bottom dock — works in the app the moment it ships on the web. Same version code as the Native app so you can switch between the two editions freely — no uninstall needed.',
};

// Back-compatible default release = the NATIVE app (the build whose in-app
// updater consumes /api/public/app-version top-level fields). The login page
// and download centre use NATIVE_APP_RELEASE + SHELL_APP_RELEASE explicitly.
export const APP_RELEASE = {
  ...NATIVE_APP_RELEASE,
  // Explicit aliases for readability at call sites.
  edition: 'native' as const,
  native: NATIVE_APP_RELEASE,
  shell: SHELL_APP_RELEASE,
};
