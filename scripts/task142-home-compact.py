#!/usr/bin/env python3
# Task 142 — home_screen.dart compaction rewrite (stage 2: widget bodies)
import re, sys

P = '/home/z/my-project/hrms_app/lib/screens/home/home_screen.dart'
s = open(P).read()
orig_len = len(s)

def replace_between(s, start_anchor, end_anchor, replacement, include_start=True, include_end=False):
    """Replace text from start_anchor up to (not including) end_anchor."""
    i = s.find(start_anchor)
    if i < 0:
        print(f'ANCHOR NOT FOUND: {start_anchor[:60]!r}'); sys.exit(1)
    j = s.find(end_anchor, i + len(start_anchor))
    if j < 0:
        print(f'END ANCHOR NOT FOUND: {end_anchor[:60]!r}'); sys.exit(1)
    return s[:i] + replacement + s[j:]

# ── R1: delete _timeLogCard + _logTile (up to the org-stats doc comment) ──
s = replace_between(s, '  Widget _timeLogCard() {', '  /// Task 139 — organization stats for EVERY login', '')

# ── R2: _orgStatsCard → compact _orgStrip ──
ORG = '''  /// Task 142 — organization strip: single row (Total · Active · On Leave ·
  /// Exits), same company-wide numbers for every login (Task 139 parity).
  Widget _orgStrip() {
    Widget chip(String value, String label, Color color) => Padding(
      padding: const EdgeInsets.only(left: 8),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Text(value, style: TextStyle(color: color, fontSize: 12.5, fontWeight: FontWeight.w800)),
        const SizedBox(width: 3),
        Text(label, style: TextStyle(color: MaanColors.faint, fontSize: 9.5, fontWeight: FontWeight.w600)),
      ]),
    );
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 10, 16, 0),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: MaanColors.line)),
      child: Row(children: [
        const Icon(Icons.groups_rounded, size: 14, color: MaanColors.primary),
        const SizedBox(width: 6),
        Text('Organization', style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800, color: MaanColors.navy)),
        const Spacer(),
        chip('$_orgTotal', 'Total', MaanColors.navy),
        chip('$_orgActive', 'Active', Colors.green.shade700),
        chip('$_orgOnLeave', 'Leave', Colors.orange.shade800),
        chip('$_orgExits', 'Exits', Colors.red.shade600),
      ]),
    );
  }

'''
s = replace_between(s, '  /// Task 139 — organization stats for EVERY login', '  Widget _monthCard() {', ORG)

# ── R3: _monthCard + _monthChip → merged _attendanceCard + _miniStat ──
ATT = '''  /// Task 142 — merged attendance card: This Month stat chips + the
  /// last-week mini bar chart (three standalone cards became ONE compact
  /// card so the dashboard fits a single screen).
  Widget _attendanceCard() {
    final s = _summary;
    final workingDays = ((s?['workingDays'] ?? 0) as num).toInt();
    final attended = ((s?['attendedDays'] ?? 0) as num).toDouble();
    final rate = s?['attendanceRate'];
    final attendedText = attended == attended.roundToDouble() ? '${attended.toInt()}' : attended.toStringAsFixed(1);
    final totalHours = _weekHours.fold<double>(0, (sum, h) => h > 0 ? sum + h : sum);
    final maxValue = _weekHours.fold<double>(0, (m, h) => h > m ? h : m).clamp(1, 12).toDouble();
    return GestureDetector(
      onTap: () => Navigator.pushNamed(context, '/attendance-report'),
      child: Container(
        margin: const EdgeInsets.fromLTRB(16, 10, 16, 0),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), border: Border.all(color: MaanColors.line)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            const Icon(Icons.insights_rounded, size: 15, color: MaanColors.primary),
            const SizedBox(width: 6),
            Text('Attendance', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: MaanColors.navy)),
            const Spacer(),
            Flexible(
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(color: MaanColors.accentCyan.withOpacity(.12), borderRadius: BorderRadius.circular(8)),
                child: Text('$attendedText/$workingDays d · ${totalHours.toStringAsFixed(totalHours >= 10 ? 0 : 1)}h wk',
                    maxLines: 1, overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: MaanColors.accentCyan)),
              ),
            ),
          ]),
          if (rate is num) ...[
            const SizedBox(height: 7),
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(value: rate.toDouble().clamp(0, 100) / 100, minHeight: 4, backgroundColor: MaanColors.line, color: MaanColors.accentGreen),
            ),
          ],
          const SizedBox(height: 9),
          Row(children: [
            Expanded(child: _miniStat('${((s?['present'] ?? 0) as num).toInt()}', 'Present', MaanColors.accentGreen)),
            const SizedBox(width: 6),
            Expanded(child: _miniStat('${((s?['late'] ?? 0) as num).toInt()}', 'Late', MaanColors.accentOrange)),
            const SizedBox(width: 6),
            Expanded(child: _miniStat('${((s?['absent'] ?? 0) as num).toInt()}', 'Absent', MaanColors.accentRed)),
          ]),
          const SizedBox(height: 10),
          SizedBox(
            height: 58,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [for (var i = 0; i < 7; i++) Expanded(child: _weekMiniBar(i, maxValue))],
            ),
          ),
        ]),
      ),
    );
  }

  Widget _miniStat(String value, String label, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 5),
      decoration: BoxDecoration(color: color.withOpacity(.09), borderRadius: BorderRadius.circular(9)),
      child: Column(children: [
        Text(value, style: TextStyle(color: color, fontSize: 13.5, fontWeight: FontWeight.w800)),
        Text(label, style: TextStyle(color: color, fontSize: 9.5, fontWeight: FontWeight.w600)),
      ]),
    );
  }

'''
s = replace_between(s, '  Widget _monthCard() {', '  // ══════════════ Task 141 — Announcements banner ══════════════', ATT)

