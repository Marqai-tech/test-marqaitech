import { getTokenFromHeaders, verifyToken } from '@/lib/auth';
import { NextRequest } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { resolveCompanyScope } from '@/lib/companyScope';
import { resolvePayrollSettings, DEFAULT_PAYROLL_SETTINGS } from '@/lib/payroll-engine';
import type { PayrollSettingsData } from '@/lib/payroll-engine';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

function adminRole(role: unknown): boolean {
  return role === 'super_admin' || role === 'tenant_admin' || role === 'admin' || role === 'hr_admin' || role === 'company_hr_admin';
}

/**
 * Task 123 — Salary Settings are now PERSISTED per company in the
 * PayrollSettings table (processing mode, statutory rates, structure ratios).
 * The response keeps the legacy section shape (daHra/pf/esi/tds/professionalTax/
 * gratuity/lwf) for UI compatibility and adds:
 *   • processing  { mode, autoProcessDay, payDay, lopEnabled }
 *   • pt          { mode, state, monthlyAmount }
 *   • structure   { basicPct, hraPctOfBasic, conveyanceAmt, medicalAmt }
 *   • taxRegime / tdsMethod
 */
export async function GET(request: NextRequest) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    const decoded = await verifyToken(token);
    if (!decoded) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

    const scope = await resolveCompanyScope(request);
    let settings: PayrollSettingsData = { ...DEFAULT_PAYROLL_SETTINGS };
    if (scope && scope.companyId) {
      settings = await resolvePayrollSettings(db, scope.companyId);
    }

    const data = {
      daHra: {
        enabled: true,
        daPercentage: 0,
        hraPercentage: settings.hraPctOfBasic,
        basicPercentage: settings.basicPct,
      },
      pf: {
        enabled: settings.pfEnabled,
        employeeShare: settings.pfEmployeePct,
        employerShare: settings.pfEmployerPct,
        wageCeiling: settings.pfWageCeiling,
      },
      esi: {
        enabled: settings.esiEnabled,
        employeeShare: settings.esiEmployeePct,
        employerShare: settings.esiEmployerPct,
        wageCeiling: settings.esiWageCeiling,
      },
      tds: {
        enabled: settings.tdsEnabled,
        regime: settings.taxRegime,
        method: settings.tdsMethod,
        slabs: [], // slab rates live in Masters → Tax Slabs (TaxSlabTable)
      },
      professionalTax: {
        enabled: settings.ptEnabled,
        monthlyAmount: settings.ptMonthlyAmount,
        mode: settings.ptMode,
        state: settings.ptState,
      },
      gratuity: { enabled: true, rate: 4.81, denominator: 26 },
      lwf: { enabled: false, employeeShare: 0, employerShare: 0, frequency: 'HALF_YEARLY' },
      processing: {
        mode: settings.processingMode,
        autoProcessDay: settings.autoProcessDay,
        payDay: null as number | null,
        lopEnabled: settings.lopEnabled,
      },
      structure: {
        basicPct: settings.basicPct,
        hraPctOfBasic: settings.hraPctOfBasic,
        conveyanceAmt: settings.conveyanceAmt,
        medicalAmt: settings.medicalAmt,
      },
    };

    return Response.json({ data }, { headers: corsHeaders });
  } catch (error: unknown) {
    console.error('Error fetching salary settings:', error);
    return Response.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500, headers: corsHeaders });
  }
}

// PUT: Update salary settings (persisted per company — payroll head only)
export async function PUT(request: NextRequest) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    const decoded = await verifyToken(token);
    if (!decoded) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

    const userRole = (decoded as Record<string, unknown>).role as string;
    if (!adminRole(userRole)) {
      return Response.json({ error: 'Only HR/Admin (payroll head) can update salary settings' }, { status: 403, headers: corsHeaders });
    }

    const scope = await resolveCompanyScope(request);
    if (!scope || !scope.companyId) {
      return Response.json({ error: 'Select a company context first' }, { status: 400, headers: corsHeaders });
    }
    const companyId = scope.companyId;

    const body = await request.json();

    // Legacy nested shape → flat PayrollSettings columns
    const pf = body.pf || {};
    const esi = body.esi || {};
    const pt = body.professionalTax || {};
    const daHra = body.daHra || {};
    const processing = body.processing || {};
    const structure = body.structure || {};

    const mode = processing.mode === 'auto' ? 'auto' : processing.mode === 'manual' ? 'manual' : undefined;

    const data = {
      pfEnabled: typeof pf.enabled === 'boolean' ? pf.enabled : undefined,
      pfEmployeePct: pf.employeeShare !== undefined ? Number(pf.employeeShare) : undefined,
      pfEmployerPct: pf.employerShare !== undefined ? Number(pf.employerShare) : undefined,
      pfWageCeiling: pf.wageCeiling !== undefined ? Number(pf.wageCeiling) : undefined,
      esiEnabled: typeof esi.enabled === 'boolean' ? esi.enabled : undefined,
      esiEmployeePct: esi.employeeShare !== undefined ? Number(esi.employeeShare) : undefined,
      esiEmployerPct: esi.employerShare !== undefined ? Number(esi.employerShare) : undefined,
      esiWageCeiling: esi.wageCeiling !== undefined ? Number(esi.wageCeiling) : undefined,
      ptEnabled: typeof pt.enabled === 'boolean' ? pt.enabled : undefined,
      ptMode: pt.mode !== undefined ? String(pt.mode) : undefined,
      ptState: pt.state !== undefined ? String(pt.state) : undefined,
      ptMonthlyAmount: pt.monthlyAmount !== undefined ? Number(pt.monthlyAmount) : undefined,
      tdsEnabled: body.tds && typeof body.tds.enabled === 'boolean' ? body.tds.enabled : undefined,
      taxRegime: body.tds && body.tds.regime ? (String(body.tds.regime).toUpperCase() === 'OLD' ? 'OLD' : 'NEW') : undefined,
      basicPct: structure.basicPct !== undefined ? Number(structure.basicPct) : daHra.basicPercentage !== undefined ? Number(daHra.basicPercentage) : undefined,
      hraPctOfBasic: structure.hraPctOfBasic !== undefined ? Number(structure.hraPctOfBasic) : daHra.hraPercentage !== undefined ? Number(daHra.hraPercentage) : undefined,
      conveyanceAmt: structure.conveyanceAmt !== undefined ? Number(structure.conveyanceAmt) : undefined,
      medicalAmt: structure.medicalAmt !== undefined ? Number(structure.medicalAmt) : undefined,
      processingMode: mode,
      autoProcessDay: processing.autoProcessDay !== undefined ? Math.min(28, Math.max(1, Number(processing.autoProcessDay) || 1)) : undefined,
      lopEnabled: typeof processing.lopEnabled === 'boolean' ? processing.lopEnabled : undefined,
      updatedBy: (decoded as Record<string, unknown>).userId as string,
    };

    // Strip undefined values (Prisma rejects undefined in nested unique upsert data)
    const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));

    const saved = await db.payrollSettings.upsert({
      where: { companyId },
      update: clean,
      create: { companyId, ...clean },
    });

    return Response.json({
      data: saved,
      message: 'Salary settings saved successfully',
    }, { headers: corsHeaders });
  } catch (error: unknown) {
    console.error('Error updating salary settings:', error);
    return Response.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500, headers: corsHeaders });
  }
}
