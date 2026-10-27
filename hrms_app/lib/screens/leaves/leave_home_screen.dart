import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../config/maan_theme.dart';
import '../../models/leave.dart';
import '../../models/user.dart';
import '../../providers/leave_provider.dart';
import '../../services/api_service.dart';
import '../../services/storage_service.dart';
import '../../utils/json_safe.dart';

/// Leave module — live data from /api/leaves: list + filters + apply + approve/reject.
class LeaveHomeScreen extends StatelessWidget {
  const LeaveHomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => LeaveProvider()..fetchLeaves(),
      child: const _LeaveBody(),
    );
  }
}

class _LeaveBody extends StatefulWidget {
  const _LeaveBody();

  @override
  State<_LeaveBody> createState() => _LeaveBodyState();
}

class _LeaveBodyState extends State<_LeaveBody> {
  String _filter = '';
  UserModel? _me;

  @override
  void initState() {
    super.initState();
    _loadMe();
  }

  Future<void> _loadMe() async {
    final data = StorageService.getUserData();
    if (data != null) {
      try {
        setState(() => _me = UserModel.fromJson(jsonDecode(data)));
      } catch (_) {}
    }
  }

  static const Set<String> _approverRoles = {'super_admin', 'tenant_admin', 'ceo', 'hr_admin', 'admin', 'manager'}; // Task 129: +ceo
  bool get _canApprove => _approverRoles.contains(_me?.role);

  static const List<String> _leaveTypes = [
    'Casual Leave', 'Sick Leave', 'Earned Leave', 'Maternity Leave',
    'Paternity Leave', 'Comp Off', 'Unpaid Leave',
  ];

