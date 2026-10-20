import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../config/maan_theme.dart';
import '../../models/project.dart';
import '../../providers/project_provider.dart';
import '../../services/api_service.dart';
import '../../services/storage_service.dart';

/// Task 114 — Project Management module (mobile, web parity).
/// Live GET /api/projects — the SAME endpoint the web project-management
/// module renders; scoping/RBAC is enforced server-side.
class ProjectsHomeScreen extends StatelessWidget {
  const ProjectsHomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => ProjectProvider()..fetchProjects(refresh: true),
      child: const _ProjectsBody(),
    );
  }
}

class _ProjectsBody extends StatefulWidget {
  const _ProjectsBody();

  @override
  State<_ProjectsBody> createState() => _ProjectsBodyState();
}

class _ProjectsBodyState extends State<_ProjectsBody> {
  static const _filters = [
    ('', 'All'),
    ('active', 'Active'),
    ('draft', 'Draft'),
    ('on_hold', 'On Hold'),
    ('completed', 'Completed'),
  ];

  String _role = '';

  @override
  void initState() {
    super.initState();
    _loadRole();
  }

  void _loadRole() {
    final data = StorageService.getUserData();
    if (data != null) {
      try {
        final j = jsonDecode(data);
        if (j is Map<String, dynamic>) _role = (j['role'] ?? '').toString();
      } catch (_) {}
    }
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<ProjectProvider>();
    return Scaffold(
      backgroundColor: MaanColors.pageBg,
      floatingActionButton: _canCreate()
          ? FloatingActionButton.extended(
              backgroundColor: MaanColors.primary,
              foregroundColor: Colors.white,
              onPressed: () => _openCreateSheet(context),
              icon: const Icon(Icons.add_rounded, size: 20),
              label: const Text('New Project', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13)),
            )
          : null,
      body: Column(
        children: [
          MaanHeader(
            title: 'Project Management',
            onBack: () => Navigator.maybePop(context),
          ),
          Expanded(
            child: Container(
              width: double.infinity,
              margin: const EdgeInsets.only(top: 18),
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
              decoration: const BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.only(topLeft: Radius.circular(30), topRight: Radius.circular(30)),
              ),
              child: provider.isLoading && provider.projects.isEmpty
                  ? const Center(child: CircularProgressIndicator(color: MaanColors.primary))
                  : provider.error != null && provider.projects.isEmpty
                      ? _ErrorView(
                          message: provider.error!,
                          onRetry: () => context.read<ProjectProvider>().fetchProjects(refresh: true))
                      : RefreshIndicator(
                          color: MaanColors.primary,
                          onRefresh: () => context.read<ProjectProvider>().fetchProjects(refresh: true),
                          child: ListView(
                            padding: const EdgeInsets.only(bottom: 90, top: 2),
                            children: [
                              _summaryStrip(provider),
                              const SizedBox(height: 14),
                              MaanField(
                                label: 'Search',
                                hint: 'Search projects by name, code or client…',
                                prefix: const Icon(Icons.search_rounded, size: 20, color: MaanColors.faint),
                                onChanged: (v) => context.read<ProjectProvider>().setSearch(v),
                              ),
                              const SizedBox(height: 12),
                              SizedBox(
                                height: 34,
                                child: ListView.separated(
                                  scrollDirection: Axis.horizontal,
                                  itemCount: _filters.length,
                                  separatorBuilder: (_, __) => const SizedBox(width: 8),
                                  itemBuilder: (_, i) {
                                    final f = _filters[i];
                                    final selected = provider.statusFilter == f.$1;
                                    return GestureDetector(
                                      onTap: () => context.read<ProjectProvider>().setStatusFilter(f.$1),
                                      child: Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 14),
                                        alignment: Alignment.center,
                                        decoration: BoxDecoration(
                                          color: selected ? MaanColors.primary : Colors.white,
                                          borderRadius: BorderRadius.circular(17),
                                          border: Border.all(color: selected ? MaanColors.primary : MaanColors.line),
                                        ),
                                        child: Text(f.$2, style: TextStyle(
                                          fontSize: 12.5,
                                          fontWeight: FontWeight.w700,
                                          color: selected ? Colors.white : MaanColors.body,
                                        )),
                                      ),
                                    );
                                  },
                                ),
                              ),
                              const SizedBox(height: 14),
                              if (provider.projects.isEmpty)
                                Padding(
                                  padding: const EdgeInsets.only(top: 70),
                                  child: Column(children: const [
                                    Icon(Icons.folder_special_rounded, size: 62, color: MaanColors.faint),
                                    SizedBox(height: 12),
                                    Center(child: Text('No projects visible for your account', style: MaanText.body)),
                                    SizedBox(height: 4),
                                    Center(child: Text('Pull to refresh — projects created on the web appear here', style: MaanText.caption)),
                                  ]),
                                )
                              else
                                ...provider.projects.map((p) => Padding(
                                      padding: const EdgeInsets.only(bottom: 12),
                                      child: _ProjectCard(project: p, onTap: () async {
                                        await Navigator.pushNamed(context, '/projects/detail', arguments: p.id);
                                        if (mounted) context.read<ProjectProvider>().fetchProjects(refresh: false);
                                      }),
                                    )),
                            ],
                          ),
                        ),
            ),
          ),
        ],
      ),
    );
  }

  /// Same role set the server treats as project editors; the real policy is
  /// still enforced by the API — this only hides the button for viewers.
  bool _canCreate() {
    const roles = {'super_admin', 'tenant_admin', 'hr_admin', 'admin', 'manager'};
    return roles.contains(_role);
  }

  Widget _summaryStrip(ProjectProvider provider) {
    final rows = provider.projects;
    final active = rows.where((p) => p.status == 'active').length;
    final onHold = rows.where((p) => p.status == 'on_hold').length;
    final done = rows.where((p) => p.status == 'completed').length;
    final tasks = rows.fold<int>(0, (s, p) => s + p.taskCount);
    return Row(children: [
      _Stat(label: 'Total', value: '${provider.total}', color: MaanColors.primary),
      const SizedBox(width: 8),
      _Stat(label: 'Active', value: '$active', color: MaanColors.accentGreen),
      const SizedBox(width: 8),
      _Stat(label: 'On Hold', value: '$onHold', color: MaanColors.accentOrange),
      const SizedBox(width: 8),
      _Stat(label: 'Done', value: '$done', color: MaanColors.accentCyan),
      const SizedBox(width: 8),
      _Stat(label: 'Tasks', value: '$tasks', color: MaanColors.accentPurple),
    ]);
  }

  void _openCreateSheet(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (_) => const _CreateProjectSheet(),
    );
  }
}