# ── R4: old banner + week chart + quick links → ticker + mini week bar ──
TICKER = '''  // ══════════════ Task 142 — announcements ticker + mini week bar ══════════════

  /// Announcements ticker: single line INSIDE the gradient header (replaces
  /// the standalone banner card). Auto-rotates via the 1s ticker; tap opens
  /// the full Announcements list.
  Widget _announcementsTicker() {
    if (_announcements.isEmpty) return const SizedBox.shrink();
    final safeIndex = _bannerIndex.clamp(0, _announcements.length - 1);
    final post = _announcements[safeIndex];
    final pinned = post['isPinned'] == true;
    final content = '${post['content'] ?? ''}';
    return GestureDetector(
      onTap: () => Navigator.pushNamed(context, '/announcements'),
      child: Container(
        margin: const EdgeInsets.only(top: 10),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
        decoration: BoxDecoration(color: Colors.white.withOpacity(.16), borderRadius: BorderRadius.circular(10)),
        child: Row(
          children: [
            Icon(pinned ? Icons.push_pin_rounded : Icons.campaign_rounded, color: Colors.white, size: 14),
            const SizedBox(width: 7),
            Expanded(
              child: AnimatedSwitcher(
                duration: const Duration(milliseconds: 350),
                child: Text(
                  content,
                  key: ValueKey<String>('ticker-$safeIndex-${post['id'] ?? ''}'),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: Colors.white, fontSize: 11.5, fontWeight: FontWeight.w700),
                ),
              ),
            ),
            if (_announcements.length > 1) ...[
              const SizedBox(width: 8),
              Text('${safeIndex + 1}/${_announcements.length}', style: const TextStyle(color: Colors.white70, fontSize: 9.5, fontWeight: FontWeight.w800)),
            ],
          ],
        ),
      ),
    );
  }

  /// Last-week mini bar: worked hours per day (absent = red bar). Used inside
  /// the merged attendance card.
  Widget _weekMiniBar(int i, double maxValue) {
    final hours = _weekHours[i];
    final label = _weekDayLabels[i];
    final hasData = hours >= 0;
    final isToday = i == 6;
    final fraction = hasData ? (hours / maxValue).clamp(0.06, 1.0) : 0.06;
    final barColor = !hasData
        ? MaanColors.line
        : _weekAbsent[i]
            ? MaanColors.accentRed
            : (isToday ? MaanColors.primary : MaanColors.accentCyan);
    return Column(mainAxisAlignment: MainAxisAlignment.end, children: [
      Text(hasData ? (hours <= 0 ? '0' : hours.toStringAsFixed(hours >= 10 ? 0 : 1)) : '\\u2013',
          style: TextStyle(fontSize: 8.5, fontWeight: FontWeight.w800, color: hasData ? MaanColors.navy : MaanColors.faint)),
      const SizedBox(height: 3),
      Container(
        width: 14,
        height: (34 * fraction).clamp(3, 34).toDouble(),
        decoration: BoxDecoration(color: barColor, borderRadius: BorderRadius.circular(4)),
      ),
      const SizedBox(height: 3),
      Text(label, style: TextStyle(fontSize: 8.5, fontWeight: isToday ? FontWeight.w900 : FontWeight.w600, color: isToday ? MaanColors.primary : MaanColors.faint)),
    ]);
  }

'''
s = replace_between(s, '  // ══════════════ Task 141 — Announcements banner ══════════════', '  Widget _wfhBanner() {', TICKER)