  Future<void> _applyLeave() async {
    final created = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(26))),
      builder: (_) => _ApplyLeaveSheet(canPickEmployee: _canApprove),
    );
    if (created == true && mounted) {
      context.read<LeaveProvider>().fetchLeaves();
    }
  }

  Future<void> _act(String id, String action) async {
    try {
      await ApiService.updateLeaveStatus(id: id, action: action);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text(action == 'approve' ? 'Leave approved' : 'Leave rejected'),
            backgroundColor: action == 'approve' ? Colors.green : Colors.red));
        context.read<LeaveProvider>().fetchLeaves();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString().replaceAll('Exception: ', '')), backgroundColor: Colors.red));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<LeaveProvider>();
    final all = provider.leaves;
    final rows = _filter.isEmpty ? all : all.where((l) => l.status.toLowerCase() == _filter).toList();

    return Scaffold(
      backgroundColor: MaanColors.pageBg,
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _applyLeave,
        backgroundColor: MaanColors.primary,
        icon: const Icon(Icons.add, color: Colors.white),
        label: const Text('Apply Leave', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
      ),
      body: Column(
        children: [
          MaanHeader(title: 'Leave Management', onBack: () => Navigator.maybePop(context)),
          Expanded(
            child: Container(
              width: double.infinity,
              margin: const EdgeInsets.only(top: 18),
              padding: const EdgeInsets.fromLTRB(16, 20, 16, 0),
              decoration: const BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.only(topLeft: Radius.circular(30), topRight: Radius.circular(30)),
              ),
              child: Column(
                children: [
                  SizedBox(
                    height: 38,
                    child: ListView(
                      scrollDirection: Axis.horizontal,
                      children: [
                        _chip('All', ''),
                        _chip('Pending', 'pending'),
                        _chip('Approved', 'approved'),
                        _chip('Rejected', 'rejected'),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                  Expanded(
                    child: provider.isLoading
                        ? const Center(child: CircularProgressIndicator(color: MaanColors.primary))
                        : provider.error != null
                            ? Center(child: Text(provider.error!, style: MaanText.body, textAlign: TextAlign.center))
                            : RefreshIndicator(
                                color: MaanColors.primary,
                                onRefresh: () => provider.fetchLeaves(),
                                child: rows.isEmpty
                                    ? ListView(children: const [
                                        SizedBox(height: 110),
                                        Icon(Icons.event_busy_rounded, size: 64, color: MaanColors.faint),
                                        SizedBox(height: 12),
                                        Center(child: Text('No leave requests found', style: MaanText.body)),
                                      ])
                                    : ListView.separated(
                                        padding: const EdgeInsets.only(bottom: 90),
                                        itemCount: rows.length,
                                        separatorBuilder: (_, __) => const SizedBox(height: 10),
                                        itemBuilder: (_, i) {
                                          final l = rows[i];
                                          return _LeaveCard(
                                            leave: l,
                                            canApprove: _canApprove,
                                            onApprove: () => _act(l.id, 'approve'),
                                            onReject: () => _act(l.id, 'reject'),
                                          );
                                        },
                                      ),
                              ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _chip(String label, String value) {
    final selected = _filter == value;
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: ChoiceChip(
        label: Text(label),
        selected: selected,
        onSelected: (_) => setState(() => _filter = value),
        selectedColor: MaanColors.primary,
        labelStyle: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: selected ? Colors.white : MaanColors.body),
        backgroundColor: MaanColors.pageBg,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10), side: BorderSide(color: selected ? MaanColors.primary : MaanColors.line)),
        showCheckmark: false,
      ),
    );
  }
}

// (helper intentionally omitted)

class _LeaveCard extends StatelessWidget {
  final LeaveModel leave;
  final bool canApprove;
  final VoidCallback onApprove;
  final VoidCallback onReject;
  const _LeaveCard({required this.leave, required this.canApprove, required this.onApprove, required this.onReject});

  @override
  Widget build(BuildContext context) {
    final l = leave;
    final df = DateFormat('dd MMM');
    final sameDay = DateUtils.isSameDay(l.startDate, l.endDate);
    final dates = sameDay ? df.format(l.startDate) : '${df.format(l.startDate)} – ${df.format(l.endDate)}';
    final status = l.status.toLowerCase();
    final totalDays = l.daysCount?.toStringAsFixed(0) ?? '1';

    Color statusColor;
    switch (status) {
      case 'approved':
        statusColor = MaanColors.accentGreen;
        break;
      case 'rejected':
      case 'cancelled':
        statusColor = MaanColors.accentRed;
        break;
      default:
        statusColor = MaanColors.accentOrange;
    }

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        border: Border.all(color: MaanColors.line),
        borderRadius: BorderRadius.circular(14),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(.04), blurRadius: 10, offset: const Offset(0, 3))],
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          if ((l.employeeName ?? '').isNotEmpty) ...[
            CircleAvatar(radius: 15, backgroundColor: MaanColors.primary.withOpacity(.15), child: Text(l.employeeName![0].toUpperCase(), style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: MaanColors.primary))),
            const SizedBox(width: 8),
          ],
          Expanded(child: Text((l.employeeName ?? '').isNotEmpty ? l.employeeName! : 'Leave request', style: MaanText.title, overflow: TextOverflow.ellipsis)),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(color: statusColor.withOpacity(.14), borderRadius: BorderRadius.circular(9)),
            child: Text(status.toUpperCase(), style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: statusColor, letterSpacing: .4)),
          ),
        ]),
        const SizedBox(height: 8),
        Row(children: [
          const Icon(Icons.event_note_rounded, size: 15, color: MaanColors.faint),
          const SizedBox(width: 5),
          Expanded(child: Text('${l.leaveType}  ·  $dates  ·  $totalDays day(s)', style: MaanText.caption)),
        ]),
        if ((l.reason ?? '').toString().isNotEmpty) ...[
          const SizedBox(height: 5),
          Text(l.reason!, style: MaanText.caption, maxLines: 2, overflow: TextOverflow.ellipsis),
        ],
        if (canApprove && status == 'pending') ...[
          const SizedBox(height: 10),
          Row(children: [
            Expanded(child: OutlinedButton.icon(onPressed: onReject, icon: const Icon(Icons.close, size: 17), label: const Text('Reject'), style: OutlinedButton.styleFrom(foregroundColor: MaanColors.accentRed, side: const BorderSide(color: MaanColors.accentRed), minimumSize: const Size(0, 36)))),
            const SizedBox(width: 10),
            Expanded(child: FilledButton.icon(onPressed: onApprove, icon: const Icon(Icons.check, size: 17), label: const Text('Approve'), style: FilledButton.styleFrom(backgroundColor: MaanColors.accentGreen, minimumSize: const Size(0, 36)))),
          ]),
        ],
      ]),
    );
  }
}

class _ApplyLeaveSheet extends StatefulWidget {
  final bool canPickEmployee;
  const _ApplyLeaveSheet({required this.canPickEmployee});

  @override
  State<_ApplyLeaveSheet> createState() => _ApplyLeaveSheetState();
}

