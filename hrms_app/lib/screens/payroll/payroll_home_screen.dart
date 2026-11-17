import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';
import '../../config/maan_theme.dart';
import '../../models/payroll.dart';
import '../../providers/auth_provider.dart';
import '../../providers/payroll_provider.dart';
import '../../services/api_service.dart';

/// Payroll module — live data from GET /api/payroll, payslip detail sheet.
/// Task 127: month / employee / status filters (Payroll Runs + Payslips) and
/// a full-component payslip sheet (zero-value rows stay visible so every
/// employee can see their complete earnings & deductions breakdown).
class PayrollHomeScreen extends StatelessWidget {
  const PayrollHomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => PayrollProvider()..fetchPayrolls(refresh: true),
      child: const _PayrollBody(),
    );
  }
}

class _PayrollBody extends StatefulWidget {
  const _PayrollBody();

  @override
  State<_PayrollBody> createState() => _PayrollBodyState();
}

class _PayrollBodyState extends State<_PayrollBody> {
  // Filter state — 'all' disables the filter.
  String _monthKey = 'all'; // 'all' | 'YYYY-MM'
  String _employeeId = 'all'; // 'all' | employee id
  String _status = 'all'; // 'all' | paid | processed | approved | draft

  Color _statusColor(String s) {
    switch (s) {
      case 'paid':
        return MaanColors.accentGreen;
      case 'processed':
        return MaanColors.primary;
      case 'approved':
        return MaanColors.accentPurple;
      default:
        return MaanColors.accentOrange; // draft
    }
  }

