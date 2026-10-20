// Task 117 — regression tests for the Collaboration Chat module.
//
// Three defense layers, mirroring the Task 116 pattern that killed the
// `List<dynamic> is not a subtype` crash class:
//   1. REAL payloads captured from the demo workspace (probe-created group
//      room + message) parsed via the exact helpers the providers use.
//   2. The provider-side parse blocks replicated shape-for-shape
//      (ChatRoomsProvider.fetchRooms / ChatThreadProvider.load).
//   3. Adversarial shapes (rooms as Map, members as Map, messages as list of
//      IDs, sender as string, _count as string, unreadCount as string,
//      replies as scalar, null room, nested-room member blocks…) — every one
//      must degrade to defaults, never throw.
//
// Identity contract regression: ChatRoomMember.userId and message senderId
// are EMPLOYEE ids — the tests pin the model fields so nobody re-points them
// at the User-table id (which would mis-align own bubbles + direct names).
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:hrms_app/models/chat.dart';
import 'package:hrms_app/utils/json_safe.dart';

Map<String, dynamic> _fixture(String name) =>
    jsonDecode(File('test/fixtures/$name').readAsStringSync()) as Map<String, dynamic>;

/// Mirrors ChatRoomsProvider.fetchRooms()'s parse block.
List<ChatRoomModel> _parseRooms(Map<String, dynamic> data) =>
    jsonMapList(data['rooms']).map(ChatRoomModel.fromJson).toList();

/// Mirrors ChatThreadProvider.load()'s parse block.
List<ChatMessageModel> _parseMessages(Map<String, dynamic> data) =>
    jsonMapList(data['messages']).map(ChatMessageModel.fromJson).toList();