# ── R6: birthdays → compact row + full-list sheet ──
BD = '''  /// Task 142 — compact birthdays row: today's celebrants as an avatar stack
  /// + next upcoming. Tap opens the full list (today + upcoming) with the
  /// Send Wishes buttons, keeping the dashboard itself one screen tall.
  Widget _birthdaysCard() {
    if (_birthdaysToday.isEmpty && _birthdaysUpcoming.isEmpty) return const SizedBox.shrink();
    final n = _birthdaysToday.length;
    final next = _birthdaysUpcoming.isNotEmpty ? _birthdaysUpcoming.first : null;
    return GestureDetector(
      onTap: _showBirthdaysSheet,
      child: Container(
        margin: const EdgeInsets.fromLTRB(16, 10, 16, 0),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          gradient: const LinearGradient(colors: [Color(0xFFFDF2F8), Colors.white, Color(0xFFFFFBEB)]),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: MaanColors.line),
        ),
        child: Row(children: [
          const Text('🎂', style: TextStyle(fontSize: 15)),
          const SizedBox(width: 8),
          if (n > 0)
            SizedBox(
              width: n.clamp(1, 4) * 19.0,
              height: 26,
              child: Stack(
                children: [
                  for (var i = 0; i < n.clamp(1, 4); i++)
                    Positioned(
                      left: i * 19.0,
                      child: CircleAvatar(
                        radius: 12,
                        backgroundColor: Colors.white,
                        child: CircleAvatar(
                          radius: 11,
                          backgroundColor: MaanColors.accentPink.withOpacity(.18),
                          child: Text(
                            '${_birthdaysToday[i]['name'] ?? ''}'.trim().split(' ').where((w) => w.isNotEmpty).take(2).map((w) => w[0].toUpperCase()).join(),
                            style: const TextStyle(fontSize: 8, fontWeight: FontWeight.w800, color: MaanColors.accentPink),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
              Text(
                n > 0 ? '$n birthday${n == 1 ? '' : 's'} today' : 'Upcoming birthdays',
                maxLines: 1, overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: MaanColors.navy),
              ),
              if (next != null)
                Builder(builder: (_) {
                  final bd = DateTime.tryParse('${next['originalBirthday'] ?? ''}');
                  final when = bd != null ? DateFormat('dd MMM').format(DateTime(DateTime.now().year, bd.month, bd.day)) : '';
                  return Text('Next: ${next['name'] ?? ''}${when.isNotEmpty ? ' · $when' : ''}',
                      maxLines: 1, overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 10, color: MaanColors.faint));
                }),
            ]),
          ),
          const Icon(Icons.chevron_right_rounded, size: 18, color: MaanColors.faint),
        ]),
      ),
    );
  }

  /// Full birthday list (today + upcoming + Send Wishes) — opened from the
  /// compact home row.
  void _showBirthdaysSheet() {
    final df = DateFormat('dd MMM');
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.white,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (sheetCtx) => SafeArea(
        child: DraggableScrollableSheet(
          expand: false,
          initialChildSize: 0.62,
          maxChildSize: 0.9,
          builder: (ctx, scrollCtrl) => Column(children: [
            const SizedBox(height: 14),
            Container(width: 44, height: 4.5, decoration: BoxDecoration(color: MaanColors.line, borderRadius: BorderRadius.circular(3))),
            const SizedBox(height: 12),
            const Text('🎂 Birthdays', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: MaanColors.navy)),
            Expanded(
              child: ListView(
                controller: scrollCtrl,
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
                children: [
                  if (_birthdaysToday.isEmpty)
                    Padding(padding: const EdgeInsets.only(bottom: 10), child: Text('No birthdays today.', style: MaanText.caption.copyWith(fontSize: 12))),
                  for (final p in _birthdaysToday)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: Row(children: [
                        CircleAvatar(
                          radius: 16,
                          backgroundColor: MaanColors.accentPink.withOpacity(.18),
                          child: Text(
                            '${p['name'] ?? ''}'.trim().split(' ').where((w) => w.isNotEmpty).take(2).map((w) => w[0].toUpperCase()).join(),
                            style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w800, color: MaanColors.accentPink),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text('${p['name'] ?? ''}', maxLines: 1, overflow: TextOverflow.ellipsis,
                                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: MaanColors.navy)),
                            Text('${p['employeeCode'] ?? ''}${p['department'] != null ? ' · ${p['department']}' : ''}',
                                maxLines: 1, overflow: TextOverflow.ellipsis,
                                style: const TextStyle(fontSize: 10.5, color: MaanColors.faint)),
                          ]),
                        ),
                        const SizedBox(width: 8),
                        if (_wishedByMe.contains('${p['employeeId'] ?? ''}'))
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                            decoration: BoxDecoration(color: MaanColors.accentGreen.withOpacity(.12), borderRadius: BorderRadius.circular(9)),
                            child: const Text('Wished \\u2713', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: MaanColors.accentGreen)),
                          )
                        else
                          FilledButton.icon(
                            onPressed: () => _sendWish(p),
                            style: FilledButton.styleFrom(
                              backgroundColor: MaanColors.accentPink,
                              foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                              minimumSize: const Size(0, 32),
                            ),
                            icon: const Icon(Icons.card_giftcard_rounded, size: 14),
                            label: const Text('Send Wishes', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800)),
                          ),
                      ]),
                    ),
                  if (_birthdaysUpcoming.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    const Text('UPCOMING', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w900, letterSpacing: .8, color: MaanColors.faint)),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 6, runSpacing: 6,
                      children: [
                        for (final p in _birthdaysUpcoming.take(12))
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(8), border: Border.all(color: MaanColors.line)),
                            child: Builder(builder: (_) {
                              final bd = DateTime.tryParse('${p['originalBirthday'] ?? ''}');
                              final when = bd != null ? df.format(DateTime(DateTime.now().year, bd.month, bd.day)) : '';
                              return Text('${p['name'] ?? ''} · $when · in ${p['daysUntil'] ?? '?'}d',
                                  style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, color: MaanColors.body));
                            }),
                          ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
          ]),
        ),
      ),
    );
  }

'''
s = replace_between(s, '  /// Task 136 — Birthdays card: colleagues whose ORIGINAL birthday is today', '  Widget _modulesGrid() {', BD)

