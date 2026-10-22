import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../config/api_config.dart';
import '../models/user.dart';
import '../utils/json_safe.dart';
import 'storage_service.dart';

class ApiService {
  static String? _token;

  /// Task 110 — global session-expiry hook. When ANY authenticated call
  /// comes back 401 (token expired / invalidated), the app clears the dead
  /// session and routes back to Sign In. Previously a 24h-expired token
  /// meant EVERY module showed errors forever with no way back except
  /// manual logout — the #1 cause of "errors in all the modules".
  static void Function(String message)? onSessionExpired;

  static bool _expiryHandling = false;

  static Future<void> _handleUnauthorized() async {
    if (_expiryHandling) return; // one cleanup per burst of parallel calls
    _expiryHandling = true;
    try {
      await logout();
    } catch (_) {}
    _expiryHandling = false;
    try {
      onSessionExpired?.call('Your session has expired. Please sign in again.');
    } catch (_) {}
  }

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
    final response = await http.get(uri, headers: _headers).timeout(ApiConfig.timeout);
    if (response.statusCode == 401 && _token != null) await _handleUnauthorized();
    return response;
  }

  static Future<http.Response> _post(String url, Map<String, dynamic> body) async {
    final response = await http.post(Uri.parse(url), headers: _headers, body: jsonEncode(body)).timeout(ApiConfig.timeout);
    if (response.statusCode == 401 && _token != null) await _handleUnauthorized();
    return response;
  }

  static Future<http.Response> _put(String url, Map<String, dynamic> body) async {
    final response = await http.put(Uri.parse(url), headers: _headers, body: jsonEncode(body)).timeout(ApiConfig.timeout);
    if (response.statusCode == 401 && _token != null) await _handleUnauthorized();
    return response;
  }

  static Future<http.Response> _delete(String url) async {
    final response = await http.delete(Uri.parse(url), headers: _headers).timeout(ApiConfig.timeout);
    if (response.statusCode == 401 && _token != null) await _handleUnauthorized();
    return response;
  }

  static Future<http.Response> _patch(String url, Map<String, dynamic> body) async {
    final response = await http.patch(Uri.parse(url), headers: _headers, body: jsonEncode(body)).timeout(ApiConfig.timeout);
    if (response.statusCode == 401 && _token != null) await _handleUnauthorized();
    return response;
  }

  // ============ Auth ============

  /// POST to a host's /api/auth/login and return (status, body-map).
  /// Never throws for non-2xx; tolerates non-JSON error pages.
  ///
  /// Task 111 FIX: an HTML body (content-type text/html, i.e. the login
  /// PAGE — what a wrong/typo'd URL or an SPA fallback returns) is reported
  /// as an unreachable-host style failure instead of being handed to the
  /// caller as a plausible "200 OK". Previously a 200+HTML response flowed
  /// into [login], which read token=null from it — and treated the whole
  /// login as SUCCESSFUL with no session stored (the "errors in all
  /// modules + no token stored" bug).
  static Future<(int, Map<String, dynamic>)> _loginAttempt(String baseUrl, String email, String password) async {
    try {
      final response = await http
          .post(
            Uri.parse('$baseUrl/api/auth/login'),
            headers: const {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            body: jsonEncode({'email': email, 'password': password}),
          )
          .timeout(ApiConfig.timeout);
      final contentType = (response.headers['content-type'] ?? '').toLowerCase();
      final body = response.body.trimLeft();
      if (contentType.contains('text/html') || body.startsWith('<')) {
        return (
          0,
          {
            'error':
                '$baseUrl served a web page instead of the login API (wrong URL?).',
            '_htmlResponse': true,
          },
        );
      }
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
        if (token is String && token.isNotEmpty) {
          setToken(token);
          await StorageService.setToken(token);
          final userJson = data['user'] ?? data['data']?['user'] ?? data['data'];
          if (userJson != null) {
            await StorageService.setUserData(jsonEncode(userJson));
          }
          // Remember the workspace that actually authenticated this user.
          ApiConfig.setBaseUrl(current);
          return data;
        }
        // Task 111 FIX: HTTP 200 WITHOUT a session token is NOT a login
        // success (it was an HTML page or a malformed payload). Fall
        // through to the ladder so the next workspace is tried instead of
        // silently entering the app with no credentials — the exact bug
        // that produced "errors in all modules + no token stored".
        lastError = (data['error'] ??
                data['message'] ??
                'Login succeeded but the server did not return a session token')
            .toString();
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

  /// GET /api/auth/me — refresh the signed-in identity straight from the
  /// server (Task 110). The home header previously rendered ONLY the stored
  /// login-time user JSON; if that JSON was written by an old build (no
  /// avatar/name fields) the header showed no photo. Fetching /me and
  /// re-persisting keeps name + photo always current.
  /// Returns null on any failure (offline, expired token) — never throws.
  static Future<Map<String, dynamic>?> getMe() async {
    try {
      final response = await _get(ApiConfig.me).timeout(ApiConfig.timeout);
      if (response.statusCode != 200) return null;
      final data = jsonDecode(response.body);
      if (data is Map<String, dynamic>) {
        final user = data['user'] is Map<String, dynamic> ? data['user'] as Map<String, dynamic> : data;
        return user;
      }
    } catch (_) {}
    return null;
  }

  /// Strict session check — true ONLY when /api/auth/me answers 200 with
  /// the current token. Unlike [refreshStoredUser], it never falls back to
  /// the stored copy, so the app wrapper can detect an expired token.
  static Future<bool> validateSession() async {
    try {
      final response = await _get(ApiConfig.me).timeout(ApiConfig.timeout);
      return response.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  /// Refresh the stored user JSON from the server. Returns the refreshed
  /// user, or null when the refresh failed AND no stored copy exists.
  static Future<UserModel?> refreshStoredUser() async {
    final me = await getMe();
    if (me == null) return getStoredUser();
    try {
      final existing = StorageService.getUserData();
      Map<String, dynamic> merged = me;
      if (existing != null) {
        try {
          final old = jsonDecode(existing);
          if (old is Map<String, dynamic>) merged = {...old, ...me};
        } catch (_) {}
      }
      final encoded = jsonEncode(merged);
      await StorageService.setUserData(encoded);
      return UserModel.fromJson(merged);
    } catch (_) {
      return getStoredUser();
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
  /// [excludeInactive] (Task 120): pickers/directories in the Leave,
  /// Attendance, Projects and Chat modules pass true so separated employees
  /// (terminated / resigned / inactive) never appear as selectable people.
  /// The Employee module intentionally does NOT send it — HR manages
  /// separated staff there.
  static Future<Map<String, dynamic>> getEmployees({
    int page = 1,
    int limit = 20,
    String? search,
    String? status,
    bool excludeInactive = false,
  }) async {
    final params = <String, String>{'page': '$page', 'limit': '$limit'};
    if (search != null && search.isNotEmpty) params['search'] = search;
    if (status != null) params['status'] = status;
    if (excludeInactive) params['excludeInactive'] = 'true';
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
  static Future<Map<String, dynamic>> getAttendance({String? date, int? month, int? year, String? startDate, String? endDate, String? employeeId, int limit = 20}) async {
    final params = <String, String>{'limit': '$limit'};
    if (date != null) params['date'] = date;
    if (month != null) params['month'] = '$month';
    if (year != null) params['year'] = '$year';
    if (startDate != null) params['startDate'] = startDate;
    if (endDate != null) params['endDate'] = endDate;
    if (employeeId != null && employeeId.isNotEmpty) params['employeeId'] = employeeId;
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
      final list = jsonList(data['employees'] is List ? data['employees'] : data['data']);
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
    String? mode, // 'office' | 'outside' — user-declared context (design #12)
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
      // Task 113: Office / Out Side mode — recorded in the audit notes trail.
      if (mode == 'office' || mode == 'outside') 'mode': mode,
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

  // ============ Projects (Task 114 — web parity) ============

  /// GET /api/projects — the SAME list the web project-management module
  /// renders (role-scoped server-side; employees see their projects).
  static Future<Map<String, dynamic>> getProjects({String? status, String? search, int limit = 50}) async {
    final q = <String, String>{'limit': '$limit', if (status != null && status.isNotEmpty) 'status': status, if (search != null && search.isNotEmpty) 'search': search};
    final response = await _get(ApiConfig.projects, queryParams: q);
    final data = jsonDecode(response.body);
    if (response.statusCode == 200) return data;
    throw Exception(data['error'] ?? 'Failed to load projects');
  }

  /// GET /api/projects/[id] — detail with tasks/milestones/allocations/members
  /// + the project-RBAC access object (financials gating included).
  static Future<Map<String, dynamic>> getProjectDetail(String id) async {
    final response = await _get(ApiConfig.projectDetail(id));
    final data = jsonDecode(response.body);
    if (response.statusCode == 200) return data;
    throw Exception(data['error'] ?? 'Failed to load project');
  }

  /// GET /api/projects/[id]/tasks — full task list for a project.
  static Future<List<dynamic>> getProjectTasks(String id) async {
    final response = await _get(ApiConfig.projectTasks(id));
    final data = jsonDecode(response.body);
    if (response.statusCode == 200) return data['tasks'] ?? [];
    throw Exception(data['error'] ?? 'Failed to load tasks');
  }

  /// POST /api/projects/[id]/tasks — create a task (name required).
  static Future<Map<String, dynamic>> createProjectTask(String projectId, Map<String, dynamic> body) async {
    final response = await _post(ApiConfig.projectTasks(projectId), body);
    final data = jsonDecode(response.body);
    if (response.statusCode == 200 || response.statusCode == 201) return data;
    throw Exception(data['error'] ?? 'Failed to create task');
  }

  /// PATCH /api/projects/[id]/tasks/[taskId] — move status / edit fields.
  /// 409 = finish-to-start dependency gate (server returns the gate message).
  static Future<Map<String, dynamic>> updateProjectTask(String projectId, String taskId, Map<String, dynamic> body) async {
    final response = await _patch(ApiConfig.projectTask(projectId, taskId), body);
    final data = jsonDecode(response.body);
    if (response.statusCode == 200) return data;
    throw Exception(data['error'] ?? 'Failed to update task');
  }

  /// POST /api/projects/[id]/milestones — Task 118 (web parity).
  /// Body: { name, plannedDate, sequence?, isPhase?, budgetCap?, billingAmount? }
  static Future<Map<String, dynamic>> createProjectMilestone(String projectId, Map<String, dynamic> body) async {
    final response = await _post(ApiConfig.projectMilestones(projectId), body);
    final data = jsonDecode(response.body);
    if (response.statusCode == 200 || response.statusCode == 201) return data;
    throw Exception(data['error'] ?? 'Failed to create milestone');
  }

  /// POST /api/projects/[id]/allocations — Task 118 (web parity).
  /// Body: { employeeId, startDate, role?, allocationPct?, endDate?, billingStatus? }
  static Future<Map<String, dynamic>> createProjectAllocation(String projectId, Map<String, dynamic> body) async {
    final response = await _post(ApiConfig.projectAllocations(projectId), body);
    final data = jsonDecode(response.body);
    if (response.statusCode == 200 || response.statusCode == 201) return data;
    throw Exception(data['error'] ?? 'Failed to add team member');
  }

  /// POST /api/projects — create a project (name, companyId, startDate
  /// required — mirrors the web create form).
  static Future<Map<String, dynamic>> createProject(Map<String, dynamic> body) async {
    final response = await _post(ApiConfig.projects, body);
    final data = jsonDecode(response.body);
    if (response.statusCode == 200 || response.statusCode == 201) return data;
    throw Exception(data['error'] ?? 'Failed to create project');
  }

  // ============ Collaboration Chat (Task 117 — web parity) ============
  // NOTE: member ids and message sender ids are EMPLOYEE ids. Resolve the
  // signed-in employee via [resolveOwnEmployeeId], never the auth user id.

  /// GET /api/collaboration/chat/rooms — rooms the signed-in employee is a
  /// member of, with last-message preview, unread counts and members.
  static Future<Map<String, dynamic>> getChatRooms() async {
    final response = await _get(ApiConfig.chatRooms);
    final data = jsonDecode(response.body);
    if (response.statusCode == 200) return data;
    throw Exception(data['error'] ?? 'Failed to load chats');
  }

  /// GET /api/collaboration/chat/rooms/[id]/messages?cursor=&limit= —
  /// chronological messages + nextCursor for older-page loading. Opening a
  /// room also marks it read server-side (lastReadAt).
  static Future<Map<String, dynamic>> getChatMessages(String roomId, {String? cursor, int limit = 50}) async {
    final q = <String, String>{'limit': '$limit', if (cursor != null && cursor.isNotEmpty) 'cursor': cursor};
    final response = await _get(ApiConfig.chatMessages(roomId), queryParams: q);
    final data = jsonDecode(response.body);
    if (response.statusCode == 200) return data;
    throw Exception(data['error'] ?? 'Failed to load messages');
  }

  /// POST /api/collaboration/chat/rooms/[id]/messages — send a message.
  /// 422 = blocked by DLP policy (server returns reason + patterns).
  /// Task 121 — [attachments]: optional files/docs, each { name, mimeType,
  /// sizeBytes, dataUrl } with dataUrl a base64 data URL (server caps
  /// 5 files × 4 MB, DLP-scans attachment names).
  static Future<Map<String, dynamic>> sendChatMessage(
    String roomId,
    String body, {
    String? parentMessageId,
    List<Map<String, dynamic>>? attachments,
  }) async {
    final response = await _post(
      ApiConfig.chatMessages(roomId),
      {
        'body': body,
        if (parentMessageId != null && parentMessageId.isNotEmpty) 'parentMessageId': parentMessageId,
        if (attachments != null && attachments.isNotEmpty) 'attachments': attachments,
      },
    );
    final data = jsonDecode(response.body);
    if (response.statusCode == 200 || response.statusCode == 201) return data;
    throw Exception(data['error'] ?? 'Failed to send message');
  }

  /// POST /api/collaboration/chat/rooms — create a direct or group chat.
  /// For an existing direct pair the server answers 200 with
  /// alreadyExisted:true and the existing room.
  static Future<Map<String, dynamic>> createChatRoom({String? name, required String roomType, required List<String> memberIds}) async {
    final response = await _post(ApiConfig.chatRooms, {
      if (name != null && name.isNotEmpty) 'name': name,
      'roomType': roomType,
      'memberIds': memberIds,
    });
    final data = jsonDecode(response.body);
    if (response.statusCode == 200 || response.statusCode == 201) return data;
    throw Exception(data['error'] ?? 'Failed to create chat');
  }

  /// POST /api/collaboration/chat/rooms/[id]/members — Task 120: add people
  /// to an EXISTING group chat. Server rejects separated employees and
  /// already-members (they come back in `skipped` with a reason).
  static Future<Map<String, dynamic>> addChatRoomMembers(String roomId, List<String> memberIds) async {
    final response = await _post(ApiConfig.chatRoomMembers(roomId), {'memberIds': memberIds});
    final data = jsonDecode(response.body);
    if (response.statusCode == 200 || response.statusCode == 201) return data;
    throw Exception(data['error'] ?? 'Failed to add members');
  }

  // ─── Task 122: chat governance (settings + rename/delete) ─────

  /// GET /api/collaboration/chat/settings — the tenant's chat governance
  /// toggles plus the signed-in user's EFFECTIVE permissions (canCreateGroup,
  /// canEditGroup, canDeleteGroup, canDeleteDirect). Fails soft: callers
  /// treat a settings error as "defaults" (server still enforces).
  static Future<Map<String, dynamic>> getChatSettings() async {
    final response = await _get(ApiConfig.chatSettings);
    final data = jsonDecode(response.body);
    if (response.statusCode == 200) return data;
    throw Exception(data['error'] ?? 'Failed to load chat settings');
  }

  /// PATCH /api/collaboration/chat/rooms/[id] — rename a group chat
  /// (chat managers only; direct rooms cannot be renamed).
  static Future<Map<String, dynamic>> renameChatRoom(String roomId, String name) async {
    final response = await _patch(ApiConfig.chatRoom(roomId), {'name': name});
    final data = jsonDecode(response.body);
    if (response.statusCode == 200) return data;
    throw Exception(data['error'] ?? 'Failed to rename chat');
  }

  /// DELETE /api/collaboration/chat/rooms/[id] — Task 122: delete a chat.
  /// Direct rooms: hides the caller's copy (scope:'self'). Group rooms:
  /// soft-deletes for everyone (scope:'everyone') — messages stay retained
  /// server-side for Super Admin eDiscovery.
  static Future<Map<String, dynamic>> deleteChatRoom(String roomId) async {
    final response = await _delete(ApiConfig.chatRoom(roomId));
    final data = jsonDecode(response.body);
    if (response.statusCode == 200) return data;
    throw Exception(data['error'] ?? 'Failed to delete chat');
  }

  // ─── Task 121: Projects ↔ Chat integration ────────────────────

  /// POST /api/projects/[id]/workspace — idempotently ensure the project's
  /// workspace chat room exists (any project member / admin may call it).
  /// Returns { roomId, boardId, createdNow, joinedNow }.
  static Future<Map<String, dynamic>> ensureProjectWorkspace(String projectId) async {
    final response = await _post(ApiConfig.projectWorkspace(projectId), {});
    final data = jsonDecode(response.body);
    if (response.statusCode == 200 || response.statusCode == 201) return data;
    throw Exception(data['error'] ?? 'Failed to open project workspace');
  }

  /// GET /api/projects/[id]/files — aggregated project files:
  /// { roomId, files: [attachment messages], driveFiles: [FileNode rows] }.
  static Future<Map<String, dynamic>> getProjectFiles(String projectId) async {
    final response = await _get(ApiConfig.projectFiles(projectId));
    final data = jsonDecode(response.body);
    if (response.statusCode == 200) return data;
    throw Exception(data['error'] ?? 'Failed to load project files');
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

  // ============ Task 112: self-service profile, notifications, leave balance ============

  /// GET /api/leaves/my-balance — entitlement for the Leave tab
  /// (Total Leaves / Leaves Used, design #05). Returns the raw map;
  /// callers fall back to zeros when the account has no employee row.
  static Future<Map<String, dynamic>> getMyLeaveBalance() async {
    final response = await _get(ApiConfig.myLeaveBalance);
    final data = jsonDecode(response.body);
    if (response.statusCode == 200) return data;
    throw Exception(data['error'] ?? 'Failed to load leave balance');
  }

  /// PATCH /api/notifications — mark ONE notification (or everything) read.
  static Future<void> markNotificationRead(String id) async {
    final response = await _patch(ApiConfig.notifications, {'id': id});
    if (response.statusCode != 200) {
      final data = jsonDecode(response.body);
      throw Exception(data['error'] ?? 'Failed to mark notification read');
    }
  }

  static Future<void> markAllNotificationsRead() async {
    final response = await _patch(ApiConfig.notifications, {'markAll': true});
    if (response.statusCode != 200) {
      final data = jsonDecode(response.body);
      throw Exception(data['error'] ?? 'Failed to mark all read');
    }
  }

  /// PATCH /api/auth/me — self-service profile update (avatar data-URI and/or
  /// phone). Powers the "Image Change" button on My Profile (design #19).
  /// Returns the updated user map so callers can refresh identity immediately.
  static Future<Map<String, dynamic>> updateMe({String? avatar, String? phone}) async {
    final body = <String, dynamic>{
      if (avatar != null) 'avatar': avatar,
      if (phone != null) 'phone': phone,
    };
    final response = await _patch(ApiConfig.me, body);
    final data = jsonDecode(response.body);
    if (response.statusCode == 200) {
      // Keep the stored identity in sync so every screen picks the new photo
      // up instantly (same write-through pattern as refreshStoredUser).
      if (data['user'] is Map<String, dynamic>) {
        final userJson = data['user'] as Map<String, dynamic>;
        final existing = StorageService.getUserData();
        if (existing != null) {
          try {
            final old = jsonDecode(existing);
            if (old is Map<String, dynamic>) {
              await StorageService.setUserData(jsonEncode({...old, ...userJson}));
            }
          } catch (_) {
            await StorageService.setUserData(jsonEncode(userJson));
          }
        } else {
          await StorageService.setUserData(jsonEncode(userJson));
        }
      }
      return data;
    }
    throw Exception(data['error'] ?? 'Failed to update profile');
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
