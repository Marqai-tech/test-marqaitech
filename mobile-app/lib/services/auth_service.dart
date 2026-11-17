import 'package:shared_preferences/shared_preferences.dart';

class AuthService {
  static const String _tokenKey = 'tb_token';
  static const String _serverUrlKey = 'server_url';

  static Future<String?> getToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_tokenKey);
  }

  static Future<void> setToken(String token) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_tokenKey, token);
  }

  static Future<void> clearToken() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_tokenKey);
  }

  static Future<bool> isLoggedIn() async {
    final token = await getToken();
    return token != null && token.isNotEmpty;
  }

  /// Task 152 — default to the LIVE production tenant (was the demo link
  /// nexus-hrms-mu.vercel.app, which routed mobile-raised tickets into the
  /// demo tenant database where neither the web nor the mobile ticketing
  /// list could see them).
  static const String defaultServerUrl = 'https://marqaitechgroup.3boxeshrms.com';

  static Future<String> getServerUrl() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_serverUrlKey) ?? defaultServerUrl;
  }

  static Future<void> setServerUrl(String url) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_serverUrlKey, url);
  }

  /// Task 154 — onboarding carousel is shown ONCE (per install) before the
  /// login screen, per the reference design images.
  static const String _onboardingDoneKey = 'onboarding_done';

  static Future<bool> isOnboardingDone() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(_onboardingDoneKey) ?? false;
  }

  static Future<void> setOnboardingDone() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_onboardingDoneKey, true);
  }
}
