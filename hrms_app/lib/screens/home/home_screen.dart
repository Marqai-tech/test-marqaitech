import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/maan_theme.dart';
import '../../providers/notification_provider.dart';
import '../../services/storage_service.dart';
import '../placeholder/coming_soon_screen.dart';

/// Home dashboard — matches design screenshot #4
/// ("HRM & Payroll Management": 2×2 grid + list rows on a blue header).
class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    int unread = 0;
    try {
      final p = Provider.of<NotificationProvider>(context, listen: false);
      unread = p.unreadCount ?? 0;
    } catch (_) {}

    return Scaffold(
      backgroundColor: MaanColors.pageBg,
      drawer: _HomeDrawer(),
      body: Column(
        children: [
          Container(
            color: MaanColors.primary,
            padding: EdgeInsets.only(top: MediaQuery.of(context).padding.top + 10, bottom: 30, left: 6, right: 14),
            child: Row(
              children: [
                Builder(
                  builder: (ctx) => Padding(
                    padding: const EdgeInsets.only(left: 6, right: 10),
                    child: Container(
                      width: 42,
                      height: 42,
                      decoration: BoxDecoration(color: Colors.white.withOpacity(.18), borderRadius: BorderRadius.circular(11)),
                      child: IconButton(
                        onPressed: () => Scaffold.of(ctx).openDrawer(),
                        icon: const Icon(Icons.menu, color: Colors.white, size: 22),
                        padding: EdgeInsets.zero,
                      ),
                    ),
                  ),
                ),
                const Expanded(
                  child: Text.rich(
                    TextSpan(
                      children: [
                        TextSpan(text: 'HRM &\n', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w600, height: 1.2)),
                        TextSpan(text: 'Payroll Management', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w800, height: 1.2)),
                      ],
                    ),
                  ),
                ),
                Stack(
                  children: [
                    IconButton(
                      onPressed: () => Navigator.pushNamed(context, '/notifications'),
                      icon: const Icon(Icons.notifications_none, color: Colors.white, size: 26),
                    ),
                    if (unread > 0)
                      Positioned(
                        right: 8,
                        top: 8,
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                          decoration: BoxDecoration(color: Colors.orange, borderRadius: BorderRadius.circular(9)),
                          child: Text('$unread', style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w700)),
                        ),
                      ),
                  ],
                ),
              ],
            ),
          ),
          Expanded(
            child: Container(
              width: double.infinity,
              transform: Matrix4.translationValues(0, -18, 0),
              decoration: const BoxDecoration(
                color: MaanColors.pageBg,
                borderRadius: BorderRadius.only(topLeft: Radius.circular(26), topRight: Radius.circular(26)),
              ),
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(16, 26, 16, 24),
                child: Column(
                  children: [
                    GridView.count(
                      crossAxisCount: 2,
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      mainAxisSpacing: 12,
                      crossAxisSpacing: 12,
                      childAspectRatio: 1.14,
                      children: [
                        _gridTile(context, 'Employee\nManagement', Icons.people_alt_rounded, MaanColors.accentIndigo, const Color(0xFFE9E6FD), MaanColors.accentPurple,
                            () => Navigator.pushNamed(context, '/employees-new')),
                        _gridTile(context, 'Expenses\nManagement', Icons.account_balance_wallet_rounded, MaanColors.accentPink, const Color(0xFFFDE7EF), MaanColors.accentPink,
                            () => _comingSoon(context, 'Expenses Management')),
                        _gridTile(context, 'Payroll\nManagement', Icons.request_quote_rounded, MaanColors.accentCyan, const Color(0xFFE8F4FD), MaanColors.accentCyan,
                            () => _comingSoon(context, 'Payroll Management')),
                        _gridTile(context, 'File\nManagement', Icons.folder_copy_rounded, MaanColors.accentGreen, const Color(0xFFE6F9F2), MaanColors.accentGreen,
                            () => _comingSoon(context, 'File Management')),
                      ],
                    ),
                    const SizedBox(height: 18),
                    MaanListRow(
                      label: 'Client Management',
                      icon: Icons.support_agent_rounded,
                      accent: MaanColors.accentCyan,
                      iconBg: const Color(0xFFE8F4FD),
                      onTap: () => _comingSoon(context, 'Client Management'),
                    ),
                    const SizedBox(height: 12),
                    MaanListRow(
                      label: 'NOC/Ex Certificate',
                      icon: Icons.history_edu_rounded,
                      accent: MaanColors.accentOrange,
                      iconBg: const Color(0xFFFDF1DE),
                      onTap: () => _comingSoon(context, 'NOC/Ex Certificate'),
                    ),
                    const SizedBox(height: 12),
                    MaanListRow(
                      label: 'Notice Board',
                      icon: Icons.campaign_rounded,
                      accent: MaanColors.accentGreen,
                      iconBg: const Color(0xFFE6F9F2),
                      badge: 2,
                      onTap: () => Navigator.pushNamed(context, '/notifications'),
                    ),
                    const SizedBox(height: 12),
                    MaanListRow(
                      label: 'Award',
                      icon: Icons.emoji_events_rounded,
                      accent: MaanColors.accentPurple,
                      iconBg: const Color(0xFFE9E6FD),
                      onTap: () => _comingSoon(context, 'Award'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _comingSoon(BuildContext context, String module) {
    Navigator.push(context, MaterialPageRoute(builder: (_) => ComingSoonScreen(module: module)));
  }

  Widget _gridTile(BuildContext context, String label, IconData icon, Color tileColor, Color tileBg, Color accent, VoidCallback onTap) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: MaanColors.line),
            boxShadow: [BoxShadow(color: Colors.black.withOpacity(.04), blurRadius: 10, offset: const Offset(0, 3))],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(width: 4, height: 40, decoration: BoxDecoration(color: accent, borderRadius: BorderRadius.circular(3))),
                  const SizedBox(width: 10),
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(color: tileBg, borderRadius: BorderRadius.circular(11)),
                    child: Icon(icon, color: tileColor, size: 24),
                  ),
                ],
              ),
              const Spacer(),
              Text(label, style: MaanText.title.copyWith(height: 1.3)),
            ],
          ),
        ),
      ),
    );
  }
}

