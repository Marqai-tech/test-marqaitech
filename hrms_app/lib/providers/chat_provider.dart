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

  Future<void> _loadDirectory() async {
    try {
      final data = await ApiService.getEmployees(limit: 200);
      final rows = jsonList(data['employees'] is List ? data['employees'] : data['data']);
      final map = <String, ChatDirectoryPerson>{};
      for (final row in rows) {
        final p = ChatDirectoryPerson.fromJson(row);
        if (p.id.isNotEmpty) map[p.id] = p;
      }
      _directory = map;
    } catch (_) {
      // Directory is a name-resolution aid only — never block the room list.
    }
  }

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
  Future<bool> send(String body) async {
    final text = body.trim();
    if (text.isEmpty || _sending) return false;
    _sending = true;
    _sendError = null;
    notifyListeners();
    try {
      final data = await ApiService.sendChatMessage(roomId, text);
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
