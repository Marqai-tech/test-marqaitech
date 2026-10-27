import 'dart:convert';

import 'package:flutter/material.dart';
import '../../config/maan_theme.dart';
import '../../services/api_service.dart';
import '../../utils/json_safe.dart';

/// Task 129 — ADMIN REPORTS (mobile): live reports for the Leave, Attendance,
/// Employees and Projects modules, powered by the SAME engines the web
/// Reports hub uses (GET /api/reports?type=… + GET /api/project-reports).
/// The server scopes every payload by the caller's role (admins = whole
/// company, managers = their team), so this screen is safe to expose to the
/// admin/CEO/HR/manager role set. Entry points are gated in the home grid +
/// the drawer with the same set.

class ReportsScreen extends StatefulWidget {
  const ReportsScreen({super.key});

  /// Roles that see the Reports entry (mirrors the server's data scopes —
  /// admins get company-wide numbers, managers get team numbers).
  static const Set<String> reportRoles = {
    'super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_admin', 'company_hr_admin', 'manager',
  };

  static bool canSee(String? role) => role != null && reportRoles.contains(role);

  @override
  State<ReportsScreen> createState() => _ReportsScreenState();
}

class _ReportsScreenState extends State<ReportsScreen> with SingleTickerProviderStateMixin {
  late final TabController _tabs = TabController(length: 4, vsync: this);

  // Selected month for Leave / Attendance (default: current month)
  late DateTime _month = DateTime(DateTime.now().year, DateTime.now().month);

