import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../config/maan_theme.dart';
import '../../services/api_service.dart';

/// Add Employee — wired to POST /api/employees (web parity fields).
class AddEmployeeScreen extends StatefulWidget {
  const AddEmployeeScreen({super.key});

  @override
  State<AddEmployeeScreen> createState() => _AddEmployeeScreenState();
}

class _AddEmployeeScreenState extends State<AddEmployeeScreen> {
  final _formKey = GlobalKey<FormState>();
  final _employeeCode = TextEditingController();
  final _firstName = TextEditingController();
  final _lastName = TextEditingController();
  final _email = TextEditingController();
  final _phone = TextEditingController();

  List<dynamic> _departments = [];
  List<dynamic> _designations = [];
  String? _departmentId;
  String? _designationId;
  String _gender = 'male';
  DateTime _joining = DateTime.now();
  DateTime? _originalBirthday; // Task 136 — real birth date for celebrations
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _employeeCode.text = 'EMP${DateTime.now().millisecondsSinceEpoch.toString().substring(8)}';
    _loadLookups();
  }

  @override
  void dispose() {
    _employeeCode.dispose();
    _firstName.dispose();
    _lastName.dispose();
    _email.dispose();
    _phone.dispose();
    super.dispose();
  }

  Future<void> _loadLookups() async {
    try {
      final deps = await ApiService.getDepartments();
      if (mounted) setState(() => _departments = deps);
    } catch (_) {}
    try {
      final desigs = await ApiService.getDesignations();
      if (mounted) setState(() => _designations = desigs);
    } catch (_) {}
  }

  Future<void> _pickJoining() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _joining,
      firstDate: DateTime(_joining.year - 30),
      lastDate: DateTime(_joining.year + 2),
      builder: (context, child) => Theme(data: Theme.of(context).copyWith(colorScheme: const ColorScheme.light(primary: MaanColors.primary)), child: child!),
    );
    if (picked != null) setState(() => _joining = picked);
  }

  /// Task 136 — the employee's REAL birth date (birthday wishes fire on this
  /// day; the official as-per-records DOB is handled on the web module).
  Future<void> _pickOriginalBirthday() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _originalBirthday ?? DateTime(now.year - 25, now.month, now.day),
      firstDate: DateTime(now.year - 80),
      lastDate: now,
      builder: (context, child) => Theme(data: Theme.of(context).copyWith(colorScheme: const ColorScheme.light(primary: MaanColors.accentPink)), child: child!),
    );
    if (picked != null) setState(() => _originalBirthday = picked);
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() { _saving = true; _error = null; });
    try {
      await ApiService.createEmployee({
        'employeeId': _employeeCode.text.trim(),
        'firstName': _firstName.text.trim(),
        'lastName': _lastName.text.trim(),
        'email': _email.text.trim(),
        'phone': _phone.text.trim(),
        'departmentId': _departmentId,
        'designationId': _designationId,
        'dateOfJoining': '${_joining.year}-${_joining.month.toString().padLeft(2, '0')}-${_joining.day.toString().padLeft(2, '0')}',
        if (_originalBirthday != null)
          'originalBirthday': '${_originalBirthday!.year}-${_originalBirthday!.month.toString().padLeft(2, '0')}-${_originalBirthday!.day.toString().padLeft(2, '0')}',
        'gender': _gender,
        'status': 'active',
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Employee added successfully'), backgroundColor: Colors.green));
        Navigator.pop(context, true);
      }
    } catch (e) {
      setState(() { _saving = false; _error = e.toString().replaceAll('Exception: ', ''); });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: MaanColors.pageBg,
      body: Column(
        children: [
          MaanHeader(title: 'Add Employee', onBack: () => Navigator.maybePop(context)),
          Expanded(
            child: Container(
              width: double.infinity,
              margin: const EdgeInsets.only(top: 18),
              padding: const EdgeInsets.fromLTRB(20, 22, 20, 0),
              decoration: const BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.only(topLeft: Radius.circular(30), topRight: Radius.circular(30)),
              ),
              child: Form(
                key: _formKey,
                child: ListView(
                  padding: const EdgeInsets.only(bottom: 28),
                  children: [
                    _label('Employee ID'),
                    MaanField(label: 'Employee ID', controller: _employeeCode, validator: (v) => (v == null || v.trim().isEmpty) ? 'Required' : null),
                    const SizedBox(height: 14),
                    Row(children: [
                      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        _label('First Name'),
                        MaanField(label: 'First Name', controller: _firstName, validator: (v) => (v == null || v.trim().isEmpty) ? 'Required' : null),
                      ])),
                      const SizedBox(width: 10),
                      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        _label('Last Name'),
                        MaanField(label: 'Last Name', controller: _lastName),
                      ])),
                    ]),
                    const SizedBox(height: 14),
                    _label('Work Email'),
                    MaanField(label: 'Work Email', controller: _email, keyboard: TextInputType.emailAddress, validator: (v) => (v == null || !v.contains('@')) ? 'Enter a valid email' : null),
                    const SizedBox(height: 14),
                    _label('Phone'),
                    MaanField(label: 'Phone', controller: _phone, keyboard: TextInputType.phone, validator: (v) => (v == null || v.trim().length < 6) ? 'Enter a valid phone number' : null),
                    const SizedBox(height: 14),
                    _label('Department'),
                    _dropdown('Select department', _departmentId, _departments.map((d) => MapEntry(d['id'].toString(), d['name'].toString())).toList(), (v) => setState(() => _departmentId = v)),
                    const SizedBox(height: 14),
                    _label('Designation'),
                    _dropdown('Select designation', _designationId, _designations.map((d) => MapEntry(d['id'].toString(), (d['title'] ?? d['name'] ?? '').toString())).toList(), (v) => setState(() => _designationId = v)),
                    const SizedBox(height: 14),
                    _label('Date of Joining'),
                    InkWell(
                      borderRadius: BorderRadius.circular(12),
                      onTap: _pickJoining,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
                        decoration: BoxDecoration(border: Border.all(color: MaanColors.line), borderRadius: BorderRadius.circular(12)),
                        child: Row(children: [
                          const Icon(Icons.calendar_today_rounded, size: 16, color: MaanColors.primary),
                          const SizedBox(width: 10),
                          Text(DateFormat('dd MMM yyyy').format(_joining), style: MaanText.title.copyWith(fontSize: 14)),
                        ]),
                      ),
                    ),
                    const SizedBox(height: 14),
                    _label('Gender'),
                    Row(children: [
                      _genderChip('male', 'Male'),
                      const SizedBox(width: 10),
                      _genderChip('female', 'Female'),
                      const SizedBox(width: 10),
                      _genderChip('other', 'Other'),
                    ]),
                    const SizedBox(height: 14),
                    _label('Original Birthday (real birth date — used for birthday wishes)'),
                    InkWell(
                      borderRadius: BorderRadius.circular(12),
                      onTap: _pickOriginalBirthday,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
                        decoration: BoxDecoration(border: Border.all(color: MaanColors.line), borderRadius: BorderRadius.circular(12)),
                        child: Row(children: [
                          const Icon(Icons.cake_rounded, size: 16, color: MaanColors.accentPink),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              _originalBirthday != null ? DateFormat('dd MMM yyyy').format(_originalBirthday!) : 'Select real birth date (optional)',
                              style: MaanText.title.copyWith(fontSize: 14, color: _originalBirthday != null ? MaanColors.navy : MaanColors.faint),
                            ),
                          ),
                        ]),
                      ),
                    ),
                    if (_error != null) ...[
                      const SizedBox(height: 14),
                      Text(_error!, style: const TextStyle(color: Colors.red, fontSize: 12.5), textAlign: TextAlign.center),
                    ],
                    const SizedBox(height: 20),
                    FilledButton(
                      onPressed: _saving ? null : _submit,
                      style: FilledButton.styleFrom(backgroundColor: MaanColors.primary, minimumSize: const Size.fromHeight(48)),
                      child: _saving
                          ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2.4))
                          : const Text('Save Employee', style: TextStyle(fontWeight: FontWeight.w700)),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _label(String text) => Padding(
        padding: const EdgeInsets.only(bottom: 6, left: 2),
        child: Text(text.toUpperCase(), style: MaanText.caption.copyWith(fontSize: 10.5, fontWeight: FontWeight.w700, letterSpacing: .6)),
      );

  Widget _dropdown(String hint, String? value, List<MapEntry<String, String>> items, ValueChanged<String?> onChanged) {
    return DropdownButtonFormField<String>(
      value: value,
      hint: Text(hint, style: const TextStyle(fontSize: 13.5, color: MaanColors.faint)),
      isExpanded: true,
      decoration: InputDecoration(border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: MaanColors.line)), contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12)),
      items: items.map((e) => DropdownMenuItem(value: e.key, child: Text(e.value, style: const TextStyle(fontSize: 13.5), overflow: TextOverflow.ellipsis))).toList(),
      onChanged: onChanged,
      validator: (v) => v == null ? 'Required' : null,
    );
  }

  Widget _genderChip(String value, String label) {
    final selected = _gender == value;
    return Expanded(
      child: InkWell(
        borderRadius: BorderRadius.circular(11),
        onTap: () => setState(() => _gender = value),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 11),
          decoration: BoxDecoration(
            color: selected ? MaanColors.primary.withOpacity(.1) : Colors.white,
            border: Border.all(color: selected ? MaanColors.primary : MaanColors.line),
            borderRadius: BorderRadius.circular(11),
          ),
          child: Center(child: Text(label, style: MaanText.title.copyWith(fontSize: 13, color: selected ? MaanColors.primary : MaanColors.body))),
        ),
      ),
    );
  }
}