class _ApplyLeaveSheetState extends State<_ApplyLeaveSheet> {
  // Task 135 — REAL policy types come from /api/leave-types; this list is only
  // the offline fallback when the fetch fails (previous hardcoded-only behavior).
  static const List<String> _fallbackLeaveTypes = [
    'Casual Leave', 'Sick Leave', 'Earned Leave', 'Maternity Leave',
    'Paternity Leave', 'Comp Off', 'Unpaid Leave',
  ];
  final _formKey = GlobalKey<FormState>();
  final _reason = TextEditingController();
  String? _type;
  String? _employeeId;
  List<dynamic> _employees = [];
  DateTime _start = DateTime.now();
  DateTime _end = DateTime.now();
  bool _saving = false;
  String? _error;
  // Task 135 — on-behalf context
  List<Map<String, dynamic>> _leaveTypeRows = [];
  bool _loadingCtx = false;
  List<Map<String, dynamic>> _empBalances = [];
  List<Map<String, dynamic>> _recentLeaves = [];

  @override
  void initState() {
    super.initState();
    _loadLeaveTypes();
    if (widget.canPickEmployee) _loadEmployees();
  }

  /// Task 135 — the dropdown is driven by the tenant's actual leave policy
  /// (custom tenant types previously 404-ed the application because the sheet
  /// hardcoded generic names).
  Future<void> _loadLeaveTypes() async {
    try {
      final rows = await ApiService.getLeaveTypes();
      if (!mounted) return;
      setState(() {
        _leaveTypeRows = rows
            .whereType<Map>()
            .where((m) => ((m['status'] ?? 'active').toString().toLowerCase()) == 'active')
            .map((m) => Map<String, dynamic>.from(m))
            .toList();
      });
    } catch (_) {/* fallback list stays */}
  }

  /// Task 135 — when an admin/HR picks ANOTHER employee, load that employee's
  /// leave balances + recent requests so the on-behalf application is an
  /// informed decision (parity with the web /leave/apply-by-hr page).
  Future<void> _loadEmployeeContext() async {
    final id = _employeeId;
    if (id == null || id.isEmpty) return;
    setState(() => _loadingCtx = true);
    try {
      final results = await Future.wait([
        ApiService.getEmployeeLeaveBalance(id),
        ApiService.getEmployeeRecentLeaves(id, limit: 5).catchError((_) => <dynamic>[]),
      ]);
      if (!mounted) return;
      final bal = results[0] as Map<String, dynamic>;
      setState(() {
        _empBalances = jsonMapList(bal['balances'] is List ? bal['balances'] : bal['data']);
        _recentLeaves = jsonMapList(results[1] as List<dynamic>);
        _loadingCtx = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loadingCtx = false);
    }
  }

  List<String> get _typeItems => _leaveTypeRows.isNotEmpty
      ? [for (final t in _leaveTypeRows) '${t['name'] ?? t['code']}']
      : _fallbackLeaveTypes;

  Future<void> _loadEmployees() async {
    try {
      // Task 120 — separated employees (terminated/resigned/inactive) are not
      // valid leave subjects; keep them out of the picker (server-side filter
      // plus a client-side guard for stale payloads).
      final data = await ApiService.getEmployees(limit: 100, excludeInactive: true);
      if (!mounted) return;
      final rows = jsonList(data['employees'] is List ? data['employees'] : data['data']);
      final INACTIVE = {'inactive', 'terminated', 'resigned'};
      setState(() => _employees = rows.where((raw) {
        final m = raw is Map ? raw : <String, dynamic>{};
        final status = (m['status'] ?? 'active').toString().toLowerCase();
        return !INACTIVE.contains(status);
      }).toList());
    } catch (_) {}
  }

  int get _totalDays => _end.difference(_start).inDays + 1;

  Future<void> _pickDate(bool isStart) async {
    final initial = isStart ? _start : (_end.isBefore(_start) ? _start : _end);
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(initial.year - 1),
      lastDate: DateTime(initial.year + 2),
      builder: (context, child) => Theme(data: Theme.of(context).copyWith(colorScheme: const ColorScheme.light(primary: MaanColors.primary)), child: child!),
    );
    if (picked != null) {
      setState(() {
        if (isStart) {
          _start = picked;
          if (_end.isBefore(_start)) _end = _start;
        } else {
          _end = picked.isBefore(_start) ? _start : picked;
        }
      });
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() { _saving = true; _error = null; });
    try {
      String? employeeId = _employeeId;
      if (employeeId == null && !widget.canPickEmployee) {
        // Canonical resolver: my-summary (admins linked to an employee row now
        // resolve server-side) then directory email match (Task 107).
        employeeId = await ApiService.resolveOwnEmployeeId();
      }
      if (employeeId == null || employeeId.isEmpty) {
        throw Exception('Could not resolve the employee record for this account');
      }
      // Task 135 — prefer the real policy type id resolved from the fetched
      // leave types; fall back to the raw name like before.
      String? leaveTypeId;
      for (final t in _leaveTypeRows) {
        if ('${t['name'] ?? t['code']}' == _type) {
          final v = t['id']?.toString();
          if (v != null && v.isNotEmpty) leaveTypeId = v;
          break;
        }
      }
      final payload = <String, dynamic>{
        'startDate': '${_start.year}-${_start.month.toString().padLeft(2, '0')}-${_start.day.toString().padLeft(2, '0')}',
        'endDate': '${_end.year}-${_end.month.toString().padLeft(2, '0')}-${_end.day.toString().padLeft(2, '0')}',
        'employeeId': employeeId,
        'reason': _reason.text.trim(),
      };
      if (leaveTypeId != null) {
        payload['leaveTypeId'] = leaveTypeId;
      } else {
        payload['type'] = _type ?? 'Casual Leave';
      }
      await ApiService.createLeave(payload);
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      setState(() { _saving = false; _error = e.toString().replaceAll('Exception: ', ''); });
    }
  }

