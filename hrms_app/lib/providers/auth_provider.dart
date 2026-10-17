import 'package:flutter/material.dart';
import '../config/api_config.dart';
import '../models/user.dart';
import '../services/api_service.dart';
import '../services/storage_service.dart';
import '../services/tenant_logo_service.dart';

class AuthProvider extends ChangeNotifier {
  UserModel? _user;
  bool _isLoading = false;
  bool _isLoggedIn = false;
  String? _error;

  UserModel? get user => _user;
  bool get isLoading => _isLoading;
  bool get isLoggedIn => _isLoggedIn;
  String? get error => _error;

  AuthProvider() {
    _checkAuth();
  }

  Future<void> _checkAuth() async {
    _isLoading = true;
    notifyListeners();
    try {
      final token = StorageService.getToken();
      if (token != null) {
        ApiService.setToken(token);
        _user = await ApiService.getStoredUser();
        _isLoggedIn = true;
      }
    } catch (e) {
      _isLoggedIn = false;
    }
    _isLoading = false;
    notifyListeners();
  }

  Future<bool> login(String email, String password) async {
    _isLoading = true;
    _error = null;
    notifyListeners();
    try {
      final data = await ApiService.login(email, password);
      final user = await ApiService.getStoredUser();
      // Super admin keeps their original token in memory so the tenant
      // picker can be re-opened without re-login (web switcher parity).
      if (user?.role == 'super_admin') {
        ApiService.superAdminToken = ApiService.token;
      }
      _user = user;
      _isLoggedIn = true;
      _isLoading = false;
      notifyListeners();
      return true;
    } catch (e) {
      _error = e.toString().replaceAll('Exception: ', '');
      _isLoading = false;
      notifyListeners();
      return false;
    }
  }

  /// Whether the current session still carries super-admin powers (either
  /// logged in as super admin directly, or switched from one this session).
  bool get isSuperAdminSession =>
      ApiService.superAdminToken != null || _user?.role == 'super_admin';

  /// Exchange the super-admin session for a tenant_admin session scoped to
  /// [tenantId]. Persists the new token + user so every module API now
  /// resolves the tenant DB via the JWT tenantId.
  Future<bool> switchTenant(String tenantId) async {
    _isLoading = true;
    _error = null;
    notifyListeners();
    try {
      await ApiService.switchTenant(tenantId);
      _user = await ApiService.getStoredUser();
      _isLoggedIn = true;
      _isLoading = false;
      notifyListeners();
      return true;
    } catch (e) {
      _error = e.toString().replaceAll('Exception: ', '');
      _isLoading = false;
      notifyListeners();
      return false;
    }
  }

  /// Re-open the tenant directory: point API calls back at the
  /// super-admin token for the picker's GET /api/tenants call.
  void beginTenantPick() => ApiService.useSuperAdminToken();

  Future<void> logout() async {
    await ApiService.logout();
    await TenantLogoService.clearCache();
    _user = null;
    _isLoggedIn = false;
    _error = null;
    notifyListeners();
  }

  void clearError() {
    _error = null;
    notifyListeners();
  }
}
