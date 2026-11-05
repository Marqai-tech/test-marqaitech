import 'dart:convert';
import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';
import '../../config/maan_theme.dart';
import '../../models/chat.dart';
import '../../models/project.dart';
import '../../providers/project_provider.dart';
import '../../screens/chat/chat_room_screen.dart';
import '../../services/api_service.dart';
import '../../utils/json_safe.dart';

/// Task 114 — project detail (Overview / Tasks / Milestones / Team).
/// Live GET /api/projects/[id] + task PATCH/POST — the exact endpoints the
/// web project-detail page uses; financials follow the server's RBAC gate.
/// Task 118 — every tab now carries its own add affordance for editors:
/// Tasks (fixed: the FAB used to disappear when the list was EMPTY, which
/// left fresh projects with no way to create the first task), Milestones
/// (new sheet → POST /api/projects/[id]/milestones) and Team (new sheet →
/// POST /api/projects/[id]/allocations).
class ProjectDetailScreen extends StatelessWidget {
  final String projectId;
  const ProjectDetailScreen({super.key, required this.projectId});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => ProjectDetailProvider()..load(projectId),
      child: _DetailBody(projectId: projectId),
    );
  }
}

class _DetailBody extends StatelessWidget {
  final String projectId;
  const _DetailBody({required this.projectId});

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<ProjectDetailProvider>();
    final p = provider.project;
    return Scaffold(
      backgroundColor: MaanColors.pageBg,
      body: Column(children: [
        MaanHeader(
          title: p?.name ?? 'Project',
          onBack: () => Navigator.maybePop(context),
        ),
        Expanded(
          child: Container(
            width: double.infinity,
            margin: const EdgeInsets.only(top: 18),
            decoration: const BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.only(topLeft: Radius.circular(30), topRight: Radius.circular(30)),
            ),
            child: provider.isLoading && p == null
                ? const Center(child: CircularProgressIndicator(color: MaanColors.primary))
                : provider.error != null && p == null
                    ? Center(
                        child: Padding(
                          padding: const EdgeInsets.all(28),
                          child: Column(mainAxisSize: MainAxisSize.min, children: [
                            const Icon(Icons.lock_outline_rounded, size: 52, color: MaanColors.faint),
                            const SizedBox(height: 12),
                            Text(provider.error!, textAlign: TextAlign.center, style: MaanText.body),
                            if (provider.error!.toLowerCase().contains('access')) ...[
                              const SizedBox(height: 6),
                              const Text(
                                'Ask the project manager or an admin to add you to this project (web → Project → Members).',
                                textAlign: TextAlign.center,
                                style: MaanText.caption,
                              ),
                            ],
                            const SizedBox(height: 12),
                            OutlinedButton.icon(
                              onPressed: () => provider.load(projectId, force: true),
                              icon: const Icon(Icons.refresh_rounded, size: 18),
                              label: const Text('Retry'),
                              style: OutlinedButton.styleFrom(foregroundColor: MaanColors.primary, side: const BorderSide(color: MaanColors.primary)),
                            ),
                          ]),
                        ),
                      )
                    : _Tabs(provider: provider),
          ),
        ),
      ]),
    );
  }
}

// ══ Tabs ══════════════════════════════════════════════════════════════
// ══ Shared add affordances (Task 118) ══════════════════════════════
/// Labelled FAB — a bare "+" was too easy to miss (user report: "no option
/// is provided"), so every add action now says what it does.
class _AddFab extends StatelessWidget {
  final String label;
  final String heroTag;
  final VoidCallback onPressed;
  const _AddFab({required this.label, required this.heroTag, required this.onPressed});

  @override
  Widget build(BuildContext context) {
    return FloatingActionButton.extended(
      heroTag: heroTag,
      backgroundColor: MaanColors.primary,
      foregroundColor: Colors.white,
      elevation: 2,
      onPressed: onPressed,
      icon: const Icon(Icons.add_rounded, size: 18),
      label: Text(label, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12.5)),
    );
  }
}

/// Pill button used inside empty states so the FIRST task/milestone/member
/// can always be created (Task 118 regression fix).
class _AddPill extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  const _AddPill({required this.icon, required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return OutlinedButton.icon(
      onPressed: onTap,
      icon: Icon(icon, size: 17),
      label: Text(label),
      style: OutlinedButton.styleFrom(
        foregroundColor: MaanColors.primary,
        side: const BorderSide(color: MaanColors.primary),
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        textStyle: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13),
      ),
    );
  }
}

class _Tabs extends StatelessWidget {
  final ProjectDetailProvider provider;
  const _Tabs({required this.provider});

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 5,
      child: Column(children: [
        const TabBar(
          labelColor: MaanColors.primary,
          unselectedLabelColor: MaanColors.faint,
          indicatorColor: MaanColors.primary,
          labelStyle: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800),
          unselectedLabelStyle: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600),
          isScrollable: true,
          tabAlignment: TabAlignment.start,
          tabs: [
            Tab(text: 'Overview'),
            Tab(text: 'Tasks'),
            Tab(text: 'Milestones'),
            Tab(text: 'Team'),
            Tab(text: 'Files'),
          ],
        ),
        Expanded(
          child: provider.error != null && provider.project != null
              ? _BarError(message: provider.error!, onDismiss: provider.clearTransientError, onRetry: () => provider.load(provider.project!.id, force: true))
              : TabBarView(children: [
                  _OverviewTab(provider: provider),
                  _TasksTab(provider: provider),
                  _MilestonesTab(provider: provider),
                  _TeamTab(provider: provider),
                  _FilesTab(provider: provider),
                ]),
        ),
      ]),
    );
  }
}

class _BarError extends StatelessWidget {
  final String message;
  final VoidCallback onDismiss;
  final VoidCallback onRetry;
  const _BarError({required this.message, required this.onDismiss, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return ListView(padding: const EdgeInsets.all(16), children: [
      Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: MaanColors.accentRed.withOpacity(0.08), borderRadius: BorderRadius.circular(12)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            const Icon(Icons.error_outline_rounded, color: MaanColors.accentRed, size: 18),
            const SizedBox(width: 8),
            Expanded(child: Text(message, style: const TextStyle(color: MaanColors.accentRed, fontSize: 12.5, fontWeight: FontWeight.w700))),
          ]),
          const SizedBox(height: 8),
          Row(children: [
            TextButton(onPressed: onRetry, child: const Text('Retry', style: TextStyle(fontSize: 12.5))),
            TextButton(onPressed: onDismiss, child: const Text('Dismiss', style: TextStyle(fontSize: 12.5))),
          ]),
        ]),
      ),
    ]);
  }
}

// ══ Overview tab ══════════════════════════════════════════════════════
class _OverviewTab extends StatelessWidget {
  final ProjectDetailProvider provider;
  const _OverviewTab({required this.provider});

  @override
  Widget build(BuildContext context) {
    final p = provider.project!;
    return ListView(padding: const EdgeInsets.all(16), children: [
      // Progress hero card
      Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          gradient: const LinearGradient(colors: [MaanColors.primary, Color(0xFF7C9BF0)]),
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Expanded(child: Text(p.name, style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w800))),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(color: Colors.white.withOpacity(0.2), borderRadius: BorderRadius.circular(12)),
              child: Text(p.statusLabel, style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w800)),
            ),
          ]),
          const SizedBox(height: 12),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: p.progress / 100, minHeight: 8,
              backgroundColor: Colors.white.withOpacity(0.25),
              valueColor: const AlwaysStoppedAnimation(Colors.white),
            ),
          ),
          const SizedBox(height: 6),
          Text('${p.progress}% complete', style: const TextStyle(color: Colors.white70, fontSize: 11.5, fontWeight: FontWeight.w700)),
        ]),
      ),
      const SizedBox(height: 14),
      _infoRows(p, provider),
      if (p.description != null && p.description!.trim().isNotEmpty) ...[
        const SizedBox(height: 14),
        const Text('Description', style: MaanText.h2),
        const SizedBox(height: 8),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(color: MaanColors.pageBg, borderRadius: BorderRadius.circular(12)),
          child: Text(p.description!, style: MaanText.body.copyWith(fontSize: 13)),
        ),
      ],
      const SizedBox(height: 20),
    ]);
  }

  Widget _infoRows(ProjectModel p, ProjectDetailProvider provider) {
    String? fmt(String? iso) {
      if (iso == null) return null;
      try {
        return DateFormat('dd MMM, yyyy').format(DateTime.parse(iso).toLocal());
      } catch (_) {
        return iso.length >= 10 ? iso.substring(0, 10) : iso;
      }
    }

    String money(num v) {
      final f = NumberFormat.decimalPattern('en_IN');
      return '${p.currency} ${f.format(v)}';
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
      decoration: BoxDecoration(border: Border.all(color: MaanColors.line), borderRadius: BorderRadius.circular(14)),
      child: Column(children: [
        _row('Type', p.typeLabel),
        _divider(),
        if (p.clientName != null && p.clientName!.isNotEmpty) ...[
          _row('Client', p.clientName!),
          _divider(),
        ],
        if (p.departmentName != null && p.departmentName!.isNotEmpty) ...[
          _row('Department', p.departmentName!),
          _divider(),
        ],
        if (p.companyName != null && p.companyName!.isNotEmpty) ...[
          _row('Company', p.companyName!),
          _divider(),
        ],
        _row('Start date', fmt(p.startDate) ?? '—'),
        _divider(),
        _row('Target end', fmt(p.endDate) ?? '—'),
        _divider(),
        // Financials are server-gated (project-rbac): only shown when the
        // access object says canViewFinancials — same as the web page.
        if (provider.canSeeFinancials) ...[
          _row('Budget', money(p.budgetAmount)),
          _divider(),
          _row('Billing', p.billingType == 'non_billable' ? 'Non-billable' : p.billingType.replaceAll('_', ' ')),
          _divider(),
          _row('Estimated hours', '${p.estimatedHours}'),
          _divider(),
          _row('Actual hours', '${p.actualHours}'),
          _divider(),
        ],
        _row('Tasks · Milestones · Team', '${p.taskCount} · ${p.milestoneCount} · ${p.allocationCount}'),
      ]),
    );
  }

  Widget _row(String k, String v) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Row(children: [
          Expanded(child: Text(k, style: const TextStyle(fontSize: 12.5, color: MaanColors.body))),
          Flexible(child: Text(v, textAlign: TextAlign.right,
              style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: MaanColors.navy))),
        ]),
      );

  Widget _divider() => const Divider(height: 1, color: MaanColors.line);
}

