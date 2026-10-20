import 'package:flutter/material.dart';
import '../models/project.dart';
import '../services/api_service.dart';

/// Task 114 — state for the Projects module (list + detail + tasks).
/// Mirrors the web project-management module: same endpoints, same scoping,
/// same status sets. No fabricated data anywhere.
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
      final rows = (data['projects'] ?? const []) as List;
      _projects = rows.whereType<Map<String, dynamic>>().map(ProjectModel.fromJson).toList();
      _total = data['pagination']?['total'] ?? _projects.length;
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
      final p = data['project'];
      if (p is Map<String, dynamic>) {
        _project = ProjectModel.fromJson(p);
        _milestones = ((p['milestones'] ?? const []) as List)
            .whereType<Map<String, dynamic>>()
            .map(ProjectMilestoneModel.fromJson)
            .toList();
        _team = ((p['allocations'] ?? const []) as List)
            .whereType<Map<String, dynamic>>()
            .map(ProjectTeamMemberModel.fromJson)
            .toList();
      }
      final a = data['access'];
      if (a is Map<String, dynamic>) _access = ProjectAccess.fromJson(a);
      _tasks = ((p is Map<String, dynamic> ? p['tasks'] : const []) ?? const [] as List)
          .whereType<Map<String, dynamic>>()
          .map(ProjectTaskModel.fromJson)
          .toList();
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

  /// POST create a task on this project.
  Future<void> createTask(Map<String, dynamic> body) async {
    if (_project == null) return;
    _busyTask = true;
    notifyListeners();
    try {
      await ApiService.createProjectTask(_project!.id, body);
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
