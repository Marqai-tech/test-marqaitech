import 'dart:convert';
import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';

import '../../config/maan_theme.dart';
import '../../models/chat.dart';
import '../../providers/chat_provider.dart';
import '../../services/api_service.dart';
import '../../utils/json_safe.dart';
import '../../widgets/maan_avatar.dart';
import '../../widgets/empty_state_widget.dart';
import '../../widgets/loading_widget.dart';

/// Task 117 — one chat thread (web parity): room header with type avatar +
/// member count + E2EE/announcement badges, chronological bubbles (own right
/// teal, others left with sender name), timestamps, DLP-flag alert, send bar,
/// older-history loading, pull-to-refresh and a light 12s poll while open.
class ChatRoomScreen extends StatelessWidget {
  final ChatRoomModel room;

  /// Optional factory for the thread state (tests inject a fake to avoid
  /// network). Production uses ChatThreadProvider.new — identical behavior.
  final ChatThreadProvider Function(String roomId)? threadProviderFactory;

  const ChatRoomScreen({super.key, required this.room, this.threadProviderFactory});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => (threadProviderFactory ?? ChatThreadProvider.new)(room.id)..load()..startPolling(),
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
  ChatThreadProvider? _thread; // saved in didChangeDependencies — dispose() must not do ancestor lookups
  // Task 120 — live member tracking: the room object is a snapshot from the
  // list screen, so additions would not reflect here. We track the known
  // member ids locally and grow them as the add-members sheet succeeds.
  late Set<String> _memberIds;
  late int _memberCount;
  // Task 121 — files queued for the next send (name/mimeType/sizeBytes/dataUrl).
  final List<Map<String, dynamic>> _pendingFiles = [];

