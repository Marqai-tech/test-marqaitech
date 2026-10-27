import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../../config/maan_theme.dart';

/// Task 141 — Welcome screen (login design image #2, screen 1):
/// deep-navy starry sky, the 3Boxes HRMS logo card, the welcome headline and
/// the "continue" arrow into the redesigned sign-in flow
/// (Mobile number | Employee ID → OTP verify → fingerprint unlock → Home).
class WelcomeScreen extends StatefulWidget {
  const WelcomeScreen({super.key});

  @override
  State<WelcomeScreen> createState() => _WelcomeScreenState();
}

class _WelcomeScreenState extends State<WelcomeScreen> with SingleTickerProviderStateMixin {
  late final AnimationController _glow = AnimationController(vsync: this, duration: const Duration(seconds: 3))
    ..repeat(reverse: true);
  late final List<_Star> _stars;

  _WelcomeScreenState() {
    final rng = math.Random(42);
    _stars = List.generate(70, (_) {
      return _Star(
        rng.nextDouble(),
        rng.nextDouble() * 0.72,
        0.6 + rng.nextDouble() * 1.5,
        0.18 + rng.nextDouble() * 0.72,
      );
    });
  }

  @override
  void dispose() {
    _glow.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              Color(0xFF0B1026),
              Color(0xFF151B3D),
              Color(0xFF2A1E5C),
              Color(0xFF3B2A7A),
            ],
            stops: [0.0, 0.42, 0.78, 1.0],
          ),
        ),
        child: Stack(
          children: [
            // Star field
            Positioned.fill(
              child: CustomPaint(painter: _StarPainter(stars: _stars)),
            ),
            // Violet glow behind the logo (pulses gently)
            Positioned(
              top: MediaQuery.of(context).size.height * 0.16,
              left: 0,
              right: 0,
              child: Center(
                child: FadeTransition(
                  opacity: Tween<double>(begin: 0.55, end: 0.95).animate(CurvedAnimation(parent: _glow, curve: Curves.easeInOut)),
                  child: Container(
                    width: 190,
                    height: 190,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: RadialGradient(colors: [
                        const Color(0xFF8B5CF6).withOpacity(.42),
                        const Color(0xFF8B5CF6).withOpacity(0),
                      ]),
                    ),
                  ),
                ),
              ),
            ),
            // Content
            SafeArea(
              child: Column(
                children: [
                  Expanded(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        // Logo card
                        Container(
                          width: 108,
                          height: 108,
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(26),
                            boxShadow: [
                              BoxShadow(color: const Color(0xFF8B5CF6).withOpacity(.45), blurRadius: 44, spreadRadius: 2),
                              BoxShadow(color: Colors.black.withOpacity(.25), blurRadius: 18, offset: const Offset(0, 10)),
                            ],
                          ),
                          padding: const EdgeInsets.all(16),
                          child: Image.asset('assets/logos/logo-cubes.png', fit: BoxFit.contain),
                        ),
                        const SizedBox(height: 34),
                        const Text(
                          'Welcome to',
                          textAlign: TextAlign.center,
                          style: TextStyle(color: Color(0xFFB9C0F2), fontSize: 17, fontWeight: FontWeight.w500, letterSpacing: .3),
                        ),
                        const SizedBox(height: 8),
                        const Text(
                          '3Boxes HRMS',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 34,
                            fontWeight: FontWeight.w900,
                            letterSpacing: .4,
                            shadows: [Shadow(color: Color(0x668B5CF6), blurRadius: 26)],
                          ),
                        ),
                        const SizedBox(height: 14),
                        Text(
                          'Your workplace, in one place',
                          textAlign: TextAlign.center,
                          style: TextStyle(color: Colors.white.withOpacity(.66), fontSize: 14.5, fontWeight: FontWeight.w500),
                        ),
                      ],
                    ),
                  ),
                  // Feature strip (image 2 style highlights)
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 30),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                      children: [
                        _feature(Icons.verified_user_rounded, 'Secure Auth'),
                        _feature(Icons.bolt_rounded, 'Time Saving'),
                        _feature(Icons.favorite_rounded, 'User Friendly'),
                        _feature(Icons.insights_rounded, 'Live Insights'),
                      ],
                    ),
                  ),
                  const SizedBox(height: 26),
                  // Continue arrow
                  Padding(
                    padding: const EdgeInsets.only(bottom: 26),
                    child: Column(
                      children: [
                        InkWell(
                          borderRadius: BorderRadius.circular(34),
                          onTap: () => Navigator.pushNamed(context, '/signin'),
                          child: Container(
                            width: 68,
                            height: 68,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              gradient: const LinearGradient(colors: [Color(0xFF7C3AED), Color(0xFFA855F7)]),
                              boxShadow: [BoxShadow(color: const Color(0xFF8B5CF6).withOpacity(.55), blurRadius: 30, spreadRadius: 1)],
                            ),
                            child: const Icon(Icons.arrow_forward_rounded, color: Colors.white, size: 30),
                          ),
                        ),
                        const SizedBox(height: 12),
                        Text(
                          'Tap to get started',
                          style: TextStyle(color: Colors.white.withOpacity(.55), fontSize: 12.5, fontWeight: FontWeight.w600),
                        ),
                      ],
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

  Widget _feature(IconData icon, String label) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 46,
          height: 46,
          decoration: BoxDecoration(
            color: Colors.white.withOpacity(.08),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: Colors.white.withOpacity(.14)),
          ),
          child: Icon(icon, color: const Color(0xFFC4B5FD), size: 21),
        ),
        const SizedBox(height: 7),
        Text(label, style: TextStyle(color: Colors.white.withOpacity(.72), fontSize: 10.5, fontWeight: FontWeight.w600)),
      ],
    );
  }
}

class _Star {
  final double x;
  final double y;
  final double radius;
  final double opacity;
  const _Star(this.x, this.y, this.radius, this.opacity);
}

class _StarPainter extends CustomPainter {
  final List<_Star> stars;
  const _StarPainter({required this.stars});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = Colors.white;
    for (final s in stars) {
      paint.color = Colors.white.withOpacity(s.opacity);
      canvas.drawCircle(Offset(s.x * size.width, s.y * size.height), s.radius, paint);
    }
  }

  @override
  bool shouldRepaint(covariant _StarPainter oldDelegate) => oldDelegate.stars != stars;
}
