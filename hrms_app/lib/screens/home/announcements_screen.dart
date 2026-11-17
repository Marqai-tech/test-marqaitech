import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../config/maan_theme.dart';
import '../../services/api_service.dart';
import '../../services/storage_service.dart';
import '../../widgets/main_scaffold.dart';

/// Task 141 — Announcements (mobile): the feed/announcement banner's "view
/// all" destination. Read-only list of the company's social-feed posts
/// (pinned first) with like support — raising feeds stays in the web
/// Collaboration module per the feed governance rules.
class AnnouncementsScreen extends StatefulWidget {
  const AnnouncementsScreen({super.key});

  @override
  State<AnnouncementsScreen> createState() => _AnnouncementsScreenState();
}

class _AnnouncementsScreenState extends State<AnnouncementsScreen> {
  List<Map<String, dynamic>> _posts = [];
  bool _loading = true;
  String? _error;
  String _myEmployeeId = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      // Resolve my employee id (likes are keyed by employee id server-side).
      try {
        final u = await ApiService.resolveOwnEmployeeId();
        _myEmployeeId = u ?? '';
      } catch (_) {}
      final res = await ApiService.getSocialFeed(limit: 30);
      final list = (res['posts'] as List?) ?? const [];
      _posts = list.whereType<Map<String, dynamic>>().toList();
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

