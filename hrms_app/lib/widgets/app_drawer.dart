import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/maan_theme.dart';
import '../../config/app_info.dart';
import '../../models/user.dart';
import '../../providers/auth_provider.dart';
import '../../services/api_service.dart';
import '../../services/storage_service.dart';
import '../screens/reports/reports_screen.dart';
import 'maan_avatar.dart';

/// Task 112 — app drawer rebuilt from design #87:
///  · profile header (avatar + name + role + close)
///  · blue stats bar: Presents / Late / Absent — LIVE from /attendance/my-summary
///  · menu: Employee Profile, Notifications, Terms, Privacy, Log Out
///    (+ the four core modules and the connection check for power users)
class AppDrawer extends StatefulWidget {
  const AppDrawer({super.key});

  @override
  State<AppDrawer> createState() => _AppDrawerState();
}

class _AppDrawerState extends State<AppDrawer> {
  UserModel? _me;
  int _presents = 0, _late = 0, _absent = 0;
  bool _statsLoading = true;

  @override
  void initState() {
    super.initState();
    _loadIdentity();
    _loadStats();
  }

  Future<void> _loadIdentity() async {
    final data = StorageService.getUserData();
    if (data != null) {
      try {
        if (mounted) setState(() => _me = UserModel.fromJson(jsonDecode(data)));
      } catch (_) {}
    }
    final fresh = await ApiService.refreshStoredUser();
    if (fresh != null && mounted) setState(() => _me = fresh);
  }