  List<PayrollModel> _applyFilters(List<PayrollModel> rows) {
    return rows.where((p) {
      if (_monthKey != 'all' &&
          '${p.year}-${p.month.toString().padLeft(2, '0')}' != _monthKey) {
        return false;
      }
      if (_employeeId != 'all' && p.employeeId != _employeeId) return false;
      if (_status != 'all' && p.status != _status) return false;
      return true;
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<PayrollProvider>();
    final filtered = _applyFilters(provider.payrolls);
    return Scaffold(
      backgroundColor: MaanColors.pageBg,
      body: Column(
        children: [
          MaanHeader(
            title: 'Payroll Management',
            onBack: () => Navigator.maybePop(context),
          ),
          Expanded(
            child: Container(
              width: double.infinity,
              margin: const EdgeInsets.only(top: 18),
              padding: const EdgeInsets.fromLTRB(16, 20, 16, 0),
              decoration: const BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.only(topLeft: Radius.circular(30), topRight: Radius.circular(30)),
              ),
              child: provider.isLoading
                  ? const Center(child: CircularProgressIndicator(color: MaanColors.primary))
                  : provider.error != null
                      ? _ErrorView(message: provider.error!, onRetry: () => provider.fetchPayrolls(refresh: true))
                      : RefreshIndicator(
                          color: MaanColors.primary,
                          onRefresh: () => provider.fetchPayrolls(refresh: true),
                          child: provider.payrolls.isEmpty
                              ? ListView(children: const [
                                  SizedBox(height: 120),
                                  Icon(Icons.request_quote_rounded, size: 64, color: MaanColors.faint),
                                  SizedBox(height: 12),
                                  Center(child: Text('No payslips visible for your account yet', style: MaanText.body)),
                                ])
                              : ListView(
                                  padding: const EdgeInsets.only(bottom: 24, top: 4),
                                  children: [
                                    // ── Task 127: payroll filters ──
                                    _FilterBar(
                                      months: _availableMonths(provider.payrolls),
                                      employees: _availableEmployees(provider.payrolls),
                                      monthKey: _monthKey,
                                      employeeId: _employeeId,
                                      status: _status,
                                      statusColor: _statusColor,
                                      onChanged: (month, employee, status) =>
                                          setState(() {
                                            _monthKey = month;
                                            _employeeId = employee;
                                            _status = status;
                                          }),
                                    ),
                                    const SizedBox(height: 14),
                                    if (filtered.isEmpty) ...[
                                      const SizedBox(height: 40),
                                      const Icon(Icons.filter_alt_off_rounded, size: 44, color: MaanColors.faint),
                                      const SizedBox(height: 10),
                                      const Center(child: Text('No payslips match the selected filters', style: MaanText.body)),
                                      const SizedBox(height: 40),
                                    ] else ...[
                                      // ── Design #11: payroll run cards (grouped by month) ──
                                      ..._runCards(filtered),
                                      const SizedBox(height: 16),
                                      Text('Payslips', style: MaanText.h2.copyWith(fontSize: 16)),
                                      const SizedBox(height: 10),
                                      ...filtered.map((p) => Padding(
                                            padding: const EdgeInsets.only(bottom: 10),
                                            child: _PayrollRow(
                                              payroll: p,
                                              statusColor: _statusColor(p.status),
                                              onTap: () => _openPayslip(context, p),
                                            ),
                                          )),
                                    ],
                                  ],
                                ),
                        ),
            ),
          ),
        ],
      ),
    );
  }

  /// Months present in the data, newest first ('YYYY-MM').
  List<String> _availableMonths(List<PayrollModel> rows) {
    final set = <String>{};
    for (final p in rows) {
      set.add('${p.year}-${p.month.toString().padLeft(2, '0')}');
    }
    final list = set.toList()..sort((a, b) => b.compareTo(a));
    return list;
  }

  /// Distinct employees in the data (id → display name), sorted by name.
  List<(String, String)> _availableEmployees(List<PayrollModel> rows) {
    final map = <String, String>{};
    for (final p in rows) {
      map.putIfAbsent(p.employeeId, () => p.employeeName ?? p.employeeId);
    }
    final entries = map.entries.toList()
      ..sort((a, b) => a.value.toLowerCase().compareTo(b.value.toLowerCase()));
    return entries.map((e) => (e.key, e.value)).toList();
  }

  /// Design #11 "Payroll Management" — one summary card per payroll RUN
  /// (month): status badge, period range, payslip count and a run ID derived
  /// from the first payslip of the group. All values come from the LIVE
  /// /api/payroll rows — no fabricated batch data.
  List<Widget> _runCards(List<PayrollModel> rows) {
    if (rows.length < 2) return const []; // a single payslip needs no run summary
    final groups = <String, List<PayrollModel>>{};
    for (final p in rows) {
      groups.putIfAbsent('${p.year}-${p.month.toString().padLeft(2, '0')}', () => []).add(p);
    }
    final keys = groups.keys.toList()..sort((a, b) => b.compareTo(a));
    return [
      Text('Payroll Runs', style: MaanText.h2.copyWith(fontSize: 16)),
      const SizedBox(height: 10),
      ...keys.map((k) {
        final g = groups[k]!;
        final month = g.first.month;
        final year = g.first.year;
        final firstDay = DateTime(year, month, 1);
        final lastDay = DateTime(year, month + 1, 0);
        final period =
            '${DateFormat('dd MMM, yy').format(firstDay)} – ${DateFormat('dd MMM, yy').format(lastDay)}';
        // Run status = the dominant row status (paid > processed > approved > draft).
        final counts = <String, int>{};
        for (final p in g) {
          counts[p.status] = (counts[p.status] ?? 0) + 1;
        }
        String status = 'draft';
        for (final s in ['paid', 'processed', 'approved', 'draft']) {
          if ((counts[s] ?? 0) > (counts[status] ?? 0)) status = s;
        }
        if (status == 'draft' && (counts['draft'] ?? 0) == 0) status = g.first.status;
        final label = status == 'draft' ? 'Generated' : status;
        final runId = 'PAYRUN-$year${month.toString().padLeft(2, '0')}-${g.first.id.substring(0, 6).toUpperCase()}';
        return Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: _RunCard(
            statusLabel: label,
            statusColor: _statusColor(status),
            period: period,
            payslipCount: g.length,
            runId: runId,
            netTotal: g.fold<num>(0, (s, p) => s + p.netSalary),
            currencySymbol: g.first.currencySymbol,
          ),
        );
      }),
    ];
  }

  void _openPayslip(BuildContext context, PayrollModel p) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(26))),
      builder: (_) => _PayslipSheet(p: p),
    );
  }
}

/// Task 127 — payroll filters: Month + Employee + Status dropdown chips.
/// Applied to BOTH the run cards and the payslip list.
class _FilterBar extends StatelessWidget {
  final List<String> months;
  final List<(String, String)> employees;
  final String monthKey;
  final String employeeId;
  final String status;
  final Color Function(String) statusColor;
  final void Function(String month, String employee, String status) onChanged;

