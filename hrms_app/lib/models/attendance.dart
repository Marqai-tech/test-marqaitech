class AttendanceModel {
  final String id;
  final String? employeeId;
  final String? employeeName;
  final DateTime date;
  final String status;
  final DateTime? checkIn;
  final DateTime? checkOut;
  final String? totalHours;
  final String? remarks;
  final String? location;
  final double? checkInGpsLat;
  final double? checkInGpsLng;
  final double? checkOutGpsLat;
  final double? checkOutGpsLng;
  final String? punchMethod;

  AttendanceModel({
    required this.id,
    this.employeeId,
    this.employeeName,
    required this.date,
    required this.status,
    this.checkIn,
    this.checkOut,
    this.totalHours,
    this.remarks,
    this.location,
    this.checkInGpsLat,
    this.checkInGpsLng,
    this.checkOutGpsLat,
    this.checkOutGpsLng,
    this.punchMethod,
  });

  factory AttendanceModel.fromJson(Map<String, dynamic> json) {
    double? _d(v) => v == null ? null : double.tryParse(v.toString());
    return AttendanceModel(
      id: json['id'] ?? '',
      employeeId: json['employeeId'],
      employeeName: json['employeeName'] ?? json['employee']?['name'],
      date: DateTime.tryParse(json['date']?.toString() ?? '') ?? DateTime.now(),
      status: json['status'] ?? 'PRESENT',
      checkIn: json['checkIn'] != null ? DateTime.tryParse(json['checkIn'].toString()) : null,
      checkOut: json['checkOut'] != null ? DateTime.tryParse(json['checkOut'].toString()) : null,
      totalHours: json['totalHours'] ?? json['workingHours'],
      remarks: json['remarks'],
      location: json['location'],
      checkInGpsLat: _d(json['checkInGpsLat']),
      checkInGpsLng: _d(json['checkInGpsLng']),
      checkOutGpsLat: _d(json['checkOutGpsLat']),
      checkOutGpsLng: _d(json['checkOutGpsLng']),
      punchMethod: json['punchMethod'],
    );
  }

  bool get isPresent => status.toUpperCase() == 'PRESENT';
  bool get isAbsent => status.toUpperCase() == 'ABSENT';
  bool get isOnLeave => status.toUpperCase() == 'ON_LEAVE';
  bool get isHalfDay => status.toUpperCase() == 'HALF_DAY';
  bool get isWfh => status.toUpperCase() == 'WORK_FROM_HOME';

  String get checkInTime => checkIn != null
      ? '${checkIn!.hour.toString().padLeft(2, '0')}:${checkIn!.minute.toString().padLeft(2, '0')}'
      : '--:--';
  String get checkOutTime => checkOut != null
      ? '${checkOut!.hour.toString().padLeft(2, '0')}:${checkOut!.minute.toString().padLeft(2, '0')}'
      : '--:--';
}
