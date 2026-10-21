import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../config/maan_theme.dart';
import '../../models/chat.dart';
import '../../providers/chat_provider.dart';
import '../../services/api_service.dart';
import '../../utils/json_safe.dart';
import '../../widgets/maan_avatar.dart';
import '../../widgets/empty_state_widget.dart';
import '../../widgets/loading_widget.dart';
import 'chat_room_screen.dart';

/// Task 117 — Collaboration Chat (mobile, web parity).
/// Room list = the web left pane: search, per-type avatars, last-message
/// preview, unread badges, E2EE lock. New-chat sheet = the web modal
/// (Direct/Group toggle + employee picker from /api/employees).
/// Task 118 — Directory tab: ALL employees are listed by default; tapping
/// one opens (or reuses) the 1:1 direct chat instantly — no more empty
/// "No chats yet" dead end for first-time users.
/// Task 119 — the provider is APP-SCOPED (main.dart MultiProvider), not
/// created here: ChatRoomScreen is pushed as a separate route, so a locally
/// scoped provider was invisible from the thread screen (grey-screen crash).
/// This screen only KICKS the first fetch.
class ChatHomeScreen extends StatefulWidget {
  const ChatHomeScreen({super.key});

  @override
  State<ChatHomeScreen> createState() => _ChatHomeScreenState();
}

class _ChatHomeScreenState extends State<ChatHomeScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final chat = context.read<ChatRoomsProvider>();
      if (!chat.isLoading && chat.rooms.isEmpty && chat.error == null) {
        chat.fetchRooms();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return const _ChatHomeBody();
  }
}

class _ChatHomeBody extends StatefulWidget {
  const _ChatHomeBody();

  @override
  State<_ChatHomeBody> createState() => _ChatHomeBodyState();
}

// Top-level room visuals (shared by the rooms list).
String _timeLabel(String? iso) {
  if (iso == null || iso.isEmpty) return '';
  final d = DateTime.tryParse(iso)?.toLocal();
  if (d == null) return '';
  final now = DateTime.now();
  if (d.year == now.year && d.month == now.month && d.day == now.day) {
    return DateFormat('h:mm a').format(d);
  }
  if (now.difference(d).inDays < 7) return DateFormat('EEE').format(d);
  return DateFormat('d MMM').format(d);
}

IconData _typeIcon(ChatRoomModel r) {
  if (r.isDirect) return Icons.chat_bubble_outline_rounded;
  if (r.isAnnouncementRoom) return Icons.campaign_rounded;
  return Icons.tag_rounded;
}

Color _typeColor(ChatRoomModel r) {
  if (r.isDirect) return const Color(0xFF0EA5A6); // teal — web chat accent
  if (r.isAnnouncementRoom) return const Color(0xFFF5A623); // amber
  return const Color(0xFF6C8FEF); // blue
}

Color _typeBg(ChatRoomModel r) {
  if (r.isDirect) return const Color(0xFFE6F7F6);
  if (r.isAnnouncementRoom) return const Color(0xFFFEF3E2);
  return const Color(0xFFE9E6FD);
}

class _ChatHomeBodyState extends State<_ChatHomeBody> with SingleTickerProviderStateMixin {
  late final TabController _tabs = TabController(length: 2, vsync: this);

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  Future<void> _openRoom(ChatRoomModel room) async {
    await Navigator.push(context, MaterialPageRoute(builder: (_) => ChatRoomScreen(room: room)));
    // Returning from a thread: unread badges may have changed (the server
    // marks read on open).
    if (mounted) context.read<ChatRoomsProvider>().fetchRooms(silent: true);
  }

