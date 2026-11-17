import 'package:flutter/material.dart';
import '../../config/maan_theme.dart';
import '../../services/api_service.dart';
import '../../utils/json_safe.dart';

/// Task 112 — Notifications rebuilt from design #18 with LIVE data:
///  · stats cards: Total / Unread / Read
///  · list from GET /api/notifications with unread purple dot + bell icon
///  · tap a notification → marks it read (PATCH); "Mark all read" action
///  · pull-to-refresh; friendly empty/error states.
class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  List<Map<String, dynamic>> _items = [];
  int _total = 0, _unread = 0;
  bool _loading = true;
  bool _markingAll = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final data = await ApiService.getNotifications();
      final list = jsonMapList(data['notifications'] is List ? data['notifications'] : data['data']);
      if (!mounted) return;
      setState(() {
        _items = list;
        final pag = jsonMap(data['pagination']);
        _total = (pag['total'] is num) ? (pag['total'] as num).toInt() : list.length;
        _unread = list.where((n) => n['isRead'] != true).length;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() { _loading = false; _error = e.toString().replaceAll('Exception: ', ''); });
    }
  }

  Future<void> _markRead(Map<String, dynamic> n) async {
    if (n['isRead'] == true || n['id'] == null) return;
    setState(() => n['isRead'] = true);
    try {
      await ApiService.markNotificationRead('${n['id']}');
      if (mounted) setState(() => _unread = (_unread - 1).clamp(0, _items.length));
    } catch (_) {
      n['isRead'] = false; // roll back on failure
      if (mounted) setState(() {});
    }
  }

  Future<void> _markAll() async {
    if (_markingAll || _unread == 0) return;
    setState(() => _markingAll = true);
    try {
      await ApiService.markAllNotificationsRead();
      if (mounted) {
        for (final n in _items) { n['isRead'] = true; }
        setState(() { _unread = 0; });
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('All notifications marked as read'), backgroundColor: Colors.green));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString().replaceAll('Exception: ', '')), backgroundColor: Colors.red));
      }
    }
    if (mounted) setState(() => _markingAll = false);
  }

  String _timeAgo(dynamic createdAt) {
    final t = DateTime.tryParse('${createdAt ?? ''}')?.toLocal();
    if (t == null) return '';
    final d = DateTime.now().difference(t);
    if (d.inMinutes < 1) return 'just now';
    if (d.inMinutes < 60) return '${d.inMinutes} minutes ago';
    if (d.inHours < 24) return '${d.inHours} hours ago';
    if (d.inDays < 7) return '${d.inDays} days ago';
    return '${t.day}/${t.month}/${t.year}';
  }

  (IconData, Color) _iconFor(Map<String, dynamic> n) {
    final cat = '${n['category'] ?? ''}'.toLowerCase();
    switch (cat) {
      case 'leave':
        return (Icons.event_note_rounded, MaanColors.accentOrange);
      case 'attendance':
        return (Icons.access_time_rounded, MaanColors.accentCyan);
      case 'payroll':
        return (Icons.request_quote_rounded, MaanColors.accentGreen);
      case 'employee':
        return (Icons.person_add_rounded, MaanColors.accentIndigo);
      case 'security':
        return (Icons.security_rounded, MaanColors.accentRed);
      case 'governance':
        return (Icons.gavel_rounded, MaanColors.accentPurple);
      default:
        return (Icons.notifications_rounded, MaanColors.primary);
    }
  }

  String _titleFor(Map<String, dynamic> n) {
    final t = '${n['title'] ?? ''}'.trim();
    if (t.isNotEmpty) return t;
    final m = '${n['message'] ?? ''}'.trim();
    return m.isNotEmpty ? m.substring(0, m.length.clamp(0, 40)) : 'Notification';
  }

  String _messageFor(Map<String, dynamic> n) {
    final t = '${n['title'] ?? ''}'.trim();
    final m = '${n['message'] ?? n['body'] ?? ''}'.trim();
    if (m.isNotEmpty && m != t) return m;
    if (m.isNotEmpty) return m;
    return 'No further details.';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: MaanColors.pageBg,
      appBar: AppBar(
        backgroundColor: MaanColors.primary,
        foregroundColor: Colors.white,
        title: const Text('Notifications', style: TextStyle(fontWeight: FontWeight.w800)),
        actions: [
          TextButton(
            onPressed: _unread == 0 || _markingAll ? null : _markAll,
            child: _markingAll
                ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                : Text('Mark all read', style: TextStyle(color: _unread == 0 ? Colors.white38 : Colors.white, fontWeight: FontWeight.w700, fontSize: 12.5)),
          ),
        ],
      ),
      body: Column(
        children: [
          // ── Stats cards ──
          Container(
            color: MaanColors.primary,
            padding: const EdgeInsets.fromLTRB(16, 2, 16, 16),
            child: Row(children: [
              Expanded(child: _statCard(Icons.notifications_rounded, 'Total', '$_total', Colors.white, MaanColors.accentPurple)),
              const SizedBox(width: 10),
              Expanded(child: _statCard(Icons.mark_email_unread_rounded, 'Unread', '$_unread', Colors.white, MaanColors.accentOrange)),
              const SizedBox(width: 10),
              Expanded(child: _statCard(Icons.email_rounded, 'Read', '${(_total - _unread).clamp(0, _total)}', Colors.white, MaanColors.accentGreen)),
            ]),
          ),
          Expanded(
            child: RefreshIndicator(
              color: MaanColors.primary,
              onRefresh: _load,
              child: _loading
                  ? const Center(child: CircularProgressIndicator(color: MaanColors.primary))
                  : _error != null
                      ? ListView(padding: const EdgeInsets.all(28), children: [
                          const Icon(Icons.wifi_off_rounded, size: 46, color: MaanColors.faint),
                          const SizedBox(height: 12),
                          Text(_error!, style: MaanText.body, textAlign: TextAlign.center),
                          const SizedBox(height: 12),
                          Center(child: FilledButton(onPressed: _load, style: FilledButton.styleFrom(backgroundColor: MaanColors.primary), child: const Text('Retry'))),
                        ])
                      : _items.isEmpty
                          ? ListView(children: const [
                              SizedBox(height: 90),
                              Icon(Icons.notifications_none_rounded, size: 56, color: MaanColors.faint),
                              SizedBox(height: 10),
                              Center(child: Text('No notifications yet', style: MaanText.body)),
                            ])
                          : ListView.separated(
                              padding: const EdgeInsets.all(14),
                              itemCount: _items.length,
                              separatorBuilder: (_, __) => const SizedBox(height: 8),
                              itemBuilder: (ctx, i) {
                                final n = _items[i];
                                return _card(n);
                              },
                            ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _statCard(IconData icon, String label, String value, Color color, Color iconBg) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 12),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14)),
      child: Column(children: [
        Container(
          width: 36, height: 36,
          decoration: BoxDecoration(color: iconBg.withOpacity(.14), borderRadius: BorderRadius.circular(10)),
          child: Icon(icon, color: iconBg, size: 18),
        ),
        const SizedBox(height: 6),
        Text(value, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: MaanColors.navy)),
        Text(label, style: MaanText.caption.copyWith(fontSize: 10.5)),
      ]),
    );
  }

  Widget _card(Map<String, dynamic> n) {
    final read = n['isRead'] == true;
    final (icon, color) = _iconFor(n);
    return Material(
      color: read ? Colors.white.withOpacity(.72) : Colors.white,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () => _markRead(n),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(14), border: Border.all(color: read ? MaanColors.line : MaanColors.primary.withOpacity(.35))),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                padding: const EdgeInsets.all(9),
                decoration: BoxDecoration(color: color.withOpacity(.12), borderRadius: BorderRadius.circular(11)),
                child: Icon(icon, color: color, size: 19),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Expanded(child: Text(_titleFor(n), maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 13.5, fontWeight: read ? FontWeight.w600 : FontWeight.w800, color: read ? MaanColors.body : MaanColors.navy))),
                    if (!read)
                      Container(width: 8, height: 8, decoration: const BoxDecoration(color: MaanColors.primary, shape: BoxShape.circle)),
                  ]),
                  const SizedBox(height: 3),
                  Text(_messageFor(n), style: MaanText.body.copyWith(fontSize: 12), maxLines: 2, overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 5),
                  Text(_timeAgo(n['createdAt']), style: MaanText.caption.copyWith(fontSize: 10.5)),
                ]),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
