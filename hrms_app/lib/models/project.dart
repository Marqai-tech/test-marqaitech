/// Task 114 — Project Management module models.
///
/// Parsed from the LIVE web-platform APIs (same endpoints the web app uses):
///   GET    /api/projects               → { projects: [...], pagination }
///   GET    /api/projects/[id]          → { project: {...}, access: {...} }
///   GET    /api/projects/[id]/tasks    → { tasks: [...] }
///   POST   /api/projects/[id]/tasks    → { task: {...} }
///   PATCH  /api/projects/[id]/tasks/[taskId]
///   POST   /api/projects               → { project: {...} }
///
/// Field shapes mirror prisma `Project` / `ProjectTask` / `ProjectMilestone`
/// includes (client, department, company, milestone, sprint, assignedTo…).
///
/// Task 116 — every collection/field read is shape-agnostic (see
/// utils/json_safe.dart): a server payload that deviates from the expected
/// shape (tasks as a Map, string elements, null blocks…) degrades to empty
/// defaults instead of throwing `List<dynamic> is not a subtype of
/// List<ProjectTaskModel>` in release builds.
import '../utils/json_safe.dart';

class ProjectModel {
  final String id;
  final String name;
  final String? code;
  final String? clientId;
  final String? clientName;
  final String? departmentName;
  final String? companyName;
  final String projectType;
  final String billingType;
  final String currency;
  final num budgetAmount;
  final num estimatedHours;
  final num actualHours;
  final String? startDate; // ISO
  final String? endDate; // ISO
  final String status;
  final String? description;
  final int progress;
  final String? projectManagerId;
  final String? deliveryManagerId;
  final int taskCount;
  final int allocationCount;
  final int milestoneCount;
  final List<ProjectTaskModel> recentTasks;
  final List<ProjectTeamMemberModel> team;

  const ProjectModel({
    required this.id,
    required this.name,
    this.code,
    this.clientId,
    this.clientName,
    this.departmentName,
    this.companyName,
    this.projectType = 'internal',
    this.billingType = 'non_billable',
    this.currency = 'INR',
    this.budgetAmount = 0,
    this.estimatedHours = 0,
    this.actualHours = 0,
    this.startDate,
    this.endDate,
    this.status = 'draft',
    this.description,
    this.progress = 0,
    this.projectManagerId,
    this.deliveryManagerId,
    this.taskCount = 0,
    this.allocationCount = 0,
    this.milestoneCount = 0,
    this.recentTasks = const [],
    this.team = const [],
  });

  static num _num(dynamic v) {
    if (v is num) return v;
    if (v is String) return num.tryParse(v) ?? 0;
    return 0;
  }

  static String? _str(dynamic v) => v == null ? null : v.toString();

  /// When the server omits `_count`, fall back to the parsed tasks length so
  /// the Overview counters stay truthful.
  static int taskCountFrom(List<Map<String, dynamic>> tasksRaw) => tasksRaw.length;

  factory ProjectModel.fromJson(Map<String, dynamic> j) {
    final counts = jsonMap(j['_count']);
    final tasksRaw = jsonMapList(j['tasks']);
    final allocsRaw = jsonMapList(j['allocations']);
    return ProjectModel(
      id: (j['id'] ?? '').toString(),
      name: (j['name'] ?? '').toString(),
      code: _str(j['code']),
      clientId: _str(j['clientId']),
      clientName: (j['client'] is Map) ? (j['client']['name']?.toString()) : null,
      departmentName: (j['department'] is Map) ? (j['department']['name']?.toString()) : null,
      companyName: (j['company'] is Map) ? (j['company']['name']?.toString()) : null,
      projectType: (j['projectType'] ?? 'internal').toString(),
      billingType: (j['billingType'] ?? 'non_billable').toString(),
      currency: (j['currency'] ?? 'INR').toString(),
      budgetAmount: _num(j['budgetAmount']),
      estimatedHours: _num(j['estimatedHours']),
      actualHours: _num(j['actualHours']),
      startDate: _str(j['startDate']),
      endDate: _str(j['endDate']),
      status: (j['status'] ?? 'draft').toString(),
      description: _str(j['description']),
      progress: (_num(j['progress'])).round(),
      projectManagerId: _str(j['projectManagerId']),
      deliveryManagerId: _str(j['deliveryManagerId']),
      taskCount: (counts['tasks'] is num) ? (counts['tasks'] as num).toInt() : taskCountFrom(tasksRaw),
      allocationCount: (counts['allocations'] is num) ? (counts['allocations'] as num).toInt() : allocsRaw.length,
      milestoneCount: (counts['milestones'] is num) ? (counts['milestones'] as num).toInt() : 0,
      recentTasks: tasksRaw.map(ProjectTaskModel.fromJson).toList(),
      team: allocsRaw.map(ProjectTeamMemberModel.fromJson).toList(),
    );
  }

