// Task 110 — feed REAL captured LIVE-tenant payloads through the app's REAL
// model parsing. Any exception here is exactly what the user sees as a
// module error on their device.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:hrms_app/models/attendance.dart';
import 'package:hrms_app/models/company.dart';
import 'package:hrms_app/models/employee.dart';
import 'package:hrms_app/models/leave.dart';
import 'package:hrms_app/models/notification.dart';
import 'package:hrms_app/models/payroll.dart';
import 'package:hrms_app/models/user.dart';

Map<String, dynamic> load(String name) {
  final raw = File('test/fixtures/$name').readAsStringSync();
  final decoded = jsonDecode(raw);
  return decoded is Map<String, dynamic> ? decoded : {'_root': decoded};
}

void main() {
  test('login payload → UserModel (name + avatar for header)', () {
    final data = load('login.json');
    final userJson = data['user'] as Map<String, dynamic>;
    final u = UserModel.fromJson(userJson);
    expect(u.displayName, isNotEmpty);
    expect(u.avatar, startsWith('data:image'));
  });

  test('me.json → UserModel', () {
    final u = UserModel.fromJson(load('me.json'));
    expect(u.displayName, isNotEmpty);
  });

  test('employees.json → EmployeeModel list (Employee Management module)', () {
    final data = load('employees.json');
    final rows = (data['employees'] as List?) ?? (data['data'] as List?) ?? [];
    expect(rows, isNotEmpty);
    for (final row in rows) {
      EmployeeModel.fromJson(row as Map<String, dynamic>);
    }
  });

  test('employee_detail.json → EmployeeModel (detail sheet)', () {
    final data = load('employee_detail.json');
    final empJson = (data['employee'] as Map<String, dynamic>?) ?? data;
    final e = EmployeeModel.fromJson(empJson);
    expect(e.firstName, isNotEmpty);
  });

  test('leaves.json → LeaveModel list (Leave Management module)', () {
    final data = load('leaves.json');
    final rows = (data['data'] as List?) ?? [];
    expect(rows, isNotEmpty);
    for (final row in rows) {
      LeaveModel.fromJson(row as Map<String, dynamic>);
    }
  });

  test('attendance.json → AttendanceModel list (Attendance module)', () {
    final data = load('attendance.json');
    final rows = (data['attendance'] as List?) ?? [];
    expect(rows, isNotEmpty);
    for (final row in rows) {
      AttendanceModel.fromJson(row as Map<String, dynamic>);
    }
  });

  test('payroll.json → PayrollModel list (Payroll module)', () {
    final data = load('payroll.json');
    final rows = (data['payrolls'] as List?) ?? [];
    for (final row in rows) {
      PayrollModel.fromJson(row as Map<String, dynamic>);
    }
  });

  test('notifications.json → NotificationModel list', () {
    final data = load('notifications.json');
    final rows = (data['notifications'] as List?) ?? [];
    expect(rows, isNotEmpty);
    for (final row in rows) {
      NotificationModel.fromJson(row as Map<String, dynamic>);
    }
  });

  test('companies.json → CompanyModel list', () {
    final data = load('companies.json');
    final rows = (data['companies'] as List?) ?? [];
    for (final row in rows) {
      CompanyModel.fromJson(row as Map<String, dynamic>);
    }
  });
}
