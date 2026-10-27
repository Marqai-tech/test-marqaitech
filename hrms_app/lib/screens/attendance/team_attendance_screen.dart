import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../config/maan_theme.dart';
import '../../services/api_service.dart';
import '../../utils/json_safe.dart';

/// Task 135 — TEAM attendance for admins / CEO / HR (web parity with the
/// /attendance register and the /attendance/reports hub):
///  · **Daily Status** — every active employee's status for ONE date
///    (present · late · absent · on leave · half day · weekend · holiday ·
///    not marked) with check-in/out, production hours and late-by vs the
///    employee's own shift window (Task 133 shift awareness).
///    Data: GET /api/attendance?date=…&limit=500 + GET /api/employees +
///    GET /api/holidays. The server scopes rows by role (admins and the CEO
///    see the whole company, managers their team, employees only themselves).
///  · **Team Report** — the SAME engine the web Reports hub uses
///    (GET /api/reports?type=attendance_report&month&year): month tiles +
///    a per-employee P/L/A/HD/Hours table built from the records the API
///    already returns (the Task 129 Reports tab ignored them) + a by-day
///    breakdown.
class TeamAttendanceScreen extends StatefulWidget {
  const TeamAttendanceScreen({super.key});

  @override
  State<TeamAttendanceScreen> createState() => _TeamAttendanceScreenState();
}

