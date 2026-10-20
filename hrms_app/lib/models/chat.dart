import '../utils/json_safe.dart';

/// Task 117 — Collaboration Chat models (mobile parity with the web
/// Collaboration → Chat module). These parse the EXACT payloads produced by:
///   • GET  /api/collaboration/chat/rooms
///   • GET  /api/collaboration/chat/rooms/[id]/messages
///   • POST /api/collaboration/chat/rooms
///   • POST /api/collaboration/chat/rooms/[id]/messages
/// Every collection/nested-object read goes through the shape-agnostic
/// json_safe helpers (Task 116 crash-class kill-switch) so a deviant payload
/// degrades to an empty section instead of a red screen.
///
/// IMPORTANT identity note: ChatRoomMember.userId and ChatMessage.senderId
/// are EMPLOYEE ids (Employee table), NOT User ids. The signed-in employee id
/// comes from ApiService.resolveOwnEmployeeId() — never compare against the
/// auth user id (the User-table id), which is a different keyspace.

class ChatMemberRef {
  final String userId; // Employee id
  final String role; // admin | member
  final String? lastReadAt;

  const ChatMemberRef({required this.userId, this.role = 'member', this.lastReadAt});

  factory ChatMemberRef.fromJson(dynamic raw) {
    final m = jsonMap(raw);
    return ChatMemberRef(
      userId: (m['userId'] ?? m['id'] ?? '').toString(),
      role: (m['role'] ?? 'member').toString(),
      lastReadAt: m['lastReadAt']?.toString(),
    );
  }
}

class ChatSenderRef {
  final String id; // Employee id
  final String firstName;
  final String lastName;
  final String? avatar;
  final String? email;

  const ChatSenderRef({
    required this.id,
    this.firstName = '',
    this.lastName = '',
    this.avatar,
    this.email,
  });

  String get fullName => '$firstName $lastName'.trim().isEmpty
      ? (email ?? 'Teammate')
      : '$firstName $lastName'.trim();

  String get initials {
    final a = firstName.isNotEmpty ? firstName[0] : '';
    final b = lastName.isNotEmpty ? lastName[0] : '';
    final s = '$a$b'.toUpperCase();
    return s.isEmpty ? '?' : s;
  }

  factory ChatSenderRef.fromJson(dynamic raw) {
    final m = jsonMap(raw);
    return ChatSenderRef(
      id: (m['id'] ?? '').toString(),
      firstName: (m['firstName'] ?? '').toString(),
      lastName: (m['lastName'] ?? '').toString(),
      avatar: m['avatar']?.toString(),
      email: m['email']?.toString(),
    );
  }
}

class ChatRoomModel {
  final String id;
  final String? name; // null for direct rooms
  final String roomType; // direct | group | project | team | announcement
  final bool isE2EE;
  final bool isAnnouncement;
  final String? avatarUrl;
  final String? description;
  final String? lastMessageAt;
  final String? createdAt;
  final List<ChatMemberRef> members;
  final ChatMessageModel? lastMessage; // preview from the rooms payload
  final int messageCount;
  final int unreadCount;

  const ChatRoomModel({
    required this.id,
    this.name,
    required this.roomType,
    this.isE2EE = false,
    this.isAnnouncement = false,
    this.avatarUrl,
    this.description,
    this.lastMessageAt,
    this.createdAt,
    this.members = const [],
    this.lastMessage,
    this.messageCount = 0,
    this.unreadCount = 0,
  });

  bool get isDirect => roomType == 'direct';
  bool get isAnnouncementRoom => isAnnouncement || roomType == 'announcement';

  factory ChatRoomModel.fromJson(dynamic raw) {
    final m = jsonMap(raw);
    final countBlock = jsonMap(m['_count']);
    dynamic unread = m['unreadCount'];
    dynamic mc = countBlock['messages'];
    final members = jsonMapList(m['members']).map(ChatMemberRef.fromJson).toList();
    final previews = jsonMapList(m['messages']);
    return ChatRoomModel(
      id: (m['id'] ?? '').toString(),
      name: m['name']?.toString(),
      roomType: (m['roomType'] ?? 'group').toString(),
      isE2EE: m['isE2EE'] == true,
      isAnnouncement: m['isAnnouncement'] == true,
      avatarUrl: m['avatarUrl']?.toString(),
      description: m['description']?.toString(),
      lastMessageAt: m['lastMessageAt']?.toString(),
      createdAt: m['createdAt']?.toString(),
      members: members,
      lastMessage: previews.isEmpty ? null : ChatMessageModel.fromJson(previews.last),
      messageCount: mc is num
          ? mc.toInt()
          : (int.tryParse(mc?.toString() ?? '') ?? previews.length),
      unreadCount: unread is num ? unread.toInt() : (int.tryParse(unread?.toString() ?? '') ?? 0),
    );
  }
}

