import 'dart:async';
import 'package:flutter/material.dart';
import '../../config/maan_theme.dart';
import '../../services/api_service.dart';
import '../../widgets/contact_hr_sheet.dart';

/// Task 141 — OTP verification (login design image #2, screen 4):
/// "Verify your number" with a 6-box code entry, resend countdown,
/// Verify & continue, and Change number.
/// Task 142 — the screen now reports WHICH channel actually carried the
/// code (SMS / email), shows the demo fallback code when the workspace has
/// no gateway configured yet, and offers a one-tap Contact HR ticket when
/// the code never arrives.
class OtpScreen extends StatefulWidget {
  final String phone;
  final String dialCode;
  final String maskedPhone;
  final String maskedEmail;
  final bool smsDelivered;
  final bool emailDelivered;
  final String? demoFallbackCode;

  const OtpScreen({
    super.key,
    required this.phone,
    required this.dialCode,
    required this.maskedPhone,
    required this.maskedEmail,
    this.smsDelivered = false,
    this.emailDelivered = false,
    this.demoFallbackCode,
  });

  @override
  State<OtpScreen> createState() => _OtpScreenState();
}

class _OtpScreenState extends State<OtpScreen> {
  static const int _length = 6;
  final List<TextEditingController> _controllers = List.generate(_length, (_) => TextEditingController());
  final List<FocusNode> _nodes = List.generate(_length, (_) => FocusNode());
  bool _busy = false;
  bool _resending = false;
  String? _error;
  int _secondsLeft = 30;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _startCooldown(30);
    // Auto-focus the first box so the keyboard is ready immediately.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && _nodes.isNotEmpty) _nodes.first.requestFocus();
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    for (final c in _controllers) {
      c.dispose();
    }
    for (final n in _nodes) {
      n.dispose();
    }
    super.dispose();
  }

  void _startCooldown(int seconds) {
    _timer?.cancel();
    setState(() => _secondsLeft = seconds);
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) {
        t.cancel();
        return;
      }
      if (_secondsLeft <= 1) {
        t.cancel();
        setState(() => _secondsLeft = 0);
      } else {
        setState(() => _secondsLeft -= 1);
      }
    });
  }

  String get _code => _controllers.map((c) => c.text.trim()).join();

  void _onChanged(int index, String value) {
    final digits = value.replaceAll(RegExp(r'\D'), '');
    if (digits.length > 1) {
      // Paste (or autofill) — spread across the boxes from the start.
      final chars = digits.split('');
      for (var i = 0; i < _length; i++) {
        _controllers[i].text = i < chars.length ? chars[i] : '';
      }
      setState(() => _error = null);
      final focus = chars.length >= _length ? _length - 1 : chars.length;
      _nodes[focus].requestFocus();
      if (chars.length >= _length) _submit();
      return;
    }
    _controllers[index].text = digits;
    setState(() => _error = null);
    if (digits.isNotEmpty && index < _length - 1) {
      _nodes[index + 1].requestFocus();
    } else if (digits.isEmpty && index > 0) {
      _nodes[index - 1].requestFocus();
    }
    if (_code.length == _length) _submit();
  }

  Future<void> _submit() async {
    final code = _code;
    if (code.length != _length || _busy) return;
    setState(() { _busy = true; _error = null; });
    try {
      await ApiService.verifyOtp(widget.phone, widget.dialCode, code);
      if (!mounted) return;
      // Session stored by ApiService.verifyOtp — hand control back to the
      // sign-in flow, which runs the post-login pipeline (biometric offer +
      // role routing) exactly like a password sign-in.
      Navigator.pop(context, true);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = e.toString().replaceAll('Exception: ', '');
      });
      // Shake: clear the boxes for a clean re-entry.
      for (final c in _controllers) { c.clear(); }
      _nodes.first.requestFocus();
    }
  }

  Future<void> _resend() async {
    if (_resending || _secondsLeft > 0) return;
    setState(() => _resending = true);
    try {
      await ApiService.requestOtp(widget.phone, widget.dialCode);
      if (!mounted) return;
      _startCooldown(30);
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('A new code is on its way — check your registered email.'),
        backgroundColor: Color(0xFF0EA5A6),
      ));
    } catch (e) {
      if (mounted) {
        setState(() => _error = e.toString().replaceAll('Exception: ', ''));
      }
    } finally {
      if (mounted) setState(() => _resending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0B1026),
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFF0B1026), Color(0xFF251D54), Color(0xFF3B2A7A)],
          ),
        ),
        child: SafeArea(
          child: Column(
            children: [
              // Header
              Padding(
                padding: const EdgeInsets.fromLTRB(8, 4, 24, 0),
                child: Row(
                  children: [
                    IconButton(
                      onPressed: () => Navigator.maybePop(context),
                      icon: const Icon(Icons.arrow_back, color: Colors.white),
                    ),
                    Container(
                      width: 40,
                      height: 40,
                      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(11)),
                      padding: const EdgeInsets.all(4),
                      child: Image.asset('assets/logos/logo-cubes.png', fit: BoxFit.contain),
                    ),
                    const SizedBox(width: 10),
                    const Text('Verification', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w800)),
                  ],
                ),
              ),
              Expanded(
                child: Container(
                  margin: const EdgeInsets.only(top: 22),
                  width: double.infinity,
                  padding: const EdgeInsets.fromLTRB(24, 30, 24, 0),
                  decoration: const BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.only(topLeft: Radius.circular(30), topRight: Radius.circular(30)),
                  ),
                  child: SingleChildScrollView(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Container(
                          width: 62,
                          height: 62,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                            color: const Color(0xFF8B5CF6).withOpacity(.12),
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(Icons.sms_rounded, color: Color(0xFF7C3AED), size: 30),
                        ),
                        const SizedBox(height: 18),
                        const Text(
                          'Verify your number',
                          textAlign: TextAlign.center,
                          style: TextStyle(fontSize: 21, fontWeight: FontWeight.w900, color: MaanColors.navy),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'Enter the 6-digit code we emailed to ${widget.maskedEmail}${widget.maskedPhone.isEmpty ? '' : ' from ${widget.maskedPhone}'}',
                          textAlign: TextAlign.center,
                          style: const TextStyle(fontSize: 13, height: 1.45, color: MaanColors.body),
                        ),
                        // Task 142 — honest channel status under the headline.
                        const SizedBox(height: 8),
                        _channelStatusChip(),
                        const SizedBox(height: 26),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                          children: [
                            for (var i = 0; i < _length; i++) _box(i),
                          ],
                        ),
                        if (_error != null) ...[
                          const SizedBox(height: 14),
                          Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(color: const Color(0xFFFDF0F0), borderRadius: BorderRadius.circular(10)),
                            child: Text(_error!, style: const TextStyle(color: Color(0xFFC04747), fontSize: 12.5, height: 1.4)),
                          ),
                        ],
                        // Task 142 — demo workspace with no gateway configured:
                        // surface the code so the flow stays testable.
                        if (widget.demoFallbackCode != null && widget.demoFallbackCode!.isNotEmpty) ...[
                          const SizedBox(height: 14),
                          Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(color: const Color(0xFFFFFBEB), borderRadius: BorderRadius.circular(10), border: Border.all(color: const Color(0xFFFDE68A))),
                            child: Column(children: [
                              const Text('DEMO WORKSPACE — SMS/email gateway not configured yet. Your code:', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Color(0xFF92400E)), textAlign: TextAlign.center),
                              const SizedBox(height: 6),
                              Text(widget.demoFallbackCode!, style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w900, letterSpacing: 6, color: Color(0xFF92400E))),
                            ]),
                          ),
                        ],
                        const SizedBox(height: 22),
                        SizedBox(
                          height: 52,
                          child: ElevatedButton(
                            onPressed: (_busy || _code.length != _length) ? null : _submit,
                            style: ElevatedButton.styleFrom(
                              backgroundColor: const Color(0xFF7C3AED),
                              foregroundColor: Colors.white,
                              disabledBackgroundColor: const Color(0xFFC4B5FD),
                              elevation: 0,
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                            ),
                            child: _busy
                                ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white))
                                : const Text('Verify & Continue', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
                          ),
                        ),
                        const SizedBox(height: 16),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(
                              _secondsLeft > 0 ? "Didn't get the code? Resend in 00:${_secondsLeft.toString().padLeft(2, '0')}" : "Didn't get the code?",
                              style: const TextStyle(fontSize: 12.5, color: MaanColors.body),
                            ),
                            if (_secondsLeft == 0)
                              GestureDetector(
                                onTap: _resending ? null : _resend,
                                child: const Text(
                                  '  Resend',
                                  style: TextStyle(fontSize: 12.5, color: Color(0xFF7C3AED), fontWeight: FontWeight.w800),
                                ),
                              ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Center(
                          child: TextButton(
                            onPressed: () => Navigator.pop(context, false),
                            child: const Text(
                              'Change number',
                              style: TextStyle(fontSize: 13, color: MaanColors.navy, fontWeight: FontWeight.w700),
                            ),
                          ),
                        ),
                        // Task 142 — one tap into the pre-login HR ticket form
                        // (raises a real ticket + alerts HR/Admin/IT).
                        Center(
                          child: TextButton.icon(
                            onPressed: () => showModalBottomSheet<void>(
                              context: context,
                              backgroundColor: Colors.white,
                              isScrollControlled: true,
                              shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
                            builder: (_) => const ContactHrSheet(),
                            ),
                            icon: const Icon(Icons.headset_mic_rounded, size: 17, color: Color(0xFF7C3AED)),
                            label: const Text(
                              'Still no code? Raise a ticket to HR',
                              style: TextStyle(fontSize: 12.5, color: Color(0xFF7C3AED), fontWeight: FontWeight.w700),
                            ),
                          ),
                        ),
                        const SizedBox(height: 10),
                        const Text(
                          'Keep this code private — 3Boxes HRMS or your HR team will never ask for it.',
                          textAlign: TextAlign.center,
                          style: TextStyle(fontSize: 11, color: MaanColors.faint),
                        ),
                        const SizedBox(height: 24),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// Task 142 — tells the user exactly which channel carried the code.
  Widget _channelStatusChip() {
    final sms = widget.smsDelivered;
    final email = widget.emailDelivered;
    final String text;
    final Color color;
    if (sms && email) {
      text = 'Sent by SMS and email';
      color = const Color(0xFF0B7A46);
    } else if (sms) {
      text = 'Sent by SMS to ${widget.maskedPhone}';
      color = const Color(0xFF0B7A46);
    } else if (email) {
      text = 'Sent to your email ${widget.maskedEmail} — check spam too';
      color = const Color(0xFF92400E);
    } else {
      text = 'Gateway not configured for this workspace — see options below';
      color = const Color(0xFF92400E);
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: color.withOpacity(.08),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(sms ? Icons.check_circle_rounded : Icons.mark_email_unread_rounded, size: 14, color: color),
        const SizedBox(width: 6),
        Flexible(child: Text(text, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: color))),
      ]),
    );
  }

  Widget _box(int i) {
    return SizedBox(
      width: 44,
      height: 56,
      child: TextField(
        controller: _controllers[i],
        focusNode: _nodes[i],
        keyboardType: TextInputType.number,
        textAlign: TextAlign.center,
        maxLength: 1,
        style: const TextStyle(fontSize: 21, fontWeight: FontWeight.w900, color: MaanColors.navy),
        decoration: InputDecoration(
          counterText: '',
          filled: true,
          fillColor: const Color(0xFFF7F7FE),
          contentPadding: EdgeInsets.zero,
          enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Color(0xFFE3DEF8))),
          focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Color(0xFF7C3AED), width: 1.6)),
        ),
        onChanged: (v) => _onChanged(i, v),
      ),
    );
  }
}
