import 'package:flutter/material.dart';
import '../config/maan_theme.dart';
import '../services/api_service.dart';

// ═══════════════════ Task 142: pre-login Contact HR ticket sheet ═══════════════════

class ContactHrIssue {
  final String key;
  final String label;
  final IconData icon;
  const ContactHrIssue(this.key, this.label, this.icon);
}

const List<ContactHrIssue> kContactHrIssues = [
  ContactHrIssue('otp_not_received', 'OTP not received', Icons.sms_failed_rounded),
  ContactHrIssue('signin_problem', 'Sign-in problem', Icons.login_rounded),
  ContactHrIssue('account_locked', 'Account locked', Icons.lock_person_rounded),
  ContactHrIssue('password_reset', 'Password reset', Icons.password_rounded),
  ContactHrIssue('employee_id_unknown', 'Unknown Employee ID', Icons.badge_rounded),
  ContactHrIssue('other', 'Other issue', Icons.help_outline_rounded),
];

/// The login screen's Contact HR button now RAISES A REAL HELP DESK TICKET:
/// the employee describes the issue (Employee ID optional), the ticket lands
/// in the workspace's Support & AI → Help Desk, and every HR / Admin / IT
/// Admin gets an in-app alert + an email (and an SMS nudge when a gateway is
/// configured). The sheet shows the ticket number on success.
class ContactHrSheet extends StatefulWidget {
  final String dialCode;
  const ContactHrSheet({this.dialCode = '+91'});

  @override
  State<ContactHrSheet> createState() => ContactHrSheetState();
}

class ContactHrSheetState extends State<ContactHrSheet> {
  final _id = TextEditingController();
  final _name = TextEditingController();
  final _contact = TextEditingController();
  final _desc = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  String _issue = 'otp_not_received';
  bool _busy = false;
  bool _done = false;
  String? _error;
  String? _ticketId;

  static const Color _violet = Color(0xFF7C3AED);

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() { _busy = true; _error = null; });
    try {
      final res = await ApiService.contactHrTicket(
        issueType: _issue,
        description: _desc.text.trim(),
        employeeId: _id.text.trim(),
        name: _name.text.trim(),
        contact: _contact.text.trim(),
        dialCode: widget.dialCode,
      );
      if (!mounted) return;
      setState(() {
        _busy = false;
        _done = true;
        _ticketId = res['ticketId']?.toString();
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = e.toString().replaceAll('Exception: ', '');
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(bottom: bottomInset),
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(22, 14, 22, 24),
          child: Form(
            key: _formKey,
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
              Center(child: Container(width: 44, height: 4.5, decoration: BoxDecoration(color: MaanColors.line, borderRadius: BorderRadius.circular(3)))),
              const SizedBox(height: 14),
              Row(children: [
                Container(width: 38, height: 38, decoration: BoxDecoration(color: _violet.withOpacity(.12), borderRadius: BorderRadius.circular(11)), child: const Icon(Icons.headset_mic_rounded, color: _violet, size: 21)),
                const SizedBox(width: 10),
                Expanded(child: Text('Raise a ticket to HR', style: MaanText.title.copyWith(fontSize: 16.5, fontWeight: FontWeight.w800))),
              ]),
              const SizedBox(height: 6),
              Text(
                'HR / Admin / IT Admin are alerted instantly (app notification + email). No sign-in needed.',
                style: MaanText.body.copyWith(fontSize: 12, height: 1.4),
              ),
              const SizedBox(height: 14),
              if (!_done) ...[
                Wrap(
                  spacing: 7,
                  runSpacing: 7,
                  children: [
                    for (final issue in kContactHrIssues)
                      InkWell(
                        borderRadius: BorderRadius.circular(18),
                        onTap: () => setState(() => _issue = issue.key),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 7),
                          decoration: BoxDecoration(
                            color: _issue == issue.key ? _violet : const Color(0xFFF4F4FB),
                            borderRadius: BorderRadius.circular(18),
                            border: Border.all(color: _issue == issue.key ? _violet : MaanColors.line),
                          ),
                          child: Row(mainAxisSize: MainAxisSize.min, children: [
                            Icon(issue.icon, size: 14, color: _issue == issue.key ? Colors.white : MaanColors.faint),
                            const SizedBox(width: 5),
                            Text(issue.label, style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: _issue == issue.key ? Colors.white : MaanColors.navy)),
                          ]),
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 12),
                MaanField(label: 'Employee ID (optional)', hint: 'e.g. EMP-3000', controller: _id, keyboard: TextInputType.emailAddress),
                const SizedBox(height: 10),
                MaanField(label: 'Your name (optional)', hint: 'Full name', controller: _name, keyboard: TextInputType.name, textCapitalization: TextCapitalization.words),
                const SizedBox(height: 10),
                MaanField(label: 'Email or phone to reach you (optional)', hint: 'you@company.com or 98765 43210', controller: _contact, keyboard: TextInputType.emailAddress),
                const SizedBox(height: 10),
                MaanField(
                  label: 'Describe the issue *',
                  hint: 'What happened? e.g. "OTP never arrives, not even in spam"',
                  controller: _desc,
                  maxLines: 3,
                  validator: (v) => (v == null || v.trim().length < 10) ? 'Please describe the issue (min 10 characters)' : null,
                ),
                if (_error != null) ...[
                  const SizedBox(height: 10),
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(color: const Color(0xFFFDF0F0), borderRadius: BorderRadius.circular(10)),
                    child: Text(_error!, style: const TextStyle(color: Color(0xFFC04747), fontSize: 12, height: 1.35)),
                  ),
                ],
                const SizedBox(height: 14),
                SizedBox(
                  height: 48,
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: _busy ? null : _submit,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: _violet,
                      foregroundColor: Colors.white,
                      disabledBackgroundColor: const Color(0xFFC4B5FD),
                      elevation: 0,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(13)),
                    ),
                    child: _busy
                        ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2.2, color: Colors.white))
                        : const Text('Send ticket to HR', style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w800)),
                  ),
                ),
              ] else ...[
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(color: const Color(0xFFEFFAF3), borderRadius: BorderRadius.circular(12), border: Border.all(color: const Color(0xFFBFE8CD))),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      Container(width: 34, height: 34, decoration: const BoxDecoration(color: Color(0xFF10B981), shape: BoxShape.circle), child: const Icon(Icons.check_rounded, color: Colors.white, size: 20)),
                      const SizedBox(width: 10),
                      Expanded(child: Text('Ticket ${_ticketId ?? ''} raised', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: Color(0xFF0B7A46)))),
                    ]),
                    const SizedBox(height: 8),
                    const Text(
                      'HR / Admin / IT Admin have been alerted by app notification and email. You can also reply to the ticket from a colleague\'s login — Support & AI → Help Desk.',
                      style: TextStyle(fontSize: 12, height: 1.45, color: Color(0xFF0B7A46)),
                    ),
                  ]),
                ),
                const SizedBox(height: 12),
                SizedBox(
                  height: 44,
                  width: double.infinity,
                  child: OutlinedButton(
                    onPressed: () => Navigator.pop(context),
                    style: OutlinedButton.styleFrom(side: const BorderSide(color: MaanColors.line), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
                    child: const Text('Close', style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: MaanColors.navy)),
                  ),
                ),
              ],
            ]),
          ),
        ),
      ),
    );
  }

  @override
  void dispose() {
    _id.dispose();
    _name.dispose();
    _contact.dispose();
    _desc.dispose();
    super.dispose();
  }
}