// ══ Tasks tab ═════════════════════════════════════════════════════════
class _TasksTab extends StatelessWidget {
  final ProjectDetailProvider provider;
  const _TasksTab({required this.provider});

  @override
  Widget build(BuildContext context) {
    final groups = provider.tasksByStatus;
    final total = groups.values.fold<int>(0, (s, l) => s + l.length);
    // Task 118 FIX: the early return below used to SKIP the Stack that
    // carried the add-task FAB — a project with zero tasks (both LIVE
    // projects start at zero) had NO way to create the first one. The
    // empty state now carries its own "New Task" pill + FAB.
    if (total == 0) {
      return Stack(children: [
        ListView(padding: const EdgeInsets.only(top: 60), children: [
          const Icon(Icons.checklist_rounded, size: 56, color: MaanColors.faint),
          const SizedBox(height: 12),
          const Center(child: Text('No tasks on this project yet', style: MaanText.body)),
          if (provider.canEdit) ...[
            const SizedBox(height: 16),
            Center(
              child: _AddPill(
                icon: Icons.add_task_rounded,
                label: 'New Task',
                onTap: () => _openCreateTask(context, provider),
              ),
            ),
          ],
        ]),
        if (provider.canEdit)
          Positioned(
            right: 16, bottom: 16,
            child: _AddFab(label: 'New Task', heroTag: 'addTask', onPressed: () => _openCreateTask(context, provider)),
          ),
      ]);
    }
    return Stack(children: [
      ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 90),
        children: [
          for (final entry in groups.entries)
            if (entry.value.isNotEmpty) ...[
              _StatusHeader(status: entry.key, count: entry.value.length),
              ...entry.value.map((t) => Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: _TaskCard(task: t, provider: provider),
                  )),
              const SizedBox(height: 6),
            ],
        ],
      ),
      if (provider.canEdit)
        Positioned(
          right: 16, bottom: 16,
          child: _AddFab(label: 'New Task', heroTag: 'addTask', onPressed: () => _openCreateTask(context, provider)),
        ),
    ]);
  }

  void _openCreateTask(BuildContext context, ProjectDetailProvider provider) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (_) => _CreateTaskSheet(provider: provider),
    );
  }
}

class _StatusHeader extends StatelessWidget {
  final String status;
  final int count;
  const _StatusHeader({required this.status, required this.count});

  Color get _color {
    switch (status) {
      case 'in_progress':
        return MaanColors.primary;
      case 'review':
        return MaanColors.accentOrange;
      case 'done':
        return MaanColors.accentGreen;
      default:
        return MaanColors.faint;
    }
  }

  String get _label {
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

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(children: [
        Container(width: 8, height: 8, decoration: BoxDecoration(color: _color, shape: BoxShape.circle)),
        const SizedBox(width: 8),
        Text('$_label · $count', style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: MaanColors.navy)),
      ]),
    );
  }
}

class _TaskCard extends StatelessWidget {
  final ProjectTaskModel task;
  final ProjectDetailProvider provider;
  const _TaskCard({required this.task, required this.provider});

  Color get _priorityColor {
    switch (task.priority) {
      case 'critical':
        return MaanColors.accentRed;
      case 'high':
        return MaanColors.accentOrange;
      case 'low':
        return MaanColors.faint;
      default:
        return MaanColors.accentCyan;
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = task;
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: provider.canEdit ? () => _openMoveSheet(context) : null,
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: MaanColors.line),
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Expanded(child: Text(t.name, style: MaanText.title.copyWith(fontSize: 13.5))),
              const SizedBox(width: 8),
              if (t.attachmentCount > 0)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                  decoration: BoxDecoration(color: MaanColors.faint.withOpacity(0.10), borderRadius: BorderRadius.circular(10)),
                  child: Text('📎 ${t.attachmentCount}', style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: MaanColors.body)),
                ),
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(color: _priorityColor.withOpacity(0.12), borderRadius: BorderRadius.circular(10)),
                child: Text(t.priorityLabel, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: _priorityColor)),
              ),
            ]),
            // Task 129 — the task description is now visible on the card
            if (t.description != null && t.description!.trim().isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(
                t.description!,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: MaanText.caption.copyWith(fontSize: 11.5, color: MaanColors.body),
              ),
            ],
            const SizedBox(height: 6),
            Wrap(spacing: 10, runSpacing: 4, children: [
              if (t.assignedToName != null && t.assignedToName!.isNotEmpty)
                _meta(Icons.person_rounded, t.assignedToName!),
              if (t.taskTypeLabel != null)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                  decoration: BoxDecoration(color: MaanColors.primary.withOpacity(0.08), borderRadius: BorderRadius.circular(8)),
                  child: Text(t.taskTypeLabel!, style: TextStyle(fontSize: 9.5, fontWeight: FontWeight.w800, color: MaanColors.primary)),
                ),
              if (t.workflowStepLabel != null)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                  decoration: BoxDecoration(color: _stepColor(t.workflowStep).withOpacity(0.12), borderRadius: BorderRadius.circular(8)),
                  child: Text(t.workflowStepLabel!, style: TextStyle(fontSize: 9.5, fontWeight: FontWeight.w800, color: _stepColor(t.workflowStep))),
                ),
              if (t.milestoneName != null) _meta(Icons.flag_rounded, t.milestoneName!),
              if (t.sprintName != null) _meta(Icons.loop_rounded, t.sprintName!),
              if (t.plannedStart != null)
                _meta(Icons.play_arrow_rounded, 'start ${_fmt(t.plannedStart!)}'),
              if (t.plannedEnd != null)
                _meta(Icons.event_rounded, 'end ${_fmt(t.plannedEnd!)}'),
              if (t.dependsOnName != null)
                _meta(Icons.link_rounded, 'after: ${t.dependsOnName}'),
              _meta(Icons.schedule_rounded, '${t.estimatedHours}h est.'),
            ]),
            if (provider.canEdit) ...[
              const SizedBox(height: 8),
              Row(children: [
                Text('Tap to update status / workflow step', style: MaanText.caption.copyWith(fontSize: 10.5)),
                const Spacer(),
                const Icon(Icons.chevron_right_rounded, size: 16, color: MaanColors.faint),
              ]),
            ],
          ]),
        ),
      ),
    );
  }

  Widget _meta(IconData i, String text) => Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(i, size: 12, color: MaanColors.faint),
        const SizedBox(width: 3),
        Text(text, style: MaanText.caption.copyWith(fontSize: 10.5)),
      ]);

  String _fmt(String iso) {
    try {
      return DateFormat('dd MMM').format(DateTime.parse(iso).toLocal());
    } catch (_) {
      return iso.length >= 10 ? iso.substring(0, 10) : iso;
    }
  }

  /// Task 128 — delivery workflow step accent colors.
  static Color _stepColor(String? step) {
    switch (step) {
      case 'testing':
        return const Color(0xFF0284C7); // sky
      case 're_testing':
        return MaanColors.accentOrange;
      case 'production':
        return const Color(0xFF7C3AED); // violet
      case 'delivery':
        return MaanColors.accentGreen;
      default:
        return MaanColors.faint;
    }
  }

  void _openMoveSheet(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (sheetCtx) => _TaskUpdateSheet(task: task, provider: provider),
    );
  }
}

// ══ Task-update sheet (Task 128): status + delivery workflow step ══════
// Workflow rule: moving to re_testing sends the task BACK to the assignee
// itself; every other step asks for the assignee again (required picker).
class _TaskUpdateSheet extends StatefulWidget {
  final ProjectTaskModel task;
  final ProjectDetailProvider provider;
  const _TaskUpdateSheet({required this.task, required this.provider});

  /// Parses the task's ISO date strings for the update-sheet pickers.
  static DateTime? _parseDate(String? iso) {
    if (iso == null || iso.isEmpty) return null;
    try {
      return DateTime.parse(iso).toLocal();
    } catch (_) {
      return null;
    }
  }

  @override
  State<_TaskUpdateSheet> createState() => _TaskUpdateSheetState();
}