  const _FilterBar({
    required this.months,
    required this.employees,
    required this.monthKey,
    required this.employeeId,
    required this.status,
    required this.statusColor,
    required this.onChanged,
  });

  String _monthLabel(String key) {
    if (key == 'all') return 'All Months';
    final parts = key.split('-');
    final y = int.tryParse(parts[0]) ?? 0;
    final m = int.tryParse(parts[1]) ?? 1;
    return m >= 1 && m <= 12 ? '${PayrollModel.monthNames[m - 1]} $y' : key;
  }

  @override
  Widget build(BuildContext context) {
    Widget chip({
      required String label,
      required IconData icon,
      required List<DropdownMenuItem<String>> items,
      required String value,
      required ValueChanged<String?> onChanged,
    }) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 10),
        decoration: BoxDecoration(
          color: const Color(0xFFF4F7FE),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: MaanColors.line),
        ),
        child: DropdownButtonHideUnderline(
          child: DropdownButton<String>(
            value: value,
            isDense: true,
            isExpanded: true,
            borderRadius: BorderRadius.circular(10),
            icon: const Icon(Icons.keyboard_arrow_down_rounded, size: 18, color: MaanColors.faint),
            items: items,
            onChanged: onChanged,
            underline: const SizedBox.shrink(),
            // One display row per item — the row content always shows the
            // current selection label (DropdownButton maps item index → row).
            selectedItemBuilder: (_) => items.map((_) => Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(icon, size: 14, color: MaanColors.primary),
                    const SizedBox(width: 5),
                    Expanded(
                      child: Text(label,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: MaanColors.navy)),
                    ),
                  ],
                )).toList(),
          ),
        ),
      );
    }

    final monthItems = <DropdownMenuItem<String>>[
      const DropdownMenuItem(value: 'all', child: Text('All Months', style: TextStyle(fontSize: 12.5))),
      ...months.map((m) => DropdownMenuItem(
          value: m,
          child: Text(_monthLabel(m), style: const TextStyle(fontSize: 12.5), overflow: TextOverflow.ellipsis))),
    ];
    final employeeItems = <DropdownMenuItem<String>>[
      const DropdownMenuItem(value: 'all', child: Text('All Employees', style: TextStyle(fontSize: 12.5))),
      ...employees.map((e) => DropdownMenuItem(
          value: e.$1,
          child: Text(e.$2, style: const TextStyle(fontSize: 12.5), overflow: TextOverflow.ellipsis))),
    ];
    const statusChoices = ['all', 'paid', 'processed', 'approved', 'draft'];
    final statusItems = statusChoices
        .map((s) => DropdownMenuItem(
            value: s,
            child: Text(s == 'all' ? 'All Status' : s.toUpperCase(),
                style: const TextStyle(fontSize: 12.5))))
        .toList();

    return Row(
      children: [
        Expanded(
          flex: 3,
          child: chip(
            label: _monthLabel(monthKey),
            icon: Icons.calendar_month_rounded,
            items: monthItems,
            value: monthKey,
            onChanged: (v) => onChanged(v ?? 'all', employeeId, status),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          flex: 3,
          child: chip(
            label: employeeId == 'all'
                ? 'All Employees'
                : employees.firstWhere((e) => e.$1 == employeeId, orElse: () => (employeeId, 'Employee')).$2,
            icon: Icons.badge_rounded,
            items: employeeItems,
            value: employeeId,
            onChanged: (v) => onChanged(monthKey, v ?? 'all', status),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          flex: 2,
          child: chip(
            label: status == 'all' ? 'All Status' : status.toUpperCase(),
            icon: Icons.verified_rounded,
            items: statusItems,
            value: status,
            onChanged: (v) => onChanged(monthKey, employeeId, v ?? 'all'),
          ),
        ),
      ],
    );
  }
}

/// Design #11 — payroll-run summary card: "Generated" badge, period, N
/// Payslip, run ID and total net for the month.
class _RunCard extends StatelessWidget {
  final String statusLabel;
  final Color statusColor;
  final String period;
  final int payslipCount;
  final String runId;
  final num netTotal;
  final String currencySymbol;