class _TeamAttendanceScreenState extends State<TeamAttendanceScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs = TabController(length: 2, vsync: this);

  // ── Daily status state ──
  DateTime _day = DateTime.now();
  bool _loadingDay = true;
  String? _dayError;
  String _search = '';
  List<Map<String, dynamic>> _dayRows = []; // attendance rows for the date
  Map<String, dynamic> _shiftWindows = {};
  List<Map<String, dynamic>> _employees = [];
  Set<String> _holidayDates = {};

  // ── Team report state ──
  DateTime _month = DateTime.now();
  bool _loadingReport = true;
  String? _reportError;
  Map<String, dynamic> _report = {};

  static const _dayStatusOrder = [
    'present', 'late', 'half_day', 'on_leave', 'absent', 'holiday', 'weekend', 'not_marked',
  ];

  @override
  void initState() {
    super.initState();
    _loadDay();
    _loadReport();
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  String _fmt(DateTime d) =>
      '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  // ════════════════════════ Daily status ════════════════════════
  Future<void> _loadDay() async {
    setState(() { _loadingDay = true; _dayError = null; });
    try {
      final results = await Future.wait([
        ApiService.getTeamAttendanceForDate(_fmt(_day)),
        ApiService.getEmployees(limit: 500, excludeInactive: true),
        ApiService.getHolidays(_day.year).catchError((_) => <dynamic>[]),
      ]);
      final att = results[0] as Map<String, dynamic>;
      final emps = results[1] as Map<String, dynamic>;
      final hols = results[2] as List<dynamic>;
      _dayRows = jsonMapList(att['attendance'] is List ? att['attendance'] : att['data']);
      _shiftWindows = att['shiftWindows'] is Map ? Map<String, dynamic>.from(att['shiftWindows']) : {};
      _employees = jsonMapList(emps['employees'] is List ? emps['employees'] : emps['data']);
      _holidayDates = hols
          .map((h) => '${(h as Map)['date'] ?? ''}'.split('T').first)
          .where((s) => s.length >= 10)
          .map((s) => s.substring(0, 10))
          .toSet();
      if (!mounted) return;
      setState(() { _loadingDay = false; });
    } catch (e) {
      if (!mounted) return;
      setState(() { _loadingDay = false; _dayError = e.toString().replaceAll('Exception: ', ''); });
    }
  }

  /// Merge the roster with the attendance rows — an employee with no row for
  /// the date is still shown (weekend / holiday / absent / not marked),
  /// exactly like the web register does.
  List<Map<String, dynamic>> _buildDayBoard() {
    final byEmp = <String, Map<String, dynamic>>{};
    for (final r in _dayRows) {
      final id = '${r['employeeId'] ?? ''}';
      if (id.isEmpty) continue;
      // keep the row with a real check-in if duplicates ever appear
      final existing = byEmp[id];
      if (existing == null || (existing['checkIn'] == null && r['checkIn'] != null)) {
        byEmp[id] = r;
      }
    }
    final today = DateTime.now();
    final selected = DateTime(_day.year, _day.month, _day.day);
    final isPast = selected.isBefore(DateTime(today.year, today.month, today.day));
    final dow = _day.weekday; // 6 = Sat, 7 = Sun
    final board = <Map<String, dynamic>>[];
    final seen = <String>{};
    for (final e in _employees) {
      final id = '${e['id'] ?? ''}';
      if (id.isEmpty) continue;
      seen.add(id);
      final row = byEmp[id];
      String status;
      if (row != null) {
        status = '${row['status'] ?? 'not_marked'}';
      } else if (_holidayDates.contains(_fmt(_day))) {
        status = 'holiday';
      } else if (dow == DateTime.saturday || dow == DateTime.sunday) {
        status = 'weekend';
      } else if (isPast) {
        status = 'absent';
      } else {
        status = 'not_marked';
      }
      board.add({
        'id': id,
        'name': '${e['firstName'] ?? ''} ${e['lastName'] ?? ''}'.trim(),
        'code': '${e['employeeId'] ?? ''}',
        'department': e['department'] is Map ? e['department']['name'] : null,
        'row': row,
        'status': status,
      });
    }
    // attendance rows whose employee is NOT in the active roster (e.g. ex-EMP)
    for (final entry in byEmp.entries) {
      if (!seen.contains(entry.key)) {
        final r = entry.value;
        final emp = r['employee'] is Map ? r['employee'] as Map : const {};
        board.add({
          'id': entry.key,
          'name': '${emp['firstName'] ?? ''} ${emp['lastName'] ?? ''}'.trim(),
          'code': '${emp['employeeId'] ?? ''}',
          'department': null,
          'row': r,
          'status': '${r['status'] ?? 'not_marked'}',
        });
      }
    }
    board.sort((a, b) => ('${a['name']}').toLowerCase().compareTo(('${b['name']}').toLowerCase()));
    return board;
  }

  Map<String, int> _dayStats(List<Map<String, dynamic>> board) {
    final stats = <String, int>{for (final s in _dayStatusOrder) s: 0};
    for (final b in board) {
      final s = '${b['status']}';
      stats[s] = (stats[s] ?? 0) + 1;
    }
    return stats;
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
      case 'wfh':
        return ('WF', const Color(0xFF0EA5A6));
      case 'not_marked':
        return ('NM', MaanColors.faint);
      default:
        return (status.isNotEmpty ? status[0].toUpperCase() : '—', MaanColors.faint);
    }
  }

  String _hmOf(dynamic v) {
    if (v == null || '$v' == '' || '$v' == 'null') return '—';
    final dt = DateTime.tryParse('$v')?.toLocal();
    if (dt != null) return DateFormat('hh:mm a').format(dt);
    final s = '$v';
    return s.length >= 16 ? s.substring(11, 16) : s;
  }

  /// Late-by vs the employee's own shift start (Task 133 shiftWindows map).
  String? _lateBy(Map<String, dynamic>? row, String empId) {
    if (row == null) return null;
    final cin = DateTime.tryParse('${row['checkIn'] ?? ''}');
    if (cin == null) return null;
    final win = _shiftWindows[empId];
    final startStr = win is Map ? '${win['start'] ?? ''}' : '';
    final m = RegExp(r'^(\d{1,2}):(\d{2})$').firstMatch(startStr);
    if (m == null) return null;
    final shift = DateTime(cin.year, cin.month, cin.day, int.parse(m.group(1)!), int.parse(m.group(2)!));
    final diff = cin.difference(shift).inMinutes;
    if (diff <= 0) return null;
    return diff >= 60 ? '+${diff ~/ 60}h ${diff % 60}m' : '+$diff m';
  }

  // ════════════════════════ Team report ════════════════════════
  Future<void> _loadReport() async {
    setState(() { _loadingReport = true; _reportError = null; });
    try {
      final data = await ApiService.getAdminReport(
        'attendance_report',
        month: '${_month.month}',
        year: '${_month.year}',
      );
      if (!mounted) return;
      setState(() { _report = data; _loadingReport = false; });
    } catch (e) {
      if (!mounted) return;
      setState(() { _loadingReport = false; _reportError = e.toString().replaceAll('Exception: ', ''); });
    }
  }

  List<String> _monthItems() {
    final items = <String>[];
    final now = DateTime.now();
    var m = DateTime(now.year, now.month);
    for (var i = 0; i < 12; i++) {
      items.add('${m.year}-${m.month.toString().padLeft(2, '0')}');
      m = DateTime(m.year, m.month - 1);
    }
    return items;
  }

  /// Per-employee aggregates built from the report's `records[]`.
  List<Map<String, dynamic>> _reportByEmployee() {
    final records = jsonMapList(_report['records']);
    final byEmp = <String, Map<String, dynamic>>{};
    for (final r in records) {
      final code = '${r['employeeCode'] ?? r['name'] ?? '?'}';
      final e = byEmp.putIfAbsent(code, () => {
        'name': '${r['name'] ?? code}',
        'code': code,
        'department': '${r['department'] ?? ''}',
        'P': 0, 'L': 0, 'A': 0, 'HD': 0, 'O': 0, 'W': 0, 'hrs': 0.0,
      });
      final (letter, _) = _statusOf('${r['status'] ?? ''}');
      if (e.containsKey(letter)) e[letter] = (e[letter] as int) + 1;
      final hrs = double.tryParse('${r['workHours'] ?? ''}');
      if (hrs != null) e['hrs'] = (e['hrs'] as double) + hrs;
    }
    final list = byEmp.values.toList()
      ..sort((a, b) => ('${a['name']}').toLowerCase().compareTo(('${b['name']}').toLowerCase()));
    return list;
  }

  List<MapEntry<String, Map<String, dynamic>>> _reportByDay() {
    final byDate = _report['byDate'];
    if (byDate is! Map) return const [];
    final entries = byDate.entries.toList()
      ..sort((a, b) => '${b.key}'.compareTo('${a.key}'));
    return entries
        .map((e) => MapEntry('${e.key}', e.value is Map ? Map<String, dynamic>.from(e.value) : <String, dynamic>{}))
        .toList();
  }

  // ════════════════════════ UI ════════════════════════
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: MaanColors.pageBg,
      appBar: AppBar(
        backgroundColor: MaanColors.primary,
        foregroundColor: Colors.white,
        title: const Text('Team Attendance', style: TextStyle(fontWeight: FontWeight.w800)),
        elevation: 0,
        bottom: TabBar(
          controller: _tabs,
          indicatorColor: Colors.white,
          indicatorWeight: 3,
          labelColor: Colors.white,
          unselectedLabelColor: Colors.white60,
          labelStyle: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13),
          tabs: const [Tab(text: 'Daily Status'), Tab(text: 'Team Report')],
        ),
      ),
      body: TabBarView(
        controller: _tabs,
        children: [_buildDailyTab(), _buildReportTab()],
      ),
    );
  }

  // ─────────────────────── Daily status tab ───────────────────────
  Widget _buildDailyTab() {
    return Column(
      children: [
        // Date navigation
        Container(
          color: Colors.white,
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
          child: Row(children: [
            _dayNavBtn(Icons.chevron_left_rounded, () {
              setState(() => _day = _day.subtract(const Duration(days: 1)));
              _loadDay();
            }),
            Expanded(
              child: GestureDetector(
                onTap: () async {
                  final picked = await showDatePicker(
                    context: context,
                    initialDate: _day,
                    firstDate: DateTime(_day.year - 2),
                    lastDate: _day.add(const Duration(days: 365)),
                  );
                  if (picked != null) {
                    setState(() => _day = picked);
                    _loadDay();
                  }
                },
                child: Column(children: [
                  Text(DateFormat('EEEE, dd MMM yyyy').format(_day),
                      style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14, color: MaanColors.navy)),
                  const Text('Tap to change date', style: TextStyle(fontSize: 10, color: MaanColors.faint)),
                ]),
              ),
            ),
            _dayNavBtn(Icons.chevron_right_rounded, () {
              setState(() => _day = _day.add(const Duration(days: 1)));
              _loadDay();
            }),
            const SizedBox(width: 8),
            OutlinedButton(
              onPressed: () {
                final now = DateTime.now();
                if (!(_day.year == now.year && _day.month == now.month && _day.day == now.day)) {
                  setState(() => _day = now);
                  _loadDay();
                }
              },
              style: OutlinedButton.styleFrom(
                foregroundColor: MaanColors.primary,
                side: const BorderSide(color: MaanColors.primary),
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 0),
                minimumSize: const Size(0, 34),
              ),
              child: const Text('Today', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800)),
            ),
          ]),
        ),
        // Search
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
          child: TextField(
            onChanged: (v) => setState(() => _search = v.trim().toLowerCase()),
            decoration: InputDecoration(
              isDense: true,
              hintText: 'Search employee…',
              prefixIcon: const Icon(Icons.search_rounded, size: 20, color: MaanColors.faint),
              filled: true,
              fillColor: Colors.white,
              contentPadding: const EdgeInsets.symmetric(vertical: 8),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: MaanColors.line)),
              enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: MaanColors.line)),
            ),
          ),
        ),
        Expanded(
          child: _loadingDay
              ? const Center(child: CircularProgressIndicator(color: MaanColors.primary))
              : _dayError != null
                  ? _errorView(_dayError!, _loadDay)
                  : _buildDayBoardView(),
        ),
      ],
    );
  }

  Widget _buildDayBoardView() {
    final board = _buildDayBoard();
    final filtered = _search.isEmpty
        ? board
        : board.where((b) => '${b['name']}'.toLowerCase().contains(_search) || '${b['code']}'.toLowerCase().contains(_search)).toList();
    final stats = _dayStats(board);
    final tf = DateFormat('hh:mm a');
    return RefreshIndicator(
      onRefresh: _loadDay,
      color: MaanColors.primary,
      child: CustomScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          SliverToBoxAdapter(
            child: Container(
              padding: const EdgeInsets.fromLTRB(12, 10, 12, 4),
              child: Wrap(
                spacing: 6, runSpacing: 6,
                children: [
                  for (final s in _dayStatusOrder)
                    if ((stats[s] ?? 0) > 0)
                      _statChip(_statusOf(s), stats[s]!),
                ],
              ),
            ),
          ),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(12, 6, 12, 20),
            sliver: filtered.isEmpty
                ? const SliverToBoxAdapter(
                    child: Padding(
                      padding: EdgeInsets.only(top: 60),
                      child: Center(child: Text('No employees match this search', style: MaanText.body)),
                    ),
                  )
                : SliverList.separated(
                    itemCount: filtered.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 8),
                    itemBuilder: (ctx, i) => _dayCard(filtered[i], tf),
                  ),
          ),
        ],
      ),
    );
  }

  Widget _statChip((String, Color) badge, int count) {
    final (letter, color) = badge;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
      decoration: BoxDecoration(color: color.withOpacity(.10), borderRadius: BorderRadius.circular(20)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        _statusBadge(letter, color),
        const SizedBox(width: 5),
        Text('$count', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: color)),
      ]),
    );
  }

  Widget _dayNavBtn(IconData icon, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        padding: const EdgeInsets.all(4),
        decoration: BoxDecoration(color: MaanColors.pageBg, borderRadius: BorderRadius.circular(8)),
        child: Icon(icon, size: 20, color: MaanColors.primary),
      ),
    );
  }

  Widget _dayCard(Map<String, dynamic> b, DateFormat tf) {
    final row = b['row'] as Map<String, dynamic>?;
    final status = '${b['status']}';
    final (letter, color) = _statusOf(status);
    final empId = '${b['id']}';
    final lateBy = _lateBy(row, empId);
    final hrs = row == null ? null : double.tryParse('${row['workHours'] ?? ''}');
    final name = '${b['name']}'.isEmpty ? 'Unknown' : '${b['name']}';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: MaanColors.line),
      ),
      child: Row(
        children: [
          CircleAvatar(
            radius: 17,
            backgroundColor: color.withOpacity(.15),
            child: Text(
              name.isNotEmpty ? name.split(' ').map((w) => w.isEmpty ? '' : w[0]).take(2).join().toUpperCase() : '?',
              style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: color),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Expanded(child: Text(name, maxLines: 1, overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13, color: MaanColors.navy))),
                _statusBadge(letter, color),
              ]),
              const SizedBox(height: 3),
              Row(children: [
                Expanded(
                  child: Text(
                    '${b['code']}${b['department'] != null && '${b['department']}'.isNotEmpty ? ' · ${b['department']}' : ''}',
                    maxLines: 1, overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 10.5, color: MaanColors.faint),
                  ),
                ),
                if (row != null && (status == 'present' || status == 'late' || status == 'half_day'))
                  Text('${_hmOf(row['checkIn'])} → ${_hmOf(row['checkOut'])}',
                      style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, color: MaanColors.body)),
              ]),
              if (row != null && (status == 'present' || status == 'late' || status == 'half_day'))
                Padding(
                  padding: const EdgeInsets.only(top: 3),
                  child: Row(children: [
                    Text('${hrs != null ? '${hrs.toStringAsFixed(hrs == hrs.roundToDouble() ? 0 : 1)} h' : '—'} worked',
                        style: const TextStyle(fontSize: 10.5, color: MaanColors.body)),
                    if (lateBy != null) ...[
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                        decoration: BoxDecoration(color: MaanColors.accentOrange.withOpacity(.12), borderRadius: BorderRadius.circular(8)),
                        child: Text('Late by $lateBy',
                            style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: Color(0xFFB26A00))),
                      ),
                    ],
                  ]),
                ),
            ]),
          ),
        ],
      ),
    );
  }

  // ─────────────────────── Team report tab ───────────────────────
  Widget _buildReportTab() {
    final tiles = <MapEntry<String, dynamic>>[];
    final byStatus = _report['byStatus'];
    if (byStatus is Map) {
      for (final e in byStatus.entries) {
        tiles.add(MapEntry('${e.key}', e.value is num ? e.value as num : num.tryParse('${e.value}') ?? 0));
      }
    }
    final rate = _report['attendanceRate'];
    final lateArr = _report['lateArrivals'];
    final byEmp = _reportByEmployee();
    final byDay = _reportByDay();
    return RefreshIndicator(
      onRefresh: _loadReport,
      color: MaanColors.primary,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(12, 12, 12, 20),
        children: [
          // Month picker
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(10), border: Border.all(color: MaanColors.line)),
            child: DropdownButtonHideUnderline(
              child: DropdownButton<String>(
                value: '${_month.year}-${_month.month.toString().padLeft(2, '0')}',
                isExpanded: true,
                icon: const Icon(Icons.expand_more_rounded, size: 20, color: MaanColors.faint),
                items: [for (final it in _monthItems()) DropdownMenuItem(value: it, child: Text('Team report — ${DateFormat('MMMM yyyy').format(DateTime(int.parse(it.split('-')[0]), int.parse(it.split('-')[1])))}', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: MaanColors.navy)))],
                onChanged: (v) {
                  if (v == null) return;
                  final p = v.split('-');
                  final m = DateTime(int.parse(p[0]), int.parse(p[1]));
                  if (m.year != _month.year || m.month != _month.month) {
                    setState(() => _month = m);
                    _loadReport();
                  }
                },
              ),
            ),
          ),
          const SizedBox(height: 12),
          if (_loadingReport)
            const Padding(
              padding: EdgeInsets.only(top: 80),
              child: Center(child: CircularProgressIndicator(color: MaanColors.primary)),
            )
          else if (_reportError != null)
            _errorView(_reportError!, _loadReport)
          else ...[
            // Summary tiles
            Row(children: [
              _rateTile(rate is num ? rate : num.tryParse('$rate') ?? 0),
              const SizedBox(width: 8),
              _countTile('Late arrivals', lateArr is num ? lateArr as num : num.tryParse('$lateArr') ?? 0, MaanColors.accentOrange),
            ]),
            const SizedBox(height: 8),
            Wrap(
              spacing: 6, runSpacing: 6,
              children: [for (final t in tiles) _statusChip(_statusOf(t.key), (t.value).toInt())],
            ),
            const SizedBox(height: 14),
            // Per-employee table
            _sectionCard(
              title: 'Per employee (${byEmp.length})',
              child: byEmp.isEmpty
                  ? const Padding(padding: EdgeInsets.all(12), child: Text('No records for this month', style: MaanText.body))
                  : Column(children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                        decoration: const BoxDecoration(color: Color(0xFFF1F4FB), borderRadius: BorderRadius.vertical(top: Radius.circular(12))),
                        child: const Row(children: [
                          Expanded(flex: 5, child: Text('Employee', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 11, color: MaanColors.navy))),
                          Expanded(flex: 1, child: Text('P', textAlign: TextAlign.center, style: TextStyle(fontWeight: FontWeight.w800, fontSize: 11, color: MaanColors.navy))),
                          Expanded(flex: 1, child: Text('L', textAlign: TextAlign.center, style: TextStyle(fontWeight: FontWeight.w800, fontSize: 11, color: MaanColors.navy))),
                          Expanded(flex: 1, child: Text('A', textAlign: TextAlign.center, style: TextStyle(fontWeight: FontWeight.w800, fontSize: 11, color: MaanColors.navy))),
                          Expanded(flex: 1, child: Text('HD', textAlign: TextAlign.center, style: TextStyle(fontWeight: FontWeight.w800, fontSize: 11, color: MaanColors.navy))),
                          Expanded(flex: 2, child: Text('Hours', textAlign: TextAlign.right, style: TextStyle(fontWeight: FontWeight.w800, fontSize: 11, color: MaanColors.navy))),
                        ]),
                      ),
                      for (final e in byEmp)
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
                          decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: MaanColors.line))),
                          child: Row(children: [
                            Expanded(flex: 5, child: Text('${e['name']}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: MaanColors.navy))),
                            Expanded(flex: 1, child: _countText('${e['P']}', MaanColors.accentGreen)),
                            Expanded(flex: 1, child: _countText('${e['L']}', MaanColors.accentOrange)),
                            Expanded(flex: 1, child: _countText('${e['A']}', MaanColors.accentRed)),
                            Expanded(flex: 1, child: _countText('${e['HD']}', const Color(0xFFB26A00))),
                            Expanded(flex: 2, child: Text((e['hrs'] as double).toStringAsFixed((e['hrs'] as double) == (e['hrs'] as double).roundToDouble() ? 0 : 1), textAlign: TextAlign.right, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: MaanColors.body))),
                          ]),
                        ),
                    ]),
            ),
            const SizedBox(height: 12),
            // By-day breakdown
            _sectionCard(
              title: 'By day (${byDay.length})',
              child: byDay.isEmpty
                  ? const Padding(padding: EdgeInsets.all(12), child: Text('No day-wise data', style: MaanText.body))
                  : Column(children: [
                      for (final e in byDay)
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
                          decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: MaanColors.line))),
                          child: Row(children: [
                            SizedBox(
                              width: 86,
                              child: Text(_dayLabel(e.key), style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800, color: MaanColors.navy)),
                            ),
                            Expanded(child: Wrap(spacing: 4, runSpacing: 4, children: [
                              for (final s in ['present', 'late', 'absent', 'leave', 'wfh'])
                                if ((e.value[s] is num ? (e.value[s] as num).toInt() : 0) > 0)
                                  _miniCount(_statusOf(s == 'leave' ? 'on_leave' : s), (e.value[s] as num).toInt()),
                            ])),
                          ]),
                        ),
                    ]),
            ),
          ],
        ],
      ),
    );
  }

  String _dayLabel(String key) {
    final d = DateTime.tryParse(key);
    return d != null ? DateFormat('dd MMM').format(d) : key;
  }

  Widget _countText(String v, Color c) => Text(v, textAlign: TextAlign.center,
      style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: v == '0' ? MaanColors.faint : c));

  Widget _miniCount((String, Color) badge, int count) {
    final (letter, color) = badge;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
      decoration: BoxDecoration(color: color.withOpacity(.10), borderRadius: BorderRadius.circular(6)),
      child: Text('$letter $count', style: TextStyle(fontSize: 9.5, fontWeight: FontWeight.w800, color: color)),
    );
  }

  Widget _statusChip((String, Color) badge, int count) {
    final (letter, color) = badge;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
      decoration: BoxDecoration(color: color.withOpacity(.10), borderRadius: BorderRadius.circular(20)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        _statusBadge(letter, color),
        const SizedBox(width: 5),
        Text('$count', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: color)),
      ]),
    );
  }

  Widget _rateTile(num rate) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: MaanColors.line)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Attendance rate', style: TextStyle(fontSize: 10.5, color: MaanColors.faint, fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          Text('${rate.toStringAsFixed(rate == rate.roundToDouble() ? 0 : 1)}%',
              style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: MaanColors.primary)),
        ]),
      ),
    );
  }

  Widget _countTile(String label, num count, Color color) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: MaanColors.line)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label, style: const TextStyle(fontSize: 10.5, color: MaanColors.faint, fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          Text('$count', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: color)),
        ]),
      ),
    );
  }

  Widget _sectionCard({required String title, required Widget child}) {
    return Container(
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: MaanColors.line)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(10, 10, 10, 6),
          child: Text(title, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: MaanColors.navy)),
        ),
        child,
      ]),
    );
  }

  Widget _statusBadge(String letter, Color color) {
    return Container(
      width: 24, height: 22,
      alignment: Alignment.center,
      decoration: BoxDecoration(color: color.withOpacity(.14), borderRadius: BorderRadius.circular(6)),
      child: Text(letter, style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.w800)),
    );
  }

  Widget _errorView(String message, Future<void> Function() retry) {
    return ListView(padding: const EdgeInsets.all(24), children: [
      const Icon(Icons.fact_check_rounded, size: 46, color: MaanColors.faint),
      const SizedBox(height: 12),
      Text(message, style: MaanText.body, textAlign: TextAlign.center),
      const SizedBox(height: 12),
      Center(child: FilledButton(onPressed: () => retry(), style: FilledButton.styleFrom(backgroundColor: MaanColors.primary), child: const Text('Retry'))),
    ]);
  }
}