// ── Summary stat pill ──────────────────────────────────────────────────
class _Stat extends StatelessWidget {
  final String label;
  final String value;
  final Color color;
  const _Stat({required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(
          color: color.withOpacity(0.08),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(children: [
          Text(value, style: TextStyle(fontSize: 17, fontWeight: FontWeight.w900, color: color)),
          const SizedBox(height: 2),
          Text(label, style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w600, color: MaanColors.body)),
        ]),
      ),
    );
  }
}

// ── Project card (list row) ────────────────────────────────────────────
class _ProjectCard extends StatelessWidget {
  final ProjectModel project;
  final VoidCallback onTap;
  const _ProjectCard({required this.project, required this.onTap});

  Color get _statusColor {
    switch (project.status) {
      case 'active':
        return MaanColors.accentGreen;
      case 'on_hold':
        return MaanColors.accentOrange;
      case 'completed':
        return MaanColors.accentCyan;
      case 'cancelled':
        return MaanColors.accentRed;
      default:
        return MaanColors.faint;
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = project;
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: MaanColors.line),
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Container(
                width: 38, height: 38,
                decoration: BoxDecoration(color: MaanColors.primary.withOpacity(0.1), borderRadius: BorderRadius.circular(10)),
                child: const Icon(Icons.folder_open_rounded, color: MaanColors.primary, size: 20),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(p.name, maxLines: 1, overflow: TextOverflow.ellipsis,
                      style: MaanText.title.copyWith(fontSize: 14)),
                  const SizedBox(height: 2),
                  Text([
                    if (p.code != null && p.code!.isNotEmpty) p.code!,
                    if (p.clientName != null && p.clientName!.isNotEmpty) p.clientName!,
                    p.typeLabel,
                  ].join(' · '), maxLines: 1, overflow: TextOverflow.ellipsis, style: MaanText.caption),
                ]),
              ),
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                decoration: BoxDecoration(color: _statusColor.withOpacity(0.12), borderRadius: BorderRadius.circular(12)),
                child: Text(p.statusLabel, style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w800, color: _statusColor)),
              ),
            ]),
            const SizedBox(height: 12),
            Row(children: [
              Expanded(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: LinearProgressIndicator(
                    value: p.progress / 100,
                    minHeight: 6,
                    backgroundColor: MaanColors.line,
                    valueColor: const AlwaysStoppedAnimation(MaanColors.primary),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Text('${p.progress}%', style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800, color: MaanColors.navy)),
            ]),
            const SizedBox(height: 10),
            Row(children: [
              const Icon(Icons.checklist_rounded, size: 13, color: MaanColors.faint),
              const SizedBox(width: 4),
              Text('${p.taskCount} tasks', style: MaanText.caption),
              const SizedBox(width: 12),
              const Icon(Icons.groups_rounded, size: 13, color: MaanColors.faint),
              const SizedBox(width: 4),
              Text('${p.allocationCount} team', style: MaanText.caption),
              const SizedBox(width: 12),
              const Icon(Icons.flag_rounded, size: 13, color: MaanColors.faint),
              const SizedBox(width: 4),
              Text('${p.milestoneCount} milestones', style: MaanText.caption),
              const Spacer(),
              if (p.endDate != null) Text('by ${_fmtDate(p.endDate!)}', style: MaanText.caption),
            ]),
          ]),
        ),
      ),
    );
  }

  static String _fmtDate(String iso) {
    try {
      return DateFormat('dd MMM, yy').format(DateTime.parse(iso).toLocal());
    } catch (_) {
      return iso.length >= 10 ? iso.substring(0, 10) : iso;
    }
  }
}

