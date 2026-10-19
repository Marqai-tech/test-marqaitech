/// Task 110b — app release identity.
///
/// MUST stay in sync with:
///   • pubspec.yaml  `version: <versionName>+<versionCode>`
///   • src/lib/app-version.ts (web platform's copy, consumed by the login
///     page + /api/public/app-version)
///   • hrms_app/lib/config/constants.dart appVersion
///
/// v1.0.9 (10) — first build signed with the PERMANENT release keystore
/// (hrms_app/android/key.properties + app/release-key.jks). Older installs
/// (signed with throwaway sandbox debug keys) need a ONE-TIME uninstall
/// before this build can be installed; the web login page explains this.
/// The sign-in screen shows this so the user always knows WHICH build they
/// run. APK downloads are NOT offered in-app any more (user request) — the
/// web login page is the single download source.
class AppInfo {
  static const String versionName = '1.0.9';
  static const int versionCode = 10;
  static const String appName = '3 Boxes HRMS';

  /// Latest-APK URL on the CURRENT workspace (tenant link, apex or demo).
  /// Unversioned alias that always serves the latest release; the in-app
  /// updater prefers the versioned URL reported by /api/public/app-version
  /// (see UpdateService.apkUrlToInstall).
  static String apkUrlOnWorkspace(String baseUrl) =>
      '$baseUrl/downloads/3boxes-hrms-mobile.apk';

  static String get label => '$appName v$versionName ($versionCode)';
}
