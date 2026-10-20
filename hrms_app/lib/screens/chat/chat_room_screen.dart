import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../config/maan_theme.dart';
import '../../models/chat.dart';
import '../../providers/chat_provider.dart';
import '../../widgets/maan_avatar.dart';
import '../../widgets/empty_state_widget.dart';
import '../../widgets/loading_widget.dart';

/// Task 117 — one chat thread (web parity): room header with type avatar +
/// member count + E2EE/announcement badges, chronological bubbles (own right
/// teal, others left with sender name), timestamps, DLP-flag alert, send bar,
/// older-history loading, pull-to-refresh and a light 12s poll while open.
class ChatRoomScreen extends StatelessWidget {
  final ChatRoomModel room;
  const ChatRoomScreen({super.key, required this.room});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => ChatThreadProvider(room.id)..load()..startPolling(),
      child: _ChatRoomBody(room: room),
    );
  }
}

class _ChatRoomBody extends StatefulWidget {
  final ChatRoomModel room;
  const _ChatRoomBody({required this.room});

  @override
  State<_ChatRoomBody> createState() => _ChatRoomBodyState();
}

class _ChatRoomBodyState extends State<_ChatRoomBody> {
  final _inputCtrl = TextEditingController();
  final _scrollCtrl = ScrollController();
  bool _wasLoading = true;

  @override
  void initState() {
    super.initState();
    _scrollCtrl.addListener(_onScroll);
  }

  @override
  void dispose() {
    context.read<ChatThreadProvider>().stopPolling();
    _inputCtrl.dispose();
    _scrollCtrl.dispose();
    super.dispose();
  }

