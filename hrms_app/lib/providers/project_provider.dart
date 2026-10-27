import 'package:flutter/material.dart';
import '../models/project.dart';
import '../services/api_service.dart';
import '../utils/json_safe.dart';

/// Task 114 — state for the Projects module (list + detail + tasks).
/// Mirrors the web project-management module: same endpoints, same scoping,
/// same status sets. No fabricated data anywhere.
/// Task 116 — parsing is shape-agnostic (json_safe) and the detail load
/// catches per-section errors so a deviant payload can never red-screen the
/// module with `List<dynamic> is not a subtype of List<ProjectTaskModel>`.
class ProjectProvider extends ChangeNotifier {
  List<ProjectModel> _projects = [];
  bool _isLoading = false;
  String? _error;
  int _total = 0;
  String _statusFilter = '';
  String _search = '';

  List<ProjectModel> get projects {
    var rows = _projects;
    // Server already supports search/status params; filter locally too so
    // the chips react instantly between refreshes.
    if (_statusFilter.isNotEmpty) rows = rows.where((p) => p.status == _statusFilter).toList();
    if (_search.trim().isNotEmpty) {
      final q = _search.trim().toLowerCase();
      rows = rows
          .where((p) =>
              p.name.toLowerCase().contains(q) ||
              (p.code ?? '').toLowerCase().contains(q) ||
              (p.clientName ?? '').toLowerCase().contains(q))
          .toList();
    }
    return rows;
  }

  bool get isLoading => _isLoading;
  String? get error => _error;
  int get total => _total;
  String get statusFilter => _statusFilter;
  String get search => _search;

  void setSearch(String s) {
    _search = s;
    notifyListeners();
  }

  void setStatusFilter(String s) {
    _statusFilter = s;
    notifyListeners();
  }

  Future<void> fetchProjects({bool refresh = false}) async {
    if (refresh) _statusFilter = '';
    _isLoading = true;
    _error = null;
    notifyListeners();
    try {
      final data = await ApiService.getProjects(
        status: _statusFilter.isEmpty ? null : _statusFilter,
        search: _search.trim().isEmpty ? null : _search.trim(),
      );
      final rows = jsonList(data['projects']);
      _projects = rows.whereType<Map<String, dynamic>>().map(ProjectModel.fromJson).toList();
      final pag = jsonMap(data['pagination']);
      _total = (pag['total'] is num) ? (pag['total'] as num).toInt() : _projects.length;
      _isLoading = false;
      notifyListeners();
    } catch (e) {
      _error = e.toString().replaceAll('Exception: ', '');
      _isLoading = false;
      notifyListeners();
    }
  }
}

/// Detail-page state: project + tasks + milestones + team + access.
class ProjectDetailProvider extends ChangeNotifier {
  ProjectModel? _project;
  List<ProjectTaskModel> _tasks = [];
  List<ProjectMilestoneModel> _milestones = [];
  List<ProjectTeamMemberModel> _team = [];
  ProjectAccess? _access;
  bool _isLoading = false;
  bool _busyTask = false;
  String? _error;
  String? _taskId; // detail target

  ProjectModel? get project => _project;
  List<ProjectTaskModel> get tasks => _tasks;
  List<ProjectMilestoneModel> get milestones => _milestones;
  List<ProjectTeamMemberModel> get team => _team;
  ProjectAccess? get access => _access;
  bool get isLoading => _isLoading;
  bool get busyTask => _busyTask;
  String? get error => _error;

  bool get canEdit => _access?.canEdit ?? false;
  bool get canSeeFinancials => _access?.canViewFinancials ?? false;

  /// Tasks grouped by status in board order.
  Map<String, List<ProjectTaskModel>> get tasksByStatus {
    final map = <String, List<ProjectTaskModel>>{
      'todo': [],
      'in_progress': [],
      'review': [],
      'done': [],
    };
    for (final t in _tasks) {
      final k = map.containsKey(t.status) ? t.status : 'todo';
      map[k]!.add(t);
    }
    return map;
  }

