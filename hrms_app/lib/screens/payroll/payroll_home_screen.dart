import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../config/maan_theme.dart';
import '../../models/payroll.dart';
import '../../providers/payroll_provider.dart';

/// Payroll module — live data from GET /api/payroll, payslip detail sheet.
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

class _PayrollBody extends StatelessWidget {
  const _PayrollBody();

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

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<PayrollProvider>();
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
                                    // ── Design #11: payroll run cards (grouped by month) ──
                                    ..._runCards(provider.payrolls),
                                    const SizedBox(height: 16),
                                    Text('Payslips', style: MaanText.h2.copyWith(fontSize: 16)),
                                    const SizedBox(height: 10),
                                    ...provider.payrolls.map((p) => Padding(
                                          padding: const EdgeInsets.only(bottom: 10),
                                          child: _PayrollRow(
                                            payroll: p,
                                            statusColor: _statusColor(p.status),
                                            onTap: () => _openPayslip(context, p),
                                          ),
                                        )),
                                  ],
                                ),
                        ),
            ),
          ),
        ],
      ),
    );
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
              ]),
            ],
          ),
        ),
      ),
    );
  }
}

class _PayslipSheet extends StatelessWidget {
  final PayrollModel p;
  const _PayslipSheet({required this.p});

  @override
  Widget build(BuildContext context) {
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
            ('Other Deductions', p.otherDeductions),
          ]),
          const SizedBox(height: 12),
          Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            Text('Total Deductions', style: MaanText.title.copyWith(color: MaanColors.accentRed)),
            Text('${p.currencySymbol}${NumberFormat('#,##0.##').format(p.totalDeductions)}',
                style: MaanText.title.copyWith(color: MaanColors.accentRed)),
          ]),
        ]),
      ),
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
    final visible = rows.where((r) => r.$2 != 0).toList();
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(border: Border.all(color: MaanColors.line), borderRadius: BorderRadius.circular(14)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(title, style: MaanText.title.copyWith(color: color)),
        const SizedBox(height: 8),
        ...visible.map((r) => Padding(
              padding: const EdgeInsets.symmetric(vertical: 3),
              child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                Text(r.$1, style: MaanText.body),
                Text('$currency${NumberFormat('#,##0.##').format(r.$2)}',
                    style: MaanText.title.copyWith(fontSize: 13.5)),
              ]),
            )),
        if (visible.isEmpty) const Text('—', style: MaanText.hint),
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
