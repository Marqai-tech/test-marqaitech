// Task 120 — regression suite: group-chat member growth + terminated-employee
// visibility rules.
//
// TWO fixes under test:
//   A. ADD MEMBERS after creation — a group chat created with N people used to
//      be frozen at N forever. Now the room screen carries an "Add members"
//      action (group rooms only — direct chats stay 1:1), backed by
//      POST /api/collaboration/chat/rooms/[id]/members, surfaced through
//      ChatRoomsProvider.addMembers (which reports added + skipped reasons).
//   B. TERMINATED EMPLOYEES HIDDEN — separated staff (terminated / resigned /
//      inactive) must not surface in the Chat / Leave / Attendance / Projects
//      modules: the server supports ?excludeInactive=true on /api/employees,
//      every module picker sends it, models re-guard client-side, and the
//      projects team tab drops allocations of separated employees.
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import 'package:hrms_app/models/chat.dart';
import 'package:hrms_app/models/project.dart';
import 'package:hrms_app/providers/chat_provider.dart';

/// Records add-member calls instead of touching the network; fetchRooms is
/// stubbed so the provider refresh never leaves the test process.
class _FakeAddMembersProvider extends ChatRoomsProvider {
  _FakeAddMembersProvider() : super(initialEmployeeId: 'emp-me');

  final List<(String, List<String>)> calls = [];

  @override
  Future<void> fetchRooms({bool silent = false}) async {}

