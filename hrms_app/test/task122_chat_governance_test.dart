// Task 122 — regression suite: chat governance (who can create / edit /
// delete chats) + soft-delete retention semantics.
//
// What changed:
//   A. CHAT GOVERNANCE SETTINGS — GET/PATCH /api/collaboration/chat/settings
//      returns the tenant toggles (customManagersEnabled, directDeleteEnabled,
//      managerIds) plus the signed-in user's EFFECTIVE permissions. Default
//      posture: only HR/tenant admins manage group chats; every user may
//      delete (hide) their direct chats.
//   B. DELETE CHAT — direct rooms hide per-member (scope 'self'); group rooms
//      soft-delete for everyone (scope 'everyone') with the history retained
//      server-side (Super Admin eDiscovery). A new message resurfaces hidden
//      direct rooms.
//   C. UI GATING — the Group option in the new-chat pickers, the add-members
//      action and the rename/delete menus must follow the effective
//      permissions on BOTH platforms.
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import 'package:hrms_app/models/chat.dart';
import 'package:hrms_app/providers/chat_provider.dart';

/// Records settings/delete/rename calls instead of touching the network;
/// fetchRooms is stubbed so the provider refresh never leaves the process.
class _FakeGovernanceProvider extends ChatRoomsProvider {
  _FakeGovernanceProvider() : super(initialEmployeeId: 'emp-me');

  final List<String> deleteCalls = <String>[];
  final List<(String, String)> renameCalls = <(String, String)>[];
  Map<String, dynamic> settingsResponse = <String, dynamic>{};
  Object? settingsError;

  @override
  Future<void> fetchRooms({bool silent = false}) async {}

  @override
  Future<Map<String, dynamic>> performGetChatSettings() async {
    if (settingsError != null) throw settingsError!;
    return settingsResponse;
  }

  @override
  Future<Map<String, dynamic>> performDeleteChatRoom(String roomId) async {
    deleteCalls.add(roomId);
    return <String, dynamic>{'deleted': true, 'scope': 'everyone'};
  }

  @override
  Future<Map<String, dynamic>> performRenameChatRoom(String roomId, String name) async {
    renameCalls.add((roomId, name));
    return <String, dynamic>{'room': <String, dynamic>{'id': roomId, 'name': name}};
  }
}