# ── R7: modules grid → compact 4-col (max 8 tiles + More) ──
MOD = '''  Widget _modulesGrid() {
    final isSuper = context.watch<AuthProvider>().isSuperAdminSession;
    // Task 129 — admin/manager Reports entry (leave · attendance · employees · projects)
    final role = context.watch<AuthProvider>().user?.role;
    final canSeeReports = ReportsScreen.canSee(role);
    final tiles = <_ModuleTile>[
      _ModuleTile('Employees', Icons.people_alt_rounded, MaanColors.accentIndigo, const Color(0xFFE9E6FD), () => Navigator.pushNamed(context, '/employees-new')),
      _ModuleTile('Leave', Icons.event_busy_rounded, MaanColors.accentOrange, const Color(0xFFFEF3E2), () => Navigator.pushNamed(context, '/leaves-new')),
      _ModuleTile('Attendance', Icons.fact_check_rounded, MaanColors.accentGreen, const Color(0xFFE6F9F2), () => Navigator.pushNamed(context, '/attendance-new')),
      _ModuleTile('Payroll', Icons.request_quote_rounded, MaanColors.accentCyan, const Color(0xFFE8F4FD), () => Navigator.pushNamed(context, '/payroll-new')),
      _ModuleTile('Projects', Icons.folder_special_rounded, MaanColors.accentPurple, const Color(0xFFF1EDFD), () => Navigator.pushNamed(context, '/projects-new')),
      _ModuleTile('Chat', Icons.chat_bubble_rounded, const Color(0xFF0EA5A6), const Color(0xFFE6F7F6), () => Navigator.pushNamed(context, '/chat')),
      _ModuleTile('Help Desk', Icons.headset_mic_rounded, const Color(0xFF38BDF8), const Color(0xFFE8F4FD), () => Navigator.pushNamed(context, '/helpdesk')),
      if (canSeeReports)
        _ModuleTile('Reports', Icons.bar_chart_rounded, const Color(0xFFD97706), const Color(0xFFFDF3E3), () => Navigator.pushNamed(context, '/reports')),
      if (canSeeReports)
        _ModuleTile('Team Att.', Icons.groups_rounded, MaanColors.accentGreen, const Color(0xFFE6F9F2), () => Navigator.pushNamed(context, '/team-attendance')),
      _ModuleTile('Directory', Icons.people_outline_rounded, const Color(0xFF6C8FEF), const Color(0xFFE9E6FD), () => Navigator.pushNamed(context, '/directory')),
      _ModuleTile('Feeds', Icons.campaign_rounded, MaanColors.accentPink, const Color(0xFFFDE7EF), () => Navigator.pushNamed(context, '/announcements')),
      _ModuleTile('Profile', Icons.person_rounded, MaanColors.accentPurple, const Color(0xFFEFEAFD), () => Navigator.pushNamed(context, '/profile')),
      if (isSuper)
        _ModuleTile('Workspace', Icons.swap_horiz_rounded, MaanColors.navy, const Color(0xFFEEF2F7), () async {
          context.read<AuthProvider>().beginTenantPick();
          await Navigator.pushNamed(context, '/tenant-picker');
          if (mounted) _load();
        }),
    ];
    // Task 142 — ONE-SCREEN rule: at most 8 tiles (4×2). Everything else
    // stays one tap away in the drawer via the "More" tile. Quick Links was
    // absorbed into this grid (same destinations, half the height).
    final overflow = tiles.length > 8;
    final shown = overflow ? tiles.sublist(0, 7) : tiles;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(padding: EdgeInsets.fromLTRB(16, 14, 16, 8), child: Text('Modules', style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w800, color: MaanColors.navy))),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: GridView.count(
            crossAxisCount: 4,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 8,
            crossAxisSpacing: 8,
            childAspectRatio: 1.05,
            children: [
              for (final t in shown) _tile(t),
              if (overflow)
                _tile(_ModuleTile('More', Icons.apps_rounded, MaanColors.faint, const Color(0xFFF1F2FA), () => Scaffold.of(context).openDrawer())),
            ],
          ),
        ),
      ],
    );
  }

  Widget _tile(_ModuleTile t) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: t.onTap,
        child: Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(14), border: Border.all(color: MaanColors.line)),
          child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
            Container(width: 30, height: 30, decoration: BoxDecoration(color: t.bg, borderRadius: BorderRadius.circular(9)), child: Icon(t.icon, color: t.accent, size: 17)),
            const SizedBox(height: 5),
            Text(t.label, maxLines: 1, overflow: TextOverflow.ellipsis, textAlign: TextAlign.center, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: MaanColors.navy)),
          ]),
        ),
      ),
    );
  }
}

'''
s = replace_between(s, '  Widget _modulesGrid() {', '/// Fingerprint-style circular punch button', MOD)