  @override
  void initState() {
    super.initState();
    _memberIds = widget.room.members.map((m) => m.userId).where((id) => id.isNotEmpty).toSet();
    _memberCount = _memberIds.isNotEmpty ? _memberIds.length : widget.room.members.length;
    _scrollCtrl.addListener(_onScroll);
    // Task 119 — belt-and-braces: the app-scoped ChatRoomsProvider normally
    // resolved identity when the chat home opened, but a deep entry (named
    // route, restored state) may land here before that happened. Without
    // myEmployeeId every bubble would render as "theirs", so kick a silent
    // refresh once. NEVER watch a provider created in another route.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final rooms = context.read<ChatRoomsProvider>();
      if (rooms.myEmployeeId == null) rooms.fetchRooms(silent: true);
    });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _thread ??= context.read<ChatThreadProvider>();
  }

  @override
  void dispose() {
    _thread?.stopPolling();
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
    final hasFiles = _pendingFiles.isNotEmpty;
    if (text.isEmpty && !hasFiles) return;
    final files = hasFiles ? List<Map<String, dynamic>>.from(_pendingFiles) : null;
    final ok = await context.read<ChatThreadProvider>().send(text, attachments: files);
    if (ok) {
      _inputCtrl.clear();
      if (mounted) setState(_pendingFiles.clear);
      _scrollToBottom();
    }
  }

  // ─── Task 121: attach files (docs via file_picker, images via gallery/camera)
  static const int _maxFileBytes = 4 * 1024 * 1024;

  Future<void> _queueFileBytes(String name, String mime, List<int> bytes) async {
    if (bytes.length > _maxFileBytes) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(
          content: Text('"$name" exceeds the 4 MB limit'),
          backgroundColor: MaanColors.accentRed,
        ));
      return;
    }
    setState(() {
      _pendingFiles.add({
        'name': name,
        'mimeType': mime,
        'sizeBytes': bytes.length,
        'dataUrl': 'data:$mime;base64,${base64Encode(bytes)}',
      });
      // Server cap: 5 attachments per message.
      if (_pendingFiles.length > 5) _pendingFiles.removeRange(0, _pendingFiles.length - 5);
    });
  }

  Future<void> _pickDocument() async {
    final result = await FilePicker.platform.pickFiles(type: FileType.any, withData: true);
    final file = result?.files.single;
    if (file == null) return;
    final bytes = file.bytes;
    if (bytes == null) return;
    await _queueFileBytes(file.name, file.extension != null ? _mimeForExtension(file.extension!) : 'application/octet-stream', bytes);
  }

  Future<void> _pickImage({required bool fromCamera}) async {
    final picked = await ImagePicker().pickImage(
      source: fromCamera ? ImageSource.camera : ImageSource.gallery,
      imageQuality: 82,
      maxWidth: 1920,
    );
    if (picked == null) return;
    final bytes = await File(picked.path).readAsBytes();
    final ext = picked.name.split('.').last.toLowerCase();
    final mime = (ext == 'jpg' || ext == 'jpeg') ? 'image/jpeg' : 'image/$ext';
    await _queueFileBytes(picked.name, mime, bytes);
  }

  static String _mimeForExtension(String ext) {
    switch (ext.toLowerCase()) {
      case 'pdf': return 'application/pdf';
      case 'png': return 'image/png';
      case 'jpg': case 'jpeg': return 'image/jpeg';
      case 'gif': return 'image/gif';
      case 'webp': return 'image/webp';
      case 'txt': case 'log': return 'text/plain';
      case 'csv': return 'text/csv';
      case 'doc': return 'application/msword';
      case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      case 'xls': return 'application/vnd.ms-excel';
      case 'xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      case 'ppt': return 'application/vnd.ms-powerpoint';
      case 'pptx': return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
      case 'zip': return 'application/zip';
      case 'json': return 'application/json';
      default: return 'application/octet-stream';
    }
  }

  Future<void> _showAttachSheet() async {
    final choice = await showModalBottomSheet<String>(
      context: context,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (sheetCtx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.insert_drive_file_rounded, color: MaanColors.primary),
              title: const Text('Document (PDF, Word, Excel…)', style: TextStyle(fontSize: 14)),
              onTap: () => Navigator.pop(sheetCtx, 'doc'),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_rounded, color: MaanColors.primary),
              title: const Text('Photo / Gallery', style: TextStyle(fontSize: 14)),
              onTap: () => Navigator.pop(sheetCtx, 'gallery'),
            ),
            ListTile(
              leading: const Icon(Icons.photo_camera_rounded, color: MaanColors.primary),
              title: const Text('Camera', style: TextStyle(fontSize: 14)),
              onTap: () => Navigator.pop(sheetCtx, 'camera'),
            ),
          ],
        ),
      ),
    );
    if (choice == null || !mounted) return;
    if (choice == 'doc') {
      await _pickDocument();
    } else if (choice == 'gallery') {
      await _pickImage(fromCamera: false);
    } else if (choice == 'camera') {
      await _pickImage(fromCamera: true);
    }
  }

  /// Task 121 — open/share an attachment via the system share sheet
  /// (save to Files, forward to email/WhatsApp, etc.).
  Future<void> _openAttachment(ChatAttachment a) async {
    final bytes = a.bytes;
    if (bytes == null) return;
    try {
      await Share.shareXFiles(
        [XFile.fromData(bytes, name: a.name, mimeType: a.mimeType)],
        text: a.name,
      );
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(const SnackBar(content: Text('Could not open the attachment')));
    }
  }

  /// Task 120 — add people to an EXISTING group chat (the create-time picker
  /// was the only way to populate a room before). Direct rooms stay 1:1.
  Future<void> _showAddMembersSheet() async {
    final result = await showModalBottomSheet<(int, List<Map<String, dynamic>>)> (
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => _AddMembersSheet(roomId: widget.room.id, existingMemberIds: _memberIds),
    );
    if (!mounted || result == null) return;
    final (added, skipped) = result;
    if (added > 0) {
      setState(() {
        _memberCount += added;
      });
    }
    if (!mounted) return;
    final msg = StringBuffer()..write('$added member${added == 1 ? '' : 's'} added');
    if (skipped.isNotEmpty) {
      final reason = (skipped.first['reason'] ?? 'skipped').toString();
      msg.write(' · ${skipped.length} skipped ($reason)');
    }
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(
        content: Text(msg.toString()),
        backgroundColor: added > 0 ? const Color(0xFF2FA36B) : MaanColors.accentRed,
      ));
  }

  /// Task 122 — rename this group chat (chat managers only).
  Future<void> _renameChat() async {
    final rooms = context.read<ChatRoomsProvider>();
    final ctrl = TextEditingController(text: rooms.displayName(widget.room));
    final ok = await showDialog<bool>(
      context: context,
      builder: (dlgCtx) => AlertDialog(
        title: const Text('Rename chat'),
        content: TextField(
          controller: ctrl,
          autofocus: true,
          decoration: const InputDecoration(hintText: 'New name…', isDense: true),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dlgCtx, false), child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: MaanColors.primary),
            onPressed: () => Navigator.pop(dlgCtx, true),
            child: const Text('Save'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    final name = ctrl.text.trim();
    if (name.isEmpty || !mounted) return;
    try {
      await rooms.renameRoom(widget.room.id, name);
      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(const SnackBar(content: Text('Chat renamed'), backgroundColor: Color(0xFF2FA36B)));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(
          content: Text(e.toString().replaceAll('Exception: ', '')),
          backgroundColor: MaanColors.accentRed,
        ));
    }
  }

  /// Task 122 — delete this chat. Direct: hides MY copy. Group: removes for
  /// everyone (server soft-deletes; history stays retained for Super Admin
  /// eDiscovery). Pops the thread after a successful delete.
  Future<void> _deleteChat() async {
    final isDirect = widget.room.isDirect;
    final ok = await showDialog<bool>(
      context: context,
      builder: (dlgCtx) => AlertDialog(
        title: Text(isDirect ? 'Delete chat?' : 'Delete for everyone?'),
        content: Text(
          isDirect
              ? 'This chat disappears from your chat list. The other participant keeps the conversation, and the Super Admin retains the history as a safety measure.'
              : 'Members lose access to this conversation. The full history stays retained in the audit archive (Super Admin → Deleted Chat History).',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dlgCtx, false), child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: const Color(0xFFDC2626)),
            onPressed: () => Navigator.pop(dlgCtx, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    final rooms = context.read<ChatRoomsProvider>();
    try {
      final scope = await rooms.deleteRoom(widget.room.id);
      if (!mounted) return;
      Navigator.of(context).pop(); // leave the (now deleted) thread
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(
          content: Text(scope == 'self' ? 'Direct chat deleted' : 'Group chat deleted — history retained for audit'),
          backgroundColor: const Color(0xFF2FA36B),
        ));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(
          content: Text(e.toString().replaceAll('Exception: ', '')),
          backgroundColor: MaanColors.accentRed,
        ));
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
      ..write('$_memberCount member${_memberCount == 1 ? '' : 's'}');
    if (widget.room.isE2EE) subtitle.write(' · E2EE');
    if (widget.room.isAnnouncementRoom) subtitle.write(' · Announcement');

    return Scaffold(
      backgroundColor: const Color(0xFFF3F6FB),
      appBar: AppBar(
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.white,
        elevation: 0.5,
        iconTheme: const IconThemeData(color: MaanColors.navy),
        actions: [
          // Task 120 — grow the group after creation (direct chats stay 1:1);
          // Task 122 — now gated to chat managers server-side, and hidden in
          // the UI for users without edit rights.
          if (!widget.room.isDirect && rooms.canEditGroup)
            IconButton(
              onPressed: _showAddMembersSheet,
              tooltip: 'Add members',
              icon: const Icon(Icons.person_add_alt_1_rounded, size: 20),
            ),
          // Task 122 — chat actions menu (rename / delete per governance).
          if ((widget.room.isDirect && rooms.canDeleteDirect) ||
              (!widget.room.isDirect && (rooms.canEditGroup || rooms.canDeleteGroup)))
            PopupMenuButton<String>(
              tooltip: 'Chat actions',
              icon: const Icon(Icons.more_vert_rounded, size: 20),
              onSelected: (choice) {
                if (choice == 'rename') _renameChat();
                if (choice == 'delete') _deleteChat();
              },
              itemBuilder: (_) => [
                if (!widget.room.isDirect && rooms.canEditGroup)
                  const PopupMenuItem(
                    value: 'rename',
                    child: Row(children: [
                      Icon(Icons.edit_outlined, size: 18, color: Color(0xFF0EA5A6)),
                      SizedBox(width: 8),
                      Text('Rename chat'),
                    ]),
                  ),
                if ((widget.room.isDirect && rooms.canDeleteDirect) ||
                    (!widget.room.isDirect && rooms.canDeleteGroup))
                  const PopupMenuItem(
                    value: 'delete',
                    child: Row(children: [
                      Icon(Icons.delete_outline_rounded, size: 18, color: Color(0xFFDC2626)),
                      SizedBox(width: 8),
                      Text('Delete chat', style: TextStyle(color: Color(0xFFDC2626))),
                    ]),
                  ),
              ],
            ),
        ],
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
                        ? _emptyThread(thread)
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

  /// Task 119 — first-open experience for a brand-new (or still silent) room:
  /// a friendly empty state plus one-tap greeting chips that send immediately,
  /// so a new direct chat never feels like a dead/blank screen.
  Widget _emptyThread(ChatThreadProvider thread) {
    const greetings = ['Hi!', 'Hello!', 'Are you available?'];
    return SingleChildScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      child: SizedBox(
        height: MediaQuery.of(context).size.height * 0.55,
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 64,
                height: 64,
                decoration: BoxDecoration(
                  color: const Color(0xFFE8F5F0),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: const Icon(Icons.waving_hand_rounded, size: 30, color: Color(0xFF2FA36B)),
              ),
              const SizedBox(height: 14),
              const Text('No messages yet',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: MaanColors.navy)),
              const SizedBox(height: 6),
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 32),
                child: Text(
                  'Say hello — your message appears on every device signed into this workspace.',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 12.5, color: MaanColors.body, height: 1.4),
                ),
              ),
              const SizedBox(height: 18),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                alignment: WrapAlignment.center,
                children: greetings
                    .map((g) => InkWell(
                          borderRadius: BorderRadius.circular(18),
                          onTap: thread.sending ? null : () async {
                            final ok = await thread.send(g);
                            if (ok && mounted) _scrollToBottom();
                          },
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(18),
                              border: Border.all(color: MaanColors.line),
                            ),
                            child: Text(g,
                                style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: MaanColors.primary)),
                          ),
                        ))
                    .toList(),
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// Task 121 — attachment rendering: images inline (tap = share), docs as a
  /// tappable chip. Own-message variants use white-on-teal.
  List<Widget> _attachmentWidgets(ChatAttachment a, bool isOwn) {
    final chipColor = isOwn ? Colors.white.withValues(alpha: 0.16) : const Color(0xFFF1F5F9);
    final textColor = isOwn ? Colors.white : MaanColors.navy;
    final subColor = isOwn ? Colors.white.withValues(alpha: 0.75) : MaanColors.faint;
    final widgets = <Widget>[];
    if (a.isImage && a.bytes != null) {
      widgets.add(Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: GestureDetector(
          onTap: () => _openAttachment(a),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(10),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 220, maxHeight: 220),
              child: Image.memory(a.bytes!, fit: BoxFit.cover, gaplessPlayback: true),
            ),
          ),
        ),
      ));
      if (a.name.isNotEmpty) {
        widgets.add(Padding(
          padding: const EdgeInsets.only(bottom: 4),
          child: GestureDetector(
            onTap: () => _openAttachment(a),
            child: Text(a.name, style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w600, color: isOwn ? Colors.white : MaanColors.primary)),
          ),
        ));
      }
      return widgets;
    }
    widgets.add(Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Material(
        color: chipColor,
        borderRadius: BorderRadius.circular(10),
        child: InkWell(
          borderRadius: BorderRadius.circular(10),
          onTap: () => _openAttachment(a),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            constraints: const BoxConstraints(maxWidth: 230),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.insert_drive_file_rounded, size: 16, color: isOwn ? Colors.white : MaanColors.primary),
                const SizedBox(width: 6),
                Flexible(
                  child: Text(a.name, maxLines: 1, overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: textColor)),
                ),
                if (a.sizeLabel.isNotEmpty) ...[
                  const SizedBox(width: 6),
                  Text(a.sizeLabel, style: TextStyle(fontSize: 10, color: subColor)),
                ],
                const SizedBox(width: 4),
                Icon(Icons.open_in_new_rounded, size: 11, color: subColor),
              ],
            ),
          ),
        ),
      ),
    ));
    return widgets;
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
                        // Task 121 — attachment rendering: images inline, docs as chips.
                        for (final a in msg.attachments) ..._attachmentWidgets(a, isOwn),
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
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Task 121 — queued attachments preview
          if (_pendingFiles.isNotEmpty)
            Container(
              margin: const EdgeInsets.only(bottom: 8),
              width: double.infinity,
              child: Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  for (var i = 0; i < _pendingFiles.length; i++)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
                      decoration: BoxDecoration(
                        color: const Color(0xFFE8F5F1),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: MaanColors.primary.withValues(alpha: 0.25)),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.insert_drive_file_rounded, size: 13, color: MaanColors.primary),
                          const SizedBox(width: 5),
                          ConstrainedBox(
                            constraints: const BoxConstraints(maxWidth: 120),
                            child: Text(
                              (_pendingFiles[i]['name'] ?? 'file').toString(),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: MaanColors.navy),
                            ),
                          ),
                          const SizedBox(width: 4),
                          GestureDetector(
                            onTap: () => setState(() => _pendingFiles.removeAt(i)),
                            child: const Icon(Icons.close_rounded, size: 13, color: MaanColors.faint),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          Row(
            children: [
              // Task 121 — attach (doc / gallery / camera)
              IconButton(
                onPressed: thread.sending ? null : _showAttachSheet,
                tooltip: 'Attach',
                icon: const Icon(Icons.attach_file_rounded, size: 21, color: MaanColors.faint),
              ),
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
        ],
      ),
    );
  }
}

