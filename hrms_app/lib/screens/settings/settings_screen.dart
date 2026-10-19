import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../config/colors.dart';
import '../../config/constants.dart';
import '../../config/api_config.dart';
import '../../config/app_info.dart';
import '../../services/update_service.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  bool _notificationsEnabled = true;
  bool _emailNotifications = true;
  bool _darkMode = false;
  String _language = 'English';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            // Notifications
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Notifications', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 16),
                    _switchTile('Push Notifications', _notificationsEnabled, (v) => setState(() => _notificationsEnabled = v)),
                    _switchTile('Email Notifications', _emailNotifications, (v) => setState(() => _emailNotifications = v)),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            // Appearance
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Appearance', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 16),
                    _switchTile('Dark Mode', _darkMode, (v) => setState(() => _darkMode = v)),
                    _languageSelector(),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            // Task 110 — updates & diagnostics
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('App & Updates', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 12),
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      dense: true,
                      leading: const Icon(Icons.system_update_alt_rounded, color: Color(0xFF0B7A4B)),
                      title: const Text('Check for updates', style: TextStyle(fontSize: 14)),
                      subtitle: Text('Install the latest APK from your workspace', style: TextStyle(fontSize: 11.5, color: AppColors.textSecondary)),
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () async {
                        final ok = await UpdateService.checkForUpdate();
                        if (!ok) {
                          if (mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not reach the update service — check your connection.')));
                          }
                          return;
                        }
                        if (UpdateService.updateAvailable) {
                          try {
                            await launchUrl(Uri.parse(AppInfo.apkUrlOnWorkspace(ApiConfig.baseUrl)), mode: LaunchMode.externalApplication);
                          } catch (_) {}
                        } else if (mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('You are on the latest version (v${UpdateService.latestVersionName}).')));
                        }
                      },
                    ),
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      dense: true,
                      leading: const Icon(Icons.wifi_tethering_rounded, color: Color(0xFF3B82F6)),
                      title: const Text('Connection check', style: TextStyle(fontSize: 14)),
                      subtitle: Text('Test every module endpoint with your session', style: TextStyle(fontSize: 11.5, color: AppColors.textSecondary)),
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () => Navigator.pushNamed(context, '/diagnostics'),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            // About
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('About', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 16),
                    _infoRow('App Name', AppConstants.appName),
                    _infoRow('Version', '${AppInfo.versionName} (${AppInfo.versionCode})'),
                    _infoRow('Company', AppConstants.companyName),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _switchTile(String title, bool value, ValueChanged<bool> onChanged) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Expanded(child: Text(title, style: const TextStyle(fontSize: 14))),
          Switch(value: value, onChanged: onChanged, activeColor: AppColors.primary),
        ],
      ),
    );
  }

  Widget _languageSelector() {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          const Expanded(child: Text('Language', style: TextStyle(fontSize: 14))),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(
              border: Border.all(color: AppColors.border),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(_language, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500)),
          ),
        ],
      ),
    );
  }

  Widget _infoRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Expanded(child: Text(label, style: const TextStyle(fontSize: 13, color: AppColors.textSecondary))),
          Text(value, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500)),
        ],
      ),
    );
  }
}