void main() {
  group('Task 117 — REAL demo payload (probe group room + message)', () {
    test('rooms payload parses: name, members, preview, counts', () {
      final rooms = _parseRooms(_fixture('chat_rooms.json'));
      expect(rooms, isNotEmpty);
      final r = rooms.firstWhere((r) => r.name == 'Mobile Probe Group');
      expect(r.id, isNotEmpty);
      expect(r.roomType, 'group');
      expect(r.isDirect, isFalse);
      expect(r.members.length, 2);
      expect(r.messageCount, 1);
      expect(r.lastMessage, isNotNull);
      expect(r.lastMessage!.body, contains('Task 117 fixture capture'));
      // member userIds are employee ids (cuid-shaped), never empty
      for (final m in r.members) {
        expect(m.userId, isNotEmpty);
        expect(m.role, isIn(['admin', 'member']));
      }
    });

    test('messages payload parses: sender block + chronological order + empty replies', () {
      final msgs = _parseMessages(_fixture('chat_messages.json'));
      expect(msgs, isNotEmpty);
      final m = msgs.first;
      expect(m.id, isNotEmpty);
      expect(m.roomId, isNotEmpty);
      expect(m.senderId, isNotEmpty);
      expect(m.body, isNotEmpty);
      expect(m.sender.id, m.senderId);
      expect(m.sender.fullName, isNotEmpty);
      expect(m.dlpStatus, 'clean');
      expect(m.replies, isEmpty);
      // chronological
      for (var i = 1; i < msgs.length; i++) {
        expect(msgs[i].createdAt!.compareTo(msgs[i - 1].createdAt!), isNonNegative);
      }
    });

    test('direct room naming falls back without directory (no crash)', () {
      final rooms = _parseRooms(_fixture('chat_rooms.json'));
      expect(rooms.first.name, isNotNull);
    });
  });

  group('Task 117 — identity contract (employee-id keyspace)', () {
    test('member userId + senderId parse as employee ids, not user ids', () {
      final msg = ChatMessageModel.fromJson({
        'id': 'm1',
        'roomId': 'r1',
        'senderId': 'emp-abc',
        'body': 'hi',
        'createdAt': '2026-10-20T10:00:00.000Z',
        'sender': {'id': 'emp-abc', 'firstName': 'Vardhani', 'lastName': 'D', 'email': 'hr@x.com'},
      });
      expect(msg.senderId, 'emp-abc');
      expect(msg.sender.id, 'emp-abc');
      expect(msg.sender.fullName, 'Vardhani D');
    });
  });

  group('Task 117 — adversarial shapes (must degrade, never throw)', () {
    test('rooms missing entirely / rooms as Map / rooms as scalar list', () {
      expect(_parseRooms({}), isEmpty);
      expect(_parseRooms({'rooms': {'id': 'r1'}}), isEmpty); // map instead of list
      expect(_parseRooms({'rooms': ['x', 1, null]}), isEmpty); // scalar elements dropped
    });

    test('room as scalar / null room entries are dropped', () {
      final rooms = _parseRooms({'rooms': [null, 'junk', {'id': 'r1', 'roomType': 'direct'}]});
      expect(rooms.length, 1);
      expect(rooms.first.id, 'r1');
      expect(rooms.first.isDirect, isTrue);
    });

    test('members as Map instead of List → empty members, room still parses', () {
      final rooms = _parseRooms({'rooms': [
        {'id': 'r1', 'roomType': 'group', 'members': {'userId': 'x'}},
      ]});
      expect(rooms.first.members, isEmpty);
    });

    test('unreadCount as string and _count.messages as string', () {
      final r = ChatRoomModel.fromJson({
        'id': 'r1',
        'roomType': 'group',
        'unreadCount': '7',
        '_count': {'messages': '12'},
        'messages': [{'id': 'm1', 'body': 'x', 'createdAt': '2026-10-20T10:00:00.000Z'}],
      });
      expect(r.unreadCount, 7);
      expect(r.messageCount, 12);
      expect(r.lastMessage!.body, 'x');
    });

    test('messages as Map / list of ids / null elements degrade to empty', () {
      expect(_parseMessages({'messages': {'id': 'm1'}}), isEmpty);
      expect(_parseMessages({'messages': ['id1', 'id2']}), isEmpty);
      expect(_parseMessages({'messages': [null, {'id': 'm1', 'roomId': 'r1', 'senderId': 'e1', 'body': 'b'}]}).length, 1);
    });

    test('sender as string instead of object → id kept for alignment, name falls back', () {
      final msgs = _parseMessages({'messages': [
        {'id': 'm1', 'roomId': 'r1', 'senderId': 'e1', 'body': 'hello', 'sender': 'not-an-object'},
      ]});
      // The scalar string is preserved as the id (identity survives for
      // own-message alignment) while the NAME degrades to the fallback.
      expect(msgs.first.sender.id, 'not-an-object');
      expect(msgs.first.body, 'hello');
      expect(msgs.first.sender.fullName, 'Teammate'); // graceful fallback
    });

    test('replies as scalar → empty; replyCount string parses', () {
      final m = ChatMessageModel.fromJson({
        'id': 'm1',
        'roomId': 'r1',
        'senderId': 'e1',
        'body': 'thread starter',
        'replies': 'junk',
        'replyCount': '3',
      });
      expect(m.replies, isEmpty);
      expect(m.replyCount, 3);
      expect(m.isThreadStarter, isTrue);
    });

    test('nested member room blocks and string lastReadAt parse safely', () {
      final r = ChatRoomModel.fromJson({
        'id': 'r1',
        'roomType': 'direct',
        'members': [
          {
            'userId': 'emp-1',
            'role': 'admin',
            'lastReadAt': '2026-10-20T10:00:00.000Z',
            'room': {'id': 'r1', 'name': null, 'roomType': 'direct'},
          },
        ],
      });
      expect(r.members.first.userId, 'emp-1');
      expect(r.members.first.lastReadAt, isNotNull);
      expect(r.isE2EE, isFalse); // absent → false, not crash
    });

    test('announcement + E2EE flags respect real booleans only', () {
      final r = ChatRoomModel.fromJson({'id': 'r1', 'roomType': 'announcement', 'isAnnouncement': true, 'isE2EE': true});
      expect(r.isAnnouncementRoom, isTrue);
      expect(r.isE2EE, isTrue);
      final r2 = ChatRoomModel.fromJson({'id': 'r2', 'roomType': 'group', 'isAnnouncement': 'yes'});
      expect(r2.isAnnouncementRoom, isFalse); // string 'yes' is NOT true
    });

    test('sender initials for avatar fallback', () {
      final s = ChatSenderRef.fromJson({'id': 'e1', 'firstName': 'Manoj', 'lastName': 'Kumar'});
      expect(s.initials, 'MK');
      final s2 = ChatSenderRef.fromJson({'id': 'e2', 'firstName': 'Cher'});
      expect(s2.initials, 'C');
    });
  });
}
