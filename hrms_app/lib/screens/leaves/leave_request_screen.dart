import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../config/colors.dart';
import '../../config/maan_theme.dart';
import '../../providers/leave_provider.dart';
import '../../services/api_service.dart';
import '../../widgets/custom_button.dart';

/// Task 113 — Leave Request rebuilt from design #06_Leave_Request:
///  · "Total Leave" section with LIVE per-type balance cards (used/total)
///    from GET /api/leaves/my-balance
///  · leave-type selector chips showing remaining days (red when exhausted)
///  · date-range pickers + reason + contact (server-validated submit)
class LeaveRequestScreen extends StatefulWidget {
  const LeaveRequestScreen({super.key});

  @override
  State<LeaveRequestScreen> createState() => _LeaveRequestScreenState();
}

class _LeaveRequestScreenState extends State<LeaveRequestScreen> {
  final _formKey = GlobalKey<FormState>();
  final _reasonController = TextEditingController();
  final _contactController = TextEditingController();
  String? _leaveType;
  DateTime _startDate = DateTime.now();
  DateTime _endDate = DateTime.now();

  bool _loadingBalance = true;
  String? _balanceError;
  Map<String, dynamic>? _balance; // raw my-balance response
  List<Map<String, dynamic>> _rows = []; // [{leaveType, total, used, remaining}]

  static const List<String> _fallbackTypes = [
    'Casual Leave', 'Sick Leave', 'Earned Leave', 'Maternity Leave',
    'Paternity Leave', 'Comp Off', 'Loss of Pay', 'Half Day Leave',
  ];

  @override
  void initState() {
    super.initState();
    _loadBalance();
  }

  @override
  void dispose() {
    _reasonController.dispose();
    _contactController.dispose();
    super.dispose();
  }

  Future<void> _loadBalance() async {
    setState(() {
      _loadingBalance = true;
      _balanceError = null;
    });
    try {
      final b = await ApiService.getMyLeaveBalance();
      if (!mounted) return;
      final rawRows = (b['rows'] as List?) ?? const [];
      final rows = rawRows
          .whereType<Map>()
          .map((r) => Map<String, dynamic>.from(r))
          .toList();
      setState(() {
        _balance = b;
        _rows = rows;
        _loadingBalance = false;
        // Preselect: first type with remaining days (or first row at all).
        if (rows.isNotEmpty) {
          final withDays = rows.where((r) => ((r['remaining'] as num?) ?? 0) > 0).toList();
          _leaveType = (withDays.isNotEmpty ? withDays.first : rows.first)['leaveType']?.toString();
        }
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _balanceError = 'Could not load your leave balance — showing standard leave types.';
        _loadingBalance = false;
      });
    }
  }

  List<String> get _typeOptions {
    if (_rows.isNotEmpty) return _rows.map((r) => r['leaveType']?.toString() ?? 'Leave').toList();
    return _fallbackTypes;
  }

  Map<String, dynamic>? get _selectedRow {
    if (_rows.isEmpty || _leaveType == null) return null;
    for (final r in _rows) {
      if ((r['leaveType']?.toString() ?? '') == _leaveType) return r;
    }
    return null;
  }

  int get _selectedRemaining => (_selectedRow?['remaining'] as num?)?.toInt() ?? -1;

  int get _daysCount => _endDate.difference(_startDate).inDays + 1;

