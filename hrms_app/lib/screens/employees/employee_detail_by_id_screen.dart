import 'package:flutter/material.dart';

import '../../config/maan_theme.dart';
import '../../models/employee.dart';
import '../../providers/employee_provider.dart';
import '../employees/employee_detail_screen.dart';
import 'package:provider/provider.dart';

/// Task 110 — employee detail loaded BY ID.
///
/// The module screen (Employee Management) navigates with the employee ID
/// string; the legacy route handler cast arguments to EmployeeModel and
/// threw a TypeError on every tap. This screen resolves the ID through the
/// API (loading + friendly error states included) and then renders the
/// shared detail view.
class EmployeeDetailByIdScreen extends StatefulWidget {
  final String employeeId;
  const EmployeeDetailByIdScreen({super.key, required this.employeeId});

  @override
  State<EmployeeDetailByIdScreen> createState() => _EmployeeDetailByIdScreenState();
}

class _EmployeeDetailByIdScreenState extends State<EmployeeDetailByIdScreen> {
  EmployeeModel? _employee;
  String? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final emp = await context.read<EmployeeProvider>().getEmployeeDetail(widget.employeeId);
      if (!mounted) return;
      if (emp == null) {
        setState(() { _error = 'Could not load this employee. Pull down to retry.'; _loading = false; });
      } else {
        setState(() { _employee = emp; _loading = false; });
      }
    } catch (e) {
      if (!mounted) return;
      setState(() { _error = e.toString().replaceAll('Exception: ', ''); _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return Scaffold(
        backgroundColor: MaanColors.pageBg,
        appBar: AppBar(title: const Text('Employee'), backgroundColor: Colors.white, foregroundColor: MaanColors.navy, elevation: 0.5),
        body: const Center(child: CircularProgressIndicator(color: MaanColors.primary)),
      );
    }
    if (_error != null || _employee == null) {
      return Scaffold(
        backgroundColor: MaanColors.pageBg,
        appBar: AppBar(title: const Text('Employee'), backgroundColor: Colors.white, foregroundColor: MaanColors.navy, elevation: 0.5),
        body: Center(
          child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
            const Icon(Icons.person_search_rounded, size: 54, color: MaanColors.faint),
            const SizedBox(height: 12),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 28),
              child: Text(_error ?? 'Employee not found', style: MaanText.body, textAlign: TextAlign.center),
            ),
            const SizedBox(height: 14),
            FilledButton(
              onPressed: _load,
              style: FilledButton.styleFrom(backgroundColor: MaanColors.primary),
              child: const Text('Retry'),
            ),
          ]),
        ),
      );
    }
    return EmployeeDetailScreen(employee: _employee!);
  }
}
