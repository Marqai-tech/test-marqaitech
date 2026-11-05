import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:hrms_app/models/chat.dart';
import 'package:hrms_app/utils/json_safe.dart';

/// Task 121 — Projects ↔ Chat integration + attachments + retention.
/// Contract tests over the exact payload shapes the new endpoints produce:
///   • POST /api/collaboration/chat/rooms/[id]/messages  (attachments in/out)
///   • GET  /api/projects/[id]/files                     (aggregated files)
///   • GET  /api/super-admin/chat-archive                (retention rows)
/// The crash-class rule from Task 116 applies: a deviant payload degrades to
/// an empty parse, never a red screen.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('Task 121 — ChatAttachment parsing (message attachments)', () {
    test('parses the server JSON string shape (name/mimeType/sizeBytes/dataUrl)', () {
      const dataUrl = 'data:application/pdf;base64,JVBERi0xLjQK';
      final msg = ChatMessageModel.fromJson({
        'id': 'm1',
        'roomId': 'r1',
        'senderId': 'e1',
        'body': '📎 spec.pdf',
        'attachments': jsonEncode([
          {'name': 'spec.pdf', 'mimeType': 'application/pdf', 'sizeBytes': 1024, 'dataUrl': dataUrl},
        ]),
        'sender': {'id': 'e1', 'firstName': 'Asha', 'lastName': 'Rao'},
      });
      expect(msg.attachments, hasLength(1));
      expect(msg.attachments.first.name, 'spec.pdf');
      expect(msg.attachments.first.mimeType, 'application/pdf');
      expect(msg.attachments.first.sizeBytes, 1024);
      expect(msg.attachments.first.dataUrl, dataUrl);
      expect(msg.attachments.first.isImage, isFalse);
      expect(msg.attachments.first.bytes, isNotNull); // base64 decodes
    });

    test('already-decoded List payloads parse too (web sends raw arrays)', () {
      final msg = ChatMessageModel.fromJson({
        'id': 'm2',
        'roomId': 'r1',
        'senderId': 'e1',
        'body': 'shot',
        'attachments': [
          {'name': 'photo.png', 'mimeType': 'image/png', 'sizeBytes': 10, 'dataUrl': 'data:image/png;base64,aGVsbG8='},
        ],
      });
      expect(msg.attachments, hasLength(1));
      expect(msg.attachments.first.isImage, isTrue);
      expect(String.fromCharCodes(msg.attachments.first.bytes!), 'hello');
    });

    test('adversarial shapes degrade to empty — never throw', () {
      for (final bad in [null, '', 'null', 'not-json', 42, {'name': 'x'}, [null, 1, 'str']]) {
        final msg = ChatMessageModel.fromJson({'id': 'm3', 'roomId': 'r', 'senderId': 'e', 'body': 'b', 'attachments': bad});
        expect(msg.attachments, anyOf(isEmpty, everyElement(isA<ChatAttachment>())),
            reason: 'attachments=$bad must not throw');
      }
    });

    test('size labels', () {
      const a = ChatAttachment(name: 'a', sizeBytes: 512);
      const b = ChatAttachment(name: 'b', sizeBytes: 2048);
      const c = ChatAttachment(name: 'c', sizeBytes: 3 * 1024 * 1024);
      expect(a.sizeLabel, '512 B');
      expect(b.sizeLabel, '2 KB');
      expect(c.sizeLabel, '3.0 MB');
    });
  });

  group('Task 121 — project files aggregate shape', () {
    test('flat attachment rows parse through ChatAttachment.listFromJson', () {
      // GET /api/projects/[id]/files rows flatten one attachment per entry.
      final rows = [
        {
          'messageId': 'm1',
          'name': 'budget.xlsx',
          'mimeType': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'sizeBytes': 20480,
          'dataUrl': 'data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,UEs=',
          'senderName': 'Vardhani',
          'createdAt': '2026-10-21T10:00:00.000Z',
          'source': 'chat',
        },
        {'messageId': 'm2', 'name': 'no-bytes.pdf', 'sizeBytes': 5, 'source': 'chat'}, // dataUrl missing
      ];
      final files = <ChatAttachment>[];
      for (final raw in jsonList(rows)) {
        final atts = ChatAttachment.listFromJson([raw]);
        if (atts.isEmpty) continue;
        files.add(atts.first);
      }
      expect(files, hasLength(2));
      expect(files.first.name, 'budget.xlsx');
      expect(files.first.bytes, isNotNull);
      expect(files.last.dataUrl, isNull);
      expect(files.last.bytes, isNull);
    });
  });

  group('Task 121 — thread provider sends attachments', () {
    test('ChatMessageModel keeps attachments through fromJson → bubble contract', () {
      // The room screen renders msg.attachments directly; this pins the
      // model-level contract the UI depends on (hasAttachments etc.).
      final withFiles = ChatMessageModel.fromJson({
        'id': 'm9',
        'roomId': 'r',
        'senderId': 'e',
        'body': 'docs',
        'attachments': jsonEncode([
          {'name': 'a.pdf', 'mimeType': 'application/pdf', 'sizeBytes': 3, 'dataUrl': 'data:application/pdf;base64,QQ=='},
        ]),
      });
      final noFiles = ChatMessageModel.fromJson({'id': 'm10', 'roomId': 'r', 'senderId': 'e', 'body': 'plain'});
      expect(withFiles.hasAttachments, isTrue);
      expect(noFiles.hasAttachments, isFalse);
    });
  });
}
