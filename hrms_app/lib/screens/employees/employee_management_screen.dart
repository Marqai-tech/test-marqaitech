import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/maan_theme.dart';
import '../../providers/employee_provider.dart';
import '../employees/add_employee_screen.dart';

/// Employee Management — LIVE list from GET /api/employees (search + detail).
class EmployeeManagementScreen extends StatefulWidget {
  const EmployeeManagementScreen({super.key});

  @override
  State<EmployeeManagementScreen> createState() => _EmployeeManagementScreenState();
}

class _EmployeeManagementScreenState extends State<EmployeeManagementScreen> {
  final _search = TextEditingController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<EmployeeProvider>().fetchEmployees(refresh: true);
    });
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<EmployeeProvider>();
    return Scaffold(
      backgroundColor: MaanColors.pageBg,
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () async {
          final created = await Navigator.push(context, MaterialPageRoute(builder: (_) => const AddEmployeeScreen()));
          if (created == true && context.mounted) {
            context.read<EmployeeProvider>().fetchEmployees(refresh: true);
          }
        },
        backgroundColor: MaanColors.primary,
        icon: const Icon(Icons.person_add_alt_rounded, color: Colors.white, size: 20),
        label: const Text('Add Employee', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 13)),
      ),
      body: Column(
        children: [
          MaanHeader(title: 'Employee Management', onBack: () => Navigator.maybePop(context)),
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
                children: [
                  TextField(
                    controller: _search,
                    decoration: InputDecoration(
                      hintText: 'Search employees…',
                      prefixIcon: const Icon(Icons.search_rounded, color: MaanColors.faint, size: 21),
                      filled: true,
                      fillColor: MaanColors.pageBg,
                      contentPadding: const EdgeInsets.symmetric(vertical: 10),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
                    ),
                    onSubmitted: (v) => context.read<EmployeeProvider>().setSearch(v),
                  ),
                  const SizedBox(height: 12),
                  Expanded(
                    child: provider.isLoading
                        ? const Center(child: CircularProgressIndicator(color: MaanColors.primary))
                        : provider.error != null
                            ? Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(provider.error!, style: MaanText.body, textAlign: TextAlign.center)))
                            : RefreshIndicator(
                                color: MaanColors.primary,
                                onRefresh: () => provider.fetchEmployees(refresh: true),
                                child: provider.employees.isEmpty
                                    ? ListView(children: const [
                                        SizedBox(height: 110),
                                        Icon(Icons.people_alt_rounded, size: 64, color: MaanColors.faint),
                                        SizedBox(height: 12),
                                        Center(child: Text('No employees found', style: MaanText.body)),
                                      ])
                                    : ListView.separated(
                                        padding: const EdgeInsets.only(bottom: 90),
                                        itemCount: provider.employees.length,
                                        separatorBuilder: (_, __) => const SizedBox(height: 10),
                                        itemBuilder: (_, i) {
                                          final e = provider.employees[i];
                                          return _EmployeeCard(
                                            name: e.fullName.isNotEmpty ? e.fullName : 'Employee',
                                            subtitle: [e.designation, e.department].whereType<String>().where((s) => s.isNotEmpty).join(' · '),
                                            code: e.employeeCode ?? '',
                                            status: e.status ?? 'active',
                                            statusLabel: e.displayStatus,
                                            initials: e.initials,
                                            onTap: () => Navigator.pushNamed(context, '/employees/detail', arguments: e.id),
                                          );
                                        },
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

class _EmployeeCard extends StatelessWidget {
  final String name;
  final String subtitle;
  final String code;
  final String status;
  final String? statusLabel;
  final String initials;
  final VoidCallback onTap;

  const _EmployeeCard({required this.name, required this.subtitle, required this.code, required this.status, this.statusLabel, required this.initials, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final terminated = status.toLowerCase() == 'terminated' || status.toLowerCase() == 'resigned';
    final active = status.toLowerCase() == 'active' || status.toLowerCase() == 'confirmed';
    final dotColor = terminated ? MaanColors.accentRed : (active ? MaanColors.accentGreen : MaanColors.accentOrange);
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            border: Border.all(color: MaanColors.line),
            borderRadius: BorderRadius.circular(14),
            boxShadow: [BoxShadow(color: Colors.black.withOpacity(.04), blurRadius: 10, offset: const Offset(0, 3))],
          ),
          child: Row(children: [
            CircleAvatar(radius: 22, backgroundColor: MaanColors.primary.withOpacity(.14), child: Text(initials, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: MaanColors.primary))),
            const SizedBox(width: 12),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(name, style: MaanText.title, overflow: TextOverflow.ellipsis),
              const SizedBox(height: 2),
              Text(subtitle.isEmpty ? code : (code.isEmpty ? subtitle : '$subtitle  ·  $code'), style: MaanText.caption, overflow: TextOverflow.ellipsis),
            ])),
            const SizedBox(width: 6),
            Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Container(width: 8, height: 8, decoration: BoxDecoration(color: dotColor, shape: BoxShape.circle)),
              if (statusLabel != null && statusLabel!.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(statusLabel!, style: TextStyle(fontSize: 9.5, fontWeight: FontWeight.w800, color: dotColor)),
              ],
            ]),
          ]),
        ),
      ),
    );
  }
}