  const _RunCard({
    required this.statusLabel,
    required this.statusColor,
    required this.period,
    required this.payslipCount,
    required this.runId,
    required this.netTotal,
    required this.currencySymbol,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: MaanColors.line),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(.04), blurRadius: 10, offset: const Offset(0, 3))],
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
            decoration: BoxDecoration(color: statusColor.withOpacity(.14), borderRadius: BorderRadius.circular(9)),
            child: Text(statusLabel.toUpperCase(),
                style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: statusColor, letterSpacing: .5)),
          ),
          const Spacer(),
          Icon(Icons.more_horiz_rounded, size: 18, color: MaanColors.faint),
        ]),
        const SizedBox(height: 10),
        Text('Payroll Period: $period', style: MaanText.title.copyWith(fontSize: 13.5)),
        const SizedBox(height: 3),
        Text('$payslipCount Payslip${payslipCount == 1 ? '' : 's'}', style: MaanText.caption.copyWith(fontSize: 12, fontWeight: FontWeight.w700)),
        const SizedBox(height: 3),
        Text('Batch: $runId', style: MaanText.caption.copyWith(fontSize: 11.5)),
        const SizedBox(height: 3),
        Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Text('ID: #${runId.split('-').last}', style: MaanText.caption.copyWith(fontSize: 11.5)),
          Text('$currencySymbol${NumberFormat('#,##0.##').format(netTotal)} net',
              style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: MaanColors.navy)),
        ]),
      ]),
    );
  }
}

class _PayrollRow extends StatelessWidget {
  final PayrollModel payroll;
  final Color statusColor;
  final VoidCallback onTap;
  const _PayrollRow({required this.payroll, required this.statusColor, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final p = payroll;
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            border: Border.all(color: MaanColors.line),
            borderRadius: BorderRadius.circular(14),
            boxShadow: [BoxShadow(color: Colors.black.withOpacity(.04), blurRadius: 10, offset: const Offset(0, 3))],
          ),
          child: Row(
            children: [
              Container(
                width: 44, height: 44,
                decoration: BoxDecoration(color: MaanColors.accentCyan.withOpacity(.15), borderRadius: BorderRadius.circular(10)),
                child: const Icon(Icons.request_quote_rounded, color: MaanColors.accentCyan, size: 22),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(p.employeeName ?? 'Employee', style: MaanText.title, overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 2),
                  Text('${p.periodLabel}  ·  Gross ${p.grossLabel}', style: MaanText.caption),
                ]),
              ),
              const SizedBox(width: 8),
              Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                Text(p.netLabel, style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w800, color: MaanColors.navy)),
                const SizedBox(height: 4),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(color: statusColor.withOpacity(.14), borderRadius: BorderRadius.circular(9)),
                  child: Text(p.status.toUpperCase(), style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: statusColor, letterSpacing: .4)),
                ),
                // Task 130: release state — unlocked payslips are downloadable
                const SizedBox(height: 4),
                Icon(
                  p.isReleased ? Icons.lock_open_rounded : Icons.lock_rounded,
                  size: 13,
                  color: p.isReleased ? MaanColors.accentGreen : MaanColors.faint,
                ),
              ]),
            ],
          ),
        ),
      ),
    );
  }
}

/// Public test seam wrapping the private payslip sheet so widget tests can
/// exercise the attendance strip in isolation (Task 123).
class PayslipSheetHost extends StatelessWidget {
  final PayrollModel model;
  const PayslipSheetHost({super.key, required this.model});

  @override
  Widget build(BuildContext context) => _PayslipSheet(p: model);
}

class _PayslipSheet extends StatefulWidget {
  final PayrollModel p;
  const _PayslipSheet({super.key, required this.p});

  @override
  State<_PayslipSheet> createState() => _PayslipSheetState();
}

class _PayslipSheetState extends State<_PayslipSheet> {
  bool _downloading = false;

  static const _payrollManagerRoles = <String>{
    'super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_admin', 'company_hr_admin',
  };