class _TaskUpdateSheetState extends State<_TaskUpdateSheet> {
  late String _status = widget.task.status;
  late String? _step = widget.task.workflowStep;
  late String? _assigneeId = widget.task.assignedToId;
  // Task 129 — full task editing: description, start/end dates, hrs + attachments
  late final TextEditingController _desc;
  late final TextEditingController _est;
  DateTime? _plannedStart;
  DateTime? _plannedEnd;
  List<dynamic> _attachments = [];
  bool _loadingAtts = false;
  bool _uploadingAtts = false;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _desc = TextEditingController(text: widget.task.description ?? '');
    _est = TextEditingController(text: widget.task.estimatedHours > 0 ? widget.task.estimatedHours.toString() : '');
    try {
      if ((widget.task.plannedStart ?? '').isNotEmpty) _plannedStart = DateTime.parse(widget.task.plannedStart!).toLocal();
      if ((widget.task.plannedEnd ?? '').isNotEmpty) _plannedEnd = DateTime.parse(widget.task.plannedEnd!).toLocal();
    } catch (_) {}
    _loadAttachments();
  }

  @override
  void dispose() {
    _desc.dispose();
    _est.dispose();
    super.dispose();
  }

  String get _projectId => widget.task.projectId;

  Future<void> _loadAttachments() async {
    setState(() => _loadingAtts = true);
    try {
      final rows = await ApiService.getTaskAttachments(_projectId, widget.task.id);
      if (!mounted) return;
      setState(() => _attachments = rows);
    } catch (_) {
      /* non-fatal */
    } finally {
      if (mounted) setState(() => _loadingAtts = false);
    }
  }

  Future<void> _attachFiles() async {
    final result = await FilePicker.platform.pickFiles(type: FileType.any, withData: true);
    final files = result?.files.where((f) => f.bytes != null).toList() ?? [];
    if (files.isEmpty) return;
    setState(() => _uploadingAtts = true);
    try {
      int uploaded = 0;
      for (final f in files) {
        final bytes = f.bytes!;
        if (bytes.length > 3 * 1024 * 1024) {
          if (!mounted) continue;
          ScaffoldMessenger.of(context)
            ..hideCurrentSnackBar()
            ..showSnackBar(SnackBar(content: Text('"${f.name}" exceeds the 3 MB limit'), backgroundColor: MaanColors.accentRed));
          continue;
        }
        await ApiService.createTaskAttachment(
          _projectId,
          widget.task.id,
          fileName: f.name,
          mimeType: _mimeForExtension((f.extension ?? '').toLowerCase()),
          bytes: bytes,
        );
        uploaded++;
      }
      if (!mounted) return;
      if (uploaded > 0) {
        ScaffoldMessenger.of(context)
          ..hideCurrentSnackBar()
          ..showSnackBar(SnackBar(content: Text('$uploaded attachment${uploaded == 1 ? '' : 's'} added'), backgroundColor: MaanColors.accentGreen));
        await _loadAttachments();
      }
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString().replaceAll('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _uploadingAtts = false);
    }
  }

  Future<void> _openAttachment(Map<String, dynamic> a) async {
    try {
      final bytes = await ApiService.fetchTaskAttachmentBytes(_projectId, (a['id'] ?? '').toString());
      final name = (a['fileName'] ?? 'file').toString();
      final mime = (a['mimeType'] ?? 'application/octet-stream').toString();
      await Share.shareXFiles([XFile.fromData(bytes, name: name, mimeType: mime)], text: name);
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not open the attachment'), backgroundColor: MaanColors.accentRed));
    }
  }

  static String _mimeForExtension(String ext) {
    switch (ext) {
      case 'pdf': return 'application/pdf';
      case 'png': return 'image/png';
      case 'jpg': case 'jpeg': return 'image/jpeg';
      case 'gif': return 'image/gif';
      case 'webp': return 'image/webp';
      case 'txt': case 'log': return 'text/plain';
      case 'csv': return 'text/csv';
      case 'doc': return 'application/msword';
      case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      case 'xls': return 'application/vnd.ms-excel';
      case 'xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      case 'zip': return 'application/zip';
      case 'json': return 'application/json';
      default: return 'application/octet-stream';
    }
  }

  static const _steps = <(String, String)>[
    ('testing', 'Testing'),
    ('re_testing', 'Re-testing'),
    ('production', 'Production'),
    ('delivery', 'Delivery'),
  ];

  bool get _stepChanged => _step != null && _step != widget.task.workflowStep;
  bool get _needsAssignee => _stepChanged && _step != 're_testing' && (_assigneeId == null || _assigneeId!.isEmpty);

  Future<void> _save() async {
    if (_needsAssignee) {
      setState(() => _error = 'Select the assignee for this workflow step — the assignee is asked again on every step change except re-testing');
      return;
    }
    final body = <String, dynamic>{};
    if (_status != widget.task.status) body['status'] = _status;
    if (_stepChanged) {
      body['workflowStep'] = _step;
      if (_step == 're_testing') {
        // re-testing → the task goes back to the assignee itself (server keeps it)
      } else {
        body['assignedToId'] = _assigneeId;
      }
    }
    // Task 129 — description / dates / hrs persist with the same PATCH
    final desc = _desc.text.trim();
    if (desc != (widget.task.description ?? '').trim()) body['description'] = desc.isEmpty ? null : desc;
    final est = num.tryParse(_est.text.trim());
    if (est != null && est != widget.task.estimatedHours) body['estimatedHours'] = est;
    if (_plannedStart != _TaskUpdateSheet._parseDate(widget.task.plannedStart)) {
      body['plannedStart'] = _plannedStart?.toIso8601String();
    }
    if (_plannedEnd != _TaskUpdateSheet._parseDate(widget.task.plannedEnd)) {
      body['plannedEnd'] = _plannedEnd?.toIso8601String();
    }
    if (body.isEmpty) {
      Navigator.pop(context);
      return;
    }
    setState(() { _saving = true; _error = null; });
    try {
      await widget.provider.updateTask(widget.task.id, body);
      if (!mounted) return;
      Navigator.pop(context);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(_stepChanged
              ? 'Task moved to ${_stepLabel(_step!)} — assignee, manager & admins notified'
              : 'Task updated'),
          backgroundColor: MaanColors.accentGreen));
    } catch (e) {
      setState(() { _saving = false; _error = e.toString().replaceAll('Exception: ', ''); });
    }
  }

  static String _stepLabel(String s) {
    switch (s) {
      case 'testing': return 'Testing';
      case 're_testing': return 'Re-testing';
      case 'production': return 'Production';
      case 'delivery': return 'Delivery';
      default: return s;
    }
  }

  @override
  Widget build(BuildContext context) {
    final team = widget.provider.team;
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Expanded(child: Text('Update "${widget.task.name}"', style: MaanText.h2.copyWith(fontSize: 15))),
            IconButton(onPressed: () => Navigator.pop(context), icon: const Icon(Icons.close_rounded, size: 20)),
          ]),
          const Padding(
            padding: EdgeInsets.only(bottom: 8),
            child: Text('Finish-to-start dependencies are enforced by the server', style: MaanText.caption),
          ),
          const Text('STATUS', style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w800, color: MaanColors.faint, letterSpacing: 0.6)),
          const SizedBox(height: 4),
          for (final s in const ['todo', 'in_progress', 'review', 'done'])
            ListTile(
              dense: true,
              visualDensity: VisualDensity.compact,
              leading: Icon(
                _status == s ? Icons.radio_button_checked : Icons.radio_button_off,
                color: _status == s ? MaanColors.primary : MaanColors.faint,
                size: 20,
              ),
              title: Text(_statusLabel(s), style: TextStyle(
                fontSize: 13.5,
                fontWeight: _status == s ? FontWeight.w800 : FontWeight.w500,
                color: _status == s ? MaanColors.primary : MaanColors.navy,
              )),
              onTap: () => setState(() => _status = s),
            ),
          const SizedBox(height: 8),
          const Text('WORKFLOW STEP', style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w800, color: MaanColors.faint, letterSpacing: 0.6)),
          const SizedBox(height: 4),
          for (final st in _steps)
            ListTile(
              dense: true,
              visualDensity: VisualDensity.compact,
              leading: Icon(
                _step == st.$1 ? Icons.radio_button_checked : Icons.radio_button_off,
                color: _step == st.$1 ? MaanColors.primary : MaanColors.faint,
                size: 20,
              ),
              title: Text(st.$2, style: TextStyle(
                fontSize: 13.5,
                fontWeight: _step == st.$1 ? FontWeight.w800 : FontWeight.w500,
                color: _step == st.$1 ? MaanColors.primary : MaanColors.navy,
              )),
              onTap: () {
                setState(() {
                  _step = st.$1;
                  // Re-testing → the task goes BACK to the assignee itself.
                  if (st.$1 == 're_testing') _assigneeId = widget.task.assignedToId;
                  if (_error != null) _error = null;
                });
              },
            ),
          if (_step != null) ...[
            const SizedBox(height: 6),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: (_step == 're_testing' ? MaanColors.accentOrange : const Color(0xFF0284C7)).withOpacity(0.08),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                _step == 're_testing'
                    ? 'Re-testing: this task goes back to the assignee itself — no reassignment needed.'
                    : '${_stepLabel(_step!)}: pick the assignee again for this step.',
                style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600, color: _step == 're_testing' ? MaanColors.accentOrange : const Color(0xFF0284C7)),
              ),
            ),
          ],
          if (_needsAssignee) ...[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              decoration: BoxDecoration(border: Border.all(color: MaanColors.accentRed), borderRadius: BorderRadius.circular(12)),
              child: Builder(builder: (ctx) {
                // DropdownButtonFormField crashes when value ∉ items — only
                // preselect the current assignee if they are in the team list.
                final validIds = <String>{for (final m in team) if (m.employeeId != null && m.employeeId!.isNotEmpty) m.employeeId!};
                return DropdownButtonFormField<String>(
                  value: (_assigneeId != null && validIds.contains(_assigneeId)) ? _assigneeId : null,
                  decoration: const InputDecoration(border: InputBorder.none, labelText: 'Assignee for this step *', labelStyle: TextStyle(color: MaanColors.accentRed, fontSize: 13)),
                  dropdownColor: Colors.white,
                  items: () {
                    final seen = <String>{};
                    final items = <DropdownMenuItem<String>>[];
                    for (final m in team) {
                      final id = m.employeeId;
                      if (id == null || id.isEmpty || !seen.add(id)) continue;
                      if ((m.employeeName ?? '').isEmpty) continue;
                      items.add(DropdownMenuItem(value: id, child: Text(m.employeeName!, style: const TextStyle(fontSize: 13))));
                    }
                    return items;
                  }(),
                  onChanged: (v) => setState(() { _assigneeId = v; _error = null; }),
                );
              }),
            ),
          ],
          // ── Task 129 — description / start & end dates / hrs editing ──
          const SizedBox(height: 12),
          const Text('DESCRIPTION', style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w800, color: MaanColors.faint, letterSpacing: 0.6)),
          const SizedBox(height: 4),
          MaanField(label: 'Task description', controller: _desc, maxLines: 3),
          const SizedBox(height: 10),
          Row(children: [
            Expanded(
              child: InkWell(
                borderRadius: BorderRadius.circular(12),
                onTap: () async {
                  final d = await showDatePicker(
                    context: context,
                    initialDate: _plannedStart ?? DateTime.now(),
                    firstDate: DateTime(2020),
                    lastDate: DateTime(2100),
                  );
                  if (d != null) setState(() => _plannedStart = d);
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
                  decoration: BoxDecoration(border: Border.all(color: MaanColors.line), borderRadius: BorderRadius.circular(12)),
                  child: Text(
                    _plannedStart == null ? 'Start date' : DateFormat('dd MMM, yyyy').format(_plannedStart!),
                    style: TextStyle(fontSize: 12, color: _plannedStart == null ? MaanColors.faint : MaanColors.navy),
                  ),
                ),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: InkWell(
                borderRadius: BorderRadius.circular(12),
                onTap: () async {
                  final d = await showDatePicker(
                    context: context,
                    initialDate: _plannedEnd ?? _plannedStart ?? DateTime.now(),
                    firstDate: DateTime(2020),
                    lastDate: DateTime(2100),
                  );
                  if (d != null) setState(() => _plannedEnd = d);
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
                  decoration: BoxDecoration(border: Border.all(color: MaanColors.line), borderRadius: BorderRadius.circular(12)),
                  child: Text(
                    _plannedEnd == null ? 'End date' : DateFormat('dd MMM, yyyy').format(_plannedEnd!),
                    style: TextStyle(fontSize: 12, color: _plannedEnd == null ? MaanColors.faint : MaanColors.navy),
                  ),
                ),
              ),
            ),
          ]),
          const SizedBox(height: 10),
          MaanField(label: 'Hrs (estimated hours)', controller: _est, keyboard: TextInputType.number),
          const SizedBox(height: 12),
          // ── Task 129 — attachments (screenshots, docs) ──
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(border: Border.all(color: MaanColors.line), borderRadius: BorderRadius.circular(12)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                const Expanded(child: Text('ATTACHMENTS', style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w800, color: MaanColors.faint, letterSpacing: 0.6))),
                InkWell(
                  onTap: _uploadingAtts ? null : _attachFiles,
                  borderRadius: BorderRadius.circular(10),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                    decoration: BoxDecoration(color: MaanColors.primary.withOpacity(0.10), borderRadius: BorderRadius.circular(10)),
                    child: _uploadingAtts
                        ? const SizedBox(width: 12, height: 12, child: CircularProgressIndicator(strokeWidth: 2, color: MaanColors.primary))
                        : const Row(mainAxisSize: MainAxisSize.min, children: [
                            Icon(Icons.attach_file_rounded, size: 13, color: MaanColors.primary),
                            SizedBox(width: 3),
                            Text('Attach', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: MaanColors.primary)),
                          ]),
                  ),
                ),
              ]),
              const SizedBox(height: 6),
              if (_loadingAtts)
                const Padding(padding: EdgeInsets.symmetric(vertical: 6), child: Text('Loading attachments…', style: MaanText.caption))
              else if (_attachments.isEmpty)
                const Text('No attachments yet — attach screenshots, PDFs, docs (≤3 MB).', style: MaanText.caption)
              else
                ..._attachments.map((raw) {
                  final a = (raw is Map<String, dynamic>) ? raw : Map<String, dynamic>.from(raw as Map);
                  final name = (a['fileName'] ?? 'file').toString();
                  final size = (a['fileSize'] is num) ? (a['fileSize'] as num).toInt() : 0;
                  return InkWell(
                    onTap: () => _openAttachment(a),
                    borderRadius: BorderRadius.circular(8),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 4),
                      child: Row(children: [
                        const Icon(Icons.insert_drive_file_rounded, size: 14, color: MaanColors.faint),
                        const SizedBox(width: 6),
                        Expanded(child: Text(name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, color: MaanColors.navy))),
                        Text(size >= 1024 ? '${(size / 1024).round()} KB' : '$size B', style: MaanText.caption.copyWith(fontSize: 10)),
                      ]),
                    ),
                  );
                }),
            ]),
          ),
          if (_error != null) ...[
            const SizedBox(height: 10),
            Text(_error!, style: const TextStyle(color: MaanColors.accentRed, fontSize: 12, fontWeight: FontWeight.w600)),
          ],
          const SizedBox(height: 14),
          SizedBox(
            width: double.infinity, height: 44,
            child: ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: MaanColors.primary, foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
              onPressed: _saving ? null : _save,
              child: _saving
                  ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Text('Save Changes', style: TextStyle(fontWeight: FontWeight.w800)),
            ),
          ),
        ]),
      ),
    );
  }

  static String _statusLabel(String s) {
    switch (s) {
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
}

// ══ Create-task sheet ═════════════════════════════════════════════════
class _CreateTaskSheet extends StatefulWidget {
  final ProjectDetailProvider provider;
  const _CreateTaskSheet({required this.provider});

  @override
  State<_CreateTaskSheet> createState() => _CreateTaskSheetState();
}

class _CreateTaskSheetState extends State<_CreateTaskSheet> {
  final _name = TextEditingController();
  final _est = TextEditingController();
  final _desc = TextEditingController();
  String _priority = 'medium';
  String? _assigneeId;
  // Task 128 — unified create form: task type + delivery workflow step
  String _taskType = 'development';
  String _workflowStep = 'testing';
  // Task 129 — full parity: description + start/end dates + hrs
  DateTime? _plannedStart;
  DateTime? _plannedEnd;
  // Task 131 — attach files at CREATION (uploaded right after the task exists)
  final List<PlatformFile> _pendingFiles = [];
  bool _uploadingAtts = false;
  bool _saving = false;
  String? _error;

  static const _taskTypes = <(String, String)>[
    ('customisation', 'Customisation'),
    ('rework', 'Rework'),
    ('development', 'Development'),
    ('bug', 'Bug'),
  ];

  static const _workflowSteps = <(String, String)>[
    ('testing', 'Testing'),
    ('re_testing', 'Re-testing'),
    ('production', 'Production'),
    ('delivery', 'Delivery'),
  ];

  @override
  Widget build(BuildContext context) {
    final team = widget.provider.team;
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 18, 20, 24),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            const Expanded(child: Text('New Task', style: MaanText.h2)),
            IconButton(onPressed: () => Navigator.pop(context), icon: const Icon(Icons.close_rounded, size: 20)),
          ]),
          const SizedBox(height: 12),
          MaanField(label: 'Task name *', controller: _name),
          const SizedBox(height: 10),
          const Text('TASK TYPE', style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w800, color: MaanColors.faint, letterSpacing: 0.6)),
          const SizedBox(height: 6),
          Wrap(spacing: 8, runSpacing: 6, children: [
            for (final tt in _taskTypes)
              ChoiceChip(
                label: Text(tt.$2, style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: _taskType == tt.$1 ? Colors.white : MaanColors.body)),
                selected: _taskType == tt.$1,
                selectedColor: MaanColors.primary,
                backgroundColor: MaanColors.pageBg,
                onSelected: (_) => setState(() => _taskType = tt.$1),
              ),
          ]),
          const SizedBox(height: 10),
          const Text('WORKFLOW STEP', style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w800, color: MaanColors.faint, letterSpacing: 0.6)),
          const SizedBox(height: 6),
          Wrap(spacing: 8, runSpacing: 6, children: [
            for (final st in _workflowSteps)
              ChoiceChip(
                label: Text(st.$2, style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: _workflowStep == st.$1 ? Colors.white : MaanColors.body)),
                selected: _workflowStep == st.$1,
                selectedColor: const Color(0xFF0D9488),
                backgroundColor: MaanColors.pageBg,
                onSelected: (_) => setState(() {
                  _workflowStep = st.$1;
                  // Re-testing → the task goes BACK to the assignee itself.
                  if (st.$1 == 're_testing') _assigneeId = null;
                  if (_error != null) _error = null;
                }),
              ),
          ]),
          const SizedBox(height: 6),
          Text(
            _workflowStep == 're_testing'
                ? 'Re-testing: the task goes back to the assignee itself — assigning is optional.'
                : 'Every step except re-testing asks for the assignee again.',
            style: MaanText.caption.copyWith(fontSize: 10.5),
          ),
          const SizedBox(height: 10),
          if (team.isNotEmpty)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              decoration: BoxDecoration(border: Border.all(color: MaanColors.line), borderRadius: BorderRadius.circular(12)),
              child: DropdownButtonFormField<String>(
                value: _assigneeId,
                decoration: const InputDecoration(border: InputBorder.none, labelText: 'Assign to (team member)', labelStyle: TextStyle(color: MaanColors.faint, fontSize: 13)),
                dropdownColor: Colors.white,
                // dedupe by employeeId — duplicate/null DropdownMenuItem values crash the sheet
                items: () {
                  final seen = <String>{};
                  final items = <DropdownMenuItem<String>>[];
                  for (final m in team) {
                    final id = m.employeeId;
                    if (id == null || id.isEmpty || !seen.add(id)) continue;
                    if ((m.employeeName ?? '').isEmpty) continue;
                    items.add(DropdownMenuItem(value: id, child: Text(m.employeeName!, style: const TextStyle(fontSize: 13))));
                  }
                  return items;
                }(),
                onChanged: (v) => setState(() => _assigneeId = v),
              ),
            ),
          if (team.isEmpty) const Text('No team members allocated yet — task will be unassigned', style: MaanText.caption),
          const SizedBox(height: 10),
          Wrap(spacing: 8, children: [
            for (final pr in const [('low', 'Low'), ('medium', 'Medium'), ('high', 'High'), ('critical', 'Critical')])
              ChoiceChip(
                label: Text(pr.$2, style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: _priority == pr.$1 ? Colors.white : MaanColors.body)),
                selected: _priority == pr.$1,
                selectedColor: MaanColors.primary,
                backgroundColor: MaanColors.pageBg,
                onSelected: (_) => setState(() => _priority = pr.$1),
              ),
          ]),
          const SizedBox(height: 10),
          MaanField(label: 'Estimated hours (optional)', controller: _est, keyboard: TextInputType.number),
          const SizedBox(height: 10),
          // Task 129 — description field (same as web + every other section)
          MaanField(label: 'Description (optional)', controller: _desc, maxLines: 3),
          const SizedBox(height: 10),
          InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: () async {
              final d = await showDatePicker(
                context: context,
                initialDate: _plannedStart ?? DateTime.now(),
                firstDate: DateTime(2020),
                lastDate: DateTime(2100),
              );
              if (d != null) setState(() => _plannedStart = d);
            },
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
              decoration: BoxDecoration(border: Border.all(color: MaanColors.line), borderRadius: BorderRadius.circular(12)),
              child: Text(
                _plannedStart == null ? 'Start date (optional)' : 'Start: ${DateFormat('dd MMM, yyyy').format(_plannedStart!)}',
                style: TextStyle(fontSize: 13.5, color: _plannedStart == null ? MaanColors.faint : MaanColors.navy),
              ),
            ),
          ),
          const SizedBox(height: 10),
          InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: () async {
              final d = await showDatePicker(
                context: context,
                initialDate: _plannedEnd ?? _plannedStart ?? DateTime.now().add(const Duration(days: 7)),
                firstDate: _plannedStart ?? DateTime(2020),
                lastDate: DateTime(2100),
              );
              if (d != null) setState(() => _plannedEnd = d);
            },
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
              decoration: BoxDecoration(border: Border.all(color: MaanColors.line), borderRadius: BorderRadius.circular(12)),
              child: Text(
                _plannedEnd == null ? 'End date (optional)' : 'End: ${DateFormat('dd MMM, yyyy').format(_plannedEnd!)}',
                style: TextStyle(fontSize: 13.5, color: _plannedEnd == null ? MaanColors.faint : MaanColors.navy),
              ),
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 10),
            Text(_error!, style: const TextStyle(color: MaanColors.accentRed, fontSize: 12.5, fontWeight: FontWeight.w600)),
          ],
          const SizedBox(height: 12),
          // ── Task 131 — attach screenshots/PDFs/docs at creation (≤3 MB each) ──
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(border: Border.all(color: MaanColors.line), borderRadius: BorderRadius.circular(12)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                const Expanded(child: Text('ATTACHMENTS', style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w800, color: MaanColors.faint, letterSpacing: 0.6))),
                InkWell(
                  onTap: _uploadingAtts ? null : () async {
                    final result = await FilePicker.platform.pickFiles(type: FileType.any, withData: true, allowMultiple: true);
                    final files = result?.files.where((f) => f.bytes != null).toList() ?? [];
                    if (files.isEmpty) return;
                    setState(() {
                      for (final f in files) {
                        if (f.bytes!.length <= 3 * 1024 * 1024) _pendingFiles.add(f);
                      }
                    });
                    final skipped = files.length - _pendingFiles.length;
                    if (skipped > 0 && mounted) {
                      ScaffoldMessenger.of(context)..hideCurrentSnackBar()
                        ..showSnackBar(SnackBar(content: Text('$skipped file${skipped == 1 ? '' : 's'} skipped — over the 3 MB limit'), backgroundColor: MaanColors.accentRed));
                    }
                  },
                  borderRadius: BorderRadius.circular(10),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                    decoration: BoxDecoration(color: MaanColors.primary.withOpacity(0.10), borderRadius: BorderRadius.circular(10)),
                    child: const Row(mainAxisSize: MainAxisSize.min, children: [
                      Icon(Icons.attach_file_rounded, size: 13, color: MaanColors.primary),
                      SizedBox(width: 3),
                      Text('Attach', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: MaanColors.primary)),
                    ]),
                  ),
                ),
              ]),
              const SizedBox(height: 6),
              if (_pendingFiles.isEmpty)
                const Text('Screenshots, PDFs, docs (≤3 MB) — uploaded when the task is created.', style: MaanText.caption)
              else
                ..._pendingFiles.asMap().entries.map((e) => Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Row(children: [
                    const Icon(Icons.insert_drive_file_rounded, size: 14, color: MaanColors.faint),
                    const SizedBox(width: 6),
                    Expanded(child: Text(e.value.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, color: MaanColors.navy))),
                    Text(e.value.bytes!.length >= 1024 ? '${(e.value.bytes!.length / 1024).round()} KB' : '${e.value.bytes!.length} B', style: MaanText.caption.copyWith(fontSize: 10)),
                    InkWell(
                      onTap: () => setState(() => _pendingFiles.removeAt(e.key)),
                      child: const Padding(padding: EdgeInsets.all(4), child: Icon(Icons.close_rounded, size: 14, color: MaanColors.faint)),
                    ),
                  ]),
                )),
            ]),
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity, height: 46,
            child: ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: MaanColors.primary, foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(13))),
              onPressed: _saving ? null : _submit,
              child: _saving
                  ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Text('Create Task', style: TextStyle(fontWeight: FontWeight.w800)),
            ),
          ),
        ]),
      ),
    );
  }

  Future<void> _submit() async {
    if (_name.text.trim().isEmpty) {
      setState(() => _error = 'Task name is required');
      return;
    }
    if (_workflowStep != 're_testing' && _assigneeId == null) {
      setState(() => _error = 'Select the assignee for this workflow step (re-testing goes back to the assignee)');
      return;
    }
    setState(() { _saving = true; _error = null; });
    try {
      final createdId = await widget.provider.createTask({
        'name': _name.text.trim(),
        'priority': _priority,
        'taskType': _taskType,
        'workflowStep': _workflowStep,
        if (_assigneeId != null) 'assignedToId': _assigneeId,
        if (_est.text.trim().isNotEmpty) 'estimatedHours': num.tryParse(_est.text.trim()) ?? 0,
        if (_desc.text.trim().isNotEmpty) 'description': _desc.text.trim(),
        if (_plannedStart != null) 'plannedStart': _plannedStart!.toIso8601String(),
        if (_plannedEnd != null) 'plannedEnd': _plannedEnd!.toIso8601String(),
      });
      // Task 131 — upload the files picked in the create sheet to the new task
      var uploaded = 0;
      if (createdId != null && _pendingFiles.isNotEmpty) {
        final projectId = widget.provider.project?.id;
        if (projectId != null) {
          for (final f in _pendingFiles) {
            try {
              await ApiService.createTaskAttachment(
                projectId,
                createdId,
                fileName: f.name,
                mimeType: _TaskUpdateSheetState._mimeForExtension((f.extension ?? '').toLowerCase()),
                bytes: f.bytes!,
              );
              uploaded++;
            } catch (_) {/* keep going — the task itself was created */}
          }
        }
      }
      if (!mounted) return;
      Navigator.pop(context);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(uploaded > 0 ? 'Task created · $uploaded attachment${uploaded == 1 ? '' : 's'} uploaded' : 'Task created'),
          backgroundColor: MaanColors.accentGreen));
    } catch (e) {
      setState(() { _saving = false; _error = e.toString().replaceAll('Exception: ', ''); });
    }
  }
}

