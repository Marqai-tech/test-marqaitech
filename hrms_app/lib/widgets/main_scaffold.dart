import 'package:flutter/material.dart';
import '../config/maan_theme.dart';

/// Task 112 — app-wide bottom navigation matching the approved designs
/// (#03/#16/#19). Task 141 — updated to the newest home design (image #3):
/// Home · Chat · Attendance · Profile. Directory and Settings stay reachable
/// from the drawer and Quick Links; the indexes used by the embedded screens
/// are 0 (Home) and 3 (Profile).
///
/// Task 156 — PhonePe-style centre dock: the row is always balanced
/// [2 left] + raised violet AI Assistant circle + [2 right] so the AI button
/// is perfectly centred for every role, mirroring the web app's mobile
/// footer. The raised 56dp violet gradient circle (white ring + glow) opens
/// the NATIVE AI Assistant chat screen (route /ai-assistant), which calls the
/// same /api/ai-chat endpoint as the web bot.
class MainBottomNav extends StatelessWidget {
  final int currentIndex;
  const MainBottomNav({super.key, required this.currentIndex});

  static const _leftItems = [
    ('/home-new', Icons.home_outlined, Icons.home_rounded, 'Home'),
    ('/chat', Icons.chat_bubble_outline_rounded, Icons.chat_bubble_rounded, 'Chat'),
  ];
  static const _rightItems = [
    ('/attendance-new', Icons.fact_check_outlined, Icons.fact_check_rounded, 'Attendance'),
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
        child: SizedBox(
          height: 64,
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (final item in _leftItems)
                Expanded(child: _navItem(context, item, _routeIndex(item.$1) == currentIndex)),
              // Raised AI Assistant centre dock (PhonePe style).
              SizedBox(
                width: 78,
                child: _aiDock(context),
              ),
              for (final item in _rightItems)
                Expanded(child: _navItem(context, item, _routeIndex(item.$1) == currentIndex)),
            ],
          ),
        ),
      ),
    );
  }

  /// Legacy index mapping kept for the embedded screens: 0 = Home, 3 = Profile.
  static int _routeIndex(String route) {
    switch (route) {
      case '/home-new':
        return 0;
      case '/chat':
        return 1;
      case '/attendance-new':
        return 2;
      case '/profile':
        return 3;
      default:
        return -1;
    }
  }

  Widget _navItem(BuildContext context, (String, IconData, IconData, String) item, bool active) {
    final (route, icon, activeIcon, label) = item;
    final color = active ? MaanColors.primary : MaanColors.faint;
    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: active ? null : () => Navigator.pushNamed(context, route),
      child: Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Icon(active ? activeIcon : icon, color: color, size: 23),
            const SizedBox(height: 3),
            Text(label, style: TextStyle(fontSize: 10.5, fontWeight: active ? FontWeight.w700 : FontWeight.w500, color: color)),
          ]),
        ),
      ),
    );
  }

  /// The raised violet AI button: 56dp gradient circle, white ring, glow,
  /// "AI Assistant" caption underneath — lifted 24dp above the bar top so it
  /// overlaps the body exactly like the web footer / PhonePe centre QR.
  /// Full-area GestureDetector keeps the whole 78dp slot tappable.
  Widget _aiDock(BuildContext context) {
    const onTap = _openAiAssistant;
    return Stack(
      clipBehavior: Clip.none,
      children: [
        Positioned.fill(
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: () => onTap(context),
          ),
        ),
        Positioned(
          top: -24,
          left: 0,
          right: 0,
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: () => onTap(context),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 56,
                  height: 56,
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [Color(0xFF8B5CF6), Color(0xFFA855F7), Color(0xFFD946EF)],
                    ),
                    shape: BoxShape.circle,
                    border: Border.all(color: Colors.white, width: 3),
                    boxShadow: [
                      BoxShadow(
                        color: const Color(0xFF8B5CF6).withOpacity(.55),
                        blurRadius: 16,
                        offset: const Offset(0, 4),
                      ),
                    ],
                  ),
                  child: const Icon(Icons.smart_toy_rounded, color: Colors.white, size: 26),
                ),
                const SizedBox(height: 3),
                const Text(
                  'AI Assistant',
                  style: TextStyle(
                    fontSize: 9.5,
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF7C3AED),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  static void _openAiAssistant(BuildContext context) =>
      Navigator.pushNamed(context, '/ai-assistant');
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