// ══ Add Members sheet (Task 120) ═══════════════════════════════════════
/// Grow an EXISTING group chat: search employees (excludeInactive=true,
/// separated staff filtered again client-side), skip people already in the
/// room, multi-select, POST /rooms/[id]/members. Pops with (added, skipped).
class _AddMembersSheet extends StatefulWidget {
  final String roomId;
  final Set<String> existingMemberIds;
  const _AddMembersSheet({required this.roomId, required this.existingMemberIds});

  @override
  State<_AddMembersSheet> createState() => _AddMembersSheetState();
}

class _AddMembersSheetState extends State<_AddMembersSheet> {
  final _searchCtrl = TextEditingController();
  List<ChatDirectoryPerson> _people = [];
  final Set<String> _selected = {};
  bool _loading = true;
  bool _submitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadPeople();
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadPeople() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final q = _searchCtrl.text.trim();
      final data = await ApiService.getEmployees(limit: 200, search: q.isEmpty ? null : q, excludeInactive: true);
      final rows = jsonList(data['employees'] is List ? data['employees'] : data['data']);
      final me = context.read<ChatRoomsProvider>().myEmployeeId;
      if (mounted) {
        setState(() {
          _people = rows
              .map(ChatDirectoryPerson.fromJson)
              .where((p) => p.id.isNotEmpty && !p.isInactive)
              .where((p) => p.id != me)
              .where((p) => !widget.existingMemberIds.contains(p.id))
              .toList();
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = e.toString().replaceAll('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _submit() async {
    if (_selected.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Select at least one person to add')));
      return;
    }
    setState(() => _submitting = true);
    try {
      final (added, skipped) = await context.read<ChatRoomsProvider>().addMembers(widget.roomId, _selected.toList());
      if (mounted) Navigator.pop(context, (added, skipped));
    } catch (e) {
      if (mounted) {
        setState(() => _submitting = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text(e.toString().replaceAll('Exception: ', '')), backgroundColor: MaanColors.accentRed));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Container(
        constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.8),
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Expanded(child: Text('Add Members', style: MaanText.h2)),
                IconButton(onPressed: () => Navigator.pop(context), icon: const Icon(Icons.close_rounded, size: 20)),
              ],
            ),
            Text('${widget.existingMemberIds.length} already in this chat',
                style: MaanText.caption.copyWith(fontSize: 11.5)),
            const SizedBox(height: 10),
            TextField(
              controller: _searchCtrl,
              onChanged: (_) => _loadPeople(),
              decoration: const InputDecoration(
                hintText: 'Search employees…',
                prefixIcon: Icon(Icons.search_rounded, size: 20),
                isDense: true,
              ),
            ),
            if (_selected.isNotEmpty) ...[
              const SizedBox(height: 10),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: _selected.map((id) {
                  ChatDirectoryPerson? p;
                  for (final e in _people) {
                    if (e.id == id) p = e;
                  }
                  return Chip(
                    label: Text(p?.fullName ?? 'Member', style: const TextStyle(fontSize: 11)),
                    visualDensity: VisualDensity.compact,
                    deleteIcon: const Icon(Icons.close_rounded, size: 14),
                    onDeleted: () => setState(() => _selected.remove(id)),
                    backgroundColor: const Color(0xFFE6F7F6),
                  );
                }).toList(),
              ),
            ],
            const SizedBox(height: 10),
            Flexible(
              child: _loading
                  ? const Center(child: Padding(padding: EdgeInsets.all(20), child: CircularProgressIndicator(strokeWidth: 2)))
                  : _error != null
                      ? EmptyStateWidget(
                          icon: Icons.cloud_off_rounded,
                          title: "Couldn't load employees",
                          message: _error,
                          actionLabel: 'Retry',
                          onAction: _loadPeople,
                        )
                      : _people.isEmpty
                          ? const EmptyStateWidget(
                              icon: Icons.people_outline_rounded,
                              title: 'Everyone is already in',
                              message: 'No one else is available to add right now.',
                            )
                          : ListView.builder(
                              shrinkWrap: true,
                              itemCount: _people.length,
                              itemBuilder: (context, i) {
                                final p = _people[i];
                                final chosen = _selected.contains(p.id);
                                return ListTile(
                                  dense: true,
                                  onTap: () => setState(() {
                                    chosen ? _selected.remove(p.id) : _selected.add(p.id);
                                  }),
                                  leading: MaanAvatar(avatar: p.avatar, name: p.fullName, radius: 16),
                                  title: Text(p.fullName,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: MaanColors.navy)),
                                  subtitle: Text(p.department ?? p.email ?? '',
                                      maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11, color: MaanColors.body)),
                                  trailing: chosen
                                      ? const Icon(Icons.check_circle_rounded, color: Color(0xFF0EA5A6), size: 20)
                                      : const Icon(Icons.radio_button_off_rounded, color: MaanColors.line, size: 20),
                                );
                              },
                            ),
            ),
            const SizedBox(height: 10),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: _submitting ? null : _submit,
                style: ElevatedButton.styleFrom(
                  backgroundColor: MaanColors.primary,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                icon: _submitting
                    ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                    : const Icon(Icons.person_add_alt_1_rounded, size: 18),
                label: Text('Add ${_selected.isEmpty ? '' : _selected.length} to Chat',
                    style: const TextStyle(fontWeight: FontWeight.w800)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