ChatRoomsProvider _managerProvider({Map<String, dynamic>? payload}) {
  final p = _FakeGovernanceProvider();
  p.settingsResponse = payload ??
      <String, dynamic>{
        'settings': <String, dynamic>{
          'customManagersEnabled': false,
          'directDeleteEnabled': true,
          'managerIds': <String>['emp-me'],
        },
        'permissions': <String, dynamic>{
          'isChatAdmin': true,
          'isChatManager': true,
          'canCreateGroup': true,
          'canEditGroup': true,
          'canDeleteGroup': true,
          'canDeleteDirect': true,
        },
      };
  return p;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('Task 122 A — ChatGovernance parsing (shape-agnostic)', () {
    test('parses the settings payload into effective permissions', () {
      final g = ChatGovernance.fromJson(<String, dynamic>{
        'settings': <String, dynamic>{
          'customManagersEnabled': true,
          'directDeleteEnabled': false,
          'managerIds': <String>['a', 'b', 'a'],
        },
        'permissions': <String, dynamic>{
          'isChatAdmin': false,
          'isChatManager': true,
          'canCreateGroup': true,
          'canEditGroup': true,
          'canDeleteGroup': true,
          'canDeleteDirect': false,
        },
      });
      expect(g.customManagersEnabled, isTrue);
      expect(g.directDeleteEnabled, isFalse);
      expect(g.managerIds, <String>['a', 'b']);
      expect(g.isChatManager, isTrue);
      expect(g.canCreateGroup, isTrue);
      expect(g.canDeleteDirect, isFalse);
    });

    test('deviant payloads degrade to safe defaults (no throw)', () {
      final g = ChatGovernance.fromJson(<String, dynamic>{'settings': 'garbage', 'permissions': 42});
      expect(g.canCreateGroup, isFalse);
      expect(g.canDeleteDirect, isTrue);
      expect(g.managerIds, isEmpty);
    });

    test('loading defaults keep group actions OFF and direct delete ON', () {
      const g = ChatGovernance.loading;
      expect(g.canCreateGroup, isFalse);
      expect(g.canEditGroup, isFalse);
      expect(g.canDeleteGroup, isFalse);
      expect(g.canDeleteDirect, isTrue);
    });
  });

  group('Task 122 A — provider governance load', () {
    test('loads effective permissions from the settings endpoint', () async {
      final p = _managerProvider();
      await p.fetchChatSettings();
      expect(p.canCreateGroup, isTrue);
      expect(p.canEditGroup, isTrue);
      expect(p.canDeleteGroup, isTrue);
      expect(p.canDeleteDirect, isTrue);
    });

    test('a settings failure keeps the conservative defaults (server still enforces)', () async {
      final p = _FakeGovernanceProvider();
      p.settingsError = Exception('boom');
      await p.fetchChatSettings();
      expect(p.canCreateGroup, isFalse);
      expect(p.canDeleteDirect, isTrue);
    });
  });

  group('Task 122 B — delete / rename via the provider', () {
    test('deleteRoom returns the server scope and refreshes the list', () async {
      final p = _FakeGovernanceProvider();
      final scope = await p.deleteRoom('room-1');
      expect(scope, 'everyone');
      expect(p.deleteCalls, <String>['room-1']);
    });

    test('renameRoom calls the PATCH endpoint with the new name', () async {
      final p = _FakeGovernanceProvider();
      await p.renameRoom('room-1', 'New Name');
      expect(p.renameCalls, hasLength(1));
      expect(p.renameCalls.first.$1, 'room-1');
      expect(p.renameCalls.first.$2, 'New Name');
    });
  });

  group('Task 122 C — SOURCE CONTRACT: mobile UI gating', () {
    test('new-chat sheet hides the Group option without create rights', () {
      final src = File('lib/screens/chat/chat_home_screen.dart').readAsStringSync();
      expect(src.contains('if (chat.canCreateGroup)'), isTrue,
          reason: 'the Group toggle must be gated on the effective permission');
      expect(src.contains('_showRoomActions'), isTrue,
          reason: 'long-press must open the room actions sheet');
      expect(src.contains("canDelete = isDirect ? chat.canDeleteDirect : chat.canDeleteGroup"), isTrue,
          reason: 'delete visibility must follow the governance split');
      expect(src.contains('_confirmDelete'), isTrue);
    });

    test('room screen carries the governance actions menu', () {
      final src = File('lib/screens/chat/chat_room_screen.dart').readAsStringSync();
      expect(src.contains('PopupMenuButton<String>'), isTrue,
          reason: 'the thread screen needs the chat-actions menu');
      expect(src.contains('_deleteChat'), isTrue);
      expect(src.contains('_renameChat'), isTrue);
      expect(src.contains('rooms.canEditGroup'), isTrue,
          reason: 'add-members + rename must be manager-gated in the app bar');
    });

    test('api service exposes the governance endpoints', () {
      final svc = File('lib/services/api_service.dart').readAsStringSync();
      expect(svc.contains('getChatSettings'), isTrue);
      expect(svc.contains('deleteChatRoom'), isTrue);
      expect(svc.contains('renameChatRoom'), isTrue);
      final cfg = File('lib/config/api_config.dart').readAsStringSync();
      expect(cfg.contains('chatSettings'), isTrue);
      expect(cfg.contains('chatRoom('), isTrue);
    });
  });

  group('Task 122 D — SOURCE CONTRACT: server governance', () {
    test('rooms POST gates non-direct creation behind canCreateGroup', () {
      final src = File('../src/app/api/collaboration/chat/rooms/route.ts').readAsStringSync();
      expect(src.contains("if (roomType !== 'direct')"), isTrue);
      expect(src.contains('canCreateGroup'), isTrue);
      expect(src.contains('isHidden: false'), isTrue,
          reason: 'the room list must exclude rooms hidden by their member');
    });

    test('rooms [id] route implements soft-delete + rename', () {
      final src = File('../src/app/api/collaboration/chat/rooms/[id]/route.ts').readAsStringSync();
      expect(src.contains('isActive: false, deletedAt: new Date(), deletedBy: employee.id'), isTrue,
          reason: 'group deletions must soft-delete with an audit stamp');
      expect(src.contains("scope: 'self'"), isTrue,
          reason: 'direct deletions hide only the caller copy');
      expect(src.contains('canDeleteDirect'), isTrue);
      expect(src.contains('canEditGroup'), isTrue);
    });

    test('chat governance settings route exists with admin-only PATCH', () {
      final src = File('../src/app/api/collaboration/chat/settings/route.ts').readAsStringSync();
      expect(src.contains('CHAT_ADMIN_ROLES'), isTrue);
      expect(src.contains('CHAT_GOVERNANCE_UPDATE'), isTrue, reason: 'deletions/changes must hit the audit log');
      expect(src.contains('chatDirectDeleteEnabled'), isTrue);
    });

    test('messages POST blocks deleted rooms and resurfaces hidden ones', () {
      final src = File('../src/app/api/collaboration/chat/rooms/[id]/messages/route.ts').readAsStringSync();
      expect(src.contains("'This chat was deleted'"), isTrue,
          reason: 'deactivated rooms must reject new messages');
      expect(src.contains('isHidden: true'), isTrue,
          reason: 'a new message must clear the hidden flag');
    });

    test('members POST is a manager-only edit right', () {
      final src = File('../src/app/api/collaboration/chat/rooms/[id]/members/route.ts').readAsStringSync();
      expect(src.contains('canEditGroup'), isTrue);
      expect(src.contains('Only HR/tenant admins (or selected chat managers) can add people to chats'), isTrue);
    });

    test('permissions lib defaults match the requested safety posture', () {
      final src = File('../src/lib/chat-permissions.ts').readAsStringSync();
      expect(src.contains("['tenant_admin', 'ceo', 'admin', 'hr_admin', 'company_hr_admin']"), isTrue,
          reason: 'HR admin + tenant admin (+ CEO since Task 129) are the default chat managers');
      expect(src.contains('directDeleteEnabled: row.chatDirectDeleteEnabled !== false'), isTrue,
          reason: 'direct delete defaults to ON');
      expect(src.contains('customManagersEnabled: row.chatCustomManagersEnabled === true'), isTrue,
          reason: 'custom managers default to OFF');
    });
  });
}
