import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_spinkit/flutter_spinkit.dart';
import '../services/auth_service.dart';
import '../theme/app_theme.dart';
import '../widgets/logo.dart';
import 'webview_screen.dart';

/// Task 154 — Mobile login redesigned per the reference images (2 & 3):
///  1. ONBOARDING CAROUSEL (first launch only) — 3 flat-illustration slides,
///     Skip / Next controls, page dots, circular forward button.
///  2. LOGIN SCREEN — clean white sheet: "Login" title, "Don't have an
///     account? Sign Up" link, Email + Password fields, brand-green
///     "Sign In" button, "Forgot your password?" link, subtle server
///     configuration expander.
///
/// Sign-in is now NATIVE: posts to {server}/api/auth/login, stores the real
/// bearer token and opens the web app in the WebView already authenticated
/// (the WebView injects tb_token into localStorage on page load).
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  bool _showOnboarding = true;

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    final done = await AuthService.isOnboardingDone();
    if (mounted) setState(() => _showOnboarding = !done);
  }

  void _finishOnboarding() {
    AuthService.setOnboardingDone();
    if (mounted) setState(() => _showOnboarding = false);
  }

  @override
  Widget build(BuildContext context) {
    return _showOnboarding
        ? OnboardingCarousel(onFinished: _finishOnboarding)
        : const MobileLoginForm();
  }
}

/// ═══════════════════ ONBOARDING (reference image 2 screens 1-3) ═══════════════════
class OnboardingCarousel extends StatefulWidget {
  final VoidCallback onFinished;
  const OnboardingCarousel({super.key, required this.onFinished});

  @override
  State<OnboardingCarousel> createState() => _OnboardingCarouselState();
}

class _OnboardingCarouselState extends State<OnboardingCarousel> {
  final PageController _pageController = PageController();
  int _page = 0;

  static const List<({String title, String subtitle, Color tint, IconData icon, IconData icon2})> _slides = [
    (
      title: 'Manage work. Stay aligned. Deliver on time.',
      subtitle: 'Plan tasks, assign ownership, and track progress across every project and team.',
      tint: Color(0xFFD1FAE5),
      icon: Icons.laptop_mac_rounded,
      icon2: Icons.task_alt_rounded,
    ),
    (
      title: 'Work together. Stay aligned. Deliver on time.',
      subtitle: 'Coordinate tasks, define ownership, and keep chat, files and updates in one place.',
      tint: Color(0xFFDBEAFE),
      icon: Icons.groups_rounded,
      icon2: Icons.chat_bubble_rounded,
    ),
    (
      title: 'Clear roles, Controlled access',
      subtitle: 'Define roles, assign permissions, and give every person exactly the right access.',
      tint: Color(0xFFEDE9FE),
      icon: Icons.admin_panel_settings_rounded,
      icon2: Icons.verified_user_rounded,
    ),
  ];

  void _next() {
    if (_page < _slides.length - 1) {
      _pageController.nextPage(duration: const Duration(milliseconds: 350), curve: Curves.easeOutCubic);
    } else {
      widget.onFinished();
    }
  }

