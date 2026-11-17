import 'dart:async';

import 'package:flutter/material.dart';

import '../models/chat.dart';
import '../services/api_service.dart';
import '../utils/json_safe.dart';

/// Task 117 — state for the Collaboration Chat module (rooms list + thread).
/// Same endpoints as the web Collaboration → Chat page; scoping is enforced
/// server-side (rooms come back ONLY where the signed-in employee is a
/// member). Parsing is shape-agnostic (json_safe, Task 116 crash class).
///
/// Identity contract: ChatRoomMember.userId / ChatMessage.senderId are
/// EMPLOYEE ids. [myEmployeeId] is resolved once via
/// ApiService.resolveOwnEmployeeId() (my-summary → directory-email fallback,
/// the same production resolver Tasks 107–113 rely on). Every "is this mine?"
/// decision in the UI goes through it.
class ChatRoomsProvider extends ChangeNotifier {
  List<ChatRoomModel> _rooms = [];
  bool _isLoading = false;
  bool _creating = false;
  String? _error;
  String _search = '';
  String? _myEmployeeId;
  Map<String, ChatDirectoryPerson> _directory = {};

  /// Task 122 — chat governance (who may create/edit/delete chats). Starts
  /// in the conservative [ChatGovernance.loading] state; fetchChatSettings()
  /// fills it right after the first rooms fetch. A settings failure keeps
  /// the defaults — the server still enforces everything.
  ChatGovernance _governance = ChatGovernance.loading;

  /// Optional pre-resolved identity (tests / future session restore). When
  /// null the first fetchRooms() resolves it via ApiService.
  ChatRoomsProvider({String? initialEmployeeId}) : _myEmployeeId = initialEmployeeId;

  // Task 118 — the Directory tab shows ALL employees by default (server
  // role-scoping still applies: employees see their department, managers
  // their team, admins everyone — exactly like the web directory).
  List<ChatDirectoryPerson> _directoryList = [];
  bool _directoryLoading = false;
  String? _directoryError;
  String _directorySearch = '';

  List<ChatRoomModel> get rooms {
    if (_search.trim().isEmpty) return _rooms;
    final q = _search.trim().toLowerCase();
    return _rooms.where((r) => displayName(r).toLowerCase().contains(q)).toList();
  }

  bool get isLoading => _isLoading;
  bool get creating => _creating;
  String? get error => _error;
  String get search => _search;
  String? get myEmployeeId => _myEmployeeId;

  /// Task 122 — effective chat governance for the signed-in user.
  ChatGovernance get governance => _governance;
  bool get canCreateGroup => _governance.canCreateGroup;
  bool get canEditGroup => _governance.canEditGroup;
  bool get canDeleteGroup => _governance.canDeleteGroup;
  bool get canDeleteDirect => _governance.canDeleteDirect;

  // Task 118 — directory state for the Directory tab.
  List<ChatDirectoryPerson> get directoryList {
    if (_directorySearch.trim().isEmpty) return _directoryList;
    final q = _directorySearch.trim().toLowerCase();
    return _directoryList
        .where((p) =>
            p.fullName.toLowerCase().contains(q) ||
            (p.department ?? '').toLowerCase().contains(q) ||
            (p.email ?? '').toLowerCase().contains(q))
        .toList();
  }

  bool get directoryLoading => _directoryLoading;
  String? get directoryError => _directoryError;
  String get directorySearch => _directorySearch;

  void setDirectorySearch(String s) {
    _directorySearch = s;
    notifyListeners();
  }

  int get totalUnread => _rooms.fold(0, (sum, r) => sum + r.unreadCount);

  void setSearch(String s) {
    _search = s;
    notifyListeners();
  }

  /// Display name: explicit room name → directory-resolved other member for
  /// direct rooms → graceful fallback. (The rooms payload carries member IDs
  /// only; names come from the employee directory like the web page does.)
  String displayName(ChatRoomModel room) {
    if (room.name != null && room.name!.trim().isNotEmpty) return room.name!;
    if (room.isDirect) {
      final other = otherMemberId(room);
      if (other != null && _directory[other] != null) return _directory[other]!.fullName;
      return 'Direct Chat';
    }
    return room.isAnnouncementRoom ? 'Announcement' : 'Group Chat';
  }

