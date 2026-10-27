import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import '../config/maan_theme.dart';
import 'api_service.dart';

/// Task 113 — shared attendance punch flow (designs #12 "My Attendance" and
/// #12_Fake_GPS "GPS Spoofing Detected"). One implementation used by BOTH the
/// Home Check tab and the Attendance module so every punch gets identical
/// GPS-permission handling, mock-location detection and server-error guidance.
class PunchFlow {
  /// Red spoofing-warning dialog (design #12_Fake_GPS): the device reported a
  /// MOCK location (fake-GPS app / developer "allow mock locations"), so the
  /// punch is aborted BEFORE any data reaches the server.
  static Future<void> showSpoofDialog(BuildContext context) {
    return showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        backgroundColor: Colors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
        title: Row(children: [
          Container(
            width: 38, height: 38,
            decoration: BoxDecoration(color: Colors.red.withOpacity(.12), shape: BoxShape.circle),
            child: const Icon(Icons.gps_off_rounded, color: Colors.red, size: 21),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text('GPS Spoofing Detected',
                style: MaanText.title.copyWith(fontSize: 17, color: Colors.red)),
          ),
        ]),
        content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(
            'Our real-time security system detected a potential GPS spoofing attempt. Please disable fake GPS apps and use genuine location services for attendance punching.',
            style: MaanText.body.copyWith(height: 1.4),
          ),
          const SizedBox(height: 12),
          Text('How to resolve:', style: MaanText.title.copyWith(fontSize: 13.5)),
          const SizedBox(height: 6),
          _step('1', 'Disable any fake GPS or location spoofing app on your device.'),
          _step('2', "If enabled, turn off 'Allow mock locations' in Developer options."),
          _step('3', 'Ensure your device is using genuine GPS location services.'),
        ]),
        actions: [
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              style: FilledButton.styleFrom(backgroundColor: Colors.red, minimumSize: const Size.fromHeight(44)),
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Got it', style: TextStyle(fontWeight: FontWeight.w800)),
            ),
          ),
        ],
      ),
    );
  }

  static Widget _step(String n, String text) => Padding(
        padding: const EdgeInsets.only(bottom: 5),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(
            width: 17, height: 17,
            alignment: Alignment.center,
            decoration: const BoxDecoration(color: Colors.red, shape: BoxShape.circle),
            child: Text(n, style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w800)),
          ),
          const SizedBox(width: 8),
          Expanded(child: Text(text, style: MaanText.body.copyWith(fontSize: 12, height: 1.35))),
        ]),
      );

  static Future<bool> askDialog(BuildContext context, String title, String body) async {
    final res = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title, style: MaanText.title.copyWith(fontSize: 17)),
        content: Text(body, style: MaanText.body),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: MaanColors.primary),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Open Settings'),
          ),
        ],
      ),
    );
    return res == true;
  }

  /// GPS capture with the full permission ladder. Throws [MockLocationException]
  /// when the fix is flagged as a mock/fake location (design #12_Fake_GPS) and
  /// user-readable Exceptions for every other failure.
  static Future<PunchGps> captureGps(BuildContext context) async {
    final serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      final open = await askDialog(context, 'Location is off',
          'Turn on device location so your check-in can be verified against the office location.');
      if (open) await Geolocator.openLocationSettings();
      throw Exception('Location services are disabled. Enable location and try again.');
    }
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) permission = await Geolocator.requestPermission();
    if (permission == LocationPermission.denied) {
      throw Exception('Location permission is required for check-in/out.');
    }
    if (permission == LocationPermission.deniedForever) {
      final open = await askDialog(context, 'Permission blocked',
          'Allow location access for 3 Boxes HRMS from App settings to record attendance.');
      if (open) await Geolocator.openAppSettings();
      throw Exception('Location permission is blocked. Enable it in App settings and try again.');
    }
    final pos = await Geolocator.getCurrentPosition(
      desiredAccuracy: LocationAccuracy.high,
      timeLimit: const Duration(seconds: 20),
    );
    // Design #12_Fake_GPS — client-side mock-location detection. geolocator
    // exposes isMocked on Android: true when the fix came from a mocked
    // provider (fake GPS apps). Abort BEFORE calling the server.
    final mocked = pos.isMocked;
    if (mocked) {
      throw MockLocationException();
    }
    return PunchGps(lat: pos.latitude, lng: pos.longitude, accuracy: pos.accuracy);
  }

  /// Full punch execution: GPS capture → mock check → API punch → guided
  /// error/success dialogs. Returns true when the punch was recorded.
  static Future<bool> executePunch(
    BuildContext context, {
    required String employeeId,
    required String action,
    required String label,
    String? mode,
    String? statusLine,
    VoidCallback? onStarted,
    Future<void> Function(Map<String, dynamic> res)? onSuccess,
  }) async {
    onStarted?.call();
    try {
      final gps = await captureGps(context);
      if (!context.mounted) return false;
      final res = await ApiService.punch(employeeId: employeeId, action: action, gps: gps, mode: mode);
      final serverMessage = (res['message'] ?? '').toString();
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text(serverMessage.isNotEmpty ? '$label recorded. $serverMessage' : '$label recorded successfully.'),
            backgroundColor: Colors.green));
      }
      await onSuccess?.call(res);
      return true;
    } on MockLocationException {
      if (context.mounted) await showSpoofDialog(context);
      return false;
    } catch (e) {
      if (!context.mounted) return false;
      final msg = e.toString().replaceAll('Exception: ', '');
      if (e is PunchException && e.code == 'REMOTE_CHECKIN_NOT_ENABLED') {
        // Task 108 gate — WFH pre-approval needed (red guidance dialog).
        await showDialog<void>(
          context: context,
          builder: (ctx) => AlertDialog(
            backgroundColor: Colors.white,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
            title: Row(children: [
              Container(
                width: 38, height: 38,
                decoration: BoxDecoration(color: Colors.red.withOpacity(.12), shape: BoxShape.circle),
                child: const Icon(Icons.work_history_rounded, color: Colors.red, size: 21),
              ),
              const SizedBox(width: 10),
              Expanded(child: Text('Pre-approval required', style: MaanText.title.copyWith(fontSize: 17, color: Colors.red))),
            ]),
            content: Text(
              '$msg\n\nSubmit a work-from-home / remote check-in request to your admin — once approved in Attendance → Remote Check-In, mobile punching unlocks for your account.',
              style: MaanText.body.copyWith(height: 1.4),
            ),
            actions: [
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  style: FilledButton.styleFrom(backgroundColor: Colors.red, minimumSize: const Size.fromHeight(44)),
                  onPressed: () => Navigator.pop(ctx),
                  child: const Text('Got it', style: TextStyle(fontWeight: FontWeight.w800)),
                ),
              ),
            ],
          ),
        );
      } else if (e is PunchException && e.code == 'HOLIDAY_WORK_APPROVAL_REQUIRED') {
        await showDialog<void>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: Row(children: [
              const Icon(Icons.event_busy_rounded, color: Colors.orange, size: 22),
              const SizedBox(width: 8),
              Expanded(child: Text('Approval needed', style: MaanText.title.copyWith(fontSize: 17))),
            ]),
            content: Text(
              '$msg\n\nOnce your Holiday / Weekend Work request is approved (or your admin opens holidays & weekends for you in Attendance Settings), your mobile check-in will work on that date.',
              style: MaanText.body,
            ),
            actions: [
              TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('OK', style: TextStyle(color: MaanColors.primary, fontWeight: FontWeight.w700))),
            ],
          ),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg), backgroundColor: Colors.red));
      }
      return false;
    }
  }
}

