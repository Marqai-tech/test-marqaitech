import 'package:local_auth/local_auth.dart';
import 'storage_service.dart';

/// Task 113 — biometric login (design #06 "Setup Biometric Login").
///
/// Flow: the user signs in with email + password ONCE (design copy: "To
/// enable fingerprint login, please enter your email and password once").
/// From then on the fingerprint gates the ALREADY-VALID stored session —
/// no password is ever stored in the app. If the stored session has expired,
/// the biometric unlock falls back to the normal password sign-in.
class BiometricService {
  static const _flagKey = 'biometric_enabled';
  static final LocalAuthentication _auth = LocalAuthentication();

  /// Device has fingerprint/face hardware AND it is enrolled + supported.
  static Future<bool> isAvailable() async {
    try {
      final supported = await _auth.isDeviceSupported();
      final canCheck = await _auth.canCheckBiometrics;
      return supported && canCheck;
    } catch (_) {
      return false;
    }
  }

  static bool isEnabled() {
    try {
      return StorageService.prefs.getBool(_flagKey) ?? false;
    } catch (_) {
      return false;
    }
  }

  static Future<void> setEnabled(bool value) async {
    try {
      await StorageService.prefs.setBool(_flagKey, value);
    } catch (_) {/* non-fatal */}
  }

  /// Shows the OS biometric prompt. Returns true when the user's
  /// fingerprint/face was verified.
  static Future<bool> authenticate() async {
    try {
      return await _auth.authenticate(
        localizedReason: 'Unlock 3 Boxes HRMS with your fingerprint',
        options: const AuthenticationOptions(
          stickyAuth: true,
          biometricOnly: true,
        ),
      );
    } catch (_) {
      return false;
    }
  }
}
