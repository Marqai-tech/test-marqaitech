#!/usr/bin/env python3
# Task 142 — chat_home_screen.dart: SmartHR-style filter chips + colorful avatars
import sys

P = '/home/z/my-project/hrms_app/lib/screens/chat/chat_home_screen.dart'
s = open(P).read()

def must_replace(hay, old, new, label='call'):
    if old not in hay:
        print(f'MISS: {label}'); sys.exit(1)
    print(f'OK: {label}')
    return hay.replace(old, new, 1)

# 1) _RoomsTab: StatelessWidget → StatefulWidget with a filter chip state
s = must_replace(s, """class _RoomsTab extends StatelessWidget {
  final void Function(ChatRoomModel) onOpenRoom;
  const _RoomsTab({required this.onOpenRoom});
""", """/// Task 142 — SmartHR-style filter chips (All · Unread · Groups · Direct)
/// over the room list, plus deterministic colourful avatar pastels.
class _RoomsTab extends StatefulWidget {
  final void Function(ChatRoomModel) onOpenRoom;
  const _RoomsTab({required this.onOpenRoom});

  @override
  State<_RoomsTab> createState() => _RoomsTabState();
}

class _RoomsTabState extends State<_RoomsTab> {
  String _filter = 'all'; // all | unread | groups | direct

  void _open(ChatRoomModel room) => widget.onOpenRoom(room);

  /// Task 142 — deterministic SmartHR pastel for direct-chat avatars.
  static const List<Color> _avatarPastels = [
    Color(0xFF3A57C4), Color(0xFF6C4FD6), Color(0xFF8A5CF6), Color(0xFF0EA5A6),
    Color(0xFFF278B0), Color(0xFFF5A623), Color(0xFF34C38F), Color(0xFF38BDF8),
  ];

  static Color _pastelFor(String name) {
    var h = 0;
    for (final c in name.codeUnits) {
      h = (h * 31 + c) & 0x7fffffff;
    }
    return _avatarPastels[h % _avatarPastels.length];
  }
""")

# 2) the long-press / rename helpers reference widget-level functions — they are
#    methods on the state now (moved with the class). No signature change needed.

# 3) build(): insert the filter chips row under the search + filter the rooms
s = must_replace(s, """  @override
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
""", """  @override
  Widget build(BuildContext context) {
    final chat = context.watch<ChatRoomsProvider>();
    final rooms = _filteredRooms(chat);
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
          // ── Task 142 — SmartHR-style filter chips ──
          SizedBox(
            height: 40,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              children: [
                _chip('All', 'all'),
                const SizedBox(width: 8),
                _chip('Unread', 'unread'),
                const SizedBox(width: 8),
                _chip('Groups', 'groups'),
                const SizedBox(width: 8),
                _chip('Direct', 'direct'),
              ],
            ),
          ),
""")

# 4) use the filtered list in the body
s = must_replace(s, """                        : ListView.separated(
                            padding: const EdgeInsets.fromLTRB(12, 8, 12, 90),
                            itemCount: chat.rooms.length,
                            separatorBuilder: (_, __) => const SizedBox(height: 8),
                            itemBuilder: (context, i) {
                              final room = chat.rooms[i];""", """                        : rooms.isEmpty
                            ? EmptyStateWidget(
                                icon: Icons.filter_alt_off_rounded,
                                title: 'Nothing here',
                                message: _filter == 'unread' ? 'No unread chats — you are all caught up!' : 'No chats match this filter yet.',
                              )
                        : ListView.separated(
                            padding: const EdgeInsets.fromLTRB(12, 8, 12, 90),
                            itemCount: rooms.length,
                            separatorBuilder: (_, __) => const SizedBox(height: 8),
                            itemBuilder: (context, i) {
                              final room = rooms[i];""")

# 5) colourful avatar for direct chats + open via state method
s = must_replace(s, """                                  onTap: () => onOpenRoom(room),
                                  // Task 122 — long-press opens the chat actions sheet
                                  // (rename / delete per the tenant's chat governance).
                                  onLongPress: () => _showRoomActions(context, chat, room),""", """                                  onTap: () => _open(room),
                                  // Task 122 — long-press opens the chat actions sheet
                                  // (rename / delete per the tenant's chat governance).
                                  onLongPress: () => _showRoomActions(context, chat, room),""")

s = must_replace(s, """                                            room.isDirect && partner != null
                                                ? MaanAvatar(avatar: partner.avatar, name: partner.fullName, radius: 22, bgColor: accent)
                                                : CircleAvatar(""", """                                            room.isDirect && partner != null
                                                ? MaanAvatar(avatar: partner.avatar, name: partner.fullName, radius: 22, bgColor: partner.avatar == null ? _pastelFor(partner.fullName) : accent)
                                                : CircleAvatar(""")

# 6) unread pill → SmartHR primary (consistent, recognisable) for direct chats
s = must_replace(s, """                                                if (room.unreadCount > 0)
                                                    Container(
                                                      margin: const EdgeInsets.only(left: 8),
                                                      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                                                      decoration: BoxDecoration(color: accent, borderRadius: BorderRadius.circular(10)),
                                                      child: Text(
                                                        room.unreadCount > 99 ? '99+' : '${room.unreadCount}',
                                                        style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w800),
                                                      ),
                                                    ),""", """                                                if (room.unreadCount > 0)
                                                    Container(
                                                      margin: const EdgeInsets.only(left: 8),
                                                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                                      decoration: BoxDecoration(
                                                        gradient: const LinearGradient(colors: [Color(0xFF3A57C4), Color(0xFF6C4FD6)]),
                                                        borderRadius: BorderRadius.circular(10),
                                                      ),
                                                      child: Text(
                                                        room.unreadCount > 99 ? '99+' : '${room.unreadCount}',
                                                        style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w800),
                                                      ),
                                                    ),""")

# 7) append the _chip + _filteredRooms helpers at the end of _RoomsTabState
#    (find the end of the _RoomsTab build method — before the Directory tab section)
anchor = '// ══ Directory tab (Task 118) ═══════════════════════════════════════════'
i = s.find(anchor)
if i < 0:
    print('MISS: directory anchor'); sys.exit(1)
helpers = """  // ── Task 142 — filter helpers ──

  List<ChatRoomModel> _filteredRooms(ChatRoomsProvider chat) {
    switch (_filter) {
      case 'unread':
        return chat.rooms.where((r) => r.unreadCount > 0).toList();
      case 'groups':
        return chat.rooms.where((r) => !r.isDirect).toList();
      case 'direct':
        return chat.rooms.where((r) => r.isDirect).toList();
      default:
        return chat.rooms;
    }
  }

  Widget _chip(String label, String value) {
    final active = _filter == value;
    return InkWell(
      borderRadius: BorderRadius.circular(18),
      onTap: () => setState(() => _filter = value),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 7),
        decoration: BoxDecoration(
          gradient: active ? const LinearGradient(colors: [Color(0xFF3A57C4), Color(0xFF6C4FD6)]) : null,
          color: active ? null : Colors.white,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: active ? Colors.transparent : MaanColors.line),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 11.5,
            fontWeight: FontWeight.w800,
            color: active ? Colors.white : MaanColors.body,
          ),
        ),
      ),
    );
  }
}

"""
s = s[:i] + helpers + s[i:]
open(P, 'w').write(s)
print('chat_home_screen updated')