  Future<void> _newChatSheet() async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => const _NewChatSheet(),
    );
    if (mounted) context.read<ChatRoomsProvider>().fetchRooms(silent: true);
  }

  @override
  Widget build(BuildContext context) {
    final chat = context.watch<ChatRoomsProvider>();
    final onDirectory = _tabs.index == 1;
    return Scaffold(
      backgroundColor: MaanColors.pageBg,
      appBar: AppBar(
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.white,
        elevation: 0.5,
        iconTheme: const IconThemeData(color: MaanColors.navy),
        title: const Text('Chats', style: MaanText.h2),
        bottom: TabBar(
          controller: _tabs,
          onTap: (_) {
            setState(() {}); // FAB + search placeholder follow the active tab
            if (_tabs.index == 1) context.read<ChatRoomsProvider>().loadDirectory();
          },
          labelColor: MaanColors.primary,
          unselectedLabelColor: MaanColors.faint,
          indicatorColor: MaanColors.primary,
          labelStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800),
          tabs: const [
            Tab(text: 'Chats'),
            Tab(text: 'Directory'),
          ],
        ),
      ),
      floatingActionButton: onDirectory
          ? null // the directory IS the picker — no FAB needed there
          : FloatingActionButton.extended(
              heroTag: 'chat_new',
              backgroundColor: MaanColors.primary,
              foregroundColor: Colors.white,
              onPressed: _newChatSheet,
              icon: const Icon(Icons.add_comment_rounded, size: 20),
              label: const Text('New Chat', style: TextStyle(fontWeight: FontWeight.w700)),
            ),
      body: TabBarView(
        controller: _tabs,
        children: [
          _RoomsTab(onOpenRoom: _openRoom),
          _DirectoryTab(onOpenRoom: _openRoom),
        ],
      ),
    );
  }
}

// ══ Chats tab (rooms) ══════════════════════════════════════════════════
class _RoomsTab extends StatelessWidget {
  final void Function(ChatRoomModel) onOpenRoom;
  const _RoomsTab({required this.onOpenRoom});

  @override
  Widget build(BuildContext context) {
    final chat = context.watch<ChatRoomsProvider>();
    return RefreshIndicator(
      color: MaanColors.primary,
      onRefresh: () => chat.fetchRooms(silent: true),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
            child: TextField(
              onChanged: chat.setSearch,
              decoration: InputDecoration(
                hintText: 'Search chats…',
                prefixIcon: const Icon(Icons.search_rounded, size: 20),
                isDense: true,
                filled: true,
                fillColor: Colors.white,
                contentPadding: const EdgeInsets.symmetric(vertical: 10),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: MaanColors.line)),
                enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: MaanColors.line)),
              ),
            ),
          ),
          Expanded(
            child: chat.isLoading
                ? const LoadingWidget(itemCount: 6)
                : chat.error != null
                    ? EmptyStateWidget(
                        icon: Icons.cloud_off_rounded,
                        title: "Couldn't load chats",
                        message: chat.error,
                        actionLabel: 'Retry',
                        onAction: () => chat.fetchRooms(),
                      )
                    : chat.rooms.isEmpty
                        ? EmptyStateWidget(
                            icon: Icons.chat_bubble_outline_rounded,
                            title: 'No chats yet',
                            message: 'Open the Directory tab and tap any employee to start a conversation — direct chats are end-to-end encrypted by default.',
                          )
                        : ListView.separated(
                            padding: const EdgeInsets.fromLTRB(12, 8, 12, 90),
                            itemCount: chat.rooms.length,
                            separatorBuilder: (_, __) => const SizedBox(height: 8),
                            itemBuilder: (context, i) {
                              final room = chat.rooms[i];
                              final accent = _typeColor(room);
                              final preview = room.lastMessage?.body ?? 'No messages yet';
                              final partner = room.isDirect ? chat.partnerOf(room) : null;
                              final title = chat.displayName(room);
                              final prefix = room.isDirect ? '' : '(${room.members.length}) ';
                              return Material(
                                color: Colors.white,
                                borderRadius: BorderRadius.circular(14),
                                child: InkWell(
                                  borderRadius: BorderRadius.circular(14),
                                  onTap: () => onOpenRoom(room),
                                  child: Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                                    decoration: BoxDecoration(
                                      borderRadius: BorderRadius.circular(14),
                                      border: Border.all(color: MaanColors.line),
                                    ),
                                    child: Row(
                                      children: [
                                        Stack(
                                          clipBehavior: Clip.none,
                                          children: [
                                            room.isDirect && partner != null
                                                ? MaanAvatar(avatar: partner.avatar, name: partner.fullName, radius: 22, bgColor: accent)
                                                : CircleAvatar(
                                                    radius: 22,
                                                    backgroundColor: _typeBg(room),
                                                    child: Icon(_typeIcon(room), size: 20, color: accent),
                                                  ),
                                            if (room.isE2EE)
                                              Positioned(
                                                right: -3,
                                                bottom: -3,
                                                child: Container(
                                                  padding: const EdgeInsets.all(2.5),
                                                  decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle),
                                                  child: const Icon(Icons.lock_rounded, size: 11, color: Color(0xFF0EA5A6)),
                                                ),
                                              ),
                                          ],
                                        ),
                                        const SizedBox(width: 12),
                                        Expanded(
                                          child: Column(
                                            crossAxisAlignment: CrossAxisAlignment.start,
                                            children: [
                                              Row(
                                                children: [
                                                  Expanded(
                                                    child: Text(title,
                                                        maxLines: 1,
                                                        overflow: TextOverflow.ellipsis,
                                                        style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: MaanColors.navy)),
                                                  ),
                                                  // Task 121 — project workspace rooms get a badge
                                                  if (room.roomType == 'project')
                                                    Container(
                                                      margin: const EdgeInsets.only(right: 6),
                                                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                                      decoration: BoxDecoration(color: const Color(0xFFE0F2FE), borderRadius: BorderRadius.circular(6)),
                                                      child: const Text('PROJECT',
                                                          style: TextStyle(fontSize: 9, fontWeight: FontWeight.w800, color: Color(0xFF0369A1))),
                                                    ),
                                                  if (room.isAnnouncementRoom)
                                                    Container(
                                                      margin: const EdgeInsets.only(right: 6),
                                                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                                      decoration: BoxDecoration(color: const Color(0xFFFEF3E2), borderRadius: BorderRadius.circular(6)),
                                                      child: const Text('ANN',
                                                          style: TextStyle(fontSize: 9, fontWeight: FontWeight.w800, color: Color(0xFFB7791F))),
                                                    ),
                                                  Text(_timeLabel(room.lastMessageAt ?? room.lastMessage?.createdAt),
                                                      style: const TextStyle(fontSize: 10.5, color: MaanColors.faint)),
                                                ],
                                              ),
                                              const SizedBox(height: 3),
                                              Row(
                                                children: [
                                                  Expanded(
                                                    child: Text(
                                                      '$prefix$preview',
                                                      maxLines: 1,
                                                      overflow: TextOverflow.ellipsis,
                                                      style: TextStyle(
                                                          fontSize: 12.5,
                                                          color: room.unreadCount > 0 ? MaanColors.navy : MaanColors.body,
                                                          fontWeight: room.unreadCount > 0 ? FontWeight.w600 : FontWeight.w400),
                                                    ),
                                                  ),
                                                  if (room.unreadCount > 0)
                                                    Container(
                                                      margin: const EdgeInsets.only(left: 8),
                                                      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                                                      decoration: BoxDecoration(color: accent, borderRadius: BorderRadius.circular(10)),
                                                      child: Text(
                                                        room.unreadCount > 99 ? '99+' : '${room.unreadCount}',
                                                        style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w800),
                                                      ),
                                                    ),
                                                ],
                                              ),
                                            ],
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              );
                            },
                          ),
          ),
        ],
      ),
    );
  }
}

