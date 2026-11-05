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
import '../reports/reports_screen.dart';

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
  // Task 136 — birthdays (original birthday celebrations + Send Wishes)
  List<Map<String, dynamic>> _birthdaysToday = [];
  // Task 139 — tenant-wide org stats (same for every login, like admin)
  int _orgTotal = 0, _orgActive = 0, _orgOnLeave = 0, _orgExits = 0;
  List<Map<String, dynamic>> _birthdaysUpcoming = [];
  Set<String> _wishedByMe = {};
  // Task 141 — announcements banner + banner ticker
  List<Map<String, dynamic>> _announcements = [];
  int _bannerIndex = 0;
  // Task 142 — the last-week chart moved OUT of the compact home (it lived in
  // the Attendance module's report screens); no more weekPayload fetch.

  @override
  void initState() {
    super.initState();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() {});
      // Task 141 — advance the announcements banner every 5 seconds.
      if (_announcements.length > 1) {
        final tick = DateTime.now().second ~/ 5;
        if (tick != _bannerIndex && tick < _announcements.length) _bannerIndex = tick;
      }
    });
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
      _safe(() => ApiService.getBirthdays()), // Task 136 — birthdays card
      _safe(() => ApiService.getOrgStats()), // Task 139 — org stats for EVERY login
      _safe(() => ApiService.getSocialFeed(limit: 10)), // Task 141 — announcements banner
    ]);
    if (!mounted) return;
    final id = results[0] as String?;
    final summary = results[1] as Map<String, dynamic>?;
    final balance = results[2] as Map<String, dynamic>?;
    Map<String, dynamic>? unreadPayload = results[3] as Map<String, dynamic>?;
    Map<String, dynamic>? todayPayload = results[4] as Map<String, dynamic>?;
    Map<String, dynamic>? birthdayPayload = results.length > 5 ? results[5] as Map<String, dynamic>? : null;
    // Task 139 — tenant-wide org stats (same numbers as the admin dashboard)
    Map<String, dynamic>? orgPayload = results.length > 6 ? results[6] as Map<String, dynamic>? : null;
    // Task 141 — announcements + last-week attendance
    Map<String, dynamic>? feedPayload = results.length > 7 ? results[7] as Map<String, dynamic>? : null;

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
    // Task 136 — parse the birthdays payload (best-effort; card hides on error)
    final bToday = <Map<String, dynamic>>[];
    final bUpcoming = <Map<String, dynamic>>[];
    final bWished = <String>{};
    int orgTotal = 0, orgActive = 0, orgOnLeave = 0, orgExits = 0;
    if (orgPayload != null) {
      num n(Map<String, dynamic> m, String k) => (m[k] is num) ? m[k] as num : num.tryParse('${m[k] ?? ''}') ?? 0;
      orgTotal = n(orgPayload, 'total').toInt();
      orgActive = n(orgPayload, 'active').toInt();
      orgOnLeave = n(orgPayload, 'onLeave').toInt();
      orgExits = n(orgPayload, 'exitsThisMonth').toInt();
    }
    if (birthdayPayload != null) {
      for (final e in jsonList(birthdayPayload['today'])) {
        if (e is Map) bToday.add(Map<String, dynamic>.from(e));
      }
      for (final e in jsonList(birthdayPayload['upcoming'])) {
        if (e is Map) bUpcoming.add(Map<String, dynamic>.from(e));
      }
      for (final e in bToday) {
        if (e['wishedByMe'] == true && e['employeeId'] != null) bWished.add(e['employeeId'].toString());
      }
    }

    // Task 141 — parse the announcements banner source: pinned + announcement
    // posts first; if none, the latest post as a "Company update".
    final announcements = <Map<String, dynamic>>[];
    if (feedPayload != null) {
      final posts = jsonList(feedPayload['posts']).whereType<Map>().map((p) => Map<String, dynamic>.from(p)).toList();
      final important = posts.where((p) => p['isPinned'] == true || '${p['postType'] ?? ''}' == 'announcement').toList();
      announcements.addAll(important.take(4));
      if (announcements.isEmpty && posts.isNotEmpty) announcements.add(posts.first);
    }

    setState(() {
      _employeeId = id;
      _summary = summary;
      _leaveBalance = balance;
      _todayRow = row;
      _orgTotal = orgTotal;
      _orgActive = orgActive;
      _orgOnLeave = orgOnLeave;
      _orgExits = orgExits;
      _unread = unread;
      if (perms is Map) _mobileCheckInAllowed = perms['mobileCheckInEnabled'] == true;
      _birthdaysToday = bToday;
      _birthdaysUpcoming = bUpcoming;
      _wishedByMe = bWished;
      _announcements.clear();
      _announcements.addAll(announcements);
      if (_bannerIndex >= _announcements.length) _bannerIndex = 0;
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

  /// Task 141 — ISO date N days ago (for the last-week attendance chart).
  static String _daysAgo(int days) {
    final n = DateTime.now().subtract(Duration(days: days));
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
      // Task 141 — dashboard chat icon: one tap into project & team chats.
      fab: FloatingActionButton(
        onPressed: () => Navigator.pushNamed(context, '/chat'),
        backgroundColor: MaanColors.primary,
        foregroundColor: Colors.white,
        tooltip: 'Chat — projects & team',
        child: const Icon(Icons.chat_bubble_rounded),
      ),
      body: RefreshIndicator(
        color: MaanColors.primary,
        onRefresh: _load,
        child: ListView(
          padding: EdgeInsets.zero,
          children: [
            // ── Header: date + greeting + avatar + bell ──
            Container(
              color: MaanColors.primary,
              padding: EdgeInsets.only(top: MediaQuery.of(context).padding.top + 12, bottom: 14, left: 18, right: 14),
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
                  // Task 128 — the bell is now DYNAMIC: tapping it opens the
                  // notifications center (list + mark-read), matching the
                  // unread badge shown here.
                  InkWell(
                    borderRadius: BorderRadius.circular(11),
                    onTap: () => Navigator.pushNamed(context, '/notifications'),
                    child: Stack(
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
                  ),
                  InkWell(onTap: () => Navigator.pushNamed(context, '/profile'), child: Padding(padding: const EdgeInsets.only(left: 10), child: MaanAvatar(avatar: _me?.avatar, name: name, radius: 20, bgColor: Colors.white, textColor: MaanColors.primary))),
                ],
              ),
            ),
            Transform.translate(
              offset: const Offset(0, -12),
              child: Column(
                children: [
                  // ── Task 141 — Announcements banner (feeds from HR/Admin) ──
                  _announcementsBanner(),
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
                  // Task 142 — compact: 186px (was 235) so the whole dashboard
                  // fits on one screen without vertical scrolling.
                  SizedBox(
                    height: 186,
                    child: TabBarView(
                      controller: _tabs,
                      children: [
                        _checkTab(),
                        _breakTab(),
                        _leaveTab(),
                      ],
                    ),
                  ),
                  // ── Task 142 — ONE compact stats strip (worked today ·
                  // this month · team) replaces the old Time Log + This
                  // Month + Organization cards (~350px saved).
                  _statsStrip(),
                  // ── Task 142 — 4-column Quick Access grid replaces the
                  // separate Quick Links rail + Modules grid.
                  _quickAccessGrid(),
                  // ── Task 136 — Birthdays (slim: today only + one count line) ──
                  _birthdaysCard(),
                  // ── WFH pre-approval banner (Task 108) ──
                  if (_mobileCheckInAllowed == false) _wfhBanner(),
                  const SizedBox(height: 16),
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

  /// Task 142 — compact KPI strip: worked-today (live ticker), this-month
  /// attendance, and team snapshot in ONE card. Tapping each column
  /// opens the matching screen. Replaces the old Today Time Log / This
  /// Month / Organization cards (~340px of vertical space saved).
  Widget _statsStrip() {
    final worked = _isCheckedIn ? _workedTime : '0h 0m';
    final s = _summary;
    final workingDays = ((s?['workingDays'] ?? 0) as num).toInt();
    final attended = ((s?['attendedDays'] ?? 0) as num).toDouble();
    final attendedText = attended == attended.roundToDouble() ? '${attended.toInt()}' : attended.toStringAsFixed(1);
    final rate = (s?['attendanceRate'] is num) ? (s?['attendanceRate'] as num).toInt() : 0;
    final teamTotal = _orgTotal > 0 ? _orgTotal : _orgActive;
    final hasOrg = teamTotal > 0;

    Widget col({
      required IconData icon,
      required Color color,
      required String value,
      required String label,
      required String sub,
      required VoidCallback onTap,
    }) {
      return Expanded(
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Column(children: [
              Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                Icon(icon, size: 13, color: color),
                const SizedBox(width: 4),
                Flexible(child: Text(value, maxLines: 1, overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w900, color: color))),
              ]),
              const SizedBox(height: 2),
              Text(label, style: MaanText.caption.copyWith(fontSize: 10.5, fontWeight: FontWeight.w700, color: MaanColors.navy)),
              const SizedBox(height: 1),
              Text(sub, style: MaanText.caption.copyWith(fontSize: 9), overflow: TextOverflow.ellipsis),
            ]),
          ),
        ),
      );
    }

    Widget divider() => Container(width: 1, height: 40, color: MaanColors.line);

    return Container(
      margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), border: Border.all(color: MaanColors.line)),
      child: Row(children: [
        col(
          icon: Icons.timer_rounded,
          color: MaanColors.accentGreen,
          value: worked,
          label: 'Worked Today',
          sub: _ts('checkIn') != null ? 'in ${DateFormat('hh:mm a').format(_ts('checkIn')!)}' : 'not checked in',
          onTap: () => Navigator.pushNamed(context, '/attendance-new'),
        ),
        divider(),
        col(
          icon: Icons.event_available_rounded,
          color: MaanColors.accentIndigo,
          value: '$attendedText/$workingDays',
          label: 'This Month',
          sub: rate > 0 ? '$rate% attendance' : 'attendance',
          onTap: () => Navigator.pushNamed(context, '/attendance-report'),
        ),
        if (hasOrg) ...[
          divider(),
          col(
            icon: Icons.groups_rounded,
            color: MaanColors.accentOrange,
            value: '$_orgOnLeave',
            label: 'On Leave',
            sub: 'of $teamTotal team',
            onTap: () => Navigator.pushNamed(context, '/directory'),
          ),
        ],
      ]),
    );
  }

  // ══════════════ Task 141 — Announcements banner ══════════════

  /// Feed/announcement banner from the social feed (pinned + announcement
  /// posts first, latest post as fallback). Auto-rotates via the 1s ticker;
  /// taps open the full Announcements list.
  Widget _announcementsBanner() {
    if (_announcements.isEmpty) return const SizedBox.shrink();
    final safeIndex = _bannerIndex.clamp(0, _announcements.length - 1);
    final post = _announcements[safeIndex];
    final author = post['author'] is Map ? post['author'] as Map : const {};
    final authorName = '${author['firstName'] ?? ''} ${author['lastName'] ?? ''}'.trim();
    final pinned = post['isPinned'] == true;
    final content = '${post['content'] ?? ''}';
    return GestureDetector(
      onTap: () => Navigator.pushNamed(context, '/announcements'),
      child: Container(
        margin: const EdgeInsets.fromLTRB(16, 2, 16, 0),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          gradient: const LinearGradient(colors: [Color(0xFF5B7FE8), Color(0xFF7C6FF0)]),
          borderRadius: BorderRadius.circular(16),
          boxShadow: [BoxShadow(color: const Color(0xFF5B7FE8).withOpacity(.28), blurRadius: 18, offset: const Offset(0, 6))],
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 34, height: 34,
              decoration: BoxDecoration(color: Colors.white.withOpacity(.18), borderRadius: BorderRadius.circular(10)),
              child: Icon(pinned ? Icons.push_pin_rounded : Icons.campaign_rounded, color: Colors.white, size: 18),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: AnimatedSwitcher(
                duration: const Duration(milliseconds: 350),
                child: Column(
                  key: ValueKey('banner-$safeIndex-${post['id'] ?? ''}'),
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Row(children: [
                      Text(
                        pinned ? 'PINNED ANNOUNCEMENT' : 'ANNOUNCEMENT',
                        style: const TextStyle(color: Colors.white70, fontSize: 9.5, fontWeight: FontWeight.w900, letterSpacing: .8),
                      ),
                      if (_announcements.length > 1) ...[
                        const SizedBox(width: 6),
                        for (var i = 0; i < _announcements.length; i++)
                          Container(
                            width: i == safeIndex ? 12 : 4,
                            height: 4,
                            margin: const EdgeInsets.only(right: 3),
                            decoration: BoxDecoration(
                              color: i == safeIndex ? Colors.white : Colors.white.withOpacity(.4),
                              borderRadius: BorderRadius.circular(2),
                            ),
                          ),
                      ],
                    ]),
                    const SizedBox(height: 3),
                    Text(
                      content,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(color: Colors.white, fontSize: 12.5, fontWeight: FontWeight.w700, height: 1.35),
                    ),
                    if (authorName.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Text('by $authorName · tap to view all feeds', style: const TextStyle(color: Colors.white70, fontSize: 9.5)),
                      ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ══════════════ Task 141 — Last Week Attendance chart ══════════════

  /// "Last week Attendance" bar chart (home design image #3): worked hours
  /// per day for the trailing 7 days, absent days highlighted in red.
  /// Task 142 — ONE 4-column Quick Access grid. Merges the old Quick Links
  /// rail (Requests/Directory/Payslips/...) with the 2-column Modules grid —
  /// every tile is one tap; the full menu still lives in the drawer.
  Widget _quickAccessGrid() {
    final role = context.watch<AuthProvider>().user?.role;
    final isSuper = context.watch<AuthProvider>().isSuperAdminSession;
    final canSeeReports = ReportsScreen.canSee(role);
    final tiles = <_QATile>[
      _QATile('Attendance', Icons.fact_check_rounded, MaanColors.accentGreen, '/attendance-new'),
      _QATile('Leaves', Icons.event_busy_rounded, MaanColors.accentOrange, '/leaves-new'),
      _QATile('Payroll', Icons.request_quote_rounded, MaanColors.accentCyan, '/payroll-new'),
      _QATile('Employees', Icons.people_alt_rounded, MaanColors.accentIndigo, '/employees-new'),
      _QATile('Projects', Icons.folder_special_rounded, MaanColors.accentPurple, '/projects-new'),
      _QATile('Payslips', Icons.receipt_long_rounded, MaanColors.accentGreen, '/payroll-new'),
      _QATile('Requests', Icons.edit_calendar_rounded, MaanColors.accentGold, '/leaves/request'),
      _QATile('Directory', Icons.contact_page_rounded, MaanColors.accentIndigo, '/directory'),
      _QATile('Help Desk', Icons.headset_mic_rounded, MaanColors.accentCyan, '/helpdesk'),
      _QATile('Feeds', Icons.campaign_rounded, MaanColors.accentPink, '/announcements'),
      if (canSeeReports) _QATile('Reports', Icons.bar_chart_rounded, MaanColors.accentRed, '/reports'),
      if (canSeeReports) _QATile('Team Att.', Icons.groups_rounded, MaanColors.accentGreen, '/team-attendance'),
    ];
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
        child: Row(children: [
          const Expanded(child: Text('Quick Access', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: MaanColors.navy))),
          Text('All modules in the menu', style: MaanText.caption.copyWith(fontSize: 10)),
        ]),
      ),
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: GridView.count(
          crossAxisCount: 4,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 8,
          crossAxisSpacing: 8,
          childAspectRatio: 0.92,
          children: [
            for (final t in tiles)
              Material(
                color: Colors.white,
                borderRadius: BorderRadius.circular(14),
                child: InkWell(
                  borderRadius: BorderRadius.circular(14),
                  onTap: () => Navigator.pushNamed(context, t.route),
                  child: Container(
                    decoration: BoxDecoration(borderRadius: BorderRadius.circular(14), border: Border.all(color: MaanColors.line)),
                    padding: const EdgeInsets.all(8),
                    child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                      Container(
                        width: 36, height: 36,
                        decoration: BoxDecoration(color: t.accent.withOpacity(.13), borderRadius: BorderRadius.circular(10)),
                        child: Icon(t.icon, color: t.accent, size: 19),
                      ),
                      const SizedBox(height: 6),
                      Text(t.label, maxLines: 1, overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: MaanColors.navy)),
                    ]),
                  ),
                ),
              ),
          ],
        ),
      ),
      if (isSuper)
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
          child: SizedBox(
            width: double.infinity,
            height: 40,
            child: OutlinedButton.icon(
              onPressed: () async {
                context.read<AuthProvider>().beginTenantPick();
                await Navigator.pushNamed(context, '/tenant-picker');
                if (mounted) _load();
              },
              style: OutlinedButton.styleFrom(
                side: const BorderSide(color: MaanColors.primary),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              icon: const Icon(Icons.swap_horiz_rounded, size: 17, color: MaanColors.primary),
              label: const Text('Switch Workspace', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: MaanColors.primary)),
            ),
          ),
        ),
    ]);
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

  /// Task 136 — Send wishes (small greetings card: bell + festive email).
  Future<void> _sendWish(Map<String, dynamic> person) async {
    final empId = '${person['employeeId'] ?? ''}';
    final name = '${person['name'] ?? 'colleague'}';
    if (empId.isEmpty) return;
    try {
      final res = await ApiService.sendBirthdayWish(empId);
      if (!mounted) return;
      final already = res['alreadyWished'] == true;
      setState(() => _wishedByMe = {..._wishedByMe, empId});
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(already ? 'You already sent $name your wishes this year' : '🎂 Wishes sent to $name — greeting card delivered'),
        backgroundColor: already ? const Color(0xFF0EA5A6) : Colors.green,
      ));
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(e.toString().replaceAll('Exception: ', '')),
          backgroundColor: Colors.red,
        ));
      }
    }
  }

  /// Task 136 + Task 142 — SLIM birthdays card: today's birthdays with Send
  /// Wishes plus ONE summary line for upcoming ones (the old card listed up
  /// to 6 date chips and grew tall). Hidden entirely when nothing is on.
  Widget _birthdaysCard() {
    if (_birthdaysToday.isEmpty && _birthdaysUpcoming.isEmpty) return const SizedBox.shrink();
    final upcoming = _birthdaysUpcoming.length;
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        gradient: const LinearGradient(colors: [Color(0xFFFDF2F8), Colors.white, Color(0xFFFFFBEB)]),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: MaanColors.line),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        for (final p in _birthdaysToday.take(2))
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Row(children: [
              CircleAvatar(
                radius: 15,
                backgroundColor: MaanColors.accentPink.withOpacity(.18),
                child: Text(
                  '${p['name'] ?? ''}'.trim().split(' ').where((w) => w.isNotEmpty).take(2).map((w) => w[0].toUpperCase()).join(),
                  style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: MaanColors.accentPink),
                ),
              ),
              const SizedBox(width: 9),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('Today — ${p['name'] ?? ''}', maxLines: 1, overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: MaanColors.navy)),
                  Text('${p['employeeCode'] ?? ''}${p['department'] != null ? ' · ${p['department']}' : ''}',
                      maxLines: 1, overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 10, color: MaanColors.faint)),
                ]),
              ),
              const SizedBox(width: 8),
              if (_wishedByMe.contains('${p['employeeId'] ?? ''}'))
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
                  decoration: BoxDecoration(color: MaanColors.accentGreen.withOpacity(.12), borderRadius: BorderRadius.circular(9)),
                  child: const Text('Wished \u2713', style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w800, color: MaanColors.accentGreen)),
                )
              else
                FilledButton.icon(
                  onPressed: () => _sendWish(p),
                  style: FilledButton.styleFrom(
                    backgroundColor: MaanColors.accentPink,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
                    minimumSize: const Size(0, 30),
                  ),
                  icon: const Icon(Icons.card_giftcard_rounded, size: 13),
                  label: const Text('Send Wishes', style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w800)),
                ),
            ]),
          ),
        if (upcoming > 0)
          Text(
            _birthdaysToday.isEmpty
                ? '\u{1F382} $upcoming birthday${upcoming == 1 ? '' : 's'} in the next 45 days'
                : '+ $upcoming more in the next 45 days',
            style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: MaanColors.body),
          ),
      ]),
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
            width: 76, height: 76,
            decoration: BoxDecoration(shape: BoxShape.circle, color: color.withOpacity(.1)),
            padding: const EdgeInsets.all(8),
            child: Container(
              decoration: BoxDecoration(shape: BoxShape.circle, color: color.withOpacity(.18)),
              padding: const EdgeInsets.all(8),
              child: Container(
                decoration: BoxDecoration(shape: BoxShape.circle, color: color),
                child: const Icon(Icons.fingerprint_rounded, color: Colors.white, size: 34),
              ),
            ),
          ),
        ),
        const SizedBox(height: 6),
        Text(enabled ? label : (hint ?? label), style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: enabled ? color : MaanColors.faint)),
      ],
    );
  }
}

/// Task 142 — a Quick Access grid tile (label + icon + destination route).
class _QATile {
  final String label;
  final IconData icon;
  final Color accent;
  final String route;
  const _QATile(this.label, this.icon, this.accent, this.route);
}
