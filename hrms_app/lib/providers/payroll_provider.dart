import 'package:flutter/material.dart';
import '../models/payroll.dart';
import '../services/api_service.dart';
import '../utils/json_safe.dart';

class PayrollProvider extends ChangeNotifier {
  List<PayrollModel> _payrolls = [];
  bool _isLoading = false;
  String? _error;
  int _total = 0;
  String _statusFilter = '';

  List<PayrollModel> get payrolls => _statusFilter.isEmpty
      ? _payrolls
      : _payrolls.where((p) => p.status == _statusFilter).toList();
  bool get isLoading => _isLoading;
  String? get error => _error;
  int get total => _total;
  String get statusFilter => _statusFilter;

  Future<void> fetchPayrolls({bool refresh = false}) async {
    if (refresh) _statusFilter = '';
    _isLoading = true;
    _error = null;
    notifyListeners();
    try {
      final data = await ApiService.getPayrolls(limit: 50);
      final rows = jsonList(data['payrolls'] is List ? data['payrolls'] : data['data']);
      _payrolls = rows.whereType<Map<String, dynamic>>().map(PayrollModel.fromJson).toList();
      final pag = jsonMap(data['pagination']);
      _total = (pag['total'] is num) ? (pag['total'] as num).toInt() : _payrolls.length;
      _isLoading = false;
      notifyListeners();
    } catch (e) {
      _error = e.toString().replaceAll('Exception: ', '');
      _isLoading = false;
      notifyListeners();
    }
  }

  void setStatusFilter(String s) {
    _statusFilter = s;
    notifyListeners();
  }
}
