import 'package:flutter/material.dart';

import '../../config/api_config.dart';
import '../../config/app_info.dart';
import '../../config/maan_theme.dart';
import '../../services/api_service.dart';
import '../../services/storage_service.dart';
import '../../services/update_service.dart';

/// Task 110 — Connection check.
///
/// Runs the exact endpoint matrix the modules use, with the stored token,
/// and shows pass/fail per endpoint with the server's own message. If any
/// module misbehaves on a user's device, this screen turns "errors
/// everywhere" into a precise, screenshot-able report.
class DiagnosticsScreen extends StatefulWidget {
  const DiagnosticsScreen({super.key});

  @override
  State<DiagnosticsScreen> createState() => _DiagnosticsScreenState();
}

class _CheckResult {
  final String name;
  final String path;
  final int? status;
  final String detail;
  final bool ok;
  _CheckResult(this.name, this.path, this.status, this.detail, this.ok);
}

class _DiagnosticsScreenState extends State<DiagnosticsScreen> {
  bool _running = false;
  bool _ran = false;
  final List<_CheckResult> _results = [];
  bool _updateChecked = false;
  String _updateInfo = '';

  @override
  void initState() {
    super.initState();
    _run();
  }

  Future<void> _run() async {
    setState(() { _running = true; _results.clear(); _ran = false; });
    final results = <_CheckResult>[];

    Future<_CheckResult> probe(String name, String path, Future<Map<String, dynamic>> Function() call) async {
      try {
        final r = await call().timeout(const Duration(seconds: 25));
        String detail;
        if (r.containsKey('employees')) {
          detail = 'employees=${(r['employees'] as List?)?.length ?? 0}';
        } else if (r.containsKey('data') && r['data'] is List) {
          detail = 'rows=${(r['data'] as List).length}';
        } else if (r.containsKey('attendance')) {
          detail = 'rows=${(r['attendance'] as List?)?.length ?? 0}';
        } else if (r.containsKey('notifications')) {
          detail = 'rows=${(r['notifications'] as List?)?.length ?? 0}';
        } else if (r.containsKey('stats')) {
          detail = 'stats ok';
        } else if (r.containsKey('month')) {
          detail = 'month=${r['month']} present=${r['present']}';
        } else {
          detail = 'ok';
        }
        return _CheckResult(name, path, 200, detail, true);
      } catch (e) {
        final msg = e.toString().replaceAll('Exception: ', '');
        final statusMatch = RegExp(r'^\d{3}').firstMatch(msg);
        final status = statusMatch != null ? int.tryParse(statusMatch.group(0)!) : null;
        return _CheckResult(name, path, status, msg, false);
      }
    }

    // Task 111 FIX — the identity check used to report "ok" even when
    // getMe() returned null (signed out / expired token / offline), which
    // made a signed-out app look healthy and hid the real problem. The
    // checks are now truthful and gated on the ACTUAL token state.
    final activeToken = ApiService.token;
    final storedToken = StorageService.getToken();

    if (activeToken == null || activeToken.isEmpty) {
      results.add(_CheckResult(
        'Signed-in identity',
        '/api/auth/me',
        null,
        storedToken == null || storedToken.isEmpty
            ? 'Not signed in on this device — sign in first, then re-run this check.'
            : 'Stored session was cleared after an error — sign in again.',
        false,
      ));
      results.add(_CheckResult(
        'Session token',
        '—',
        null,
        'No token stored — module checks need a sign-in. Sign in first, then re-run.',
        false,
      ));
    } else {
      results.add(_CheckResult('Session token', '—', 200, 'present (${activeToken.length} chars)', true));
      final meData = await ApiService.getMe().timeout(const Duration(seconds: 25));
      if (meData != null) {
        final who = (meData['name'] ?? meData['email'] ?? 'signed in').toString();
        results.add(_CheckResult('Signed-in identity', '/api/auth/me', 200, who, true));
      } else {
        results.add(_CheckResult(
          'Signed-in identity',
          '/api/auth/me',
          401,
          'Server rejected the session (expired or revoked) — sign in again.',
          false,
        ));
      }
      results.add(await probe('Dashboard', '/api/dashboard', ApiService.getDashboard));
      results.add(await probe('Employee Management', '/api/employees?page=1&limit=20', () => ApiService.getEmployees(page: 1, limit: 20)));
      results.add(await probe('Leave Management', '/api/leaves?page=1', () => ApiService.getLeaves()));
      results.add(await probe('Attendance', '/api/attendance', () => ApiService.getAttendance()));
      results.add(await probe('Attendance (my summary)', '/api/attendance/my-summary', ApiService.getMySummary));
      results.add(await probe('Payroll', '/api/payroll?page=1&limit=20', () => ApiService.getPayrolls()));
      results.add(await probe('Notifications', '/api/notifications', ApiService.getNotifications));
      results.add(await probe('Companies', '/api/companies', ApiService.getCompanies));
      results.add(await probe('Departments', '/api/departments', () async => {'data': await ApiService.getDepartments()}));
      results.add(await probe('Designations', '/api/designations', () async => {'data': await ApiService.getDesignations()}));
    }

    String updateInfo;
    final okUpdate = await UpdateService.checkForUpdate();
    updateInfo = okUpdate
        ? (UpdateService.updateAvailable
            ? 'NEWER VERSION AVAILABLE: v${UpdateService.latestVersionName} — open your company\'s WEB login page in the phone browser (e.g. https://3boxeshrms.com) and tap "Download for Android".'
            : 'App is up to date (platform latest: ${UpdateService.latestVersionName}).')
        : 'Could not reach /api/public/app-version (older platform build or offline).';

    if (mounted) {
      setState(() {
        _results.addAll(results);
        _updateChecked = true;
        _updateInfo = updateInfo;
        _running = false;
        _ran = true;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final failed = _results.where((r) => !r.ok).length;
    return Scaffold(
      backgroundColor: MaanColors.pageBg,
      appBar: AppBar(
        title: const Text('Connection check', style: TextStyle(fontWeight: FontWeight.w700)),
        backgroundColor: Colors.white,
        foregroundColor: MaanColors.navy,
        elevation: 0.5,
        actions: [
          IconButton(onPressed: _running ? null : _run, icon: const Icon(Icons.refresh)),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _infoCard(),
          const SizedBox(height: 14),
          if (_running) const Padding(
            padding: EdgeInsets.symmetric(vertical: 28),
            child: Center(child: CircularProgressIndicator(color: MaanColors.primary)),
          ),
          if (_ran) ...[
            Row(children: [
              Icon(failed == 0 ? Icons.check_circle : Icons.error, size: 18, color: failed == 0 ? MaanColors.accentGreen : MaanColors.accentRed),
              const SizedBox(width: 6),
              Text(failed == 0 ? 'All checks passed' : '$failed of ${_results.length} checks failed',
                  style: MaanText.title.copyWith(fontSize: 14.5)),
            ]),
            const SizedBox(height: 10),
            ..._results.map(_resultTile),
            const SizedBox(height: 14),
            _updateCard(),
            const SizedBox(height: 24),
          ],
        ],
      ),
    );
  }

  Widget _infoCard() {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: MaanColors.line)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(AppInfo.label, style: MaanText.title.copyWith(fontSize: 15)),
        const SizedBox(height: 4),
        Text('Workspace: ${ApiConfig.baseUrl}', style: MaanText.caption.copyWith(fontSize: 12)),
        const SizedBox(height: 2),
        Text('Every check below uses the same calls the modules use. Screenshot this page if you need support.',
            style: MaanText.caption.copyWith(fontSize: 11.5)),
      ]),
    );
  }

  Widget _resultTile(_CheckResult r) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: r.ok ? const Color(0xFFF3FBF6) : const Color(0xFFFDF3F3),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: r.ok ? const Color(0xFFD3EDDD) : const Color(0xFFF2D8D8)),
      ),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Icon(r.ok ? Icons.check_circle_outline : Icons.error_outline, size: 18, color: r.ok ? MaanColors.accentGreen : MaanColors.accentRed),
        const SizedBox(width: 10),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('${r.name}  ·  ${r.status ?? '—'}', style: MaanText.title.copyWith(fontSize: 13.5)),
          const SizedBox(height: 2),
          Text(r.path, style: MaanText.caption.copyWith(fontSize: 10.5, fontFamily: 'monospace')),
          const SizedBox(height: 2),
          Text(r.detail, style: MaanText.caption.copyWith(fontSize: 11.5)),
        ])),
      ]),
    );
  }

  Widget _updateCard() {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: _updateInfo.contains('NEWER') ? const Color(0xFFFFF7E8) : Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: _updateInfo.contains('NEWER') ? const Color(0xFFF2DCAF) : MaanColors.line),
      ),
      child: Row(children: [
        Icon(Icons.system_update, size: 20, color: _updateInfo.contains('NEWER') ? const Color(0xFFB7791F) : MaanColors.faint),
        const SizedBox(width: 10),
        Expanded(child: Text(_updateChecked ? _updateInfo : 'Checking app version…', style: MaanText.caption.copyWith(fontSize: 12))),
      ]),
    );
  }
}
