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
        // Task 119 — ChatRoomsProvider MUST live at app scope: ChatRoomScreen
        // is pushed as its OWN route (Navigator.push), which is a sibling of
        // the chat-home subtree. A provider created inside ChatHomeScreen is
        // invisible from there — context.watch<ChatRoomsProvider> in the room
        // screen threw ProviderNotFoundException and release builds rendered
        // a GREY/EMPTY thread screen (the "chat screen is empty" report). One
        // shared instance also means identity + directory resolve exactly once.
        ChangeNotifierProvider(create: (_) => ChatRoomsProvider()),
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
          '/login': (_) => const LoginScreen(),
          '/dashboard': (_) => const _MainNavigation(),
          '/employees': (_) => const EmployeeListScreen(),
          '/leaves/request': (_) => const LeaveRequestScreen(),
          // Task 113: the legacy static attendance placeholder is gone — the
          // route now opens the LIVE My Attendance module (design #12).
          '/attendance': (_) => const AttendanceHomeScreen(),
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
          if (settings.name == '/projects/detail') {
            final id = settings.arguments;
            return MaterialPageRoute(
              builder: (_) => ProjectDetailScreen(projectId: id is String ? id : ''),
            );
          }
          // Task 117 — chat thread needs the FULL room (header badges, member
          // count, type), so the argument is the ChatRoomModel, not just an id.
          if (settings.name == '/chat/room') {
            final arg = settings.arguments;
            if (arg is ChatRoomModel) {
              return MaterialPageRoute(builder: (_) => ChatRoomScreen(room: arg));
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
    if (auth.isLoggedIn) {
      Navigator.pushReplacementNamed(context, '/dashboard');
    } else {
      Navigator.pushReplacementNamed(context, '/login');
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