  void _onScroll() {
    // Load older history when the user reaches the top of the list.
    if (_scrollCtrl.hasClients && _scrollCtrl.position.pixels <= 120) {
      context.read<ChatThreadProvider>().loadOlder();
    }
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scrollCtrl.hasClients) return;
      _scrollCtrl.animateTo(
        _scrollCtrl.position.maxScrollExtent,
        duration: const Duration(milliseconds: 250),
        curve: Curves.easeOut,
      );
    });
  }

  String _bubbleTime(String? iso) {
    final d = DateTime.tryParse(iso ?? '')?.toLocal();
    if (d == null) return '';
    return DateFormat('h:mm a').format(d);
  }

  String _dayLabel(String? iso) {
    final d = DateTime.tryParse(iso ?? '')?.toLocal();
    if (d == null) return '';
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final that = DateTime(d.year, d.month, d.day);
    if (that == today) return 'Today';
    if (today.difference(that) == const Duration(days: 1)) return 'Yesterday';
    return DateFormat('d MMM yyyy').format(d);
  }

  bool _newDay(int i, List<ChatMessageModel> msgs) {
    if (i == 0) return true;
    return _dayLabel(msgs[i].createdAt) != _dayLabel(msgs[i - 1].createdAt);
  }

  Future<void> _send() async {
    final text = _inputCtrl.text.trim();
    if (text.isEmpty) return;
    final ok = await context.read<ChatThreadProvider>().send(text);
    if (ok) {
      _inputCtrl.clear();
      _scrollToBottom();
    }
  }

  @override
  Widget build(BuildContext context) {
    final rooms = context.watch<ChatRoomsProvider>();
    final thread = context.watch<ChatThreadProvider>();
    final myId = rooms.myEmployeeId;
    final title = rooms.displayName(widget.room);
    final partner = rooms.partnerOf(widget.room);

    // Keep the newest message on screen after loads.
    if (_wasLoading && !thread.isLoading && thread.messages.isNotEmpty) _scrollToBottom();
    _wasLoading = thread.isLoading;

    final subtitle = StringBuffer()
      ..write('${widget.room.members.length} member${widget.room.members.length == 1 ? '' : 's'}');
    if (widget.room.isE2EE) subtitle.write(' · E2EE');
    if (widget.room.isAnnouncementRoom) subtitle.write(' · Announcement');

    return Scaffold(
      backgroundColor: const Color(0xFFF3F6FB),
      appBar: AppBar(
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.white,
        elevation: 0.5,
        iconTheme: const IconThemeData(color: MaanColors.navy),
        titleSpacing: 0,
        title: Row(
          children: [
            widget.room.isDirect && partner != null
                ? MaanAvatar(avatar: partner.avatar, name: title, radius: 16)
                : CircleAvatar(
                    radius: 16,
                    backgroundColor: widget.room.isAnnouncementRoom ? const Color(0xFFFEF3E2) : const Color(0xFFE9E6FD),
                    child: Icon(
                      widget.room.isAnnouncementRoom ? Icons.campaign_rounded : Icons.tag_rounded,
                      size: 16,
                      color: widget.room.isAnnouncementRoom ? const Color(0xFFF5A623) : const Color(0xFF6C8FEF),
                    ),
                  ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: MaanColors.navy)),
                  Text(subtitle.toString(), style: const TextStyle(fontSize: 10.5, color: MaanColors.body)),
                ],
              ),
            ),
          ],
        ),
      ),
      body: Column(
        children: [
          Expanded(
            child: thread.isLoading
                ? const LoadingWidget(itemCount: 5)
                : thread.error != null
                    ? EmptyStateWidget(
                        icon: Icons.cloud_off_rounded,
                        title: "Couldn't load messages",
                        message: thread.error,
                        actionLabel: 'Retry',
                        onAction: () => thread.load(),
                      )
                    : thread.messages.isEmpty
                        ? const EmptyStateWidget(
                            icon: Icons.waving_hand_rounded,
                            title: 'No messages yet',
                            message: 'Say hello — your message appears on every device signed into this workspace.',
                          )
                        : RefreshIndicator(
                            color: MaanColors.primary,
                            onRefresh: () => thread.load(),
                            notificationPredicate: (n) => n.depth == 0,
                            child: ListView.builder(
                              controller: _scrollCtrl,
                              physics: const AlwaysScrollableScrollPhysics(),
                              padding: const EdgeInsets.fromLTRB(12, 12, 12, 8),
                              itemCount: thread.messages.length + (thread.loadingOlder ? 1 : 0),
                              itemBuilder: (context, i) {
                                if (thread.loadingOlder && i == 0) {
                                  return const Padding(
                                    padding: EdgeInsets.all(10),
                                    child: Center(child: SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))),
                                  );
                                }
                                final idx = thread.loadingOlder ? i - 1 : i;
                                final msg = thread.messages[idx];
                                final isOwn = msg.senderId == myId;
                                return Column(
                                  children: [
                                    if (_newDay(idx, thread.messages))
                                      Padding(
                                        padding: const EdgeInsets.symmetric(vertical: 10),
                                        child: Container(
                                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                                          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(10), border: Border.all(color: MaanColors.line)),
                                          child: Text(_dayLabel(msg.createdAt),
                                              style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, color: MaanColors.body)),
                                        ),
                                      ),
                                    _bubble(msg: msg, isOwn: isOwn, time: _bubbleTime(msg.createdAt), partner: partner),
                                    if (msg.isThreadStarter)
                                      Padding(
                                        padding: const EdgeInsets.only(top: 2, left: 8, right: 8),
                                        child: Align(
                                          alignment: isOwn ? Alignment.centerRight : Alignment.centerLeft,
                                          child: Text('${msg.replyCount} repl${msg.replyCount == 1 ? 'y' : 'ies'}',
                                              style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: MaanColors.faint)),
                                        ),
                                      ),
                                    const SizedBox(height: 6),
                                  ],
                                );
                              },
                            ),
                          ),
          ),
          if (thread.sendError != null)
            Container(
              width: double.infinity,
              color: const Color(0xFFFDEDED),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
              child: Row(
                children: [
                  const Icon(Icons.error_outline_rounded, size: 14, color: Color(0xFFC53030)),
                  const SizedBox(width: 6),
                  Expanded(child: Text('Send failed: ${thread.sendError}', style: const TextStyle(fontSize: 11.5, color: Color(0xFFC53030)))),
                ],
              ),
            ),
          _inputBar(thread),
        ],
      ),
    );
  }

  Widget _bubble({required ChatMessageModel msg, required bool isOwn, required String time, dynamic partner}) {
    final name = msg.sender.fullName;
    final avatar = msg.sender.id.isNotEmpty ? null : null;
    return Align(
      alignment: isOwn ? Alignment.centerRight : Alignment.centerLeft,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.76),
        child: Column(
          crossAxisAlignment: isOwn ? CrossAxisAlignment.end : CrossAxisAlignment.start,
          children: [
            if (!isOwn)
              Padding(
                padding: const EdgeInsets.only(left: 4, bottom: 2),
                child: Text(name, style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, color: MaanColors.body)),
              ),
            Row(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                if (!isOwn) ...[
                  MaanAvatar(avatar: avatar ?? msg.sender.avatar, name: name, radius: 11),
                  const SizedBox(width: 6),
                ],
                Flexible(
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
                    decoration: BoxDecoration(
                      color: isOwn ? MaanColors.primary : Colors.white,
                      borderRadius: BorderRadius.only(
                        topLeft: const Radius.circular(14),
                        topRight: const Radius.circular(14),
                        bottomLeft: Radius.circular(isOwn ? 14 : 4),
                        bottomRight: Radius.circular(isOwn ? 4 : 14),
                      ),
                      border: isOwn ? null : Border.all(color: MaanColors.line),
                      boxShadow: isOwn
                          ? null
                          : [BoxShadow(color: Colors.black.withValues(alpha: 0.03), blurRadius: 4, offset: const Offset(0, 1))],
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(msg.body,
                            style: TextStyle(fontSize: 13.5, height: 1.32, color: isOwn ? Colors.white : MaanColors.navy)),
                        if (msg.isFlagged)
                          Padding(
                            padding: const EdgeInsets.only(top: 4),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(Icons.warning_amber_rounded,
                                    size: 12, color: isOwn ? Colors.white : const Color(0xFFB7791F)),
                                const SizedBox(width: 4),
                                Text('Flagged by DLP policy',
                                    style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: isOwn ? Colors.white : const Color(0xFFB7791F))),
                              ],
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
                if (isOwn) ...[
                  const SizedBox(width: 6),
                  Icon(Icons.done_all_rounded, size: 13, color: MaanColors.primary.withValues(alpha: 0.6)),
                ],
              ],
            ),
            Padding(
              padding: EdgeInsets.only(top: 2, left: isOwn ? 0 : 30, right: isOwn ? 20 : 0),
              child: Text(time, style: const TextStyle(fontSize: 9.5, color: MaanColors.faint)),
            ),
          ],
        ),
      ),
    );
  }

  Widget _inputBar(ChatThreadProvider thread) {
    return Container(
      color: Colors.white,
      padding: EdgeInsets.fromLTRB(12, 8, 12, 8 + MediaQuery.of(context).padding.bottom * 0.4),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: _inputCtrl,
              minLines: 1,
              maxLines: 4,
              textInputAction: TextInputAction.send,
              onSubmitted: (_) => _send(),
              decoration: InputDecoration(
                hintText: 'Type a message…',
                isDense: true,
                contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                filled: true,
                fillColor: const Color(0xFFF6F8FC),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(22), borderSide: const BorderSide(color: MaanColors.line)),
                enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(22), borderSide: const BorderSide(color: MaanColors.line)),
              ),
            ),
          ),
          const SizedBox(width: 8),
          Material(
            color: MaanColors.primary,
            borderRadius: BorderRadius.circular(20),
            child: InkWell(
              borderRadius: BorderRadius.circular(20),
              onTap: thread.sending ? null : _send,
              child: Container(
                width: 40,
                height: 40,
                alignment: Alignment.center,
                child: thread.sending
                    ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                    : const Icon(Icons.send_rounded, size: 19, color: Colors.white),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