  @override
  Future<Map<String, dynamic>> performAddMembers(String roomId, List<String> memberIds) async {
    calls.add((roomId, memberIds));
    return {
      'room': {'id': roomId, 'memberCount': 3},
      'added': memberIds.length,
      'addedIds': memberIds,
      'skipped': [
        {'id': 'emp-terminated', 'reason': 'Employee is separated (terminated/resigned/inactive)'},
      ],
    };
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('Task 120 A — add members to an existing group chat', () {
    test('addMembers delegates to the members endpoint and reports added/skipped', () async {
      final provider = _FakeAddMembersProvider();
      final (added, skipped) = await provider.addMembers('room-1', ['emp-a', 'emp-b']);
      expect(added, 2);
      expect(skipped, hasLength(1));
      expect(skipped.first['reason'], contains('separated'));
      expect(provider.calls, hasLength(1));
      expect(provider.calls.first.$1, 'room-1');
      expect(provider.calls.first.$2, ['emp-a', 'emp-b']);
    });

    test('addMembers short-circuits on an empty selection (no network call)', () async {
      final provider = _FakeAddMembersProvider();
      final (added, skipped) = await provider.addMembers('room-1', []);
      expect(added, 0);
      expect(skipped, isEmpty);
      expect(provider.calls, isEmpty);
    });

    test('SOURCE CONTRACT — room screen: add-members action is group-only and the sheet exists',
        () async {
      final src = File('lib/screens/chat/chat_room_screen.dart').readAsStringSync();
      expect(src.contains('_showAddMembersSheet'), isTrue,
          reason: 'the thread screen must open the add-members sheet');
      // Task 122 — the action is additionally gated on chat-manager rights
      // (rooms.canEditGroup); direct rooms still never offer it.
      expect(src.contains("if (!widget.room.isDirect && rooms.canEditGroup)"), isTrue,
          reason: 'direct 1:1 chats must NOT offer member additions');
      expect(src.contains('_AddMembersSheet'), isTrue,
          reason: 'the picker sheet must live alongside the room screen');
      expect(src.contains('existingMemberIds'), isTrue,
          reason: 'the sheet must exclude people already in the room');
      expect(src.contains('Icons.person_add_alt_1_rounded'), isTrue,
          reason: 'the AppBar action icon (user-visible affordance)');
    });

    test('SOURCE CONTRACT — ApiService talks to POST rooms/[id]/members', () async {
      final api = File('lib/services/api_service.dart').readAsStringSync();
      expect(api.contains('addChatRoomMembers'), isTrue);
      final cfg = File('lib/config/api_config.dart').readAsStringSync();
      expect(cfg.contains('chatRoomMembers(String roomId)'), isTrue,
          reason: 'ApiConfig must build the rooms/[id]/members URL');
      expect(cfg.contains("rooms/\$roomId/members"), isTrue);
    });
  });

  group('Task 120 B — separated employees hidden from module pickers', () {
    test('ChatDirectoryPerson parses status and flags terminated/resigned/inactive', () {
      ChatDirectoryPerson person(String? status) => ChatDirectoryPerson.fromJson({
            'id': 'emp-1',
            'firstName': 'Test',
            'lastName': 'Person',
            if (status != null) 'status': status,
          });

      expect(person('terminated').isInactive, isTrue, reason: 'terminated must be hidden');
      expect(person('resigned').isInactive, isTrue, reason: 'resigned must be hidden');
      expect(person('INACTIVE').isInactive, isTrue, reason: 'status comparisons are case-insensitive');
      expect(person('terminated').isInactive, isTrue);
      expect(person('active').isInactive, isFalse);
      expect(person('on_leave').isInactive, isFalse,
          reason: 'on_leave is still employed — must remain visible');
      expect(person(null).isInactive, isFalse,
          reason: 'older payloads without status must never hide people');
    });

    test('ProjectTeamMemberModel parses nested employee status and flags separated staff', () {
      final terminated = ProjectTeamMemberModel.fromJson({
        'id': 'alloc-1',
        'role': 'developer',
        'allocationPct': 50,
        'status': 'active',
        'employee': {'id': 'emp-t', 'firstName': 'Ex', 'lastName': 'Staff', 'status': 'terminated'},
      });
      expect(terminated.employeeId, 'emp-t');
      expect(terminated.employeeName, 'Ex Staff');
      expect(terminated.employeeStatus, 'terminated');
      expect(terminated.employeeIsInactive, isTrue);

      final active = ProjectTeamMemberModel.fromJson({
        'id': 'alloc-2',
        'employee': {'id': 'emp-a', 'firstName': 'Live', 'lastName': 'Staff', 'status': 'active'},
      });
      expect(active.employeeIsInactive, isFalse);

      final legacy = ProjectTeamMemberModel.fromJson({'id': 'alloc-3', 'allocationPct': 10});
      expect(legacy.employeeStatus, isNull);
      expect(legacy.employeeIsInactive, isFalse, reason: 'legacy allocations without nested employee stay visible');
    });

    test('SOURCE CONTRACT — every module picker sends excludeInactive + client-side guard', () async {
      // Chat: silent name-resolution directory + Directory tab + New-chat sheet.
      final chatProvider = File('lib/providers/chat_provider.dart').readAsStringSync();
      expect(chatProvider.contains('excludeInactive: true'), isTrue,
          reason: 'chat directory loads must filter separated employees server-side');
      expect(chatProvider.contains('!p.isInactive'), isTrue,
          reason: 'and re-guard client-side');
      expect(chatProvider.contains('performAddMembers'), isTrue,
          reason: 'addMembers must have the test seam');

      final chatHome = File('lib/screens/chat/chat_home_screen.dart').readAsStringSync();
      expect(chatHome.contains('excludeInactive: true'), isTrue,
          reason: 'the New-chat sheet must filter separated employees');

      // Leave: apply-for-employee picker.
      final leave = File('lib/screens/leaves/leave_home_screen.dart').readAsStringSync();
      expect(leave.contains('excludeInactive: true'), isTrue,
          reason: 'the leave employee picker must filter separated employees');

      // Projects: add-member sheet.
      final project = File('lib/screens/projects/project_detail_screen.dart').readAsStringSync();
      expect(project.contains('excludeInactive: true'), isTrue,
          reason: 'the project member picker must filter separated employees');
      expect(project.contains('!p.isInactive'), isTrue);

      // Projects: team tab drops allocations of separated employees.
      final provider = File('lib/providers/project_provider.dart').readAsStringSync();
      expect(provider.contains('employeeIsInactive'), isTrue,
          reason: 'the provider must drop separated-staff allocations');
    });

    test('SOURCE CONTRACT — server: /api/employees supports excludeInactive', () async {
      final employees = File('../src/app/api/employees/route.ts').readAsStringSync();
      expect(employees.contains("searchParams.get('excludeInactive')"), isTrue,
          reason: 'the employees API must accept the excludeInactive flag');
      expect(employees.contains('notIn: INACTIVE_STATUSES'), isTrue,
          reason: 'the flag must exclude the inactive status set');
    });

    test('SOURCE CONTRACT — server: rooms/[id]/members endpoint exists with the right rules', () async {
      final members = File('../src/app/api/collaboration/chat/rooms/[id]/members/route.ts').readAsStringSync();
      expect(members.contains('export async function POST'), isTrue, reason: 'add members');
      expect(members.contains('export async function GET'), isTrue, reason: 'list members');
      expect(members.contains("room.roomType === 'direct'"), isTrue,
          reason: 'direct rooms must refuse member additions');
      expect(members.contains("INACTIVE.has"), isTrue,
          reason: 'separated employees must be rejected server-side too');
      expect(members.contains('Already a member'), isTrue,
          reason: 'duplicate adds must be reported, not crash on @@unique');
    });

    test('SOURCE CONTRACT — web chat page: add-members modal + excludeInactive fetch', () async {
      final page = File('../src/app/(dashboard)/collaboration/chat/page.tsx').readAsStringSync();
      expect(page.contains('showAddMembersModal'), isTrue, reason: 'web must have the add-members modal');
      expect(page.contains('handleAddMembers'), isTrue);
      expect(page.contains('excludeInactive=true'), isTrue,
          reason: 'the web new-chat/add-members fetch must filter separated employees');
      expect(page.contains("selectedRoom.roomType !== 'direct'"), isTrue,
          reason: 'web add-members button is group-only');
    });

    test('SOURCE CONTRACT — web leave/projects pickers send excludeInactive', () async {
      final leave = File('../src/app/(dashboard)/leave/apply-by-hr/page.tsx').readAsStringSync();
      expect(leave.contains('excludeInactive=true'), isTrue);
      final projectDetail = File('../src/app/(dashboard)/projects/[id]/page.tsx').readAsStringSync();
      expect(projectDetail.contains('excludeInactive=true'), isTrue);
      final capacity = File('../src/app/(dashboard)/projects/capacity/page.tsx').readAsStringSync();
      expect(capacity.contains('excludeInactive=true'), isTrue);
    });
  });
}