  Future<void> _selectDate(bool isStart) async {
    final picked = await showDatePicker(
      context: context,
      initialDate: isStart ? _startDate : _endDate,
      firstDate: isStart ? DateTime.now() : _startDate,
      lastDate: DateTime.now().add(const Duration(days: 365)),
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx).copyWith(colorScheme: Theme.of(ctx).colorScheme.copyWith(primary: AppColors.primary)),
        child: child!,
      ),
    );
    if (picked != null) {
      setState(() {
        if (isStart) {
          _startDate = picked;
          if (_endDate.isBefore(_startDate)) _endDate = _startDate;
        } else {
          _endDate = picked;
        }
      });
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_leaveType == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Please choose a leave type'), backgroundColor: AppColors.error));
      return;
    }
    final success = await context.read<LeaveProvider>().createLeave({
      'leaveType': _leaveType,
      'startDate': DateFormat('yyyy-MM-dd').format(_startDate),
      'endDate': DateFormat('yyyy-MM-dd').format(_endDate),
      'reason': _reasonController.text.trim(),
      'contactNumber': _contactController.text.trim(),
      'numberOfDays': _daysCount,
    });
    if (mounted) {
      if (success) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Leave request submitted successfully'), backgroundColor: AppColors.success),
        );
        Navigator.pop(context);
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(context.read<LeaveProvider>().error ?? 'Failed'), backgroundColor: AppColors.error),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<LeaveProvider>();
    final linked = _balance?['linked'] != false;
    final totalLeaves = (_balance?['total'] as num?)?.round() ?? 0;

    return Scaffold(
      backgroundColor: const Color(0xFFF6F4FD),
      appBar: AppBar(
        title: const Text('Leave Request', style: TextStyle(fontWeight: FontWeight.w700)),
        backgroundColor: const Color(0xFFF6F4FD),
        elevation: 0,
        foregroundColor: AppColors.textPrimary,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(18, 6, 18, 24),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // ── Total Leave balance cards (design #06) ──
              if (_loadingBalance)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 26),
                  child: Center(child: CircularProgressIndicator(color: AppColors.primary)),
                )
              else ...[
                if (_balanceError != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Row(children: [
                      const Icon(Icons.info_outline_rounded, size: 15, color: Colors.orange),
                      const SizedBox(width: 6),
                      Expanded(child: Text(_balanceError!, style: MaanText.caption.copyWith(fontSize: 11.5, color: Colors.orange.shade800))),
                    ]),
                  ),
                if (_rows.isNotEmpty) ...[
                  Row(children: [
                    Text('Total Leave', style: MaanText.h2.copyWith(fontSize: 16)),
                    const SizedBox(width: 8),
                    if (linked)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
                        decoration: BoxDecoration(color: AppColors.primary.withOpacity(.1), borderRadius: BorderRadius.circular(9)),
                        child: Text('$totalLeaves days', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: AppColors.primary)),
                      ),
                  ]),
                  const SizedBox(height: 10),
                  GridView.builder(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: 2, mainAxisSpacing: 10, crossAxisSpacing: 10, childAspectRatio: 1.52),
                    itemCount: _rows.length,
                    itemBuilder: (_, i) => _balanceCard(_rows[i]),
                  ),
                ] else if (linked && _balanceError == null)
                  Text('No leave balances configured for your account yet — pick a type below.',
                      style: MaanText.caption.copyWith(fontSize: 11.5)),
              ],
              const SizedBox(height: 18),

              // ── Leave type (required) ──
              Text('Leave Type *', style: MaanText.title.copyWith(fontSize: 13)),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: _typeOptions.map((t) {
                  final row = _rows.isNotEmpty
                      ? _rows.firstWhere((r) => (r['leaveType']?.toString() ?? '') == t, orElse: () => {})
                      : null;
                  final remaining = row == null || row.isEmpty ? null : ((row['remaining'] as num?)?.round() ?? 0);
                  final selected = _leaveType == t;
                  final exhausted = remaining != null && remaining <= 0;
                  return InkWell(
                    borderRadius: BorderRadius.circular(11),
                    onTap: () => setState(() => _leaveType = t),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      decoration: BoxDecoration(
                        color: selected ? AppColors.primary : Colors.white,
                        border: Border.all(
                            color: exhausted
                                ? Colors.red.withOpacity(.55)
                                : selected
                                    ? AppColors.primary
                                    : AppColors.border),
                        borderRadius: BorderRadius.circular(11),
                      ),
                      child: Row(mainAxisSize: MainAxisSize.min, children: [
                        Text(t,
                            style: TextStyle(
                                fontSize: 12.5,
                                fontWeight: FontWeight.w700,
                                color: selected ? Colors.white : AppColors.textPrimary)),
                        if (remaining != null) ...[
                          const SizedBox(width: 6),
                          Text('$remaining d',
                              style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w800,
                                  color: selected
                                      ? (exhausted ? Colors.red.shade200 : Colors.white70)
                                      : exhausted
                                          ? Colors.red
                                          : AppColors.primary)),
                        ],
                      ]),
                    ),
                  );
                }).toList(),
              ),
              if (_selectedRemaining == 0)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text('$_leaveType has 0 days remaining — the request will need special approval.',
                      style: MaanText.caption.copyWith(fontSize: 11.5, color: Colors.red)),
                ),
              const SizedBox(height: 18),

              // ── Select Dates (required) ──
              Text('Select Dates *', style: MaanText.title.copyWith(fontSize: 13)),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(child: _buildDatePicker('From', _startDate, true)),
                  const SizedBox(width: 12),
                  Expanded(child: _buildDatePicker('To', _endDate, false)),
                ],
              ),
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.primary.withValues(alpha: 0.06),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.calendar_today, color: AppColors.primary, size: 18),
                    const SizedBox(width: 8),
                    Text('$_daysCount Day${_daysCount > 1 ? 's' : ''}', style: const TextStyle(
                      color: AppColors.primary, fontSize: 16, fontWeight: FontWeight.w600,
                    )),
                  ],
                ),
              ),
              const SizedBox(height: 18),

              // ── Reason ──
              Text('Reason', style: MaanText.title.copyWith(fontSize: 13)),
              const SizedBox(height: 8),
              TextFormField(
                controller: _reasonController,
                maxLines: 4,
                validator: (v) => (v == null || v.trim().isEmpty) ? 'Please provide a reason' : null,
                decoration: InputDecoration(
                  hintText: 'Enter reason for leave',
                  filled: true, fillColor: Colors.white,
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                ),
              ),
              const SizedBox(height: 16),

              // ── Contact ──
              Text('Contact During Leave', style: MaanText.title.copyWith(fontSize: 13)),
              const SizedBox(height: 8),
              TextFormField(
                controller: _contactController,
                keyboardType: TextInputType.phone,
                decoration: InputDecoration(
                  hintText: 'Enter contact number',
                  prefixIcon: const Icon(Icons.phone, color: AppColors.textTertiary, size: 20),
                  filled: true, fillColor: Colors.white,
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                ),
              ),
              const SizedBox(height: 26),
              CustomButton(
                text: 'Submit Leave Request',
                isLoading: provider.isSubmitting,
                onPressed: _submit,
                icon: Icons.send,
              ),
              const SizedBox(height: 20),
            ],
          ),
        ),
      ),
    );
  }

  /// One "Total Leave" card: type name + used/total (design #06: Casual Leave
  /// 7/14 etc.) with a remaining-day progress strip.
  Widget _balanceCard(Map<String, dynamic> r) {
    final name = (r['leaveType'] ?? 'Leave').toString();
    final total = ((r['total'] as num?) ?? 0).round();
    final used = ((r['used'] as num?) ?? 0).round();
    final remaining = ((r['remaining'] as num?) ?? 0).round();
    final pct = total > 0 ? (remaining / total).clamp(0.0, 1.0) : 0.0;
    final exhausted = remaining <= 0;
    final color = exhausted ? Colors.red : AppColors.primary;

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(13),
        border: Border.all(color: exhausted ? Colors.red.withOpacity(.3) : Colors.black.withOpacity(.05)),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(.04), blurRadius: 8, offset: const Offset(0, 3))],
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.center, children: [
        Text(name,
            maxLines: 1, overflow: TextOverflow.ellipsis,
            style: MaanText.caption.copyWith(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.textSecondary)),
        const SizedBox(height: 3),
        Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
          Text('$used', style: TextStyle(fontSize: 21, fontWeight: FontWeight.w800, color: color)),
          Text('/$total', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Colors.black.withOpacity(.45))),
        ]),
        const SizedBox(height: 6),
        ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: LinearProgressIndicator(
            value: total > 0 ? pct : 0,
            minHeight: 4.5,
            backgroundColor: Colors.black.withOpacity(.07),
            color: color,
          ),
        ),
      ]),
    );
  }

  Widget _buildDatePicker(String label, DateTime date, bool isStart) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: MaanText.caption.copyWith(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.textSecondary)),
        const SizedBox(height: 6),
        GestureDetector(
          onTap: () => _selectDate(isStart),
          child: Container(
            padding: const EdgeInsets.all(13),
            decoration: BoxDecoration(
              color: Colors.white,
              border: Border.all(color: AppColors.border),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              children: [
                const Icon(Icons.calendar_today, color: AppColors.primary, size: 18),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(DateFormat('yyyy-MM-dd').format(date),
                      maxLines: 1, overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