  /// Presents / Late / Absent for the CURRENT month — the same numbers the
  /// web dashboard shows, straight from /api/attendance/my-summary.
  Future<void> _loadStats() async {
    try {
      final s = await ApiService.getMySummary();
      if (!mounted) return;
      setState(() {
        _presents = _asInt(s['present']);
        _late = _asInt(s['late']);
        _absent = _asInt(s['absent']);
        _statsLoading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _statsLoading = false);
    }
  }

  static int _asInt(dynamic v) => (v is num) ? v.toInt() : int.tryParse('${v ?? ''}') ?? 0;

  @override
  Widget build(BuildContext context) {
    final user = _me ?? context.watch<AuthProvider>().user;
    final name = user?.displayName ?? 'User';
    return Drawer(
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.horizontal(right: Radius.circular(24))),
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // ── Profile header ──
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 8, 4),
              child: Row(
                children: [
                  MaanAvatar(avatar: user?.avatar, name: name, radius: 24, bgColor: MaanColors.primary.withOpacity(.12), textColor: MaanColors.primary),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: MaanColors.navy)),
                      const SizedBox(height: 2),
                      Text((user?.role ?? 'Employee').replaceAll('_', ' ').toUpperCase(), style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, color: MaanColors.faint, letterSpacing: .6)),
                    ]),
                  ),
                  IconButton(icon: const Icon(Icons.close_rounded, color: MaanColors.navy), onPressed: () => Navigator.pop(context)),
                ],
              ),
            ),
            // ── Blue stats bar (Presents / Late / Absent) ──
            Container(
              margin: const EdgeInsets.fromLTRB(14, 10, 14, 6),
              padding: const EdgeInsets.symmetric(vertical: 14),
              decoration: BoxDecoration(
                gradient: const LinearGradient(colors: [Color(0xFF3A57C4), Color(0xFF6C4FD6)], begin: Alignment.topLeft, end: Alignment.bottomRight),
                borderRadius: BorderRadius.circular(16),
              ),
              child: _statsLoading
                  ? const SizedBox(height: 34, child: Center(child: SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))))
                  : Row(mainAxisAlignment: MainAxisAlignment.spaceEvenly, children: [
                      _statCircle('$_presents', 'Presents', Icons.check_circle_outline_rounded),
                      _statCircle('$_late', 'Late', Icons.schedule_rounded),
                      _statCircle('$_absent', 'Absent', Icons.event_busy_rounded),
                    ]),
            ),
            const Divider(color: MaanColors.line, height: 18),
            Expanded(
              child: ListView(padding: const EdgeInsets.symmetric(horizontal: 8), children: [
                _item(context, Icons.person_rounded, 'Employee Profile', () => Navigator.popAndPushNamed(context, '/profile')),
                _item(context, Icons.people_alt_rounded, 'Employee Directory', () => Navigator.popAndPushNamed(context, '/directory')),
                _item(context, Icons.event_busy_rounded, 'Leave Management', () => Navigator.popAndPushNamed(context, '/leaves-new')),
                _item(context, Icons.fact_check_rounded, 'Attendance', () => Navigator.popAndPushNamed(context, '/attendance-new')),
                _item(context, Icons.request_quote_rounded, 'Payroll', () => Navigator.popAndPushNamed(context, '/payroll-new')),
                // Task 114 — Project Management module (live web parity)
                _item(context, Icons.folder_special_rounded, 'Projects', () => Navigator.popAndPushNamed(context, '/projects-new')),
                // Task 117 — Collaboration Chat module (live web parity)
                _item(context, Icons.chat_bubble_rounded, 'Chat', () => Navigator.popAndPushNamed(context, '/chat')),
                // Task 141 — HR Help Desk (web Support ticketing parity)
                _item(context, Icons.headset_mic_rounded, 'HR Help Desk', () => Navigator.popAndPushNamed(context, '/helpdesk')),
                // Task 141 — Announcements & feeds
                _item(context, Icons.campaign_rounded, 'Announcements', () => Navigator.popAndPushNamed(context, '/announcements')),
                // Task 129 — admin Reports (leave / attendance / employees / projects)
                if (ReportsScreen.canSee(context.watch<AuthProvider>().user?.role))
                  _item(context, Icons.bar_chart_rounded, 'Reports', () => Navigator.popAndPushNamed(context, '/reports')),
                // Task 135 — team attendance reports + daily status (admin/CEO/HR)
                if (ReportsScreen.canSee(context.watch<AuthProvider>().user?.role))
                  _item(context, Icons.groups_rounded, 'Team Attendance', () => Navigator.popAndPushNamed(context, '/team-attendance')),
                _item(context, Icons.notifications_rounded, 'Notification', () => Navigator.popAndPushNamed(context, '/notifications')),
                _item(context, Icons.wifi_tethering_rounded, 'Connection check', () => Navigator.popAndPushNamed(context, '/diagnostics')),
                if (context.watch<AuthProvider>().isSuperAdminSession)
                  _item(context, Icons.swap_horiz_rounded, 'Switch Workspace', () async {
                    Navigator.pop(context);
                    context.read<AuthProvider>().beginTenantPick();
                    await Navigator.pushNamed(context, '/tenant-picker');
                  }),
                const Divider(color: MaanColors.line, height: 18),
                _item(context, Icons.description_outlined, 'Terms of Services', () => Navigator.popAndPushNamed(context, '/terms')),
                _item(context, Icons.privacy_tip_outlined, 'Privacy Policy', () => Navigator.popAndPushNamed(context, '/privacy')),
              ]),
            ),
            const Divider(color: MaanColors.line, height: 18),
            ListTile(
              leading: const Icon(Icons.logout_rounded, color: MaanColors.accentRed, size: 22),
              title: const Text('Log Out', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: MaanColors.accentRed)),
              onTap: () async {
                Navigator.pop(context);
                try { await context.read<AuthProvider>().logout(); } catch (_) {}
                if (context.mounted) Navigator.pushNamedAndRemoveUntil(context, '/signin', (r) => false);
              },
            ),
            Padding(
              padding: const EdgeInsets.only(bottom: 12, top: 4),
              child: Center(child: Text(AppInfo.label, style: MaanText.caption.copyWith(fontSize: 10))),
            ),
          ],
        ),
      ),
    );
  }

  Widget _statCircle(String value, String label, IconData icon) {
    return Column(mainAxisSize: MainAxisSize.min, children: [
      Container(
        width: 44, height: 44,
        decoration: BoxDecoration(color: Colors.white.withOpacity(.18), shape: BoxShape.circle),
        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          Text(value, style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w800)),
        ]),
      ),
      const SizedBox(height: 6),
      Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, color: Colors.white70, size: 12),
        const SizedBox(width: 3),
        Text(label, style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w600)),
      ]),
    ]);
  }

  Widget _item(BuildContext context, IconData icon, String title, VoidCallback onTap) {
    return ListTile(
      leading: Container(
        width: 34, height: 34,
        decoration: BoxDecoration(color: MaanColors.primary.withOpacity(.09), borderRadius: BorderRadius.circular(9)),
        child: Icon(icon, color: MaanColors.primary, size: 18),
      ),
      title: Text(title, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: MaanColors.navy)),
      onTap: onTap,
      dense: true,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
    );
  }
}
