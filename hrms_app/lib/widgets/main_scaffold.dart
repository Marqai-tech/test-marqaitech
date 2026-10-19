import 'package:flutter/material.dart';
import '../config/maan_theme.dart';

/// Task 112 — app-wide bottom navigation matching the approved designs
/// (#03/#16/#19): Home · Directory · Settings · Profile, active tab in the
/// primary color with the filled icon. Each main screen embeds this via
/// [MainTabScaffold] so the tabs always navigate by route name.
class MainBottomNav extends StatelessWidget {
  final int currentIndex;
  const MainBottomNav({super.key, required this.currentIndex});

  static const _items = [
    ('/home-new', Icons.home_outlined, Icons.home_rounded, 'Home'),
    ('/directory', Icons.people_outline_rounded, Icons.people_rounded, 'Directory'),
    ('/settings', Icons.settings_outlined, Icons.settings_rounded, 'Settings'),
    ('/profile', Icons.person_outline_rounded, Icons.person_rounded, 'Profile'),
  ];

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(.06), blurRadius: 14, offset: const Offset(0, -3))],
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(8, 6, 8, 6),
          child: Row(
            children: [
              for (var i = 0; i < _items.length; i++)
                Expanded(child: _navItem(context, _items[i], i == currentIndex)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _navItem(BuildContext context, (String, IconData, IconData, String) item, bool active) {
    final (route, icon, activeIcon, label) = item;
    final color = active ? MaanColors.primary : MaanColors.faint;
    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: active ? null : () => Navigator.pushNamed(context, route),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Icon(active ? activeIcon : icon, color: color, size: 23),
          const SizedBox(height: 3),
          Text(label, style: TextStyle(fontSize: 10.5, fontWeight: active ? FontWeight.w700 : FontWeight.w500, color: color)),
        ]),
      ),
    );
  }
}

/// Convenience wrapper: standard page + bottom nav pinned at the bottom.
class MainTabScaffold extends StatelessWidget {
  final int currentIndex;
  final Widget body;
  final Widget? drawer;
  final Widget? fab;
  final Color backgroundColor;

  const MainTabScaffold({
    super.key,
    required this.currentIndex,
    required this.body,
    this.drawer,
    this.fab,
    this.backgroundColor = MaanColors.pageBg,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: backgroundColor,
      drawer: drawer,
      floatingActionButton: fab,
      bottomNavigationBar: MainBottomNav(currentIndex: currentIndex),
      body: body,
    );
  }
}