  @override
  Widget build(BuildContext context) {
    final df = DateFormat('dd MMM yyyy');
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: .82,
      maxChildSize: .95,
      builder: (_, controller) => Form(
        key: _formKey,
        child: SingleChildScrollView(
          controller: controller,
          padding: const EdgeInsets.fromLTRB(20, 10, 20, 30),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Center(child: Container(width: 44, height: 4.5, decoration: BoxDecoration(color: MaanColors.line, borderRadius: BorderRadius.circular(3)))),
            const SizedBox(height: 14),
            const Text('Apply for Leave', style: MaanText.h2, textAlign: TextAlign.center),
            const SizedBox(height: 18),
            if (widget.canPickEmployee)
              DropdownButtonFormField<String>(
                value: _employeeId,
                decoration: InputDecoration(labelText: 'Employee', border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)), contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12)),
                items: _employees.map((e) {
                  final name = '${e['firstName'] ?? ''} ${e['lastName'] ?? ''}'.trim();
                  return DropdownMenuItem(value: e['id']?.toString(), child: Text(name, style: const TextStyle(fontSize: 13.5), overflow: TextOverflow.ellipsis));
                }).toList(),
                validator: (v) => v == null ? 'Select employee' : null,
                onChanged: (v) {
                  setState(() {
                    _employeeId = v;
                    _empBalances = [];
                    _recentLeaves = [];
                  });
                  _loadEmployeeContext();
                },
              )
            else ...[
              const Align(alignment: Alignment.centerLeft, child: Text('Applying for yourself', style: MaanText.caption)),
              const SizedBox(height: 6),
            ],
            // Task 135 — on-behalf context: the picked employee's leave
            // balances + recent requests (admin/HR only).
            if (widget.canPickEmployee && _employeeId != null) ...[
              const SizedBox(height: 12),
              _employeeContextCard(),
            ],
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              value: _typeItems.contains(_type) ? _type : null,
              decoration: InputDecoration(labelText: 'Leave Type', border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)), contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12)),
              items: _typeItems.map((t) => DropdownMenuItem(value: t, child: Text(t, style: const TextStyle(fontSize: 13.5)))).toList(),
              validator: (v) => v == null ? 'Select leave type' : null,
              onChanged: (v) => setState(() => _type = v),
            ),
            const SizedBox(height: 12),
            Row(children: [
              Expanded(child: _dateTile('From', df.format(_start), () => _pickDate(true))),
              const SizedBox(width: 10),
              Expanded(child: _dateTile('To', df.format(_end), () => _pickDate(false))),
            ]),
            const SizedBox(height: 8),
            Align(alignment: Alignment.centerLeft, child: Text('Total: $_totalDays day(s)', style: MaanText.caption)),
            const SizedBox(height: 10),
            TextFormField(
              controller: _reason,
              maxLines: 3,
              decoration: InputDecoration(labelText: 'Reason', alignLabelWithHint: true, border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)), contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12)),
              validator: (v) => (v == null || v.trim().isEmpty) ? 'Enter a short reason' : null,
            ),
            if (_error != null) ...[
              const SizedBox(height: 10),
              Text(_error!, style: const TextStyle(color: Colors.red, fontSize: 12.5), textAlign: TextAlign.center),
            ],
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _saving ? null : _submit,
              style: FilledButton.styleFrom(backgroundColor: MaanColors.primary, minimumSize: const Size.fromHeight(48)),
              child: _saving
                  ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2.4))
                  : const Text('Submit Request', style: TextStyle(fontWeight: FontWeight.w700)),
            ),
          ]),
        ),
      ),
    );
  }

  /// Task 135 — balances + recent requests for the picked employee.
  Widget _employeeContextCard() {
    final df = DateFormat('dd MMM');
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: MaanColors.pageBg,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: MaanColors.line),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          const Icon(Icons.insights_rounded, size: 15, color: MaanColors.primary),
          const SizedBox(width: 6),
          const Text('Employee context', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: MaanColors.navy)),
          const Spacer(),
          if (_loadingCtx)
            const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2, color: MaanColors.primary)),
        ]),
        const SizedBox(height: 8),
        if (!_loadingCtx && _empBalances.isEmpty && _recentLeaves.isEmpty)
          const Text('No leave balance or request data available for this employee.', style: MaanText.caption)
        else ...[
          if (_empBalances.isNotEmpty)
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final b in _empBalances.take(8))
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(8), border: Border.all(color: MaanColors.line)),
                    child: Builder(builder: (_) {
                      final lt = b['leaveType'];
                      final name = lt is Map ? '${lt['name'] ?? lt['code'] ?? 'Leave'}' : 'Leave';
                      final remaining = (b['remaining'] is num) ? (b['remaining'] as num).toStringAsFixed(0) : '${b['remaining'] ?? 0}';
                      final total = (b['total'] is num) ? (b['total'] as num).toStringAsFixed(0) : '${b['total'] ?? 0}';
                      return Text('$name: $remaining/$total left', style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, color: MaanColors.navy));
                    }),
                  ),
              ],
            ),
          if (_recentLeaves.isNotEmpty) ...[
            const SizedBox(height: 8),
            const Text('Recent requests', style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w800, color: MaanColors.faint)),
            const SizedBox(height: 4),
            for (final r in _recentLeaves.take(3))
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Builder(builder: (_) {
                  final lt = r['leaveType'];
                  final name = lt is Map ? '${lt['name'] ?? 'Leave'}' : '${r['type'] ?? 'Leave'}';
                  final sd = DateTime.tryParse('${r['startDate'] ?? ''}');
                  final ed = DateTime.tryParse('${r['endDate'] ?? ''}');
                  final dates = sd == null ? '—' : (ed != null && !DateUtils.isSameDay(sd, ed) ? '${df.format(sd)} – ${df.format(ed)}' : df.format(sd));
                  final status = '${r['status'] ?? 'pending'}';
                  final sc = status == 'approved' ? MaanColors.accentGreen : (status == 'rejected' || status == 'cancelled' ? MaanColors.accentRed : MaanColors.accentOrange);
                  return Row(children: [
                    Expanded(child: Text('$name · $dates', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11, color: MaanColors.body))),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(color: sc.withOpacity(.14), borderRadius: BorderRadius.circular(7)),
                      child: Text(status.toUpperCase(), style: TextStyle(fontSize: 8.5, fontWeight: FontWeight.w800, color: sc, letterSpacing: .3)),
                    ),
                  ]);
                }),
              ),
          ],
        ],
      ]),
    );
  }

  Widget _dateTile(String label, String value, VoidCallback onTap) {
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(border: Border.all(color: MaanColors.line), borderRadius: BorderRadius.circular(12)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label, style: MaanText.caption),
          const SizedBox(height: 3),
          Row(children: [
            const Icon(Icons.calendar_today_rounded, size: 14, color: MaanColors.primary),
            const SizedBox(width: 6),
            Text(value, style: MaanText.title.copyWith(fontSize: 13.5)),
          ]),
        ]),
      ),
    );
  }
}