class ChatMessageModel {
  final String id;
  final String roomId;
  final String senderId; // Employee id
  final String body;
  final String? parentMessageId;
  final String? createdAt;
  final String dlpStatus; // clean | flagged | blocked
  final String? dlpReason;
  final bool isEdited;
  final bool isDeleted;
  final ChatSenderRef sender;
  final List<ChatMessageModel> replies;
  final int replyCount;

  const ChatMessageModel({
    required this.id,
    required this.roomId,
    required this.senderId,
    required this.body,
    this.parentMessageId,
    this.createdAt,
    this.dlpStatus = 'clean',
    this.dlpReason,
    this.isEdited = false,
    this.isDeleted = false,
    this.sender = const ChatSenderRef(id: ''),
    this.replies = const [],
    this.replyCount = 0,
  });

  bool get isFlagged => dlpStatus == 'flagged' || dlpStatus == 'blocked';
  bool get isThreadStarter => replyCount > 0 || replies.isNotEmpty;

  factory ChatMessageModel.fromJson(dynamic raw) {
    final m = jsonMap(raw);
    final countBlock = jsonMap(m['_count']);
    final replies = jsonMapList(m['replies']).map(ChatMessageModel.fromJson).toList();
    dynamic rc = m['replyCount'];
    final senderRaw = m['sender'];
    // Adversarial safety: sender may arrive as a scalar/string in broken
    // payloads — degrade to an empty ref instead of throwing.
    final sender = senderRaw is Map
        ? ChatSenderRef.fromJson(senderRaw)
        : ChatSenderRef(id: senderRaw?.toString() ?? '');
    return ChatMessageModel(
      id: (m['id'] ?? '').toString(),
      roomId: (m['roomId'] ?? '').toString(),
      senderId: (m['senderId'] ?? '').toString(),
      body: (m['body'] ?? '').toString(),
      parentMessageId: m['parentMessageId']?.toString(),
      createdAt: m['createdAt']?.toString(),
      dlpStatus: (m['dlpStatus'] ?? 'clean').toString(),
      dlpReason: m['dlpReason']?.toString(),
      isEdited: m['isEdited'] == true,
      isDeleted: m['isDeleted'] == true,
      sender: sender,
      replies: replies,
      replyCount: rc is num
          ? rc.toInt()
          : (int.tryParse(rc?.toString() ?? '') ?? (countBlock['replies'] is num ? (countBlock['replies'] as num).toInt() : replies.length)),
    );
  }
}

/// Lightweight directory entry used by the New-Chat member picker and for
/// resolving direct-room display names (the rooms payload carries only
/// member employee IDs, never names).
class ChatDirectoryPerson {
  final String id; // Employee id
  final String firstName;
  final String lastName;
  final String? email;
  final String? avatar;
  final String? department;

  const ChatDirectoryPerson({
    required this.id,
    this.firstName = '',
    this.lastName = '',
    this.email,
    this.avatar,
    this.department,
  });

  String get fullName => '$firstName $lastName'.trim().isEmpty
      ? (email ?? 'Teammate')
      : '$firstName $lastName'.trim();

  factory ChatDirectoryPerson.fromJson(dynamic raw) {
    final m = jsonMap(raw);
    final dept = jsonMap(m['department']);
    return ChatDirectoryPerson(
      id: (m['id'] ?? '').toString(),
      firstName: (m['firstName'] ?? '').toString(),
      lastName: (m['lastName'] ?? '').toString(),
      email: m['email']?.toString(),
      avatar: m['avatar']?.toString(),
      department: (dept['name'] ?? m['department'])?.toString(),
    );
  }
}