// ══ Milestones tab ════════════════════════════════════════════════════
class _MilestonesTab extends StatelessWidget {
  final ProjectDetailProvider provider;
  const _MilestonesTab({required this.provider});

  @override
  Widget build(BuildContext context) {
    final ms = provider.milestones;
    // Task 118 — the milestone list is empty on every fresh project, so the
    // add affordance MUST live here too (pill + labelled FAB, editor-gated).
    if (ms.isEmpty) {
      return Stack(children: [
        ListView(padding: const EdgeInsets.only(top: 60), children: [
          const Icon(Icons.flag_rounded, size: 56, color: MaanColors.faint),
          const SizedBox(height: 12),
          const Center(child: Text('No milestones on this project yet', style: MaanText.body)),
          if (provider.canEdit) ...[
            const SizedBox(height: 16),
            Center(
              child: _AddPill(
                icon: Icons.flag_rounded,
                label: 'New Milestone',
                onTap: () => _openCreateMilestone(context, provider),
              ),
            ),
          ],
        ]),
        if (provider.canEdit)
          Positioned(
            right: 16, bottom: 16,
            child: _AddFab(label: 'New Milestone', heroTag: 'addMilestone', onPressed: () => _openCreateMilestone(context, provider)),
          ),
      ]);
    }
    return Stack(children: [
      ListView(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 90),
        children: ms.map((m) => Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: _MilestoneCard(m: m),
            )).toList(),
      ),
      if (provider.canEdit)
        Positioned(
          right: 16, bottom: 16,
          child: _AddFab(label: 'New Milestone', heroTag: 'addMilestone', onPressed: () => _openCreateMilestone(context, provider)),
        ),
    ]);
  }

  void _openCreateMilestone(BuildContext context, ProjectDetailProvider provider) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (_) => _CreateMilestoneSheet(provider: provider),
    );
  }
}

