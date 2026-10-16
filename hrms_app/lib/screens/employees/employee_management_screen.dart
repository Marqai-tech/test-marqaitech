import 'package:flutter/material.dart';
import '../../config/maan_theme.dart';
import 'employee_empty_screen.dart';

/// Employee Management — matches design screenshot #5
/// (Add Employee / Time Attendance / Leave Management / Overtime / Salary / Reference).
class EmployeeManagementScreen extends StatelessWidget {
  const EmployeeManagementScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return MaanPage(
      title: 'Employee Management',
      body: Padding(
        padding: const EdgeInsets.fromLTRB(16, 26, 16, 24),
        child: Column(
          children: [
            MaanListRow(
              label: 'Add Employee',
              icon: Icons.person_add_alt_1_rounded,
              accent: MaanColors.accentPurple,
              iconBg: const Color(0xFFE9E6FD),
              onTap: () => Navigator.pushNamed(context, '/employee-empty'),
            ),
            const SizedBox(height: 14),
            MaanListRow(
              label: 'Time Attendance',
              icon: Icons.fact_check_rounded,
              accent: MaanColors.accentPink,
              iconBg: const Color(0xFFFDE7EF),
              onTap: () => Navigator.pushNamed(context, '/attendance'),
            ),
            const SizedBox(height: 14),
            MaanListRow(
              label: 'Leave Management',
              icon: Icons.beach_access_rounded,
              accent: MaanColors.accentCyan,
              iconBg: const Color(0xFFE8F4FD),
              onTap: () => Navigator.pushNamed(context, '/leaves'),
            ),
            const SizedBox(height: 14),
            MaanListRow(
              label: 'Employees Overtime',
              icon: Icons.more_time_rounded,
              accent: MaanColors.accentOrange,
              iconBg: const Color(0xFFFDF1DE),
              onTap: () => _snack(context, 'Overtime approvals arrive with the next app release.'),
            ),
            const SizedBox(height: 14),
            MaanListRow(
              label: 'Salary Statement',
              icon: Icons.request_page_rounded,
              accent: MaanColors.accentPink,
              iconBg: const Color(0xFFFDE7EF),
              onTap: () => _snack(context, 'Salary statements arrive with the next app release.'),
            ),
            const SizedBox(height: 14),
            MaanListRow(
              label: 'Reference',
              icon: Icons.group_add_rounded,
              accent: MaanColors.accentGreen,
              iconBg: const Color(0xFFE6F9F2),
              onTap: () => _snack(context, 'Employee references arrive with the next app release.'),
            ),
          ],
        ),
      ),
    );
  }

  void _snack(BuildContext context, String message) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }
}
