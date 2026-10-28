import { getDb, getPlatformDb } from '@/lib/tenant-db';
import { getTokenFromHeaders, verifyToken } from '@/lib/auth';
import { NextRequest } from 'next/server';
import { EPF_WAGE_CEILING, ESI_WAGE_LIMIT } from '@/lib/payroll/india';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

type EmpStat = {
  id: string; code: string; name: string; pan: string; uan: string; ip: string;
  department: string; designation: string;
  gross: number; basicDa: number; epfWage: number;
  epfEe: number; epfEr: number; eps: number;
  esiEe: number; esiEr: number; pt: number; tds: number; lwfEe: number; lwfEr: number;
  joinDate: Date | null; exitDate: Date | null; state: string;
};

const CODES = {
  epfEe: ['EPF_EE', 'EPF', 'PF', 'PF_EE'],
  epfEr: ['EPF_ER', 'EPF_EMPLOYER'],
  eps: ['EPF_EPS'],
  esiEe: ['ESI_EE', 'ESI', 'ESIC_EE'],
  esiEr: ['ESI_ER', 'ESIC_ER'],
  pt: ['PT', 'PROFESSIONAL_TAX', 'PROF_TAX'],
  tds: ['TDS', 'INCOME_TAX'],
  lwfEe: ['LWF_EE', 'LWF'],
  lwfEr: ['LWF_ER'],
};

const money = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
const int = (n: number) => String(Math.round(n));

/**
 * India statutory filing formats generator.
 * format=ECR|FORM5|FORM10|ESI|PT|LWF|24Q|FORM16 (+month/year/companyId/runId)
 * download=1 returns the raw file as an attachment; default returns JSON summary.
 * POST registers a ComplianceFiling record for the audit trail.
 */