# ── R8: _QuickLink class → _ModuleTile class ──
s = replace_between(s, '/// Task 141 — a Quick Links shortcut entry', '', '''/// Task 142 — a compact module grid entry (label + icon + destination).
class _ModuleTile {
  final String label;
  final IconData icon;
  final Color accent;
  final Color bg;
  final VoidCallback onTap;
  const _ModuleTile(this.label, this.icon, this.accent, this.bg, this.onTap);
}
''')

# ── R9: fingerprint button 84→64 ──
s = s.replace('width: 84, height: 84,', 'width: 64, height: 64,')
s = s.replace("padding: const EdgeInsets.all(9),\n            child: Container(\n              decoration: BoxDecoration(shape: BoxShape.circle, color: color.withOpacity(.18)),\n              padding: const EdgeInsets.all(9),", "padding: const EdgeInsets.all(7),\n            child: Container(\n              decoration: BoxDecoration(shape: BoxShape.circle, color: color.withOpacity(.18)),\n              padding: const EdgeInsets.all(7),")
s = s.replace("child: Icon(Icons.fingerprint_rounded, color: Colors.white, size: 38),", "child: Icon(Icons.fingerprint_rounded, color: Colors.white, size: 30),")
s = s.replace("borderRadius: BorderRadius.circular(44),", "borderRadius: BorderRadius.circular(32),")

open(P, 'w').write(s)
print(f'home_screen rewritten: {orig_len} → {len(s)} bytes')
