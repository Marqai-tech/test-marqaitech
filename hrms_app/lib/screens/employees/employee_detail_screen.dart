import 'package:flutter/material.dart';
import '../../config/maan_theme.dart';
import '../../models/employee.dart';
import '../../widgets/maan_avatar.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

/// Task 112 — employee detail restyled to design #17 (Employee Details):
/// white rounded card with ringed avatar + name + designation, followed by
/// an icon info list (phone, mail, designation, employee ID, status) and
/// the full employment fields (web-parity set from Task 107/111).
class EmployeeDetailScreen extends StatelessWidget {
  final EmployeeModel employee;

  const EmployeeDetailScreen({super.key, required this.employee});

  Future<void> _launch(String url) async {
    try { await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication); } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final name = employee.fullName;
    final active = (employee.status ?? 'active').toLowerCase() == 'active';
    // Task 128 — terminated/resigned employees must show "Terminated"/"Resigned"
    // (red), never a stale employeeStatus like "Probation".
    final statusText = employee.displayStatus;
    final statusColor = employee.isTerminated || employee.isResigned
        ? MaanColors.accentRed
        : active
            ? MaanColors.accentGreen
            : MaanColors.accentOrange;
    return Scaffold(
      backgroundColor: MaanColors.pageBg,
      appBar: AppBar(
        backgroundColor: MaanColors.primary,
        foregroundColor: Colors.white,
        title: const Text('Employee Details', style: TextStyle(fontWeight: FontWeight.w800)),
        elevation: 0,
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // ── Identity card ──
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(vertical: 24, horizontal: 16),
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(20), border: Border.all(color: MaanColors.line)),
            child: Column(
              children: [
                Container(
                  padding: const EdgeInsets.all(3),
                  decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: MaanColors.accentOrange, width: 2.4)),
                  child: MaanAvatar(avatar: employee.avatar, name: name, radius: 40, bgColor: MaanColors.primary.withOpacity(.12), textColor: MaanColors.primary),
                ),
                const SizedBox(height: 12),
                Text(name, style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w800, color: MaanColors.navy)),
                if (employee.designation?.isNotEmpty == true)
                  Text(employee.designation!, style: MaanText.body.copyWith(fontSize: 13)),
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                  decoration: BoxDecoration(
                    color: statusColor.withOpacity(.12),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    statusText,
                    style: TextStyle(color: statusColor, fontSize: 11.5, fontWeight: FontWeight.w800),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          // ── Info list (design #17) ──
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(20), border: Border.all(color: MaanColors.line)),
            child: Column(children: [
              if (employee.phone?.isNotEmpty == true)
                _tile(Icons.phone_rounded, 'phone', employee.phone!, trailing: IconButton(
                  icon: const Icon(Icons.call_rounded, color: MaanColors.accentGreen, size: 20),
                  onPressed: () => _launch('tel:${employee.phone}'),
                )),
              if (employee.email?.isNotEmpty == true)
                _tile(Icons.mail_rounded, 'mail', employee.email!, trailing: IconButton(
                  icon: const Icon(Icons.send_rounded, color: MaanColors.accentIndigo, size: 20),
                  onPressed: () => _launch('mailto:${employee.email}'),
                )),
              if (employee.designation?.isNotEmpty == true)
                _tile(Icons.work_rounded, 'designation', employee.designation!),
              if (employee.employeeCode?.isNotEmpty == true)
                _tile(Icons.badge_rounded, 'Employee ID', employee.employeeCode!),
              if (employee.department?.isNotEmpty == true)
                _tile(Icons.corporate_fare_rounded, 'Department', employee.department!),
              if (employee.branch?.isNotEmpty == true)
                _tile(Icons.location_city_rounded, 'Branch', employee.branch!),
              if (employee.reportingManager?.isNotEmpty == true)
                _tile(Icons.supervisor_account_rounded, 'Reporting Manager', employee.reportingManager!),
              if (employee.gender?.isNotEmpty == true)
                _tile(Icons.wc_rounded, 'Gender', employee.gender!),
              if (employee.joinDate != null)
                _tile(Icons.calendar_month_rounded, 'Join Date', DateFormat('dd-MMM-yyyy').format(employee.joinDate!)),
              // Task 136 — REAL birth date (birthday wishes fire on this day)
              if (employee.originalBirthday != null)
                _tile(Icons.cake_rounded, 'Original Birthday', DateFormat('dd-MMM-yyyy').format(employee.originalBirthday!)),
              _tile(Icons.verified_rounded, 'Status', statusText),
            ]),
          ),
          const SizedBox(height: 20),
        ],
      ),
    );
  }

  Widget _tile(IconData icon, String label, String value, {Widget? trailing}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 9, horizontal: 10),
      child: Row(
        children: [
          Container(
            width: 36, height: 36,
            decoration: BoxDecoration(color: MaanColors.primary.withOpacity(.09), borderRadius: BorderRadius.circular(10)),
            child: Icon(icon, color: MaanColors.primary, size: 18),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(label, style: MaanText.caption.copyWith(fontSize: 10.5)),
              const SizedBox(height: 1),
              Text(value, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: MaanColors.navy)),
            ]),
          ),
          if (trailing != null) trailing,
        ],
      ),
    );
  }
}