export async function GET(request: NextRequest) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    const decoded = await verifyToken(token);
    if (!decoded) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

    const { searchParams } = new URL(request.url);
    const format = (searchParams.get('format') || 'ECR').toUpperCase();
    const month = parseInt(searchParams.get('month') || '0');
    const year = parseInt(searchParams.get('year') || '0');
    const companyId = searchParams.get('companyId') || undefined;
    const runId = searchParams.get('runId') || undefined;
    const download = searchParams.get('download') === '1';

    if (!month || !year) {
      return Response.json({ error: 'month and year are required' }, { status: 400, headers: corsHeaders });
    }
    const period = `${year}-${String(month).padStart(2, '0')}`;

    const runs = await db.payrollRun.findMany({
      where: { payrollPeriod: period, ...(runId ? { id: runId } : {}), ...(companyId ? { companyId } : {}) },
      select: { id: true, companyId: true, legalEntityId: true },
    });
    const runIds = runs.map(r => r.id);

    // Build employee-wise statutory summary from transaction lines (fallback: legacy Payroll)
    const stats = new Map<string, EmpStat>();

    if (runIds.length > 0) {
      const lines = await db.payrollTransactionLine.findMany({
        where: { payrollRunId: { in: runIds }, isReversal: false },
        include: {
          employee: { include: { department: { select: { name: true } }, designation: { select: { title: true } } } },
        },
      });

      for (const line of lines) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const emp: Record<string, any> = line.employee;
        if (!emp) continue;
        const eid = line.employeeId as string;
        if (!stats.has(eid)) {
          stats.set(eid, {
            id: eid,
            code: emp.employeeId || eid,
            name: `${emp.firstName || ''} ${emp.lastName || ''}`.trim(),
            pan: emp.panNumber || '',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            uan: (emp as any).uanNumber || emp.panNumber || emp.aadhaarNumber || eid,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ip: (emp as any).esicIpNumber || emp.panNumber || eid,
            department: emp.department?.name || '—',
            designation: emp.designation?.title || '—',
            gross: 0, basicDa: 0, epfWage: 0,
            epfEe: 0, epfEr: 0, eps: 0, esiEe: 0, esiEr: 0, pt: 0, tds: 0, lwfEe: 0, lwfEr: 0,
            joinDate: emp.dateOfJoining || null,
            exitDate: (emp as Record<string, unknown>).lastWorkingDate as Date || null,
            state: emp.state || '',
          });
        }
        const s = stats.get(eid)!;
        const code = String(line.componentCode || '').toUpperCase();
        if (line.componentType === 'EARNING') {
          s.gross += line.finalAmount;
          if (code === 'BASIC' || code === 'DA' || code.startsWith('BASIC') || code.startsWith('DA_')) s.basicDa += line.finalAmount;
        } else if (line.componentType === 'DEDUCTION') {
          if (CODES.epfEe.includes(code)) { s.epfEe += line.finalAmount; }
          else if (CODES.esiEe.includes(code)) s.esiEe += line.finalAmount;
          else if (CODES.pt.includes(code)) s.pt += line.finalAmount;
          else if (CODES.tds.includes(code)) s.tds += line.finalAmount;
          else if (CODES.lwfEe.includes(code)) s.lwfEe += line.finalAmount;
        } else if (line.componentType === 'EMPLOYER_CONTRIB') {
          if (CODES.epfEr.includes(code)) s.epfEr += line.finalAmount;
          else if (CODES.eps.includes(code)) s.eps += line.finalAmount;
          else if (CODES.esiEr.includes(code)) s.esiEr += line.finalAmount;
          else if (CODES.lwfEr.includes(code)) s.lwfEr += line.finalAmount;
        }
      }
      // Derive EPF wage from EE share (12%) where not explicitly present
      for (const s of stats.values()) {
        if (s.epfEe > 0 && s.epfWage === 0) s.epfWage = s.epfEe / 0.12;
        if (s.epfWage === 0 && s.basicDa > 0) s.epfWage = Math.min(s.basicDa, EPF_WAGE_CEILING);
      }
    }

    // Fallback: legacy Payroll rows when no modern-run lines exist
    if (stats.size === 0) {
      const legacy = await db.payroll.findMany({
        where: { month, year, ...(companyId ? { employee: { companyId } } : {}) },
        include: { employee: { include: { department: { select: { name: true } } } } },
      });
      for (const p of legacy) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const emp: Record<string, any> = p.employee;
        if (!emp) continue;
        const ee = p.pf > 0 ? p.pf * 0.12 / 0.24 : 0; // legacy stored combined PF estimate
        stats.set(p.employeeId, {
          id: p.employeeId,
          code: emp.employeeId || p.employeeId,
          name: `${emp.firstName || ''} ${emp.lastName || ''}`.trim(),
          pan: emp.panNumber || '',
          uan: emp.panNumber || emp.aadhaarNumber || p.employeeId,
          ip: emp.panNumber || p.employeeId,
          department: emp.department?.name || '—',
          designation: '—',
          gross: p.grossSalary, basicDa: p.basicSalary,
          epfWage: Math.min(p.basicSalary, EPF_WAGE_CEILING),
          epfEe: ee, epfEr: ee, eps: ee * 0.6944,
          esiEe: p.esi || 0, esiEr: p.esi ? Math.ceil(p.grossSalary * 0.0325) : 0,
          pt: p.professionalTax || 0, tds: p.tax || 0, lwfEe: 0, lwfEr: 0,
          joinDate: emp.dateOfJoining || null,
          exitDate: null,
          state: emp.state || '',
        });
      }
    }

    const rows = [...stats.values()];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const company: Record<string, any> | null = runs[0]?.companyId
      ? await db.company.findUnique({ where: { id: runs[0].companyId } })
      : null;
    const companyName = company?.name || '3Boxes HRMS';
    const establishmentId = company?.registrationNo || 'KA-MH-XYZ-1234567-2026';

    // ─── Format generators ───
    let fileName = '';
    let contentType = 'text/plain; charset=utf-8';
    let content = '';
    let summary: Record<string, unknown> = {};

    if (format === 'ECR') {
      const header = `UAN#,MEMBER_NAME#,GROSS_WAGES#,EPF_WAGES#,EPS_WAGES#,EDLI_WAGES#,EE_SHARE(12%)#,ER_SHARE_EPS#,ER_SHARE_EPF#,NCP_DAYS`;
      const body = rows.filter(r => r.epfEe > 0 || r.epfEr > 0).map(r => {
        const eps = r.eps || r.epfEr * 0.6944;
        return [
          String(r.uan).replace(/[^A-Za-z0-9]/g, ''), r.name.slice(0, 30),
          int(r.gross), int(r.epfWage), int(r.epfWage), int(r.gross),
          int(r.epfEe), int(eps), int(Math.max(0, r.epfEr - eps)), 0,
        ].join('#');
      }).join('\n');
      content = `${header}\n${body}`;
      fileName = `EPF_ECR_${String(establishmentId).slice(0, 12).replace(/[^A-Za-z0-9]/g, '')}_${period}.txt`;
      summary = {
        totalMembers: rows.filter(r => r.epfEe > 0 || r.epfEr > 0).length,
        eeTotal: rows.reduce((s, r) => s + r.epfEe, 0),
        erTotal: rows.reduce((s, r) => s + r.epfEr, 0),
        epfWageTotal: rows.reduce((s, r) => s + r.epfWage, 0),
        wageCeiling: EPF_WAGE_CEILING,
        due: '15th of following month via EPFO portal (ECR upload)',
      };

    } else if (format === 'FORM5') {
      const joinedThisMonth = rows.filter(r => r.joinDate && new Date(r.joinDate).getMonth() + 1 === month && new Date(r.joinDate).getFullYear() === year);
      content = [
        `FORM 5 — EPF & MP Act 1952 (Para 36 & 37) — Return of members joining the service during the month`,
        `Establishment: ${companyName} (${establishmentId})   Month: ${period}`,
        '',
        'UAN,Name,Gross Wages,EPF Wages,Date of Joining',
        ...joinedThisMonth.map(r => `${r.uan},"${r.name}",${money(r.gross)},${money(r.epfWage)},${new Date(r.joinDate!).toISOString().slice(0, 10)}`),
      ].join('\n');
      fileName = `EPF_FORM5_${period}.csv`;
      contentType = 'text/csv; charset=utf-8';
      summary = { newJoinees: joinedThisMonth.length, due: 'With monthly ECR' };

    } else if (format === 'FORM10') {
      const exited = rows.filter(r => r.exitDate && new Date(r.exitDate).getMonth() + 1 === month && new Date(r.exitDate).getFullYear() === year);
      content = [
        `FORM 10 — EPF & MP Act 1952 (Para 36 & 37) — Return of members leaving service during the month`,
        `Establishment: ${companyName} (${establishmentId})   Month: ${period}`,
        '',
        'UAN,Name,EPF Wages,EPS Wages,Date of Exit,Reason of Exit',
        ...exited.map(r => `${r.uan},"${r.name}",${money(r.epfWage)},${money(r.epfWage)},${new Date(r.exitDate!).toISOString().slice(0, 10)},CEASED-EMPLOYMENT`),
      ].join('\n');
      fileName = `EPF_FORM10_${period}.csv`;
      contentType = 'text/csv; charset=utf-8';
      summary = { exits: exited.length, due: 'With monthly ECR' };

    } else if (format === 'ESI') {
      const esiRows = rows.filter(r => r.esiEe > 0 || r.esiEr > 0);
      content = [
        `ESI MONTHLY RETURN SUMMARY — ESIC Portal`,
        `Employer: ${companyName}   Month: ${period}   Wage limit: Rs.${ESI_WAGE_LIMIT}`,
        '',
        'IP Number,Name,Gross Wages,EE 0.75%,ER 3.25%,Total',
        ...esiRows.map(r => `${r.ip},"${r.name}",${money(r.gross)},${money(r.esiEe)},${money(r.esiEr)},${money(r.esiEe + r.esiEr)}`),
      ].join('\n');
      fileName = `ESI_RETURN_${period}.csv`;
      contentType = 'text/csv; charset=utf-8';
      summary = { ipCount: esiRows.length, eeTotal: rows.reduce((s, r) => s + r.esiEe, 0), erTotal: rows.reduce((s, r) => s + r.esiEr, 0), due: '15th of following month via ESIC portal' };

    } else if (format === 'PT') {
      const byState: Record<string, { count: number; total: number }> = {};
      for (const r of rows) {
        const st = r.state || 'UNKNOWN';
        byState[st] = byState[st] || { count: 0, total: 0 };
        byState[st].count++;
        byState[st].total += r.pt;
      }
      content = [
        `PROFESSIONAL TAX RETURN — ${period} (state-wise)`,
        `Employer: ${companyName}`,
        '',
        'State,Registered Persons,PT Deducted (INR),Notes',
        ...Object.entries(byState).map(([st, v]) => `${st},${v.count},${money(v.total)},${st === 'KA' ? 'Form 5 monthly via e-Prerana' : st === 'MH' ? 'MTR Form III monthly via Mahagst' : 'State PT portal format'}`),
      ].join('\n');
      fileName = `PT_RETURN_${period}.csv`;
      contentType = 'text/csv; charset=utf-8';
      summary = { byState, total: rows.reduce((s, r) => s + r.pt, 0), due: 'Varies by state (typically 10th-20th of following month)' };

    } else if (format === 'LWF') {
      const byState: Record<string, { ee: number; er: number }> = {};
      for (const r of rows) {
        const st = r.state || 'UNKNOWN';
        byState[st] = byState[st] || { ee: 0, er: 0 };
        byState[st].ee += r.lwfEe;
        byState[st].er += r.lwfEr;
      }
      content = [
        `LABOUR WELFARE FUND RETURN — ${period} (state-wise)`,
        `Employer: ${companyName}`,
        '',
        'State,Employee Contribution,Employer Contribution,Frequency',
        ...Object.entries(byState).map(([st, v]) => `${st},${money(v.ee)},${money(v.er)},${st === 'MH' ? 'Half-yearly (Jun & Dec)' : 'As per state LWF board'}`),
      ].join('\n');
      fileName = `LWF_RETURN_${period}.csv`;
      contentType = 'text/csv; charset=utf-8';
      summary = { byState, due: 'Jun/Dec remittance for half-yearly states; annual return per state board' };

    } else if (format === '24Q') {
      const quarter = month <= 3 ? 4 : Math.ceil(month / 3);
      const qMonths = quarter === 4 ? [1, 2, 3] : [quarter * 3 - 2, quarter * 3 - 1, quarter * 3];
      const qPeriods = qMonths.map(m => `${year}-${String(m).padStart(2, '0')}`);
      const fyLabel = month >= 4 ? `${year}-${String((year + 1) % 100).padStart(2, '0')}` : `${year - 1}-${String(year % 100).padStart(2, '0')}`;
      content = JSON.stringify({
        form: '24Q', financialYear: fyLabel,
        quarter, formType: 'SALARY_QUARTERLY',
        deductor: { name: companyName, tan: company?.taxId || 'MUMT00000A', pan: company?.taxId || '', address: company?.address || '' },
        challans: [],
        deducteeRows: rows.map(r => ({ pan: r.pan, name: r.name, grossQuarter: money(r.gross * qPeriods.length), tdsQuarter: money(r.tds * qPeriods.length), tdsPerPeriod: qPeriods })),
        note: 'Import this JSON into the NSDL RPU (e-TDS return preparation utility) to produce the .fvu file for upload to TRACES (tdscpc.gov.in).',
      }, null, 2);
      fileName = `FORM_24Q_Q${quarter}_${period}.json`;
      contentType = 'application/json; charset=utf-8';
      summary = { quarter, deductees: rows.length, totalTds: rows.reduce((s, r) => s + r.tds, 0), due: '31 July (Q1), 31 Oct (Q2), 31 Jan (Q3), 31 May (Q4) via TRACES' };

    } else if (format === 'FORM16') {
      const fyLabel = month >= 4 ? `${year}-${String((year + 1) % 100).padStart(2, '0')}` : `${year - 1}-${String(year % 100).padStart(2, '0')}`;
      const empRows = rows.map(r => `
        <tr><td>${r.code}</td><td>${r.name}</td><td>${r.pan || '—'}</td>
        <td style="text-align:right">${money(r.gross * 12)}</td>
        <td style="text-align:right">${money(r.tds * 12)}</td></tr>`).join('');
      content = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Form 16 ${fyLabel}</title>
<style>body{font-family:Georgia,serif;margin:40px;color:#111}h1{font-size:20px;border-bottom:3px solid #10b981;padding-bottom:8px}
table{border-collapse:collapse;width:100%;margin:16px 0;font-size:13px}th,td{border:1px solid #999;padding:6px 8px;text-align:left}
th{background:#ecfdf5}h2{font-size:15px;margin-top:28px}.meta{font-size:12px;color:#555}</style></head><body>
<h1>FORM 16 — Certificate under section 203 of the Income-tax Act, 1961 for tax deducted at source from income chargeable under the head "Salaries"</h1>
<p class="meta">Financial Year ${fyLabel} · Generated by 3Boxes HRMS on ${new Date().toISOString().slice(0, 10)} · Employer: ${companyName} (TAN: ${company?.taxId || '—'})</p>
<h2>PART A — Details of tax deducted &amp; deposited (Quarterly statement of TDS under section 206/206BA, from TRACES)</h2>
<table><tr><th>Employee Code</th><th>Employee Name</th><th>PAN</th><th>Estimated Annual Gross (INR)</th><th>Total TDS Deducted (INR)</th></tr>
${empRows}</table>
<p class="meta">Part A must be downloaded from TRACES after the Q4 24Q is processed — the figures above are computed from 3Boxes payroll records and serve as the pre-filing working sheet.</p>
<h2>PART B — Annexure: Detailed computation of salary income &amp; TDS (per employee)</h2>
<table><tr><th>Head</th><th>Amount (INR)</th></tr>
<tr><td>Gross Salary (Basic + DA + HRA + Allowances + Perquisites)</td><td style="text-align:right">${money(rows.reduce((s, r) => s + r.gross, 0) * 12)}</td></tr>
<tr><td>Exemptions (HRA 10(13A), LTA 10(5), gratuity 10(10))</td><td style="text-align:right">(as per declarations)</td></tr>
<tr><td>Deductions — 80C / 80D / 80CCD / 80E / 80G / 24(b)</td><td style="text-align:right">(as per verified declarations)</td></tr>
<tr><td>Professional Tax — deductible u/s 16(iii)</td><td style="text-align:right">${money(rows.reduce((s, r) => s + r.pt, 0) * 12)}</td></tr>
<tr><td>Net Taxable Salary</td><td style="text-align:right">(computed per employee in Income Tax module)</td></tr>
<tr><td>Tax on total income (regime elected: old/new)</td><td style="text-align:right">(Income Tax calculator)</td></tr>
<tr><td>Total TDS (26A) + 4% Health &amp; Education Cess</td><td style="text-align:right">${money(rows.reduce((s, r) => s + r.tds, 0) * 12)}</td></tr></table>
<p class="meta">Issue deadline: 15 June following the FY end (Rule 31(1)/s.203). Part A from TRACES + Part B from this annexure.</p>
</body></html>`;
      fileName = `FORM16_${fyLabel}.html`;
      contentType = 'text/html; charset=utf-8';
      summary = { fy: fyLabel, employees: rows.length, due: '15 June after FY end' };

    } else {
      return Response.json({ error: `Unknown format '${format}'. Supported: ECR, FORM5, FORM10, ESI, PT, LWF, 24Q, FORM16` }, { status: 400, headers: corsHeaders });
    }

    if (download) {
      return new Response(content, {
        headers: {
          ...corsHeaders,
          'Content-Type': contentType,
          'Content-Disposition': `attachment; filename="${fileName}"`,
        },
      });
    }

    return Response.json({
      format, period, fileName, summary,
      preview: content.slice(0, 2000),
      rowCount: rows.length,
    }, { headers: corsHeaders });
  } catch (error: unknown) {
    console.error('Error generating India statutory format:', error);
    return Response.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500, headers: corsHeaders });
  }
}

/** POST = register a ComplianceFiling record for the audit trail. */
export async function POST(request: NextRequest) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    const decoded = await verifyToken(token);
    if (!decoded) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

    const body = await request.json();
    const { format, month, year, filingAmount } = body;
    if (!format || !month || !year) {
      return Response.json({ error: 'format, month and year are required' }, { status: 400, headers: corsHeaders });
    }

    const period = `${year}-${String(month).padStart(2, '0')}`;
    const fmt = String(format).toUpperCase();

    let obligation = null;
    const obligations = await db.complianceObligation.findMany({ where: { countryCode: 'IND' } });
    const fmtMap: Record<string, string[]> = {
      ECR: ['EPF', 'ECR', 'PF'], FORM5: ['EPF', 'PF'], FORM10: ['EPF', 'PF'],
      ESI: ['ESI', 'ESIC'], PT: ['PT', 'PROFESSIONAL'], LWF: ['LWF', 'WELFARE'],
      '24Q': ['TDS', '24Q'], FORM16: ['TDS', '16'],
    };
    const keywords = fmtMap[fmt] || [fmt];
    obligation = obligations.find(o => keywords.some(k => `${o.name} ${o.filingFormat || ''}`.toUpperCase().includes(k))) || obligations[0] || null;

    if (!obligation) {
      obligation = await db.complianceObligation.create({
        data: {
          name: fmt === 'ECR' ? 'EPF Monthly Return (ECR)' : fmt === '24Q' ? 'TDS Quarterly Return (Form 24Q)' : fmt === 'FORM16' ? 'Form 16 Annual Certificate' : `India ${fmt} Filing`,
          countryCode: 'IND',
          authorityName: fmt === 'ECR' || fmt === 'FORM5' || fmt === 'FORM10' ? 'EPFO' : fmt === 'ESI' ? 'ESIC' : fmt === '24Q' || fmt === 'FORM16' ? 'Income Tax Dept' : 'State PT/LWF Board',
          filingType: fmt === 'FORM16' ? 'CERTIFICATE' : 'RETURN',
          frequency: fmt === '24Q' ? 'QUARTERLY' : fmt === 'FORM16' ? 'ANNUAL' : 'MONTHLY',
          dueDateRule: 'D+15', filingFormat: fmt,
        },
      });
    }

    const filing = await db.complianceFiling.create({
      data: {
        complianceId: obligation.id,
        filingPeriod: period,
        filingStatus: 'GENERATED',
        filingAmount: Number(filingAmount) || null,
        generatedDate: new Date(),
        submittedBy: (decoded as Record<string, unknown>).userId as string,
      },
    });

    return Response.json({ data: filing, message: `${fmt} filing registered for ${period}` }, { status: 201, headers: corsHeaders });
  } catch (error: unknown) {
    console.error('Error registering India filing:', error);
    return Response.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500, headers: corsHeaders });
  }
}
