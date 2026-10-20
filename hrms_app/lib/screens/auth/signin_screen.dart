import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/maan_theme.dart';
import '../../config/api_config.dart';
import '../../config/app_info.dart';
import '../../providers/auth_provider.dart';
import '../../services/api_service.dart';
import '../../services/biometric_service.dart';
import '../../services/storage_service.dart';

/// Sign In — matches design screenshot #3 (blue header + floating-label sheet).
/// Accepts EMAIL or MOBILE number; posts to the configured HRMS workspace.
class SignInScreen extends StatefulWidget {
  const SignInScreen({super.key});

  @override
  State<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends State<SignInScreen> {
  final _formKey = GlobalKey<FormState>();
  final _identity = TextEditingController();
  final _password = TextEditingController();
  // Start from the PERSISTED workspace (restoreFromStorage() already ran in
  // main) — previously this always showed the demo URL, which overrode the
  // remembered tenant workspace on every sign-in.
  final _workspace = TextEditingController(text: ApiConfig.baseUrl);
  bool _obscure = true;
  bool _saveMe = false;
  bool _showAdvanced = false;
  bool _busy = false;
  String? _error;
  // Task 113 — biometric login (design #06).
  bool _biometricAvailable = false;
  bool _bioAutoPrompted = false;

  @override
  void initState() {
    super.initState();
    _saveMe = StorageService.getRememberMe();
    final remembered = StorageService.getRememberedEmail();
    if (remembered != null && remembered.isNotEmpty) _identity.text = remembered;
    _checkBiometric();
  }

  Future<void> _checkBiometric() async {
    final available = await BiometricService.isAvailable();
    if (!mounted) return;
    setState(() => _biometricAvailable = available);
    // Auto-prompt ONCE when biometric unlock was set up and a session is
    // still stored — "Hey, Login Now." becomes just a fingerprint touch.
    if (available &&
        BiometricService.isEnabled() &&
        (StorageService.getToken()?.isNotEmpty ?? false) &&
        !_bioAutoPrompted) {
      _bioAutoPrompted = true;
      await _biometricUnlock(autoPrompt: true);
    }
  }

  /// Fingerprint unlock of the stored session (design #06 "Biometric Login").
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
    // Validate the stored session before trusting it (24h server expiry).
    final valid = await ApiService.validateSession();
    if (!mounted) return;
    if (!valid) {
      await BiometricService.setEnabled(false);
      try { await context.read<AuthProvider>().logout(); } catch (_) {}
      if (!autoPrompt) setState(() => _busy = false);
      setState(() => _error = 'Your session has expired — please sign in once more with your password, then fingerprint login works again.');
      return;
    }
    final fresh = await ApiService.refreshStoredUser();
    if (!mounted) return;
    if (fresh != null) context.read<AuthProvider>().adoptUser(fresh);
    final role = context.read<AuthProvider>().user?.role;
    final target = role == 'super_admin' ? '/tenant-picker' : '/home-new';
    Navigator.pushNamedAndRemoveUntil(context, target, (_) => false);
  }

  /// Design #06 modal: "Setup Biometric Login" — verify email + password
  /// once, then switch the fingerprint flag on. No password is stored.
  Future<void> _setupBiometricDialog() async {
    final emailCtrl = TextEditingController(text: _identity.text.trim());
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
              controller: emailCtrl,
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
                      final email = emailCtrl.text.trim();
                      final ws = ApiConfig.normalizeWorkspaceUrl(_workspace.text) ?? '';
                      ApiConfig.setBaseUrl(ws.isEmpty ? ApiConfig.defaultBaseUrl : ws);
                      final ok = await context.read<AuthProvider>().login(email, passCtrl.text);
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

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() { _busy = true; _error = null; });

    // "marqaitechgroup" / "marqaitechgroup.3boxeshrms.com" / full URL — all work.
    final ws = ApiConfig.normalizeWorkspaceUrl(_workspace.text) ?? '';
    ApiConfig.setBaseUrl(ws.isEmpty ? ApiConfig.defaultBaseUrl : ws);
    if (_saveMe) {
      await StorageService.setRememberMe(true);
      await StorageService.setRememberedEmail(_identity.text.trim());
    } else {
      await StorageService.setRememberMe(false);
    }

    final identity = _identity.text.trim();
    final email = identity.contains('@') ? identity : '$identity';
    final ok = await context.read<AuthProvider>().login(email, _password.text);