// ── Create-project bottom sheet (admin/manager) ───────────────────────
class _CreateProjectSheet extends StatefulWidget {
  const _CreateProjectSheet();

  @override
  State<_CreateProjectSheet> createState() => _CreateProjectSheetState();
}

class _CreateProjectSheetState extends State<_CreateProjectSheet> {
  final _name = TextEditingController();
  final _code = TextEditingController();
  final _budget = TextEditingController();
  DateTime? _startDate;
  String _type = 'internal';
  bool _saving = false;
  String? _error;
  List<Map<String, dynamic>> _companies = [];
  String? _companyId;
  bool _loadingCompanies = true;

  @override
  void initState() {
    super.initState();
    _loadCompanies();
  }

  Future<void> _loadCompanies() async {
    try {
      final res = await ApiService.getCompanies();
      setState(() {
        _companies = (res['companies'] ?? res['data'] ?? const [])
            .whereType<Map<String, dynamic>>()
            .toList();
        _companyId = _companies.isNotEmpty ? _companies.first['id']?.toString() : null;
        _loadingCompanies = false;
      });
    } catch (_) {
      setState(() => _loadingCompanies = false);
    }
  }

  Future<void> _submit() async {
    if (_name.text.trim().isEmpty) {
      setState(() => _error = 'Project name is required');
      return;
    }
    if (_companyId == null) {
      setState(() => _error = 'No company found in this workspace');
      return;
    }
    _startDate ??= DateTime.now();
    setState(() { _saving = true; _error = null; });
    try {
      await ApiService.createProject({
        'name': _name.text.trim(),
        if (_code.text.trim().isNotEmpty) 'code': _code.text.trim(),
        'companyId': _companyId,
        'projectType': _type,
        if (_budget.text.trim().isNotEmpty) 'budgetAmount': num.tryParse(_budget.text.trim()) ?? 0,
        'startDate': _startDate!.toIso8601String(),
      });
      if (!mounted) return;
      Navigator.pop(context);
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Project created — it is live on the web app too'),
          backgroundColor: MaanColors.accentGreen));
      context.read<ProjectProvider>().fetchProjects(refresh: false);
    } catch (e) {
      setState(() { _saving = false; _error = e.toString().replaceAll('Exception: ', ''); });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 18, 20, 24),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            const Expanded(child: Text('New Project', style: MaanText.h2)),
            IconButton(onPressed: () => Navigator.pop(context), icon: const Icon(Icons.close_rounded, size: 20)),
          ]),
          const Text('Created on the same server the web app uses', style: MaanText.caption),
          const SizedBox(height: 14),
          MaanField(label: 'Project name *', controller: _name),
          const SizedBox(height: 10),
          MaanField(label: 'Project code (optional)', controller: _code),
          const SizedBox(height: 10),
          _loadingCompanies
              ? const Padding(padding: EdgeInsets.all(8), child: Center(child: SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))))
              : _companies.isEmpty
                  ? const Text('No company configured in this workspace', style: TextStyle(color: MaanColors.accentRed, fontSize: 12.5))
                  : Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      decoration: BoxDecoration(border: Border.all(color: MaanColors.line), borderRadius: BorderRadius.circular(12)),
                      child: DropdownButtonFormField<String>(
                        value: _companyId,
                        decoration: const InputDecoration(border: InputBorder.none, labelText: 'Company', labelStyle: TextStyle(color: MaanColors.faint, fontSize: 13)),
                        dropdownColor: Colors.white,
                        items: _companies.map((c) => DropdownMenuItem(
                          value: c['id']?.toString(),
                          child: Text((c['name'] ?? '').toString(), style: const TextStyle(fontSize: 13)),
                        )).toList(),
                        onChanged: (v) => setState(() => _companyId = v),
                      ),
                    ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            children: [
              for (final t in const [('internal', 'Internal'), ('client', 'Client'), ('r_and_d', 'R&D'), ('support', 'Support')])
                ChoiceChip(
                  label: Text(t.$2, style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: _type == t.$1 ? Colors.white : MaanColors.body)),
                  selected: _type == t.$1,
                  selectedColor: MaanColors.primary,
                  backgroundColor: MaanColors.pageBg,
                  onSelected: (_) => setState(() => _type = t.$1),
                ),
            ],
          ),
          const SizedBox(height: 10),
          MaanField(label: 'Budget amount (optional)', controller: _budget, keyboard: TextInputType.number),
          const SizedBox(height: 10),
          InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: () async {
              final d = await showDatePicker(
                context: context,
                initialDate: _startDate ?? DateTime.now(),
                firstDate: DateTime(2020),
                lastDate: DateTime(2100),
              );
              if (d != null) setState(() => _startDate = d);
            },
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
              decoration: BoxDecoration(border: Border.all(color: MaanColors.line), borderRadius: BorderRadius.circular(12)),
              child: Text(
                _startDate == null ? 'Start date (defaults to today)' : 'Start: ${DateFormat('dd MMM, yyyy').format(_startDate!)}',
                style: TextStyle(fontSize: 13.5, color: _startDate == null ? MaanColors.faint : MaanColors.navy),
              ),
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 10),
            Text(_error!, style: const TextStyle(color: MaanColors.accentRed, fontSize: 12.5, fontWeight: FontWeight.w600)),
          ],
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity, height: 46,
            child: ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: MaanColors.primary, foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(13))),
              onPressed: _saving ? null : _submit,
              child: _saving
                  ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Text('Create Project', style: TextStyle(fontWeight: FontWeight.w800)),
            ),
          ),
        ]),
      ),
    );
  }
}

// ── Shared error view (reused by the detail screen too) ───────────────
class _ErrorView extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  const _ErrorView({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Icon(Icons.cloud_off_rounded, size: 56, color: MaanColors.faint),
          const SizedBox(height: 12),
          Text(message, textAlign: TextAlign.center, style: MaanText.body),
          const SizedBox(height: 14),
          OutlinedButton.icon(
            onPressed: onRetry,
            icon: const Icon(Icons.refresh_rounded, size: 18),
            label: const Text('Retry'),
            style: OutlinedButton.styleFrom(foregroundColor: MaanColors.primary, side: const BorderSide(color: MaanColors.primary)),
          ),
        ]),
      ),
    );
  }
}
