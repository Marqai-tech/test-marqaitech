import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';
import '../../config/maan_theme.dart';
import '../../config/api_config.dart';
import '../../services/local_employee_store.dart';

/// Add Employee — matches design screenshot #7
/// (avatar, Joining Date, Employee ID, Full Name, Mobile, Designation,
///  Working Day, Basic Pay + Per Day/Monthly, Gender, Reference, Save).
class AddEmployeeScreen extends StatefulWidget {
  const AddEmployeeScreen({super.key});

  @override
  State<AddEmployeeScreen> createState() => _AddEmployeeScreenState();
}

class _AddEmployeeScreenState extends State<AddEmployeeScreen> {
  final _formKey = GlobalKey<FormState>();
  final _joiningDate = TextEditingController(text: '01/10/2026');
  final _employeeId = TextEditingController(text: '1254');
  final _fullName = TextEditingController();
  final _mobile = TextEditingController();
  final _basicPay = TextEditingController();
  final _reference = TextEditingController();

  String _designation = 'Designer';
  String _workingDay = 'Mon, Tue, Wed, Thu, San';
  String _gender = 'Male';
  String _payType = 'Per Day';
  bool _saving = false;

  static const _designations = ['Designer', 'Developer', 'HR Executive', 'Manager', 'Accountant', 'Sales', 'Support'];
  static const _workingDays = ['Mon, Tue, Wed, Thu, San', 'Mon - Sat', 'Mon - Fri', 'Custom'];

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: DateTime.now(),
      firstDate: DateTime(2015),
      lastDate: DateTime(2035),
      builder: (context, child) => Theme(
        data: Theme.of(context).copyWith(colorScheme: const ColorScheme.light(primary: MaanColors.primary)),
        child: child!,
      ),
    );
    if (picked != null) {
      setState(() => _joiningDate.text = '${picked.day.toString().padLeft(2, '0')}/${picked.month.toString().padLeft(2, '0')}/${picked.year}');
    }
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _saving = true);

    final record = {
      'fullName': _fullName.text.trim(),
      'employeeId': _employeeId.text.trim(),
      'joiningDate': _joiningDate.text.trim(),
      'mobile': _mobile.text.trim(),
      'designation': _designation,
      'workingDay': _workingDay,
      'basicPay': _basicPay.text.trim(),
      'payType': _payType == 'Per Day' ? 'Per Day' : 'Monthly',
      'gender': _gender,
      'reference': _reference.text.trim(),
      'addedAt': DateTime.now().toIso8601String(),
    };

    await LocalEmployeeStore.add(record);

    // Best-effort sync to the workspace API when a session token exists.
    String? note;
    try {
      final token = ApiConfig.apiUrl;
      final res = await http
          .post(
            Uri.parse(token.endsWith('/api') ? '$token/employees' : '$token/api/employees'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({'firstName': record['fullName'], 'email': 'emp${record['employeeId']}@mobile.local'}),
          )
          .timeout(const Duration(seconds: 12));
      if (res.statusCode >= 200 && res.statusCode < 300) note = 'Employee saved & synced to workspace';
    } catch (_) {
      note = 'Employee saved on this device (workspace offline)';
    }

    if (!mounted) return;
    setState(() => _saving = false);
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(note ?? 'Employee saved')));
    Navigator.pop(context);
  }

  InputDecoration _dec(String label, {Widget? suffix, String? hint}) => InputDecoration(
        labelText: label,
        hintText: hint,
        floatingLabelStyle: const TextStyle(color: MaanColors.navy, fontSize: 13),
        hintStyle: MaanText.hint,
        suffixIcon: suffix,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        filled: true,
        fillColor: Colors.white,
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: MaanColors.line)),
        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: MaanColors.primary, width: 1.4)),
      );

  DropdownButtonFormField<String> _dropdown(String label, String value, List<String> items, ValueChanged<String?> onChanged) {
    return DropdownButtonFormField<String>(
      value: value,
      items: items.map((e) => DropdownMenuItem(value: e, child: Text(e, style: const TextStyle(fontSize: 14)))).toList(),
      onChanged: onChanged,
      icon: const Icon(Icons.keyboard_arrow_down, color: MaanColors.faint),
      decoration: _dec(label),
      style: const TextStyle(fontSize: 14.5, color: MaanColors.navy),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: MaanColors.primary,
      body: Column(
        children: [
          SafeArea(
            bottom: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(8, 4, 24, 20),
              child: Row(
                children: [
                  IconButton(onPressed: () => Navigator.maybePop(context), icon: const Icon(Icons.arrow_back, color: Colors.white)),
                  const SizedBox(width: 6),
                  const Text('Add Employee', style: TextStyle(color: Colors.white, fontSize: 19, fontWeight: FontWeight.w800)),
                ],
              ),
            ),
          ),
          Expanded(
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.fromLTRB(20, 24, 20, 0),
              decoration: const BoxDecoration(
                color: MaanColors.pageBg,
                borderRadius: BorderRadius.only(topLeft: Radius.circular(30), topRight: Radius.circular(30)),
              ),
              child: Form(
                key: _formKey,
                child: SingleChildScrollView(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.center,
                        children: [
                          Stack(
                            children: [
                              Container(
                                width: 84,
                                height: 84,
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  color: const Color(0xFFE9E6FD),
                                  border: Border.all(color: MaanColors.primary, width: 3),
                                ),
                                child: const Icon(Icons.face, size: 44, color: MaanColors.primary),
                              ),
                              Positioned(
                                right: 0,
                                bottom: 0,
                                child: Container(
                                  width: 30,
                                  height: 30,
                                  decoration: BoxDecoration(
                                    color: MaanColors.primary,
                                    shape: BoxShape.circle,
                                    border: Border.all(color: Colors.white, width: 2.4),
                                  ),
                                  child: const Icon(Icons.add_a_photo, color: Colors.white, size: 15),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(width: 16),
                          Expanded(
                            child: Column(
                              children: [
                                TextFormField(
                                  controller: _joiningDate,
                                  readOnly: true,
                                  onTap: _pickDate,
                                  decoration: _dec('Joining Date', suffix: const Icon(Icons.calendar_today_outlined, size: 19, color: MaanColors.faint)),
                                  style: const TextStyle(fontSize: 14.5, color: MaanColors.navy),
                                ),
                                const SizedBox(height: 12),
                                TextFormField(
                                  controller: _employeeId,
                                  decoration: _dec('Employee ID'),
                                  style: const TextStyle(fontSize: 14.5, color: MaanColors.navy),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 14),
                      Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16)),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Employee Details', style: MaanText.title.copyWith(fontSize: 14)),
                            const SizedBox(height: 12),
                            TextFormField(
                              controller: _fullName,
                              decoration: _dec('Full Name', hint: 'Maan Theme'),
                              validator: (v) => (v == null || v.trim().isEmpty) ? 'Enter the full name' : null,
                              style: const TextStyle(fontSize: 14.5, color: MaanColors.navy),
                            ),
                            const SizedBox(height: 12),
                            TextFormField(
                              controller: _mobile,
                              decoration: _dec('Mobile Number', hint: '+1245 2458 1554 224'),
                              keyboardType: TextInputType.phone,
                              style: const TextStyle(fontSize: 14.5, color: MaanColors.navy),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 14),
                      _dropdown('Designation', _designation, _designations, (v) => setState(() => _designation = v!)),
                      const SizedBox(height: 14),
                      _dropdown('Working Day', _workingDay, _workingDays, (v) => setState(() => _workingDay = v!)),
                      const SizedBox(height: 14),
                      Row(
                        children: [
                          Expanded(
                            flex: 3,
                            child: TextFormField(
                              controller: _basicPay,
                              keyboardType: const TextInputType.numberWithOptions(decimal: true),
                              decoration: _dec('Basic Pay', hint: '\$00.00'),
                              style: const TextStyle(fontSize: 14.5, color: MaanColors.navy),
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            flex: 2,
                            child: _payToggle('Per Day', _payType == 'Per Day'),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            flex: 2,
                            child: _payToggle('Monthly', _payType == 'Monthly'),
                          ),
                        ],
                      ),
                      const SizedBox(height: 14),
                      _dropdown('Gender', _gender, ['Male', 'Female', 'Other'], (v) => setState(() => _gender = v!)),
                      const SizedBox(height: 14),
                      TextFormField(
                        controller: _reference,
                        decoration: _dec('Add Reference', hint: 'Enter Reference Name', suffix: const Icon(Icons.add, color: MaanColors.navy)),
                        style: const TextStyle(fontSize: 14.5, color: MaanColors.navy),
                      ),
                      const SizedBox(height: 26),
                      SizedBox(
                        height: 52,
                        child: ElevatedButton(
                          onPressed: _saving ? null : _save,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: MaanColors.primary,
                            foregroundColor: Colors.white,
                            elevation: 0,
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                          ),
                          child: _saving
                              ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white))
                              : const Text('Save', style: TextStyle(fontSize: 16.5, fontWeight: FontWeight.w700)),
                        ),
                      ),
                      const SizedBox(height: 30),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _payToggle(String label, bool active) {
    return GestureDetector(
      onTap: () => setState(() => _payType = label),
      child: Container(
        height: 50,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: active ? MaanColors.primary : Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: active ? MaanColors.primary : MaanColors.line),
        ),
        child: Text(
          label,
          style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: active ? Colors.white : MaanColors.navy),
        ),
      ),
    );
  }

  @override
  void dispose() {
    _joiningDate.dispose();
    _employeeId.dispose();
    _fullName.dispose();
    _mobile.dispose();
    _basicPay.dispose();
    _reference.dispose();
    super.dispose();
  }
}
