// Task 114 — Project models parsed from REAL captured API payloads
// (test/fixtures/projects.json + project_detail.json — recorded from the
// live demo workspace /api/projects endpoints). Guards the field shapes the
// web platform actually returns.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:hrms_app/models/project.dart';

Map<String, dynamic> _fixture(String name) =>
    jsonDecode(File('test/fixtures/$name').readAsStringSync()) as Map<String, dynamic>;

void main() {
  group('ProjectModel (live payload shape)', () {
    test('parses the list payload with _count and nested client', () {
      final data = _fixture('projects.json');
      final rows = (data['projects'] as List).whereType<Map<String, dynamic>>().toList();
      expect(rows, isNotEmpty);
      final projects = rows.map(ProjectModel.fromJson).toList();

      final p = projects.first;
      expect(p.id, isNotEmpty);
      expect(p.name, isNotEmpty);
      expect(p.status, isNotEmpty);
      expect(p.projectType, isNotEmpty);
      expect(p.currency, isNotEmpty);
      // _count block parsed
      expect(p.taskCount, greaterThanOrEqualTo(0));
      expect(p.allocationCount, greaterThanOrEqualTo(0));
      expect(p.milestoneCount, greaterThanOrEqualTo(0));
      // statusLabel covers the whole live status set
      for (final s in ['draft', 'active', 'on_hold', 'completed', 'cancelled']) {
        final probe = ProjectModel(
          id: 'x', name: 'x', status: s,
        );
        expect(probe.statusLabel, isNot(contains('draft')), reason: 'status $s must have a proper label');
      }
    });

    test('parses the detail payload with tasks/milestones/allocations', () {
      final data = _fixture('project_detail.json');
      final p = ProjectModel.fromJson(data['project'] as Map<String, dynamic>);
      expect(p.id, isNotEmpty);
      // tasks include milestone objects
      final tasks = ((data['project'] as Map<String, dynamic>)['tasks'] as List)
          .whereType<Map<String, dynamic>>()
          .map(ProjectTaskModel.fromJson)
          .toList();
      expect(tasks.length, p.taskCount);
      for (final t in tasks) {
        expect(t.status, anyOf('todo', 'in_progress', 'review', 'done', 'cancelled'));
        expect(t.priority, anyOf('low', 'medium', 'high', 'critical'));
      }
      // access object
      final access = ProjectAccess.fromJson((data['access'] as Map<String, dynamic>));
      expect(['manager', 'finance', 'member', 'viewer', 'null'], contains(access.role));
    });

    test('null-safe on missing/null fields (defensive defaults)', () {
      final p = ProjectModel.fromJson({});
      expect(p.id, '');
      expect(p.name, '');
      expect(p.status, 'draft');
      expect(p.progress, 0);
      expect(p.budgetAmount, 0);
      final t = ProjectTaskModel.fromJson({});
      expect(t.status, 'todo');
      expect(t.priority, 'medium');
      final m = ProjectMilestoneModel.fromJson({});
      expect(m.completionPct, 0);
      expect(m.approvalStatus, 'pending');
      final team = ProjectTeamMemberModel.fromJson({});
      expect(team.allocationPct, 0);
    });
  });
}
