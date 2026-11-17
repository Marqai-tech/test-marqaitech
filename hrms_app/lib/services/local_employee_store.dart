import 'dart:convert';
import 'storage_service.dart';

/// Offline-first employee store for the mobile Add-Employee flow.
/// Employees saved here survive app restarts; when the workspace API is
/// reachable the same record is also POSTed to /api/employees.
class LocalEmployeeStore {
  static const String _key = 'local_employees_v1';

  static Future<List<Map<String, dynamic>>> all() async {
    final raw = StorageService.prefs.getString(_key);
    if (raw == null || raw.isEmpty) return [];
    try {
      final list = jsonDecode(raw) as List<dynamic>;
      return list.map((e) => Map<String, dynamic>.from(e as Map)).toList();
    } catch (_) {
      return [];
    }
  }

  static Future<void> add(Map<String, dynamic> employee) async {
    final list = await all();
    list.insert(0, employee);
    await StorageService.prefs.setString(_key, jsonEncode(list));
  }

  static Future<void> clear() async {
    await StorageService.prefs.remove(_key);
  }
}