  bool _loading = true;
  String? _error;
  Map<String, dynamic> _employees = {};
  Map<String, dynamic> _leave = {};
  Map<String, dynamic> _attendance = {};
  Map<String, dynamic> _projects = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  String get _monthParam => _month.month.toString().padLeft(2, '0');
  String get _yearParam => _month.year.toString();

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final results = await Future.wait<Map<String, dynamic>>([
        ApiService.getAdminReport('employee_report'),
        ApiService.getAdminReport('leave_report', month: _monthParam, year: _yearParam),
        ApiService.getAdminReport('attendance_report', month: _monthParam, year: _yearParam),
        ApiService.getProjectReports(),
      ]);
      if (!mounted) return;
      setState(() {
        _employees = results[0];
        _leave = results[1];
        _attendance = results[2];
        _projects = results[3];
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.toString().replaceAll('Exception: ', '');
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return MaanPage(
      title: 'Reports',
      body: Column(
        children: [
          // Month selector — drives the Leave + Attendance tabs
          Container(
            margin: const EdgeInsets.fromLTRB(16, 10, 16, 0),
            padding: const EdgeInsets.symmetric(horizontal: 12),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: MaanColors.line),
            ),
            child: DropdownButtonHideUnderline(
              child: DropdownButton<String>(
                isExpanded: true,
                value: '${_month.year}-${_month.month.toString().padLeft(2, '0')}',
                icon: const Icon(Icons.expand_more_rounded, size: 20, color: MaanColors.faint),
                items: _monthItems(),
                onChanged: (v) {
                  if (v == null) return;
                  final parts = v.split('-');
                  final m = DateTime(int.parse(parts[0]), int.parse(parts[1]));
                  if (m.year != _month.year || m.month != _month.month) {
                    setState(() => _month = m);
                    _load();
                  }
                },
                style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: MaanColors.navy),
                hint: const Text('Reporting month', style: TextStyle(fontSize: 13.5)),
              ),
            ),
          ),
          Container(
            margin: const EdgeInsets.fromLTRB(16, 10, 16, 0),
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: MaanColors.line)),
            child: TabBar(
              controller: _tabs,
              indicatorSize: TabBarIndicatorSize.tab,
              indicator: BoxDecoration(color: MaanColors.primary.withOpacity(0.10), borderRadius: BorderRadius.circular(10)),
              labelColor: MaanColors.primary,
              unselectedLabelColor: MaanColors.faint,
              labelStyle: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800),
              dividerColor: Colors.transparent,
              tabs: const [
                Tab(text: 'Employees'),
                Tab(text: 'Leave'),
                Tab(text: 'Attendance'),
                Tab(text: 'Projects'),
              ],
            ),
          ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator(color: MaanColors.primary))
                : _error != null
                    ? _errorView()
                    : RefreshIndicator(
                        color: MaanColors.primary,
                        onRefresh: _load,
                        child: TabBarView(
                          controller: _tabs,
                          children: [
                            _employeesTab(),
                            _leaveTab(),
                            _attendanceTab(),
                            _projectsTab(),
                          ],
                        ),
                      ),
          ),
        ],
      ),
    );
  }

  List<DropdownMenuItem<String>> _monthItems() {
    final now = DateTime.now();
    final items = <DropdownMenuItem<String>>[];
    for (var i = 0; i < 12; i++) {
      final d = DateTime(now.year, now.month - i);
      final value = '${d.year}-${d.month.toString().padLeft(2, '0')}';
      const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      items.add(DropdownMenuItem(value: value, child: Text('${names[d.month - 1]} ${d.year}')));
    }
    return items;
  }

  Widget _errorView() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Icon(Icons.error_outline_rounded, size: 44, color: MaanColors.faint),
          const SizedBox(height: 10),
          Text(_error!, textAlign: TextAlign.center, style: const TextStyle(color: MaanColors.body, fontSize: 12.5)),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: _load,
            icon: const Icon(Icons.refresh_rounded, size: 17),
            label: const Text('Retry'),
            style: OutlinedButton.styleFrom(foregroundColor: MaanColors.primary, side: const BorderSide(color: MaanColors.primary)),
          ),
        ]),
      ),
    );
  }

  // ── building blocks ──────────────────────────────────────────────

  Widget _statTile(String label, String value, {Color? color}) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
        decoration: BoxDecoration(
          color: (color ?? MaanColors.primary).withOpacity(0.07),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(children: [
          Text(value, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: color ?? MaanColors.primary)),
          const SizedBox(height: 2),
          Text(label, textAlign: TextAlign.center, style: MaanText.caption.copyWith(fontSize: 10.5)),
        ]),
      ),
    );
  }

  Widget _statsRow(List<Widget> tiles) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
        child: Row(children: [
          for (var i = 0; i < tiles.length; i++) ...[
            if (i > 0) const SizedBox(width: 8),
            tiles[i],
          ],
        ]),
      );

  Widget _card({required String title, required Widget child}) {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 10, 16, 0),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: MaanColors.line),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(title, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: MaanColors.navy, letterSpacing: 0.4)),
        const SizedBox(height: 10),
        child,
      ]),
    );
  }

  Widget _barRow(String label, int value, int max, Color color) {
    final pct = max > 0 ? value / max : 0.0;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(children: [
        SizedBox(width: 96, child: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: MaanText.caption.copyWith(fontSize: 11.5, fontWeight: FontWeight.w600))),
        const SizedBox(width: 8),
        Expanded(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: LinearProgressIndicator(
              value: pct.clamp(0, 1),
              minHeight: 8,
              backgroundColor: MaanColors.line.withOpacity(0.5),
              color: color,
            ),
          ),
        ),
        const SizedBox(width: 8),
        SizedBox(width: 36, child: Text('$value', textAlign: TextAlign.right, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: MaanColors.navy))),
      ]),
    );
  }

  Map<String, dynamic> _strMap(dynamic v) {
    final out = <String, dynamic>{};
    if (v is Map) {
      for (final e in v.entries) {
        out[e.key.toString()] = e.value is num ? (e.value as num).toInt() : e.value;
      }
    }
    return out;
  }

  // ── Employees tab ────────────────────────────────────────────────

  Widget _employeesTab() {
    final headcount = (_employees['headcount'] is num) ? (_employees['headcount'] as num).toInt() : 0;
    final newHires = (_employees['newHires'] is num) ? (_employees['newHires'] as num).toInt() : 0;
    final attrition = (_employees['attrition'] is num) ? (_employees['attrition'] as num).toDouble() : 0.0;
    final dept = _strMap(_employees['departmentDistribution']);
    final deptEntries = dept.entries.where((e) => e.value is int).toList()
      ..sort((a, b) => (b.value as int).compareTo(a.value as int));
    final deptMax = deptEntries.isEmpty ? 0 : deptEntries.first.value as int;
    final employees = (_employees['employees'] is List) ? (_employees['employees'] as List) : [];
    return ListView(
      padding: const EdgeInsets.fromLTRB(0, 4, 0, 24),
      children: [
        _statsRow([
          _statTile('Headcount', '$headcount', color: MaanColors.primary),
          _statTile('New Hires', '$newHires', color: MaanColors.accentGreen),
          _statTile('Attrition', '${attrition.toStringAsFixed(1)}%', color: MaanColors.accentOrange),
        ]),
        _card(
          title: 'HEADCOUNT BY DEPARTMENT',
          child: deptEntries.isEmpty
              ? const Text('No department data', style: MaanText.caption)
              : Column(children: [
                  for (final e in deptEntries.take(7))
                    _barRow(e.key, e.value as int, deptMax, MaanColors.primary),
                ]),
        ),
        _card(
          title: 'RECENT JOINERS',
          child: employees.isEmpty
              ? const Text('No employee data in scope', style: MaanText.caption)
              : Column(children: [
                  for (final raw in employees.take(5)) _employeeRow(jsonMap(raw)),
                ]),
        ),
      ],
    );
  }

  Widget _employeeRow(Map<String, dynamic> e) {
    final first = (e['firstName'] ?? '').toString();
    final last = (e['lastName'] ?? '').toString();
    final name = '$first $last'.trim();
    final desig = (e['designation'] is Map ? (e['designation'] as Map)['name'] : e['designation'])?.toString() ?? '';
    final doj = (e['dateOfJoining'] ?? '').toString();
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(children: [
        CircleAvatar(
          radius: 13,
          backgroundColor: MaanColors.primary.withOpacity(0.12),
          child: Text(name.isNotEmpty ? name[0].toUpperCase() : '?', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: MaanColors.primary)),
        ),
        const SizedBox(width: 8),
        Expanded(child: Text(name.isEmpty ? '—' : name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: MaanColors.navy))),
        if (desig.isNotEmpty)
          Flexible(child: Text(desig, maxLines: 1, overflow: TextOverflow.ellipsis, style: MaanText.caption.copyWith(fontSize: 10.5))),
        if (doj.length >= 10) ...[
          const SizedBox(width: 6),
          Text(doj.substring(0, 10), style: MaanText.caption.copyWith(fontSize: 10)),
        ],
      ]),
    );
  }

  // ── Leave tab ────────────────────────────────────────────────────

  Widget _leaveTab() {
    final byStatus = _strMap(_leave['byStatus']);
    final byType = _strMap(_leave['byType']);
    final total = (_leave['total'] is num) ? (_leave['total'] as num).toInt() : 0;
    final statusEntries = byStatus.entries.where((e) => e.value is int).toList()
      ..sort((a, b) => (b.value as int).compareTo(a.value as int));
    final statusMax = statusEntries.isEmpty ? 0 : statusEntries.first.value as int;
    final typeEntries = byType.entries.where((e) => e.value is int).toList()
      ..sort((a, b) => (b.value as int).compareTo(a.value as int));
    final typeMax = typeEntries.isEmpty ? 0 : typeEntries.first.value as int;
    Color statusColor(String k) {
      final s = k.toLowerCase();
      if (s.contains('approv')) return MaanColors.accentGreen;
      if (s.contains('pend')) return MaanColors.accentOrange;
      if (s.contains('rej')) return MaanColors.accentRed;
      return MaanColors.primary;
    }
    return ListView(
      padding: const EdgeInsets.fromLTRB(0, 4, 0, 24),
      children: [
        _statsRow([
          _statTile('Total Requests', '$total', color: MaanColors.primary),
          _statTile('Approved', '${byStatus['APPROVED'] ?? byStatus['approved'] ?? 0}', color: MaanColors.accentGreen),
          _statTile('Pending', '${byStatus['PENDING'] ?? byStatus['pending'] ?? 0}', color: MaanColors.accentOrange),
        ]),
        _card(
          title: 'REQUESTS BY STATUS',
          child: statusEntries.isEmpty
              ? const Text('No leave requests in this month', style: MaanText.caption)
              : Column(children: [
                  for (final e in statusEntries)
                    _barRow(_titleCase(e.key), e.value as int, statusMax, statusColor(e.key)),
                ]),
        ),
        _card(
          title: 'REQUESTS BY LEAVE TYPE',
          child: typeEntries.isEmpty
              ? const Text('No leave-type data in this month', style: MaanText.caption)
              : Column(children: [
                  for (final e in typeEntries.take(7))
                    _barRow(_titleCase(e.key), e.value as int, typeMax, const Color(0xFF0EA5A6)),
                ]),
        ),
      ],
    );
  }

  // ── Attendance tab ───────────────────────────────────────────────

  Widget _attendanceTab() {
    final rate = (_attendance['attendanceRate'] is num) ? (_attendance['attendanceRate'] as num).toDouble() : null;
    final lateArrivals = (_attendance['lateArrivals'] is num) ? (_attendance['lateArrivals'] as num).toInt() : 0;
    final byStatus = _strMap(_attendance['byStatus']);
    final present = byStatus['present'] ?? 0;
    final absent = byStatus['absent'] ?? 0;
    final onLeave = byStatus['on_leave'] ?? byStatus['leave'] ?? 0;
    final halfDay = byStatus['half_day'] ?? 0;
    final statusEntries = byStatus.entries.where((e) => e.value is int && (e.value as int) > 0).toList()
      ..sort((a, b) => (b.value as int).compareTo(a.value as int));
    final statusMax = statusEntries.isEmpty ? 0 : statusEntries.first.value as int;
    Color statusColor(String k) {
      switch (k.toLowerCase()) {
        case 'present': return MaanColors.accentGreen;
        case 'absent': return MaanColors.accentRed;
        case 'late': return MaanColors.accentOrange;
        case 'on_leave': case 'leave': return const Color(0xFF0284C7);
        case 'half_day': return const Color(0xFF7C3AED);
        default: return MaanColors.faint;
      }
    }
    return ListView(
      padding: const EdgeInsets.fromLTRB(0, 4, 0, 24),
      children: [
        // Task 135 — jump straight into the per-employee team view
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 4),
          child: FilledButton.icon(
            onPressed: () => Navigator.pushNamed(context, '/team-attendance'),
            style: FilledButton.styleFrom(
              backgroundColor: MaanColors.primary,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 12),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            ),
            icon: const Icon(Icons.groups_rounded, size: 18),
            label: const Text('Team attendance & daily status', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13)),
          ),
        ),
        _statsRow([
          _statTile('Attendance Rate', rate == null ? '—' : '${rate.toStringAsFixed(1)}%', color: MaanColors.accentGreen),
          _statTile('Present Days', '$present', color: MaanColors.primary),
          _statTile('Late Arrivals', '$lateArrivals', color: MaanColors.accentOrange),
        ]),
        _statsRow([
          _statTile('Absent Days', '$absent', color: MaanColors.accentRed),
          _statTile('On Leave', '$onLeave', color: const Color(0xFF0284C7)),
          _statTile('Half Days', '$halfDay', color: const Color(0xFF7C3AED)),
        ]),
        _card(
          title: 'MONTH BY STATUS',
          child: statusEntries.isEmpty
              ? const Text('No attendance data in this month', style: MaanText.caption)
              : Column(children: [
                  for (final e in statusEntries)
                    _barRow(_titleCase(e.key), e.value as int, statusMax, statusColor(e.key)),
                ]),
        ),
      ],
    );
  }

  // ── Projects tab ─────────────────────────────────────────────────

  Widget _projectsTab() {
    final stats = jsonMap(_projects['summaryStats']);
    final total = (stats['total'] is num) ? (stats['total'] as num).toInt() : 0;
    final active = (stats['active'] is num) ? (stats['active'] as num).toInt() : 0;
    final completed = (stats['completed'] is num) ? (stats['completed'] as num).toInt() : 0;
    final avgProgress = (stats['avgProgress'] is num) ? (stats['avgProgress'] as num).toDouble() : 0.0;
    final totalBudget = (stats['totalBudget'] is num) ? (stats['totalBudget'] as num).toDouble() : 0.0;
    final taskDist = _strMap(_projects['taskDistribution']);
    final overdue = (_projects['overdueTasks'] is List) ? (_projects['overdueTasks'] as List).length : 0;
    final distEntries = taskDist.entries.where((e) => e.value is int).toList()
      ..sort((a, b) => (b.value as int).compareTo(a.value as int));
    final distMax = distEntries.isEmpty ? 0 : distEntries.first.value as int;
    return ListView(
      padding: const EdgeInsets.fromLTRB(0, 4, 0, 24),
      children: [
        _statsRow([
          _statTile('Projects', '$total', color: MaanColors.primary),
          _statTile('Active', '$active', color: MaanColors.accentGreen),
          _statTile('Completed', '$completed', color: const Color(0xFF0284C7)),
        ]),
        _card(
          title: 'PORTFOLIO',
          child: Column(children: [
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(children: [
                const Text('Avg progress', style: MaanText.caption),
                const Spacer(),
                Text('${avgProgress.toStringAsFixed(0)}%', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: MaanColors.navy)),
              ]),
            ),
            LinearProgressIndicator(value: (avgProgress / 100).clamp(0, 1), minHeight: 8, backgroundColor: MaanColors.line.withOpacity(0.5), color: MaanColors.accentGreen),
            const SizedBox(height: 10),
            Row(children: [
              const Text('Total budget', style: MaanText.caption),
              const Spacer(),
              Text('₹${_fmtMoney(totalBudget)}', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: MaanColors.navy)),
            ]),
            const SizedBox(height: 10),
            Row(children: [
              const Text('Overdue tasks', style: MaanText.caption),
              const Spacer(),
              Text('$overdue', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: overdue > 0 ? MaanColors.accentRed : MaanColors.navy)),
            ]),
          ]),
        ),
        _card(
          title: 'TASKS BY STATUS',
          child: distEntries.isEmpty
              ? const Text('No task data yet', style: MaanText.caption)
              : Column(children: [
                  for (final e in distEntries)
                    _barRow(_titleCase(e.key), e.value as int, distMax, MaanColors.accentPurple),
                ]),
        ),
      ],
    );
  }

  String _titleCase(String k) {
    final s = k.replaceAll('_', ' ').trim();
    if (s.isEmpty) return s;
    return s[0].toUpperCase() + s.substring(1);
  }

  String _fmtMoney(double v) {
    if (v >= 10000000) return '${(v / 10000000).toStringAsFixed(2)} Cr';
    if (v >= 100000) return '${(v / 100000).toStringAsFixed(2)} L';
    if (v >= 1000) return '${(v / 1000).toStringAsFixed(1)}K';
    return v.toStringAsFixed(0);
  }
}
