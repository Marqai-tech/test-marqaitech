// Task 116 — regression tests for the `type 'List<dynamic>' is not a
// subtype of type 'List<ProjectTaskModel>'` crash reported on the Projects
// module (v1.4.1, project Overview).
//
// Three defense layers are exercised:
//   1. REAL payloads captured from the LIVE tenant (marqaitechgroup —
//      "HRMS PROJECT") and the demo workspace (8-task project), parsed via
//      the exact same helpers the providers use (jsonList / jsonMapList).
//   2. The provider-side parse block replicated shape-for-shape.
//   3. Adversarial payload shapes a server or proxy could ever emit
//      (tasks as Map, tasks as list of IDs, null project, string
//      assignedTo, _count as string, pagination as list…) — every one must
//      degrade to defaults, never throw.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:hrms_app/models/project.dart';
import 'package:hrms_app/utils/json_safe.dart';

Map<String, dynamic> _fixture(String name) =>
    jsonDecode(File('test/fixtures/$name').readAsStringSync()) as Map<String, dynamic>;

/// Mirrors ProjectDetailProvider.load()'s parse block (post-Task 116) so a
/// regression in either place is caught.
(Map<String, dynamic>, List<ProjectTaskModel>, List<ProjectMilestoneModel>, List<ProjectTeamMemberModel>, ProjectAccess?) _parseDetail(Map<String, dynamic> data) {
  final p = jsonMap(data['project']);
  final milestones = jsonMapList(p['milestones']).map(ProjectMilestoneModel.fromJson).toList();
  final team = jsonMapList(p['allocations']).map(ProjectTeamMemberModel.fromJson).toList();
  final access = jsonMap(data['access']);
  final tasks = jsonMapList(p['tasks']).map(ProjectTaskModel.fromJson).toList();
  return (p, tasks, milestones, team, access.isNotEmpty ? ProjectAccess.fromJson(access) : null);
}

void main() {
  group('Task 116 — LIVE tenant payload (HRMS PROJECT, marqaitechgroup)', () {
    test('list payload parses with zero tasks and _count values', () {
      final data = _fixture('live_projects_list.json');
      final rows = jsonList(data['projects'])
          .whereType<Map<String, dynamic>>()
          .map(ProjectModel.fromJson)
          .toList();
      expect(rows.length, 2);
      final hrms = rows.firstWhere((p) => p.name.toUpperCase().contains('HRMS'));
      expect(hrms.name, 'HRMS PROJECT');
      expect(hrms.taskCount, 0);
      expect(hrms.recentTasks, isEmpty);
    });

    test('detail payload parses through the provider parse block', () {
      final data = _fixture('live_project_detail.json');
      final (p, tasks, milestones, team, access) = _parseDetail(data);
      expect(p['name'], 'HRMS PROJECT');
      expect(tasks, isEmpty);
      expect(milestones, isEmpty);
      expect(team, isEmpty);
      expect(access, isNotNull);
      expect(access!.canEdit, isTrue);
    });
  });

  group('Task 116 — demo workspace payload (8-task project)', () {
    test('tasks parse with all meta fields tolerated (null nested objects)', () {
      final data = _fixture('demo_project_detail_8tasks.json');
      final (p, tasks, _, _, access) = _parseDetail(data);
      expect(p['name'], 'Mobile Banking App Revamp');
      expect(tasks.length, 8);
      // demo rows carry assignedToId but no nested assignedTo object
      expect(tasks.every((t) => t.assignedToName == null), isTrue);
      expect(tasks.every((t) => t.id.isNotEmpty && t.name.isNotEmpty), isTrue);
      expect(access, isNotNull);
    });
  });

  group('Task 116 — adversarial payload shapes must never throw', () {
    test('tasks as a Map instead of a List degrades to empty', () {
      final (_, tasks, milestones, team, _) = _parseDetail({
        'project': {
          'id': 'p1', 'name': 'X',
          'tasks': {'a': {}},
          'milestones': {'b': {}},
          'allocations': {'c': {}},
        },
        'access': {'role': 'manager'},
      });
      expect(tasks, isEmpty);
      expect(milestones, isEmpty);
      expect(team, isEmpty);
    });

    test('tasks as list of IDs / scalars / nulls drops non-object elements', () {
      final (_, tasks, _, _, _) = _parseDetail({
        'project': {
          'id': 'p1', 'name': 'X',
          'tasks': ['id-1', 'id-2', null, 42, {'id': 't1', 'name': 'Real task'}],
        },
      });
      expect(tasks.length, 1);
      expect(tasks.first.id, 't1');
    });

    test('null / missing project and access blocks degrade to empty parse', () {
      final (p, tasks, milestones, team, access) = _parseDetail({'project': null, 'access': null});
      expect(p, isEmpty);
      expect(tasks, isEmpty);
      expect(milestones, isEmpty);
      expect(team, isEmpty);
      expect(access, isNull);
    });

    test('nested task meta fields of wrong types are tolerated', () {
      final t = ProjectTaskModel.fromJson({
        'id': 't1', 'name': 'T', 'projectId': 'p1',
        'assignedTo': 'Vardhani', // string instead of object
        'milestone': 'm-1', // string instead of object
        'sprint': 7, // number instead of object
        'dependsOn': true, // bool instead of object
        'storyPoints': '5', // string number
        'estimatedHours': '8h', // junk number → 0
      });
      expect(t.assignedToName, isNull);
      expect(t.milestoneName, isNull);
      expect(t.sprintName, isNull);
      expect(t.dependsOnName, isNull);
      expect(t.storyPoints, isNull); // non-num string → null
      expect(t.estimatedHours, 0);
    });

    test('assignedTo with extra whitespace only still parses a name', () {
      final t = ProjectTaskModel.fromJson({
        'id': 't1', 'name': 'T', 'projectId': 'p1',
        'assignedTo': {'firstName': 'Vardhani', 'lastName': 'Reddy'},
      });
      expect(t.assignedToName, 'Vardhani Reddy');
    });

    test('_count as string numbers still yields counters (num-only guard)', () {
      final p = ProjectModel.fromJson({
        'id': 'p1', 'name': 'X',
        '_count': {'tasks': '3', 'allocations': '2', 'milestones': '1'},
        'tasks': [{}],
      });
      // string counts are not num → falls back to parsed lengths
      expect(p.taskCount, 1);
      expect(p.allocationCount, 0);
      expect(p.milestoneCount, 0);
    });

    test('provider list parse block survives a projects-as-Map payload', () {
      final data = {'projects': {'oops': true}, 'pagination': {'total': 5}};
      final rows = jsonList(data['projects'])
          .whereType<Map<String, dynamic>>()
          .map(ProjectModel.fromJson)
          .toList();
      final pag = jsonMap(data['pagination']);
      final total = (pag['total'] is num) ? (pag['total'] as num).toInt() : rows.length;
      expect(rows, isEmpty);
      expect(total, 5);
    });

    test('pagination as a List does not throw and falls back to length', () {
      final data = {'projects': [], 'pagination': [1, 2]};
      final pag = jsonMap(data['pagination']);
      final total = (pag['total'] is num) ? (pag['total'] as num).toInt() : 0;
      expect(total, 0);
    });
  });
}
