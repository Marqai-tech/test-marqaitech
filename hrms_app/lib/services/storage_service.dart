import 'package:shared_preferences/shared_preferences.dart';

class StorageService {
  static SharedPreferences? _prefs;

  static Future<void> init() async {
    _prefs = await SharedPreferences.getInstance();
  }

  static SharedPreferences get prefs {
    if (_prefs == null) throw Exception('StorageService not initialized');
    return _prefs!;
  }

  // Token
  static Future<void> setToken(String token) async => await prefs.setString('auth_token', token);
  static String? getToken() => prefs.getString('auth_token');
  static Future<void> removeToken() async => await prefs.remove('auth_token');

  // User data
  static Future<void> setUserData(String data) async => await prefs.setString('user_data', data);
  static String? getUserData() => prefs.getString('user_data');
  static Future<void> removeUserData() async => await prefs.remove('user_data');

  // Remember me
  static Future<void> setRememberMe(bool value) async => await prefs.setBool('remember_me', value);
  static bool getRememberMe() => prefs.getBool('remember_me') ?? false;
  static Future<void> setRememberedEmail(String email) async => await prefs.setString('remembered_email', email);
  static String? getRememberedEmail() => prefs.getString('remembered_email');

  // Task 142 — remember-me stores WHICH login tab the value belongs to, so
  // a saved Employee ID lands back in the Employee ID field and a saved
  // mobile number (with its dial code) lands back in the phone field.
  // 'identity' = Employee ID/email tab, 'phone' = Mobile Number tab.
  static Future<void> setRememberedKind(String kind) async => await prefs.setString('remembered_kind', kind);
  static String getRememberedKind() => prefs.getString('remembered_kind') ?? 'identity';
  static Future<void> setRememberedDial(String dial) async => await prefs.setString('remembered_dial', dial);
  static String getRememberedDial() => prefs.getString('remembered_dial') ?? '+91';
  /// Task 142 (main agent) — Remember me also auto-saves the PASSWORD so the
  /// next launch prefills the complete login (user-requested "auto saving").
  static Future<void> setRememberedPassword(String password) async => await prefs.setString('remembered_password', password);
  static String? getRememberedPassword() => prefs.getString('remembered_password');

  // Workspace (the HRMS server this session talks to, e.g. the tenant
  // subdomain). Persisted so the stored token keeps working after an app
  // restart — without it every launch silently reset to the demo server.
  static Future<void> setWorkspaceUrl(String url) async => await prefs.setString('workspace_url', url);
  static String? getWorkspaceUrl() => prefs.getString('workspace_url');
  static Future<void> removeWorkspaceUrl() async => await prefs.remove('workspace_url');

  // Theme
  static Future<void> setThemeMode(String mode) async => await prefs.setString('theme_mode', mode);
  static String getThemeMode() => prefs.getString('theme_mode') ?? 'light';

  // Notifications
  static Future<void> setFcmToken(String token) async => await prefs.setString('fcm_token', token);
  static String? getFcmToken() => prefs.getString('fcm_token');

  // Clear all
  static Future<void> clearAll() async {
    await prefs.remove('auth_token');
    await prefs.remove('user_data');
    await prefs.remove('remember_me');
    await prefs.remove('remembered_email');
    await prefs.remove('remembered_kind');
    await prefs.remove('remembered_dial');
    await prefs.remove('remembered_password');
    await prefs.remove('workspace_url');
  }

  static bool get isLoggedIn => getToken() != null;
}
