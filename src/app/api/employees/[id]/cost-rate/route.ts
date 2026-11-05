import { NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { encryptField, decryptNumber } from '@/lib/encryption';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

// GET /api/employees/[id]/cost-rate
// Encrypted, role-based backend field — financial values only revealed to
// admins (tenant_admin/super_admin/admin/finance). Managers see availability
// structure (weekly hours) but NOT the rates.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    const decoded = token ? await verifyToken(token) : null;
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    const { id } = await params;

    const role = (decoded as any).role;
    const canSeeRates = ['tenant_admin', 'ceo', 'super_admin', 'admin', 'finance'].includes(role);

    const row = await db.employeeCostRate.findFirst({
      where: { employeeId: id, isActive: true },
      orderBy: { effectiveFrom: 'desc' },
    });

    const base = {
      employeeId: id,
      weeklyHours: row?.weeklyHours ?? 40,
      currency: row?.currency ?? 'INR',
      effectiveFrom: row?.effectiveFrom ?? null,
    };

    if (!row) return NextResponse.json({ costRate: { ...base, hourlyCostRate: null, hourlyBillableRate: null }, canSeeRates }, { headers: corsHeaders() });

    if (!canSeeRates) {
      return NextResponse.json({ costRate: { ...base, hourlyCostRate: undefined, hourlyBillableRate: undefined }, canSeeRates }, { headers: corsHeaders() });
    }

    return NextResponse.json(
      {
        costRate: {
          ...base,
          id: row.id,
          hourlyCostRate: decryptNumber(row.hourlyCostRateEnc),
          hourlyBillableRate: decryptNumber(row.hourlyBillableRateEnc),
        },
        canSeeRates,
      },
      { headers: corsHeaders() }
    );
  } catch (error) {
    console.error('Get cost rate error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

// PUT /api/employees/[id]/cost-rate  { hourlyCostRate, hourlyBillableRate?, weeklyHours?, currency? }
// Admin-only. Values stored AES-256-GCM encrypted; prior row is deactivated (history preserved).
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    const decoded = token ? await verifyToken(token) : null;
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    const role = (decoded as any).role;
    if (!['tenant_admin', 'ceo', 'super_admin', 'admin', 'finance'].includes(role)) {
      return NextResponse.json({ error: 'Only administrators/finance can modify cost rates' }, { status: 403, headers: corsHeaders() });
    }
    const { id } = await params;

    const employee = await db.employee.findUnique({ where: { id }, select: { id: true } });
    if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404, headers: corsHeaders() });

    const body = await request.json();
    const hourlyCostRate = Number(body.hourlyCostRate);
    if (!Number.isFinite(hourlyCostRate) || hourlyCostRate < 0) {
      return NextResponse.json({ error: 'hourlyCostRate must be a non-negative number' }, { status: 400, headers: corsHeaders() });
    }
    const hourlyBillableRate = body.hourlyBillableRate !== undefined && body.hourlyBillableRate !== null ? Number(body.hourlyBillableRate) : null;
    if (hourlyBillableRate !== null && (!Number.isFinite(hourlyBillableRate) || hourlyBillableRate < 0)) {
      return NextResponse.json({ error: 'hourlyBillableRate must be a non-negative number' }, { status: 400, headers: corsHeaders() });
    }
    const weeklyHours = Math.max(1, Math.min(80, Number(body.weeklyHours) || 40));

    // deactivate current row, create new (effective-dated history)
    await db.employeeCostRate.updateMany({ where: { employeeId: id, isActive: true }, data: { isActive: false } });
    const row = await db.employeeCostRate.create({
      data: {
        employeeId: id,
        hourlyCostRateEnc: encryptField(hourlyCostRate) as string,
        hourlyBillableRateEnc: hourlyBillableRate !== null ? encryptField(hourlyBillableRate) : null,
        weeklyHours,
        currency: body.currency || 'INR',
        effectiveFrom: new Date(),
        isActive: true,
      },
    });

    await db.auditLog.create({
      data: {
        userId: (decoded as any).userId as string,
        action: 'UPDATE_COST_RATE',
        module: 'projects',
        details: `Cost rate updated for employee ${id} (encrypted at rest)`,
      },
    }).catch(() => null);

    return NextResponse.json({ costRate: { id: row.id, employeeId: id, hourlyCostRate, hourlyBillableRate, weeklyHours, currency: row.currency, effectiveFrom: row.effectiveFrom } }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Update cost rate error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

// PATCH /api/employees/[id]/cost-rate — timezone / weekly-hours profile alignment
// Body: { timezone?, defaultWeeklyHours? } — geographic & shift alignment data
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    const decoded = token ? await verifyToken(token) : null;
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    const { id } = await params;

    const role = (decoded as any).role;
    const isSelf = (decoded as any).userId
      ? (await db.employee.findUnique({ where: { userId: (decoded as any).userId }, select: { id: true } }))?.id === id
      : false;
    if (!['tenant_admin', 'ceo', 'super_admin', 'admin', 'manager'].includes(role) && !isSelf) {
      return NextResponse.json({ error: 'Not authorized to update this profile data' }, { status: 403, headers: corsHeaders() });
    }

    const body = await request.json();
    const data: Record<string, unknown> = {};
    if (body.timezone !== undefined) {
      const tz = String(body.timezone || '').trim();
      if (tz) {
        try { new Intl.DateTimeFormat('en', { timeZone: tz }); } catch {
          return NextResponse.json({ error: `Invalid IANA timezone "${tz}"` }, { status: 400, headers: corsHeaders() });
        }
      }
      data.timezone = tz || null;
    }
    if (body.defaultWeeklyHours !== undefined) {
      const wh = Number(body.defaultWeeklyHours);
      if (!Number.isFinite(wh) || wh < 1 || wh > 80) {
        return NextResponse.json({ error: 'defaultWeeklyHours must be between 1 and 80' }, { status: 400, headers: corsHeaders() });
      }
      data.defaultWeeklyHours = Math.round(wh);
    }

    const employee = await db.employee.update({ where: { id }, data, select: { id: true, timezone: true, defaultWeeklyHours: true } });
    return NextResponse.json({ employee }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Update geo alignment error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