    if (!mounted) return;
    if (ok) {
      // Design #06: after the FIRST password sign-in, offer fingerprint
      // login for next time (one consent dialog — no password ever stored).
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
              'Use your fingerprint to sign in next time? Your password is never stored — the fingerprint just unlocks this device\'s active session.',
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
    } else {
      setState(() {
        _busy = false;
        _error = context.read<AuthProvider>().error ??
            'Invalid credentials or the workspace is unreachable.\n'
            'Demo workspace hint: admin@acme-global.com · MarqAI@2026';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final role = ModalRoute.of(context)?.settings.arguments as String? ?? 'admin';
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
                  IconButton(
                    onPressed: () => Navigator.maybePop(context),
                    icon: const Icon(Icons.arrow_back, color: Colors.white),
                  ),
                  const SizedBox(width: 6),
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(12),
                      boxShadow: [BoxShadow(color: Colors.black.withOpacity(.12), blurRadius: 10, offset: const Offset(0, 4))],
                    ),
                    padding: const EdgeInsets.all(4),
                    child: Image.asset('assets/logos/logo-cubes.png', fit: BoxFit.contain),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      role == 'employee' ? 'Employee Sign In' : 'Sign In',
                      style: const TextStyle(color: Colors.white, fontSize: 21, fontWeight: FontWeight.w800),
                    ),
                  ),
                ],
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.only(left: 24, right: 24, bottom: 18),
            child: Align(
              alignment: Alignment.centerLeft,
              child: RichText(
                text: TextSpan(
                  style: TextStyle(color: Colors.white.withOpacity(.95), fontSize: 17, fontWeight: FontWeight.w800, height: 1.3),
                  children: const [
                    TextSpan(text: 'Hey 👋  '),
                    TextSpan(text: 'Login Now!', style: TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.w800)),
                  ],
                ),
              ),
            ),
          ),
          Expanded(
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.fromLTRB(22, 30, 22, 0),
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
                      MaanField(
                        label: 'Mobile Number / Email',
                        hint: '1586 4585 8745 324  ·  or you@company.com',
                        controller: _identity,
                        keyboard: TextInputType.emailAddress,
                        prefix: Container(
                          padding: const EdgeInsets.only(left: 14, right: 6),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: const [
                              Text('🇺🇸', style: TextStyle(fontSize: 17)),
                              SizedBox(width: 4),
                              Text('+1', style: TextStyle(color: MaanColors.navy, fontWeight: FontWeight.w600, fontSize: 13.5)),
                              Icon(Icons.keyboard_arrow_down, size: 17, color: MaanColors.faint),
                              SizedBox(width: 8),
                            ],
                          ),
                        ),
                        validator: (v) => (v == null || v.trim().isEmpty) ? 'Enter your mobile number or email' : null,
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
                              activeTrackColor: MaanColors.primary,
                              inactiveThumbColor: Colors.white,
                              inactiveTrackColor: const Color(0xFFC7D4F2),
                              materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                            ),
                          ),
                          const SizedBox(width: 8),
                          const Text('Save Me', style: TextStyle(fontSize: 13.5, color: MaanColors.navy)),
                          const Spacer(),
                          GestureDetector(
                            onTap: () => ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                              content: Text('Password reset is available on the web portal.'),
                            )),
                            child: const Text('Forgot Password?', style: TextStyle(fontSize: 13, color: MaanColors.navy, fontWeight: FontWeight.w600)),
                          ),
                        ],
                      ),
                      const SizedBox(height: 22),
                      SizedBox(
                        height: 52,
                        child: ElevatedButton(
                          onPressed: _busy ? null : _submit,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: MaanColors.primary,
                            foregroundColor: Colors.white,
                            elevation: 0,
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                          ),
                          child: _busy
                              ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white))
                              : const Row(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    Icon(Icons.login_rounded, size: 20, color: Colors.white),
                                    SizedBox(width: 8),
                                    Text('Login', style: TextStyle(fontSize: 16.5, fontWeight: FontWeight.w700)),
                                  ],
                                ),
                        ),
                      ),
                      // ── Design #06: "Or" divider + Biometric Login ──
                      if (_biometricAvailable) ...[
                        const SizedBox(height: 16),
                        Row(children: [
                          const Expanded(child: Divider(color: Color(0xFFE3E8F4))),
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 12),
                            child: Text('Or', style: TextStyle(fontSize: 12, color: MaanColors.faint, fontWeight: FontWeight.w600)),
                          ),
                          const Expanded(child: Divider(color: Color(0xFFE3E8F4))),
                        ]),
                        const SizedBox(height: 14),
                        SizedBox(
                          height: 50,
                          child: OutlinedButton.icon(
                            onPressed: _busy ? null : () => _biometricUnlock(),
                            style: OutlinedButton.styleFrom(
                              side: const BorderSide(color: MaanColors.primary, width: 1.2),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                            ),
                            icon: const Icon(Icons.fingerprint_rounded, size: 24, color: MaanColors.primary),
                            label: Text(
                              BiometricService.isEnabled() ? 'Biometric Login' : 'Setup Biometric Login',
                              style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700, color: MaanColors.primary),
                            ),
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
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Text("Don't have an account?", style: TextStyle(fontSize: 13, color: MaanColors.body)),
                          const SizedBox(width: 6),
                          GestureDetector(
                            onTap: () => ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                              content: Text('Company registration is available on the web portal → Register.'),
                            )),
                            child: const Text('SIGN UP', style: TextStyle(fontSize: 13, color: Color(0xFF3B82F6), fontWeight: FontWeight.w800)),
                          ),
                        ],
                      ),
                      const SizedBox(height: 24),
                      // Task 110b — version footer + connection check only.
                      // The APK download lives on the WEB login page now.
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          GestureDetector(
                            onTap: () => Navigator.pushNamed(context, '/diagnostics'),
                            child: const Text('Run connection check', style: TextStyle(fontSize: 12.5, color: Color(0xFF3B82F6), fontWeight: FontWeight.w600)),
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
                                  side: const BorderSide(color: MaanColors.primary),
                                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                                ),
                                child: const Text('Use demo workspace', style: TextStyle(fontSize: 12.5, color: MaanColors.primary, fontWeight: FontWeight.w600)),
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
    );
  }

  @override
  void dispose() {
    _identity.dispose();
    _password.dispose();
    _workspace.dispose();
    super.dispose();
  }
}
