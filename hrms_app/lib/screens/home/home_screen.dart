import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/maan_theme.dart';
import '../../models/user.dart';
import '../../providers/auth_provider.dart';
import '../../providers/employee_provider.dart';
import '../../services/api_service.dart';
import '../../services/storage_service.dart';

/// Home dashboard — LIVE stats from the web APIs + the 4 core modules.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  UserModel? _me;
  Map<String, int> _stats = {'employees': 0, 'pendingLeaves': 0, 'presentToday': 0, 'payrolls': 0};
  bool _loading = true;
  String? _error;

  static const Set<String> _adminRoles = {'super_admin', 'tenant_admin', 'hr_admin', 'admin'};
  bool get _isAdmin => _adminRoles.contains(_me?.role);
  bool get _isEmployee => !_isAdmin && _me?.role != 'manager';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final data = StorageService.getUserData();
    if (data != null) {
      try {
        _me = UserModel.fromJson(jsonDecode(data));
      } catch (_) {}
    }
    await _refreshStats();
  }

  Future<void> _refreshStats() async {
    setState(() { _loading = true; _error = null; });
    try {
      int employees = 0, pendingLeaves = 0, presentToday = 0, payrolls = 0;
      final results = await Future.wait([
        ApiService.getEmployees(limit: 1),
        ApiService.getLeaves(status: 'pending'),
        ApiService.getAttendance(date: _today()),
        ApiService.getPayrolls(limit: 1),
      ]);
      employees = (results[0]['pagination']?['total'] ?? (results[0]['employees'] as List?)?.length ?? 0) as int;
      pendingLeaves = (results[1]['pagination']?['total'] ?? (results[1]['data'] as List?)?.length ?? 0) as int;
      presentToday = (results[2]['attendance'] as List?)?.where((a) => a['status'] == 'present').length ?? 0;
      payrolls = (results[3]['pagination']?['total'] ?? (results[3]['payrolls'] as List?)?.length ?? 0) as int;
      if (mounted) {
        setState(() {
          _stats = {'employees': employees, 'pendingLeaves': pendingLeaves, 'presentToday': presentToday, 'payrolls': payrolls};
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() { _error = e.toString().replaceAll('Exception: ', ''); _loading = false; });
      }
    }
  }

  static String _today() {
    final n = DateTime.now();
    final m = n.month.toString().padLeft(2, '0');
    final d = n.day.toString().padLeft(2, '0');
    return '${n.year}-$m-$d';
  }

  void _comingSoon(BuildContext context, String module) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$module — coming up in the next release')));
  }

  @override
  Widget build(BuildContext context) {
    final name = _me?.displayName ?? 'there';
    return Scaffold(
      backgroundColor: MaanColors.pageBg,
      drawer: _buildDrawer(context),
      body: RefreshIndicator(
        color: MaanColors.primary,
        onRefresh: _refreshStats,
        child: ListView(
          padding: EdgeInsets.zero,
          children: [
            Container(
              color: MaanColors.primary,
              padding: EdgeInsets.only(top: MediaQuery.of(context).padding.top + 14, bottom: 26, left: 18, right: 16),
              child: Row(
                children: [
                  Builder(
                    builder: (ctx) => InkWell(
                      onTap: () => Scaffold.of(ctx).openDrawer(),
                      child: Container(
                        width: 42, height: 42,
                        decoration: BoxDecoration(color: Colors.white.withOpacity(.18), borderRadius: BorderRadius.circular(11)),
                        child: const Icon(Icons.menu, color: Colors.white, size: 22),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(_greeting(), style: const TextStyle(color: Colors.white70, fontSize: 12.5)),
                      Text(name, style: const TextStyle(color: Colors.white, fontSize: 19, fontWeight: FontWeight.w800)),
                    ]),
                  ),
                  if (_me?.role != null)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                      decoration: BoxDecoration(color: Colors.white.withOpacity(.16), borderRadius: BorderRadius.circular(9)),
                      child: Text((_me!.role ?? '').replaceAll('_', ' ').toUpperCase(), style: const TextStyle(color: Colors.white, fontSize: 9.5, fontWeight: FontWeight.w800, letterSpacing: .5)),
                    ),
                ],
              ),
            ),
            Transform.translate(
              offset: const Offset(0, -14),
              child: Container(
                margin: const EdgeInsets.symmetric(horizontal: 16),
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(18),
                  boxShadow: [BoxShadow(color: Colors.black.withOpacity(.07), blurRadius: 18, offset: const Offset(0, 6))],
                ),
                child: _loading
                    ? const SizedBox(height: 64, child: Center(child: CircularProgressIndicator(color: MaanColors.primary, strokeWidth: 2.4)))
                    : _error != null
                        ? Column(children: [
                            Text(_error!, style: MaanText.caption, textAlign: TextAlign.center),
                            const SizedBox(height: 6),
                            TextButton(onPressed: _refreshStats, child: const Text('Retry', style: TextStyle(color: MaanColors.primary))),
                          ])
                        : Row(mainAxisAlignment: MainAxisAlignment.spaceAround, children: [
                            _stat('${_stats['employees']}', 'Employees', Icons.people_alt_rounded, MaanColors.accentIndigo),
                            _stat('${_stats['pendingLeaves']}', 'Pending\nLeaves', Icons.event_busy_rounded, MaanColors.accentOrange),
                            _stat('${_stats['presentToday']}', 'Present\nToday', Icons.check_circle_rounded, MaanColors.accentGreen),
                            _stat('${_stats['payrolls']}', 'Payslips', Icons.request_quote_rounded, MaanColors.accentCyan),
                          ]),
              ),
            ),
            const SizedBox(height: 4),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Text('Modules', style: MaanText.h2.copyWith(fontSize: 17)),
            ),
            const SizedBox(height: 10),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: GridView.count(
                crossAxisCount: 2,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                mainAxisSpacing: 12,
                crossAxisSpacing: 12,
                childAspectRatio: 1.45,
                children: [
                  _tile(context, 'Employee\nManagement', Icons.people_alt_rounded, MaanColors.accentIndigo, const Color(0xFFE9E6FD), () => Navigator.pushNamed(context, '/employees-new')),
                  _tile(context, 'Leave\nManagement', Icons.event_busy_rounded, MaanColors.accentOrange, const Color(0xFFFEF3E2), () => Navigator.pushNamed(context, '/leaves-new')),
                  _tile(context, 'Attendance', Icons.fact_check_rounded, MaanColors.accentGreen, const Color(0xFFE6F9F2), () => Navigator.pushNamed(context, '/attendance-new')),
                  _tile(context, 'Payroll\nManagement', Icons.request_quote_rounded, MaanColors.accentCyan, const Color(0xFFE8F4FD), () => Navigator.pushNamed(context, '/payroll-new')),
                  _tile(context, 'Notifications', Icons.notifications_rounded, MaanColors.accentPink, const Color(0xFFFDE7EF), () => Navigator.pushNamed(context, '/notifications')),
                  _tile(context, 'My Profile', Icons.person_rounded, MaanColors.accentPurple, const Color(0xFFEFEAFD), () => Navigator.pushNamed(context, '/profile')),
                  // Super-admin sessions keep a workspace switcher on the
                  // dashboard (same GOLDEN RULE as the web switcher).
                  if (context.watch<AuthProvider>().isSuperAdminSession)
                    _tile(context, 'Switch\nWorkspace', Icons.swap_horiz_rounded, MaanColors.navy, const Color(0xFFEEF2F7), () async {
                      context.read<AuthProvider>().beginTenantPick();
                      await Navigator.pushNamed(context, '/tenant-picker');
                      if (mounted) setState(() {}); // refresh stats for the newly selected tenant
                    }),
                ],
              ),
            ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }

  String _greeting() {
    final h = DateTime.now().hour;
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  Widget _stat(String value, String label, IconData icon, Color color) {
    return Column(mainAxisSize: MainAxisSize.min, children: [
      Container(
        width: 42, height: 42,
        decoration: BoxDecoration(color: color.withOpacity(.14), borderRadius: BorderRadius.circular(11)),
        child: Icon(icon, color: color, size: 21),
      ),
      const SizedBox(height: 6),
      Text(value, style: MaanText.h2.copyWith(fontSize: 18)),
      const SizedBox(height: 1),
      Text(label, style: MaanText.caption.copyWith(fontSize: 10.5, height: 1.2), textAlign: TextAlign.center),
    ]);
  }

  Widget _tile(BuildContext context, String label, IconData icon, Color accent, Color bg, VoidCallback onTap) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(16), border: Border.all(color: MaanColors.line)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(
              width: 42, height: 42,
              decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(12)),
              child: Icon(icon, color: accent, size: 22),
            ),
            const Spacer(),
            Text(label, style: MaanText.title.copyWith(fontSize: 14, height: 1.25)),
          ]),
        ),
      ),
    );
  }

  Widget _buildDrawer(BuildContext context) {
    return Drawer(
      backgroundColor: Colors.white,
      child: SafeArea(
        child: ListView(padding: EdgeInsets.zero, children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 18, 18, 8),
            child: Row(children: [
              Container(
                width: 46, height: 46,
                padding: const EdgeInsets.all(4),
                decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: MaanColors.line)),
                child: Image.asset('assets/logos/logo-cubes.png', fit: BoxFit.contain),
              ),
              const SizedBox(width: 10),
              const Expanded(child: Text('3 Boxes HRMS', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: MaanColors.navy))),
            ]),
          ),
          const Divider(color: MaanColors.line),
          _drawerItem(context, Icons.dashboard_rounded, 'Home', () => Navigator.pop(context)),
          _drawerItem(context, Icons.people_alt_rounded, 'Employee Management', () { Navigator.pop(context); Navigator.pushNamed(context, '/employees-new'); }),
          _drawerItem(context, Icons.event_busy_rounded, 'Leave Management', () { Navigator.pop(context); Navigator.pushNamed(context, '/leaves-new'); }),
          _drawerItem(context, Icons.fact_check_rounded, 'Attendance', () { Navigator.pop(context); Navigator.pushNamed(context, '/attendance-new'); }),
          _drawerItem(context, Icons.request_quote_rounded, 'Payroll Management', () { Navigator.pop(context); Navigator.pushNamed(context, '/payroll-new'); }),
          _drawerItem(context, Icons.notifications_rounded, 'Notifications', () { Navigator.pop(context); Navigator.pushNamed(context, '/notifications'); }),
          _drawerItem(context, Icons.person_rounded, 'My Profile', () { Navigator.pop(context); Navigator.pushNamed(context, '/profile'); }),
          _drawerItem(context, Icons.settings_rounded, 'Settings', () { Navigator.pop(context); Navigator.pushNamed(context, '/settings'); }),
          const Divider(color: MaanColors.line),
          _drawerItem(context, Icons.logout_rounded, 'Logout', () async {
            Navigator.pop(context);
            final authProvider = context.read<AuthProvider>();
            try { await authProvider.logout(); } catch (_) {}
            if (context.mounted) Navigator.pushNamedAndRemoveUntil(context, '/signin', (r) => false);
          }, danger: true),
          const SizedBox(height: 12),
          Center(child: Text('MANAGE PEOPLE. EMPOWER GROWTH.', style: MaanText.caption.copyWith(fontSize: 9.5, letterSpacing: .8))),
          const SizedBox(height: 16),
        ]),
      ),
    );
  }

  Widget _drawerItem(BuildContext context, IconData icon, String title, VoidCallback onTap, {bool danger = false}) {
    return ListTile(
      leading: Icon(icon, color: danger ? MaanColors.accentRed : MaanColors.primary, size: 22),
      title: Text(title, style: MaanText.title.copyWith(fontSize: 14, color: danger ? MaanColors.accentRed : MaanColors.navy)),
      onTap: onTap,
      dense: true,
    );
  }
}
