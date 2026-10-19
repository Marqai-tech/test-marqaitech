import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'config/api_config.dart';
import 'config/colors.dart';
import 'config/constants.dart';
import 'config/theme.dart';
import 'providers/auth_provider.dart';
import 'providers/employee_provider.dart';
import 'providers/leave_provider.dart';
import 'providers/dashboard_provider.dart';
import 'services/storage_service.dart';
import 'services/api_service.dart';
import 'screens/splash/splash_screen.dart';
import 'screens/login/login_screen.dart';
import 'screens/dashboard/dashboard_screen.dart';
import 'screens/employees/employee_list_screen.dart';
import 'screens/employees/employee_detail_screen.dart';
import 'screens/leaves/leave_list_screen.dart';
import 'screens/leaves/leave_request_screen.dart';
import 'screens/attendance/attendance_screen.dart';
import 'screens/reports/reports_screen.dart';
import 'screens/profile/profile_screen.dart';
import 'screens/settings/settings_screen.dart';
import 'screens/settings/diagnostics_screen.dart';
import 'screens/notifications/notifications_screen.dart';
import 'models/employee.dart';
import 'screens/onboarding/onboarding_screen.dart';
import 'screens/auth/role_select_screen.dart';
import 'screens/auth/signin_screen.dart';
import 'screens/auth/tenant_picker_screen.dart';
import 'screens/home/home_screen.dart';
import 'screens/employees/employee_management_screen.dart';
import 'screens/employees/employee_empty_screen.dart';
import 'screens/employees/employee_detail_by_id_screen.dart';
import 'screens/leaves/leave_home_screen.dart';
import 'screens/attendance/attendance_home_screen.dart';
import 'screens/attendance/attendance_report_screen.dart';
import 'screens/employees/employee_directory_screen.dart';
import 'screens/auth/terms_screen.dart';
import 'screens/payroll/payroll_home_screen.dart';
import 'providers/payroll_provider.dart';
import 'providers/attendance_provider.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await StorageService.init();
  // Restore the persisted workspace BEFORE touching any API, so a stored
  // tenant token keeps talking to its own server after an app restart.
  ApiConfig.restoreFromStorage();
  final token = StorageService.getToken();
  if (token != null) ApiService.setToken(token);
  // Task 110 — dead-session recovery: any 401 from an authenticated call
  // (the 24h token expired, super-admin switch revoked, etc.) now clears the
  // session and lands the user on Sign In with an explanation instead of
  // leaving EVERY module showing errors.
  ApiService.onSessionExpired = (message) {
    final nav = rootNavigatorKey.currentState;
    if (nav != null) {
      nav.pushNamedAndRemoveUntil('/signin', (r) => false);
      rootMessengerKey.currentState?.showSnackBar(SnackBar(
        content: Text(message),
        backgroundColor: const Color(0xFFB7791F),
        duration: const Duration(seconds: 4),
      ));
    }
  };
  runApp(const HRMSApp());
}

/// Global navigator so the ApiService session-expiry hook can route back to
/// Sign In from ANYWHERE (module screens, dialogs, background refreshes).
final GlobalKey<NavigatorState> rootNavigatorKey = GlobalKey<NavigatorState>();
final GlobalKey<ScaffoldMessengerState> rootMessengerKey = GlobalKey<ScaffoldMessengerState>();

class HRMSApp extends StatelessWidget {
  const HRMSApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AuthProvider()),
        ChangeNotifierProvider(create: (_) => EmployeeProvider()),
        ChangeNotifierProvider(create: (_) => LeaveProvider()),
        ChangeNotifierProvider(create: (_) => DashboardProvider()),
        ChangeNotifierProvider(create: (_) => AttendanceProvider()),
      ],
      child: MaterialApp(
        title: AppConstants.appName,
        debugShowCheckedModeBanner: false,
        navigatorKey: rootNavigatorKey,
        scaffoldMessengerKey: rootMessengerKey,
        theme: AppTheme.lightTheme,
        initialRoute: '/',
        routes: {
          '/': (_) => const _AppWrapper(),
          '/onboarding': (_) => const OnboardingScreen(),
          '/role-select': (_) => const RoleSelectScreen(),
          '/signin': (_) => const SignInScreen(),
          '/tenant-picker': (_) => const TenantPickerScreen(),
          '/home-new': (_) => const HomeScreen(),
          '/employees-new': (_) => const EmployeeManagementScreen(),
          '/employee-empty': (_) => const EmployeeEmptyScreen(),
          '/leaves-new': (_) => const LeaveHomeScreen(),
          '/attendance-new': (_) => const AttendanceHomeScreen(),
          '/payroll-new': (_) => const PayrollHomeScreen(),
          '/login': (_) => const LoginScreen(),
          '/dashboard': (_) => const _MainNavigation(),
          '/employees': (_) => const EmployeeListScreen(),
          '/leaves/request': (_) => const LeaveRequestScreen(),
          '/attendance': (_) => const AttendanceScreen(),
          '/reports': (_) => const ReportsScreen(),
          '/profile': (_) => const ProfileScreen(),
          '/settings': (_) => const SettingsScreen(),
          '/directory': (_) => const EmployeeDirectoryScreen(),
          '/attendance-report': (_) => const AttendanceReportScreen(),
          '/terms': (_) => const TermsPage(),
          '/privacy': (_) => const TermsPage(privacy: true),
          '/notifications': (_) => const NotificationsScreen(),
          '/diagnostics': (_) => const DiagnosticsScreen(),
        },
        onGenerateRoute: (settings) {
          if (settings.name == '/employees/detail') {
            // Task 110 FIX: the module screen passes the employee ID (String)
            // while the legacy list passes a full EmployeeModel. The old cast
            // `settings.arguments as EmployeeModel` THREW a TypeError on every
            // detail tap from Employee Management ("module throwing errors").
            final arg = settings.arguments;
            if (arg is EmployeeModel) {
              return MaterialPageRoute(builder: (_) => EmployeeDetailScreen(employee: arg));
            }
            if (arg is String) {
              return MaterialPageRoute(builder: (_) => EmployeeDetailByIdScreen(employeeId: arg));
            }
          }
          return null;
        },
      ),
    );
  }
}

