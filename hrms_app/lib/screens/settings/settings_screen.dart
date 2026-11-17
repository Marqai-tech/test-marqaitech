import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:http/http.dart' as http;
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

  /// Task 156 — the in-app DOWNLOAD OPTION lists BOTH Android editions so
  /// users can pick whichever they like:
  ///   • Native app (this one) — full Flutter UI + the PhonePe-style AI dock
  ///   • Lite WebView app — renders the live web workspace (smallest updates)
  /// Versions/URLs come from /api/public/app-version ({native, shell} blocks)
  /// with hard fallbacks so the sheet still works offline/old-platform.
  Future<void> _showEditionSheet() async {
    String nativeName = AppInfo.versionName;
    int nativeCode = AppInfo.versionCode;
    String nativeUrl = '${ApiConfig.baseUrl}/downloads/3boxes-hrms-native.apk';
    String shellName = '1.8.1';
    int shellCode = 37;
    String shellUrl = '${ApiConfig.baseUrl}/downloads/3boxes-hrms-mobile.apk';

    try {
      final res = await http
          .get(Uri.parse('${ApiConfig.baseUrl}/api/public/app-version'))
          .timeout(const Duration(seconds: 12));
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        if (data is Map<String, dynamic>) {
          final n = data['native'];
          if (n is Map<String, dynamic>) {
            nativeName = '${n['versionName'] ?? nativeName}';
            nativeCode = (n['versionCode'] is num) ? (n['versionCode'] as num).toInt() : nativeCode;
            if (n['apkUrl'] is String && (n['apkUrl'] as String).isNotEmpty) nativeUrl = n['apkUrl'] as String;
          }
          final s = data['shell'];
          if (s is Map<String, dynamic>) {
            shellName = '${s['versionName'] ?? shellName}';
            shellCode = (s['versionCode'] is num) ? (s['versionCode'] as num).toInt() : shellCode;
            if (s['apkUrl'] is String && (s['apkUrl'] as String).isNotEmpty) shellUrl = s['apkUrl'] as String;
          }
        }
      }
    } catch (_) {/* offline — fallback constants already set */}

    if (!mounted) return;
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (sheetCtx) {
        Widget edition({
          required IconData icon,
          required Color tint,
          required String title,
          required String subtitle,
          required String versionLine,
          required String url,
          bool isCurrent = false,
        }) {
          return Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: tint.withOpacity(.06),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: tint.withOpacity(.35)),
            ),
            child: Row(
              children: [
                Container(
                  width: 46,
                  height: 46,
                  decoration: BoxDecoration(
                    gradient: LinearGradient(colors: [tint, tint.withOpacity(.7)]),
                    borderRadius: BorderRadius.circular(13),
                  ),
                  child: Icon(icon, color: Colors.white, size: 24),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(children: [
                        Flexible(child: Text(title, maxLines: 1, overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: MaanColors.navy))),
                        if (isCurrent) ...[
                          const SizedBox(width: 6),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(color: Colors.green.withOpacity(.12), borderRadius: BorderRadius.circular(6)),
                            child: const Text('INSTALLED', style: TextStyle(fontSize: 8.5, fontWeight: FontWeight.w800, color: Colors.green, letterSpacing: .4)),
                          ),
                        ],
                      ]),
                      const SizedBox(height: 2),
                      Text(subtitle, style: MaanText.caption),
                      const SizedBox(height: 2),
                      Text(versionLine, style: MaanText.caption.copyWith(fontSize: 10.5)),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                SizedBox(
                  height: 34,
                  child: ElevatedButton.icon(
                    onPressed: () async {
                      final url0 = Uri.parse(url);
                      try {
                        await launchUrl(url0, mode: LaunchMode.externalApplication);
                      } catch (_) {
                        if (sheetCtx.mounted) {
                          ScaffoldMessenger.of(sheetCtx).showSnackBar(const SnackBar(content: Text('Could not open the download link.')));
                        }
                      }
                    },
                    icon: const Icon(Icons.download_rounded, size: 15),
                    label: const Text('Get APK', style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800)),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: tint,
                      foregroundColor: Colors.white,
                      elevation: 0,
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    ),
                  ),
                ),
              ],
            ),
          );
        }

        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 18, 16, 14),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Choose your app edition',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: MaanColors.navy)),
                const SizedBox(height: 4),
                Text('Both editions install over each other — pick whichever you like.',
                    style: MaanText.caption),
                const SizedBox(height: 14),
                edition(
                  icon: Icons.smart_toy_rounded,
                  tint: const Color(0xFF8B5CF6),
                  title: 'Native App (full experience)',
                  subtitle: 'Full Flutter UI · PhonePe-style violet AI dock · offline-first',
                  versionLine: 'v$nativeName ($nativeCode) · recommended',
                  url: nativeUrl,
                  isCurrent: AppInfo.versionCode == nativeCode,
                ),
                edition(
                  icon: Icons.language_rounded,
                  tint: const Color(0xFF0EA5E9),
                  title: 'Lite WebView App',
                  subtitle: 'Renders your live web workspace — every web update instantly',
                  versionLine: 'v$shellName ($shellCode)',
                  url: shellUrl,
                ),
                Text('After the download finishes, open the APK and tap Install '
                    '(allow "install unknown apps" for your browser if asked).',
                    style: MaanText.caption.copyWith(fontSize: 10.5)),
              ],
            ),
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final user = auth.user;
    final name = user?.displayName ?? 'User';
    return MainTabScaffold(
      currentIndex: -1, // Task 141 — Settings is not in the new bottom nav; no highlight
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
            _row(Icons.system_update_alt_rounded, 'Check for updates', 'Get the latest native APK from your workspace', onTap: () async {
              final ok = await UpdateService.checkForUpdate();
              if (!ok && mounted) {
                ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not reach the update service — check your connection.')));
                return;
              }
              if (UpdateService.updateAvailable && mounted) {
                // Task 156 — update now installs DIRECTLY from the app.
                final url = Uri.parse(UpdateService.apkUrlToInstall());
                try {
                  await launchUrl(url, mode: LaunchMode.externalApplication);
                } catch (_) {
                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not open the download link — try the web login page.'), backgroundColor: Colors.orange));
                  }
                }
              } else if (mounted) {
                ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('You are on the latest version (v${UpdateService.latestVersionName}).'), backgroundColor: Colors.green));
              }
            }),
            // Task 156 — the in-app DOWNLOAD OPTION now offers BOTH editions:
            // this full native app and the Lite WebView-shell app.
            _row(Icons.get_app_rounded, 'Download an app edition', 'Native app (this one) or the Lite WebView app', onTap: _showEditionSheet),
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
