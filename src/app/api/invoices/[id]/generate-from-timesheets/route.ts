import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { ensureSchemaSynced, withSchemaSync } from '@/lib/schema-sync';
import { convertCurrency } from '@/lib/fx';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

// ─── POST /api/invoices/[id]/generate-from-timesheets ─────────────
// Auto-generate InvoiceLineItems from approved Timesheets in the given
// date range, optionally filtered by projectId / employeeId.
//
// For each approved timesheet row, we:
//   1. Find the matching ProjectAllocation to get the billingRate (in
//      project.currency).
//   2. Use convertCurrency() to translate billingRate into the invoice's
//      currency (which may differ from project.currency).
//   3. Create an InvoiceLineItem with:
//        - hours = timesheet.hours
//        - rate  = converted billingRate (in invoice.currency)
//        - amount = hours * rate
//        - rateSourceCurrency = project.currency
//        - rateSourceAmount   = original billingRate
//        - fxRate             = conversion rate
//   4. Mark the timesheet as invoiced (TODO: add invoiced flag to Timesheet
//      in the schema fix task — for now we track linkage via the
//      InvoiceLineItem.timesheetId FK only).
//
// Body:
//   { dateFrom, dateTo, projectId?, employeeId?, overwrite?: boolean }
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureSchemaSynced();

    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    }
    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    }

    const { id } = await params;
    const body = await request.json();
    const { dateFrom, dateTo, projectId, employeeId, overwrite } = body;

    if (!dateFrom || !dateTo) {
      return NextResponse.json(
        { error: 'Missing required fields: dateFrom, dateTo' },
        { status: 400, headers: corsHeaders() }
      );
    }

    const invoice = await withSchemaSync(() => prisma.invoice.findUnique({ where: { id } }));
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404, headers: corsHeaders() });
    }
    if (invoice.status !== 'draft') {
      return NextResponse.json(
        { error: `Cannot generate lines for ${invoice.status} invoice (must be draft)` },
        { status: 400, headers: corsHeaders() }
      );
    }

    // Optionally clear existing timesheet-sourced lines first
    if (overwrite) {
      await withSchemaSync(() =>
        prisma.invoiceLineItem.deleteMany({
          where: { invoiceId: id, sourceType: 'timesheet' },
        })
      );
    }

    // Query approved timesheets in the date range, optionally filtered by
    // project (matched against the Timesheet.project string field — it's
    // currently a free-text String per the existing schema; we match by
    // project name OR by ProjectAllocation to find the project).
    const timesheetWhere: Record<string, unknown> = {
      status: 'approved',
      date: { gte: new Date(dateFrom), lte: new Date(dateTo) },
    };
    if (employeeId) timesheetWhere.employeeId = employeeId;

    const timesheets = await withSchemaSync(() => prisma.timesheet.findMany({ where: timesheetWhere }));

    // Filter timesheets to those whose project string matches the requested
    // projectId (we look up the project name from the DB and match by name).
    let filteredTimesheets = timesheets;
    if (projectId) {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true, name: true, currency: true, billingRate: true, billingType: true },
      });
      if (project) {
        filteredTimesheets = timesheets.filter((t) => {
          // Match by project name (loose) or by allocation lookup
          if (t.project && project.name && t.project.toLowerCase() === project.name.toLowerCase()) {
            return true;
          }
          return false;
        });
      }
    }

    if (filteredTimesheets.length === 0) {
      return NextResponse.json({
        message: 'No approved timesheets found in the given range',
        lineItemsCreated: 0,
        lineItems: [],
      }, { headers: corsHeaders() });
    }

    // Group timesheets by (employeeId, date) — we'll create one line item per day per employee
    // (consolidating into daily entries keeps the invoice readable).
    // NOTE: The current Timesheet schema has @@unique([employeeId, date]) so there's
    // only one row per employee per day, but we still group for safety.
    const grouped = new Map<string, typeof filteredTimesheets>();
    for (const t of filteredTimesheets) {
      const key = `${t.employeeId}|${t.date.toISOString().split('T')[0]}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(t);
    }

    // Pre-fetch all employees + allocations to avoid N+1 queries
    const employeeIds = Array.from(new Set(filteredTimesheets.map((t) => t.employeeId)));
    const [employees, allocations] = await Promise.all([
      prisma.employee.findMany({
        where: { id: { in: employeeIds } },
        select: { id: true, firstName: true, lastName: true, employeeId: true },
      }),
      prisma.projectAllocation.findMany({
        where: {
          employeeId: { in: employeeIds },
          // Active during the invoice period
          startDate: { lte: new Date(dateTo) },
          OR: [
            { endDate: null },
            { endDate: { gte: new Date(dateFrom) } },
          ],
        },
      }),
    ]);

    const empMap = new Map(employees.map((e) => [e.id, e]));
    const allocMap = new Map<string, typeof allocations>();
    for (const a of allocations) {
      const key = `${a.employeeId}|${a.projectId}`;
      if (!allocMap.has(key)) allocMap.set(key, []);
      allocMap.get(key)!.push(a);
    }

    // Determine the source currency for rates: project.currency (if projectId)
    let sourceCurrency = invoice.currency;
    let defaultBillingRate = 0;
    if (projectId) {
      const p = await prisma.project.findUnique({ where: { id: projectId }, select: { currency: true, billingRate: true } });
      if (p) {
        sourceCurrency = p.currency;
        defaultBillingRate = p.billingRate || 0;
      }
    }

    const lineItemsCreated = [];
    let warnings: string[] = [];

    for (const [key, dailyTimesheets] of grouped.entries()) {
      const [employeeId, dateStr] = key.split('|');
      const emp = empMap.get(employeeId);
      if (!emp) continue;

      const totalHours = dailyTimesheets.reduce((s, t) => s + (t.hours || 0), 0);
      if (totalHours <= 0) continue;

      // Find billing rate for this employee on the project
      let billingRate = defaultBillingRate;
      let rateSourceCurrency = sourceCurrency;
      if (projectId) {
        const empAllocs = allocMap.get(`${employeeId}|${projectId}`) || [];
        if (empAllocs.length > 0) {
          // Use the most recent allocation
          const alloc = empAllocs.sort((a, b) => b.startDate.getTime() - a.startDate.getTime())[0];
          if (alloc.billingRate) billingRate = alloc.billingRate;
          if (alloc.billingStatus === 'non_billable') {
            warnings.push(`${emp.firstName} ${emp.lastName} on ${dateStr}: non-billable allocation — skipped`);
            continue;
          }
        }
      }

      // Convert rate from source currency to invoice currency if different
      let rateInInvoiceCurrency = billingRate;
      let fxRate: number | null = null;
      if (rateSourceCurrency && rateSourceCurrency !== invoice.currency) {
        const fx = await convertCurrency(billingRate, rateSourceCurrency, invoice.currency, {
          rateDate: invoice.issueDate,
        });
        rateInInvoiceCurrency = fx.amount;
        fxRate = fx.rate;
        if (fx.warning) warnings.push(`${emp.firstName} ${emp.lastName} on ${dateStr}: ${fx.warning}`);
      }

      const amount = round(rateInInvoiceCurrency * totalHours);
      const baseCur = invoice.baseCurrency || invoice.currency;
      const amountBase = baseCur === invoice.currency ? amount : round(amount / (invoice.exchangeRate || 1));

      const description = `${emp.firstName} ${emp.lastName} — ${totalHours.toFixed(2)}h on ${dateStr}${dailyTimesheets[0].description ? ` (${dailyTimesheets[0].description.substring(0, 60)})` : ''}`;

      const lineItem = await withSchemaSync(() =>
        prisma.invoiceLineItem.create({
          data: {
            invoiceId: id,
            sourceType: 'timesheet',
            timesheetId: dailyTimesheets[0].id,
            projectId: projectId || null,
            employeeId,
            description,
            date: new Date(dateStr),
            hours: totalHours,
            quantity: totalHours,
            unit: 'hours',
            rate: rateInInvoiceCurrency,
            rateSourceCurrency,
            rateSourceAmount: billingRate,
            fxRate,
            amount,
            amountBase,
            taxable: true,
          },
        })
      );
      lineItemsCreated.push(lineItem);
    }

    // Recalc invoice totals
    await recalcInvoiceTotals(id);

    await prisma.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'GENERATE_INVOICE_FROM_TIMESHEETS',
        module: 'invoices',
        details: `Generated ${lineItemsCreated.length} line items for ${invoice.invoiceNumber} from approved timesheets (${dateFrom} → ${dateTo})`,
      },
    });

    return NextResponse.json({
      lineItemsCreated: lineItemsCreated.length,
      lineItems: lineItemsCreated,
      warnings,
    }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Generate from timesheets error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

async function recalcInvoiceTotals(invoiceId: string): Promise<void> {
  const [invoice, lineItems] = await Promise.all([
    prisma.invoice.findUnique({ where: { id: invoiceId } }),
    prisma.invoiceLineItem.findMany({ where: { invoiceId } }),
  ]);
  if (!invoice) return;

  const subtotal = lineItems.reduce((s, l) => s + l.amount, 0);
  const taxableSubtotal = lineItems.filter((l) => l.taxable).reduce((s, l) => s + l.amount, 0);
  const taxAmount = round(taxableSubtotal * (invoice.taxRate / 100));
  const discountAmount = round(subtotal * (invoice.discountRate / 100));
  const totalAmount = round(subtotal + taxAmount - discountAmount);
  const baseCur = invoice.baseCurrency || invoice.currency;
  const subtotalBase = baseCur === invoice.currency ? subtotal : round(subtotal / (invoice.exchangeRate || 1));
  const totalAmountBase = baseCur === invoice.currency ? totalAmount : round(totalAmount / (invoice.exchangeRate || 1));

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { subtotal, taxAmount, discountAmount, totalAmount, subtotalBase, totalAmountBase },
  });
}

function round(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