class _AppWrapper extends StatefulWidget {
  const _AppWrapper();

  @override
  State<_AppWrapper> createState() => _AppWrapperState();
}

class _AppWrapperState extends State<_AppWrapper> {
  @override
  void initState() {
    super.initState();
    _navigateAfterSplash();
  }

  Future<void> _navigateAfterSplash() async {
    await Future.delayed(const Duration(seconds: 2));
    if (!mounted) return;
    final auth = context.read<AuthProvider>();
    final seenOnboarding = StorageService.prefs.getBool('seen_onboarding') ?? false;
    if (auth.isLoggedIn) {
      // Task 110 — VALIDATE the restored session before entering the app:
      // tokens expire after 24h on the server. Without this check the app
      // used to land on Home with a dead token and EVERY module errored.
      final valid = await ApiService.validateSession();
      if (!mounted) return;
      if (!valid) {
        // Token expired/invalid — clean up and ask for a fresh sign-in.
        try { await auth.logout(); } catch (_) {}
        if (!mounted) return;
        Navigator.pushReplacementNamed(context, '/signin');
        rootMessengerKey.currentState?.showSnackBar(const SnackBar(
          content: Text('Your session has expired. Please sign in again.'),
          backgroundColor: Color(0xFFB7791F),
          duration: Duration(seconds: 4),
        ));
        return;
      }
      // Token is alive — refresh name/photo from the server.
      final fresh = await ApiService.refreshStoredUser();
      if (mounted && fresh != null) auth.adoptUser(fresh);
      // Super admins must pick a tenant workspace first (web switcher parity);
      // everyone else goes straight to the dashboard.
      final isSuper = auth.user?.role == 'super_admin';
      Navigator.pushReplacementNamed(context, isSuper ? '/tenant-picker' : '/home-new');
    } else if (!seenOnboarding) {
      await StorageService.prefs.setBool('seen_onboarding', true);
      Navigator.pushReplacementNamed(context, '/onboarding');
    } else {
      Navigator.pushReplacementNamed(context, '/role-select');
    }
  }

  @override
  Widget build(BuildContext context) {
    return const SplashScreen();
  }
}

class _MainNavigation extends StatefulWidget {
  const _MainNavigation();

  @override
  State<_MainNavigation> createState() => _MainNavigationState();
}

class _MainNavigationState extends State<_MainNavigation> {
  int _currentIndex = 0;

  final List<Widget> _screens = [
    const DashboardScreen(),
    const EmployeeListScreen(),
    const LeaveListScreen(),
    const AttendanceScreen(),
    const ProfileScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(index: _currentIndex, children: _screens),
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.08), blurRadius: 10)],
        ),
        child: NavigationBar(
          selectedIndex: _currentIndex,
          onDestinationSelected: (i) => setState(() => _currentIndex = i),
          destinations: const [
            NavigationDestination(icon: Icon(Icons.dashboard_outlined), selectedIcon: Icon(Icons.dashboard), label: 'Home'),
            NavigationDestination(icon: Icon(Icons.people_outline), selectedIcon: Icon(Icons.people), label: 'Employees'),
            NavigationDestination(icon: Icon(Icons.event_note_outlined), selectedIcon: Icon(Icons.event_note), label: 'Leaves'),
            NavigationDestination(icon: Icon(Icons.access_time), selectedIcon: Icon(Icons.access_time_filled), label: 'Attendance'),
            NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: 'Profile'),
          ],
        ),
      ),
    );
  }
}