  Future<void> _toggleLike(Map<String, dynamic> post) async {
    final id = '${post['id'] ?? ''}';
    if (id.isEmpty) return;
    final liked = post['isLikedByMe'] == true;
    // Optimistic flip.
    setState(() {
      post['isLikedByMe'] = !liked;
      post['likesCount'] = ((post['likesCount'] as num?)?.toInt() ?? 0) + (liked ? -1 : 1);
    });
    try {
      // PATCH /api/social-feed {id, action:'like'} — same endpoint the web
      // feed page uses for the like toggle.
      final res = await ApiService.likeSocialPost(id);
      final updated = res['post'];
      if (updated is Map<String, dynamic> && mounted) {
        setState(() {
          post['likesCount'] = (updated['likesCount'] as num?)?.toInt() ?? post['likesCount'];
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          post['isLikedByMe'] = liked;
          post['likesCount'] = ((post['likesCount'] as num?)?.toInt() ?? 0) + (liked ? 1 : -1);
        });
      }
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
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 24),
              sliver: SliverList(
                delegate: SliverChildListDelegate([
                  if (_loading)
                    Container(
                      padding: const EdgeInsets.symmetric(vertical: 60),
                      alignment: Alignment.center,
                      child: const CircularProgressIndicator(color: MaanColors.primary),
                    )
                  else if (_error != null)
                    Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(color: const Color(0xFFFDF0F0), borderRadius: BorderRadius.circular(12)),
                      child: Text(_error!, style: const TextStyle(color: Color(0xFFC04747), fontSize: 12.5)),
                    )
                  else if (_posts.isEmpty)
                    Container(
                      padding: const EdgeInsets.all(28),
                      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(18), border: Border.all(color: MaanColors.line)),
                      child: Column(children: [
                        Container(
                          width: 64, height: 64,
                          decoration: BoxDecoration(color: MaanColors.accentPurple.withOpacity(.1), shape: BoxShape.circle),
                          child: const Icon(Icons.campaign_rounded, color: MaanColors.accentPurple, size: 30),
                        ),
                        const SizedBox(height: 14),
                        const Text('No announcements yet', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w900, color: MaanColors.navy)),
                        const SizedBox(height: 6),
                        Text(
                          'Company announcements and HR feeds will appear here as soon as they are posted.',
                          textAlign: TextAlign.center,
                          style: MaanText.body.copyWith(fontSize: 12.5, height: 1.45),
                        ),
                      ]),
                    )
                  else
                    for (final p in _posts) Padding(padding: const EdgeInsets.only(bottom: 10), child: _postCard(p)),
                ]),
              ),
            ),
          ],
        ),
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
            child: const Icon(Icons.campaign_rounded, color: Colors.white, size: 21),
          ),
          const SizedBox(width: 10),
          const Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Announcements & Feeds', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w900)),
              Text('Company news from HR / Admin', style: TextStyle(color: Colors.white70, fontSize: 10.5)),
            ]),
          ),
        ],
      ),
    );
  }

  Widget _postCard(Map<String, dynamic> p) {
    final df = DateFormat('dd MMM · hh:mm a');
    final created = DateTime.tryParse('${p['createdAt'] ?? ''}');
    final author = p['author'] is Map ? p['author'] as Map : const {};
    final name = '${author['firstName'] ?? ''} ${author['lastName'] ?? ''}'.trim();
    final liked = p['isLikedByMe'] == true;
    final pinned = p['isPinned'] == true;
    final type = '${p['postType'] ?? 'general'}';
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: pinned ? MaanColors.accentPurple.withOpacity(.4) : MaanColors.line),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          CircleAvatar(
            radius: 16,
            backgroundColor: MaanColors.accentPurple.withOpacity(.14),
            backgroundImage: '${author['avatar'] ?? ''}'.isNotEmpty ? NetworkImage('${author['avatar']}') : null,
            child: '${author['avatar'] ?? ''}'.isNotEmpty
                ? null
                : Text(
                    name.isNotEmpty ? name.split(' ').take(2).map((w) => w.isNotEmpty ? w[0].toUpperCase() : '').join() : '?',
                    style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w800, color: MaanColors.accentPurple),
                  ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(name.isNotEmpty ? name : 'HR / Admin', maxLines: 1, overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: MaanColors.navy)),
              if (created != null) Text(df.format(created.toLocal()), style: MaanText.caption.copyWith(fontSize: 10)),
            ]),
          ),
          if (pinned)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(color: MaanColors.accentPurple.withOpacity(.12), borderRadius: BorderRadius.circular(8)),
              child: const Row(mainAxisSize: MainAxisSize.min, children: [
                Icon(Icons.push_pin_rounded, size: 11, color: MaanColors.accentPurple),
                SizedBox(width: 3),
                Text('PINNED', style: TextStyle(fontSize: 9.5, fontWeight: FontWeight.w900, color: MaanColors.accentPurple)),
              ]),
            )
          else if (type != 'general')
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(color: MaanColors.line.withOpacity(.6), borderRadius: BorderRadius.circular(8)),
              child: Text(type.toUpperCase(), style: const TextStyle(fontSize: 9.5, fontWeight: FontWeight.w900, color: MaanColors.faint)),
            ),
        ]),
        const SizedBox(height: 10),
        Text('${p['content'] ?? ''}', style: const TextStyle(fontSize: 13.5, height: 1.5, color: MaanColors.navy)),
        const SizedBox(height: 10),
        Row(children: [
          InkWell(
            borderRadius: BorderRadius.circular(16),
            onTap: () => _toggleLike(p),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: liked ? MaanColors.accentPink.withOpacity(.12) : const Color(0xFFF6F7FB),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                Icon(liked ? Icons.favorite_rounded : Icons.favorite_border_rounded,
                    size: 15, color: liked ? MaanColors.accentPink : MaanColors.faint),
                const SizedBox(width: 5),
                Text('${(p['likesCount'] as num?)?.toInt() ?? 0}',
                    style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800, color: liked ? MaanColors.accentPink : MaanColors.faint)),
              ]),
            ),
          ),
          const SizedBox(width: 10),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(color: const Color(0xFFF6F7FB), borderRadius: BorderRadius.circular(16)),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              const Icon(Icons.chat_bubble_outline_rounded, size: 14, color: MaanColors.faint),
              const SizedBox(width: 5),
              Text('${(p['commentsCount'] as num?)?.toInt() ?? 0}',
                  style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800, color: MaanColors.faint)),
            ]),
          ),
          const Spacer(),
          Text('Respond on the web feed', style: MaanText.caption.copyWith(fontSize: 9.5)),
        ]),
      ]),
    );
  }
}