  Future<void> load(String projectId, {bool force = false}) async {
    if (!force && _project?.id == projectId && !_isLoading) return;
    _taskId = projectId;
    _isLoading = true;
    _error = null;
    notifyListeners();
    try {
      final data = await ApiService.getProjectDetail(projectId);
      final p = jsonMap(data['project']);
      if (p.isNotEmpty) {
        _project = ProjectModel.fromJson(p);
        _milestones = jsonMapList(p['milestones']).map(ProjectMilestoneModel.fromJson).toList();
        // Task 120 — allocations of separated employees (terminated/resigned/
        // inactive) stay in the DB but do not surface in the Projects module.
        _team = jsonMapList(p['allocations'])
            .map(ProjectTeamMemberModel.fromJson)
            .where((m) => !m.employeeIsInactive)
            .toList();
      }
      final a = jsonMap(data['access']);
      if (a.isNotEmpty) _access = ProjectAccess.fromJson(a);
      // Shape-agnostic tasks parse (Task 116): any deviant payload degrades
      // to an empty list instead of the type-cast crash seen on v1.4.1.
      _tasks = jsonMapList(p['tasks']).map(ProjectTaskModel.fromJson).toList();
      _isLoading = false;
      notifyListeners();
    } catch (e) {
      _error = e.toString().replaceAll('Exception: ', '');
      _isLoading = false;
      notifyListeners();
    }
  }

  /// PATCH task status (dependency-gated server-side — 409 message surfaces).
  Future<void> moveTask(String taskId, String status) async {
    if (_project == null) return;
    _busyTask = true;
    notifyListeners();
    try {
      await ApiService.updateProjectTask(_project!.id, taskId, {'status': status});
      await load(_project!.id, force: true);
    } catch (e) {
      _busyTask = false;
      _error = e.toString().replaceAll('Exception: ', '');
      notifyListeners();
      rethrow;
    }
    _busyTask = false;
    notifyListeners();
  }

  /// POST create a task on this project. Returns the created task's id
  /// (Task 131 — the create sheet uploads its picked attachments to it).
  Future<String?> createTask(Map<String, dynamic> body) async {
    if (_project == null) return null;
    _busyTask = true;
    notifyListeners();
    String? createdId;
    try {
      final data = await ApiService.createProjectTask(_project!.id, body);
      final task = (data['task'] ?? data['data'] ?? data);
      if (task is Map && task['id'] != null) createdId = task['id'].toString();
      await load(_project!.id, force: true);
    } catch (e) {
      _busyTask = false;
      _error = e.toString().replaceAll('Exception: ', '');
      notifyListeners();
      rethrow;
    }
    _busyTask = false;
    notifyListeners();
    return createdId;
  }

  /// Task 128 — PATCH any task field (workflow step / task type / assignee…).
  Future<void> updateTask(String taskId, Map<String, dynamic> body) async {
    if (_project == null) return;
    _busyTask = true;
    notifyListeners();
    try {
      await ApiService.updateProjectTask(_project!.id, taskId, body);
      await load(_project!.id, force: true);
    } catch (e) {
      _busyTask = false;
      _error = e.toString().replaceAll('Exception: ', '');
      notifyListeners();
      rethrow;
    }
    _busyTask = false;
    notifyListeners();
  }

  /// Task 118 — POST a milestone on this project (web parity).
  Future<void> createMilestone(Map<String, dynamic> body) async {
    if (_project == null) return;
    _busyTask = true;
    notifyListeners();
    try {
      await ApiService.createProjectMilestone(_project!.id, body);
      await load(_project!.id, force: true);
    } catch (e) {
      _busyTask = false;
      _error = e.toString().replaceAll('Exception: ', '');
      notifyListeners();
      rethrow;
    }
    _busyTask = false;
    notifyListeners();
  }

  /// Task 118 — POST a team-member allocation on this project (web parity).
  Future<void> createAllocation(Map<String, dynamic> body) async {
    if (_project == null) return;
    _busyTask = true;
    notifyListeners();
    try {
      await ApiService.createProjectAllocation(_project!.id, body);
      await load(_project!.id, force: true);
    } catch (e) {
      _busyTask = false;
      _error = e.toString().replaceAll('Exception: ', '');
      notifyListeners();
      rethrow;
    }
    _busyTask = false;
    notifyListeners();
  }

  void clearTransientError() {
    _error = null;
    notifyListeners();
  }
}
