class EmployeeModel {
  final String id;
  final String firstName;
  final String? lastName;
  final String? email;
  final String? phone;
  final String? avatar;
  final String? designation;
  final String? department;
  final String? branch;
  final String? status;
  final String? employeeStatus;
  final String? gender;
  final DateTime? joinDate;
  final String? employeeCode;
  final String? reportingManager;
  /// Task 136 — REAL birth date for birthday celebrations (the as-per-records
  /// dateOfBirth is not collected on mobile).
  final DateTime? originalBirthday;

  EmployeeModel({
    required this.id,
    required this.firstName,
    this.lastName,
    this.email,
    this.phone,
    this.avatar,
    this.designation,
    this.department,
    this.branch,
    this.status,
    this.employeeStatus,
    this.gender,
    this.joinDate,
    this.employeeCode,
    this.reportingManager,
    this.originalBirthday,
  });

  /// Tolerant string coercion — the LIVE tenant API returns related records
  /// (branch, reportingManager, department, …) as nested OBJECTS while demo
  /// deployments may return plain strings. Treating a Map as String crashed
  /// the whole employee list on the LIVE tenant (Task 107).
  static String? _s(Object? v) {
    if (v == null) return null;
    if (v is String) return v.isEmpty ? null : v;
    if (v is Map) {
      // Pick the most human-friendly key the nested object carries.
      for (final k in ['name', 'title', 'firstName', 'code', 'email']) {
        final val = v[k];
        if (val is String && val.isNotEmpty) return val;
      }
      return null;
    }
    final s = v.toString();
    return s.isEmpty ? null : s;
  }

  factory EmployeeModel.fromJson(Map<String, dynamic> json) {
    String? nameFromUser(Map? u) => u == null ? null : _s(u['name']) ?? _s(u['email']);
    return EmployeeModel(
      id: json['id']?.toString() ?? '',
      firstName: _s(json['firstName']) ?? _s(json['name']) ?? '',
      lastName: _s(json['lastName']),
      email: _s(json['email']) ?? _s(json['workEmail']) ?? (json['user'] is Map ? _s(json['user']['email']) : null),
      phone: _s(json['phone']) ?? _s(json['mobileNumber']),
      avatar: _s(json['avatar']) ?? _s(json['profileImage']) ?? (json['user'] is Map ? _s(json['user']['avatar']) : null),
      designation: _s(json['designation']) ?? _s(json['designationName']),
      department: _s(json['department']) ?? _s(json['departmentName']),
      branch: _s(json['branch']) ?? _s(json['branchName']),
      status: _s(json['status']) ?? 'ACTIVE',
      employeeStatus: _s(json['employeeStatus']),
      gender: _s(json['gender']),
      joinDate: DateTime.tryParse(json['dateOfJoining']?.toString() ?? '') ?? DateTime.tryParse(json['joinDate']?.toString() ?? ''),
      employeeCode: _s(json['employeeCode']) ?? _s(json['code']) ?? _s(json['employeeId']),
      originalBirthday: DateTime.tryParse(json['originalBirthday']?.toString() ?? ''),
      reportingManager: json['reportingManager'] is Map
          ? '${_s(json['reportingManager']['firstName']) ?? ''} ${_s(json['reportingManager']['lastName']) ?? ''}'.trim()
          : (_s(json['reportingManager']) ?? _s(json['managerName'])),
    );
  }

  String get fullName => '$firstName ${lastName ?? ''}'.trim();
  String get initials {
    final parts = fullName.trim().split(' ').where((p) => p.isNotEmpty).toList();
    if (parts.length >= 2) return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
    return firstName.isNotEmpty ? firstName[0].toUpperCase() : '?';
  }

  bool get isActive => (status ?? '').toLowerCase() == 'active';
  bool get isOnProbation => (employeeStatus ?? '').toLowerCase() == 'probation' || (status ?? '').toUpperCase() == 'ON_PROBATION';

  /// Task 128 — canonical employment-status display that respects TERMINAL
  /// employment states. A terminated/resigned employee must never be shown
  /// as "Probation" (a stale employeeStatus used to leak through in every
  /// client). Priority: status (terminated/resigned/on_leave) first, then
  /// the probation-workflow employeeStatus, then active/inactive.
  bool get isTerminated => (status ?? '').toLowerCase() == 'terminated';
  bool get isResigned => (status ?? '').toLowerCase() == 'resigned';

  String get displayStatus {
    final s = (status ?? '').toLowerCase();
    if (s == 'terminated') return 'Terminated';
    if (s == 'resigned') return 'Resigned';
    if (s == 'on_leave') return 'On Leave';
    final es = (employeeStatus ?? '').trim();
    if (es.isNotEmpty) {
      switch (es.toLowerCase()) {
        case 'probation': return 'Probation';
        case 'confirmed': return 'Confirmed';
        case 'contract': return 'Contract';
        case 'internship': return 'Intern';
        case 'consultant': return 'Consultant';
        case 'terminated': return 'Terminated';
        case 'resigned': return 'Resigned';
        default: return es[0].toUpperCase() + es.substring(1);
      }
    }
    return isActive ? 'Active' : 'Inactive';
  }

}