// ══ Directory tab (Task 118) ═══════════════════════════════════════════
/// ALL employees by default (server-scoped by role). Tap → direct chat.
class _DirectoryTab extends StatelessWidget {
  final void Function(ChatRoomModel) onOpenRoom;
  const _DirectoryTab({required this.onOpenRoom});

  Future<void> _startDirect(BuildContext context, ChatRoomsProvider chat, ChatDirectoryPerson p) async {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(
        duration: const Duration(seconds: 2),
        content: Text('Opening chat with ${p.fullName}…'),
      ));
    try {
      final (room, _) = await chat.openDirectWith(p.id);
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).hideCurrentSnackBar();
      if (room != null) {
        onOpenRoom(room);
      } else {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Chat opened — find it under the Chats tab'),
            backgroundColor: Color(0xFF2FA36B)));
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text(e.toString().replaceAll('Exception: ', '')),
            backgroundColor: MaanColors.accentRed));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final chat = context.watch<ChatRoomsProvider>();
    final meId = chat.myEmployeeId;
    final people = chat.directoryList;
    return RefreshIndicator(
      color: MaanColors.primary,
      onRefresh: () => chat.loadDirectory(force: true),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
            child: TextField(
              onChanged: chat.setDirectorySearch,
              decoration: InputDecoration(
                hintText: 'Search employees…',
                prefixIcon: const Icon(Icons.search_rounded, size: 20),
                isDense: true,
                filled: true,
                fillColor: Colors.white,
                contentPadding: const EdgeInsets.symmetric(vertical: 10),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: MaanColors.line)),
                enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: MaanColors.line)),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 2, 16, 6),
            child: Row(children: [
              const Icon(Icons.info_outline_rounded, size: 13, color: MaanColors.faint),
              const SizedBox(width: 6),
              Expanded(
                child: Text('Tap a teammate to start a direct chat',
                    style: MaanText.caption.copyWith(fontSize: 11)),
              ),
            ]),
          ),
          Expanded(
            child: chat.directoryLoading
                ? const LoadingWidget(itemCount: 6)
                : chat.directoryError != null
                    ? EmptyStateWidget(
                        icon: Icons.cloud_off_rounded,
                        title: "Couldn't load employees",
                        message: chat.directoryError,
                        actionLabel: 'Retry',
                        onAction: () => chat.loadDirectory(force: true),
                      )
                    : people.isEmpty
                        ? const EmptyStateWidget(
                            icon: Icons.people_outline_rounded,
                            title: 'No employees found',
                            message: 'Try a different search.',
                          )
                        : ListView.separated(
                            padding: const EdgeInsets.fromLTRB(12, 4, 12, 24),
                            itemCount: people.length,
                            separatorBuilder: (_, __) => const SizedBox(height: 6),
                            itemBuilder: (context, i) {
                              final p = people[i];
                              final isMe = p.id == meId;
                              return Material(
                                color: Colors.white,
                                borderRadius: BorderRadius.circular(14),
                                child: InkWell(
                                  borderRadius: BorderRadius.circular(14),
                                  onTap: isMe ? null : () => _startDirect(context, chat, p),
                                  child: Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                                    decoration: BoxDecoration(
                                      borderRadius: BorderRadius.circular(14),
                                      border: Border.all(color: MaanColors.line),
                                    ),
                                    child: Row(
                                      children: [
                                        MaanAvatar(avatar: p.avatar, name: p.fullName, radius: 19),
                                        const SizedBox(width: 12),
                                        Expanded(
                                          child: Column(
                                            crossAxisAlignment: CrossAxisAlignment.start,
                                            children: [
                                              Text(p.fullName,
                                                  maxLines: 1,
                                                  overflow: TextOverflow.ellipsis,
                                                  style: const TextStyle(
                                                      fontSize: 13.5, fontWeight: FontWeight.w800, color: MaanColors.navy)),
                                              if ((p.department ?? p.email ?? '').isNotEmpty)
                                                Text(p.department ?? p.email!,
                                                    maxLines: 1,
                                                    overflow: TextOverflow.ellipsis,
                                                    style: const TextStyle(fontSize: 11, color: MaanColors.body)),
                                            ],
                                          ),
                                        ),
                                        if (isMe)
                                          Container(
                                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                            decoration: BoxDecoration(
                                                color: MaanColors.pageBg, borderRadius: BorderRadius.circular(10)),
                                            child: const Text('You',
                                                style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: MaanColors.faint)),
                                          )
                                        else
                                          const Icon(Icons.chat_bubble_outline_rounded,
                                              size: 17, color: Color(0xFF0EA5A6)),
                                      ],
                                    ),
                                  ),
                                ),
                              );
                            },
                          ),
          ),
        ],
      ),
    );
  }
}

