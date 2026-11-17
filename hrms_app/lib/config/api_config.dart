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
  // Task 134 — self-service password change (POST {currentPassword, newPassword}).
  static String get changePassword => '$apiUrl/auth/change-password';
  // Task 141 — mobile OTP sign-in (request + verify)
  static String get otp => '$apiUrl/auth/otp';

  // Employees
  static String get employees => '$apiUrl/employees';
  static String employeeDetail(String id) => '$apiUrl/employees/$id';

  // Dashboard
  static String get dashboard => '$apiUrl/dashboard';

  // Leaves
  static String get leaves => '$apiUrl/leaves';
  static String leaveDetail(String id) => '$apiUrl/leaves/$id';
  static String get myLeaveBalance => '$apiUrl/leaves/my-balance';
  // Task 135 — leave types + ANOTHER employee's balances / requests for the
  // admin/HR on-behalf apply sheet (server re-checks the caller's role).
  static String get leaveTypes => '$apiUrl/leave-types';
  static String employeeLeaveBalance(String employeeId) => '$apiUrl/leave/balance?employeeId=$employeeId';
  static String employeeLeaves(String employeeId, {int limit = 5}) => '$apiUrl/leave?employeeId=$employeeId&limit=$limit';

  // Attendance
  static String get attendance => '$apiUrl/attendance';
  // Task 135 — holiday calendar for the team daily-status view
  static String get holidays => '$apiUrl/holidays';
  // Task 136 — birthdays (original-birthday celebrations + Send Wishes)
  static String get birthdays => '$apiUrl/birthdays';
  // Task 139 — tenant-wide org stats (same for every login like admin)
  static String get orgStats => '$apiUrl/employees/org-stats';
  static String get birthdayWish => '$apiUrl/birthdays/wish';

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
  // Task 130: official payslip PDF (released MARQAI format) — download is
  // gated server-side on the payroll-manager release.
  static String payslipPdf(String id) => '$apiUrl/payroll/payslips/$id/pdf';

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

  // Task 129 — task attachments (screenshots etc.) + admin reports
  static String projectAttachments(String projectId) => '$apiUrl/projects/$projectId/attachments';
  static String projectAttachment(String projectId, String attachmentId) => '$apiUrl/projects/$projectId/attachments/$attachmentId';
  static String projectTaskAttachments(String projectId, String taskId) => '$apiUrl/projects/$projectId/attachments?taskId=$taskId';
  static String get adminReports => '$apiUrl/reports';
  static String get projectReports => '$apiUrl/project-reports';

  // Task 141 — social feed (announcements banner + news list)
  static String get socialFeed => '$apiUrl/social-feed';

  // Task 141 — HR Help Desk (connected to the web Support ticketing system)
  static String get tickets => '$apiUrl/tickets';
  static String ticketDetail(String id) => '$apiUrl/tickets/$id';
  static String ticketComments(String id) => '$apiUrl/tickets/$id/comments';
  static String get helpdesk => '$apiUrl/helpdesk';

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
