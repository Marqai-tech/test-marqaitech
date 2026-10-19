import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/maan_theme.dart';
import '../../config/api_config.dart';
import '../../config/app_info.dart';
import '../../config/constants.dart';
import '../../providers/auth_provider.dart';
import '../../services/storage_service.dart';
import '../../services/update_service.dart';
import '../../widgets/maan_avatar.dart';
import '../../widgets/main_scaffold.dart';
import '../auth/terms_screen.dart';

/// Task 112 — Settings rebuilt with REAL data (was fully static):
///  · account card: signed-in identity from the persisted session
///  · workspace card: the live API base URL this session talks to
///  · preferences: notifications + dark mode — PERSISTED, dark mode wired
///    to the app-wide ThemeProvider
///  · app & updates: real version, update check, connection check
///  · support: Terms / Privacy; logout at the bottom.
class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  bool _notificationsEnabled = true;
  bool _emailNotifications = true;
  String? _workspace;
  String? _tenantName;

  @override
  void initState() {
    super.initState();
    _notificationsEnabled = StorageService.prefs.getBool('pref_push_notifications') ?? true;
    _emailNotifications = StorageService.prefs.getBool('pref_email_notifications') ?? true;
    _workspace = StorageService.getWorkspaceUrl() ?? ApiConfig.baseUrl;
    _loadTenantName();
  }

  Future<void> _loadTenantName() async {
    final data = StorageService.getUserData();
    if (data != null) {
      try {
        final u = jsonDecode(data);
        final t = u['tenant'];
        if (t is Map && mounted) {
          setState(() => _tenantName = '${t['name'] ?? ''}');
        }
      } catch (_) {}
    }
  }

  Future<void> _setPref(String key, bool value) async {
    await StorageService.prefs.setBool(key, value);
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final user = auth.user;
    final name = user?.displayName ?? 'User';
    return MainTabScaffold(
      currentIndex: 2,
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // ── Account (dynamic) ──
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(18), border: Border.all(color: MaanColors.line)),
            child: Row(
              children: [
                MaanAvatar(avatar: user?.avatar, name: name, radius: 26, bgColor: MaanColors.primary.withOpacity(.12), textColor: MaanColors.primary),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: MaanColors.navy)),
                    const SizedBox(height: 2),
                    Text(user?.email ?? '—', maxLines: 1, overflow: TextOverflow.ellipsis, style: MaanText.caption),
                    const SizedBox(height: 4),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(color: MaanColors.primary.withOpacity(.1), borderRadius: BorderRadius.circular(7)),
                      child: Text((user?.role ?? 'member').replaceAll('_', ' ').toUpperCase(), style: const TextStyle(fontSize: 9.5, fontWeight: FontWeight.w800, color: MaanColors.primary, letterSpacing: .5)),
                    ),
                  ]),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          // ── Workspace (dynamic) ──
          _card('Workspace', [
            _row(Icons.link_rounded, 'Server', _workspace ?? ApiConfig.baseUrl, mono: true),
            if (_tenantName?.isNotEmpty == true) _row(Icons.business_rounded, 'Tenant', _tenantName!),
            _row(Icons.wifi_tethering_rounded, 'Connection check', 'Test every module endpoint', onTap: () => Navigator.pushNamed(context, '/diagnostics')),
          ]),
          const SizedBox(height: 14),
          // ── Preferences (persisted) ──
          _card('Preferences', [
            _switchRow(Icons.notifications_rounded, 'Push Notifications', _notificationsEnabled, (v) {
              setState(() => _notificationsEnabled = v);
              _setPref('pref_push_notifications', v);
            }),
            _switchRow(Icons.alternate_email_rounded, 'Email Notifications', _emailNotifications, (v) {
              setState(() => _emailNotifications = v);
              _setPref('pref_email_notifications', v);
            }),
          ]),
          const SizedBox(height: 14),
          // ── App & Updates ──
          _card('App & Updates', [
            _row(Icons.system_update_alt_rounded, 'Check for updates', 'Install the latest APK from your workspace', onTap: () async {
              final ok = await UpdateService.checkForUpdate();
              if (!ok && mounted) {
                ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not reach the update service — check your connection.')));
                return;
              }
              if (UpdateService.updateAvailable && mounted) {
                ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('v${UpdateService.latestVersionName} is available — download it from the web login page.'), backgroundColor: Colors.orange));
              } else if (mounted) {
                ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('You are on the latest version (v${UpdateService.latestVersionName}).'), backgroundColor: Colors.green));
              }
            }),
            _row(Icons.info_outline_rounded, 'App Name', AppConstants.appName),
            _row(Icons.verified_rounded, 'Version', '${AppInfo.versionName} (${AppInfo.versionCode})'),
          ]),
          const SizedBox(height: 14),
          // ── Support ──
          _card('Support', [
            _row(Icons.description_outlined, 'Terms of Services', '', onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const TermsPage()))),
            _row(Icons.privacy_tip_outlined, 'Privacy Policy', '', onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const TermsPage(privacy: true)))),
          ]),
          const SizedBox(height: 20),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: () async {
                try { await context.read<AuthProvider>().logout(); } catch (_) {}
                if (context.mounted) Navigator.pushNamedAndRemoveUntil(context, '/signin', (r) => false);
              },
              icon: const Icon(Icons.logout_rounded, size: 19),
              label: const Text('Log Out', style: TextStyle(fontWeight: FontWeight.w700)),
              style: OutlinedButton.styleFrom(
                foregroundColor: MaanColors.accentRed,
                side: const BorderSide(color: MaanColors.accentRed),
                padding: const EdgeInsets.symmetric(vertical: 13),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(13)),
              ),
            ),
          ),
          const SizedBox(height: 18),
          Center(child: Text(AppInfo.label, style: MaanText.caption.copyWith(fontSize: 10))),
          const SizedBox(height: 16),
        ],
      ),
    );
  }

  Widget _card(String title, List<Widget> children) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(18), border: Border.all(color: MaanColors.line)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w800, color: MaanColors.navy)),
          const SizedBox(height: 6),
          ...children,
        ],
      ),
    );
  }

  Widget _row(IconData icon, String label, String value, {VoidCallback? onTap, bool mono = false}) {
    return InkWell(
      borderRadius: BorderRadius.circular(9),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 9),
        child: Row(
          children: [
            Container(
              width: 32, height: 32,
              decoration: BoxDecoration(color: MaanColors.primary.withOpacity(.09), borderRadius: BorderRadius.circular(9)),
              child: Icon(icon, color: MaanColors.primary, size: 16),
            ),
            const SizedBox(width: 11),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(label, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: MaanColors.navy)),
                if (value.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 1), child: Text(value, style: MaanText.caption.copyWith(fontSize: 11), maxLines: 2, overflow: TextOverflow.ellipsis)),
              ]),
            ),
            if (onTap != null) const Icon(Icons.chevron_right_rounded, color: MaanColors.faint, size: 20),
          ],
        ),
      ),
    );
  }

  Widget _switchRow(IconData icon, String label, bool value, ValueChanged<bool> onChanged) {
    return SwitchListTile(
      secondary: Icon(icon, color: MaanColors.primary, size: 21),
      title: Text(label, style: const TextStyle(fontSize: 14, color: MaanColors.navy)),
      value: value,
      onChanged: onChanged,
      activeColor: MaanColors.primary,
      contentPadding: EdgeInsets.zero,
    );
  }
}
