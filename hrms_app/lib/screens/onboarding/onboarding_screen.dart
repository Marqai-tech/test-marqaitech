import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../../config/maan_theme.dart';

/// Onboarding — matches design screenshot #1 ("Keep healthy work-life balance").
/// Vector illustrations are painted in-code (no image assets required).
class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final PageController _controller = PageController();
  int _page = 0;

  static const List<_Slide> _slides = [
    _Slide(
      title: 'Keep healthy\nwork-life balance',
      body: 'Track hours, leaves and attendance in one calm place — so work stays organized and life stays personal.',
      art: _Art.balance,
    ),
    _Slide(
      title: 'Attendance in\ntwo taps',
      body: 'Your team clocks in from the shop floor or from home — biometric, web and mobile punches, perfectly in sync.',
      art: _Art.team,
    ),
    _Slide(
      title: 'Payroll without\nthe paperwork',
      body: 'Salaries, overtime and statements computed for you, with every document a tap away.',
      art: _Art.growth,
    ),
  ];

  void _next() {
    if (_page < _slides.length - 1) {
      _controller.nextPage(duration: const Duration(milliseconds: 380), curve: Curves.easeOutCubic);
    } else {
      Navigator.pushReplacementNamed(context, '/role-select');
    }
  }

  @override
  Widget build(BuildContext context) {
    final slide = _slides[_page];
    return Scaffold(
      backgroundColor: const Color(0xFFEAF1FB),
      body: SafeArea(
        child: Column(
          children: [
            Align(
              alignment: Alignment.topRight,
              child: Padding(
                padding: const EdgeInsets.only(top: 8, right: 24),
                child: TextButton(
                  onPressed: () => Navigator.pushReplacementNamed(context, '/role-select'),
                  child: const Text('Skip', style: TextStyle(color: MaanColors.navy, fontSize: 15, fontWeight: FontWeight.w600)),
                ),
              ),
            ),
            Expanded(
              child: PageView.builder(
                controller: _controller,
                itemCount: _slides.length,
                onPageChanged: (i) => setState(() => _page = i),
                itemBuilder: (context, i) => Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 28),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [Expanded(child: Center(child: _art(_slides[i].art)))],
                  ),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(28, 0, 28, 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(slide.title, style: MaanText.h1),
                  const SizedBox(height: 12),
                  Text(slide.body, style: MaanText.body),
                  const SizedBox(height: 22),
                  Row(
                    children: [
                      Row(
                        children: List.generate(_slides.length, (i) {
                          final active = i == _page;
                          return AnimatedContainer(
                            duration: const Duration(milliseconds: 250),
                            margin: const EdgeInsets.only(right: 6),
                            width: active ? 26 : 8,
                            height: 8,
                            decoration: BoxDecoration(
                              color: active ? MaanColors.primary : const Color(0xFFC7D4F2),
                              borderRadius: BorderRadius.circular(5),
                            ),
                          );
                        }),
                      ),
                      const Spacer(),
                      GestureDetector(
                        onTap: _next,
                        child: Container(
                          width: 64,
                          height: 64,
                          decoration: BoxDecoration(
                            color: MaanColors.primary,
                            shape: BoxShape.circle,
                            boxShadow: [BoxShadow(color: MaanColors.primary.withOpacity(.4), blurRadius: 18, offset: const Offset(0, 8))],
                          ),
                          child: const Icon(Icons.arrow_forward, color: Colors.white, size: 28),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 26),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _art(_Art art) {
    switch (art) {
      case _Art.balance:
        return const _BalanceArt();
      case _Art.team:
        return const _TeamArt();
      case _Art.growth:
        return const _GrowthArt();
    }
  }
}

enum _Art { balance, team, growth }

/// Stylized clock + hourglass + plant composition.
class _BalanceArt extends StatelessWidget {
  const _BalanceArt();
  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 300,
      height: 260,
      child: Stack(
        alignment: Alignment.center,
        children: [
          Positioned(
            bottom: 6,
            right: 24,
            child: Container(
              width: 130,
              height: 100,
              decoration: BoxDecoration(color: const Color(0xFFBBD2F5), borderRadius: BorderRadius.circular(60)),
            ),
          ),
          Positioned(
            bottom: 10,
            left: 30,
            child: Column(
              children: [
                Row(children: [
                  Container(width: 16, height: 34, decoration: BoxDecoration(color: const Color(0xFF34C38F), borderRadius: BorderRadius.circular(8))),
                  const SizedBox(width: 4),
                  Container(width: 14, height: 26, margin: const EdgeInsets.only(bottom: 8), decoration: BoxDecoration(color: const Color(0xFFF5C84C), borderRadius: BorderRadius.circular(7))),
                ]),
                const SizedBox(height: 4),
                Container(
                  width: 30,
                  height: 24,
                  decoration: const BoxDecoration(
                    color: Color(0xFFE8B4B8),
                    borderRadius: BorderRadius.only(bottomLeft: Radius.circular(8), bottomRight: Radius.circular(8)),
                  ),
                ),
              ],
            ),
          ),
          Positioned(
            bottom: 0,
            left: 105,
            child: Column(
              children: [
                CustomPaint(size: const Size(46, 52), painter: _HourglassPainter()),
                Container(width: 54, height: 8, decoration: BoxDecoration(color: const Color(0xFF8A93A8), borderRadius: BorderRadius.circular(4))),
              ],
            ),
          ),
          Positioned(
            top: 0,
            left: 60,
            child: Container(
              width: 150,
              height: 150,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: Colors.white,
                border: Border.all(color: const Color(0xFF39445C), width: 10),
                boxShadow: [BoxShadow(color: Colors.black.withOpacity(.08), blurRadius: 20, offset: const Offset(0, 10))],
              ),
              child: const Center(child: CustomPaint(size: Size(100, 100), painter: _ClockPainter())),
            ),
          ),
          Positioned(top: 8, right: 40, child: _tick()),
          Positioned(top: 60, right: 8, child: _tick()),
        ],
      ),
    );
  }

  Widget _tick() => Container(
        width: 20,
        height: 20,
        decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: const Color(0xFF9DB6E4), width: 2)),
        child: const Icon(Icons.check, size: 12, color: Color(0xFF9DB6E4)),
      );
}

class _ClockPainter extends CustomPainter {
  const _ClockPainter();
  @override
  void paint(Canvas canvas, Size size) {
    final c = Offset(size.width / 2, size.height / 2);
    final paint = Paint()
      ..color = const Color(0xFF39445C)
      ..strokeWidth = 5
      ..strokeCap = StrokeCap.round
      ..style = PaintingStyle.stroke;
    final mark = Paint()..color = const Color(0xFFB9C2D4)..strokeWidth = 2;
    for (int i = 0; i < 12; i++) {
      final a = i * math.pi / 6;
      final p1 = c + Offset(size.width * .38 * math.cos(a), size.width * .38 * math.sin(a));
      final p2 = c + Offset(size.width * .44 * math.cos(a), size.width * .44 * math.sin(a));
      canvas.drawLine(p1, p2, mark);
    }
    canvas.drawLine(c, c + const Offset(18, -14), paint);
    canvas.drawLine(c, c + const Offset(-8, -24), paint);
    canvas.drawCircle(c, 5, Paint()..color = const Color(0xFF39445C));
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _HourglassPainter extends CustomPainter {
  const _HourglassPainter();
  @override
  void paint(Canvas canvas, Size size) {
    final frame = Paint()
      ..color = const Color(0xFF39445C)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 5
      ..strokeCap = StrokeCap.round;
    final sand = Paint()..color = const Color(0xFFF5C84C);
    final path = Path()
      ..moveTo(2, 2)
      ..lineTo(size.width - 2, 2)
      ..moveTo(2, size.height - 2)
      ..lineTo(size.width - 2, size.height - 2)
      ..moveTo(4, 2)
      ..quadraticBezierTo(size.width * .52, size.height * .42, size.width * .52, size.height * .5)
      ..quadraticBezierTo(size.width * .52, size.height * .58, size.width - 4, size.height - 2)
      ..moveTo(size.width - 4, 2)
      ..quadraticBezierTo(size.width * .48, size.height * .42, size.width * .48, size.height * .5)
      ..quadraticBezierTo(size.width * .48, size.height * .58, 4, size.height - 2);
    canvas.drawPath(path, frame);
    final top = Path()
      ..moveTo(8, 6)
      ..lineTo(size.width - 8, 6)
      ..lineTo(size.width * .55, size.height * .45)
      ..lineTo(size.width * .45, size.height * .45)
      ..close();
    canvas.drawPath(top, sand);
    final bottom = Path()
      ..moveTo(size.width * .5, size.height * .62)
      ..lineTo(size.width * .62, size.height - 6)
      ..lineTo(size.width * .38, size.height - 6)
      ..close();
    canvas.drawPath(bottom, sand);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

/// Avatar-cluster art for the team slide.
class _TeamArt extends StatelessWidget {
  const _TeamArt();
  @override
  Widget build(BuildContext context) {
    final people = [
      const Color(0xFF7C6FF0),
      const Color(0xFFF278B0),
      const Color(0xFF38BDF8),
      const Color(0xFFF5A623),
      const Color(0xFF34C38F),
    ];
    final offsets = [
      const Offset(-78, -34),
      const Offset(-30, -74),
      const Offset(40, -50),
      const Offset(70, 16),
      const Offset(-4, 28),
    ];
    return SizedBox(
      width: 260,
      height: 220,
      child: Stack(
        alignment: Alignment.center,
        children: [
          for (int i = 0; i < people.length; i++)
            Transform.translate(
              offset: offsets[i],
              child: Container(
                width: 92,
                height: 92,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Colors.white,
                  border: Border.all(color: people[i].withOpacity(.35), width: 3),
                  boxShadow: [BoxShadow(color: people[i].withOpacity(.18), blurRadius: 14, offset: const Offset(0, 6))],
                ),
                child: Icon(Icons.person, size: 46, color: people[i]),
              ),
            ),
        ],
      ),
    );
  }
}

/// Rising bars art for the payroll slide.
class _GrowthArt extends StatelessWidget {
  const _GrowthArt();
  @override
  Widget build(BuildContext context) {
    final bars = [46.0, 74.0, 60.0, 104.0, 132.0];
    final colors = [const Color(0xFFC7D4F2), const Color(0xFF9DB6E4), const Color(0xFF7C6FF0), const Color(0xFF5B7FE8), const Color(0xFF34C38F)];
    return SizedBox(
      width: 280,
      height: 220,
      child: Stack(
        alignment: Alignment.bottomCenter,
        children: [
          Container(
            width: 260,
            height: 150,
            decoration: BoxDecoration(color: const Color(0xFFE4EBF9), borderRadius: BorderRadius.circular(24)),
          ),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              for (int i = 0; i < bars.length; i++)
                Container(
                  width: 30,
                  height: bars[i],
                  margin: const EdgeInsets.symmetric(horizontal: 7),
                  decoration: BoxDecoration(color: colors[i], borderRadius: BorderRadius.circular(10)),
                ),
            ],
          ),
          Positioned(
            top: 8,
            right: 26,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(20), boxShadow: [BoxShadow(color: Colors.black.withOpacity(.06), blurRadius: 10)]),
              child: const Text('₹ payroll ✓', style: TextStyle(color: MaanColors.navy, fontSize: 12, fontWeight: FontWeight.w700)),
            ),
          ),
        ],
      ),
    );
  }
}

class _Slide {
  final String title;
  final String body;
  final _Art art;
  const _Slide({required this.title, required this.body, required this.art});
}
