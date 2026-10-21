import '../services/storage_service.dart';

class ApiConfig {
  /// Default workspace = the 3Boxes demo workspace (sample data, safe for evaluation).
  /// NOTE: tenant users don't need to touch this — the login ladder in
  /// ApiService auto-discovers their company workspace from the email.
  static const String defaultBaseUrl = 'https://nexus-hrms-demo.vercel.app';
  /// Live production workspace (set from the Sign In screen when needed).
  static const String liveBaseUrl = 'https://3boxeshrms.com';

  static String _baseUrl = defaultBaseUrl;
  static String get baseUrl => _baseUrl;

  /// Point all API calls at [url] and remember it for the next launches
  /// (write-through persistence — previously the workspace reset to the demo
  /// server on every app restart, breaking stored tenant sessions).
  static void setBaseUrl(String url, {bool persist = true}) {
    final u = normalizeWorkspaceUrl(url) ?? defaultBaseUrl;
    _baseUrl = u;
    if (persist) StorageService.setWorkspaceUrl(u);
  }

  /// Restore the persisted workspace (call once at app startup, before any
  /// API request). Returns true when a non-default workspace was restored.
  /// Sanitized through [normalizeWorkspaceUrl] so a workspace persisted by
  /// an older build WITH a path suffix (the v1.0.9 "…/login" bug) heals
  /// itself on first launch of this build.
  static bool restoreFromStorage() {
    final saved = StorageService.getWorkspaceUrl();
    if (saved != null && saved.isNotEmpty) {
      _baseUrl = normalizeWorkspaceUrl(saved) ?? defaultBaseUrl;
      if (_baseUrl != saved) {
        // Heal the persisted copy too.
        StorageService.setWorkspaceUrl(_baseUrl);
      }
      return _baseUrl != defaultBaseUrl;
    }
    return false;
  }

  /// Normalize whatever the user typed (or the server suggested) into a
  /// usable base URL — ALWAYS the bare ORIGIN (scheme + host, no path).
  ///   "marqaitechgroup.3boxeshrms.com"  → https://marqaitechgroup.3boxeshrms.com
  ///   "marqaitechgroup"                  → https://marqaitechgroup.3boxeshrms.com
  ///   "mycompany.com"                    → https://mycompany.com
  ///   "https://x.com/"                   → https://x.com
  ///   "https://x.3boxeshrms.com/login"   → https://x.3boxeshrms.com
  ///
  /// Task 111 ROOT-CAUSE FIX: the platform's login API answers with
  /// suggestedUrl "https://<slug>.3boxeshrms.com/login" (a PAGE URL). The
  /// previous code kept the "/login" path, so the ladder then POSTed to
  /// "<slug>.3boxeshrms.com/login/api/auth/login" — Next.js served the login
  /// PAGE with HTTP 200 (HTML), the app mistook that for a successful login,
  /// stored NO token, persisted the broken workspace and every module
  /// 401-ed. A workspace is an origin; paths are stripped here.
  /// Returns null for empty input.
  static String? normalizeWorkspaceUrl(String input) {
    var u = input.trim();
    if (u.isEmpty) return null;
    if (!u.startsWith(RegExp(r'https?://', caseSensitive: false))) {
      // A bare subdomain fragment (no dot) belongs to the platform domain.
      if (!u.contains('.')) u = '$u.3boxeshrms.com';
      u = 'https://$u';
    }
    final uri = Uri.tryParse(u);
    if (uri == null || uri.host.isEmpty) return null;
    final port = uri.hasPort ? ':${uri.port}' : '';
    return '${uri.scheme}://${uri.host}$port';
  }

  static const String apiPrefix = '/api';
  static const Duration timeout = Duration(seconds: 30);
  static const String tenantSlug = '3boxes-hrms-demo';

  // Demo credentials
  static const String demoEmail = 'admin@acme-global.com';
  static const String demoPassword = 'MarqAI@2026';

  // Current active tenant slug (can be changed at runtime)
  static String _activeTenantSlug = tenantSlug;
  static String get activeTenantSlug => _activeTenantSlug;
  static void setActiveTenantSlug(String slug) => _activeTenantSlug = slug;

  static String get apiUrl => '$baseUrl$apiPrefix';

  // Auth
  static String get login => '$apiUrl/auth/login';
  static String get me => '$apiUrl/auth/me';

  // Employees
  static String get employees => '$apiUrl/employees';
  static String employeeDetail(String id) => '$apiUrl/employees/$id';

  // Dashboard
  static String get dashboard => '$apiUrl/dashboard';

  // Leaves
  static String get leaves => '$apiUrl/leaves';
  static String leaveDetail(String id) => '$apiUrl/leaves/$id';
  static String get myLeaveBalance => '$apiUrl/leaves/my-balance';

  // Attendance
  static String get attendance => '$apiUrl/attendance';

  // Companies
  static String get companies => '$apiUrl/companies';

  // Reports
  static String get reportsExport => '$apiUrl/reports/export';

  // Tenant Config
  static String get tenantConfiguration => '$apiUrl/tenant-configuration';

  // Tenant Info (public endpoint)
  static String tenantInfo(String slug) => '$apiUrl/public/tenant-info?slug=$slug';

  // Notifications
  static String get notifications => '$apiUrl/notifications';

  // Payroll
  static String get payrolls => '$apiUrl/payroll';
  static String payrollDetail(String id) => '$apiUrl/payroll/$id';

  // Projects (Task 114 — same endpoints the web project-management module uses)
  static String get projects => '$apiUrl/projects';
  static String projectDetail(String id) => '$apiUrl/projects/$id';
  static String projectTasks(String id) => '$apiUrl/projects/$id/tasks';
  static String projectTask(String id, String taskId) => '$apiUrl/projects/$id/tasks/$taskId';
  // Task 118 — milestones + team allocations (the same endpoints the web
  // project-detail page uses for "Add milestone" / "Add member").
  static String projectMilestones(String id) => '$apiUrl/projects/$id/milestones';
  static String projectAllocations(String id) => '$apiUrl/projects/$id/allocations';

  // Collaboration Chat (Task 117 — same endpoints the web Collaboration →
  // Chat page uses; member ids / sender ids are EMPLOYEE ids)
  static String get chatRooms => '$apiUrl/collaboration/chat/rooms';
  static String chatMessages(String roomId) => '$apiUrl/collaboration/chat/rooms/$roomId/messages';
  // Task 120 — manage members of an EXISTING room (add people after creation).
  static String chatRoomMembers(String roomId) => '$apiUrl/collaboration/chat/rooms/$roomId/members';

  // Attendance extras
  static String get mySummary => '$apiUrl/attendance/my-summary';
  static String get punch => '$apiUrl/attendance/punch';

  // Super admin — tenant directory + tenant switching (GOLDEN RULE: a super
  // admin in the app only sees module data AFTER switching into a tenant,
  // exactly like the web super-admin switcher).
  static String get tenants => '$apiUrl/tenants';
  static String get switchTenant => '$apiUrl/auth/switch-tenant';

  // Lookups
  static String get departments => '$apiUrl/departments';
  static String get designations => '$apiUrl/designations';


  // RBAC
  static String get rbacModules => '$apiUrl/rbac/modules';

  // Check if current login is demo
  static bool get isDemoTenant => _activeTenantSlug == tenantSlug;
}
