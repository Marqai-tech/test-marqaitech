import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/maan_theme.dart';
import '../../config/api_config.dart';
import '../../config/app_info.dart';
import '../../providers/auth_provider.dart';
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

  @override
  void initState() {
    super.initState();
    _saveMe = StorageService.getRememberMe();
    final remembered = StorageService.getRememberedEmail();
    if (remembered != null && remembered.isNotEmpty) _identity.text = remembered;
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
              child: Text(
                'Sign In now to begin an amazing journey',
                style: TextStyle(color: Colors.white.withOpacity(.92), fontSize: 13.5),
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
                              : const Text('Sign In', style: TextStyle(fontSize: 16.5, fontWeight: FontWeight.w700)),
                        ),
                      ),
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