class _HomeDrawer extends StatelessWidget {
  _HomeDrawer();

  @override
  Widget build(BuildContext context) {
    return Drawer(
      backgroundColor: Colors.white,
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Padding(
              padding: EdgeInsets.all(18),
              child: Align(alignment: Alignment.centerLeft, child: MaanLogoMark(size: 54)),
            ),
            const Divider(),
            _drawerItem(context, Icons.dashboard_rounded, 'Home', () => Navigator.pop(context)),
            _drawerItem(context, Icons.people_alt_rounded, 'Employee Management', () {
              Navigator.pop(context);
              Navigator.pushNamed(context, '/employees-new');
            }),
            _drawerItem(context, Icons.fact_check_rounded, 'Attendance', () {
              Navigator.pop(context);
              Navigator.pushNamed(context, '/attendance');
            }),
            _drawerItem(context, Icons.beach_access_rounded, 'Leave Management', () {
              Navigator.pop(context);
              Navigator.pushNamed(context, '/leaves');
            }),
            _drawerItem(context, Icons.notifications_none_rounded, 'Notifications', () {
              Navigator.pop(context);
              Navigator.pushNamed(context, '/notifications');
            }),
            const Spacer(),
            const Divider(),
            ListTile(
              leading: const Icon(Icons.logout_rounded, color: MaanColors.accentRed),
              title: const Text('Sign Out', style: TextStyle(color: MaanColors.navy, fontWeight: FontWeight.w600)),
              onTap: () async {
                try {
                  await StorageService.clearAll();
                } catch (_) {}
                if (context.mounted) {
                  Navigator.pushNamedAndRemoveUntil(context, '/signin', (_) => false);
                }
              },
            ),
          ],
        ),
      ),
    );
  }

  Widget _drawerItem(BuildContext context, IconData icon, String label, VoidCallback onTap) {
    return ListTile(
      leading: Icon(icon, color: MaanColors.accentIndigo),
      title: Text(label, style: const TextStyle(color: MaanColors.navy, fontSize: 14.5, fontWeight: FontWeight.w600)),
      onTap: onTap,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      hoverColor: const Color(0xFFEEF2FD),
    );
  }
}
