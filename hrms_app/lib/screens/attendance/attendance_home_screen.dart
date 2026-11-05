import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../config/maan_theme.dart';
import '../../models/attendance.dart';
import '../../providers/attendance_provider.dart';
import '../../services/api_service.dart';
import '../../services/punch_flow.dart';

/// Attendance module — design #12 "My Attendance": location status bar,
/// Office / Out Side mode selector, punch in/out + today's summary + history
/// from /api/attendance. Punches run through the shared PunchFlow (Task 113)
/// with mock-location detection (design #12_Fake_GPS).
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
  String? _statusLine;
  String? _lastGpsNote;
  // Task 108: mobile check-in requires an employee-wise WFH pre-approval
  // granted by admin/management (web → Attendance → Remote Check-In).
  // null = unknown (server still enforces); false = hide punch buttons and
  // show the pre-approval banner instead.
  bool? _mobileCheckInAllowed;
  // Task 113 (design #12): user-declared attendance mode sent with every
  // punch and recorded in the server's audit notes trail.
  String _mode = 'office';

  @override
  void initState() {
    super.initState();
    _loadSummary();
  }

  Future<void> _loadSummary() async {
    // Canonical identity resolution: my-summary first (the server now
    // resolves linked admin accounts too), then directory email match.
    final id = await ApiService.resolveOwnEmployeeId();
    if (!mounted) return;
    if (id != null) {
      setState(() {
        _employeeId = id;
        _summaryError = null;
      });
      try {
        final s = await ApiService.getMySummary();
        if (!mounted) return;
        final perms = s['remotePermissions'];
        setState(() {
          _summary = s;
          if (perms is Map) {
            final v = perms['mobileCheckInEnabled'];
            _mobileCheckInAllowed = v == true;
          }
        });
      } catch (_) {/* summary stays null — card shows placeholder */}
    } else {
      setState(() {
        _summary = null;
        _summaryError = null; // not an error: account has no employee profile
      });
    }
  }

  /// Full punch via the shared PunchFlow — GPS capture, mock-location
  /// detection (design #12_Fake_GPS), server contracts (WFH gate, holiday
  /// gate) and their guidance dialogs.
  Future<void> _punch(String action, String label) async {
    if (_busy) return;
    if (_employeeId == null || _employeeId!.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('No employee profile is linked to this account — punching is available for employee accounts.'),
          backgroundColor: Colors.orange));
      return;
    }
    setState(() {
      _busy = true;
      _statusLine = 'Capturing GPS location...';
    });
    await PunchFlow.executePunch(
      context,
      employeeId: _employeeId!,
      action: action,
      label: label,
      mode: _mode,
      onSuccess: (_) async {
        await _loadSummary();
        if (context.mounted) context.read<AttendanceProvider>().fetchAttendance(refresh: true);
      },
    );
    if (mounted) {
      setState(() {
        _busy = false;
        _statusLine = null;
      });
    }
  }

  /// Design #12 — Office / Out Side selector chip.
  Widget _modeChip(String value, String label, IconData icon) {
    final selected = _mode == value;
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: () => setState(() => _mode = value),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(
          color: selected ? MaanColors.primary.withOpacity(.1) : MaanColors.pageBg,
          border: Border.all(color: selected ? MaanColors.primary : MaanColors.line, width: selected ? 1.4 : 1),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          Icon(icon, size: 16, color: selected ? MaanColors.primary : MaanColors.faint),
          const SizedBox(width: 7),
          Text(label,
              style: MaanText.caption.copyWith(
                fontSize: 12.5,
                fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
                color: selected ? MaanColors.primary : MaanColors.faint,
              )),
          if (selected) ...[
            const SizedBox(width: 5),
            const Icon(Icons.check_circle_rounded, size: 14, color: MaanColors.primary),
          ],
        ]),
      ),
    );
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
          MaanHeader(title: 'My Attendance', onBack: () => Navigator.maybePop(context)),
          const LocationStatusBar(),
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
                    // ── Design #12: "Choose your Attendance mode" selector ──
                    Row(children: [
                      Text('Choose your Attendance mode', style: MaanText.title.copyWith(fontSize: 13.5)),
                      const SizedBox(width: 6),
                      Tooltip(
                        message: 'Office = punching from the office geofence.\nOut Side = working remotely (needs an admin-approved WFH pre-approval).',
                        triggerMode: TooltipTriggerMode.tap,
                        child: const Icon(Icons.info_outline_rounded, size: 14, color: MaanColors.faint),
                      ),
                    ]),
                    const SizedBox(height: 8),
                    Row(children: [
                      Expanded(child: _modeChip('office', 'Office', Icons.business_rounded)),
                      const SizedBox(width: 10),
                      Expanded(child: _modeChip('outside', 'Out Side', Icons.nature_people_rounded)),
                    ]),
                    const SizedBox(height: 14),
                    _PunchCard(
                      summary: _summary,
                      summaryError: _summaryError,
                      todayRow: todayRow,
                      busy: _busy,
                      statusLine: _statusLine,
                      gpsNote: _lastGpsNote,
                      mobileAllowed: _mobileCheckInAllowed != true,
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
  final String? statusLine;
  final String? gpsNote;
  // Task 108: true when the account has NO mobile check-in pre-approval —
  // the buttons are replaced with an explanatory banner (server also 403s).
  final bool mobileAllowed;
  final VoidCallback onCheckIn;
  final VoidCallback onCheckOut;

  const _PunchCard({required this.summary, required this.summaryError, required this.todayRow, required this.busy, this.statusLine, this.gpsNote, this.mobileAllowed = false, required this.onCheckIn, required this.onCheckOut});

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
        if (mobileAllowed) ...[
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(color: Colors.white.withOpacity(.16), borderRadius: BorderRadius.circular(12)),
            child: Row(children: [
              const Icon(Icons.work_history_rounded, color: Colors.white, size: 17),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Mobile check-in is not enabled for your account — it needs a work-from-home pre-approval from admin/management. Please mark attendance on the office biometric device.',
                  style: const TextStyle(color: Colors.white, fontSize: 11, height: 1.35, fontWeight: FontWeight.w600),
                ),
              ),
            ]),
          ),
        ] else ...[
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
        ],
        if (busy && statusLine != null) ...[
          const SizedBox(height: 10),
          Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            const SizedBox(width: 13, height: 13, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)),
            const SizedBox(width: 8),
            Text(statusLine!, style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w700)),
          ]),
        ],
        const SizedBox(height: 10),
        Row(children: [
          const Icon(Icons.location_on_rounded, color: Colors.white70, size: 13),
          const SizedBox(width: 4),
          Expanded(
            child: Text(
              gpsNote ?? 'Check-in/out records your GPS position. Remote (mobile/web) check-in works only with an admin-approved WFH pre-approval.',
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(color: Colors.white70, fontSize: 10.5, height: 1.3),
            ),
          ),
        ]),
        if (todayRow?.checkInGpsLat != null || todayRow?.checkOutGpsLat != null) ...[
          const SizedBox(height: 4),
          Builder(builder: (context) {
            final t = todayRow;
            return Text(
              [
                if (t?.checkInGpsLat != null) 'In: ${t!.checkInGpsLat!.toStringAsFixed(5)}, ${t.checkInGpsLng!.toStringAsFixed(5)}',
                if (t?.checkOutGpsLat != null) 'Out: ${t!.checkOutGpsLat!.toStringAsFixed(5)}, ${t.checkOutGpsLng!.toStringAsFixed(5)}',
              ].join('   '),
              style: const TextStyle(color: Colors.white54, fontSize: 10),
            );
          }),
        ],
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
          if (record.checkInGpsLat != null || (record.location ?? '').isNotEmpty) ...[
            const SizedBox(height: 2),
            Text(
              record.location ?? 'GPS ${record.checkInGpsLat!.toStringAsFixed(5)}, ${record.checkInGpsLng!.toStringAsFixed(5)}',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: MaanText.caption.copyWith(fontSize: 10.5),
            ),
          ],
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
