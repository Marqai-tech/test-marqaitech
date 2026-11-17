import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config/api_config.dart';
import '../config/app_info.dart';

/// Task 110 — in-app self-update.
///
/// The #1 reason users kept seeing "errors in all the modules" was running a
/// STALE APK (pre-1.0.5 builds had brittle parsers that crashed on the live
/// payloads), then upgrading OVER the old install kept the dead session.
/// This service makes the installed build discoverable and updatable from
/// inside the app:
///   • GET /api/public/app-version (public, works before login) returns the
///     platform's latest release info.
///   • If the platform's versionCode is newer than the installed one, the
///     sign-in screen and home screen surface a "Download & install" action
///     that opens the APK straight from the user's own workspace link.
class UpdateService {
  static Map<String, dynamic>? _latest;

  /// Latest release info from the current workspace, or null when the
  /// check fails (offline, old platform build without the endpoint…).
  static Map<String, dynamic>? get latest => _latest;

  static int get _latestCode {
    final v = _latest?['versionCode'];
    return v is int ? v : (v is num ? v.toInt() : int.tryParse('$v') ?? 0);
  }

  /// True when the platform reports a newer build than the installed one.
  static bool get updateAvailable => _latestCode > AppInfo.versionCode;

  static String get latestVersionName =>
      '${_latest?['versionName'] ?? '?'} ($_latestCode)';

  /// Fetch the latest release info from the current workspace.
  /// Never throws — returns false on any failure.
  static Future<bool> checkForUpdate() async {
    try {
      final res = await http
          .get(
            Uri.parse('${ApiConfig.baseUrl}/api/public/app-version'),
            headers: const {'Content-Type': 'application/json'},
          )
          .timeout(const Duration(seconds: 12));
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        if (data is Map<String, dynamic>) {
          _latest = data;
          return true;
        }
      }
    } catch (_) {/* offline or endpoint missing — treat as no info */}
    return false;
  }

  /// Best URL to download the latest APK: prefer the workspace-reported
  /// versioned URL from /api/public/app-version; fall back to the stable
  /// unversioned alias on the current workspace.
  static String apkUrlToInstall() {
    final u = _latest?['apkUrl'];
    if (u is String && u.isNotEmpty) return u;
    return AppInfo.apkUrlOnWorkspace(ApiConfig.baseUrl);
  }

  /// Reset (e.g. on logout) so the next check re-fetches for the new
  /// workspace.
  static void reset() => _latest = null;
}