  /// Human label for the project status.
  String get statusLabel {
    switch (status) {
      case 'active':
        return 'Active';
      case 'on_hold':
        return 'On Hold';
      case 'completed':
        return 'Completed';
      case 'cancelled':
        return 'Cancelled';
      default:
        return 'Draft';
    }
  }

  /// Human label for the project type (web parity).
  String get typeLabel {
    switch (projectType) {
      case 'client':
        return 'Client';
      case 'r_and_d':
        return 'R&D';
      case 'support':
        return 'Support';
      default:
        return 'Internal';
    }
  }
}

class ProjectTaskModel {
  final String id;
  final String projectId;
  final String name;
  final String? category;
  final String? description;
  final String? assignedToId;
  final String? assignedToName;
  final String? milestoneId;
  final String? milestoneName;
  final String? sprintId;
  final String? sprintName;
  final int? storyPoints;
  final String? dependsOnId;
  final String? dependsOnName;
  final String? dependsOnStatus;
  final String? plannedStart; // ISO
  final String? plannedEnd; // ISO
  final num estimatedHours;
  final num actualHours;
  final String priority;
  final String status;
  final bool isBillable;
  final String? completedAt;

  const ProjectTaskModel({
    required this.id,
    required this.projectId,
    required this.name,
    this.category,
    this.description,
    this.assignedToId,
    this.assignedToName,
    this.milestoneId,
    this.milestoneName,
    this.sprintId,
    this.sprintName,
    this.storyPoints,
    this.dependsOnId,
    this.dependsOnName,
    this.dependsOnStatus,
    this.plannedStart,
    this.plannedEnd,
    this.estimatedHours = 0,
    this.actualHours = 0,
    this.priority = 'medium',
    this.status = 'todo',
    this.isBillable = true,
    this.completedAt,
  });

  factory ProjectTaskModel.fromJson(Map<String, dynamic> j) {
    final assigned = jsonMap(j['assignedTo']);
    final milestone = jsonMap(j['milestone']);
    final sprint = jsonMap(j['sprint']);
    final dependsOn = jsonMap(j['dependsOn']);
    return ProjectTaskModel(
      id: (j['id'] ?? '').toString(),
      projectId: (j['projectId'] ?? '').toString(),
      name: (j['name'] ?? '').toString(),
      category: j['category']?.toString(),
      description: j['description']?.toString(),
      assignedToId: j['assignedToId']?.toString(),
      assignedToName: assigned.isEmpty
          ? null
          : '${assigned['firstName'] ?? ''} ${assigned['lastName'] ?? ''}'.trim(),
      milestoneId: milestone.isNotEmpty ? milestone['id']?.toString() : j['milestoneId']?.toString(),
      milestoneName: milestone.isNotEmpty ? milestone['name']?.toString() : null,
      sprintId: sprint.isNotEmpty ? sprint['id']?.toString() : j['sprintId']?.toString(),
      sprintName: sprint.isNotEmpty ? sprint['name']?.toString() : null,
      storyPoints: j['storyPoints'] is int ? j['storyPoints'] as int : (j['storyPoints'] is num ? (j['storyPoints'] as num).toInt() : null),
      dependsOnId: dependsOn.isNotEmpty ? dependsOn['id']?.toString() : j['dependsOnId']?.toString(),
      dependsOnName: dependsOn.isNotEmpty ? dependsOn['name']?.toString() : null,
      dependsOnStatus: dependsOn.isNotEmpty ? dependsOn['status']?.toString() : null,
      plannedStart: j['plannedStart']?.toString(),
      plannedEnd: j['plannedEnd']?.toString(),
      estimatedHours: ProjectModel._num(j['estimatedHours']),
      actualHours: ProjectModel._num(j['actualHours']),
      priority: (j['priority'] ?? 'medium').toString(),
      status: (j['status'] ?? 'todo').toString(),
      isBillable: j['isBillable'] is bool ? j['isBillable'] as bool : true,
      completedAt: j['completedAt']?.toString(),
    );
  }

