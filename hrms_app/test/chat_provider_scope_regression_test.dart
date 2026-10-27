// Task 119 — the "empty chat screen" regression suite.
//
// ROOT CAUSE (v1.5.1 and earlier): ChatRoomsProvider was created INSIDE
// ChatHomeScreen's build (route-local scope), but ChatRoomScreen is pushed as
// its OWN Navigator route — a sibling branch of the widget tree. Its
// context.watch<ChatRoomsProvider>() therefore threw ProviderNotFoundException
// and release builds rendered a GREY/EMPTY screen whenever the user tapped a
// teammate (or any existing room).
//
// FIX UNDER TEST: ChatRoomsProvider lives at APP scope (main.dart
// MultiProvider); ChatHomeScreen only kicks the first fetch. These tests pin
// the contract from every side, fully offline (fake thread provider — no
// sockets inside testWidgets):
//   1. An app-scoped provider is visible from the home route AND a route
//      pushed afterwards — the SAME instance.
//   2. ChatRoomScreen, pushed exactly as the app pushes it, renders its
//      header + designed thread states (empty state with greeting chips).
//   3. ChatHomeScreen no longer creates a route-local provider.
//   4. Direct-room naming degrades gracefully without a directory.
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

import 'package:hrms_app/models/chat.dart';
import 'package:hrms_app/providers/chat_provider.dart';
import 'package:hrms_app/screens/chat/chat_room_screen.dart';

ChatRoomModel _directRoom() => ChatRoomModel(
      id: 'room-task119',
      roomType: 'direct',
      isE2EE: true,
      createdAt: '2026-10-21T09:00:00.000Z',
      members: const [
        ChatMemberRef(userId: 'emp-me'),
        ChatMemberRef(userId: 'emp-peer'),
      ],
    );

/// Deterministic thread state: load()/send() complete instantly, no network.
class _FakeThreadProvider extends ChatThreadProvider {
  _FakeThreadProvider(super.roomId);

  int loadCount = 0;
  final List<String> sent = [];

  @override
  Future<void> load() async {
    loadCount++;
    notifyListeners();
  }

  @override
  Future<bool> send(String body, {List<Map<String, dynamic>>? attachments}) async {
    sent.add(attachments == null || attachments.isEmpty ? body : '$body+${attachments.length}file(s)');
    notifyListeners();
    return true;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets(
      'Task 119 — app-scoped ChatRoomsProvider is visible (same instance) from the home route AND a route pushed afterwards',
      (tester) async {
    final provider = ChatRoomsProvider();
    ChatRoomsProvider? seenFromHomeRoute;
    ChatRoomsProvider? seenFromPushedRoute;

    await tester.pumpWidget(
      ChangeNotifierProvider<ChatRoomsProvider>.value(
        value: provider,
        child: MaterialApp(
          home: Builder(
            builder: (context) {
              seenFromHomeRoute = context.read<ChatRoomsProvider>();
              return const SizedBox.shrink();
            },
          ),
        ),
      ),
    );

    // Push a NEW route — the exact geometry that used to break the room
    // screen (provider invisible from sibling routes).
    tester.state<NavigatorState>(find.byType(Navigator)).push(
          MaterialPageRoute(
            builder: (_) => Builder(
              builder: (context) {
                seenFromPushedRoute = context.read<ChatRoomsProvider>();
                return const SizedBox.shrink();
              },
            ),
          ),
        );
    await tester.pumpAndSettle();

    expect(seenFromHomeRoute, same(provider),
        reason: 'ChatHomeScreen must consume the app-scoped provider');
    expect(seenFromPushedRoute, same(provider),
        reason:
            'A route pushed afterwards must still resolve the SAME app-scoped provider (Task 119 grey-screen regression)');
  });

  testWidgets(
      'Task 119 — ChatRoomScreen pushed as its own route renders header + empty-thread state with greeting chips (no ProviderNotFoundException)',
      (tester) async {
    _FakeThreadProvider? injected;

    await tester.pumpWidget(
      ChangeNotifierProvider<ChatRoomsProvider>.value(
        // Pre-resolved identity so the room screen's defensive fetch kick is
        // a no-op (no network in widget tests).
        value: ChatRoomsProvider(initialEmployeeId: 'emp-me'),
        child: MaterialApp(home: const SizedBox.shrink()),
      ),
    );

    tester.state<NavigatorState>(find.byType(Navigator)).push(
          MaterialPageRoute(
            builder: (_) => ChatRoomScreen(
              room: _directRoom(),
              threadProviderFactory: (roomId) {
                injected = _FakeThreadProvider(roomId);
                return injected!;
              },
            ),
          ),
        );
    await tester.pump(); // build + fake load
    await tester.pump(); // settle

    expect(find.byType(AppBar), findsOneWidget);
    expect(find.text('Direct Chat'), findsOneWidget);
    expect(find.text('No messages yet'), findsOneWidget);
    // Task 119 greeting chips — one-tap starters on a fresh thread.
    expect(find.text('Hi!'), findsOneWidget);
    expect(find.text('Hello!'), findsOneWidget);
    expect(find.text('Are you available?'), findsOneWidget);

    // Tapping a greeting sends through the thread provider (proves the
    // screen is fully interactive under the app-scoped provider).
    await tester.tap(find.text('Hi!'));
    await tester.pump();
    expect(injected?.sent, ['Hi!']);

    // Unmount so the polling Timer is cancelled (no pending timers).
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
  });

  test('Task 119 — ChatHomeScreen no longer creates a route-local ChatRoomsProvider (source contract)', () {
    final src = File('lib/screens/chat/chat_home_screen.dart').readAsStringSync();
    expect(
      src.contains('ChangeNotifierProvider('),
      isFalse,
      reason:
          'ChatHomeScreen must NOT wrap itself in a fresh ChatRoomsProvider — the provider lives at app scope (main.dart). '
          'A route-local instance is invisible from ChatRoomScreen (pushed as a separate route) and caused the grey empty chat screen.',
    );
    expect(src.contains('fetchRooms()'), isTrue,
        reason: 'The home screen still KICKS the first fetch via the app-scoped provider.');
  });

  test('Task 119 — direct-room naming degrades gracefully without a directory', () {
    final provider = ChatRoomsProvider();
    final room = _directRoom();

    // Without the directory loaded: graceful fallback, never a crash.
    expect(provider.displayName(room), 'Direct Chat');

    // displayName for a named group is passthrough.
    final group = ChatRoomModel(id: 'g1', name: 'Design Crew', roomType: 'group');
    expect(provider.displayName(group), 'Design Crew');
  });
}
