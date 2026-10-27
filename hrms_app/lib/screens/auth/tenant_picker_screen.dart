import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/maan_theme.dart';
import '../../providers/auth_provider.dart';
import '../../services/api_service.dart';

/// Super-admin tenant picker — mirrors the web super-admin switcher.
///
/// A super admin signing into the app lands here first: they pick the tenant
/// whose data they want to work with, the app exchanges the super-admin token
/// for that tenant's admin token (POST /api/auth/switch-tenant), and every
/// module (Employee / Leave / Attendance / Payroll) afterwards resolves the
/// selected tenant's dedicated database via the JWT tenantId.
class TenantPickerScreen extends StatefulWidget {
  const TenantPickerScreen({super.key});

  @override
  State<TenantPickerScreen> createState() => _TenantPickerScreenState();
}

class _TenantPickerScreenState extends State<TenantPickerScreen> {
  List<dynamic> _tenants = [];
  List<dynamic> _filtered = [];
  bool _loading = true;
  bool _switching = false;
  String? _error;
  String _search = '';

  @override
  void initState() {
    super.initState();
    _loadTenants();
  }

  Future<void> _loadTenants() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      // Re-open case: the session token belongs to a switched tenant, so
      // point the API back at the stashed super-admin token first.
      context.read<AuthProvider>().beginTenantPick();
      final list = await ApiService.getTenants();
      if (!mounted) return;
      setState(() {
        _tenants = list;
        _filtered = list;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString().replaceAll('Exception: ', '');
        _loading = false;
      });
    }
  }

  void _applySearch(String q) {
    setState(() {
      _search = q.toLowerCase();
      _filtered = _tenants.where((t) {
        final name = (t['name'] ?? '').toString().toLowerCase();
        final slug = (t['slug'] ?? '').toString().toLowerCase();
        final plan = (t['plan'] ?? '').toString().toLowerCase();
        return name.contains(_search) || slug.contains(_search) || plan.contains(_search);
      }).toList();
    });
  }

  Future<void> _switch(Map<String, dynamic> tenant) async {
    final id = (tenant['id'] ?? tenant['tenantId'])?.toString();
    final name = (tenant['name'] ?? 'this tenant').toString();
    if (id == null || id.isEmpty) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Switch to $name?', style: MaanText.title.copyWith(fontSize: 17)),
        content: Text(
          'You will work inside this tenant\'s workspace — employees, leaves, attendance and payroll will show this tenant\'s data, exactly like the web super-admin switcher.',
          style: MaanText.body,
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: MaanColors.primary),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Switch'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    setState(() => _switching = true);
    final ok = await context.read<AuthProvider>().switchTenant(id);
    if (!mounted) return;
    setState(() => _switching = false);
    if (ok) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('Now working in $name'),
          backgroundColor: Colors.green));
      Navigator.pushNamedAndRemoveUntil(context, '/home-new', (_) => false);
    } else {
      final err = context.read<AuthProvider>().error ?? 'Failed to switch tenant';
      ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(err), backgroundColor: Colors.red));
    }
  }

  Future<void> _signOut() async {
    await context.read<AuthProvider>().logout();
    if (!mounted) return;
    Navigator.pushNamedAndRemoveUntil(context, '/signin', (_) => false);
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    return Scaffold(
      backgroundColor: MaanColors.pageBg,
      body: Column(
        children: [
          MaanHeader(title: 'Select Workspace', onBack: () => Navigator.maybePop(context)),
          Expanded(
            child: Container(
              width: double.infinity,
              margin: const EdgeInsets.only(top: 18),
              padding: const EdgeInsets.fromLTRB(16, 20, 16, 0),
              decoration: const BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.only(topLeft: Radius.circular(30), topRight: Radius.circular(30)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Super Admin', style: MaanText.h2.copyWith(fontSize: 18)),
                  const SizedBox(height: 4),
                  Text(
                    'Pick the tenant workspace you want to open. You can change this any time from the dashboard.',
                    style: MaanText.caption.copyWith(height: 1.35),
                  ),
                  const SizedBox(height: 14),
                  TextField(
                    onChanged: _applySearch,
                    decoration: InputDecoration(
                      hintText: 'Search tenants...',
                      prefixIcon: const Icon(Icons.search, size: 20),
                      isDense: true,
                      filled: true,
                      fillColor: MaanColors.pageBg,
                      contentPadding: const EdgeInsets.symmetric(vertical: 10),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: const BorderSide(color: MaanColors.line),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: const BorderSide(color: MaanColors.line),
                      ),
                    ),
                  ),
                  const SizedBox(height: 14),
                  Expanded(
                    child: _loading
                        ? const Center(child: CircularProgressIndicator(color: MaanColors.primary))
                        : _error != null
                            ? Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Text(_error!, style: MaanText.body, textAlign: TextAlign.center),
                                  const SizedBox(height: 8),
                                  TextButton(
                                    onPressed: _loadTenants,
                                    child: const Text('Retry', style: TextStyle(color: MaanColors.primary)),
                                  ),
                                ],
                              )
                            : RefreshIndicator(
                                color: MaanColors.primary,
                                onRefresh: _loadTenants,
                                child: _filtered.isEmpty
                                    ? ListView(children: const [
                                        Padding(
                                          padding: EdgeInsets.all(32),
                                          child: Center(child: Text('No tenants found', style: MaanText.body)),
                                        ),
                                      ])
                                    : ListView.separated(
                                        padding: const EdgeInsets.only(bottom: 24),
                                        itemCount: _filtered.length,
                                        separatorBuilder: (_, __) => const SizedBox(height: 10),
                                        itemBuilder: (ctx, i) {
                                          final t = Map<String, dynamic>.from(_filtered[i] as Map);
                                          return _TenantCard(
                                            tenant: t,
                                            busy: _switching,
                                            onTap: () => _switch(t),
                                          );
                                        },
                                      ),
                              ),
                  ),
                  if (auth.isSuperAdminSession)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 14, top: 6),
                      child: Center(
                        child: TextButton.icon(
                          onPressed: _signOut,
                          icon: const Icon(Icons.logout_rounded, size: 17),
                          label: const Text('Sign out'),
                          style: TextButton.styleFrom(foregroundColor: MaanColors.accentRed),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _TenantCard extends StatelessWidget {
  final Map<String, dynamic> tenant;
  final bool busy;
  final VoidCallback onTap;
  const _TenantCard({required this.tenant, required this.busy, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final name = (tenant['name'] ?? tenant['tenantName'] ?? 'Tenant').toString();
    final slug = (tenant['slug'] ?? '').toString();
    final plan = (tenant['plan'] ?? '').toString();
    final status = (tenant['status'] ?? '').toString();
    final active = status.toLowerCase() == 'active' || status.isEmpty;

    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: busy ? null : onTap,
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: MaanColors.line),
          ),
          child: Row(
            children: [
              Container(
                width: 42,
                height: 42,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: const Color(0xFFE9E6FD),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  name.isNotEmpty ? name.characters.first.toUpperCase() : 'T',
                  style: const TextStyle(
                      color: MaanColors.accentIndigo, fontWeight: FontWeight.w800, fontSize: 16),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: MaanText.title.copyWith(fontSize: 14)),
                    if (slug.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(slug, maxLines: 1, overflow: TextOverflow.ellipsis, style: MaanText.caption),
                    ],
                    const SizedBox(height: 5),
                    Row(children: [
                      if (plan.isNotEmpty)
                        _chip(plan, MaanColors.accentCyan, const Color(0xFFE8F4FD)),
                      const SizedBox(width: 6),
                      _chip(
                        active ? 'active' : (status.isEmpty ? 'active' : status),
                        active ? MaanColors.accentGreen : MaanColors.accentOrange,
                        active ? const Color(0xFFE6F9F2) : const Color(0xFFFEF3E2),
                      ),
                    ]),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              busy
                  ? const SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(strokeWidth: 2.2, color: MaanColors.primary))
                  : Container(
                      width: 34,
                      height: 34,
                      decoration: BoxDecoration(
                        color: MaanColors.primary.withOpacity(.1),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: const Icon(Icons.arrow_forward_rounded, size: 18, color: MaanColors.primary),
                    ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _chip(String label, Color color, Color bg) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2.5),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(6)),
      child: Text(label,
          style: TextStyle(
              color: color, fontSize: 9.5, fontWeight: FontWeight.w700, letterSpacing: .3)),
    );
  }
}
