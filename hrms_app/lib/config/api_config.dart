import '../services/storage_service.dart';

class ApiConfig {
  static const String baseUrl = 'https://nexus-hrms-mu.vercel.app';
  static const String apiPrefix = '/api';
  static const Duration timeout = Duration(seconds: 30);
  static const String tenantSlug = '3boxes-hrms-demo';

  // Demo credentials
  static const String demoEmail = 'admin@3boxes.com';
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
  // Task 122 — chat governance settings + per-room rename/delete.
  static String get chatSettings => '$apiUrl/collaboration/chat/settings';
  static String chatRoom(String roomId) => '$apiUrl/collaboration/chat/rooms/$roomId';

  // Task 121 — Projects ↔ Chat integration: workspace room + aggregated files
  static String projectWorkspace(String projectId) => '$apiUrl/projects/$projectId/workspace';
  static String projectFiles(String projectId) => '$apiUrl/projects/$projectId/files';

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
