import 'package:flutter/material.dart';

/// MAAN-style design tokens for the new 3Boxes HRMS mobile design
/// (matched to the approved screenshot set, Oct 2026).
///
/// Task 142 — palette re-tuned to the SmartHR mobile template:
///  · royal-blue primary  #3A57C4 (was #5B7FE8)
///  · violet accent       #6C4FD6
///  · hero gradient       #3A57C4 → #6C4FD6 → #8A5CF6
///  · warmer, more colourful tile accents (orange #FF9B44 joins the set)
class MaanColors {
  static const Color primary = Color(0xFF3A57C4); // header / buttons royal blue
  static const Color primaryDark = Color(0xFF2E45A0);
  static const Color violet = Color(0xFF6C4FD6); // SmartHR secondary accent
  static const Color violetLight = Color(0xFF8A5CF6);
  static const Color navy = Color(0xFF232D42); // headings
  static const Color body = Color(0xFF6B7280); // body text
  static const Color faint = Color(0xFF9CA3AF);
  static const Color pageBg = Color(0xFFFAFAFA); // SmartHR body background
  static const Color cardBg = Colors.white;
  static const Color line = Color(0xFFE8EAF2);

  /// SmartHR hero gradient — app bars, banners, login headers.
  static const LinearGradient heroGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFF3A57C4), Color(0xFF6C4FD6), Color(0xFF8A5CF6)],
    stops: [0.0, 0.65, 1.0],
  );

  /// AI / highlights gradient (SmartHR "AI Copilot" style).
  static const LinearGradient aiGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFF4338CA), Color(0xFF6366F1), Color(0xFF8B5CF6)],
  );

  // tile accents — brighter, more colourful SmartHR-adjacent set
  static const Color accentPurple = Color(0xFF6C4FD6);
  static const Color accentPink = Color(0xFFF278B0);
  static const Color accentCyan = Color(0xFF009EFB); // SmartHR info blue
  static const Color accentGreen = Color(0xFF10B981); // SmartHR success
  static const Color accentOrange = Color(0xFFFF9B44); // SmartHR orange
  static const Color accentRed = Color(0xFFEF4444); // SmartHR danger
  static const Color accentIndigo = Color(0xFF6C8FEF);
  static const Color accentGold = Color(0xFFFFC107); // SmartHR warning

  static const LinearGradient roleGradient = LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [Color(0xFFE6E4FA), Color(0xFFF3E8FA), Colors.white],
  );
}

class MaanText {
  static const TextStyle h1 = TextStyle(
      fontSize: 26, fontWeight: FontWeight.w700, color: MaanColors.navy, height: 1.25);
  static const TextStyle h2 = TextStyle(
      fontSize: 20, fontWeight: FontWeight.w700, color: MaanColors.navy);
  static const TextStyle title = TextStyle(
      fontSize: 15.5, fontWeight: FontWeight.w600, color: MaanColors.navy);
  static const TextStyle body =
      TextStyle(fontSize: 13.5, color: MaanColors.body, height: 1.5);
  static const TextStyle hint = TextStyle(fontSize: 13.5, color: MaanColors.faint);
  static const TextStyle caption = TextStyle(fontSize: 11.5, color: MaanColors.faint);
}

/// Floating-label field used across the designed forms
/// (label sits on the border like the screenshots).
class MaanField extends StatelessWidget {
  final String label;
  final String? hint;
  final Widget? suffix;
  final Widget? prefix;
  final TextEditingController? controller;
  final bool obscure;
  final TextInputType? keyboard;
  final VoidCallback? onTap;
  final bool readOnly;
  final int maxLines;
  final FocusNode? focusNode;
  final TextCapitalization textCapitalization;
  final String? Function(String?)? validator;
  final ValueChanged<String>? onChanged;

  const MaanField({
    super.key,
    required this.label,
    this.hint,
    this.suffix,
    this.prefix,
    this.controller,
    this.obscure = false,
    this.keyboard,
    this.onTap,
    this.readOnly = false,
    this.maxLines = 1,
    this.focusNode,
    this.textCapitalization = TextCapitalization.none,
    this.validator,
    this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: controller,
      focusNode: focusNode,
      obscureText: obscure,
      keyboardType: keyboard,
      textCapitalization: textCapitalization,
      readOnly: readOnly,
      onTap: onTap,
      maxLines: maxLines,
      validator: validator,
      onChanged: onChanged,
      style: const TextStyle(fontSize: 14.5, color: MaanColors.navy),
      decoration: InputDecoration(
        labelText: label,
        hintText: hint,
        floatingLabelStyle: const TextStyle(color: MaanColors.navy, fontSize: 13),
        labelStyle: const TextStyle(color: MaanColors.faint, fontSize: 13.5),
        hintStyle: MaanText.hint,
        prefixIcon: prefix,
        suffixIcon: suffix,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        filled: true,
        fillColor: Colors.white,
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: MaanColors.line),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: MaanColors.primary, width: 1.4),
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: MaanColors.line),
        ),
      ),
    );
  }
}

/// Rounded white row with a colored accent bar, icon tile, label and chevron —
/// matches the "Client Management / Add Employee" rows in the designs.
class MaanListRow extends StatelessWidget {
  final String label;
  final IconData icon;
  final Color accent;
  final Color iconBg;
  final VoidCallback onTap;
  final Widget? trailing;
  final int badge;