/// New-chat sheet — mirrors the web modal: Direct vs Group toggle, group name
/// field, employee search against /api/employees (role-scoped server-side),
/// multi-select chips, create.
class _NewChatSheet extends StatefulWidget {
  const _NewChatSheet();

  @override
  State<_NewChatSheet> createState() => _NewChatSheetState();
}

class _NewChatSheetState extends State<_NewChatSheet> {
  bool _group = false;
  final _nameCtrl = TextEditingController();
  final _searchCtrl = TextEditingController();
  List<ChatDirectoryPerson> _people = [];
  final Set<String> _selected = {};
  bool _loadingPeople = false;
  String? _peopleError;

  @override
  void initState() {
    super.initState();
    _loadPeople();
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadPeople() async {
    setState(() {
      _loadingPeople = true;
      _peopleError = null;
    });
    try {
      final q = _searchCtrl.text.trim();
      final data = await ApiService.getEmployees(limit: 50, search: q.isEmpty ? null : q, excludeInactive: true);
      final rows = jsonList(data['employees'] is List ? data['employees'] : data['data']);
      if (mounted) {
        setState(() => _people = rows
            .map(ChatDirectoryPerson.fromJson)
            .where((p) => p.id.isNotEmpty && !p.isInactive) // Task 120 — no separated staff in chat pickers
            .toList());
      }
    } catch (e) {
      if (mounted) setState(() => _peopleError = e.toString().replaceAll('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _loadingPeople = false);
    }
  }

  Future<void> _create() async {
    if (_selected.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Select at least one member')));
      return;
    }
    if (_group && _nameCtrl.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Give the group a name')));
      return;
    }
    final chat = context.read<ChatRoomsProvider>();
    final (room, existed) = await chat.createRoom(
      name: _group ? _nameCtrl.text.trim() : null,
      type: _group ? 'group' : 'direct',
      memberIds: _selected.toList(),
    );
    if (!mounted) return;
    Navigator.pop(context);
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(existed ? 'Direct chat already exists — opened it' : (_group ? 'Group chat created' : 'Direct chat created')),
      backgroundColor: const Color(0xFF2FA36B),
    ));
    if (room != null) {
      Navigator.push(context, MaterialPageRoute(builder: (_) => ChatRoomScreen(room: room)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final chat = context.watch<ChatRoomsProvider>();
    final meId = chat.myEmployeeId;
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Container(
        constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.85),
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Expanded(child: Text('New Conversation', style: MaanText.h2)),
                IconButton(onPressed: () => Navigator.pop(context), icon: const Icon(Icons.close_rounded, size: 20)),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: _typeButton(
                    icon: Icons.chat_bubble_outline_rounded,
                    label: 'Direct',
                    selected: !_group,
                    onTap: () => setState(() => _group = false),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _typeButton(
                    icon: Icons.group_rounded,
                    label: 'Group',
                    selected: _group,
                    onTap: () => setState(() => _group = true),
                  ),
                ),
              ],
            ),
            if (_group) ...[
              const SizedBox(height: 12),
              TextField(controller: _nameCtrl, decoration: const InputDecoration(hintText: 'Group name…', isDense: true)),
            ],
            const SizedBox(height: 12),
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
              child: _loadingPeople
                  ? const Center(child: Padding(padding: EdgeInsets.all(20), child: CircularProgressIndicator(strokeWidth: 2)))
                  : _peopleError != null
                      ? EmptyStateWidget(
                          icon: Icons.cloud_off_rounded,
                          title: "Couldn't load employees",
                          message: _peopleError,
                          actionLabel: 'Retry',
                          onAction: _loadPeople,
                        )
                      : _people.isEmpty
                          ? const EmptyStateWidget(icon: Icons.people_outline_rounded, title: 'No employees found', message: 'Try a different search.')
                          : ListView.builder(
                              shrinkWrap: true,
                              itemCount: _people.length,
                              itemBuilder: (context, i) {
                                final p = _people[i];
                                final isMe = p.id == meId;
                                final chosen = _selected.contains(p.id);
                                if (isMe) return const SizedBox.shrink();
                                return ListTile(
                                  dense: true,
                                  onTap: () {
                                    setState(() {
                                      if (_group) {
                                        chosen ? _selected.remove(p.id) : _selected.add(p.id);
                                      } else {
                                        _selected
                                          ..clear()
                                          ..add(p.id);
                                      }
                                    });
                                  },
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
                onPressed: chat.creating ? null : _create,
                style: ElevatedButton.styleFrom(
                  backgroundColor: MaanColors.primary,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                icon: const Icon(Icons.add_rounded, size: 18),
                label: Text('Create ${_group ? 'Group' : 'Direct'} Chat', style: const TextStyle(fontWeight: FontWeight.w800)),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _typeButton({required IconData icon, required String label, required bool selected, required VoidCallback onTap}) {
    return Material(
      color: selected ? const Color(0xFF0EA5A6) : Colors.white,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: selected ? const Color(0xFF0EA5A6) : MaanColors.line),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 16, color: selected ? Colors.white : MaanColors.body),
              const SizedBox(width: 6),
              Text(label,
                  style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: selected ? Colors.white : MaanColors.navy)),
            ],
          ),
        ),
      ),
    );
  }
}