  Future<void> _downloadPdf() async {
    final p = widget.p;
    final role = context.read<AuthProvider>().user?.role ?? '';
    final isManager = _payrollManagerRoles.contains(role);
    if (!p.isReleased && !isManager) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        behavior: SnackBarBehavior.floating,
        content: const Text('Locked — this payslip can be downloaded once the payroll manager releases it')),
      );
      return;
    }
    setState(() => _downloading = true);
    try {
      final bytes = await ApiService.getPayslipPdf(p.id);
      final name = 'Payslip-${p.monthName}-${p.year}.pdf';
      await Share.shareXFiles(
        [XFile.fromData(bytes, name: name, mimeType: 'application/pdf')],
        text: name,
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          behavior: SnackBarBehavior.floating,
          content: Text(e.toString().replaceAll('Exception: ', ''))),
        );
      }
    } finally {
      if (mounted) setState(() => _downloading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.p;
    final role = context.watch<AuthProvider>().user?.role ?? '';
    final canDownload = p.isReleased || _payrollManagerRoles.contains(role);
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: .72,
      maxChildSize: .95,
      builder: (_, controller) => SingleChildScrollView(
        controller: controller,
        padding: const EdgeInsets.fromLTRB(20, 10, 20, 28),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Center(child: Container(width: 44, height: 4.5, decoration: BoxDecoration(color: MaanColors.line, borderRadius: BorderRadius.circular(3)))),
          const SizedBox(height: 16),
          Text('Payslip · ${p.periodLabel}', style: MaanText.h2, textAlign: TextAlign.center),
          const SizedBox(height: 4),
          Text(p.employeeName ?? '', style: MaanText.body, textAlign: TextAlign.center),
          if ((p.designation ?? '').isNotEmpty)
            Text(p.designation!, style: MaanText.caption, textAlign: TextAlign.center),
          const SizedBox(height: 18),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              gradient: const LinearGradient(colors: [Color(0xFF5B7FE8), Color(0xFF7C6FF0)]),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Column(children: [
              const Text('NET SALARY', style: TextStyle(color: Colors.white70, fontSize: 11, letterSpacing: 1.2, fontWeight: FontWeight.w700)),
              const SizedBox(height: 4),
              Text('${p.currencySymbol}${NumberFormat('#,##0.##').format(p.netSalary)}',
                  style: const TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.w800)),
              const SizedBox(height: 2),
              Text('Gross ${p.currencySymbol}${NumberFormat('#,##0.##').format(p.grossSalary)}  ·  ${p.status.toUpperCase()}',
                  style: const TextStyle(color: Colors.white70, fontSize: 12)),
            ]),
          ),
          const SizedBox(height: 16),
          // Task 123: attendance-integrated pay days strip
          if (p.hasAttendance) ...[
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: const Color(0xFFEAF3FD),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: const Color(0xFFBBD6F2)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(children: [
                    const Icon(Icons.event_available_rounded, size: 15, color: Color(0xFF2C6FBF)),
                    const SizedBox(width: 6),
                    Text('ATTENDANCE & PAY DAYS', style: MaanText.hint.copyWith(color: const Color(0xFF2C6FBF), fontWeight: FontWeight.w800, letterSpacing: .5)),
                    if (p.modeLabel.isNotEmpty) ...[
                      const Spacer(),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(color: const Color(0xFF2C6FBF).withOpacity(.12), borderRadius: BorderRadius.circular(8)),
                        child: Text(p.modeLabel, style: const TextStyle(fontSize: 9.5, fontWeight: FontWeight.w800, color: Color(0xFF2C6FBF), letterSpacing: .5)),
                      ),
                    ],
                  ]),
                  const SizedBox(height: 10),
                  Row(children: [
                    Expanded(child: _DayStat(value: p.paidDays, label: 'Paid Days', color: MaanColors.accentGreen)),
                    Expanded(child: _DayStat(value: p.lopDays, label: 'LOP Days', color: MaanColors.accentRed)),
                    Expanded(child: _DayStat(value: p.totalDays, label: 'Total Days', color: MaanColors.primary)),
                  ]),
                ],
              ),
            ),
            const SizedBox(height: 12),
          ],
          // Task 127: EVERY component stays visible (zero rows included) — a
          // payslip must show the complete statutory breakdown, not collapse
          // to a dash when all deductions are exempt.
          _Section(title: 'Earnings', color: MaanColors.accentGreen, currency: p.currencySymbol, rows: [
            ('Basic Salary', p.basicSalary),
            ('HRA', p.hra),
            ('Dearness Allowance', p.da),
            ('Conveyance', p.conveyance),
            ('Medical', p.medical),
            ('Other Allowances', p.otherAllowances),
          ]),
          const SizedBox(height: 12),
          _Section(title: 'Deductions', color: MaanColors.accentRed, currency: p.currencySymbol, rows: [
            ('Provident Fund', p.pf),
            ('ESI', p.esi),
            ('Income Tax', p.tax),
            ('Professional Tax', p.professionalTax),
            ('Loss of Pay', p.lopDeduction),
            ('Other Deductions', p.otherDeductions),
          ]),
          const SizedBox(height: 12),
          Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            Text('Total Deductions', style: MaanText.title.copyWith(color: MaanColors.accentRed)),
            Text('${p.currencySymbol}${NumberFormat('#,##0.##').format(p.totalDeductions)}',
                style: MaanText.title.copyWith(color: MaanColors.accentRed)),
          ]),
          const SizedBox(height: 16),
          // Task 130: release state + official PDF download
          Center(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: (p.isReleased ? MaanColors.accentGreen : MaanColors.accentOrange).withOpacity(.12),
                borderRadius: BorderRadius.circular(9),
              ),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                Icon(p.isReleased ? Icons.lock_open_rounded : Icons.lock_rounded,
                    size: 12, color: p.isReleased ? MaanColors.accentGreen : MaanColors.accentOrange),
                const SizedBox(width: 5),
                Text(p.releaseLabel,
                    style: TextStyle(
                      fontSize: 10, fontWeight: FontWeight.w800, letterSpacing: .5,
                      color: p.isReleased ? MaanColors.accentGreen : MaanColors.accentOrange,
                    )),
              ]),
            ),
          ),
          const SizedBox(height: 10),
          FilledButton.icon(
            onPressed: _downloading ? null : _downloadPdf,
            style: FilledButton.styleFrom(
              backgroundColor: canDownload ? MaanColors.primary : MaanColors.faint,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            icon: _downloading
                ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : Icon(canDownload ? Icons.download_rounded : Icons.lock_rounded, size: 18),
            label: Text(
              canDownload ? 'Download Payslip PDF' : 'Locked Until Released',
              style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700),
            ),
          ),
          if (!p.isReleased) ...[
            const SizedBox(height: 6),
            Text('Payslips become available once the payroll manager releases them.',
                style: MaanText.hint.copyWith(fontSize: 11), textAlign: TextAlign.center),
          ],
        ]),
      ),
    );
  }
}

