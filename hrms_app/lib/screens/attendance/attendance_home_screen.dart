import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
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
  String? _statusLine;
  String? _lastGpsNote;
  // Task 108: mobile check-in requires an employee-wise WFH pre-approval
  // granted by admin/management (web → Attendance → Remote Check-In).
  // null = unknown (server still enforces); false = hide punch buttons and
  // show the pre-approval banner instead.
  bool? _mobileCheckInAllowed;

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

  /// Capture the device GPS fix used for geofenced check-in/out.
  /// Throws a user-readable exception when location cannot be captured.
  Future<PunchGps> _captureGps() async {
    final serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      final open = await _askDialog(
          'Location is off', 'Turn on device location so your check-in can be verified against the office location.');
      if (open == true) await Geolocator.openLocationSettings();
      throw Exception('Location services are disabled. Enable location and try again.');
    }
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied) {
      throw Exception('Location permission is required for check-in/out.');
    }
    if (permission == LocationPermission.deniedForever) {
      final open = await _askDialog(
          'Permission blocked', 'Allow location access for 3 Boxes HRMS from App settings to record attendance.');
      if (open == true) await Geolocator.openAppSettings();
      throw Exception('Location permission is blocked. Enable it in App settings and try again.');
    }
    final pos = await Geolocator.getCurrentPosition(
      desiredAccuracy: LocationAccuracy.high,
      timeLimit: const Duration(seconds: 20),
    );
    return PunchGps(lat: pos.latitude, lng: pos.longitude, accuracy: pos.accuracy);
  }

  Future<bool> _askDialog(String title, String body) async {
    final res = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title, style: MaanText.title.copyWith(fontSize: 17)),
        content: Text(body, style: MaanText.body),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: MaanColors.primary),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Open Settings'),
          ),
        ],
      ),
    );
    return res == true;
  }

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
    try {
      final gps = await _captureGps();
      if (!mounted) return;
      setState(() => _statusLine = 'Recording $label...');
      final res = await ApiService.punch(employeeId: _employeeId!, action: action, gps: gps);
      final serverMessage = (res['message'] ?? '').toString();
      final note =
          'GPS: ${gps.lat.toStringAsFixed(6)}, ${gps.lng.toStringAsFixed(6)}${gps.accuracy != null ? ' (+/-${gps.accuracy!.round()} m)' : ''}';
      if (mounted) {
        setState(() => _lastGpsNote = note);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text(serverMessage.isNotEmpty ? '$label recorded. $serverMessage' : '$label recorded successfully. $note'),
            backgroundColor: Colors.green));
      }
      await _loadSummary();
      if (mounted) context.read<AttendanceProvider>().fetchAttendance(refresh: true);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text(e.toString().replaceAll('Exception: ', '')), backgroundColor: Colors.red));
      }
    }
    if (mounted) {
      setState(() {
        _busy = false;
        _statusLine = null;
      });
    }
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