/// Thrown when the device GPS fix is a MOCK location (fake-GPS app).
class MockLocationException implements Exception {
  @override
  String toString() => 'GPS Spoofing Detected';
}

/// Design #12 — "Your Location: …" status bar with a refresh button. Silent
/// capture (no permission prompts): shows coordinates when available,
/// 'Location not found!' otherwise.
class LocationStatusBar extends StatefulWidget {
  const LocationStatusBar({super.key});

  @override
  State<LocationStatusBar> createState() => _LocationStatusBarState();
}

class _LocationStatusBarState extends State<LocationStatusBar> {
  String _text = 'Locating…';
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _locate();
  }

  Future<void> _locate() async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied || permission == LocationPermission.deniedForever) {
        throw Exception('no permission');
      }
      final pos = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
        timeLimit: const Duration(seconds: 10),
      ).timeout(const Duration(seconds: 12));
      if (!mounted) return;
      setState(() => _text = '${pos.latitude.toStringAsFixed(5)}, ${pos.longitude.toStringAsFixed(5)}');
    } catch (_) {
      if (!mounted) return;
      setState(() => _text = 'Location not found!');
    }
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final notFound = _text == 'Location not found!';
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 10, 16, 0),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
      decoration: BoxDecoration(
        color: notFound ? Colors.red.withOpacity(.06) : MaanColors.primary.withOpacity(.06),
        border: Border.all(color: notFound ? Colors.red.withOpacity(.25) : MaanColors.primary.withOpacity(.2)),
        borderRadius: BorderRadius.circular(11),
      ),
      child: Row(children: [
        Icon(Icons.location_on_rounded,
            size: 15, color: notFound ? Colors.red : MaanColors.primary),
        const SizedBox(width: 7),
        Expanded(
          child: Text(
            'Your Location: $_text',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: MaanText.caption.copyWith(
              fontSize: 11.5,
              fontWeight: FontWeight.w600,
              color: notFound ? Colors.red.shade700 : MaanColors.navy,
            ),
          ),
        ),
        if (_busy)
          const SizedBox(width: 13, height: 13, child: CircularProgressIndicator(strokeWidth: 2, color: MaanColors.primary))
        else
          InkWell(
            onTap: _locate,
            borderRadius: BorderRadius.circular(20),
            child: const Padding(
              padding: EdgeInsets.all(3),
              child: Icon(Icons.refresh_rounded, size: 17, color: MaanColors.primary),
            ),
          ),
      ]),
    );
  }
}
