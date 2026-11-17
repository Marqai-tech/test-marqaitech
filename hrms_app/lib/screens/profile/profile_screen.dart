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
    // Task 139 — the real birth date used for birthday wishes
    add('Original Birthday', () { final d = DateTime.tryParse('${e?['originalBirthday'] ?? ''}'); return d != null ? DateFormat('dd-MMM-yyyy').format(d) : null; }());
    add('Address', _s(e?['address']));
    return rows;
  }

  /// Task 139 — structured sections mirroring the employee module: interests,
  /// technical skills, experience (+domains/letters), achievements, family.
  List<Widget> _paritySections() {
    final e = _employee;
    final widgets = <Widget>[];

    // ── Interests ──
    final interests = '${e?['interests'] ?? ''}'.split(',').map((s) => s.trim()).where((s) => s.isNotEmpty).toList();
    if (interests.isNotEmpty) {
      widgets.add(_containerCard('Interests', Icons.interests_rounded, Wrap(spacing: 8, runSpacing: 8, children: interests.map((i) => Chip(label: Text(i, style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600)), backgroundColor: MaanColors.primary.withOpacity(.08), side: BorderSide.none, visualDensity: VisualDensity.compact)).toList())));
      widgets.add(const SizedBox(height: 14));
    }

    // ── Technical Skills ──
    final skills = (e?['skills'] as List?) ?? const [];
    if (skills.isNotEmpty) {
      widgets.add(_containerCard('Technical Skills', Icons.handyman_rounded, Column(crossAxisAlignment: CrossAxisAlignment.start, children: skills.map((s) {
        final m = Map<String, dynamic>.from(s as Map);
        final level = '${m['level'] ?? ''}';
        final yrs = m['yearsOfExp']?.toString() ?? '';
        final tag = [if (level.isNotEmpty && level != 'intermediate') level[0].toUpperCase() + level.substring(1), if (yrs.isNotEmpty && yrs != 'null') '$yrs y'].where((x) => x.isNotEmpty).join(' · ');
        return Padding(padding: const EdgeInsets.only(bottom: 6), child: Row(children: [
          Container(width: 8, height: 8, decoration: BoxDecoration(shape: BoxShape.circle, color: MaanColors.primary.withOpacity(.7))),
          const SizedBox(width: 8),
          Expanded(child: Text('${m['skill'] ?? ''}', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: MaanColors.navy))),
          if (tag.isNotEmpty) Text(tag, style: MaanText.caption.copyWith(fontSize: 11)),
        ]));
      }).toList())));
      widgets.add(const SizedBox(height: 14));
    }

    // ── Experience (domains + letters count) ──
    final experiences = (e?['experiences'] as List?) ?? const [];
    if (experiences.isNotEmpty) {
      widgets.add(_containerCard('Experience', Icons.work_history_rounded, Column(crossAxisAlignment: CrossAxisAlignment.start, children: experiences.map((x) {
        final m = Map<String, dynamic>.from(x as Map);
        List<String> domains = const [];
        try {
          final raw = m['domains'];
          if (raw is List) domains = raw.map((d) => d.toString()).toList();
        } catch (_) {}
        int letters = 0;
        try {
          final raw = m['letters'];
          if (raw is List) letters = raw.length;
        } catch (_) {}
        final start = DateTime.tryParse('${m['startDate'] ?? ''}');
        final end = (m['isCurrent'] == true) ? null : DateTime.tryParse('${m['endDate'] ?? ''}');
        String dur = '';
        if (start != null) {
          final to = end ?? DateTime.now();
          var months = (to.year - start.year) * 12 + (to.month - start.month);
          if (to.day < start.day) months -= 1;
          if (months > 0) dur = ' · ${months ~/ 12}y ${months % 12}m';
        }
        return Padding(padding: const EdgeInsets.only(bottom: 10), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('${m['company'] ?? ''}${m['isCurrent'] == true ? '  (Current)' : ''}', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: MaanColors.navy)),
          Text('${m['designation'] ?? ''}$dur', style: MaanText.caption.copyWith(fontSize: 11.5)),
          if (domains.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 4), child: Wrap(spacing: 6, runSpacing: 4, children: domains.map((d) => Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2), decoration: BoxDecoration(color: Colors.amber.shade50, borderRadius: BorderRadius.circular(999)), child: Text(d, style: TextStyle(fontSize: 10, color: Colors.amber.shade900, fontWeight: FontWeight.w600)))).toList())),
          if (letters > 0) Padding(padding: const EdgeInsets.only(top: 4), child: Text('$letters letter${letters == 1 ? '' : 's'} attached (view on web)', style: MaanText.caption.copyWith(fontSize: 10.5))),
        ]));
      }).toList())));
      widgets.add(const SizedBox(height: 14));
    }

    // ── Achievements ──
    final achievements = (e?['achievements'] as List?) ?? const [];
    if (achievements.isNotEmpty) {
      widgets.add(_containerCard('Achievements', Icons.emoji_events_rounded, Column(crossAxisAlignment: CrossAxisAlignment.start, children: achievements.map((a) {
        final m = Map<String, dynamic>.from(a as Map);
        final on = DateTime.tryParse('${m['achievedOn'] ?? ''}');
        return Padding(padding: const EdgeInsets.only(bottom: 8), child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Icon(Icons.star_rounded, size: 15, color: Colors.amber),
          const SizedBox(width: 8),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('${m['title'] ?? ''}', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: MaanColors.navy)),
            Text(['${m['issuer'] ?? ''}', if (on != null) DateFormat('MMM yyyy').format(on)].where((s) => s.isNotEmpty).join(' · '), style: MaanText.caption.copyWith(fontSize: 11)),
          ])),
        ]));
      }).toList())));
      widgets.add(const SizedBox(height: 14));
    }

    // ── Family Details (medical insurance) ──
    final dependents = (e?['dependents'] as List?) ?? const [];
    if (dependents.isNotEmpty) {
      widgets.add(_containerCard('Family Details (Medical Insurance)', Icons.family_restroom_rounded, Column(crossAxisAlignment: CrossAxisAlignment.start, children: dependents.map((d) {
        final m = Map<String, dynamic>.from(d as Map);
        final dob = DateTime.tryParse('${m['dateOfBirth'] ?? ''}');
        return Padding(padding: const EdgeInsets.only(bottom: 6), child: Text('${m['name'] ?? ''} · ${m['relation'] ?? m['relationship'] ?? ''}${dob != null ? ' · ${DateFormat('dd-MMM-yyyy').format(dob)}' : ''}', style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: MaanColors.navy)));
      }).toList())));
      widgets.add(const SizedBox(height: 14));
    }

    return widgets;
  }

  Widget _containerCard(String title, IconData icon, Widget child) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(20), border: Border.all(color: MaanColors.line)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(width: 32, height: 32, decoration: BoxDecoration(color: MaanColors.primary.withOpacity(.1), borderRadius: BorderRadius.circular(9)), child: Icon(icon, color: MaanColors.primary, size: 17)),
          const SizedBox(width: 10),
          Text(title, style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w800, color: MaanColors.navy)),
        ]),
        const SizedBox(height: 10),
        child,
      ]),
    );
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
      final resp = await ApiService.updateMe(avatar: dataUrl);
      if (mounted) {
        // Refresh both the employee card and the auth identity.
        context.read<AuthProvider>().reloadFromStorage();
        await _load();
        // Task 139 — employee photos now need HR/Admin confirmation
        if (resp['avatarPending'] == true) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Photo submitted — visible to others after HR/Admin approval'),
            backgroundColor: Colors.orange,
          ));
        } else {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Profile photo updated'), backgroundColor: Colors.green));
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString().replaceAll('Exception: ', '')), backgroundColor: Colors.red));
      }
    }
    if (mounted) setState(() => _uploading = false);
  }

  // ── Task 134: Change Password dialog ─────────────────────────────────────
  // Mirrors the web modal: current + new + confirm, show/hide toggles,
  // client-side validation, then ApiService.changePassword (server re-verifies
  // the current password and mirror-syncs the new hash across tenant +
  // platform DBs so the NEXT login works on every host).
  void _showChangePasswordDialog() {
    final currentCtrl = TextEditingController();
    final newCtrl = TextEditingController();
    final confirmCtrl = TextEditingController();
    bool obscureCurrent = true;
    bool obscureNew = true;
    bool obscureConfirm = true;
    bool submitting = false;
    String? error;

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (dialogCtx) {
        return StatefulBuilder(
          builder: (dialogCtx, setDialogState) {
            String? validate() {
              if (currentCtrl.text.isEmpty) return 'Please enter your current password.';
              if (newCtrl.text.isEmpty) return 'Please enter a new password.';
              if (newCtrl.text.length < 8) return 'New password must be at least 8 characters.';
              if (newCtrl.text == currentCtrl.text) return 'New password must be different from the current password.';
              if (newCtrl.text != confirmCtrl.text) return 'New password and confirmation do not match.';
              return null;
            }

            Future<void> submit() async {
              final problem = validate();
              if (problem != null) {
                setDialogState(() => error = problem);
                return;
              }
              setDialogState(() { error = null; submitting = true; });
              try {
                await ApiService.changePassword(
                  currentPassword: currentCtrl.text,
                  newPassword: newCtrl.text,
                );
                if (!dialogCtx.mounted) return;
                Navigator.of(dialogCtx).pop();
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Password changed successfully'), backgroundColor: Colors.green),
                );
              } catch (e) {
                setDialogState(() {
                  submitting = false;
                  error = e.toString().replaceAll('Exception: ', '');
                });
              }
            }

            Widget field({
              required String label,
              required TextEditingController controller,
              required bool obscure,
              required ValueChanged<bool> onToggle,
              required String hint,
            }) {
              return Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(label, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: MaanColors.navy)),
                    const SizedBox(height: 6),
                    TextField(
                      controller: controller,
                      obscureText: obscure,
                      enabled: !submitting,
                      onChanged: (_) { if (error != null) setDialogState(() => error = null); },
                      decoration: InputDecoration(
                        hintText: hint,
                        hintStyle: TextStyle(fontSize: 13, color: Colors.grey.shade400),
                        counterText: '',
                        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: MaanColors.line)),
                        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: MaanColors.primary)),
                        suffixIcon: IconButton(
                          icon: Icon(obscure ? Icons.visibility_off_outlined : Icons.visibility_outlined, size: 20, color: Colors.grey.shade500),
                          onPressed: () => onToggle(!obscure),
                        ),
                      ),
                    ),
                  ],
                ),
              );
            }

            return AlertDialog(
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
              titlePadding: const EdgeInsets.fromLTRB(20, 18, 12, 0),
              contentPadding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
              actionsPadding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
              title: Row(
                children: [
                  Container(
                    width: 34, height: 34,
                    decoration: BoxDecoration(color: MaanColors.primary.withOpacity(.1), borderRadius: BorderRadius.circular(10)),
                    child: const Icon(Icons.lock_outline_rounded, size: 18, color: MaanColors.primary),
                  ),
                  const SizedBox(width: 10),
                  const Expanded(child: Text('Change Password', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: MaanColors.navy))),
                  IconButton(
                    onPressed: submitting ? null : () => Navigator.of(dialogCtx).pop(),
                    icon: const Icon(Icons.close_rounded, size: 20),
                  ),
                ],
              ),
              content: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Use at least 8 characters. Your session stays signed in.', style: TextStyle(fontSize: 11.5, color: Colors.black45)),
                    const SizedBox(height: 12),
                    field(label: 'Current Password', controller: currentCtrl, obscure: obscureCurrent, onToggle: (v) => setDialogState(() => obscureCurrent = v), hint: 'Enter your current password'),
                    field(label: 'New Password', controller: newCtrl, obscure: obscureNew, onToggle: (v) => setDialogState(() => obscureNew = v), hint: 'At least 8 characters'),
                    field(label: 'Confirm New Password', controller: confirmCtrl, obscure: obscureConfirm, onToggle: (v) => setDialogState(() => obscureConfirm = v), hint: 'Re-enter the new password'),
                    if (error != null)
                      Container(
                        width: double.infinity,
                        margin: const EdgeInsets.only(bottom: 12),
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(color: Colors.red.shade50, borderRadius: BorderRadius.circular(10)),
                        child: Text(error!, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xFFDC2626))),
                      ),
                  ],
                ),
              ),
              actions: [
                TextButton(
                  onPressed: submitting ? null : () => Navigator.of(dialogCtx).pop(),
                  child: const Text('Cancel'),
                ),
                FilledButton(
                  style: FilledButton.styleFrom(backgroundColor: MaanColors.primary, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18))),
                  onPressed: submitting ? null : submit,
                  child: submitting
                      ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                      : const Text('Update Password', style: TextStyle(fontWeight: FontWeight.w700)),
                ),
              ],
            );
          },
        );
      },
    );
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
                  const SizedBox(height: 14),
                  // Task 139 — parity with the employee add/edit/view module
                  ..._paritySections(),
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
          // Task 139 — pending photo approval badge
          if ('${_employee?['avatarPendingAt'] ?? ''}'.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Row(children: [
                Icon(Icons.hourglass_top_rounded, size: 14, color: Colors.orange.shade700),
                const SizedBox(width: 6),
                Expanded(child: Text('New photo pending HR/Admin approval — other employees still see your current photo',
                    style: TextStyle(fontSize: 11, color: Colors.orange.shade800, fontWeight: FontWeight.w600))),
              ]),
            ),
          // Task 134 — self-service password change, available to EVERY role.
          const SizedBox(height: 10),
          SizedBox(
            width: double.infinity,
            height: 44,
            child: OutlinedButton.icon(
              style: OutlinedButton.styleFrom(
                foregroundColor: MaanColors.primary,
                side: BorderSide(color: MaanColors.primary.withOpacity(.45)),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
              ),
              onPressed: _showChangePasswordDialog,
              icon: const Icon(Icons.lock_outline_rounded, size: 18),
              label: const Text('Change Password', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
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
