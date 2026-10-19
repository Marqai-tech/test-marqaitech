import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../config/maan_theme.dart';
import '../../providers/auth_provider.dart';
import '../../services/api_service.dart';
import '../../widgets/maan_avatar.dart';
import '../../widgets/main_scaffold.dart';

/// Task 112 — My Profile rebuilt from design #19 with LIVE employee data:
///  · identity card: avatar (from User/Employee), name, employee ID,
///    profile-completeness ring, "Image Change" (PATCH /api/auth/me)
///  · Professional info: email, phone, salary, join date, employment type,
///    designation, department, branch, reporting manager
///  · Other info: gender, blood group (+ address when present)
/// Everything renders straight from GET /api/employees/[own-id]; when the
/// account has no employee row the screen degrades to the account identity.
class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  Map<String, dynamic>? _employee;
  Map<String, dynamic> _account = {};
  bool _loading = true;
  bool _uploading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final me = await ApiService.getMe();
      if (me != null) _account = me;
      final id = await ApiService.resolveOwnEmployeeId();
      Map<String, dynamic>? emp;
      if (id != null && id.isNotEmpty) {
        final data = await ApiService.getEmployeeDetail(id);
        final candidate = (data['employee'] ?? data['data'] ?? data) as Map?;
        if (candidate != null) emp = Map<String, dynamic>.from(candidate);
      }
      if (!mounted) return;
      setState(() { _employee = emp; _loading = false; });
    } catch (e) {
      if (!mounted) return;
      setState(() { _loading = false; _error = e.toString().replaceAll('Exception: ', ''); });
    }
  }

  // ── Field parsing (nested department/designation/branch objects vs strings) ──
  static String? _s(Object? v) {
    if (v == null) return null;
    if (v is String && v.trim().isNotEmpty) return v.trim();
    if (v is Map) {
      for (final k in ['name', 'title', 'firstName', 'code']) {
        final val = v[k];
        if (val is String && val.isNotEmpty) return val;
      }
      return null;
    }
    final s = '$v'.trim();
    return s.isEmpty ? null : s;
  }

  String get _name {
    final e = _employee;
    final full = ['${e?['firstName'] ?? ''}'.trim(), '${e?['lastName'] ?? ''}'.trim()].where((s) => s.isNotEmpty).join(' ');
    return full.isNotEmpty ? full : (_s(_account['name']) ?? 'User');
  }

  String get _email => _s(_employee?['email']) ?? _s(_account['email']) ?? '—';
  String? get _avatar => _s(_employee?['avatar']) ?? _s(_account['avatar']);
  String get _employeeCode => _s(_employee?['employeeId']) ?? _s(_employee?['employeeCode']) ?? '—';

  List<(String, String)> _professionalRows() {
    final e = _employee;
    final rows = <(String, String)>[];
    String? salary;
    if (e?['salary'] != null) {
      final cur = _s(e?['salaryCurrency']) ?? 'INR';
      final v = (e!['salary'] is num) ? (e['salary'] as num).toDouble() : double.tryParse('${e['salary']}');
      if (v != null) salary = '$cur ${NumberFormat('#,##0.##').format(v)}';
    }
    String? join;
    final dj = DateTime.tryParse('${e?['dateOfJoining'] ?? ''}');
    if (dj != null) join = DateFormat('dd-MMM-yyyy').format(dj);
    String? empType;
    final et = _s(e?['employeeType']);
    if (et != null) empType = et.replaceAll('_', '-').toUpperCase();

    void add(String label, String? value) { if (value != null && value != '—') rows.add((label, value)); }
    add('Email', _email == '—' ? null : _email);
    add('Phone', _s(e?['phone']));
    add('Salary', salary);
    add('Joining Date', join);
    add('Employee Status', empType ?? (('${e?['status'] ?? ''}') == 'active' ? 'Active' : null));
    add('Designation', _s(e?['designation']));
    add('Department', _s(e?['department']));
    add('Branch', _s(e?['branch']));
    add('Reporting To', _s(e?['reportingManager']) ?? _s(e?['reportingManagerName']));
    final shift = e?['shift'];
    if (shift is Map) {
      final name = _s(shift['name']);
      final st = _s(shift['startTime']);
      final et2 = _s(shift['endTime']);
      if (name != null || (st != null && et2 != null)) {
        add('Shift Time', [if (name != null) name, if (st != null && et2 != null) '$st - $et2'].join(' · '));
      }
    }
    return rows;
  }

  List<(String, String)> _otherRows() {
    final e = _employee;
    final rows = <(String, String)>[];
    void add(String label, String? value) { if (value != null && value.isNotEmpty) rows.add((label, value)); }
    add('Gender', _s(e?['gender']));
    add('Blood Group', _s(e?['bloodGroup']));
    add('Marital Status', _s(e?['maritalStatus']));
    add('Date of Birth', () { final d = DateTime.tryParse('${e?['dateOfBirth'] ?? ''}'); return d != null ? DateFormat('dd-MMM-yyyy').format(d) : null; }());
    add('Address', _s(e?['address']));
    return rows;
  }

  int get _completeness {
    final checks = <bool>[
      _email != '—',
      _s(_employee?['phone']) != null,
      _avatar != null,
      _s(_employee?['designation']) != null,
      _s(_employee?['department']) != null,
      _s(_employee?['branch']) != null,
      _s(_employee?['gender']) != null,
      _s(_employee?['bloodGroup']) != null,
      _s(_employee?['reportingManager'] ?? _employee?['reportingManagerName']) != null,
      _employee?['dateOfJoining'] != null,
    ];
    return ((checks.where((c) => c).length / checks.length) * 100).round();
  }

  Future<void> _changeImage() async {
    if (_uploading) return;
    try {
      final picked = await ImagePicker().pickImage(source: ImageSource.gallery, maxWidth: 720, maxHeight: 720, imageQuality: 82);
      if (picked == null) return;
      final bytes = await File(picked.path).length();
      if (bytes > 1_800_000) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Please choose a photo smaller than ~1.8 MB.'), backgroundColor: Colors.orange));
        }
        return;
      }
      setState(() => _uploading = true);
      final dataUrl = 'data:image/jpeg;base64,${base64Encode(await File(picked.path).readAsBytes())}';
      await ApiService.updateMe(avatar: dataUrl);
      if (mounted) {
        // Refresh both the employee card and the auth identity.
        context.read<AuthProvider>().reloadFromStorage();
        await _load();
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Profile photo updated'), backgroundColor: Colors.green));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString().replaceAll('Exception: ', '')), backgroundColor: Colors.red));
      }
    }
    if (mounted) setState(() => _uploading = false);
  }

  @override
  Widget build(BuildContext context) {
    return MainTabScaffold(
      currentIndex: 3,
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: MaanColors.primary))
          : RefreshIndicator(
              color: MaanColors.primary,
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  _identityCard(),
                  if (_error != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 12),
                      child: Text('Employee record: $_error', style: MaanText.caption.copyWith(color: MaanColors.accentRed)),
                    ),
                  const SizedBox(height: 16),
                  _sectionCard('Professional Info', _professionalRows(), Icons.work_rounded),
                  const SizedBox(height: 14),
                  _sectionCard('Other Info', _otherRows(), Icons.info_outline_rounded),
                  const SizedBox(height: 24),
                ],
              ),
            ),
    );
  }

  Widget _identityCard() {
    final pct = _completeness;
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(20), border: Border.all(color: MaanColors.line)),
      child: Column(
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(3),
                decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: MaanColors.accentOrange, width: 2.4)),
                child: MaanAvatar(avatar: _avatar, name: _name, radius: 38, bgColor: MaanColors.primary.withOpacity(.12), textColor: MaanColors.primary),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(_name, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: MaanColors.navy)),
                  const SizedBox(height: 2),
                  Text('Employee ID: $_employeeCode', style: MaanText.caption.copyWith(fontSize: 11.5)),
                  const SizedBox(height: 6),
                  Row(children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(5),
                      child: SizedBox(width: 110, child: LinearProgressIndicator(value: pct / 100, minHeight: 6, backgroundColor: MaanColors.line, color: MaanColors.primary)),
                    ),
                    const SizedBox(width: 8),
                    Text('$pct%', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: MaanColors.primary)),
                  ]),
                ]),
              ),
            ],
          ),
          const SizedBox(height: 14),
          SizedBox(
            width: double.infinity,
            height: 44,
            child: FilledButton.icon(
              style: FilledButton.styleFrom(backgroundColor: MaanColors.primary, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22))),
              onPressed: _uploading ? null : _changeImage,
              icon: _uploading
                  ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                  : const Icon(Icons.photo_camera_rounded, size: 18, color: Colors.white),
              label: Text(_uploading ? 'Uploading…' : 'Image Change', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 14)),
            ),
          ),
        ],
      ),
    );
  }

  Widget _sectionCard(String title, List<(String, String)> rows, IconData icon) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(20), border: Border.all(color: MaanColors.line)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Container(
              width: 32, height: 32,
              decoration: BoxDecoration(color: MaanColors.primary.withOpacity(.1), borderRadius: BorderRadius.circular(9)),
              child: Icon(icon, color: MaanColors.primary, size: 17),
            ),
            const SizedBox(width: 10),
            Text(title, style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w800, color: MaanColors.navy)),
          ]),
          const SizedBox(height: 8),
          if (rows.isEmpty)
            Padding(padding: const EdgeInsets.symmetric(vertical: 10), child: Text('No additional details on your employee record yet.', style: MaanText.caption))
          else
            ...rows.map((r) => _row(r.$1, r.$2)),
        ],
      ),
    );
  }

  Widget _row(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 7),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(width: 118, child: Text(label, style: MaanText.caption.copyWith(fontSize: 11.5))),
          const SizedBox(width: 8),
          Expanded(child: Text(value, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: MaanColors.navy))),
        ],
      ),
    );
  }
}
