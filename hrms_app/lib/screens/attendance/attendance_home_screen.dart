import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../config/maan_theme.dart';
import '../../models/attendance.dart';
import '../../providers/attendance_provider.dart';
import '../../services/api_service.dart';

/// Attendance module — punch in/out + today's summary + history from /api/attendance.
class AttendanceHomeScreen extends StatelessWidget {
  const AttendanceHomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => AttendanceProvider()..fetchAttendance(),
      child: const _AttendanceBody(),
    );
  }
}

class _AttendanceBody extends StatefulWidget {
  const _AttendanceBody();

  @override
  State<_AttendanceBody> createState() => _AttendanceBodyState();
}

class _AttendanceBodyState extends State<_AttendanceBody> {
  Map<String, dynamic>? _summary;
  String? _employeeId;
  String? _summaryError;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _loadSummary();
  }

  Future<void> _loadSummary() async {
    try {
      final s = await ApiService.getMySummary();
      setState(() {
        _summary = s;
        _summaryError = null;
        _employeeId = (s['employee']?['id'] ?? s['employeeId'])?.toString();
      });
    } catch (e) {
      setState(() {
        _summary = null;
        _summaryError = e.toString().replaceAll('Exception: ', '');
      });
    }
  }

  Future<void> _punch(String action, String label) async {
    if (_busy) return;
    if (_employeeId == null || _employeeId!.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('No employee profile is linked to this account — punching is available for employee accounts.'),
        backgroundColor: Colors.orange));
      return;
    }
    setState(() => _busy = true);
    try {
      await ApiService.punch(employeeId: _employeeId!, action: action);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$label recorded successfully'), backgroundColor: Colors.green));
      }
      await _loadSummary();
      if (mounted) context.read<AttendanceProvider>().fetchAttendance(refresh: true);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text(e.toString().replaceAll('Exception: ', '')), backgroundColor: Colors.red));
      }
    }
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<AttendanceProvider>();
    final rows = provider.attendanceRecords;
    final today = DateTime.now();

    AttendanceModel? todayRow;
    for (final r in rows) {
      if (DateUtils.isSameDay(r.date, today)) { todayRow = r; break; }
    }

    return Scaffold(
      backgroundColor: MaanColors.pageBg,
      body: Column(
        children: [
          MaanHeader(title: 'Attendance', onBack: () => Navigator.maybePop(context)),
          Expanded(
            child: Container(
              width: double.infinity,
              margin: const EdgeInsets.only(top: 18),
              padding: const EdgeInsets.fromLTRB(16, 20, 16, 0),
              decoration: const BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.only(topLeft: Radius.circular(30), topRight: Radius.circular(30)),
              ),
              child: RefreshIndicator(
                color: MaanColors.primary,
                onRefresh: () async { await _loadSummary(); await provider.fetchAttendance(refresh: true); },
                child: ListView(
                  padding: const EdgeInsets.only(bottom: 24),
                  children: [
                    _PunchCard(
                      summary: _summary,
                      summaryError: _summaryError,
                      todayRow: todayRow,
                      busy: _busy,
                      onCheckIn: () => _punch('checkin', 'Check-in'),
                      onCheckOut: () => _punch('checkout', 'Check-out'),
                    ),
                    const SizedBox(height: 16),
                    Text('Recent Records', style: MaanText.h2.copyWith(fontSize: 16)),
                    const SizedBox(height: 10),
                    if (provider.isLoading)
                      const Padding(
                        padding: EdgeInsets.all(28),
                        child: Center(child: CircularProgressIndicator(color: MaanColors.primary)),
                      )
                    else if (provider.error != null)
                      Text(provider.error!, style: MaanText.body, textAlign: TextAlign.center)
                    else if (rows.isEmpty)
                      const Padding(
                        padding: EdgeInsets.all(24),
                        child: Center(child: Text('No attendance records visible for your account', style: MaanText.body)),
                      )
                    else
                      ...rows.take(30).map((r) => _AttendanceRow(record: r)),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _PunchCard extends StatelessWidget {
  final Map<String, dynamic>? summary;
  final String? summaryError;
  final AttendanceModel? todayRow;
  final bool busy;
  final VoidCallback onCheckIn;
  final VoidCallback onCheckOut;

  const _PunchCard({required this.summary, required this.summaryError, required this.todayRow, required this.busy, required this.onCheckIn, required this.onCheckOut});

  @override
  Widget build(BuildContext context) {
    final checkedIn = todayRow?.checkIn != null;
    final checkedOut = todayRow?.checkOut != null;
    final status = (todayRow?.status ?? '').toString();

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: const LinearGradient(colors: [Color(0xFF5B7FE8), Color(0xFF7C6FF0)]),
        borderRadius: BorderRadius.circular(18),
        boxShadow: [BoxShadow(color: MaanColors.primary.withOpacity(.3), blurRadius: 16, offset: const Offset(0, 6))],
      ),
      child: Column(children: [
        Text(DateFormat('EEEE, dd MMM yyyy').format(DateTime.now()),
            style: const TextStyle(color: Colors.white70, fontSize: 12.5, fontWeight: FontWeight.w600)),
        const SizedBox(height: 6),
        Text(
          checkedOut ? 'Checked out' : (checkedIn ? 'Checked in' : (summaryError != null ? 'Profile not linked' : 'Not checked in')),
          style: const TextStyle(color: Colors.white, fontSize: 19, fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 4),
        Text(
          '${_fmt(todayRow?.checkIn)}  →  ${_fmt(todayRow?.checkOut)}${status.isNotEmpty ? '  ·  ${status.replaceAll('_', ' ')}' : ''}',
          style: const TextStyle(color: Colors.white70, fontSize: 12.5),
        ),
        const SizedBox(height: 14),
        Row(children: [
          Expanded(
            child: FilledButton.icon(
              onPressed: busy || checkedIn ? null : onCheckIn,
              style: FilledButton.styleFrom(backgroundColor: Colors.white, foregroundColor: MaanColors.primary, minimumSize: const Size.fromHeight(44)),
              icon: const Icon(Icons.login_rounded, size: 18),
              label: const Text('Check In', style: TextStyle(fontWeight: FontWeight.w800)),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: FilledButton.icon(
              onPressed: busy || !checkedIn || checkedOut ? null : onCheckOut,
              style: FilledButton.styleFrom(backgroundColor: Colors.white.withOpacity(checkedIn && !checkedOut ? 1 : .4), foregroundColor: MaanColors.primary, minimumSize: const Size.fromHeight(44)),
              icon: const Icon(Icons.logout_rounded, size: 18),
              label: const Text('Check Out', style: TextStyle(fontWeight: FontWeight.w800)),
            ),
          ),
        ]),
      ]),
    );
  }

  static String _fmt(DateTime? v) {
    if (v == null) return '--:--';
    return DateFormat('HH:mm').format(v);
  }
}

class _AttendanceRow extends StatelessWidget {
  final AttendanceModel record;
  const _AttendanceRow({required this.record});

  @override
  Widget build(BuildContext context) {
    final date = record.date;
    final status = record.status;
    final workHours = record.totalHours;

    Color c;
    switch (status) {
      case 'present':
        c = MaanColors.accentGreen;
        break;
      case 'absent':
        c = MaanColors.accentRed;
        break;
      case 'on_leave':
        c = MaanColors.accentOrange;
        break;
      default:
        c = MaanColors.primary;
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(border: Border.all(color: MaanColors.line), borderRadius: BorderRadius.circular(13)),
      child: Row(children: [
        Container(width: 4, height: 36, decoration: BoxDecoration(color: c, borderRadius: BorderRadius.circular(3))),
        const SizedBox(width: 10),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(DateFormat('EEE, dd MMM yyyy').format(date), style: MaanText.title),
          const SizedBox(height: 2),
          Text('${_fmt(record.checkIn)}  →  ${_fmt(record.checkOut)}${(workHours ?? '').toString().isNotEmpty && workHours != 'null' ? '  ·  $workHours' : ''}', style: MaanText.caption),
        ])),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
          decoration: BoxDecoration(color: c.withOpacity(.14), borderRadius: BorderRadius.circular(9)),
          child: Text(status.replaceAll('_', ' ').toUpperCase(), style: const TextStyle(fontSize: 9.5, fontWeight: FontWeight.w800, color: MaanColors.navy, letterSpacing: .4)),
        ),
      ]),
    );
  }

  static String _fmt(DateTime? v) {
    if (v == null) return '--:--';
    return DateFormat('HH:mm').format(v);
  }
}
