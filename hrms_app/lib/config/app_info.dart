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
///
/// Task 156 — v1.9.0 (37): the NATIVE app now ships the PhonePe-style
/// raised violet AI Assistant centre dock (Home · Chat · [AI] · Attendance ·
/// Profile) backed by a NATIVE AI chat screen on /api/ai-chat, plus the
/// in-app "Download an app edition" sheet offering BOTH Android editions
/// (this native build and the Lite WebView shell). The app is now
/// downloadable as 3boxes-hrms-native-v1.9.0.apk (alias
/// 3boxes-hrms-native.apk); the Lite shell ships as 3boxes-hrms-mobile-*.apk.
/// Both share applicationId com.threeboxes.hrms_app + the permanent signing
/// key and are at versionCode 37, so users can switch editions freely —
/// either installs right over the other.
class AppInfo {
  static const String versionName = '1.9.0';
  static const int versionCode = 37;
  static const String appName = '3 Boxes HRMS';

  /// Latest-APK URL on the CURRENT workspace (tenant link, apex or demo).
  /// Unversioned NATIVE alias that always serves the latest native release;
  /// the in-app updater prefers the versioned URL reported by
  /// /api/public/app-version (see UpdateService.apkUrlToInstall).
  /// (Task 156 — previously pointed at the shared mobile alias, which now
  /// serves the LITE WebView shell; the native updater must stay native.)
  static String apkUrlOnWorkspace(String baseUrl) =>
      '$baseUrl/downloads/3boxes-hrms-native.apk';

  static String get label => '$appName v$versionName ($versionCode)';
}
