import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../config/maan_theme.dart';
import '../../providers/auth_provider.dart';
import '../../services/api_service.dart';
import '../../widgets/main_scaffold.dart';

/// Task 141 — HR Help Desk (mobile) — connected to the SAME support
/// ticketing system as the web app's Support & AI → Help Desk module:
///  · GET  /api/tickets?mine=1  → my tickets (server-enforced self-scope)
///  · GET  /api/tickets         → all tickets (HR/Admin operations view)
///  · POST /api/tickets         → raise a ticket (reaches HR/Admin instantly)
///  · GET  /api/tickets/[id]    → full thread
///  · POST /api/tickets/[id]/comments → reply (visible to HR/Admin in web)
///  · PUT  /api/helpdesk        → status changes (HR/Admin)
class HelpDeskScreen extends StatefulWidget {
  const HelpDeskScreen({super.key});

  @override
  State<HelpDeskScreen> createState() => _HelpDeskScreenState();
}

class _HelpDeskScreenState extends State<HelpDeskScreen> {
  List<Map<String, dynamic>> _mine = [];
  List<Map<String, dynamic>> _all = [];
  bool _loading = true;
  String? _error;
  bool _isAdmin = false;

  @override
  void initState() {
    super.initState();
    final role = context.read<AuthProvider>().user?.role ?? '';
    _isAdmin = ['super_admin', 'tenant_admin', 'ceo', 'admin', 'company_hr_admin', 'hr_admin'].contains(role);
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final mineRes = await ApiService.getTickets(mine: true, limit: 100);
      final mineList = (mineRes['tickets'] as List?) ?? const [];
      _mine = mineList.whereType<Map<String, dynamic>>().toList();
      if (_isAdmin) {
        try {
          final allRes = await ApiService.getTickets(mine: false, limit: 100);
          final allList = (allRes['tickets'] as List?) ?? const [];
          _all = allList.whereType<Map<String, dynamic>>().toList();
        } catch (_) {
          _all = _mine;
        }
      } else {
        _all = _mine;
      }
      if (!mounted) return;
      setState(() => _loading = false);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.toString().replaceAll('Exception: ', '');
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return MainTabScaffold(
      currentIndex: -1,
      backgroundColor: MaanColors.pageBg,
      body: RefreshIndicator(
        color: MaanColors.primary,
        onRefresh: _load,
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverToBoxAdapter(child: _header()),
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 90),
              sliver: SliverList(
                delegate: SliverChildListDelegate([
                  if (_loading)
                    Container(
                      padding: const EdgeInsets.symmetric(vertical: 60),
                      alignment: Alignment.center,
                      child: const CircularProgressIndicator(color: MaanColors.primary),
                    )
                  else ...[
                    if (_error != null)
                      Container(
                        margin: const EdgeInsets.only(bottom: 12),
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(color: const Color(0xFFFDF0F0), borderRadius: BorderRadius.circular(12)),
                        child: Text(_error!, style: const TextStyle(color: Color(0xFFC04747), fontSize: 12.5)),
                      ),
                    _statsRow(),
                    const SizedBox(height: 14),
                    ..._ticketCards(),
                    if (!_loading && _mine.isEmpty) _emptyCard(),
                  ],
                ]),
              ),
            ),
          ],
        ),
      ),
      fab: FloatingActionButton.extended(
        onPressed: _createTicketSheet,
        backgroundColor: MaanColors.primary,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.add_rounded),
        label: const Text('Raise Ticket', style: TextStyle(fontWeight: FontWeight.w800)),
      ),
    );
  }

  Widget _header() {
    return Container(
      color: MaanColors.primary,
      padding: EdgeInsets.only(top: MediaQuery.of(context).padding.top + 10, bottom: 18, left: 8, right: 18),
      child: Row(
        children: [
          IconButton(
            onPressed: () => Navigator.maybePop(context),
            icon: const Icon(Icons.arrow_back, color: Colors.white),
          ),
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(color: Colors.white.withOpacity(.18), borderRadius: BorderRadius.circular(11)),
            child: const Icon(Icons.headset_mic_rounded, color: Colors.white, size: 21),
          ),
          const SizedBox(width: 10),
          const Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('HR Help Desk', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w900)),
              Text('Connected to the web Support & AI ticketing system', style: TextStyle(color: Colors.white70, fontSize: 10.5)),
            ]),
          ),
        ],
      ),
    );
  }

  Widget _statsRow() {
    int count(List<Map<String, dynamic>> list, String status) => list.where((t) => '${t['status']}' == status).length;
    final source = _isAdmin ? _all : _mine;
    return Row(
      children: [
        _stat('Open', count(source, 'open').toString(), const Color(0xFFF5A623), const Color(0xFFFEF3E2), Icons.pending_rounded),
        const SizedBox(width: 8),
        _stat('In Progress', count(source, 'in_progress').toString(), const Color(0xFF38BDF8), const Color(0xFFE8F4FD), Icons.autorenew_rounded),
        const SizedBox(width: 8),
        _stat('Resolved', count(source, 'resolved').toString(), MaanColors.accentGreen, const Color(0xFFE6F9F2), Icons.check_circle_rounded),
      ],
    );
  }

  Widget _stat(String label, String value, Color color, Color bg, IconData icon) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 10),
        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(14)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Icon(icon, color: color, size: 16),
            const Spacer(),
            Text(value, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: color)),
          ]),
          const SizedBox(height: 4),
          Text(label, style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, color: color.withOpacity(.85))),
        ]),
      ),
    );
  }

  List<Widget> _ticketCards() {
    final list = _isAdmin ? _all : _mine;
    if (list.isEmpty) return [];
    final df = DateFormat('dd MMM yyyy, hh:mm a');
    return [
      Row(children: [
        Text(_isAdmin ? 'All tickets' : 'My tickets', style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w900, color: MaanColors.navy)),
        const Spacer(),
        Text('${list.length} ticket${list.length == 1 ? '' : 's'}', style: MaanText.caption),
      ]),
      const SizedBox(height: 8),
      for (final t in list)
        Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: _ticketCard(t, df),
        ),
    ];
  }

  Widget _ticketCard(Map<String, dynamic> t, DateFormat df) {
    final status = '${t['status'] ?? 'open'}';
    final statusColor = _statusColor(status);
    final priority = '${t['priority'] ?? 'medium'}';
    final created = DateTime.tryParse('${t['createdAt'] ?? ''}');
    final mineTicket = '${t['requesterId'] ?? ''}' == (context.read<AuthProvider>().user?.id ?? '');
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () => _ticketDetailSheet(t),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(16), border: Border.all(color: MaanColors.line)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(color: statusColor.withOpacity(.12), borderRadius: BorderRadius.circular(8)),
                child: Text(_statusLabel(status), style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w900, color: statusColor)),
              ),
              const SizedBox(width: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: (priority == 'high' || priority == 'urgent') ? const Color(0xFFEF6C6C).withOpacity(.1) : MaanColors.line.withOpacity(.5),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(priority.toUpperCase(), style: TextStyle(
                  fontSize: 10, fontWeight: FontWeight.w900,
                  color: (priority == 'high' || priority == 'urgent') ? const Color(0xFFEF6C6C) : MaanColors.faint,
                )),
              ),
              const Spacer(),
              Text('${t['ticketId'] ?? ''}', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: MaanColors.faint)),
            ]),
            const SizedBox(height: 10),
            Text('${t['subject'] ?? ''}', maxLines: 2, overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: MaanColors.navy, height: 1.3)),
            const SizedBox(height: 5),
            Text('${t['description'] ?? ''}', maxLines: 2, overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 12, color: MaanColors.body, height: 1.35)),
            const SizedBox(height: 10),
            Row(children: [
              const Icon(Icons.category_rounded, size: 13, color: MaanColors.faint),
              const SizedBox(width: 4),
              Expanded(
                child: Text('${t['category'] ?? 'general'}${mineTicket ? ' · raised by you' : ''}',
                    maxLines: 1, overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 11, color: MaanColors.faint, fontWeight: FontWeight.w600)),
              ),
              if (created != null) Text(df.format(created.toLocal()), style: const TextStyle(fontSize: 10.5, color: MaanColors.faint)),
            ]),
          ]),
        ),
      ),
    );
  }

  Widget _emptyCard() {
    return Container(
      padding: const EdgeInsets.all(28),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(18), border: Border.all(color: MaanColors.line)),
      child: Column(children: [
        Container(
          width: 64, height: 64,
          decoration: BoxDecoration(color: MaanColors.primary.withOpacity(.09), shape: BoxShape.circle),
          child: const Icon(Icons.support_agent_rounded, color: MaanColors.primary, size: 30),
        ),
        const SizedBox(height: 14),
        const Text('No tickets yet', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w900, color: MaanColors.navy)),
        const SizedBox(height: 6),
        Text(
          'Raise a ticket for HR, IT, payroll or anything else — your HR/Admin team sees it instantly in the web Support module.',
          textAlign: TextAlign.center,
          style: MaanText.body.copyWith(fontSize: 12.5, height: 1.45),
        ),
      ]),
    );
  }

  Color _statusColor(String status) {
    switch (status) {
      case 'open':
        return const Color(0xFFF5A623);
      case 'in_progress':
        return const Color(0xFF38BDF8);
      case 'resolved':
        return MaanColors.accentGreen;
      case 'closed':
        return MaanColors.faint;
      default:
        return MaanColors.faint;
    }
  }

  String _statusLabel(String status) => switch (status) {
        'open' => 'OPEN',
        'in_progress' => 'IN PROGRESS',
        'resolved' => 'RESOLVED',
        'closed' => 'CLOSED',
        _ => status.toUpperCase(),
      };

  // ───────────────────────── Create ticket sheet ─────────────────────────

  Future<void> _createTicketSheet() async {
    final subjectCtrl = TextEditingController();
    final descCtrl = TextEditingController();
    String priority = 'medium';
    String category = 'General';
    const categories = ['General', 'HR', 'Payroll', 'IT / Login issue', 'Attendance', 'Leave', 'Documents', 'Policy query'];
    bool sending = false;
    String? err;

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(26))),
      builder: (sheetCtx) => StatefulBuilder(
        builder: (sheetCtx, setSheet) => Padding(
          padding: EdgeInsets.fromLTRB(22, 18, 22, MediaQuery.of(sheetCtx).viewInsets.bottom + 22),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Container(width: 44, height: 4.5, decoration: BoxDecoration(color: MaanColors.line, borderRadius: BorderRadius.circular(3))),
            const SizedBox(height: 14),
            Row(children: [
              Container(
                width: 38, height: 38,
                decoration: BoxDecoration(color: MaanColors.primary.withOpacity(.1), borderRadius: BorderRadius.circular(11)),
                child: const Icon(Icons.headset_mic_rounded, color: MaanColors.primary, size: 19),
              ),
              const SizedBox(width: 10),
              Text('Raise a Ticket', style: MaanText.title.copyWith(fontSize: 16.5, fontWeight: FontWeight.w800)),
            ]),
            const SizedBox(height: 16),
            TextField(
              controller: subjectCtrl,
              maxLength: 120,
              decoration: InputDecoration(
                hintText: 'Subject — one line summary',
                isDense: true,
                filled: true,
                fillColor: const Color(0xFFF8F9FE),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: MaanColors.line)),
                counterText: '',
              ),
            ),
            const SizedBox(height: 10),
            Row(children: [
              Expanded(
                child: DropdownButtonFormField<String>(
                  initialValue: category,
                  isDense: true,
                  decoration: InputDecoration(
                    labelText: 'Category',
                    labelStyle: const TextStyle(fontSize: 12),
                    isDense: true,
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: MaanColors.line)),
                  ),
                  items: [for (final c in categories) DropdownMenuItem(value: c, child: Text(c, style: const TextStyle(fontSize: 13)))],
                  onChanged: (v) => setSheet(() => category = v ?? 'General'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: DropdownButtonFormField<String>(
                  initialValue: priority,
                  isDense: true,
                  decoration: InputDecoration(
                    labelText: 'Priority',
                    labelStyle: const TextStyle(fontSize: 12),
                    isDense: true,
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: MaanColors.line)),
                  ),
                  items: const [
                    DropdownMenuItem(value: 'low', child: Text('Low', style: TextStyle(fontSize: 13))),
                    DropdownMenuItem(value: 'medium', child: Text('Medium', style: TextStyle(fontSize: 13))),
                    DropdownMenuItem(value: 'high', child: Text('High', style: TextStyle(fontSize: 13))),
                    DropdownMenuItem(value: 'urgent', child: Text('Urgent', style: TextStyle(fontSize: 13))),
                  ],
                  onChanged: (v) => setSheet(() => priority = v ?? 'medium'),
                ),
              ),
            ]),
            const SizedBox(height: 10),
            TextField(
              controller: descCtrl,
              maxLines: 4,
              maxLength: 1000,
              decoration: InputDecoration(
                hintText: 'Describe your issue or question…',
                isDense: true,
                filled: true,
                fillColor: const Color(0xFFF8F9FE),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: MaanColors.line)),
                counterText: '',
              ),
            ),
            if (err != null) ...[
              const SizedBox(height: 8),
              Text(err!, style: const TextStyle(color: Color(0xFFC04747), fontSize: 12)),
            ],
            const SizedBox(height: 14),
            SizedBox(
              height: 48,
              child: ElevatedButton(
                onPressed: sending
                    ? null
                    : () async {
                        final subject = subjectCtrl.text.trim();
                        final description = descCtrl.text.trim();
                        if (subject.isEmpty || description.isEmpty) {
                          setSheet(() => err = 'Subject and description are both required.');
                          return;
                        }
                        setSheet(() { sending = true; err = null; });
                        try {
                          await ApiService.createTicket(
                            subject: '[$category] $subject',
                            description: description,
                            priority: priority,
                          );
                          if (!sheetCtx.mounted) return;
                          Navigator.pop(sheetCtx);
                          if (!mounted) return;
                          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                            content: Text('Ticket raised — your HR/Admin team has been notified.'),
                            backgroundColor: Colors.green,
                          ));
                          _load();
                        } catch (e) {
                          setSheet(() { sending = false; err = e.toString().replaceAll('Exception: ', ''); });
                        }
                      },
                style: ElevatedButton.styleFrom(
                  backgroundColor: MaanColors.primary,
                  foregroundColor: Colors.white,
                  elevation: 0,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(13)),
                ),
                child: sending
                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2.2, color: Colors.white))
                    : const Text('Submit Ticket', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
              ),
            ),
          ]),
        ),
      ),
    );
  }

  // ───────────────────────── Ticket detail sheet ─────────────────────────

  Future<void> _ticketDetailSheet(Map<String, dynamic> ticket) async {
    Map<String, dynamic> full = ticket;
    bool loadingDetail = true;
    String? detailErr;
    final commentCtrl = TextEditingController();
    bool sendingComment = false;

    // Pull the FULL ticket (description + complete comment thread).
    final id = '${ticket['id'] ?? ''}';
    if (id.isNotEmpty) {
      try {
        final res = await ApiService.getTicketDetail(id);
        if (res['ticket'] is Map<String, dynamic>) full = res['ticket'] as Map<String, dynamic>;
        loadingDetail = false;
      } catch (e) {
        detailErr = e.toString().replaceAll('Exception: ', '');
        loadingDetail = false;
      }
    } else {
      loadingDetail = false;
    }

    if (!mounted) return;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(26))),
      builder: (sheetCtx) => StatefulBuilder(
        builder: (sheetCtx, setSheet) => Padding(
          padding: EdgeInsets.fromLTRB(0, 0, 0, MediaQuery.of(sheetCtx).viewInsets.bottom),
          child: SizedBox(
            height: MediaQuery.of(sheetCtx).size.height * 0.86,
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Container(
                padding: EdgeInsets.only(top: MediaQuery.of(sheetCtx).padding.top + 10, bottom: 14, left: 20, right: 16),
                decoration: const BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.vertical(top: Radius.circular(26)),
                  boxShadow: [BoxShadow(color: Color(0x14000000), blurRadius: 10, offset: Offset(0, 2))],
                ),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Container(width: 42, height: 4.5, decoration: BoxDecoration(color: MaanColors.line, borderRadius: BorderRadius.circular(3))),
                    const Spacer(),
                    IconButton(
                      onPressed: () => Navigator.pop(sheetCtx),
                      icon: const Icon(Icons.close_rounded, size: 20, color: MaanColors.faint),
                    ),
                  ]),
                  Row(children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(color: _statusColor('${full['status']}').withOpacity(.12), borderRadius: BorderRadius.circular(8)),
                      child: Text(_statusLabel('${full['status'] ?? 'open'}'), style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w900, color: _statusColor('${full['status'] ?? 'open'}'))),
                    ),
                    const SizedBox(width: 8),
                    Text('${full['ticketId'] ?? ''}', style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800, color: MaanColors.faint)),
                    const Spacer(),
                    if (_isAdmin)
                      for (final entry in <String, String>{'in_progress': 'Start', 'resolved': 'Resolve', 'closed': 'Close'}.entries)
                        if ('${full['status']}' != entry.key)
                          Padding(
                            padding: const EdgeInsets.only(left: 6),
                            child: GestureDetector(
                              onTap: () async {
                                try {
                                  await ApiService.updateTicketStatus('${full['id']}', entry.key);
                                  setSheet(() => full = {...full, 'status': entry.key});
                                  _load();
                                } catch (_) {}
                              },
                              child: Container(
                                padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
                                decoration: BoxDecoration(color: MaanColors.primary.withOpacity(.09), borderRadius: BorderRadius.circular(8)),
                                child: Text(entry.value, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: MaanColors.primary)),
                              ),
                            ),
                          ),
                  ]),
                  const SizedBox(height: 10),
                  Text('${full['subject'] ?? ''}', style: const TextStyle(fontSize: 16.5, fontWeight: FontWeight.w900, color: MaanColors.navy, height: 1.3)),
                ]),
              ),
              Expanded(
                child: loadingDetail
                    ? const Center(child: CircularProgressIndicator(color: MaanColors.primary))
                    : ListView(
                        padding: const EdgeInsets.all(20),
                        children: [
                          if (detailErr != null)
                            Container(
                              padding: const EdgeInsets.all(10),
                              margin: const EdgeInsets.only(bottom: 12),
                              decoration: BoxDecoration(color: const Color(0xFFFDF0F0), borderRadius: BorderRadius.circular(10)),
                              child: Text(detailErr!, style: const TextStyle(color: Color(0xFFC04747), fontSize: 12)),
                            ),
                          Text('${full['description'] ?? ''}', style: MaanText.body.copyWith(fontSize: 13.5, height: 1.5)),
                          const SizedBox(height: 18),
                          Row(children: [
                            const Icon(Icons.forum_rounded, size: 15, color: MaanColors.faint),
                            const SizedBox(width: 6),
                            Text('Conversation', style: MaanText.title.copyWith(fontSize: 13.5)),
                            const Spacer(),
                            Text('${((full['comments'] as List?) ?? const []).length}', style: MaanText.caption),
                          ]),
                          const SizedBox(height: 8),
                          for (final c in ((full['comments'] as List?) ?? const []))
                            if (c is Map)
                              Padding(
                                padding: const EdgeInsets.only(bottom: 10),
                                child: Container(
                                  padding: const EdgeInsets.all(12),
                                  decoration: BoxDecoration(color: const Color(0xFFF8F9FE), borderRadius: BorderRadius.circular(12)),
                                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                    Text('${c['authorName'] ?? 'User'}', style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800, color: MaanColors.navy)),
                                    const SizedBox(height: 4),
                                    Text('${c['content'] ?? ''}', style: const TextStyle(fontSize: 12.5, height: 1.45, color: MaanColors.body)),
                                  ]),
                                ),
                              ),
                          if (((full['comments'] as List?) ?? const []).isEmpty)
                            Text('No replies yet — HR/Admin will respond here and in the web Support module.', style: MaanText.caption.copyWith(fontSize: 11.5)),
                        ],
                      ),
              ),
              Container(
                padding: const EdgeInsets.fromLTRB(16, 10, 16, 14),
                decoration: const BoxDecoration(color: Colors.white, boxShadow: [BoxShadow(color: Color(0x14000000), blurRadius: 10, offset: Offset(0, -2))]),
                child: Row(children: [
                  Expanded(
                    child: TextField(
                      controller: commentCtrl,
                      minLines: 1,
                      maxLines: 3,
                      decoration: InputDecoration(
                        hintText: 'Reply to HR/Admin…',
                        isDense: true,
                        filled: true,
                        fillColor: const Color(0xFFF8F9FE),
                        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(22), borderSide: const BorderSide(color: MaanColors.line)),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  InkWell(
                    borderRadius: BorderRadius.circular(22),
                    onTap: sendingComment
                        ? null
                        : () async {
                            final content = commentCtrl.text.trim();
                            if (content.isEmpty) return;
                            setSheet(() => sendingComment = true);
                            try {
                              await ApiService.addTicketComment('${full['id']}', content);
                              final res = await ApiService.getTicketDetail('${full['id']}');
                              setSheet(() {
                                if (res['ticket'] is Map<String, dynamic>) full = res['ticket'] as Map<String, dynamic>;
                                sendingComment = false;
                                commentCtrl.clear();
                              });
                              _load();
                            } catch (e) {
                              setSheet(() => sendingComment = false);
                              if (mounted) {
                                ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                                  content: Text(e.toString().replaceAll('Exception: ', '')),
                                  backgroundColor: Colors.red,
                                ));
                              }
                            }
                          },
                    child: Container(
                      width: 42,
                      height: 42,
                      decoration: const BoxDecoration(color: MaanColors.primary, shape: BoxShape.circle),
                      child: sendingComment
                          ? const Padding(padding: EdgeInsets.all(10), child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                          : const Icon(Icons.send_rounded, color: Colors.white, size: 18),
                    ),
                  ),
                ]),
              ),
            ]),
          ),
        ),
      ),
    );
    commentCtrl.dispose();
  }
}