// ══ Create-milestone sheet (Task 118) ═════════════════════════════
/// POST /api/projects/[id]/milestones — same contract as the web module:
/// name + plannedDate required; optional sequence / isPhase.
class _CreateMilestoneSheet extends StatefulWidget {
  final ProjectDetailProvider provider;
  const _CreateMilestoneSheet({required this.provider});

  @override
  State<_CreateMilestoneSheet> createState() => _CreateMilestoneSheetState();
}

class _CreateMilestoneSheetState extends State<_CreateMilestoneSheet> {
  final _name = TextEditingController();
  final _seq = TextEditingController();
  DateTime? _plannedDate;
  bool _isPhase = false;
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _seq.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_name.text.trim().isEmpty) {
      setState(() => _error = 'Milestone name is required');
      return;
    }
    if (_plannedDate == null) {
      setState(() => _error = 'Planned date is required');
      return;
    }
    setState(() { _saving = true; _error = null; });
    try {
      await widget.provider.createMilestone({
        'name': _name.text.trim(),
        'plannedDate': DateTime(_plannedDate!.year, _plannedDate!.month, _plannedDate!.day).toIso8601String(),
        if (_seq.text.trim().isNotEmpty) 'sequence': num.tryParse(_seq.text.trim()),
        'isPhase': _isPhase,
      });
      if (!mounted) return;
      Navigator.pop(context);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(_isPhase ? 'Phase created' : 'Milestone created'),
          backgroundColor: MaanColors.accentGreen));
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
            const Expanded(child: Text('New Milestone', style: MaanText.h2)),
            IconButton(onPressed: () => Navigator.pop(context), icon: const Icon(Icons.close_rounded, size: 20)),
          ]),
          const SizedBox(height: 12),
          MaanField(label: 'Milestone name *', controller: _name),
          const SizedBox(height: 10),
          InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: () async {
              final d = await showDatePicker(
                context: context,
                initialDate: _plannedDate ?? DateTime.now().add(const Duration(days: 30)),
                firstDate: DateTime(2020),
                lastDate: DateTime(2100),
              );
              if (d != null) setState(() => _plannedDate = d);
            },
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
              decoration: BoxDecoration(border: Border.all(color: MaanColors.line), borderRadius: BorderRadius.circular(12)),
              child: Text(
                _plannedDate == null ? 'Planned date *' : 'Planned: ${DateFormat('dd MMM, yyyy').format(_plannedDate!)}',
                style: TextStyle(fontSize: 13.5, color: _plannedDate == null ? MaanColors.faint : MaanColors.navy),
              ),
            ),
          ),
          const SizedBox(height: 10),
          MaanField(label: 'Sequence (optional — phase order)', controller: _seq, keyboard: TextInputType.number),
          const SizedBox(height: 10),
          InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: () => setState(() => _isPhase = !_isPhase),
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(border: Border.all(color: MaanColors.line), borderRadius: BorderRadius.circular(12)),
              child: Row(children: [
                Icon(
                  _isPhase ? Icons.check_box_rounded : Icons.check_box_outline_blank_rounded,
                  size: 20,
                  color: _isPhase ? MaanColors.primary : MaanColors.faint,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text('This is a phase (not a milestone)',
                      style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: MaanColors.navy)),
                ),
              ]),
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
                  : const Text('Create Milestone', style: TextStyle(fontWeight: FontWeight.w800)),
            ),
          ),
        ]),
      ),
    );
  }
}

