import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../config/maan_theme.dart';
import '../../services/api_service.dart';
import '../../utils/json_safe.dart';
import '../../widgets/maan_avatar.dart';
import '../../widgets/main_scaffold.dart';

/// Task 112 — Employee Directory built from design #16:
///  · designation filter chips (All + the designations actually present)
///  · two-column cards with ringed avatar, online dot, live attendance status
///    ("Checked In" / "Not Checked" from today's attendance rows)
///  · quick actions: call · mail · open profile
class EmployeeDirectoryScreen extends StatefulWidget {
  const EmployeeDirectoryScreen({super.key});

  @override
  State<EmployeeDirectoryScreen> createState() => _EmployeeDirectoryScreenState();
}

class _EmployeeDirectoryScreenState extends State<EmployeeDirectoryScreen> {
  final _search = TextEditingController();
  List<Map<String, dynamic>> _employees = [];
  Set<String> _checkedIn = {};
  String _filter = 'All';
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final data = await ApiService.getEmployees(limit: 200);
      final list = jsonList(data['employees'] is List ? data['employees'] : data['data']);
      final emps = list.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
      Set<String> checked = {};
      try {
        final n = DateTime.now();
        final att = await ApiService.getAttendance(date: '${n.year}-${n.month.toString().padLeft(2, '0')}-${n.day.toString().padLeft(2, '0')}');
        final rows = jsonList(att['attendance'] is List ? att['attendance'] : att['data']);
        for (final r in rows) {
          if (r is Map && (r['checkIn'] != null) && r['employeeId'] != null) {
            checked.add('${r['employeeId']}');
          }
        }
      } catch (_) {/* status chips fall back to Not Checked */}
      if (!mounted) return;
      setState(() { _employees = emps; _checkedIn = checked; _loading = false; });
    } catch (e) {
      if (!mounted) return;
      setState(() { _loading = false; _error = e.toString().replaceAll('Exception: ', ''); });
    }
  }

  List<String> get _designations {
    final set = <String>{};
    for (final e in _employees) {
      final d = _designationOf(e);
      if (d.isNotEmpty) set.add(d);
    }
    final list = set.toList()..sort();
    return ['All', ...list];
  }

  static String _designationOf(Map<String, dynamic> e) {
    final d = e['designation'];
    if (d is Map) return '${d['title'] ?? d['name'] ?? ''}'.trim();
    return '${e['designationTitle'] ?? e['designation'] ?? ''}'.trim();
  }

  static String _nameOf(Map<String, dynamic> e) {
    final first = '${e['firstName'] ?? ''}'.trim();
    final last = '${e['lastName'] ?? ''}'.trim();
    final full = '$first $last'.trim();
    return full.isNotEmpty ? full : '${e['name'] ?? 'Unknown'}';
  }

  List<Map<String, dynamic>> get _filtered {
    final q = _search.text.trim().toLowerCase();
    return _employees.where((e) {
      final matchesFilter = _filter == 'All' || _designationOf(e) == _filter;
      final matchesQuery = q.isEmpty ||
          _nameOf(e).toLowerCase().contains(q) ||
          '${e['email'] ?? ''}'.toLowerCase().contains(q) ||
          '${e['employeeId'] ?? ''}'.toLowerCase().contains(q);
      return matchesFilter && matchesQuery;
    }).toList();
  }

  Future<void> _launch(String url) async {
    final uri = Uri.parse(url);
    try { await launchUrl(uri, mode: LaunchMode.externalApplication); } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final emps = _filtered;
    return MainTabScaffold(
      currentIndex: 1,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            // ── Header ──
            Container(
              color: MaanColors.primary,
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(children: [
                    Text('Employee Directory', style: const TextStyle(color: Colors.white, fontSize: 19, fontWeight: FontWeight.w800)),
                    const Spacer(),
                    Text('${_employees.length} people', style: TextStyle(color: Colors.white.withOpacity(.85), fontSize: 12, fontWeight: FontWeight.w600)),
                  ]),
                  const SizedBox(height: 10),
                  TextField(
                    controller: _search,
                    onChanged: (_) => setState(() {}),
                    style: const TextStyle(color: MaanColors.navy, fontSize: 13.5),
                    decoration: InputDecoration(
                      hintText: 'Search name, email or ID',
                      prefixIcon: const Icon(Icons.search_rounded, size: 20, color: MaanColors.faint),
                      isDense: true,
                      filled: true,
                      fillColor: Colors.white,
                      contentPadding: const EdgeInsets.symmetric(vertical: 10),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
                    ),
                  ),
                ],
              ),
            ),
            // ── Designation chips ──
            SizedBox(
              height: 44,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                children: [
                  for (final d in _designations)
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: GestureDetector(
                        onTap: () => setState(() => _filter = d),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 14),
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                            color: _filter == d ? MaanColors.primary : Colors.white,
                            borderRadius: BorderRadius.circular(18),
                            border: Border.all(color: _filter == d ? MaanColors.primary : MaanColors.line),
                          ),
                          child: Text(d, style: TextStyle(color: _filter == d ? Colors.white : MaanColors.body, fontSize: 12, fontWeight: FontWeight.w600)),
                        ),
                      ),
                    ),
                ],
              ),
            ),
            Expanded(
              child: RefreshIndicator(
                color: MaanColors.primary,
                onRefresh: _load,
                child: _loading
                    ? const Center(child: CircularProgressIndicator(color: MaanColors.primary))
                    : _error != null
                        ? ListView(children: [
                            const SizedBox(height: 80),
                            Text(_error!, textAlign: TextAlign.center, style: MaanText.body),
                            const SizedBox(height: 10),
                            Center(child: TextButton(onPressed: _load, child: const Text('Retry'))),
                          ])
                        : emps.isEmpty
                            ? ListView(children: const [
                                SizedBox(height: 100),
                                Center(child: Text('No employees match this filter', style: MaanText.body)),
                              ])
                            : GridView.builder(
                                padding: const EdgeInsets.fromLTRB(14, 6, 14, 20),
                                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 2, mainAxisSpacing: 10, crossAxisSpacing: 10, childAspectRatio: 0.88),
                                itemCount: emps.length,
                                itemBuilder: (ctx, i) => _card(emps[i]),
                              ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _card(Map<String, dynamic> e) {
    final name = _nameOf(e);
    final desig = _designationOf(e);
    final checkedIn = _checkedIn.contains('${e['id']}');
    final statusColor = checkedIn ? MaanColors.accentGreen : MaanColors.accentOrange;
    final phone = '${e['phone'] ?? ''}';
    final email = '${e['email'] ?? ''}';
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () => Navigator.pushNamed(context, '/employees/detail', arguments: '${e['id']}'),
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(16), border: Border.all(color: MaanColors.line)),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Stack(
                children: [
                  Container(
                    padding: const EdgeInsets.all(2.5),
                    decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: MaanColors.accentOrange, width: 2)),
                    child: MaanAvatar(avatar: e['avatar']?.toString(), name: name, radius: 24, bgColor: MaanColors.primary.withOpacity(.12), textColor: MaanColors.primary),
                  ),
                  Positioned(
                    right: 0, bottom: 0,
                    child: Container(
                      width: 12, height: 12,
                      decoration: BoxDecoration(color: checkedIn ? MaanColors.accentGreen : MaanColors.faint, shape: BoxShape.circle, border: Border.all(color: Colors.white, width: 2)),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: MaanColors.navy)),
              if (desig.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 1),
                  child: Text(desig, maxLines: 1, overflow: TextOverflow.ellipsis, style: MaanText.caption.copyWith(fontSize: 10.5)),
                ),
              const SizedBox(height: 3),
              Text(checkedIn ? 'Checked In' : 'Not Checked', style: TextStyle(color: statusColor, fontSize: 10.5, fontWeight: FontWeight.w800)),
              const SizedBox(height: 7),
              Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                if (phone.isNotEmpty) _actionIcon(Icons.phone_rounded, MaanColors.accentGreen, () => _launch('tel:$phone')),
                const SizedBox(width: 10),
                if (email.isNotEmpty) _actionIcon(Icons.mail_rounded, MaanColors.accentIndigo, () => _launch('mailto:$email')),
                const SizedBox(width: 10),
                _actionIcon(Icons.chat_bubble_outline_rounded, MaanColors.accentOrange, () => Navigator.pushNamed(context, '/employees/detail', arguments: '${e['id']}')),
              ]),
            ],
          ),
        ),
      ),
    );
  }

  Widget _actionIcon(IconData icon, Color color, VoidCallback onTap) {
    return InkWell(
      borderRadius: BorderRadius.circular(9),
      onTap: onTap,
      child: Container(
        width: 30, height: 30,
        decoration: BoxDecoration(color: color.withOpacity(.11), borderRadius: BorderRadius.circular(9)),
        child: Icon(icon, color: color, size: 15),
      ),
    );
  }
}