  @override
  Widget build(BuildContext context) {
    final last = _page == _slides.length - 1;
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: Column(
          children: [
            // Skip — top right
            Align(
              alignment: Alignment.topRight,
              child: Padding(
                padding: const EdgeInsets.only(top: 8, right: 16),
                child: TextButton(
                  onPressed: widget.onFinished,
                  child: const Text('Skip', style: TextStyle(color: AppTheme.textMuted, fontWeight: FontWeight.w600, fontSize: 14)),
                ),
              ),
            ),
            Expanded(
              child: PageView.builder(
                controller: _pageController,
                itemCount: _slides.length,
                onPageChanged: (i) => setState(() => _page = i),
                itemBuilder: (context, i) {
                  final s = _slides[i];
                  return Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 24),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        _OnboardingArt(tint: s.tint, icon: s.icon, icon2: s.icon2),
                        const SizedBox(height: 40),
                        Text(
                          s.title,
                          textAlign: TextAlign.center,
                          style: const TextStyle(fontSize: 22, height: 1.25, fontWeight: FontWeight.w800, color: AppTheme.textPrimary, letterSpacing: -0.3),
                        ),
                        const SizedBox(height: 12),
                        Text(
                          s.subtitle,
                          textAlign: TextAlign.center,
                          style: const TextStyle(fontSize: 13.5, height: 1.5, color: AppTheme.textSecondary),
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),
            // Dots + controls
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 8, 24, 20),
              child: Row(
                children: [
                  // Dots (left, per reference image 3)
                  Row(
                    children: List.generate(_slides.length, (i) {
                      final active = i == _page;
                      return AnimatedContainer(
                        duration: const Duration(milliseconds: 250),
                        margin: const EdgeInsets.only(right: 6),
                        width: active ? 22 : 8,
                        height: 8,
                        decoration: BoxDecoration(
                          color: active ? AppTheme.success : const Color(0xFFD8E5DD),
                          borderRadius: BorderRadius.circular(99),
                        ),
                      );
                    }),
                  ),
                  const Spacer(),
                  // Circular forward button (reference image 3)
                  Material(
                    color: Colors.transparent,
                    child: InkWell(
                      onTap: _next,
                      customBorder: const CircleBorder(),
                      child: Container(
                        width: 56,
                        height: 56,
                        decoration: BoxDecoration(
                          gradient: const LinearGradient(colors: [Color(0xFF10B981), Color(0xFF059669)], begin: Alignment.topLeft, end: Alignment.bottomRight),
                          shape: BoxShape.circle,
                          boxShadow: [BoxShadow(color: const Color(0xFF10B981).withValues(alpha: 0.35), blurRadius: 16, offset: const Offset(0, 6))],
                        ),
                        child: Icon(last ? Icons.check_rounded : Icons.arrow_forward_rounded, color: Colors.white, size: 26),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Flat illustration composition per slide (pure Flutter primitives — no assets).
class _OnboardingArt extends StatelessWidget {
  final Color tint;
  final IconData icon;
  final IconData icon2;
  const _OnboardingArt({required this.tint, required this.icon, required this.icon2});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      height: 300,
      decoration: BoxDecoration(
        gradient: LinearGradient(colors: [tint.withValues(alpha: 0.55), tint], begin: Alignment.topCenter, end: Alignment.bottomCenter),
        borderRadius: BorderRadius.circular(28),
      ),
      child: Stack(
        alignment: Alignment.center,
        children: [
          // Big soft circle backdrop
          Container(width: 190, height: 190, decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.75), shape: BoxShape.circle)),
          // Main icon tile
          Container(
            width: 120,
            height: 120,
            decoration: BoxDecoration(
              gradient: const LinearGradient(colors: [Color(0xFF10B981), Color(0xFF0D9488)], begin: Alignment.topLeft, end: Alignment.bottomRight),
              borderRadius: BorderRadius.circular(32),
              boxShadow: [BoxShadow(color: const Color(0xFF10B981).withValues(alpha: 0.35), blurRadius: 24, offset: const Offset(0, 10))],
            ),
            child: Icon(icon, color: Colors.white, size: 58),
          ),
          // Floating companion chip (top-right)
          Positioned(
            top: 44,
            right: 44,
            child: Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.06), blurRadius: 12, offset: const Offset(0, 4))]),
              child: Icon(icon2, color: AppTheme.success, size: 26),
            ),
          ),
          // Floating chip (bottom-left)
          Positioned(
            bottom: 46,
            left: 44,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.06), blurRadius: 12, offset: const Offset(0, 4))]),
              child: Row(
                children: [
                  Container(width: 8, height: 8, decoration: const BoxDecoration(color: AppTheme.success, shape: BoxShape.circle)),
                  const SizedBox(width: 8),
                  Container(width: 54, height: 7, decoration: BoxDecoration(color: const Color(0xFFE2E8F0), borderRadius: BorderRadius.circular(99))),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// ═══════════════════ LOGIN (reference image 2 screen 4 / image 3 right) ═══════════════════
class MobileLoginForm extends StatefulWidget {
  const MobileLoginForm({super.key});

  @override
  State<MobileLoginForm> createState() => _MobileLoginFormState();
}

class _MobileLoginFormState extends State<MobileLoginForm> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _serverController = TextEditingController();
  bool _obscure = true;
  bool _isLoading = false;
  bool _showServerConfig = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadServerUrl();
  }

  Future<void> _loadServerUrl() async {
    final url = await AuthService.getServerUrl();
    if (mounted) setState(() => _serverController.text = url);
  }

  /// Opens a public web page (forgot password / sign up) in the WebView.
  void _openWebPage(String path) {
    final server = _serverController.text.trim().isNotEmpty
        ? _serverController.text.trim()
        : AuthService.defaultServerUrl;
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => MainWebViewScreen(initialUrl: '$server$path')),
    );
  }

  Future<void> _signIn() async {
    final email = _emailController.text.trim();
    final password = _passwordController.text;
    if (email.isEmpty || password.isEmpty) {
      setState(() => _error = 'Please enter your email and password.');
      return;
    }
    setState(() { _isLoading = true; _error = null; });
    try {
      final serverUrl = _serverController.text.trim().isEmpty
          ? await AuthService.getServerUrl()
          : _serverController.text.trim();
      await AuthService.setServerUrl(serverUrl);

      final result = await _postLogin(serverUrl, email, password);
      if (!result['ok']) {
        if (mounted) setState(() => _error = (result['error'] as String?) ?? 'Login failed. Please try again.');
        return;
      }
      final token = result['token'] as String;
      final role = (result['role'] as String?) ?? '';
      await AuthService.setToken(token);
      if (!mounted) return;
      final landing = role == 'super_admin' ? '/super-admin' : '/home';
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => MainWebViewScreen(initialUrl: '$serverUrl$landing')),
      );
    } on SocketException {
      if (mounted) setState(() => _error = 'Network error — please check your internet connection.');
    } catch (_) {
      if (mounted) setState(() => _error = 'Login failed. Please try again.');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<Map<String, dynamic>> _postLogin(String serverUrl, String email, String password) async {
    final client = HttpClient()..connectionTimeout = const Duration(seconds: 20);
    try {
      final req = await client.postUrl(Uri.parse('$serverUrl/api/auth/login'));
      req.headers.set('Content-Type', 'application/json');
      req.add(utf8.encode(jsonEncode({'email': email, 'password': password, 'remember': true})));
      final resp = await req.close();
      final body = await resp.transform(utf8.decoder).join();
      final data = jsonDecode(body) as Map<String, dynamic>;
      if (resp.statusCode == 200 && data['token'] is String) {
        final user = data['user'] as Map<String, dynamic>?;
        return {'ok': true, 'token': data['token'], 'role': user?['role']};
      }
      return {'ok': false, 'error': (data['error'] as String?) ?? 'Invalid email or password.'};
    } finally {
      client.close();
    }
  }

  @override
  Widget build(BuildContext context) {
    final screenHeight = MediaQuery.of(context).size.height;
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 460),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  SizedBox(height: screenHeight * 0.05),
                  // Logo
                  Center(
                    child: Container(
                      width: 68,
                      height: 68,
                      decoration: BoxDecoration(
                        gradient: const LinearGradient(colors: [Color(0xFF10B981), Color(0xFF0D9488)], begin: Alignment.topLeft, end: Alignment.bottomRight),
                        borderRadius: BorderRadius.circular(18),
                        boxShadow: [BoxShadow(color: const Color(0xFF10B981).withValues(alpha: 0.3), blurRadius: 20, offset: const Offset(0, 8))],
                      ),
                      child: const Center(child: ThreeBoxesLogo(size: 42, white: true)),
                    ),
                  ),
                  const SizedBox(height: 22),
                  // Title (reference: "Login")
                  const Center(
                    child: Text('Login', style: TextStyle(fontSize: 26, fontWeight: FontWeight.w800, color: AppTheme.textPrimary, letterSpacing: -0.4)),
                  ),
                  const SizedBox(height: 6),
                  // Sign up line (reference: "Don't have an account? Sign Up")
                  Center(
                    child: Wrap(
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        const Text("Don't have an account?", style: TextStyle(fontSize: 12.5, color: AppTheme.textSecondary)),
                        GestureDetector(
                          onTap: () => _openWebPage('/register'),
                          child: const Text(' Sign Up', style: TextStyle(fontSize: 12.5, color: AppTheme.success, fontWeight: FontWeight.w700)),
                        ),
                      ],
                    ),
                  ),
                  SizedBox(height: screenHeight * 0.04),

