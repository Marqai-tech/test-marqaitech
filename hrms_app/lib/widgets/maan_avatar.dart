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

  Widget _fallback({Color? fg}) => Container(
        width: radius * 2,
        height: radius * 2,
        alignment: Alignment.center,
        decoration: BoxDecoration(color: bgColor.withOpacity(.16), shape: BoxShape.circle),
        child: Text(
          _initials,
          style: TextStyle(fontSize: radius * 0.72, fontWeight: FontWeight.w800, color: fg ?? textColor),
        ),
      );

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
