import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../config/maan_theme.dart';
import '../../models/user.dart';
import '../../providers/auth_provider.dart';
import '../../services/api_service.dart';
import '../../services/punch_flow.dart';
import '../../services/storage_service.dart';
import '../../utils/json_safe.dart';
import '../../widgets/maan_avatar.dart';
import '../../widgets/main_scaffold.dart';
import '../../widgets/app_drawer.dart';

/// Task 112 — Home rebuilt from designs #03/#04/#05:
///  · header with date, greeting, avatar and a LIVE notification bell badge
///  · Check / Break Time / Leave tabs with fingerprint punch buttons
///  · Today Time Log (late-in, early-out, break, worked, overtime) from the
///    real attendance row of today
///  · This Month (working days + presents/late/absent) from my-summary
///  · punch keeps the Task 108/109 server contracts: GPS capture, WFH
///    pre-approval banner, holiday-approval dialog.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> with SingleTickerProviderStateMixin {
  late final TabController _tabs = TabController(length: 3, vsync: this);
  UserModel? _me;
  String? _employeeId;
  Map<String, dynamic>? _todayRow;      // raw attendance row of today
  Map<String, dynamic>? _summary;       // my-summary (month stats)
  Map<String, dynamic>? _leaveBalance;  // my-balance (total/used/pending)
  bool? _mobileCheckInAllowed;          // Task 108 WFH pre-approval
  int _unread = 0;
  bool _loading = true;
  bool _busy = false;
  Timer? _ticker;

  @override
  void initState() {
    super.initState();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) { if (mounted) setState(() {}); });
    _load();
  }

  @override
  void dispose() {
    _ticker?.cancel();
    _tabs.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final data = StorageService.getUserData();
    if (data != null) {
      try {
        if (mounted) setState(() => _me = UserModel.fromJson(jsonDecode(data)));
      } catch (_) {}
    }
    final fresh = await ApiService.refreshStoredUser();
    if (fresh != null && mounted) setState(() => _me = fresh);

    final results = await Future.wait([
      _safe(() => ApiService.resolveOwnEmployeeId()),
      _safe(() => ApiService.getMySummary()),
      _safe(() => ApiService.getMyLeaveBalance()),
      _safe(() => ApiService.getNotifications()), // unread badge (full list is the /notifications screen's job)
      _safe(() => ApiService.getAttendance(date: _today())),
    ]);
    if (!mounted) return;
    final id = results[0] as String?;
    final summary = results[1] as Map<String, dynamic>?;
    final balance = results[2] as Map<String, dynamic>?;
    Map<String, dynamic>? unreadPayload = results[3] as Map<String, dynamic>?;
    Map<String, dynamic>? todayPayload = results[4] as Map<String, dynamic>?;

    Map<String, dynamic>? row;
    if (todayPayload != null) {
      final list = jsonList(todayPayload['attendance'] is List ? todayPayload['attendance'] : todayPayload['data']);
      if (list.isNotEmpty) {
        // Prefer the row that belongs to the signed-in employee (admins see
        // everyone for a date; employees get only their own).
        for (final r in list) {
          if (r is Map && id != null && '${r['employeeId'] ?? r['employee']?['id'] ?? ''}' == id) { row = Map<String, dynamic>.from(r); break; }
        }
        row ??= (list.first is Map) ? Map<String, dynamic>.from(list.first as Map) : null;
      }
    }
    int unread = 0;
    if (unreadPayload != null) {
      final list = jsonList(unreadPayload['notifications'] is List ? unreadPayload['notifications'] : unreadPayload['data']);
      final pag = jsonMap(unreadPayload['pagination']);
      unread = (pag['total'] is num)
          ? (pag['total'] as num).toInt()
          : list.where((n) => n is Map && n['isRead'] != true).length;
    }
    final perms = summary?['remotePermissions'];
    setState(() {
      _employeeId = id;
      _summary = summary;
      _leaveBalance = balance;
      _todayRow = row;
      _unread = unread;
      if (perms is Map) _mobileCheckInAllowed = perms['mobileCheckInEnabled'] == true;
      _loading = false;
    });
  }

  static Future<dynamic> _safe(Future<dynamic> Function() f) async {
    try { return await f(); } catch (_) { return null; }
  }

  static String _today() {
    final n = DateTime.now();
    final m = n.month.toString().padLeft(2, '0');
    final d = n.day.toString().padLeft(2, '0');
    return '${n.year}-$m-$d';
  }

  // ── Attendance row helpers ──
  DateTime? _ts(String key) {
    final v = _todayRow?[key];
    if (v == null) return null;
    return DateTime.tryParse('$v')?.toLocal();
  }

  bool get _isCheckedIn => _ts('checkIn') != null;
  bool get _isCheckedOut => _ts('checkOut') != null;
  bool get _isOnBreak {
    final bi = _ts('breakIn');
    final bo = _ts('breakOut');
    return bi != null && bo == null;
  }

  int get _breakMinutes {
    final v = _todayRow?['breakMinutes'];
    return (v is num) ? v.toInt() : int.tryParse('${v ?? ''}') ?? 0;
  }

  /// Live worked time: now − check-in − accumulated break, or the frozen
  /// span when already checked out.
  String get _workedTime {
    final cin = _ts('checkIn');
    if (cin == null) return '0h 0m 0s';
    final end = _ts('checkOut') ?? DateTime.now();
    var span = end.difference(cin);
    if (span.isNegative) span = Duration.zero;
    span -= Duration(minutes: _breakMinutes);
    if (span.isNegative) span = Duration.zero;
    final h = span.inHours;
    final m = span.inMinutes.remainder(60);
    final s = span.inSeconds.remainder(60);
    return '${h}h ${m}m ${s}s';
  }

  String _breakTimeText() {
    final bi = _ts('breakIn');
    final bo = _ts('breakOut');
    if (bi == null) return '${_breakMinutes}m';
    if (bo != null) {
      final d = bo.difference(bi);
      return '${d.inHours}h ${d.inMinutes.remainder(60)}m';
    }
    final d = DateTime.now().difference(bi);
    return '${d.inHours}h ${d.inMinutes.remainder(60)}m ${d.inSeconds.remainder(60)}s';
  }

  String get _lateInTime {
    // Late-in is only meaningful when the server marked the day 'late';
    // measured against the standard 09:30 shift start.
    final status = '${_todayRow?['status'] ?? ''}';
    final cin = _ts('checkIn');
    if (status != 'late' || cin == null) return '0h 0m';
    final shiftStart = DateTime(cin.year, cin.month, cin.day, 9, 30);
    final d = cin.difference(shiftStart);
    if (d.isNegative) return '0h 0m';
    return '${d.inHours}h ${d.inMinutes.remainder(60)}m';
  }

  String get _earlyOutTime {
    // Early-out mirrors late-in against the standard 18:30 shift end.
    final cout = _ts('checkOut');
    if (cout == null) return '0h 0m';
    final shiftEnd = DateTime(cout.year, cout.month, cout.day, 18, 30);
    final d = shiftEnd.difference(cout);
    if (d.isNegative) return '0h 0m';
    return '${d.inHours}h ${d.inMinutes.remainder(60)}m';
  }

  String get _overTime {
    final v = _todayRow?['overtime'];
    final hrs = (v is num) ? v.toDouble() : double.tryParse('${v ?? ''}') ?? 0;
    if (hrs <= 0) return '0h 0m';
    return '${hrs.floor()}h ${((hrs - hrs.floor()) * 60).round()}m';
  }

  // ── Punch flow — shared PunchFlow (Task 113): GPS capture + mock-location
  // detection (design #12_Fake_GPS dialog) + WFH/holiday guidance dialogs.
  // The Home Check/Break tabs punch in Office mode by default; the Attendance
  // module offers the Office / Out Side selector.
  Future<void> _punch(String action, String label) async {
    if (_busy) return;
    if (_employeeId == null || _employeeId!.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('No employee profile is linked to this account — punching is available for employee accounts.'),
          backgroundColor: Colors.orange));
      return;
    }
    setState(() => _busy = true);
    await PunchFlow.executePunch(
      context,
      employeeId: _employeeId!,
      action: action,
      label: label,
      onSuccess: (_) async => _load(),
    );
    if (mounted) setState(() => _busy = false);
  }

  String get _greeting {
    final h = DateTime.now().hour;
    if (h < 12) return 'Good Morning';
    if (h < 17) return 'Good Noon';
    return 'Good Evening';
  }

  @override
  Widget build(BuildContext context) {
    final name = _me?.displayName ?? 'there';
    final dateText = DateFormat('EEEE, dd MMMM yyyy').format(DateTime.now());
    return MainTabScaffold(
      currentIndex: 0,
      drawer: const AppDrawer(),
      body: RefreshIndicator(
        color: MaanColors.primary,
        onRefresh: _load,
        child: ListView(
          padding: EdgeInsets.zero,
          children: [
            // ── Header: date + greeting + avatar + bell ──
            Container(
              color: MaanColors.primary,
              padding: EdgeInsets.only(top: MediaQuery.of(context).padding.top + 12, bottom: 20, left: 18, right: 14),
              child: Row(
                children: [
                  Builder(
                    builder: (ctx) => InkWell(
                      onTap: () => Scaffold.of(ctx).openDrawer(),
                      child: Container(width: 42, height: 42, decoration: BoxDecoration(color: Colors.white.withOpacity(.18), borderRadius: BorderRadius.circular(11)), child: const Icon(Icons.menu, color: Colors.white, size: 22)),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(dateText, style: const TextStyle(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.w500)),
                      const SizedBox(height: 2),
                      Row(children: [
                        Flexible(child: Text('$_greeting 👋', style: const TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.w800), overflow: TextOverflow.ellipsis)),
                      ]),
                    ]),
                  ),
                  Stack(
                    children: [
                      Container(
                        width: 42, height: 42,
                        decoration: BoxDecoration(color: Colors.white.withOpacity(.18), borderRadius: BorderRadius.circular(11)),
                        child: const Icon(Icons.notifications_none_rounded, color: Colors.white, size: 22),
                      ),
                      if (_unread > 0)
                        Positioned(
                          right: 4, top: 4,
                          child: Container(
                            padding: const EdgeInsets.all(3),
                            decoration: const BoxDecoration(color: Color(0xFFFF5A5A), shape: BoxShape.circle),
                            constraints: const BoxConstraints(minWidth: 16, minHeight: 16),
                            child: Text('$_unread', textAlign: TextAlign.center, style: const TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.w800)),
                          ),
                        ),
                    ],
                  ),
                  InkWell(onTap: () => Navigator.pushNamed(context, '/profile'), child: Padding(padding: const EdgeInsets.only(left: 10), child: MaanAvatar(avatar: _me?.avatar, name: name, radius: 20, bgColor: Colors.white, textColor: MaanColors.primary))),
                ],
              ),
            ),
            Transform.translate(
              offset: const Offset(0, -16),
              child: Column(
                children: [
                  // ── Tabs: Check | Break Time | Leave ──
                  Container(
                    margin: const EdgeInsets.symmetric(horizontal: 16),
                    padding: const EdgeInsets.all(5),
                    decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), boxShadow: [BoxShadow(color: Colors.black.withOpacity(.06), blurRadius: 16, offset: const Offset(0, 5))]),
                    child: TabBar(
                      controller: _tabs,
                      indicatorSize: TabBarIndicatorSize.tab,
                      indicator: BoxDecoration(color: MaanColors.primary, borderRadius: BorderRadius.circular(12)),
                      labelColor: Colors.white,
                      unselectedLabelColor: MaanColors.navy,
                      labelStyle: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700),
                      dividerColor: Colors.transparent,
                      tabs: const [Tab(text: 'Check'), Tab(text: 'Break Time'), Tab(text: 'Leave')],
                    ),
                  ),
                  SizedBox(
                    height: 235,
                    child: TabBarView(
                      controller: _tabs,
                      children: [
                        _checkTab(),
                        _breakTab(),
                        _leaveTab(),
                      ],
                    ),
                  ),
                  // ── Today Time Log ──
                  _timeLogCard(),
                  // ── This Month ──
                  _monthCard(),
                  // ── WFH pre-approval banner (Task 108) ──
                  if (_mobileCheckInAllowed == false) _wfhBanner(),
                  // ── Modules ──
                  _modulesGrid(),
                  const SizedBox(height: 20),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _checkTab() {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 14, 16, 0),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(18), border: Border.all(color: MaanColors.line)),
      child: _loading
          ? const Center(child: CircularProgressIndicator(color: MaanColors.primary, strokeWidth: 2.4))
          : Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(child: _kv('Check In Time', _isCheckedIn ? DateFormat('hh:mm a').format(_ts('checkIn')!) : '--:--')),
                    const SizedBox(width: 18),
                    Expanded(child: _kv('Working Time', _isCheckedIn ? _workedTime : '0h 0m 0s')),
                  ],
                ),
                const Spacer(),
                Center(
                  child: _busy
                      ? const Padding(padding: EdgeInsets.all(14), child: SizedBox(width: 34, height: 34, child: CircularProgressIndicator(color: MaanColors.primary, strokeWidth: 2.6)))
                      : _FingerprintButton(
                          color: _isCheckedIn && !_isCheckedOut ? const Color(0xFFEF6C6C) : MaanColors.primary,
                          label: _isCheckedIn && !_isCheckedOut ? 'Check Out' : 'Check In',
                          onTap: () => _punch(_isCheckedIn && !_isCheckedOut ? 'checkout' : 'checkin', _isCheckedIn && !_isCheckedOut ? 'Check-out' : 'Check-in'),
                        ),
                ),
                const SizedBox(height: 4),
              ],
            ),
    );
  }

  Widget _breakTab() {
    final canBreak = _isCheckedIn && !_isCheckedOut;
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 14, 16, 0),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(18), border: Border.all(color: MaanColors.line)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: _kv('Break Started', _isOnBreak ? DateFormat('hh:mm a').format(_ts('breakIn')!) : '--:--')),
              const SizedBox(width: 18),
              Expanded(child: _kv('Break Time', _ts('breakIn') != null ? _breakTimeText() : '0h 0m')),
            ],
          ),
          const Spacer(),
          Center(
            child: _busy
                ? const Padding(padding: EdgeInsets.all(14), child: SizedBox(width: 34, height: 34, child: CircularProgressIndicator(color: MaanColors.primary, strokeWidth: 2.6)))
                : _FingerprintButton(
                    color: _isOnBreak ? const Color(0xFFEF6C6C) : MaanColors.primary,
                    label: _isOnBreak ? 'End Break' : 'Start Break',
                    enabled: canBreak,
                    hint: canBreak ? null : _isCheckedOut ? 'Already checked out' : 'Check in first',
                    onTap: () => _punch(_isOnBreak ? 'breakout' : 'breakin', _isOnBreak ? 'Break-out' : 'Break-in'),
                  ),
          ),
          const SizedBox(height: 4),
        ],
      ),
    );
  }

  Widget _leaveTab() {
    final bal = _leaveBalance;
    final total = ((bal?['total'] ?? 0) as num).toInt();
    final used = ((bal?['used'] ?? 0) as num).toInt();
    final pending = ((bal?['pending'] ?? 0) as num).toInt();
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 14, 16, 0),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(18), border: Border.all(color: MaanColors.line)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: _kv('Total Leaves', '$total')),
              const SizedBox(width: 18),
              Expanded(child: _kv('Leaves Used', '$used')),
            ],
          ),
          if (pending > 0)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(color: MaanColors.accentOrange.withOpacity(.12), borderRadius: BorderRadius.circular(9)),
                child: Text('$pending day(s) pending approval', style: const TextStyle(color: Color(0xFFB26A00), fontSize: 11.5, fontWeight: FontWeight.w600)),
              ),
            ),
          const Spacer(),
          Center(
            child: SizedBox(
              width: 210,
              height: 46,
              child: FilledButton.icon(
                style: FilledButton.styleFrom(backgroundColor: MaanColors.primary, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(23))),
                onPressed: () => Navigator.pushNamed(context, '/leaves/request'),
                icon: const Icon(Icons.edit_calendar_rounded, size: 19, color: Colors.white),
                label: const Text('Request Leave', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 14)),
              ),
            ),
          ),
          const SizedBox(height: 4),
        ],
      ),
    );
  }

  Widget _kv(String label, String value) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(label, style: MaanText.caption.copyWith(fontSize: 11.5)),
      const SizedBox(height: 3),
      Text(value, style: MaanText.h2.copyWith(fontSize: 16.5)),
    ]);
  }

  Widget _timeLogCard() {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 14, 16, 0),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(18), border: Border.all(color: MaanColors.line)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Today Time Log', style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w800, color: MaanColors.navy)),
          Text('An overview of your progress', style: MaanText.caption.copyWith(fontSize: 11)),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(child: _logTile('Late In Time', _lateInTime, Icons.schedule_rounded, MaanColors.accentOrange)),
              Expanded(child: _logTile('Early Check Out', _earlyOutTime, Icons.logout_rounded, MaanColors.accentRed)),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(child: _logTile('Break Time', _ts('breakIn') != null ? _breakTimeText() : '0h 0m', Icons.free_breakfast_rounded, MaanColors.accentCyan)),
              Expanded(child: _logTile('Worked Time', _isCheckedIn ? _workedTime : '0h 0m', Icons.timer_outlined, MaanColors.accentGreen)),
            ],
          ),
          const SizedBox(height: 10),
          _logTile('Over Time', _overTime, Icons.trending_up_rounded, MaanColors.accentPurple),
        ],
      ),
    );
  }

  Widget _logTile(String label, String value, IconData icon, Color color) {
    return Row(children: [
      Container(width: 34, height: 34, decoration: BoxDecoration(color: color.withOpacity(.13), borderRadius: BorderRadius.circular(9)), child: Icon(icon, color: color, size: 17)),
      const SizedBox(width: 9),
      Expanded(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label, style: MaanText.caption.copyWith(fontSize: 10.5), overflow: TextOverflow.ellipsis),
          Text(value, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: MaanColors.navy)),
        ]),
      ),
    ]);
  }

  Widget _monthCard() {
    final s = _summary;
    final workingDays = ((s?['workingDays'] ?? 0) as num).toInt();
    final attended = ((s?['attendedDays'] ?? 0) as num).toDouble();
    final rate = s?['attendanceRate'];
    final attendedText = attended == attended.roundToDouble() ? '${attended.toInt()}' : attended.toStringAsFixed(1);
    return GestureDetector(
      onTap: () => Navigator.pushNamed(context, '/attendance-report'),
      child: Container(
        margin: const EdgeInsets.fromLTRB(16, 14, 16, 0),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(18), border: Border.all(color: MaanColors.line)),
        child: Row(
          children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('This Month', style: MaanText.caption.copyWith(fontSize: 11.5)),
                const SizedBox(height: 3),
                Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
                  Text('$attendedText', style: MaanText.h1.copyWith(fontSize: 26)),
                  Padding(padding: const EdgeInsets.only(left: 5, bottom: 4), child: Text('of $workingDays days attended', style: MaanText.caption.copyWith(fontSize: 10.5))),
                ]),
                if (rate is num)
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: SizedBox(
                      width: 150,
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(5),
                        child: LinearProgressIndicator(value: rate.toDouble().clamp(0, 100) / 100, minHeight: 5, backgroundColor: MaanColors.line, color: MaanColors.accentGreen),
                      ),
                    ),
                  ),
              ]),
            ),
            Column(children: [
              _monthChip('${((s?['present'] ?? 0) as num).toInt()}', 'Presents', MaanColors.accentGreen),
              const SizedBox(height: 6),
              _monthChip('${((s?['late'] ?? 0) as num).toInt()}', 'Late', MaanColors.accentOrange),
              const SizedBox(height: 6),
              _monthChip('${((s?['absent'] ?? 0) as num).toInt()}', 'Absent', MaanColors.accentRed),
            ]),
          ],
        ),
      ),
    );
  }

  Widget _monthChip(String value, String label, Color color) {
    return Container(
      width: 86,
      padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 8),
      decoration: BoxDecoration(color: color.withOpacity(.1), borderRadius: BorderRadius.circular(9)),
      child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
        Text(value, style: TextStyle(color: color, fontSize: 12.5, fontWeight: FontWeight.w800)),
        const SizedBox(width: 4),
        Text(label, style: TextStyle(color: color, fontSize: 10.5, fontWeight: FontWeight.w600)),
      ]),
    );
  }

  Widget _wfhBanner() {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      padding: const EdgeInsets.all(13),
      decoration: BoxDecoration(color: const Color(0xFFFFF6E5), borderRadius: BorderRadius.circular(14), border: Border.all(color: const Color(0xFFF3D9A4))),
      child: Row(children: [
        const Icon(Icons.wifi_off_rounded, color: Color(0xFFB26A00), size: 20),
        const SizedBox(width: 10),
        Expanded(child: Text('Mobile check-in needs WFH pre-approval from your admin. Use the office biometric device, or request remote access in Attendance Settings.', style: MaanText.body.copyWith(fontSize: 12))),
      ]),
    );
  }

  Widget _modulesGrid() {
    final isSuper = context.watch<AuthProvider>().isSuperAdminSession;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(padding: EdgeInsets.fromLTRB(16, 18, 16, 8), child: Text('Modules', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: MaanColors.navy))),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 10,
            crossAxisSpacing: 10,
            childAspectRatio: 1.5,
            children: [
              _tile('Employee\nManagement', Icons.people_alt_rounded, MaanColors.accentIndigo, const Color(0xFFE9E6FD), () => Navigator.pushNamed(context, '/employees-new')),
              _tile('Leave\nManagement', Icons.event_busy_rounded, MaanColors.accentOrange, const Color(0xFFFEF3E2), () => Navigator.pushNamed(context, '/leaves-new')),
              _tile('Attendance', Icons.fact_check_rounded, MaanColors.accentGreen, const Color(0xFFE6F9F2), () => Navigator.pushNamed(context, '/attendance-new')),
              _tile('Payroll', Icons.request_quote_rounded, MaanColors.accentCyan, const Color(0xFFE8F4FD), () => Navigator.pushNamed(context, '/payroll-new')),
              // Task 114 — Project Management (live web /api/projects parity)
              _tile('Projects', Icons.folder_special_rounded, MaanColors.accentPurple, const Color(0xFFF1EDFD), () => Navigator.pushNamed(context, '/projects-new')),
              _tile('Notifications', Icons.notifications_rounded, MaanColors.accentPink, const Color(0xFFFDE7EF), () => Navigator.pushNamed(context, '/notifications')),
              _tile('My Profile', Icons.person_rounded, MaanColors.accentPurple, const Color(0xFFEFEAFD), () => Navigator.pushNamed(context, '/profile')),
              if (isSuper)
                _tile('Switch\nWorkspace', Icons.swap_horiz_rounded, MaanColors.navy, const Color(0xFFEEF2F7), () async {
                  context.read<AuthProvider>().beginTenantPick();
                  await Navigator.pushNamed(context, '/tenant-picker');
                  if (mounted) _load();
                }),
            ],
          ),
        ),
      ],
    );
  }

  Widget _tile(String label, IconData icon, Color accent, Color bg, VoidCallback onTap) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(13),
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(16), border: Border.all(color: MaanColors.line)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(width: 40, height: 40, decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(11)), child: Icon(icon, color: accent, size: 21)),
            const Spacer(),
            Text(label, style: MaanText.title.copyWith(fontSize: 13.5, height: 1.25)),
          ]),
        ),
      ),
    );
  }
}

/// Fingerprint-style circular punch button (designs #03/#04) — concentric
/// rings around an icon, label underneath.
class _FingerprintButton extends StatelessWidget {
  final Color color;
  final String label;
  final VoidCallback onTap;
  final bool enabled;
  final String? hint;

  const _FingerprintButton({required this.color, required this.label, required this.onTap, this.enabled = true, this.hint});

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        InkWell(
          borderRadius: BorderRadius.circular(44),
          onTap: enabled ? onTap : null,
          child: Container(
            width: 84, height: 84,
            decoration: BoxDecoration(shape: BoxShape.circle, color: color.withOpacity(.1)),
            padding: const EdgeInsets.all(9),
            child: Container(
              decoration: BoxDecoration(shape: BoxShape.circle, color: color.withOpacity(.18)),
              padding: const EdgeInsets.all(9),
              child: Container(
                decoration: BoxDecoration(shape: BoxShape.circle, color: color),
                child: Icon(Icons.fingerprint_rounded, color: Colors.white, size: 38),
              ),
            ),
          ),
        ),
        const SizedBox(height: 7),
        Text(enabled ? label : (hint ?? label), style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: enabled ? color : MaanColors.faint)),
      ],
    );
  }
}