/// One pay-day statistic tile inside the attendance strip (Task 123).
class _DayStat extends StatelessWidget {
  final num value;
  final String label;
  final Color color;
  const _DayStat({required this.value, required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    final text = value == value.roundToDouble() ? value.toInt().toString() : value.toStringAsFixed(1);
    return Column(
      children: [
        Text(text, style: MaanText.h2.copyWith(color: color, fontSize: 19)),
        const SizedBox(height: 2),
        Text(label, style: MaanText.hint.copyWith(fontSize: 10.5)),
      ],
    );
  }
}

class _Section extends StatelessWidget {
  final String title;
  final Color color;
  final String currency;
  final List<(String, num)> rows;
  const _Section({required this.title, required this.color, required this.currency, required this.rows});
  @override
  Widget build(BuildContext context) {
    // Task 127: render ALL rows — zero values included (₹0 is meaningful on a
    // statutory payslip: PF exempt, PT slab 0, TDS rebate…).
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(border: Border.all(color: MaanColors.line), borderRadius: BorderRadius.circular(14)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(title, style: MaanText.title.copyWith(color: color)),
        const SizedBox(height: 8),
        ...rows.map((r) => Padding(
              padding: const EdgeInsets.symmetric(vertical: 3),
              child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                Text(r.$1, style: MaanText.body),
                Text('$currency${NumberFormat('#,##0.##').format(r.$2)}',
                    style: MaanText.title.copyWith(fontSize: 13.5)),
              ]),
            )),
        if (rows.isEmpty) const Text('—', style: MaanText.hint),
      ]),
    );
  }
}

class _ErrorView extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  const _ErrorView({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Icon(Icons.cloud_off_rounded, size: 52, color: MaanColors.faint),
          const SizedBox(height: 12),
          Text(message, style: MaanText.body, textAlign: TextAlign.center),
          const SizedBox(height: 16),
          FilledButton(onPressed: onRetry, style: FilledButton.styleFrom(backgroundColor: MaanColors.primary), child: const Text('Retry')),
        ]),
      ),
    );
  }
}
