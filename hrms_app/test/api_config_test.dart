// Task 111 — regression tests for the login-ladder root cause.
//
// The platform's /api/auth/login answers tenant users with
// suggestedUrl "https://<slug>.3boxeshrms.com/login" (a PAGE URL). The old
// normalizeWorkspaceUrl kept the path, the ladder POSTed to
// "<slug>/login/api/auth/login", Next.js served the login PAGE with HTTP 200
// HTML, the app read token=null and still treated the login as successful —
// "errors in all modules + no token stored".
import 'package:flutter_test/flutter_test.dart';
import 'package:hrms_app/config/api_config.dart';

void main() {
  group('normalizeWorkspaceUrl — always returns the bare ORIGIN', () {
    test('strips the /login page path from suggestedUrl (ROOT CAUSE)', () {
      expect(
        ApiConfig.normalizeWorkspaceUrl(
            'https://marqaitechgroup.3boxeshrms.com/login'),
        'https://marqaitechgroup.3boxeshrms.com',
      );
    });

    test('strips any deeper path + query', () {
      expect(
        ApiConfig.normalizeWorkspaceUrl(
            'https://x.3boxeshrms.com/login?next=/home'),
        'https://x.3boxeshrms.com',
      );
    });

    test('bare subdomain fragment expands to the platform domain', () {
      expect(
        ApiConfig.normalizeWorkspaceUrl('marqaitechgroup'),
        'https://marqaitechgroup.3boxeshrms.com',
      );
    });

    test('bare host gets https scheme', () {
      expect(
        ApiConfig.normalizeWorkspaceUrl('marqaitechgroup.3boxeshrms.com'),
        'https://marqaitechgroup.3boxeshrms.com',
      );
    });

    test('already-clean origin passes through unchanged', () {
      expect(
        ApiConfig.normalizeWorkspaceUrl('https://nexus-hrms-demo.vercel.app'),
        'https://nexus-hrms-demo.vercel.app',
      );
      expect(
        ApiConfig.normalizeWorkspaceUrl('https://3boxeshrms.com'),
        'https://3boxeshrms.com',
      );
    });

    test('trailing slashes are dropped', () {
      expect(
        ApiConfig.normalizeWorkspaceUrl('https://3boxeshrms.com///'),
        'https://3boxeshrms.com',
      );
    });

    test('empty input returns null', () {
      expect(ApiConfig.normalizeWorkspaceUrl(''), isNull);
      expect(ApiConfig.normalizeWorkspaceUrl('   '), isNull);
    });
  });
}