  const MaanListRow({
    super.key,
    required this.label,
    required this.icon,
    required this.accent,
    required this.iconBg,
    required this.onTap,
    this.trailing,
    this.badge = 0,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: MaanColors.line),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.04),
                blurRadius: 10,
                offset: const Offset(0, 3),
              ),
            ],
          ),
          child: Row(
            children: [
              Container(width: 4, height: 38, decoration: BoxDecoration(color: accent, borderRadius: BorderRadius.circular(3))),
              const SizedBox(width: 12),
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(color: iconBg.withOpacity(.18), borderRadius: BorderRadius.circular(10)),
                child: Icon(icon, color: accent, size: 22),
              ),
              const SizedBox(width: 12),
              Expanded(child: Text(label, style: MaanText.title)),
              if (badge > 0)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                  decoration: BoxDecoration(color: accent, borderRadius: BorderRadius.circular(10)),
                  child: Text('$badge', style: const TextStyle(color: Colors.white, fontSize: 10.5, fontWeight: FontWeight.w700)),
                ),
              if (trailing != null)
                trailing!
              else ...[
                const SizedBox(width: 6),
                const Icon(Icons.chevron_right, color: MaanColors.faint, size: 22),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Blue rounded app header used on all inner pages.
class MaanHeader extends StatelessWidget {
  final String title;
  final VoidCallback? onBack;
  final VoidCallback? onMenu;
  final int notificationBadge;
  final Widget? trailing;

  const MaanHeader({
    super.key,
    required this.title,
    this.onBack,
    this.onMenu,
    this.notificationBadge = 0,
    this.trailing,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      color: MaanColors.primary,
      padding: EdgeInsets.only(top: MediaQuery.of(context).padding.top + 8, bottom: 26, left: 8, right: 16),
      child: Row(
        children: [
          if (onBack != null)
            IconButton(
              onPressed: onBack,
              icon: const Icon(Icons.arrow_back, color: Colors.white, size: 24),
            )
          else if (onMenu != null)
            Padding(
              padding: const EdgeInsets.only(left: 4, right: 8),
              child: Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(color: Colors.white.withOpacity(.18), borderRadius: BorderRadius.circular(10)),
                child: IconButton(
                  onPressed: onMenu,
                  icon: const Icon(Icons.menu, color: Colors.white, size: 22),
                  padding: EdgeInsets.zero,
                ),
              ),
            ),
          if (onBack != null) const SizedBox(width: 6),
          Expanded(
            child: Text(
              title,
              style: const TextStyle(color: Colors.white, fontSize: 19, fontWeight: FontWeight.w700, height: 1.25),
            ),
          ),
          if (trailing != null) trailing!,
          Stack(
            children: [
              // Task 128 — the bell is DYNAMIC: opens the notifications center.
              IconButton(
                onPressed: () => Navigator.pushNamed(context, '/notifications'),
                icon: const Icon(Icons.notifications_none, color: Colors.white, size: 26),
              ),
              if (notificationBadge > 0)
                Positioned(
                  right: 8,
                  top: 8,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                    decoration: BoxDecoration(color: Colors.orange, borderRadius: BorderRadius.circular(9)),
                    child: Text('$notificationBadge', style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w700)),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Standard inner page: blue header + white rounded sheet body.
class MaanPage extends StatelessWidget {
  final String title;
  final Widget body;
  final VoidCallback? onBack;
  final Widget? fab;
  final int notificationBadge;

  const MaanPage({
    super.key,
    required this.title,
    required this.body,
    this.onBack,
    this.fab,
    this.notificationBadge = 0,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: MaanColors.pageBg,
      body: Column(
        children: [
          MaanHeader(title: title, onBack: onBack ?? () => Navigator.maybePop(context), notificationBadge: notificationBadge),
          Expanded(
            child: Container(
              width: double.infinity,
              decoration: const BoxDecoration(
                color: MaanColors.pageBg,
                borderRadius: BorderRadius.only(topLeft: Radius.circular(26), topRight: Radius.circular(26)),
              ),
              transform: Matrix4.translationValues(0, -16, 0),
              child: body,
            ),
          ),
        ],
      ),
      floatingActionButton: fab,
    );
  }
}

/// 3 Boxes HRMS brand mark — official green cubes logo + wordmark.
class MaanLogoMark extends StatelessWidget {
  final double size;
  const MaanLogoMark({super.key, this.size = 72});

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(size * 0.26),
            border: Border.all(color: const Color(0xFF16A34A).withOpacity(.18), width: 1),
            boxShadow: [BoxShadow(color: const Color(0xFF16A34A).withOpacity(.25), blurRadius: 18, offset: const Offset(0, 8))],
          ),
          padding: EdgeInsets.all(size * 0.06),
          child: Image.asset('assets/logos/logo-cubes.png', fit: BoxFit.contain),
        ),
        const SizedBox(height: 10),
        RichText(
          text: const TextSpan(
            children: [
              TextSpan(text: '3 Boxes ', style: TextStyle(color: Color(0xFF15803D), fontWeight: FontWeight.w800, letterSpacing: 1.2)),
              TextSpan(text: 'HRMS', style: TextStyle(color: Color(0xFF22C55E), fontWeight: FontWeight.w500, letterSpacing: 1.2)),
            ],
            style: TextStyle(fontSize: 16),
          ),
        ),
      ],
    );
  }
}
