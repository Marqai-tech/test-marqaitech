/// Task 110 — app release identity.
///
/// MUST stay in sync with:
///   • pubspec.yaml  `version: <versionName>+<versionCode>`
///   • src/lib/app-version.ts (web platform's copy, consumed by the login
///     page + /api/public/app-version)
///
/// The sign-in screen shows this so the user always knows WHICH build they
/// run, and the updater compares [versionCode] against the platform's
/// latest release to offer a one-tap download.
class AppInfo {
  static const String versionName = '1.0.8';
  static const int versionCode = 9;
  static const String appName = '3 Boxes HRMS';

  /// Latest-APK URL on the CURRENT workspace (tenant link, apex or demo).
  static String apkUrlOnWorkspace(String baseUrl) =>
      '$baseUrl/downloads/3boxes-hrms-mobile.apk';

  static String get label => '$appName v$versionName ($versionCode)';
}
