import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/maan_theme.dart';
import '../../config/api_config.dart';
import '../../config/app_info.dart';
import '../../providers/auth_provider.dart';
import '../../services/api_service.dart';
import '../../services/biometric_service.dart';
import '../../services/storage_service.dart';
import '../../widgets/contact_hr_sheet.dart';
import 'otp_screen.dart';

/// Task 141 — Sign In redesigned to the approved login mock (image #2):
///  · violet gradient header with the 3Boxes HRMS logo
///  · segmented tabs: [ Mobile Number ] [ Employee ID ]
///  · Mobile Number tab → +91 selector + number + Continue → OTP screen
///  · Employee ID tab → ID/email + password + Save me + Forgot password
///  · Face ID / fingerprint unlock row + Contact HR link on both tabs
/// All existing engine behaviour is preserved: workspace auto-detection and
/// the Task 132 login ladder, country picker, biometric setup, demo hints.
class SignInScreen extends StatefulWidget {
  const SignInScreen({super.key});

  @override
  State<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends State<SignInScreen> {
  final _formKey = GlobalKey<FormState>();
  final _identity = TextEditingController();
  final _password = TextEditingController();
  final _phone = TextEditingController();
  // Task 142 — per-tab focus nodes: switching tabs now dismisses the numeric
  // keyboard that was open for the phone field and re-focusses the new field
  // with its OWN keyboard type (full letter+number keypad on Employee ID).
  final _identityFocus = FocusNode();
  final _phoneFocus = FocusNode();
  // Start from the PERSISTED workspace (restoreFromStorage() already ran in
  // main) — previously this always showed the demo URL, which overrode the
  // remembered tenant workspace on every sign-in.
  final _workspace = TextEditingController(text: ApiConfig.baseUrl);
  bool _mobileTab = true; // image #2 lands on the Mobile number tab
  bool _obscure = true;
  bool _saveMe = false;
  bool _showAdvanced = false;
  bool _busy = false;
  bool _otpBusy = false;
  String? _error;
  // Task 127 — WORKING country-code selector (India is the default).
  String _dialCode = '+91';
  String _countryFlag = '🇮🇳';
  String _countryName = 'India';
  // Task 113 — biometric login (design #06).
  bool _biometricAvailable = false;
  bool _bioAutoPrompted = false;

  @override
  void initState() {
    super.initState();
    _saveMe = StorageService.getRememberMe();
    _restoreRemembered();
    _checkBiometric();
  }

  /// Task 142 — remember-me restore that KNOWS which tab the saved value
  /// belongs to. Previously a saved Employee ID fell into the phone field
  /// (the only non-@ branch), so the saved identity appeared "lost".
  void _restoreRemembered() {
    if (!_saveMe) return;
    final remembered = StorageService.getRememberedEmail();
    if (remembered == null || remembered.isEmpty) return;
    if (StorageService.getRememberedKind() == 'phone') {
      _mobileTab = true;
      _phone.text = remembered;
      final dial = StorageService.getRememberedDial();
      if (dial.isNotEmpty) {
        _dialCode = dial;
        final match = _kCountries.where((c) => c.dial == dial).toList();
        if (match.isNotEmpty) {
          _countryFlag = match.first.flag;
          _countryName = match.first.name;
        }
      }
    } else {
      _mobileTab = false;
      _identity.text = remembered;
      // Task 142 (main agent) — prefill the remembered password too so the
      // Employee ID tab is ready for one-tap sign-in.
      final rememberedPassword = StorageService.getRememberedPassword();
      if (rememberedPassword != null && rememberedPassword.isNotEmpty) {
        _password.text = rememberedPassword;
      }
    }
  }

  /// Task 142 — persist (or clear) the login identity across BOTH tabs.
  Future<void> _persistRemembered({required bool phoneTab}) async {
    if (_saveMe) {
      await StorageService.setRememberMe(true);
      if (phoneTab) {
        await StorageService.setRememberedKind('phone');
        await StorageService.setRememberedEmail(_phone.text.trim());
        await StorageService.setRememberedDial(_dialCode);
      } else {
        await StorageService.setRememberedKind('identity');
        await StorageService.setRememberedEmail(_identity.text.trim());
        // Task 142 (main agent) — "Remember me" auto-saves the FULL login:
        // the password prefills on the next launch too.
        await StorageService.setRememberedPassword(_password.text);
      }
    } else {
      // Unchecked: wipe any previously saved login so the next launch
      // starts clean (the old code kept the stale value forever).
      await StorageService.setRememberMe(false);
      await StorageService.setRememberedEmail('');
      await StorageService.setRememberedPassword('');
      await StorageService.setRememberedKind('identity');
    }
  }

  /// Task 142 — tab switch that fixes the "numeric keypad sticks" bug:
  /// drop focus (keyboard closes) BEFORE the fields swap, then re-open the
  /// keyboard on the new field with the correct input type after the frame.
  void _switchTab({required bool mobile}) {
    FocusScope.of(context).unfocus();
    setState(() {
      _mobileTab = mobile;
      _error = null;
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      (mobile ? _phoneFocus : _identityFocus).requestFocus();
    });
  }

  Future<void> _checkBiometric() async {
    final available = await BiometricService.isAvailable();
    if (!mounted) return;
    setState(() => _biometricAvailable = available);
    // Auto-prompt ONCE when biometric unlock was set up and a session is
    // still stored — "Login Now" becomes just a fingerprint touch.
    if (available &&
        BiometricService.isEnabled() &&
        (StorageService.getToken()?.isNotEmpty ?? false) &&
        !_bioAutoPrompted) {
      _bioAutoPrompted = true;
      await _biometricUnlock(autoPrompt: true);
    }
  }

  /// Fingerprint unlock of the stored session (image #2 "Face ID / fingerprint").
  Future<void> _biometricUnlock({bool autoPrompt = false}) async {
    if (_busy) return;
    final ok = await BiometricService.authenticate();
    if (!mounted) return;
    if (!ok) return; // user cancelled / failed — normal sign-in stays
    if (!autoPrompt) setState(() => _busy = true);
    final token = StorageService.getToken();
    if (token == null || token.isEmpty) {
      // No session to unlock — ask for credentials once (design dialog).
      if (!autoPrompt) setState(() => _busy = false);
      await _setupBiometricDialog();
      return;
    }
    // Validate the stored session before trusting it (server TTL).
    final valid = await ApiService.validateSession();
    if (!mounted) return;
    if (!valid) {
      // Task 131: KEEP the biometric flag on — the user just signs in once
      // more (identity prefilled); with the 30-day mobile session this is rare.
      try { await context.read<AuthProvider>().logout(); } catch (_) {}
      if (!autoPrompt) setState(() => _busy = false);
      setState(() => _error = 'Your session has expired — sign in once more with your password (identity is prefilled) and fingerprint login keeps working.');
      return;
    }
    final fresh = await ApiService.refreshStoredUser();
    if (!mounted) return;
    if (fresh != null) context.read<AuthProvider>().adoptUser(fresh);
    final role = context.read<AuthProvider>().user?.role;
    final target = role == 'super_admin' ? '/tenant-picker' : '/home-new';
    Navigator.pushNamedAndRemoveUntil(context, target, (_) => false);
  }

  /// Task 113 modal: "Setup Biometric Login" — verify identity + password
  /// once, then switch the fingerprint flag on. No password is stored.
  Future<void> _setupBiometricDialog() async {
    final identityCtrl = TextEditingController(text: _identity.text.trim());
    final passCtrl = TextEditingController();
    bool obscure = true;
    String? dialogError;
    bool setting = false;

    final enabled = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          backgroundColor: Colors.white,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
          title: Text('Setup Biometric Login', style: MaanText.title.copyWith(fontSize: 17)),
          content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('To enable fingerprint login, please enter your email and password once.',
                style: MaanText.body.copyWith(fontSize: 12.5, height: 1.4)),
            const SizedBox(height: 14),
            TextField(
              controller: identityCtrl,
              keyboardType: TextInputType.emailAddress,
              decoration: const InputDecoration(hintText: 'Enter your email', isDense: true),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: passCtrl,
              obscureText: obscure,
              decoration: InputDecoration(
                hintText: 'Enter your password',
                isDense: true,
                suffixIcon: IconButton(
                  icon: Icon(obscure ? Icons.visibility_off : Icons.visibility, size: 18, color: MaanColors.faint),
                  onPressed: () => setDialogState(() => obscure = !obscure),
                ),
              ),
            ),
            if (dialogError != null) ...[
              const SizedBox(height: 10),
              Text(dialogError!, style: const TextStyle(color: Color(0xFFC04747), fontSize: 11.5)),
            ],
          ]),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              style: FilledButton.styleFrom(backgroundColor: MaanColors.primary),
              onPressed: setting
                  ? null
                  : () async {
                      setDialogState(() { setting = true; dialogError = null; });
                      final email = identityCtrl.text.trim();
                      final ws = ApiConfig.normalizeWorkspaceUrl(_workspace.text) ?? '';
                      ApiConfig.setBaseUrl(ws.isEmpty ? ApiConfig.defaultBaseUrl : ws);
                      final isPhone = !email.contains('@') && RegExp(r'^[\+]?[\d\s\-\(\)]{6,}$').hasMatch(email);
                      final ok = await context.read<AuthProvider>().login(email, passCtrl.text, dialCode: isPhone ? _dialCode : null);
                      if (!ctx.mounted) return;
                      if (ok) {
                        Navigator.pop(ctx, true);
                      } else {
                        setDialogState(() {
                          setting = false;
                          dialogError = context.read<AuthProvider>().error ?? 'Invalid credentials — try again.';
                        });
                      }
                    },
              child: setting
                  ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Text('Setup', style: TextStyle(fontWeight: FontWeight.w800)),
            ),
          ],
        ),
      ),
    );

    if (enabled == true) {
      await BiometricService.setEnabled(true);
      if (!mounted) return;
      final role = context.read<AuthProvider>().user?.role;
      final target = role == 'super_admin' ? '/tenant-picker' : '/home-new';
      Navigator.pushNamedAndRemoveUntil(context, target, (_) => false);
    }
  }

  // Task 110b — the in-app "Download latest APK" link was REMOVED per user
  // request (it kept landing on stale/404 URLs and confused the update path).
  // The WEB LOGIN PAGE is the single download source now; this screen only
  // shows the installed version so the user knows which build they run.

  /// Task 127 — country picker: tapping the +91 prefix opens a bottom sheet
  /// with dial codes; India leads the list.
  Future<void> _pickCountry() async {
    final picked = await showModalBottomSheet<_Country>(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (_) => const _CountryPickerSheet(),
    );
    if (picked == null || !mounted) return;
    setState(() {
      _dialCode = picked.dial;
      _countryFlag = picked.flag;
      _countryName = picked.name;
    });
  }

  /// Shared post-login pipeline (password AND OTP sign-ins): one-time
  /// biometric setup offer, then role-based routing.
  Future<void> _afterSessionSuccess() async {
    if (_biometricAvailable && !BiometricService.isEnabled()) {
      final wants = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          backgroundColor: Colors.white,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
          title: Row(children: [
            Container(
              width: 36, height: 36,
              decoration: BoxDecoration(color: MaanColors.primary.withOpacity(.1), shape: BoxShape.circle),
              child: const Icon(Icons.fingerprint_rounded, color: MaanColors.primary, size: 24),
            ),
            const SizedBox(width: 10),
            Expanded(child: Text('Setup Biometric Login', style: MaanText.title.copyWith(fontSize: 16.5))),
          ]),
          content: Text(
            'Use your fingerprint or face to sign in next time? Your password is never stored — the biometric just unlocks this device\'s active session.',
            style: MaanText.body.copyWith(fontSize: 12.5, height: 1.4),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Not now')),
            FilledButton(
              style: FilledButton.styleFrom(backgroundColor: MaanColors.primary),
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Setup', style: TextStyle(fontWeight: FontWeight.w800)),
            ),
          ],
        ),
      );
      if (wants == true) await BiometricService.setEnabled(true);
      if (!mounted) return;
    }
    final role = context.read<AuthProvider>().user?.role;
    // Super admins pick the tenant workspace they want to open first.
    final target = role == 'super_admin' ? '/tenant-picker' : '/home-new';
    Navigator.pushNamedAndRemoveUntil(context, target, (_) => false);
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() { _busy = true; _error = null; });

    // "marqaitechgroup" / "marqaitechgroup.3boxeshrms.com" / full URL — all work.
    final ws = ApiConfig.normalizeWorkspaceUrl(_workspace.text) ?? '';
    ApiConfig.setBaseUrl(ws.isEmpty ? ApiConfig.defaultBaseUrl : ws);
    await _persistRemembered(phoneTab: false);

    final identity = _identity.text.trim();
    final email = identity.contains('@') ? identity : identity.replaceAll(' ', '');
    // Digit-only identity + a country selection → phone-number login; the
    // backend builds Employee.phone candidates from the digits + dial code.
    final isPhone = !identity.contains('@') && RegExp(r'^[\+]?[\d\s\-\(\)]{6,}$').hasMatch(identity);
    // AuthProvider.login returns false and stores the error internally (it
    // does not throw) — check the flag instead of relying on exceptions.
    final ok = await context.read<AuthProvider>().login(email, _password.text, dialCode: isPhone ? _dialCode : null);
    if (!mounted) return;
    if (ok) {
      await _afterSessionSuccess();
    } else {
      setState(() {
        _busy = false;
        _error = context.read<AuthProvider>().error ??
            'Invalid credentials or the workspace is unreachable.\n'
            'Demo workspace hint: admin@acme-global.com · MarqAI@2026';
      });
    }
  }

  /// Task 141 — Mobile Number tab: request the OTP, then open the
  /// verification screen. The workspace ladder inside requestOtp() resolves
  /// the right workspace (apex sweep → suggested subdomain) before sending.
  Future<void> _continueWithPhone() async {
    final digits = _phone.text.trim().replaceAll(RegExp(r'\D'), '');
    if (digits.length < 6) {
      setState(() => _error = 'Enter a valid mobile number to continue.');
      return;
    }
    setState(() { _otpBusy = true; _error = null; });
    final ws = ApiConfig.normalizeWorkspaceUrl(_workspace.text) ?? '';
    ApiConfig.setBaseUrl(ws.isEmpty ? ApiConfig.defaultBaseUrl : ws);
    // Task 142 — the remember switch now also covers the Mobile tab.
    await _persistRemembered(phoneTab: true);
    try {
      final res = await ApiService.requestOtp(_phone.text.trim(), _dialCode);
      if (!mounted) return;
      setState(() => _otpBusy = false);
      final verified = await Navigator.push<bool>(
        context,
        MaterialPageRoute(
          builder: (_) => OtpScreen(
            phone: _phone.text.trim(),
            dialCode: _dialCode,
            maskedPhone: '${res['maskedPhone'] ?? ''}',
            maskedEmail: '${res['maskedEmail'] ?? ''}',
            // Task 142 — delivery channels + demo fallback code.
            smsDelivered: res['smsDelivered'] == true,
            emailDelivered: res['emailDelivered'] == true,
            demoFallbackCode: res['demoFallbackCode']?.toString(),
          ),
        ),
      );
      if (verified == true && mounted) {
        // Refresh the stored identity into the AuthProvider (same as password
        // login) and run the shared post-login pipeline.
        final fresh = await ApiService.refreshStoredUser();
        if (!mounted) return;
        if (fresh != null) context.read<AuthProvider>().adoptUser(fresh);
        await _afterSessionSuccess();
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _otpBusy = false;
        _error = e.toString().replaceAll('Exception: ', '');
      });
    }
  }

  void _contactHR() {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.white,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (_) => ContactHrSheet(dialCode: _dialCode),
    );
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
            colors: [Color(0xFF0B1026), Color(0xFF221A4E), Color(0xFF3B2A7A)],
          ),
        ),
        child: Column(
          children: [
            // ── Header: back + logo + title (image #2) ──
            SafeArea(
              bottom: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(8, 4, 24, 14),
                child: Row(
                  children: [
                    IconButton(
                      onPressed: () => Navigator.maybePop(context),
                      icon: const Icon(Icons.arrow_back, color: Colors.white),
                    ),
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(12),
                        boxShadow: [BoxShadow(color: const Color(0xFF8B5CF6).withOpacity(.5), blurRadius: 18)],
                      ),
                      padding: const EdgeInsets.all(4),
                      child: Image.asset('assets/logos/logo-cubes.png', fit: BoxFit.contain),
                    ),
                    const SizedBox(width: 10),
                    const Expanded(
                      child: Text(
                        '3Boxes HRMS',
                        style: TextStyle(color: Colors.white, fontSize: 19, fontWeight: FontWeight.w900),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.only(left: 24, right: 24, bottom: 16),
              child: Align(
                alignment: Alignment.centerLeft,
                child: RichText(
                  text: const TextSpan(
                    style: TextStyle(color: Color(0xFFB9C0F2), fontSize: 16, fontWeight: FontWeight.w700, height: 1.3),
                    children: [
                      TextSpan(text: 'Hey 👋  '),
                      TextSpan(text: 'Login Now!', style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w900)),
                    ],
                  ),
                ),
              ),
            ),
            Expanded(
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.fromLTRB(22, 22, 22, 0),
                decoration: const BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.only(topLeft: Radius.circular(30), topRight: Radius.circular(30)),
                ),
                child: Form(
                  key: _formKey,
                  child: SingleChildScrollView(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        // ── Tabs: Mobile number | Employee ID (image #2) ──
                        Container(
                          padding: const EdgeInsets.all(5),
                          decoration: BoxDecoration(
                            color: const Color(0xFFF1F2FA),
                            borderRadius: BorderRadius.circular(14),
                          ),
                          child: Row(
                            children: [
                              _tab('Mobile Number', Icons.smartphone_rounded, _mobileTab, () => _switchTab(mobile: true)),
                              const SizedBox(width: 5),
                              _tab('Employee ID', Icons.badge_rounded, !_mobileTab, () => _switchTab(mobile: false)),
                            ],
                          ),
                        ),
                        const SizedBox(height: 20),
                        if (_mobileTab) ...[
                          // ── Mobile number entry (image #2 screen 2) ──
                          MaanField(
                            label: 'Mobile Number',
                            hint: '98765 43210',
                            controller: _phone,
                            focusNode: _phoneFocus,
                            keyboard: TextInputType.phone,
                            prefix: GestureDetector(
                              behavior: HitTestBehavior.opaque,
                              onTap: _pickCountry,
                              child: Container(
                                padding: const EdgeInsets.only(left: 14, right: 6),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Text(_countryFlag, style: const TextStyle(fontSize: 17)),
                                    const SizedBox(width: 4),
                                    Text(_dialCode, style: const TextStyle(color: MaanColors.navy, fontWeight: FontWeight.w600, fontSize: 13.5)),
                                    const Icon(Icons.keyboard_arrow_down, size: 17, color: MaanColors.faint),
                                    const SizedBox(width: 8),
                                  ],
                                ),
                              ),
                            ),
                            validator: (v) {
                              final d = (v ?? '').replaceAll(RegExp(r'\D'), '');
                              if (d.length < 6) return 'Enter your registered mobile number';
                              return null;
                            },
                          ),
                          const SizedBox(height: 8),
                          Text(
                            'We will text/email a 6-digit verification code. $_countryName ($_dialCode) selected — tap the code to change.',
                            style: MaanText.caption.copyWith(fontSize: 11, height: 1.4),
                          ),
                          const SizedBox(height: 10),
                          // Task 142 — Remember me works on BOTH tabs now.
                          Row(
                            children: [
                              SizedBox(
                                height: 22,
                                width: 38,
                                child: Switch(
                                  value: _saveMe,
                                  onChanged: (v) => setState(() => _saveMe = v),
                                  activeColor: Colors.white,
                                  activeTrackColor: const Color(0xFF7C3AED),
                                  inactiveThumbColor: Colors.white,
                                  inactiveTrackColor: const Color(0xFFDDD6F8),
                                  materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                                ),
                              ),
                              const SizedBox(width: 8),
                              const Text('Remember me', style: TextStyle(fontSize: 13.5, color: MaanColors.navy)),
                              const Spacer(),
                              Text('Saves your number on this device', style: MaanText.caption.copyWith(fontSize: 10.5)),
                            ],
                          ),
                          const SizedBox(height: 20),
                          SizedBox(
                            height: 52,
                            child: ElevatedButton(
                              onPressed: _otpBusy ? null : _continueWithPhone,
                              style: ElevatedButton.styleFrom(
                                backgroundColor: const Color(0xFF7C3AED),
                                foregroundColor: Colors.white,
                                disabledBackgroundColor: const Color(0xFFC4B5FD),
                                elevation: 0,
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                              ),
                              child: _otpBusy
                                  ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white))
                                  : const Row(
                                      mainAxisAlignment: MainAxisAlignment.center,
                                      children: [
                                        Text('Continue', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
                                        SizedBox(width: 8),
                                        Icon(Icons.arrow_forward_rounded, size: 19),
                                      ],
                                    ),
                            ),
                          ),
                        ] else ...[
                          // ── Employee ID / Email + password (image #2 screen 3) ──
                          MaanField(
                            label: 'Employee ID or Email',
                            hint: 'e.g. EMP-3000  ·  or you@company.com',
                            controller: _identity,
                            focusNode: _identityFocus,
                            // Task 142 — full alphanumeric keypad (letters AND
                            // numbers): emailAddress shows the standard text
                            // keyboard; the numeric keypad that used to stick
                            // around came from the phone field's focus, which
                            // _switchTab now releases before this field opens.
                            keyboard: TextInputType.emailAddress,
                            textCapitalization: TextCapitalization.none,
                            validator: (v) => (v == null || v.trim().isEmpty) ? 'Enter your employee ID or email' : null,
                          ),
                          const SizedBox(height: 18),
                          MaanField(
                            label: 'Password',
                            controller: _password,
                            obscure: _obscure,
                            suffix: IconButton(
                              icon: Icon(_obscure ? Icons.visibility_off_outlined : Icons.visibility_outlined, color: MaanColors.faint, size: 20),
                              onPressed: () => setState(() => _obscure = !_obscure),
                            ),
                            validator: (v) => (v == null || v.isEmpty) ? 'Enter your password' : null,
                          ),
                          const SizedBox(height: 10),
                          Row(
                            children: [
                              SizedBox(
                                height: 22,
                                width: 38,
                                child: Switch(
                                  value: _saveMe,
                                  onChanged: (v) => setState(() => _saveMe = v),
                                  activeColor: Colors.white,
                                  activeTrackColor: const Color(0xFF7C3AED),
                                  inactiveThumbColor: Colors.white,
                                  inactiveTrackColor: const Color(0xFFDDD6F8),
                                  materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                                ),
                              ),
                              const SizedBox(width: 8),
                              const Text('Remember me', style: TextStyle(fontSize: 13.5, color: MaanColors.navy)),
                              const Spacer(),
                              GestureDetector(
                                onTap: () => ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                                  content: Text('Password reset is available on the web portal.'),
                                )),
                                child: const Text('Forgot password?', style: TextStyle(fontSize: 13, color: Color(0xFF7C3AED), fontWeight: FontWeight.w700)),
                              ),
                            ],
                          ),
                          const SizedBox(height: 22),
                          SizedBox(
                            height: 52,
                            child: ElevatedButton(
                              onPressed: _busy ? null : _submit,
                              style: ElevatedButton.styleFrom(
                                backgroundColor: const Color(0xFF7C3AED),
                                foregroundColor: Colors.white,
                                disabledBackgroundColor: const Color(0xFFC4B5FD),
                                elevation: 0,
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                              ),
                              child: _busy
                                  ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white))
                                  : const Text('Sign in', style: TextStyle(fontSize: 16.5, fontWeight: FontWeight.w800)),
                            ),
                          ),
                        ],

                        // ── Face ID / fingerprint (both tabs) ──
                        if (_biometricAvailable) ...[
                          const SizedBox(height: 18),
                          Row(children: [
                            const Expanded(child: Divider(color: Color(0xFFE9E6F8))),
                            Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 12),
                              child: Text('Or unlock with', style: TextStyle(fontSize: 12, color: MaanColors.faint, fontWeight: FontWeight.w600)),
                            ),
                            const Expanded(child: Divider(color: Color(0xFFE9E6F8))),
                          ]),
                          const SizedBox(height: 14),
                          Row(
                            children: [
                              Expanded(
                                child: SizedBox(
                                  height: 50,
                                  child: OutlinedButton.icon(
                                    onPressed: _busy || _otpBusy ? null : () => _biometricUnlock(),
                                    style: OutlinedButton.styleFrom(
                                      side: const BorderSide(color: Color(0xFF7C3AED), width: 1.2),
                                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                                    ),
                                    icon: const Icon(Icons.fingerprint_rounded, size: 24, color: Color(0xFF7C3AED)),
                                    label: Text(
                                      BiometricService.isEnabled() ? 'Fingerprint' : 'Setup Fingerprint',
                                      style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: Color(0xFF7C3AED)),
                                    ),
                                  ),
                                ),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: SizedBox(
                                  height: 50,
                                  child: OutlinedButton.icon(
                                    onPressed: _busy || _otpBusy ? null : () => _contactHR(),
                                    style: OutlinedButton.styleFrom(
                                      side: const BorderSide(color: MaanColors.line, width: 1.2),
                                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                                    ),
                                    icon: const Icon(Icons.headset_mic_rounded, size: 21, color: MaanColors.navy),
                                    label: const Text(
                                      'Contact HR',
                                      style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: MaanColors.navy),
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ] else ...[
                          const SizedBox(height: 14),
                          Center(
                            child: OutlinedButton.icon(
                              onPressed: _contactHR,
                              style: OutlinedButton.styleFrom(
                                side: const BorderSide(color: MaanColors.line, width: 1.2),
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                              ),
                              icon: const Icon(Icons.headset_mic_rounded, size: 21, color: MaanColors.navy),
                              label: const Text('Contact HR', style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: MaanColors.navy)),
                            ),
                          ),
                        ],

                        const SizedBox(height: 16),
                        if (_error != null)
                          Container(
                            margin: const EdgeInsets.only(bottom: 14),
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(color: const Color(0xFFFDF0F0), borderRadius: BorderRadius.circular(10)),
                            child: Text(_error!, style: const TextStyle(color: Color(0xFFC04747), fontSize: 12.5, height: 1.4)),
                          ),
                        const SizedBox(height: 6),
                        // Task 110b — version footer + connection check only.
                        // The APK download lives on the WEB login page now.
                        Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            GestureDetector(
                              onTap: () => Navigator.pushNamed(context, '/diagnostics'),
                              child: const Text('Run connection check', style: TextStyle(fontSize: 12.5, color: Color(0xFF7C3AED), fontWeight: FontWeight.w600)),
                            ),
                            Text('    ·    ', style: TextStyle(fontSize: 12.5, color: MaanColors.faint)),
                            Text(AppInfo.label, style: TextStyle(fontSize: 11.5, color: MaanColors.faint)),
                          ],
                        ),
                        const SizedBox(height: 6),
                        const Text(
                          'To update the app: download the latest APK from the web login page.',
                          textAlign: TextAlign.center,
                          style: TextStyle(fontSize: 11, color: MaanColors.faint),
                        ),
                        TextButton(
                          onPressed: () => setState(() => _showAdvanced = !_showAdvanced),
                          child: Text(
                            _showAdvanced ? 'Hide workspace settings' : 'Workspace settings (optional — auto-detected)',
                            style: const TextStyle(fontSize: 12.5, color: MaanColors.faint),
                          ),
                        ),
                        if (_showAdvanced) ...[
                          MaanField(
                            label: 'Workspace URL',
                            hint: 'yourcompany.3boxeshrms.com — or leave as-is',
                            controller: _workspace,
                            keyboard: TextInputType.url,
                          ),
                          const SizedBox(height: 4),
                          const Text(
                            'Most users can ignore this: your company workspace is detected automatically at sign-in.',
                            style: TextStyle(fontSize: 11.5, color: MaanColors.faint),
                          ),
                          const SizedBox(height: 8),
                          Row(
                            children: [
                              Expanded(
                                child: OutlinedButton(
                                  onPressed: () {
                                    _workspace.text = ApiConfig.defaultBaseUrl;
                                    _identity.text = 'admin@acme-global.com';
                                    _password.text = 'MarqAI@2026';
                                  },
                                  style: OutlinedButton.styleFrom(
                                    side: const BorderSide(color: Color(0xFF7C3AED)),
                                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                                  ),
                                  child: const Text('Use demo workspace', style: TextStyle(fontSize: 12.5, color: Color(0xFF7C3AED), fontWeight: FontWeight.w600)),
                                ),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: OutlinedButton(
                                  onPressed: () {
                                    _workspace.text = ApiConfig.liveBaseUrl;
                                    _identity.clear();
                                    _password.clear();
                                  },
                                  style: OutlinedButton.styleFrom(
                                    side: const BorderSide(color: MaanColors.line),
                                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                                  ),
                                  child: const Text('Use live platform (super admin)', style: TextStyle(fontSize: 12.5, color: MaanColors.navy, fontWeight: FontWeight.w600)),
                                ),
                              ),
                            ],
                          ),
                        ],
                        const SizedBox(height: 30),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _tab(String label, IconData icon, bool active, VoidCallback onTap) {
    return Expanded(
      child: InkWell(
        borderRadius: BorderRadius.circular(11),
        onTap: onTap,
        child: Container(
          height: 44,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: active ? Colors.white : Colors.transparent,
            borderRadius: BorderRadius.circular(11),
            boxShadow: active ? [BoxShadow(color: Colors.black.withOpacity(.06), blurRadius: 8, offset: const Offset(0, 2))] : null,
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 17, color: active ? const Color(0xFF7C3AED) : MaanColors.faint),
              const SizedBox(width: 7),
              Text(
                label,
                style: TextStyle(
                  fontSize: 13.5,
                  fontWeight: active ? FontWeight.w800 : FontWeight.w600,
                  color: active ? MaanColors.navy : MaanColors.faint,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  void dispose() {
    _identity.dispose();
    _password.dispose();
    _phone.dispose();
    _workspace.dispose();
    _identityFocus.dispose();
    _phoneFocus.dispose();
    super.dispose();
  }
}

// ═══════════════════════════ Task 127: country picker ═══════════════════════

class _Country {
  final String name;
  final String flag;
  final String dial;
  const _Country(this.name, this.flag, this.dial);
}

/// Dial codes shown in the picker. India first (default market), then
/// alphabetical. Enough coverage for the workforce geographies — typing the
/// full international number also works without touching the selector.
const List<_Country> _kCountries = [
  _Country('India', '🇮🇳', '+91'),
  _Country('Australia', '🇦🇺', '+61'),
  _Country('Bangladesh', '🇧🇩', '+880'),
  _Country('Brazil', '🇧🇷', '+55'),
  _Country('Canada', '🇨🇦', '+1'),
  _Country('China', '🇨🇳', '+86'),
  _Country('France', '🇫🇷', '+33'),
  _Country('Germany', '🇩🇪', '+49'),
  _Country('Indonesia', '🇮🇩', '+62'),
  _Country('Japan', '🇯🇵', '+81'),
  _Country('Kenya', '🇰🇪', '+254'),
  _Country('Kuwait', '🇰🇼', '+965'),
  _Country('Malaysia', '🇲🇾', '+60'),
  _Country('Nepal', '🇳🇵', '+977'),
  _Country('Netherlands', '🇳🇱', '+31'),
  _Country('New Zealand', '🇳🇿', '+64'),
  _Country('Nigeria', '🇳🇬', '+234'),
  _Country('Oman', '🇴🇲', '+968'),
  _Country('Pakistan', '🇵🇰', '+92'),
  _Country('Philippines', '🇵🇭', '+63'),
  _Country('Qatar', '🇶🇦', '+974'),
  _Country('Saudi Arabia', '🇸🇦', '+966'),
  _Country('Singapore', '🇸🇬', '+65'),
  _Country('South Africa', '🇿🇦', '+27'),
  _Country('South Korea', '🇰🇷', '+82'),
  _Country('Sri Lanka', '🇱🇰', '+94'),
  _Country('Thailand', '🇹🇭', '+66'),
  _Country('United Arab Emirates', '🇦🇪', '+971'),
  _Country('United Kingdom', '🇬🇧', '+44'),
  _Country('United States', '🇺🇸', '+1'),
];

class _CountryPickerSheet extends StatelessWidget {
  const _CountryPickerSheet();

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: SizedBox(
        height: MediaQuery.of(context).size.height * 0.62,
        child: Column(
          children: [
            const SizedBox(height: 14),
            Container(width: 44, height: 4.5, decoration: BoxDecoration(color: MaanColors.line, borderRadius: BorderRadius.circular(3))),
            const SizedBox(height: 14),
            const Text('Select Country Code', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: MaanColors.navy)),
            const SizedBox(height: 6),
            Expanded(
              child: ListView.builder(
                padding: const EdgeInsets.fromLTRB(16, 6, 16, 16),
                itemCount: _kCountries.length,
                itemBuilder: (_, i) {
                  final c = _kCountries[i];
                  return InkWell(
                    borderRadius: BorderRadius.circular(12),
                    onTap: () => Navigator.pop(context, c),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 11),
                      child: Row(
                        children: [
                          Text(c.flag, style: const TextStyle(fontSize: 19)),
                          const SizedBox(width: 12),
                          Expanded(child: Text(c.name, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: MaanColors.navy))),
                          Text(c.dial, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: Color(0xFF7C3AED))),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}
