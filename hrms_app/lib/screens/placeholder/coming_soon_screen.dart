import 'package:flutter/material.dart';
import '../../config/maan_theme.dart';

/// Polished placeholder for modules that ship in the next app release
/// (Expenses, Payroll, Files, Clients, NOC, Notice, Award, Overtime…).
class ComingSoonScreen extends StatelessWidget {
  final String module;
  const ComingSoonScreen({super.key, required this.module});

  @override
  Widget build(BuildContext context) {
    return MaanPage(
      title: module,
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(30),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 110,
                height: 110,
                decoration: BoxDecoration(
                  color: const Color(0xFFE9E6FD),
                  borderRadius: BorderRadius.circular(28),
                  boxShadow: [BoxShadow(color: MaanColors.accentPurple.withOpacity(.15), blurRadius: 20, offset: const Offset(0, 10))],
                ),
                child: const Icon(Icons.rocket_launch_rounded, size: 52, color: MaanColors.accentPurple),
              ),
              const SizedBox(height: 24),
              Text(module, style: MaanText.h2, textAlign: TextAlign.center),
              const SizedBox(height: 10),
              Text(
                'This module is being crafted for mobile.\nManage it on the web workspace in the meantime.',
                style: MaanText.body,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 26),
              OutlinedButton(
                onPressed: () => Navigator.maybePop(context),
                style: OutlinedButton.styleFrom(
                  side: const BorderSide(color: MaanColors.primary),
                  padding: const EdgeInsets.symmetric(horizontal: 26, vertical: 13),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                child: const Text('Back', style: TextStyle(color: MaanColors.primary, fontWeight: FontWeight.w700)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
