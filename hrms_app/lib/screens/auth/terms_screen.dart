import 'package:flutter/material.dart';
import '../../config/maan_theme.dart';

/// Task 112 — Terms of Services / Privacy Policy page (design #87 menu).
/// Rendered from [TermsPage.kind] so both drawer entries share one screen.
class TermsPage extends StatelessWidget {
  final bool privacy;
  const TermsPage({super.key, this.privacy = false});

  static const String _terms = '''
Welcome to 3 Boxes HRMS. By creating an account or using this mobile application you agree to the following terms of service.

1. Accounts & Access. Your workspace administrator provisions your account. You are responsible for keeping your credentials confidential and for all activity performed under your account. If you believe your account has been compromised, report it to your administrator immediately.

2. Acceptable Use. The app may only be used for legitimate HR operations — attendance, leave, payroll, and people management. You must not attempt to access data belonging to other employees beyond your role's scope, tamper with attendance records, submit false GPS coordinates, or reverse-engineer the application.

3. Attendance & Location. Check-ins may capture device GPS coordinates to verify office / WFH compliance under your organisation's attendance policy. Remote check-ins require administrator pre-approval. Falsifying location data is a policy violation and is flagged for audit.

4. Leave Requests. Leave requests follow your organisation's approval workflow. Approvals, balances and entitlements shown in the app are maintained by your employer and may be corrected by HR.

5. Availability. The service is provided on an as-is basis. Planned maintenance and third-party cloud incidents may temporarily affect availability; critical alerts are communicated through your administrator.

6. Changes. These terms may be updated from time to time. Continued use of the app after an update constitutes acceptance of the revised terms.''';

  static const String _privacy = '''
3 Boxes HRMS respects your privacy. This policy explains what data the mobile app processes and how it is protected.

1. Data We Process. Account identity (name, work email, photo), employment records your organisation maintains (department, designation, join date, salary where visible to your role), attendance punches with timestamps, and — when you check in — device GPS coordinates used to verify your distance from the office geofence.

2. How Data Is Used. Your data is used exclusively to operate HR workflows: attendance tracking, leave approvals, payroll processing and organisational reporting. GPS data is stored with each punch for compliance audits and is never used for continuous tracking between punches.

3. Data Storage. Data is stored on managed cloud infrastructure with encryption in transit. Access is role-restricted: employees see their own records, managers and HR see records within their approval scope, and administrators manage workspace settings.

4. Sharing. Your data is never sold. It is shared only within your organisation's approval chain, and — where configured — with email/Slack/Teams notification channels that deliver approval requests to authorised recipients.

5. Your Rights. You may view and correct your profile information from the app, request photo removal, and ask your administrator to export or delete your records in line with your local regulations.

6. Contact. For privacy questions, contact your workspace administrator or the platform operator.''';

  @override
  Widget build(BuildContext context) {
    final title = privacy ? 'Privacy Policy' : 'Terms of Services';
    final body = privacy ? _privacy : _terms;
    return Scaffold(
      backgroundColor: MaanColors.pageBg,
      appBar: AppBar(
        backgroundColor: MaanColors.primary,
        foregroundColor: Colors.white,
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
        elevation: 0,
      ),
      body: ListView(
        padding: const EdgeInsets.all(18),
        children: [
          Row(children: [
            Container(
              width: 42, height: 42,
              decoration: BoxDecoration(color: MaanColors.primary.withOpacity(.1), borderRadius: BorderRadius.circular(12)),
              child: Icon(privacy ? Icons.privacy_tip_rounded : Icons.description_rounded, color: MaanColors.primary, size: 22),
            ),
            const SizedBox(width: 12),
            Expanded(child: Text('$title — 3 Boxes HRMS', style: MaanText.h2.copyWith(fontSize: 17))),
          ]),
          const SizedBox(height: 14),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: MaanColors.line),
            ),
            child: Text(body, style: MaanText.body.copyWith(height: 1.55)),
          ),
          const SizedBox(height: 20),
        ],
      ),
    );
  }
}