class _MilestoneCard extends StatelessWidget {
  final ProjectMilestoneModel m;
  const _MilestoneCard({required this.m});

  Color get _approvalColor {
    switch (m.approvalStatus) {
      case 'approved':
        return MaanColors.accentGreen;
      case 'rejected':
        return MaanColors.accentRed;
      default:
        return MaanColors.accentOrange;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(border: Border.all(color: MaanColors.line), borderRadius: BorderRadius.circular(14)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(
            width: 34, height: 34,
            decoration: BoxDecoration(color: (m.isPhase ? MaanColors.accentPurple : MaanColors.primary).withOpacity(0.1), borderRadius: BorderRadius.circular(9)),
            child: Icon(m.isPhase ? Icons.view_week_rounded : Icons.flag_rounded,
                color: m.isPhase ? MaanColors.accentPurple : MaanColors.primary, size: 17),
          ),
          const SizedBox(width: 10),
          Expanded(child: Text(m.name, style: MaanText.title.copyWith(fontSize: 13.5))),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(color: _approvalColor.withOpacity(0.12), borderRadius: BorderRadius.circular(10)),
            child: Text(m.approvalLabel, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: _approvalColor)),
          ),
        ]),
        const SizedBox(height: 10),
        ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: LinearProgressIndicator(
            value: m.completionPct / 100, minHeight: 5,
            backgroundColor: MaanColors.line,
            valueColor: AlwaysStoppedAnimation(m.isPhase ? MaanColors.accentPurple : MaanColors.primary),
          ),
        ),
        const SizedBox(height: 8),
        Wrap(spacing: 12, runSpacing: 4, children: [
          if (m.sequence != null)
            _meta(Icons.format_list_numbered_rounded, 'Phase ${m.sequence}'),
          if (m.plannedDate != null) _meta(Icons.event_rounded, 'Plan: ${_fmt(m.plannedDate!)}'),
          if (m.actualDate != null) _meta(Icons.event_available_rounded, 'Done: ${_fmt(m.actualDate!)}'),
          _meta(Icons.checklist_rounded, '${m.taskCount} tasks'),
          _meta(Icons.donut_large_rounded, '${m.completionPct}%'),
        ]),
      ]),
    );
  }

  Widget _meta(IconData i, String text) => Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(i, size: 12, color: MaanColors.faint),
        const SizedBox(width: 3),
        Text(text, style: MaanText.caption.copyWith(fontSize: 10.5)),
      ]);

  String _fmt(String iso) {
    try {
      return DateFormat('dd MMM, yy').format(DateTime.parse(iso).toLocal());
    } catch (_) {
      return iso.length >= 10 ? iso.substring(0, 10) : iso;
    }
  }
}

// ══ Team tab ══════════════════════════════════════════════════════════
class _TeamTab extends StatelessWidget {
  final ProjectDetailProvider provider;
  const _TeamTab({required this.provider});

