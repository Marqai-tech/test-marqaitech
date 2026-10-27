class PayrollModel {
  final String id;
  final String employeeId;
  final int month;
  final int year;
  final num basicSalary;
  final num hra;
  final num da;
  final num conveyance;
  final num medical;
  final num otherAllowances;
  final num grossSalary;
  final num pf;
  final num esi;
  final num tax;
  final num professionalTax;
  final num otherDeductions;
  // Task 125: LOP presented as an explicit deduction line (gross stays fixed)
  final num lopDeduction;
  final num totalDeductions;
  final num netSalary;
  final String? currency;
  final String status;
  final String? employeeName;
  final String? designation;
  // Task 123: attendance-integrated processing
  final num totalDays;
  final num paidDays;
  final num lopDays;
  final String? processingMode;
  // Task 130: release gate — employees can download the PDF only once the
  // payroll manager has released the payslip.
  final DateTime? releasedAt;

  PayrollModel({
    required this.id,
    required this.employeeId,
    required this.month,
    required this.year,
    required this.basicSalary,
    required this.hra,
    required this.da,
    required this.conveyance,
    required this.medical,
    required this.otherAllowances,
    required this.grossSalary,
    required this.pf,
    required this.esi,
    required this.tax,
    required this.professionalTax,
    required this.otherDeductions,
    this.lopDeduction = 0,
    required this.totalDeductions,
    required this.netSalary,
    this.currency,
    required this.status,
    this.employeeName,
    this.designation,
    this.totalDays = 0,
    this.paidDays = 0,
    this.lopDays = 0,
    this.processingMode,
    this.releasedAt,
  });

  factory PayrollModel.fromJson(Map<String, dynamic> json) {
    final emp = json['employee'];
    String? empName;
    String? desig;
    if (emp is Map) {
      empName = '${emp['firstName'] ?? ''} ${emp['lastName'] ?? ''}'.trim();
      final d = emp['designation'];
      desig = d is Map ? d['title']?.toString() : d?.toString();
    }
    num _n(String k) {
      final v = json[k];
      if (v is num) return v;
      return num.tryParse(v?.toString() ?? '') ?? 0;
    }

    return PayrollModel(
      id: json['id'] ?? '',
      employeeId: json['employeeId'] ?? '',
      month: _n('month').toInt(),
      year: _n('year').toInt(),
      basicSalary: _n('basicSalary'),
      hra: _n('hra'),
      da: _n('da'),
      conveyance: _n('conveyance'),
      medical: _n('medical'),
      otherAllowances: _n('otherAllowances'),
      grossSalary: _n('grossSalary'),
      pf: _n('pf'),
      esi: _n('esi'),
      tax: _n('tax'),
      professionalTax: _n('professionalTax'),
      otherDeductions: _n('otherDeductions'),
      lopDeduction: _n('lopDeduction'),
      totalDeductions: _n('totalDeductions'),
      netSalary: _n('netSalary'),
      currency: json['currency'] ?? 'INR',
      status: json['status'] ?? 'draft',
      employeeName: empName,
      designation: desig,
      totalDays: _n('totalDays'),
      paidDays: _n('paidDays'),
      lopDays: _n('lopDays'),
      processingMode: json['processingMode']?.toString(),
      releasedAt: () {
        final v = json['releasedAt'];
        if (v == null || (v is String && v.isEmpty)) return null;
        return DateTime.tryParse(v.toString());
      }(),
    );
  }

  static const List<String> monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  String get monthName => month >= 1 && month <= 12 ? monthNames[month - 1] : '$month';
  String get periodLabel => '$monthName $year';
  String get currencySymbol => (currency ?? 'INR') == 'INR' ? '₹' : (currency == 'USD' ? '\$' : '');
  String get netLabel => '$currencySymbol${_fmt(netSalary)}';
  String get grossLabel => '$currencySymbol${_fmt(grossSalary)}';
  bool get hasAttendance => totalDays > 0;
  String get attendanceLabel => hasAttendance
      ? 'Paid ${_fmtDays(paidDays)} · LOP ${_fmtDays(lopDays)} · Total ${_fmtDays(totalDays)}'
      : '';
  String get modeLabel => processingMode == 'auto' ? 'AUTO' : processingMode == 'manual' ? 'MANUAL' : '';
  // Task 130: payroll-manager release gate
  bool get isReleased => releasedAt != null;
  String get releaseLabel => isReleased ? 'RELEASED' : 'AWAITING RELEASE';

  static String _fmtDays(num v) => v == v.roundToDouble() ? v.toInt().toString() : v.toStringAsFixed(1);

  static String _fmt(num v) {
    if (v >= 10000000) return '${(v / 10000000).toStringAsFixed(2)}Cr';
    if (v >= 100000) return '${(v / 100000).toStringAsFixed(2)}L';
    if (v == v.roundToDouble()) return v.toInt().toString();
    return v.toStringAsFixed(2);
  }
}
