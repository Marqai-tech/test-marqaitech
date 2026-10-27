import 'dart:convert';
import 'package:flutter/material.dart';
import '../../config/maan_theme.dart';
import '../../config/api_config.dart';

/// Universal avatar: renders the signed-in user's (or employee's) photo from
/// every URL shape the 3Boxes APIs produce —
///   • `data:image/...;base64,...`   (LIVE tenant /api/auth/me avatars)
///   • `https://…`                   (absolute)
///   • `/api/employees/…/avatar`     (relative — prefixed with the workspace)
/// and falls back to initials when empty/broken (Task 107).
class MaanAvatar extends StatelessWidget {
  final String? avatar;
  final String name;
  final double radius;
  final Color bgColor;
  final Color textColor;

  const MaanAvatar({
    super.key,
    required this.avatar,
    required this.name,
    this.radius = 22,
    this.bgColor = MaanColors.primary,
    this.textColor = Colors.white,
  });

  String get _initials {
    final parts = name.trim().split(' ').where((p) => p.isNotEmpty).toList();
    if (parts.length >= 2) return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
    return name.isNotEmpty ? name[0].toUpperCase() : '?';
  }

  /// Task 113 — photo-less records get a DETERMINISTIC pleasant color per
  /// person (8-color palette hashed from the name), so directories/profiles
  /// look polished instead of washed-out when no photo is set. The same
  /// person always gets the same color across every screen.
  static const _palette = [
    Color(0xFF5B7FE8), // blue (brand)
    Color(0xFF7C6FF0), // violet
    Color(0xFF0EA5A6), // teal
    Color(0xFFE8863C), // orange
    Color(0xFFD4547E), // rose
    Color(0xFF2FA36B), // green
    Color(0xFF8A63D2), // purple
    Color(0xFF3B9DD4), // sky
  ];

  Color get _autoColor {
    final clean = name.trim().toLowerCase();
    var h = 0;
    for (var i = 0; i < clean.length; i++) {
      h = (h * 31 + clean.codeUnitAt(i)) & 0x7fffffff;
    }
    return _palette[h % _palette.length];
  }

  Widget _fallback({Color? fg}) {
    // Solid auto-color circle + white initials (Task 113 upgrade).
    final fill = _autoColor;
    return Container(
      width: radius * 2,
      height: radius * 2,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [fill, fill.withOpacity(.78)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        shape: BoxShape.circle,
      ),
      child: Text(
        _initials,
        style: TextStyle(fontSize: radius * 0.72, fontWeight: FontWeight.w800, color: Colors.white),
      ),
    );
  }

  ImageProvider? _provider() {
    final a = avatar?.trim() ?? '';
    if (a.isEmpty) return null;
    if (a.startsWith('data:')) {
      final idx = a.indexOf('base64,');
      if (idx < 0) return null;
      try {
        return MemoryImage(base64Decode(a.substring(idx + 7)));
      } catch (_) {
        return null;
      }
    }
    if (a.startsWith('http://') || a.startsWith('https://')) return NetworkImage(a);
    if (a.startsWith('/')) return NetworkImage('${ApiConfig.baseUrl}$a');
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final img = _provider();
    if (img == null) return _fallback();
    return CircleAvatar(
      radius: radius,
      backgroundImage: img,
      backgroundColor: bgColor.withOpacity(.16),
      onBackgroundImageError: (_, __) {},
    );
  }
}