  @override
  Widget build(BuildContext context) {
    final team = provider.team;
    // Task 118 — "Add Member" affordance (pill in the empty state + labelled
    // FAB once the team exists). Editors only — mirrors the web gate.
    final addMember = provider.canEdit
        ? () => _openAddMember(context, provider)
        : null;
    if (team.isEmpty) {
      return Stack(children: [
        ListView(padding: const EdgeInsets.only(top: 60), children: [
          const Icon(Icons.groups_rounded, size: 56, color: MaanColors.faint),
          const SizedBox(height: 12),
          const Center(child: Text('No members allocated to this project yet', style: MaanText.body)),
          if (addMember != null) ...[
            const SizedBox(height: 16),
            Center(
              child: _AddPill(
                icon: Icons.person_add_rounded,
                label: 'Add Member',
                onTap: addMember,
              ),
            ),
          ],
        ]),
        if (addMember != null)
          Positioned(
            right: 16, bottom: 16,
            child: _AddFab(label: 'Add Member', heroTag: 'addMember', onPressed: addMember),
          ),
      ]);
    }
    return Stack(children: [
      ListView(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 90),
        children: team.map((m) {
          final initials = (m.employeeName ?? '?')
              .split(' ').where((w) => w.isNotEmpty).map((w) => w[0].toUpperCase()).take(2).join();
          // clamp: hashCode can be negative → invalid hue (assert in debug)
          final hue = ((m.id.hashCode % 8).abs()) * 45.0;
          return Container(
            margin: const EdgeInsets.only(bottom: 10),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(border: Border.all(color: MaanColors.line), borderRadius: BorderRadius.circular(14)),
            child: Row(children: [
              CircleAvatar(
                radius: 19,
                backgroundColor: HSLColor.fromAHSL(1, hue, 0.55, 0.55).toColor(),
                child: Text(initials, style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w800)),
              ),
              const SizedBox(width: 10),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(m.employeeName ?? 'Unknown', style: MaanText.title.copyWith(fontSize: 13.5)),
                if (m.employeeCode != null && m.employeeCode!.isNotEmpty)
                  Text(m.employeeCode!, style: MaanText.caption),
              ])),
              Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                if (m.role != null && m.role!.isNotEmpty)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(color: MaanColors.primary.withOpacity(0.1), borderRadius: BorderRadius.circular(10)),
                    child: Text(m.role!, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: MaanColors.primary)),
                  ),
                const SizedBox(height: 4),
                Text('${m.allocationPct}% allocated', style: MaanText.caption),
              ]),
            ]),
          );
        }).toList(),
      ),
      if (addMember != null)
        Positioned(
          right: 16, bottom: 16,
          child: _AddFab(label: 'Add Member', heroTag: 'addMember', onPressed: addMember),
        ),
    ]);
  }

  void _openAddMember(BuildContext context, ProjectDetailProvider provider) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (_) => _AddMemberSheet(provider: provider),
    );
  }
}

// ══ Add-team-member sheet (Task 118) ══════════════════════════════
/// POST /api/projects/[id]/allocations — same contract the web project page
/// uses: employeeId + startDate required; optional role / allocationPct.
/// Employee picker = the same /api/employees directory the web picker uses;
/// already-allocated members are filtered out of the dropdown.
class _AddMemberSheet extends StatefulWidget {
  final ProjectDetailProvider provider;
  const _AddMemberSheet({required this.provider});

  @override
  State<_AddMemberSheet> createState() => _AddMemberSheetState();
}

class _PickerPerson {
  final String id;
  final String name;
  final String? department;
  final String? status; // Task 120 — employment status for separated-staff guard
  const _PickerPerson({required this.id, required this.name, this.department, this.status});

  static _PickerPerson? fromJson(dynamic raw) {
    final m = jsonMap(raw);
    final id = (m['id'] ?? '').toString();
    if (id.isEmpty) return null;
    final first = (m['firstName'] ?? '').toString();
    final last = (m['lastName'] ?? '').toString();
    final dept = jsonMap(m['department']);
    final name = '$first $last'.trim();
    return _PickerPerson(id: id, name: name.isEmpty ? (m['email'] ?? id).toString() : name,
        department: (dept['name'] ?? m['department'])?.toString(),
        status: m['status']?.toString());
  }

  /// Task 120 — terminated/resigned/inactive employees must not surface in
  /// the Projects module (member picker). Unknown status stays visible.
  bool get isInactive =>
      const {'inactive', 'terminated', 'resigned'}.contains((status ?? '').toLowerCase());
}

class _AddMemberSheetState extends State<_AddMemberSheet> {
  final _pct = TextEditingController(text: '100');
  List<_PickerPerson> _people = [];
  String? _employeeId;
  String? _role; // optional allocation role
  DateTime? _startDate;
  bool _loading = false;
  bool _saving = false;
  String? _error;

  static const _roleChoices = <(String, String)>[
    ('manager', 'Manager'),
    ('member', 'Member'),
    ('finance', 'Finance'),
    ('viewer', 'Viewer'),
  ];

  @override
  void initState() {
    super.initState();
    _startDate = DateTime.now();
    _loadPeople();
  }

  @override
  void dispose() {
    _pct.dispose();
    super.dispose();
  }

  Future<void> _loadPeople() async {
    setState(() => _loading = true);
    try {
      // Task 120 — excludeInactive keeps separated employees out of the
      // Projects member picker; the isInactive guard is defense in depth.
      final data = await ApiService.getEmployees(limit: 200, excludeInactive: true);
      final rows = jsonList(data['employees'] is List ? data['employees'] : data['data']);
      final allocated = widget.provider.team
          .map((m) => m.employeeId)
          .whereType<String>()
          .toSet();
      if (mounted) {
        setState(() {
          _people = rows
              .map(_PickerPerson.fromJson)
              .whereType<_PickerPerson>()
              .where((p) => !p.isInactive)
              .where((p) => !allocated.contains(p.id))
              .toList();
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = e.toString().replaceAll('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _submit() async {
    if (_employeeId == null || _employeeId!.isEmpty) {
      setState(() => _error = 'Pick an employee to allocate');
      return;
    }
    if (_startDate == null) {
      setState(() => _error = 'Start date is required');
      return;
    }
    final pct = num.tryParse(_pct.text.trim());
    setState(() { _saving = true; _error = null; });
    try {
      await widget.provider.createAllocation({
        'employeeId': _employeeId,
        'startDate': DateTime(_startDate!.year, _startDate!.month, _startDate!.day).toIso8601String(),
        if (_role != null && _role!.isNotEmpty) 'role': _role,
        'allocationPct': (pct == null || pct <= 0) ? 100 : pct,
      });
      if (!mounted) return;
      Navigator.pop(context);
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Team member added'), backgroundColor: MaanColors.accentGreen));
    } catch (e) {
      setState(() { _saving = false; _error = e.toString().replaceAll('Exception: ', ''); });
    }
  }

  @override
  Widget build(BuildContext context) {
    final allocatedNames = widget.provider.team.map((m) => m.employeeName).whereType<String>().toSet();
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 18, 20, 24),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            const Expanded(child: Text('Add Team Member', style: MaanText.h2)),
            IconButton(onPressed: () => Navigator.pop(context), icon: const Icon(Icons.close_rounded, size: 20)),
          ]),
          const SizedBox(height: 12),
          if (_loading)
            const Padding(
              padding: EdgeInsets.all(18),
              child: Center(child: CircularProgressIndicator(strokeWidth: 2, color: MaanColors.primary)),
            )
          else ...[
            if (_people.isEmpty)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: MaanColors.pageBg, borderRadius: BorderRadius.circular(12)),
                child: Text(
                  allocatedNames.isEmpty
                      ? 'No employees available — you may not have directory access'
                      : 'Everyone in the directory is already allocated',
                  style: MaanText.caption,
                ),
              )
            else
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                decoration: BoxDecoration(border: Border.all(color: MaanColors.line), borderRadius: BorderRadius.circular(12)),
                child: DropdownButtonFormField<String>(
                  value: _employeeId,
                  decoration: const InputDecoration(
                    border: InputBorder.none,
                    labelText: 'Employee *',
                    labelStyle: TextStyle(color: MaanColors.faint, fontSize: 13),
                  ),
                  dropdownColor: Colors.white,
                  items: _people
                      .map((p) => DropdownMenuItem(
                            value: p.id,
                            child: Text(
                              p.department == null || p.department!.isEmpty ? p.name : '${p.name} · ${p.department}',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(fontSize: 13),
                            ),
                          ))
                      .toList(),
                  onChanged: (v) => setState(() => _employeeId = v),
                ),
              ),
          ],
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            decoration: BoxDecoration(border: Border.all(color: MaanColors.line), borderRadius: BorderRadius.circular(12)),
            child: DropdownButtonFormField<String>(
              value: _role,
              decoration: const InputDecoration(
                border: InputBorder.none,
                labelText: 'Project role (optional)',
                labelStyle: TextStyle(color: MaanColors.faint, fontSize: 13),
              ),
              dropdownColor: Colors.white,
              hint: const Text('Not set', style: TextStyle(fontSize: 13)),
              items: [
                const DropdownMenuItem(value: '', child: Text('Not set', style: TextStyle(fontSize: 13))),
                for (final rc in _roleChoices)
                  DropdownMenuItem(value: rc.$1, child: Text(rc.$2, style: const TextStyle(fontSize: 13))),
              ],
              onChanged: (v) => setState(() => _role = (v == null || v.isEmpty) ? null : v),
            ),
          ),
          const SizedBox(height: 10),
          MaanField(label: 'Allocation % (default 100)', controller: _pct, keyboard: TextInputType.number),
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
                _startDate == null ? 'Start date *' : 'Starts: ${DateFormat('dd MMM, yyyy').format(_startDate!)}',
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
              onPressed: (_saving || _loading) ? null : _submit,
              child: _saving
                  ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Text('Add to Project', style: TextStyle(fontWeight: FontWeight.w800)),
            ),
          ),
        ]),
      ),
    );
  }
}

