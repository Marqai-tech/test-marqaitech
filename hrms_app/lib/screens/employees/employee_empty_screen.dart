import 'package:flutter/material.dart';
import '../../config/maan_theme.dart';
import '../../services/local_employee_store.dart';
import 'add_employee_screen.dart';

/// Empty Employee state — matches design screenshot #6 ("No Data / Add your employee").
/// Lists locally-added employees once at least one has been saved.
class EmployeeEmptyScreen extends StatefulWidget {
  const EmployeeEmptyScreen({super.key});

  @override
  State<EmployeeEmptyScreen> createState() => _EmployeeEmptyScreenState();
}

class _EmployeeEmptyScreenState extends State<EmployeeEmptyScreen> {
  List<Map<String, dynamic>> _employees = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final list = await LocalEmployeeStore.all();
    if (mounted) setState(() => _employees = list);
  }

  @override
  Widget build(BuildContext context) {
    final empty = _employees.isEmpty;
    return MaanPage(
      title: empty ? 'Empty Employee' : 'Employees',
      notificationBadge: 0,
      body: empty
          ? _emptyBody()
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView.separated(
                padding: const EdgeInsets.fromLTRB(16, 26, 16, 90),
                itemCount: _employees.length,
                separatorBuilder: (_, __) => const SizedBox(height: 12),
                itemBuilder: (context, i) {
                  final e = _employees[i];
                  final initials = _initials('${e['fullName'] ?? ''}');
                  return Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: MaanColors.line),
                    ),
                    child: Row(
                      children: [
                        CircleAvatar(
                          radius: 24,
                          backgroundColor: const Color(0xFFE9E6FD),
                          child: Text(initials, style: const TextStyle(color: MaanColors.primary, fontWeight: FontWeight.w800)),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('${e['fullName'] ?? ''}', style: MaanText.title),
                              const SizedBox(height: 2),
                              Text('${e['designation'] ?? '—'} · ${e['employeeId'] ?? ''}', style: MaanText.caption),
                            ],
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
                          decoration: BoxDecoration(color: const Color(0xFFE6F9F2), borderRadius: BorderRadius.circular(20)),
                          child: Text('${e['payType'] ?? 'Monthly'}', style: const TextStyle(color: MaanColors.accentGreen, fontSize: 10.5, fontWeight: FontWeight.w700)),
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),
      fab: FloatingActionButton(
        backgroundColor: MaanColors.primary,
        shape: const CircleBorder(),
        onPressed: () async {
          await Navigator.push(context, MaterialPageRoute(builder: (_) => const AddEmployeeScreen()));
          _load();
        },
        child: const Icon(Icons.add, color: Colors.white, size: 28),
      ),
    );
  }

  String _initials(String name) {
    final parts = name.trim().split(RegExp(r'\s+'))..removeWhere((p) => p.isEmpty);
    if (parts.isEmpty) return 'E';
    if (parts.length == 1) return parts.first.substring(0, 1).toUpperCase();
    return (parts.first.substring(0, 1) + parts.last.substring(0, 1)).toUpperCase();
  }

  Widget _emptyBody() {
    return SingleChildScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 30, 24, 30),
        child: Column(
          children: [
            const SizedBox(height: 26),
            SizedBox(
              width: 280,
              height: 230,
              child: Stack(
                alignment: Alignment.center,
                children: [
                  Positioned(
                    bottom: 6,
                    child: Container(
                      width: 260,
                      height: 120,
                      decoration: BoxDecoration(color: const Color(0xFFE4EBF9), borderRadius: BorderRadius.circular(60)),
                    ),
                  ),
                  Positioned(
                    top: 8,
                    child: _monitor(),
                  ),
                  Positioned(
                    bottom: 14,
                    right: 60,
                    child: _deskPerson(),
                  ),
                  Positioned(
                    top: 14,
                    left: 46,
                    child: const Text('⚡', style: TextStyle(fontSize: 26, color: Color(0xFFF5A623))),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 26),
            const Text('No Data', style: TextStyle(fontSize: 21, fontWeight: FontWeight.w800, color: MaanColors.navy)),
            const SizedBox(height: 8),
            const Text('Add your employee', style: TextStyle(fontSize: 14, color: MaanColors.faint)),
          ],
        ),
      ),
    );
  }

  Widget _monitor() => Container(
        width: 120,
        height: 86,
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: const Color(0xFFB9C2D4), width: 3),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(3, (i) => Container(
                width: 44,
                height: 7,
                margin: const EdgeInsets.symmetric(vertical: 3, horizontal: 4),
                decoration: BoxDecoration(color: i == 0 ? const Color(0xFFF5A623) : const Color(0xFFD7DEEC), borderRadius: BorderRadius.circular(4)),
              )),
            ),
            Container(
              width: 26,
              height: 26,
              margin: const EdgeInsets.only(top: 6),
              decoration: BoxDecoration(color: const Color(0xFFF5A623), borderRadius: BorderRadius.circular(6)),
              child: const Icon(Icons.close, color: Colors.white, size: 18),
            ),
          ],
        ),
      );

  Widget _deskPerson() => SizedBox(
        width: 120,
        height: 110,
        child: Stack(
          children: [
            Positioned(
              bottom: 8,
              left: 0,
              child: Container(width: 84, height: 7, decoration: BoxDecoration(color: const Color(0xFF9DB6E4), borderRadius: BorderRadius.circular(4))),
            ),
            Positioned(bottom: 15, left: 8, child: Container(width: 6, height: 22, color: const Color(0xFF9DB6E4))),
            Positioned(bottom: 15, left: 64, child: Container(width: 6, height: 22, color: const Color(0xFF9DB6E4))),
            Positioned(
              bottom: 20,
              right: 0,
              child: Container(
                width: 40,
                height: 56,
                decoration: BoxDecoration(color: const Color(0xFF5B7FE8), borderRadius: BorderRadius.circular(18)),
              ),
            ),
            Positioned(
              bottom: 66,
              right: 6,
              child: Container(
                width: 30,
                height: 30,
                decoration: const BoxDecoration(color: Color(0xFF39445C), shape: BoxShape.circle),
              ),
            ),
          ],
        ),
      );
}