  String get statusLabel {
    switch (status) {
      case 'in_progress':
        return 'In Progress';
      case 'review':
        return 'Review';
      case 'done':
        return 'Done';
      case 'cancelled':
        return 'Cancelled';
      default:
        return 'To Do';
    }
  }

  String get priorityLabel {
    final p = priority.trim();
    if (p.isEmpty) return 'Medium';
    return p[0].toUpperCase() + p.substring(1);
  }
}

class ProjectMilestoneModel {
  final String id;
  final String name;
  final String? plannedDate;
  final String? actualDate;
  final num? billingAmount;
  final int completionPct;
  final String approvalStatus;
  final String invoiceStatus;
  final int? sequence;
  final bool isPhase;
  final int taskCount;

  const ProjectMilestoneModel({
    required this.id,
    required this.name,
    this.plannedDate,
    this.actualDate,
    this.billingAmount,
    this.completionPct = 0,
    this.approvalStatus = 'pending',
    this.invoiceStatus = 'not_invoiced',
    this.sequence,
    this.isPhase = false,
    this.taskCount = 0,
  });

  factory ProjectMilestoneModel.fromJson(Map<String, dynamic> j) {
    final counts = jsonMap(j['_count']);
    return ProjectMilestoneModel(
      id: (j['id'] ?? '').toString(),
      name: (j['name'] ?? '').toString(),
      plannedDate: j['plannedDate']?.toString(),
      actualDate: j['actualDate']?.toString(),
      billingAmount: j['billingAmount'] is num ? j['billingAmount'] as num : null,
      completionPct: ProjectModel._num(j['completionPct']).round(),
      approvalStatus: (j['approvalStatus'] ?? 'pending').toString(),
      invoiceStatus: (j['invoiceStatus'] ?? 'not_invoiced').toString(),
      sequence: j['sequence'] is int ? j['sequence'] as int : null,
      isPhase: j['isPhase'] is bool ? j['isPhase'] as bool : false,
      taskCount: (counts['tasks'] is num) ? (counts['tasks'] as num).toInt() : jsonMapList(j['tasks']).length,
    );
  }

  String get approvalLabel {
    final a = approvalStatus.trim();
    if (a.isEmpty) return 'Pending';
    return a[0].toUpperCase() + a.substring(1);
  }
}

/// Project team member from an allocation row (employee + role + pct).
class ProjectTeamMemberModel {
  final String id;
  final String? employeeId;
  final String? employeeName;
  final String? employeeCode;
  final String? role;
  final num allocationPct;
  final String? status;

  const ProjectTeamMemberModel({
    required this.id,
    this.employeeId,
    this.employeeName,
    this.employeeCode,
    this.role,
    this.allocationPct = 0,
    this.status,
  });

  factory ProjectTeamMemberModel.fromJson(Map<String, dynamic> j) {
    final emp = jsonMap(j['employee']);
    return ProjectTeamMemberModel(
      id: (j['id'] ?? '').toString(),
      employeeId: emp.isNotEmpty ? emp['id']?.toString() : null,
      employeeName: emp.isEmpty
          ? null
          : '${emp['firstName'] ?? ''} ${emp['lastName'] ?? ''}'.trim(),
      employeeCode: emp.isNotEmpty ? emp['employeeId']?.toString() : null,
      role: j['role']?.toString(),
      allocationPct: ProjectModel._num(j['allocationPct']),
      status: j['status']?.toString(),
    );
  }
}

/// `access` object returned by GET /api/projects/[id] (project-rbac.ts).
class ProjectAccess {
  final String role; // manager | finance | member | viewer
  final bool canView;
  final bool canViewFinancials;
  final bool canEdit;
  final bool canManageMembers;

  const ProjectAccess({
    this.role = 'viewer',
    this.canView = true,
    this.canViewFinancials = false,
    this.canEdit = false,
    this.canManageMembers = false,
  });

  factory ProjectAccess.fromJson(Map<String, dynamic> j) => ProjectAccess(
        role: (j['role'] ?? 'viewer').toString(),
        canView: j['canView'] is bool ? j['canView'] as bool : true,
        canViewFinancials: j['canViewFinancials'] is bool ? j['canViewFinancials'] as bool : false,
        canEdit: j['canEdit'] is bool ? j['canEdit'] as bool : false,
        canManageMembers: j['canManageMembers'] is bool ? j['canManageMembers'] as bool : false,
      );
}