// ══ Files tab (Task 121) ══════════════════════════════════════════════
/// Project files + conversation entry point. Every project has ONE workspace
/// chat room (roomType 'project') — files attached in that conversation show
/// up here, and files attached here land in the conversation. One source of
/// truth: GET /api/projects/[id]/files; upload = POST an attachment message
/// into the workspace room.
class _FilesTab extends StatefulWidget {
  final ProjectDetailProvider provider;
  const _FilesTab({required this.provider});

  @override
  State<_FilesTab> createState() => _FilesTabState();
}

class _FilesTabState extends State<_FilesTab> {
  static const int _maxFileBytes = 4 * 1024 * 1024;

  List<ChatAttachment> _files = [];
  List<Map<String, dynamic>> _driveFiles = [];
  String? _roomId;
  bool _loading = true;
  bool _uploading = false;
  bool _openingChat = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  String get _projectId => widget.provider.project?.id ?? '';

  Future<void> _load() async {
    if (_projectId.isEmpty) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final data = await ApiService.getProjectFiles(_projectId);
      final rows = <ChatAttachment>[];
      for (final raw in jsonList(data['files'])) {
        // Each aggregate row is one attachment with sender/date context.
        final atts = ChatAttachment.listFromJson([raw]);
        if (atts.isEmpty) continue;
        rows.add(atts.first);
      }
      if (!mounted) return;
      setState(() {
        _files = rows;
        _driveFiles = jsonMapList(data['driveFiles']);
        _roomId = (data['roomId'] ?? '').toString().isEmpty ? null : (data['roomId'] ?? '').toString();
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString().replaceAll('Exception: ', '');
        _loading = false;
      });
    }
  }

  Future<void> _openProjectChat() async {
    setState(() => _openingChat = true);
    try {
      final ws = await ApiService.ensureProjectWorkspace(_projectId);
      final roomId = (ws['roomId'] ?? '').toString();
      if (roomId.isEmpty) throw Exception('Could not open the project chat');
      final name = '${widget.provider.project?.name ?? 'Project'} — Workspace';
      if (!mounted) return;
      await Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => ChatRoomScreen(
            room: ChatRoomModel(
              id: roomId,
              name: name,
              roomType: 'project',
              description: 'Central workspace for project "$name".',
            ),
          ),
        ),
      );
      // New attachments may have been shared in the chat while we were there.
      if (mounted) _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(
          content: Text(e.toString().replaceAll('Exception: ', '')),
          backgroundColor: MaanColors.accentRed,
        ));
    } finally {
      if (mounted) setState(() => _openingChat = false);
    }
  }

  Future<void> _attachFiles() async {
    final result = await FilePicker.platform.pickFiles(type: FileType.any, withData: true);
    final files = result?.files.where((f) => f.bytes != null).toList() ?? [];
    if (files.isEmpty) return;
    setState(() => _uploading = true);
    try {
      final ws = await ApiService.ensureProjectWorkspace(_projectId);
      final roomId = (ws['roomId'] ?? '').toString();
      if (roomId.isEmpty) throw Exception('Could not open the project workspace');
      int uploaded = 0;
      for (final f in files) {
        final bytes = f.bytes!;
        if (bytes.length > _maxFileBytes) {
          if (!mounted) continue;
          ScaffoldMessenger.of(context)
            ..hideCurrentSnackBar()
            ..showSnackBar(SnackBar(content: Text('"${f.name}" exceeds the 4 MB limit'), backgroundColor: MaanColors.accentRed));
          continue;
        }
        final ext = (f.extension ?? '').toLowerCase();
        final mime = _mimeForExtension(ext);
        await ApiService.sendChatMessage(
          roomId,
          '📎 ${f.name}',
          attachments: [{
            'name': f.name,
            'mimeType': mime,
            'sizeBytes': bytes.length,
            'dataUrl': 'data:$mime;base64,${base64Encode(bytes)}',
          }],
        );
        uploaded++;
      }
      if (!mounted) return;
      if (uploaded > 0) {
        ScaffoldMessenger.of(context)
          ..hideCurrentSnackBar()
          ..showSnackBar(SnackBar(content: Text('$uploaded file${uploaded == 1 ? '' : 's'} added to the project'), backgroundColor: const Color(0xFF2FA36B)));
      }
      await _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(
          content: Text(e.toString().replaceAll('Exception: ', '')),
          backgroundColor: MaanColors.accentRed,
        ));
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  static String _mimeForExtension(String ext) {
    switch (ext) {
      case 'pdf': return 'application/pdf';
      case 'png': return 'image/png';
      case 'jpg': case 'jpeg': return 'image/jpeg';
      case 'gif': return 'image/gif';
      case 'webp': return 'image/webp';
      case 'txt': case 'log': return 'text/plain';
      case 'csv': return 'text/csv';
      case 'doc': return 'application/msword';
      case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      case 'xls': return 'application/vnd.ms-excel';
      case 'xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      case 'ppt': return 'application/vnd.ms-powerpoint';
      case 'pptx': return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
      case 'zip': return 'application/zip';
      case 'json': return 'application/json';
      default: return 'application/octet-stream';
    }
  }

  Future<void> _openFile(ChatAttachment a) async {
    final bytes = a.bytes;
    if (bytes == null) return;
    try {
      await Share.shareXFiles([XFile.fromData(bytes, name: a.name, mimeType: a.mimeType)], text: a.name);
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator(color: MaanColors.primary));
    }
    if (_error != null) {
      return Center(
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
      );
    }
    return RefreshIndicator(
      color: MaanColors.primary,
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 24),
        children: [
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _openingChat ? null : _openProjectChat,
                  icon: _openingChat
                      ? const SizedBox(width: 15, height: 15, child: CircularProgressIndicator(strokeWidth: 2, color: MaanColors.primary))
                      : const Icon(Icons.forum_rounded, size: 17),
                  label: Text(_roomId == null ? 'Create & Open Project Chat' : 'Open Project Chat',
                      style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12.5)),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Colors.white,
                    backgroundColor: MaanColors.primary,
                    side: BorderSide.none,
                    padding: const EdgeInsets.symmetric(vertical: 11),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _uploading ? null : _attachFiles,
                  icon: _uploading
                      ? const SizedBox(width: 15, height: 15, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : const Icon(Icons.upload_file_rounded, size: 17),
                  label: const Text('Attach Files / Docs', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 12.5)),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Colors.white,
                    backgroundColor: const Color(0xFF0EA5A6),
                    side: BorderSide.none,
                    padding: const EdgeInsets.symmetric(vertical: 11),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          const Text(
            'Files attached here appear in the project chat too — and files shared in the project chat show up here. Max 4 MB per file.',
            style: TextStyle(fontSize: 11, color: MaanColors.faint),
          ),
          const SizedBox(height: 12),
          Container(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: MaanColors.line),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(14, 12, 14, 8),
                  child: Row(
                    children: [
                      const Icon(Icons.folder_rounded, size: 15, color: MaanColors.primary),
                      const SizedBox(width: 6),
                      Text('Project files (${_files.length})',
                          style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: MaanColors.navy)),
                    ],
                  ),
                ),
                if (_files.isEmpty)
                  const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 14, vertical: 22),
                    child: Center(
                      child: Text('No files yet — attach documents here or share them in the project chat.',
                          textAlign: TextAlign.center, style: TextStyle(fontSize: 12, color: MaanColors.faint)),
                    ),
                  )
                else
                  ..._files.map((a) => ListTile(
                        dense: true,
                        leading: Container(
                          width: 36,
                          height: 36,
                          decoration: BoxDecoration(color: const Color(0xFFE8F5F1), borderRadius: BorderRadius.circular(10)),
                          child: const Icon(Icons.insert_drive_file_rounded, size: 17, color: MaanColors.primary),
                        ),
                        title: Text(a.name, maxLines: 1, overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: MaanColors.navy)),
                        subtitle: Text([
                          if (a.sizeLabel.isNotEmpty) a.sizeLabel,
                          'shared in project chat',
                        ].join(' · '), style: const TextStyle(fontSize: 11, color: MaanColors.faint)),
                        trailing: const Icon(Icons.open_in_new_rounded, size: 14, color: MaanColors.faint),
                        onTap: () => _openFile(a),
                      )),
              ],
            ),
          ),
          if (_driveFiles.isNotEmpty) ...[
            const SizedBox(height: 12),
            Container(
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: MaanColors.line),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(14, 12, 14, 8),
                    child: Text('Drive documents (${_driveFiles.length})',
                        style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: MaanColors.navy)),
                  ),
                  ..._driveFiles.map((d) => ListTile(
                        dense: true,
                        leading: const Icon(Icons.description_rounded, size: 18, color: MaanColors.faint),
                        title: Text((d['name'] ?? 'Document').toString(),
                            maxLines: 1, overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: MaanColors.navy)),
                        subtitle: Text((d['uploadedBy'] ?? '').toString(),
                            style: const TextStyle(fontSize: 11, color: MaanColors.faint)),
                      )),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}
