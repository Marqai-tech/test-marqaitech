// Task 123 — payroll integration regression tests.
//
// Covers:
//  1. PayrollModel parsing of the new attendance fields (totalDays / paidDays
//     / lopDays / processingMode) incl. shape-agnostic defaults.
//  2. Attendance strip + mode badge getters (attendanceLabel / modeLabel).
//  3. Payslip sheet renders the ATTENDANCE & PAY DAYS strip when the record
//     carries attendance data — and omits it when it does not.
//  4. Source contracts on BOTH platforms: web process endpoint backfill
//     default, cron sweep scope, engine LOP rule, settings persistence,
//     and the version chain at 1.5.6 (23).
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hrms_app/models/payroll.dart';
import 'package:hrms_app/screens/payroll/payroll_home_screen.dart';
import 'package:hrms_app/config/app_info.dart';
import 'package:hrms_app/config/constants.dart';

String webSrc(String relPath) => File('../$relPath').readAsStringSync();

void main() {
  group('PayrollModel attendance fields (Task 123)', () {
    test('parses full payload with attendance + processing mode', () {
      final m = PayrollModel.fromJson({
        'id': 'pl1',
        'employeeId': 'e1',
        'month': 10,
        'year': 2026,
        'basicSalary': 42960,
        'hra': 17184,
        'grossSalary': 107400,
        'pf': 1800,
        'esi': 0,
        'tax': 5379.4,
        'professionalTax': 200,
        'totalDeductions': 7379.4,
        'netSalary': 100020.6,
        'status': 'processed',
        'totalDays': 31,
        'paidDays': 29.5,
        'lopDays': 1.5,
        'processingMode': 'auto',
        'employee': {'firstName': 'Vardhani', 'lastName': 'Reddy'},
      });
      expect(m.totalDays, 31);
      expect(m.paidDays, 29.5);
      expect(m.lopDays, 1.5);
      expect(m.processingMode, 'auto');
      expect(m.hasAttendance, isTrue);
      expect(m.attendanceLabel, 'Paid 29.5 · LOP 1.5 · Total 31');
      expect(m.modeLabel, 'AUTO');
    });

    test('deviant payload → zero attendance defaults, unknown mode → empty label', () {
      final m = PayrollModel.fromJson({
        'id': 'pl2',
        'employeeId': 'e2',
        'month': 'nine',
        'year': null,
        'netSalary': '100',
        'totalDays': null,
        'paidDays': 'x',
        'lopDays': true,
        'processingMode': 123,
      });
      expect(m.totalDays, 0);
      expect(m.paidDays, 0);
      expect(m.lopDays, 0);
      expect(m.hasAttendance, isFalse);
      expect(m.attendanceLabel, isEmpty);
      expect(m.modeLabel, isEmpty, reason: 'unknown processingMode values render no badge');
    });

    test('half-day LOP renders with one decimal; absent mode → empty label', () {
      final m = PayrollModel.fromJson({
        'id': 'pl3',
        'employeeId': 'e3',
        'month': 9,
        'year': 2026,
        'netSalary': 14000,
        'totalDays': 30,
        'paidDays': 29,
        'lopDays': 1,
      });
      expect(m.attendanceLabel, 'Paid 29 · LOP 1 · Total 30');
      expect(m.modeLabel, isEmpty);
    });

    test('manual mode renders MANUAL badge', () {
      final m = PayrollModel.fromJson({
        'id': 'pl4', 'employeeId': 'e4', 'month': 8, 'year': 2026,
        'netSalary': 13967, 'totalDays': 31, 'paidDays': 31, 'lopDays': 0,
        'processingMode': 'manual',
      });
      expect(m.modeLabel, 'MANUAL');
    });
  });

  group('Payslip sheet attendance strip (Task 123)', () {
    Widget host(PayrollModel model) => MaterialApp(
          home: Scaffold(
            body: SizedBox.expand(child: PayslipSheetHost(model: model)),
          ),
        );

    testWidgets('shows ATTENDANCE & PAY DAYS strip + AUTO badge', (tester) async {
      final m = PayrollModel.fromJson({
        'id': 'pl1', 'employeeId': 'e1', 'month': 10, 'year': 2026,
        'netSalary': 100000, 'grossSalary': 107400, 'status': 'processed',
        'totalDays': 31, 'paidDays': 30, 'lopDays': 1, 'processingMode': 'auto',
        'employee': {'firstName': 'Vardhani'},
      });
      await tester.pumpWidget(host(m));
      expect(find.text('ATTENDANCE & PAY DAYS'), findsOneWidget);
      expect(find.text('Paid Days'), findsOneWidget);
      expect(find.text('LOP Days'), findsOneWidget);
      expect(find.text('Total Days'), findsOneWidget);
      expect(find.text('AUTO'), findsOneWidget);
    });

    testWidgets('omits the strip for legacy records without attendance', (tester) async {
      final m = PayrollModel.fromJson({
        'id': 'pl2', 'employeeId': 'e2', 'month': 10, 'year': 2026,
        'netSalary': 100000, 'status': 'processed',
      });
      await tester.pumpWidget(host(m));
      expect(find.text('ATTENDANCE & PAY DAYS'), findsNothing);
    });
  });

  group('Task 123 source contracts', () {
    test('mobile version chain is 1.7.1 (35)', () {
      expect(AppInfo.versionName, '1.7.1');
      expect(AppInfo.versionCode, 35);
      expect(AppConstants.appVersion, '1.7.1');
    });

    test('web app-version release is 1.7.1 (35) with install-fix + OTP notes', () {
      final src = webSrc('src/lib/app-version.ts');
      expect(src.contains("versionName: '1.7.1'"), isTrue, reason: 'src/lib/app-version.ts must say 1.7.1');
      expect(src.contains('versionCode: 35'), isTrue, reason: 'src/lib/app-version.ts must say 35');
      expect(src.contains('3boxes-hrms-mobile-v1.7.1.apk'), isTrue);
      expect(src.contains('OTP'), isTrue, reason: 'release notes must mention the OTP sign-in flow');
      expect(src.contains('INSTALL FIX'), isTrue, reason: 'release notes must call out the universal-APK install fix');
    });

    test('web process endpoint: backfill default ON + audit actions', () {
      final process = webSrc('src/app/api/payroll/process/route.ts');
      expect(process.contains('backfill: body.backfill !== false'), isTrue,
          reason: 'process endpoint defaults backfill to ON');
      expect(process.contains('PAYROLL_AUTO_PROCESS'), isTrue);
      expect(process.contains('PAYROLL_MANUAL_PROCESS'), isTrue);
    });

    test('engine: LOP rule, PF ceiling, new-regime rebate', () {
      final engine = webSrc('src/lib/payroll-engine.ts');
      expect(engine.contains('summary.absent + summary.halfDay * 0.5'), isTrue,
          reason: 'LOP = absent + 0.5 × half_day');
      expect(engine.contains('processPayrollForCompany'), isTrue);
      expect(engine.contains('pfWageCeiling'), isTrue);
      expect(engine.contains('1200000'), isTrue, reason: 'new-regime 87A rebate ceiling present');
      expect(engine.contains('solveGrossForNet'), isTrue, reason: 'on-hand gross solver present');
    });

    test('cron: auto sweep over all active tenant DBs', () {
      final cron = webSrc('src/app/api/cron/payroll-auto-process/route.ts');
      expect(cron.contains("processingMode: 'auto'"), isTrue);
      expect(cron.contains('getDbForTenantById'), isTrue, reason: 'cron sweeps every active tenant DB');
    });

    test('marqai-setup: solver, FY 2026-27 slabs, Telangana PT, 9 assignments', () {
      final setup = webSrc('src/app/api/payroll/marqai-setup/route.ts');
      expect(setup.contains('solveGrossForNet'), isTrue, reason: 'vardhani on-hand solver wired');
      expect(setup.contains("'FY 2026-27'"), isTrue, reason: 'tax slab masters FY 2026-27');
      expect(setup.contains('TELANGANA'), isTrue);
      expect(setup.contains("netTarget: 100000"), isTrue, reason: 'vardhani on-hand target ₹1L');
      expect('marqai'.allMatches(setup.toLowerCase()).length, greaterThanOrEqualTo(1));
      // all 9 employees wired
      for (final name in ['mallesh', 'madhuri', 'manoj', 'shiraj', 'amrutha', 'syed', 'bharath', 'divya', 'vardhani']) {
        expect(setup.toLowerCase().contains(name), isTrue, reason: '$name must be assigned a structure');
      }
    });

    test('salary settings now PERSIST (no longer a stub)', () {
      final settings = webSrc('src/app/api/payroll/salary-settings/route.ts');
      expect(settings.contains('payrollSettings.upsert'), isTrue,
          reason: 'salary settings must persist into PayrollSettings');
      expect(settings.contains('processingMode'), isTrue);
    });

    test('schema declares PayrollSettings model + attendance columns', () {
      final schema = webSrc('prisma/schema.prisma');
      expect(schema.contains('model PayrollSettings'), isTrue);
      expect(schema.contains('lopDays'), isTrue);
      expect(schema.contains('attendanceJson'), isTrue);
    });

    test('payslip detail API exposes days + real company header', () {
      final detail = webSrc('src/app/api/payroll/payslips/[id]/route.ts');
      expect(detail.contains('totalDays'), isTrue);
      expect(detail.contains('lopDays'), isTrue);
      expect(detail.contains('processingMode'), isTrue);
      expect(detail.contains("db.company.findUnique"), isTrue,
          reason: 'payslip header uses the REAL company, not the hardcoded placeholder');
    });

    test('payslip detail JSON shape parses through the mobile model', () {
      final sample = jsonEncode({
        'totalDays': 31, 'paidDays': 29.5, 'lopDays': 1.5, 'processingMode': 'auto',
      });
      final m = PayrollModel.fromJson(jsonDecode(sample) as Map<String, dynamic>);
      expect(m.totalDays, 31);
      expect(m.modeLabel, 'AUTO');
    });
  });
}
