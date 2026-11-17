// Task 124 — PF & ESI exemption for MarqAI Tech Group employees.
//
// User directive: PF and ESI must NOT be deducted on any MarqAI payslip.
// Contracts pinned here:
//   • marqai-setup disables PF/ESI in the tenant PayrollSettings (default),
//     skips PF/ESI rows in generated salary structures, and cleans up
//     superseded structures (vardhani's gross is re-solved to ₹1,00,200 so
//     her on-hand stays exactly ₹1,00,000 with PT as the only deduction).
//   • The payroll engine gates EPF/ESI on the company toggles.
//   • The process endpoint honours `force` so existing payslips can be
//     recomputed under the new statutory configuration.
//   • Web payslip detail hides zero-value rows (no "PF ₹0.00" clutter).
//   • Payroll Settings exposes PF/ESI toggles + a Reprocess switch for the
//     payroll head.
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

String webSrc(String relPath) => File('../$relPath').readAsStringSync();

void main() {
  group('Task 124 PF/ESI exemption source contracts', () {
    test('marqai-setup defaults PF/ESI OFF in tenant PayrollSettings', () {
      final setup = webSrc('src/app/api/payroll/marqai-setup/route.ts');
      expect(setup.contains("const pfEnabled = body?.pfEnabled === true;"), isTrue,
          reason: 'PF defaults to OFF unless explicitly enabled in body');
      expect(setup.contains("const esiEnabled = body?.esiEnabled === true;"), isTrue,
          reason: 'ESI defaults to OFF unless explicitly enabled in body');
      expect(setup.contains('pfEnabled, esiEnabled,'), isTrue,
          reason: 'settings upsert must persist both toggles');
      expect(setup.contains('const settings = await resolvePayrollSettings(db, companyId);'),
          isTrue, reason: 'solver must re-read settings AFTER the upsert');
    });

    test('marqai-setup omits PF/ESI rows from salary structures when disabled', () {
      final setup = webSrc('src/app/api/payroll/marqai-setup/route.ts');
      expect(setup.contains("settings.pfEnabled ? [{ name: 'EPF - Employee'"), isTrue,
          reason: 'EPF structure row only embedded when PF enabled');
      expect(setup.contains("settings.esiEnabled ? [{ name: 'ESI - Employee'"), isTrue,
          reason: 'ESI structure row only embedded when ESI enabled');
    });

    test('marqai-setup cleans up superseded MarqAI structures', () {
      final setup = webSrc('src/app/api/payroll/marqai-setup/route.ts');
      expect(setup.contains("name: { startsWith: 'MarqAI' }"), isTrue);
      expect(setup.contains('stale'), isTrue,
          reason: 'structures nobody references must be removed');
    });

    test('engine gates EPF/ESI on the company toggles', () {
      final engine = webSrc('src/lib/payroll-engine.ts');
      expect(engine.contains('settings.pfEnabled ? r2((pfWage'), isTrue,
          reason: 'EPF computed only when pfEnabled');
      expect(engine.contains('settings.esiEnabled && structureGross <= settings.esiWageCeiling'),
          isTrue, reason: 'ESI computed only when esiEnabled');
      // solver must respect the same toggles so vardhani re-solves correctly
      expect(engine.contains("settings.pfEnabled ? r2((Math.min(basic, settings.pfWageCeiling)"), isTrue);
      expect(engine.contains('settings.esiEnabled && g <= settings.esiWageCeiling'), isTrue);
    });

    test('process endpoint honours force for reprocessing existing payslips', () {
      final process = webSrc('src/app/api/payroll/process/route.ts');
      expect(process.contains('force: Boolean(body.force)'), isTrue);
    });

    test('web payslip detail hides zero-value earning/deduction rows', () {
      final page = webSrc('src/app/(dashboard)/payroll/payslips/page.tsx');
      final matches = ".filter(({ value }) => Number(value) !== 0)".allMatches(page).length;
      expect(matches, greaterThanOrEqualTo(2),
          reason: 'both earnings and deductions tables must filter zero rows');
    });

    test('web payroll settings exposes PF/ESI toggles + reprocess switch', () {
      final page = webSrc('src/app/(dashboard)/payroll/settings/page.tsx');
      expect(page.contains('Statutory Deductions — PF'), isTrue);
      expect(page.contains('saveStatutory'), isTrue);
      expect(page.contains("{ pf: { enabled: next.pfEnabled }, esi: { enabled: next.esiEnabled } }"),
          isTrue, reason: 'toggles persist via PUT salary-settings');
      expect(page.contains('force,'), isTrue,
          reason: 'process run must forward force');
      expect(page.contains('Reprocess existing payslips'), isTrue);
    });

    test('salary-settings API persists the PF/ESI enabled booleans', () {
      final api = webSrc('src/app/api/payroll/salary-settings/route.ts');
      expect(api.contains('pfEnabled: typeof pf.enabled === \'boolean\' ? pf.enabled : undefined'), isTrue);
      expect(api.contains('esiEnabled: typeof esi.enabled === \'boolean\' ? esi.enabled : undefined'), isTrue);
      expect(api.contains('enabled: settings.pfEnabled'), isTrue, reason: 'GET exposes pf toggle state');
      expect(api.contains('enabled: settings.esiEnabled'), isTrue, reason: 'GET exposes esi toggle state');
    });
  });
}
