import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../config/api_config.dart';
import '../models/user.dart';
import 'storage_service.dart';

class ApiService {
  static String? _token;

  /// The original super-admin token for this session. When a super admin
  /// switches into a tenant, _token becomes the tenant token but we keep the
  /// super-admin token in memory so the tenant picker can be re-opened
  /// without logging in again (mirrors the web switcher session).
  static String? superAdminToken;

  static void setToken(String token) => _token = token;
  static String? get token => _token;
  static void clearToken() => _token = null;

  static Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        if (_token != null) 'Authorization': 'Bearer $_token',
      };

  static Future<http.Response> _get(String url, {Map<String, String>? queryParams}) async {
    final uri = Uri.parse(url).replace(queryParameters: queryParams);
    return http.get(uri, headers: _headers).timeout(ApiConfig.timeout);
  }

  static Future<http.Response> _post(String url, Map<String, dynamic> body) async {
    return http.post(Uri.parse(url), headers: _headers, body: jsonEncode(body)).timeout(ApiConfig.timeout);
  }

  static Future<http.Response> _put(String url, Map<String, dynamic> body) async {
    return http.put(Uri.parse(url), headers: _headers, body: jsonEncode(body)).timeout(ApiConfig.timeout);
  }

  static Future<http.Response> _delete(String url) async {
    return http.delete(Uri.parse(url), headers: _headers).timeout(ApiConfig.timeout);
  }

  static Future<http.Response> _patch(String url, Map<String, dynamic> body) async {
    return http.patch(Uri.parse(url), headers: _headers, body: jsonEncode(body)).timeout(ApiConfig.timeout);
  }

  // ============ Auth ============

  /// POST to a host's /api/auth/login and return (status, body-map).
  /// Never throws for non-2xx; tolerates non-JSON error pages.
  static Future<(int, Map<String, dynamic>)> _loginAttempt(String baseUrl, String email, String password) async {
    try {
      final response = await http
          .post(
            Uri.parse('$baseUrl/api/auth/login'),
            headers: const {'Content-Type': 'application/json'},
            body: jsonEncode({'email': email, 'password': password}),
          )
          .timeout(ApiConfig.timeout);
      Map<String, dynamic> data;
      try {
        data = jsonDecode(response.body) as Map<String, dynamic>;
      } catch (_) {
        data = {'error': 'Server returned an unexpected response (${response.statusCode})'};
      }
      return (response.statusCode, data);
    } catch (_) {
      return (0, {'error': 'Could not reach $baseUrl'});
    }
  }

  /// Smart workspace-aware login.
  ///
  /// Handles every 3Boxes workspace type from ONE form:
  ///  1. Try the configured workspace (demo default / typed URL / persisted).
  ///  2. On failure, try the live platform apex — it validates super admins
  ///     directly and, for tenant users, answers 403 with `suggestedUrl`
  ///     pointing at their company subdomain.
  ///  3. Auto-retry at the suggested tenant subdomain.
  /// The workspace that finally succeeds is persisted so the session (and
  /// future launches) keep talking to the right server.
  static Future<Map<String, dynamic>> login(String email, String password) async {
    final attempted = <String>{};
    final triedUrls = <String>[];
    var lastStatus = 0;
    var lastError = 'Login failed';

    String current = ApiConfig.baseUrl;
    while (attempted.length < 3) {
      attempted.add(current);
      triedUrls.add(current);
      final (status, data) = await _loginAttempt(current, email, password);
      lastStatus = status;
      lastError = (data['error'] ?? data['message'] ?? lastError).toString();

      if (status == 200) {
        final token = data['token'] ?? data['data']?['token'];
        if (token != null) {
          setToken(token);
          await StorageService.setToken(token);
          final userJson = data['user'] ?? data['data']?['user'] ?? data['data'];
          if (userJson != null) {
            await StorageService.setUserData(jsonEncode(userJson));
          }
        }
        // Remember the workspace that actually authenticated this user.
        ApiConfig.setBaseUrl(current);
        return data;
      }

      // Platform apex tells tenant users exactly where their workspace is.
      final suggested = data['suggestedUrl'] as String?;
      if (suggested != null && suggested.isNotEmpty) {
        final target = ApiConfig.normalizeWorkspaceUrl(suggested) ?? suggested;
        if (!attempted.contains(target)) {
          triedUrls.add('↳ redirect: $target');
          current = target;
          continue;
        }
      }

      // Fallback: the configured workspace failed — ask the live platform.
      if (current != ApiConfig.liveBaseUrl) {
        current = ApiConfig.liveBaseUrl;
        continue;
      }
      break;
    }

    throw AuthException(lastStatus, lastError, triedUrls: triedUrls);
  }

  static Future<UserModel?> getStoredUser() async {
    final data = StorageService.getUserData();
    if (data == null) return null;
    try {
      return UserModel.fromJson(jsonDecode(data));
    } catch (_) {
      return null;
    }
  }

  static Future<void> logout() async {
    clearToken();
    superAdminToken = null;
    await StorageService.clearAll();
  }

  // ============ Super admin: tenant directory + switching ============

  /// GET /api/tenants — super-admin-only directory of tenants.
  /// When re-opening the picker after a switch, the caller temporarily
  /// restores the super-admin token via [useSuperAdminToken].
  static Future<List<dynamic>> getTenants({int limit = 100}) async {
    final response = await _get(ApiConfig.tenants, queryParams: {'limit': '$limit'});
    final data = jsonDecode(response.body);
    if (response.statusCode == 200) {
      return (data['tenants'] ?? data['data']?['tenants'] ?? data['data'] ?? []) as List<dynamic>;
    }
    throw Exception(data['error'] ?? 'Failed to load tenants');
  }

  /// POST /api/auth/switch-tenant — exchange the super-admin token for a
  /// tenant_admin token scoped to [tenantId]. The new token + user are
  /// persisted, so every module API afterwards resolves the tenant DB via
  /// the JWT tenantId (identical to the web super-admin switcher).
  static Future<Map<String, dynamic>> switchTenant(String tenantId) async {
    final response = await _post(ApiConfig.switchTenant, {'tenantId': tenantId});
    final data = jsonDecode(response.body);
    if (response.statusCode == 200) {
      final newToken = data['token'];
      if (newToken == null) throw Exception('Switch response did not include a token');
      setToken(newToken);
      await StorageService.setToken(newToken);
      final userJson = data['user'];
      if (userJson != null) {
        await StorageService.setUserData(jsonEncode(userJson));
      }
      return data;
    }
    throw Exception(data['error'] ?? 'Failed to switch tenant');
  }

  /// Temporarily point API calls at the super-admin token (used by the
  /// tenant picker when re-opened during a switched session).
  static void useSuperAdminToken() {
    final sa = superAdminToken;
    if (sa != null && sa.isNotEmpty) setToken(sa);
  }

  // ============ Dashboard ============
  static Future<Map<String, dynamic>> getDashboard() async {
    final response = await _get(ApiConfig.dashboard);
    final data = jsonDecode(response.body);
    if (response.statusCode == 200) return data['data'] ?? data;
    throw Exception(data['error'] ?? 'Failed to load dashboard');
  }

  // ============ Employees ============
  static Future<Map<String, dynamic>> getEmployees({int page = 1, int limit = 20, String? search, String? status}) async {
    final params = <String, String>{'page': '$page', 'limit': '$limit'};
    if (search != null && search.isNotEmpty) params['search'] = search;
    if (status != null) params['status'] = status;
    final response = await _get(ApiConfig.employees, queryParams: params);
    final data = jsonDecode(response.body);
    if (response.statusCode == 200) return data;
    throw Exception(data['error'] ?? 'Failed to load employees');
  }

  static Future<Map<String, dynamic>> getEmployeeDetail(String id) async {
    final response = await _get(ApiConfig.employeeDetail(id));
    final data = jsonDecode(response.body);
    if (response.statusCode == 200) return data['data'] ?? data;
    throw Exception(data['error'] ?? 'Failed to load employee');
  }

  // ============ Leaves ============
  static Future<Map<String, dynamic>> getLeaves({int page = 1, String? status}) async {
    final params = <String, String>{'page': '$page'};
    if (status != null) params['status'] = status;
    final response = await _get(ApiConfig.leaves, queryParams: params);
    final data = jsonDecode(response.body);
    if (response.statusCode == 200) return data;
    throw Exception(data['error'] ?? 'Failed to load leaves');
  }

  static Future<Map<String, dynamic>> createLeave(Map<String, dynamic> leaveData) async {
    final response = await _post(ApiConfig.leaves, leaveData);
    final data = jsonDecode(response.body);
    if (response.statusCode == 200 || response.statusCode == 201) return data;
    throw Exception(data['error'] ?? data['message'] ?? 'Failed to create leave');
  }

  // ============ Attendance ============
  static Future<Map<String, dynamic>> getAttendance({String? date, int? month, int? year}) async {
    final params = <String, String>{};
    if (date != null) params['date'] = date;
    if (month != null) params['month'] = '$month';
    if (year != null) params['year'] = '$year';
    final response = await _get(ApiConfig.attendance, queryParams: params);
    final data = jsonDecode(response.body);
    if (response.statusCode == 200) return data;
    throw Exception(data['error'] ?? 'Failed to load attendance');
  }

  // ============ Companies ============
  static Future<Map<String, dynamic>> getCompanies() async {
    final response = await _get(ApiConfig.companies);
    final data = jsonDecode(response.body);
    if (response.statusCode == 200) return data;
    throw Exception(data['error'] ?? 'Failed to load companies');
  }

  // ============ Reports ============
  static Future<Map<String, dynamic>> exportReport(String reportType, String format, {String? startDate, String? endDate}) async {
    final params = <String, String>{'type': reportType, 'format': format};
    if (startDate != null) params['startDate'] = startDate;
    if (endDate != null) params['endDate'] = endDate;
    final response = await _get(ApiConfig.reportsExport, queryParams: params);
    final data = jsonDecode(response.body);
    if (response.statusCode == 200) return data;
    throw Exception(data['error'] ?? 'Failed to export report');
  }

  // ============ Tenant Config ============
  static Future<Map<String, dynamic>> getTenantConfiguration() async {
    final response = await _get(ApiConfig.tenantConfiguration);
    final data = jsonDecode(response.body);
    if (response.statusCode == 200) return data['data'] ?? data;
    throw Exception(data['error'] ?? 'Failed to load configuration');
  }

  // ============ Notifications ============
  static Future<Map<String, dynamic>> getNotifications() async {
    final response = await _get(ApiConfig.notifications);
    final data = jsonDecode(response.body);
    if (response.statusCode == 200) return data;
    throw Exception(data['error'] ?? 'Failed to load notifications');
  }

  // ============ Payroll ============
  static Future<Map<String, dynamic>> getPayrolls({int page = 1, int limit = 20, String? month, String? year}) async {
    final params = <String, String>{'page': '$page', 'limit': '$limit'};
    if (month != null) params['month'] = month;
    if (year != null) params['year'] = year;
    final response = await _get(ApiConfig.payrolls, queryParams: params);
    final data = jsonDecode(response.body);
    if (response.statusCode == 200) return data;
    throw Exception(data['error'] ?? 'Failed to load payroll');
  }

  // ============ Attendance extras ============
  /// Today's own attendance summary (also resolves the own employeeId).
  static Future<Map<String, dynamic>> getMySummary() async {
    final response = await _get(ApiConfig.mySummary);
    final data = jsonDecode(response.body);
    if (response.statusCode == 200) return data;
    throw Exception(data['error'] ?? 'No employee profile linked to this account');
  }

  /// Canonical resolver for "which employee row belongs to the signed-in
  /// account". Order: (1) /attendance/my-summary (server now resolves linked
  /// admins too), (2) email match from the employee directory. Returns null
  /// when the account genuinely has no employee profile — callers show a
  /// friendly explanation instead of a raw error (Task 107).
  static Future<String?> resolveOwnEmployeeId() async {
    try {
      final s = await getMySummary();
      final id = (s['employee']?['id'] ?? s['employeeId'])?.toString();
      if (id != null && id.isNotEmpty) return id;
    } catch (_) {/* fall through to directory match */}
    try {
      final userData = StorageService.getUserData();
      if (userData == null) return null;
      final email = (jsonDecode(userData)['email'] ?? '').toString().toLowerCase();
      if (email.isEmpty) return null;
      final data = await getEmployees(limit: 200, search: email);
      final list = (data['employees'] ?? data['data'] ?? []) as List;
      for (final e in list) {
        if (e is Map && (e['email'] ?? '').toString().toLowerCase() == email) {
          final id = e['id']?.toString();
          if (id != null && id.isNotEmpty) return id;
        }
      }
    } catch (_) {/* unresolved */}
    return null;
  }

  /// GPS coordinates captured on the device for an attendance punch.
  /// The server stores lat/lng/accuracy on the Attendance row and the
  /// PunchEvent audit trail, and enforces the tenant's office geofence.
  static Future<Map<String, dynamic>> punch({
    required String employeeId,
    required String action,
    PunchGps? gps,
  }) async {
    final now = DateTime.now();
    final body = <String, dynamic>{
      'employeeId': employeeId,
      'action': action, // checkin | checkout | breakin | breakout
      'date': '${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}',
      'localTime': '${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}',
      // Task 69 fix: the server prefers utcTimestamp to avoid timezone
      // misinterpretation of localTime on UTC servers (Vercel).
      'utcTimestamp': now.toUtc().toIso8601String(),
      // Task 108: explicit remote channel. The punch API rejects mobile/web
      // punches unless the admin enabled this channel for the employee
      // (WFH pre-approval) — the server message is surfaced by the caller.
      'method': 'mobile',
      if (gps != null)
        'gps': {
          'lat': gps.lat,
          'lng': gps.lng,
          if (gps.accuracy != null) 'accuracy': gps.accuracy,
          // No label: the API then stores the raw coordinates in `location`.
        },
    };
    final response = await _post(ApiConfig.punch, body);
    final data = jsonDecode(response.body);
    if (response.statusCode == 200 || response.statusCode == 201) return data;
    throw PunchException(
      (data['error'] ?? 'Punch failed').toString(),
      code: data['code']?.toString(),
    );
  }

  // ============ Lookups ============
  static Future<List<dynamic>> getDepartments() async {
    final response = await _get(ApiConfig.departments);
    final data = jsonDecode(response.body);
    if (response.statusCode == 200) return data['data'] ?? data['departments'] ?? [];
    throw Exception('Failed to load departments');
  }

  static Future<List<dynamic>> getDesignations() async {
    final response = await _get(ApiConfig.designations);
    final data = jsonDecode(response.body);
    if (response.statusCode == 200) return data['data'] ?? data['designations'] ?? [];
    throw Exception('Failed to load designations');
  }

  // ============ Employee create ============
  static Future<Map<String, dynamic>> createEmployee(Map<String, dynamic> payload) async {
    final response = await _post(ApiConfig.employees, payload);
    final data = jsonDecode(response.body);
    if (response.statusCode == 200 || response.statusCode == 201) return data;
    throw Exception(data['error'] ?? 'Failed to create employee');
  }

  // ============ Leave actions ============
  static Future<Map<String, dynamic>> updateLeaveStatus({required String id, required String action, String? comment}) async {
    final response = await _patch(ApiConfig.leaves, {'id': id, 'action': action, 'comment': comment});
    final data = jsonDecode(response.body);
    if (response.statusCode == 200) return data;
    throw Exception(data['error'] ?? 'Failed to update leave');
  }
}

/// GPS coordinates captured on the device for an attendance punch.
/// The server stores lat/lng/accuracy on the Attendance row and the
/// PunchEvent audit trail, and enforces the tenant's office geofence.
class PunchGps {
  final double lat;
  final double lng;
  final double? accuracy;
  const PunchGps({required this.lat, required this.lng, this.accuracy});
}

/// Punch rejection carrying the server's machine-readable code so the UI can
/// react specifically (e.g. HOLIDAY_WORK_APPROVAL_REQUIRED → approval dialog
/// instead of a generic error snack).
class PunchException implements Exception {
  final String message;
  final String? code;
  const PunchException(this.message, {this.code});
  @override
  String toString() => message;
}

/// Login failure carrying the server's own message (and the hosts that were
/// tried) so the sign-in screen can show something specific instead of a
/// generic error.
class AuthException implements Exception {
  final int status;
  final String message;
  final List<String> triedUrls;
  const AuthException(this.status, this.message, {this.triedUrls = const []});
  @override
  String toString() => message;
}