  /// The OTHER member of a direct room (relative to the signed-in employee).
  String? otherMemberId(ChatRoomModel room) {
    for (final m in room.members) {
      if (m.userId != _myEmployeeId && m.userId.isNotEmpty) return m.userId;
    }
    // Single-member room (the user's own desk) or unresolved identity.
    return room.members.isNotEmpty ? room.members.first.userId : null;
  }

  ChatDirectoryPerson? personOf(String employeeId) => _directory[employeeId];

  /// Directory entry for a room's visual (avatar of the direct partner).
  ChatDirectoryPerson? partnerOf(ChatRoomModel room) {
    final other = otherMemberId(room);
    return other == null ? null : _directory[other];
  }

  Future<void> fetchRooms({bool silent = false}) async {
    if (!silent) {
      _isLoading = true;
      _error = null;
      notifyListeners();
    }
    try {
      // Resolve identity once per session; refresh the directory only when
      // we have never loaded it (keeps silent polls cheap).
      _myEmployeeId ??= await ApiService.resolveOwnEmployeeId();
      final results = await Future.wait([
        ApiService.getChatRooms(),
        _directory.isEmpty ? _loadDirectory() : Future.value(),
        // Task 122 — governance loads alongside the rooms (non-blocking).
        _governanceLoaded ? Future.value() : _loadGovernance(),
      ]);
      final data = results[0] as Map<String, dynamic>;
      _rooms = jsonMapList(data['rooms']).map(ChatRoomModel.fromJson).toList();
      // Most-recent activity first (server already sorts by lastMessageAt,
      // but a deviant payload must still look right).
      _rooms.sort((a, b) => (b.lastMessageAt ?? b.createdAt ?? '').compareTo(a.lastMessageAt ?? a.createdAt ?? ''));
      _error = null;
    } catch (e) {
      _error = e.toString().replaceAll('Exception: ', '');
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  bool _governanceLoaded = false;

  Future<void> _loadGovernance() async {
    try {
      final data = await performGetChatSettings();
      _governance = ChatGovernance.fromJson(data);
    } catch (_) {
      // Keep the conservative defaults — the server still enforces.
    } finally {
      _governanceLoaded = true;
    }
  }

  /// Explicit re-load (e.g. after the admin changes chat settings).
  Future<void> fetchChatSettings() async {
    _governanceLoaded = false;
    await _loadGovernance();
    notifyListeners();
  }

  /// Test seam (production behavior identical — delegates to ApiService).
  Future<Map<String, dynamic>> performGetChatSettings() => ApiService.getChatSettings();

  /// Task 122 — delete a chat. Direct rooms hide for THIS user
  /// (scope 'self'); group rooms soft-delete for everyone
  /// (scope 'everyone'). Returns the server scope.
  Future<String> deleteRoom(String roomId) async {
    final data = await performDeleteChatRoom(roomId);
    final scope = (data['scope'] ?? 'everyone').toString();
    await fetchRooms(silent: true);
    return scope;
  }

  /// Test seam (production behavior identical — delegates to ApiService).
  Future<Map<String, dynamic>> performDeleteChatRoom(String roomId) => ApiService.deleteChatRoom(roomId);

  /// Task 122 — rename a group chat (chat managers only).
  Future<void> renameRoom(String roomId, String name) async {
    await performRenameChatRoom(roomId, name);
    await fetchRooms(silent: true);
  }

  /// Test seam (production behavior identical — delegates to ApiService).
  Future<Map<String, dynamic>> performRenameChatRoom(String roomId, String name) =>
      ApiService.renameChatRoom(roomId, name);

  Future<void> _loadDirectory() async {
    try {
      final data = await ApiService.getEmployees(limit: 200, excludeInactive: true);
      final rows = jsonList(data['employees'] is List ? data['employees'] : data['data']);
      final map = <String, ChatDirectoryPerson>{};
      for (final row in rows) {
        final p = ChatDirectoryPerson.fromJson(row);
        // Task 120 — separated employees never surface in chat (defense in
        // depth: the server already excludes them via ?excludeInactive=true).
        if (p.id.isNotEmpty && !p.isInactive) map[p.id] = p;
      }
      _directory = map;
      _directoryList = map.values.toList()
        ..sort((a, b) => a.fullName.toLowerCase().compareTo(b.fullName.toLowerCase()));
    } catch (_) {
      // Directory is a name-resolution aid only — never block the room list.
    }
  }

  /// Task 118 — explicit, observable directory load for the Directory tab
  /// (separate from the silent name-resolution aid above so a directory
  /// failure can surface its own retry affordance instead of a blank list).
  Future<void> loadDirectory({bool force = false}) async {
    if (_directoryLoading) return;
    if (!force && _directoryList.isNotEmpty) return;
    _directoryLoading = true;
    _directoryError = null;
    notifyListeners();
    try {
      _myEmployeeId ??= await ApiService.resolveOwnEmployeeId();
      final data = await ApiService.getEmployees(limit: 200, excludeInactive: true);
      final rows = jsonList(data['employees'] is List ? data['employees'] : data['data']);
      final map = <String, ChatDirectoryPerson>{};
      for (final row in rows) {
        final p = ChatDirectoryPerson.fromJson(row);
        // Task 120 — separated employees never surface in the Directory tab.
        if (p.id.isNotEmpty && !p.isInactive) map[p.id] = p;
      }
      _directory = map;
      _directoryList = map.values.toList()
        ..sort((a, b) => a.fullName.toLowerCase().compareTo(b.fullName.toLowerCase()));
    } catch (e) {
      _directoryError = e.toString().replaceAll('Exception: ', '');
    } finally {
      _directoryLoading = false;
      notifyListeners();
    }
  }

  /// Task 118 — tap an employee in the Directory → create (or reuse) the
  /// 1:1 direct room and hand it back so the caller can open the thread.
  Future<(ChatRoomModel?, bool)> openDirectWith(String employeeId) =>
      createRoom(type: 'direct', memberIds: [employeeId]);

  /// Create a direct or group chat. Returns the room (freshly parsed) so the
  /// caller can open it immediately; alreadyExisted mirrors the server flag.
  Future<(ChatRoomModel?, bool)> createRoom({String? name, required String type, required List<String> memberIds}) async {
    _creating = true;
    notifyListeners();
    try {
      final data = await ApiService.createChatRoom(name: name, roomType: type, memberIds: memberIds);
      final room = jsonMap(data['room']).isEmpty ? null : ChatRoomModel.fromJson(data['room']);
      // If the members came back without the nested room block, patch names
      // from the directory on the next full refresh.
      await fetchRooms(silent: true);
      return (room, data['alreadyExisted'] == true);
    } finally {
      _creating = false;
      notifyListeners();
    }
  }

  /// Task 120 — add people to an EXISTING group chat. Returns
  /// (addedCount, skipped) where skipped carries server reasons
  /// ('Already a member', separated employees, unknown ids).
  Future<(int, List<Map<String, dynamic>>)> addMembers(String roomId, List<String> memberIds) async {
    if (memberIds.isEmpty) return (0, const <Map<String, dynamic>>[]);
    _creating = true;
    notifyListeners();
    try {
      final data = await performAddMembers(roomId, memberIds);
      final added = (data['added'] is num) ? (data['added'] as num).toInt() : memberIds.length;
      final skipped = jsonMapList(data['skipped']);
      await fetchRooms(silent: true);
      return (added, skipped);
    } finally {
      _creating = false;
      notifyListeners();
    }
  }

  /// Test seam (production behavior identical — delegates straight to the
  /// ApiService, exactly like Task 119's threadProviderFactory pattern).
  Future<Map<String, dynamic>> performAddMembers(String roomId, List<String> memberIds) =>
      ApiService.addChatRoomMembers(roomId, memberIds);
}

/// Thread state for ONE room: chronological messages, older-page cursor,
/// send, and a light polling loop so replies appear while the screen is open.
class ChatThreadProvider extends ChangeNotifier {
  final String roomId;
  ChatThreadProvider(this.roomId);

  List<ChatMessageModel> _messages = [];
  bool _isLoading = false;
  bool _loadingOlder = false;
  bool _sending = false;
  String? _error;
  String? _sendError;
  String? _nextCursor; // oldest page boundary (server returns null when done)
  Timer? _poll;

  List<ChatMessageModel> get messages => _messages;
  bool get isLoading => _isLoading;
  bool get loadingOlder => _loadingOlder;
  bool get sending => _sending;
  String? get error => _error;
  String? get sendError => _sendError;
  bool get hasMore => _nextCursor != null && _nextCursor!.isNotEmpty;

  Future<void> load() async {
    _isLoading = true;
    _error = null;
    notifyListeners();
    try {
      final data = await ApiService.getChatMessages(roomId, limit: 50);
      _messages = jsonMapList(data['messages']).map(ChatMessageModel.fromJson).toList();
      _nextCursor = data['nextCursor']?.toString();
      _error = null;
    } catch (e) {
      _error = e.toString().replaceAll('Exception: ', '');
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Older page (cursor pagination — server returns newest-first pages that
  /// it reverses into chronological order per page; we prepend and de-dupe).
  Future<void> loadOlder() async {
    if (!hasMore || _loadingOlder) return;
    _loadingOlder = true;
    notifyListeners();
    try {
      final data = await ApiService.getChatMessages(roomId, cursor: _nextCursor, limit: 50);
      final older = jsonMapList(data['messages']).map(ChatMessageModel.fromJson).toList();
      final known = _messages.map((m) => m.id).toSet();
      _messages = [...older.where((m) => !known.contains(m.id)), ..._messages];
      _nextCursor = data['nextCursor']?.toString();
    } catch (_) {
      // Pulling history failed — keep the current thread usable.
    } finally {
      _loadingOlder = false;
      notifyListeners();
    }
  }

  /// Send a message. The optimistic failure path keeps the draft text in the
  /// UI (sendError) so nothing the user typed is lost; on success the thread
  /// refreshes from the server (single source of truth, like the web page).
  /// Task 121 — [attachments]: files/docs to attach (name/mimeType/sizeBytes/
  /// dataUrl maps). A body-less attachment send auto-fills the body server-side.
  Future<bool> send(String body, {List<Map<String, dynamic>>? attachments}) async {
    final text = body.trim();
    final hasFiles = attachments != null && attachments.isNotEmpty;
    if ((text.isEmpty && !hasFiles) || _sending) return false;
    _sending = true;
    _sendError = null;
    notifyListeners();
    try {
      final data = await ApiService.sendChatMessage(
        roomId,
        text.isEmpty && hasFiles ? attachments.map((a) => '📎 ${a['name'] ?? 'file'}').join('\n') : text,
        attachments: hasFiles ? attachments : null,
      );
      final msg = jsonMap(data['message']);
      if (msg.isNotEmpty) {
        final m = ChatMessageModel.fromJson(msg);
        final known = _messages.map((e) => e.id).toSet();
        if (!known.contains(m.id)) _messages = [..._messages, m];
      }
      _sending = false;
      notifyListeners();
      // Refresh in the background to pick up server-side ordering/threads.
      await load();
      return true;
    } catch (e) {
      _sendError = e.toString().replaceAll('Exception: ', '');
      _sending = false;
      notifyListeners();
      return false;
    }
  }

  void startPolling() {
    _poll?.cancel();
    _poll = Timer.periodic(const Duration(seconds: 12), (_) {
      if (!_isLoading && !_sending) load();
    });
  }

  void stopPolling() {
    _poll?.cancel();
    _poll = null;
  }

  @override
  void dispose() {
    stopPolling();
    super.dispose();
  }
}
