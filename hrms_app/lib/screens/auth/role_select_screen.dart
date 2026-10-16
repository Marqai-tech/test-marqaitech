import 'package:flutter/material.dart';
import '../../config/maan_theme.dart';

/// Role selection — matches design screenshot #2 ("Select Your Role").
class RoleSelectScreen extends StatefulWidget {
  const RoleSelectScreen({super.key});

  @override
  State<RoleSelectScreen> createState() => _RoleSelectScreenState();
}

class _RoleSelectScreenState extends State<RoleSelectScreen> {
  void _choose(String role) {
    Navigator.pushNamed(context, '/signin', arguments: role);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(gradient: MaanColors.roleGradient),
        child: SafeArea(
          child: SingleChildScrollView(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 28),
              child: Column(
                children: [
                  const SizedBox(height: 8),
                  const MaanLogoMark(size: 84),
                  const SizedBox(height: 34),
                  SizedBox(
                    width: 260,
                    height: 190,
                    child: Stack(
                      alignment: Alignment.center,
                      children: [
                        _avatar(const Color(0xFFF3E8FA), Icons.face_3, const Color(0xFF7C6FF0), const Offset(-58, -18), 86),
                        _avatar(const Color(0xFFFDE7EF), Icons.face_6, const Color(0xFFF278B0), const Offset(56, -14), 92),
                        _avatar(const Color(0xFFE8F4FD), Icons.face_2, const Color(0xFF38BDF8), const Offset(-4, 34), 84),
                        _avatar(const Color(0xFFE9E6FD), Icons.face, const Color(0xFF7C6FF0), const Offset(2, -62), 78),
                        _avatar(const Color(0xFFE6F9F2), Icons.face_4, const Color(0xFF34C38F), const Offset(-62, 40), 74),
                      ],
                    ),
                  ),
                  const SizedBox(height: 30),
                  const Text('Select Your Role', style: TextStyle(fontSize: 21, fontWeight: FontWeight.w800, color: MaanColors.navy)),
                  const SizedBox(height: 22),
                  _roleCard(
                    icon: Icons.business_center,
                    iconColor: MaanColors.accentIndigo,
                    iconBg: const Color(0xFFE9E6FD),
                    title: 'Business Owner / Admin / HR',
                    subtitle: 'Register your company & start attendance',
                    onTap: () => _choose('admin'),
                  ),
                  const SizedBox(height: 14),
                  _roleCard(
                    icon: Icons.person_outline,
                    iconColor: const Color(0xFF4A90D9),
                    iconBg: const Color(0xFFE8F4FD),
                    title: 'Employee',
                    subtitle: 'Register and start marking your attendance',
                    onTap: () => _choose('employee'),
                  ),
                  const SizedBox(height: 30),
                  Text(
                    'One workspace for people, process & technology.',
                    textAlign: TextAlign.center,
                    style: MaanText.caption.copyWith(fontSize: 12.5),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _avatar(Color bg, IconData icon, Color tint, Offset offset, double size) {
    return Transform.translate(
      offset: offset,
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: bg,
          border: Border.all(color: Colors.white, width: 4),
          boxShadow: [BoxShadow(color: Colors.black.withOpacity(.06), blurRadius: 14, offset: const Offset(0, 6))],
        ),
        child: Icon(icon, size: size * .55, color: tint),
      ),
    );
  }

  Widget _roleCard({
    required IconData icon,
    required Color iconColor,
    required Color iconBg,
    required String title,
    required String subtitle,
    required VoidCallback onTap,
  }) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(14),
      elevation: 0,
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: Colors.white),
            boxShadow: [BoxShadow(color: Colors.black.withOpacity(.07), blurRadius: 16, offset: const Offset(0, 8))],
          ),
          child: Row(
            children: [
              Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(color: iconBg, borderRadius: BorderRadius.circular(11)),
                child: Icon(icon, color: iconColor, size: 26),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: MaanColors.navy)),
                    const SizedBox(height: 3),
                    Text(subtitle, style: const TextStyle(fontSize: 12.5, color: MaanColors.body)),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right, color: MaanColors.faint),
            ],
          ),
        ),
      ),
    );
  }
}
