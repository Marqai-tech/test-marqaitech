import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../config/maan_theme.dart';
import '../../services/api_service.dart';

/// Task 112 — Attendance Report built from design #17:
///  · blue header with a report-period dropdown ("Daily Report" in the
///    design → This Month / Last Month / Last 7 Days)
///  · table Date | In Time | Out Time | Status with the colored letter
///    badges (P present · L late · A absent · W weekend · H holiday ·
///    O on-leave · HD half-day)
///  · data = the signed-in employee's own rows for the period
///    (GET /api/attendance?startDate&endDate&employeeId).
class AttendanceReportScreen extends StatefulWidget {
  const AttendanceReportScreen({super.key});

  @override
  State<AttendanceReportScreen> createState() => _AttendanceReportScreenState();
}

class _AttendanceReportScreenState extends State<AttendanceReportScreen> {
  String _period = 'This Month';
  List<Map<String, dynamic>> _rows = [];
  String? _employeeId;
  bool _loading = true;
  String? _error;

  static const _periods = ['This Month', 'Last Month', 'Last 7 Days'];

  @override
  void initState() {
    super.initState();
    _load();
  }

  (DateTime, DateTime) _range() {
    final now = DateTime.now();
    switch (_period) {
      case 'Last Month':
        final first = DateTime(now.year, now.month - 1, 1);
        return (first, DateTime(now.year, now.month, 0));
      case 'Last 7 Days':
        return (now.subtract(const Duration(days: 6)), now);
      default:
        return (DateTime(now.year, now.month, 1), DateTime(now.year, now.month + 1, 0));
    }
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final id = _employeeId ??= await ApiService.resolveOwnEmployeeId();
      if (id == null || id.isEmpty) {
        if (mounted) {
          setState(() { _loading = false; _error = 'No employee profile is linked to this account, so a personal attendance report is not available. Use Attendance in the module grid for team-wide records.'; });
        }
        return;
      }
      final (start, end) = _range();
      final fmt = (DateTime d) => '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
      final data = await ApiService.getAttendance(startDate: fmt(start), endDate: fmt(end), employeeId: id, limit: 62);
      final rows = ((data['attendance'] ?? data['data']) as List? ?? [])
          .whereType<Map>()
          .where((r) => '${r['employeeId'] ?? ''}' == id)
          .map((r) => Map<String, dynamic>.from(r))
          .toList();
      final startD = DateTime(start.year, start.month, start.day);
      final endD = DateTime(end.year, end.month, end.day).add(const Duration(days: 1));
      rows.removeWhere((r) {
        final d = DateTime.tryParse('${r['date']}');
        return d == null || d.isBefore(startD) || !d.isBefore(endD);
      });
      rows.sort((a, b) {
        final da = DateTime.tryParse('${a['date']}') ?? DateTime(1970);
        final db = DateTime.tryParse('${b['date']}') ?? DateTime(1970);
        return db.compareTo(da);
      });
      if (!mounted) return;
      setState(() { _rows = rows; _loading = false; });
    } catch (e) {
      if (!mounted) return;
      setState(() { _loading = false; _error = e.toString().replaceAll('Exception: ', ''); });
    }
  }

  @override
  Widget build(BuildContext context) {
    final (start, end) = _range();
    final df = DateFormat('dd-MMM-yyyy');
    return Scaffold(
      backgroundColor: MaanColors.pageBg,
      appBar: AppBar(
        backgroundColor: MaanColors.primary,
        foregroundColor: Colors.white,
        title: const Text('Attend. Report', style: TextStyle(fontWeight: FontWeight.w800)),
        elevation: 0,
      ),
      body: Column(
        children: [
          // ── Period dropdown ──
          Container(
            color: MaanColors.primary,
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 14),
            child: Row(children: [
              Expanded(
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(10)),
                  child: DropdownButtonHideUnderline(
                    child: DropdownButton<String>(
                      value: _period,
                      isExpanded: true,
                      icon: const Icon(Icons.keyboard_arrow_down_rounded, color: MaanColors.primary),
                      style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: MaanColors.navy),
                      items: [for (final p in _periods) DropdownMenuItem(value: p, child: Text('$p Report'))],
                      onChanged: (v) { if (v != null && v != _period) { _period = v; _load(); } },
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Text('${df.format(start)} → ${df.format(end)}', style: const TextStyle(color: Colors.white70, fontSize: 11, fontWeight: FontWeight.w600)),
            ]),
          ),
          // ── Legend ──
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(children: [
                _legend('P', 'Present', MaanColors.accentGreen),
                _legend('L', 'Late', MaanColors.accentOrange),
                _legend('A', 'Absent', MaanColors.accentRed),
                _legend('W', 'Weekend', MaanColors.accentIndigo),
                _legend('H', 'Holiday', MaanColors.accentCyan),
                _legend('O', 'On Leave', MaanColors.accentPurple),
                _legend('HD', 'Half Day', const Color(0xFFB26A00)),
              ]),
            ),
          ),
          // ── Table ──
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator(color: MaanColors.primary))
                : _error != null
                    ? ListView(padding: const EdgeInsets.all(24), children: [
                        const Icon(Icons.fact_check_rounded, size: 46, color: MaanColors.faint),
                        const SizedBox(height: 12),
                        Text(_error!, style: MaanText.body, textAlign: TextAlign.center),
                        const SizedBox(height: 12),
                        Center(child: FilledButton(onPressed: _load, style: FilledButton.styleFrom(backgroundColor: MaanColors.primary), child: const Text('Retry'))),
                      ])
                    : _rows.isEmpty
                        ? ListView(children: const [
                            SizedBox(height: 90),
                            Center(child: Text('No attendance records in this period', style: MaanText.body)),
                          ])
                        : Container(
                            margin: const EdgeInsets.fromLTRB(14, 4, 14, 18),
                            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: MaanColors.line)),
                            child: Column(
                              children: [
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
                                  decoration: const BoxDecoration(
                                    color: Color(0xFFF1F4FB),
                                    borderRadius: BorderRadius.vertical(top: Radius.circular(14)),
                                  ),
                                  child: const Row(children: [
                                    Expanded(flex: 4, child: Text('Date', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 12, color: MaanColors.navy))),
                                    Expanded(flex: 3, child: Text('In Time', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 12, color: MaanColors.navy))),
                                    Expanded(flex: 3, child: Text('Out Time', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 12, color: MaanColors.navy))),
                                    Expanded(flex: 2, child: Text('Status', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 12, color: MaanColors.navy))),
                                  ]),
                                ),
                                Expanded(
                                  child: ListView.separated(
                                    itemCount: _rows.length,
                                    separatorBuilder: (_, __) => const Divider(color: MaanColors.line, height: 1),
                                    itemBuilder: (ctx, i) => _row(_rows[i]),
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

  Widget _legend(String letter, String label, Color color) {
    return Padding(
      padding: const EdgeInsets.only(right: 12),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        _statusBadge(letter, color),
        const SizedBox(width: 4),
        Text(label, style: MaanText.caption.copyWith(fontSize: 10.5, fontWeight: FontWeight.w600)),
      ]),
    );
  }

  Widget _statusBadge(String letter, Color color) {
    return Container(
      width: 22, height: 22,
      alignment: Alignment.center,
      decoration: BoxDecoration(color: color.withOpacity(.14), borderRadius: BorderRadius.circular(6)),
      child: Text(letter, style: TextStyle(color: color, fontSize: 10.5, fontWeight: FontWeight.w800)),
    );
  }

  Widget _row(Map<String, dynamic> r) {
    final date = DateTime.tryParse('${r['date']}')?.toLocal();
    final cin = DateTime.tryParse('${r['checkIn'] ?? ''}')?.toLocal();
    final cout = DateTime.tryParse('${r['checkOut'] ?? ''}')?.toLocal();
    final status = '${r['status'] ?? 'present'}';
    final (letter, color) = _statusOf(status);
    final tf = DateFormat('hh:mm a');
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      child: Row(
        children: [
          Expanded(flex: 4, child: Text(date != null ? DateFormat('dd-MMM-yyyy').format(date) : '—', style: const TextStyle(fontSize: 12, color: MaanColors.body))),
          Expanded(flex: 3, child: Text(cin != null ? tf.format(cin) : '—', style: const TextStyle(fontSize: 12, color: MaanColors.body))),
          Expanded(flex: 3, child: Text(cout != null ? tf.format(cout) : '—', style: const TextStyle(fontSize: 12, color: MaanColors.body))),
          Expanded(flex: 2, child: _statusBadge(letter, color)),
        ],
      ),
    );
  }

  (String, Color) _statusOf(String status) {
    switch (status.toLowerCase()) {
      case 'present':
        return ('P', MaanColors.accentGreen);
      case 'late':
        return ('L', MaanColors.accentOrange);
      case 'absent':
        return ('A', MaanColors.accentRed);
      case 'weekend':
        return ('W', MaanColors.accentIndigo);
      case 'holiday':
        return ('H', MaanColors.accentCyan);
      case 'on_leave':
        return ('O', MaanColors.accentPurple);
      case 'half_day':
        return ('HD', const Color(0xFFB26A00));
      default:
        return (status.isNotEmpty ? status[0].toUpperCase() : '—', MaanColors.faint);
    }
  }
}