                  if (_error != null) ...[
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(color: const Color(0xFFFEF2F2), borderRadius: BorderRadius.circular(12), border: Border.all(color: const Color(0xFFFECACA))),
                      child: Text(_error!, style: const TextStyle(fontSize: 12.5, color: Color(0xFFB91C1C), fontWeight: FontWeight.w500)),
                    ),
                    const SizedBox(height: 14),
                  ],

                  // Email
                  TextField(
                    controller: _emailController,
                    keyboardType: TextInputType.emailAddress,
                    textInputAction: TextInputAction.next,
                    enabled: !_isLoading,
                    decoration: InputDecoration(
                      labelText: 'Email',
                      hintText: 'Example@email.com',
                      prefixIcon: const Icon(Icons.mail_outline_rounded, size: 20),
                      filled: true,
                      fillColor: Colors.white,
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: AppTheme.border)),
                      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: AppTheme.border)),
                      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: AppTheme.success, width: 1.5)),
                      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                    ),
                  ),
                  const SizedBox(height: 14),
                  // Password
                  TextField(
                    controller: _passwordController,
                    obscureText: _obscure,
                    textInputAction: TextInputAction.done,
                    enabled: !_isLoading,
                    onSubmitted: (_) => _signIn(),
                    decoration: InputDecoration(
                      labelText: 'Password',
                      hintText: 'At least 8 characters',
                      prefixIcon: const Icon(Icons.lock_outline_rounded, size: 20),
                      suffixIcon: IconButton(
                        icon: Icon(_obscure ? Icons.visibility_off_outlined : Icons.visibility_outlined, size: 20, color: AppTheme.textMuted),
                        onPressed: () => setState(() => _obscure = !_obscure),
                      ),
                      filled: true,
                      fillColor: Colors.white,
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: AppTheme.border)),
                      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: AppTheme.border)),
                      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: AppTheme.success, width: 1.5)),
                      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                    ),
                  ),
                  const SizedBox(height: 22),

                  // Sign In button (brand green)
                  Container(
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(colors: [Color(0xFF10B981), Color(0xFF059669)], begin: Alignment.centerLeft, end: Alignment.centerRight),
                      borderRadius: BorderRadius.circular(14),
                      boxShadow: [BoxShadow(color: const Color(0xFF10B981).withValues(alpha: 0.35), blurRadius: 16, offset: const Offset(0, 6))],
                    ),
                    child: Material(
                      color: Colors.transparent,
                      child: InkWell(
                        onTap: _isLoading ? null : _signIn,
                        borderRadius: BorderRadius.circular(14),
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 16),
                          child: _isLoading
                              ? const Center(child: SpinKitThreeBounce(color: Colors.white, size: 20))
                              : const Row(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    Text('Sign In', style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w700, letterSpacing: 0.3)),
                                    SizedBox(width: 8),
                                    Icon(Icons.arrow_forward_rounded, color: Colors.white, size: 18),
                                  ],
                                ),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 14),

                  // Forgot password
                  Center(
                    child: TextButton(
                      onPressed: _isLoading ? null : () => _openWebPage('/forgot-password'),
                      child: const Text('Forgot your password?', style: TextStyle(fontSize: 12.5, color: AppTheme.textSecondary, fontWeight: FontWeight.w600)),
                    ),
                  ),
                  const SizedBox(height: 10),

                  // Server Configuration (advanced)
                  InkWell(
                    onTap: () => setState(() => _showServerConfig = !_showServerConfig),
                    borderRadius: BorderRadius.circular(10),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 6),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(_showServerConfig ? Icons.keyboard_arrow_up : Icons.settings_outlined, size: 15, color: AppTheme.textMuted),
                          const SizedBox(width: 4),
                          Text('Server Configuration', style: TextStyle(fontSize: 11.5, color: AppTheme.textMuted, fontWeight: FontWeight.w500)),
                        ],
                      ),
                    ),
                  ),
                  if (_showServerConfig) ...[
                    const SizedBox(height: 10),
                    TextField(
                      controller: _serverController,
                      decoration: InputDecoration(
                        labelText: 'Server URL',
                        hintText: AuthService.defaultServerUrl,
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppTheme.border)),
                        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppTheme.border)),
                        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppTheme.success, width: 1.5)),
                        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                      ),
                      style: const TextStyle(fontSize: 13),
                      keyboardType: TextInputType.url,
                    ),
                  ],
                  const SizedBox(height: 22),

                  // Footer
                  Center(
                    child: Column(
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.verified_user, size: 12, color: AppTheme.success),
                            const SizedBox(width: 4),
                            const Text('Enterprise-grade security', style: TextStyle(fontSize: 10, color: AppTheme.textMuted)),
                          ],
                        ),
                        const SizedBox(height: 6),
                        Text('\u00a9 ${DateTime.now().year} 3 Boxes HRMS', style: const TextStyle(fontSize: 10, color: AppTheme.textMuted)),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
