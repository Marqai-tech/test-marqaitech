import { NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { ensureBirthdayTables, birthdayMonthDay, istToday, deliverBirthdayGreeting } from '@/lib/birthday-greetings';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

/**
 * Task 136 — "Send wishes" from the self-service dashboard. Available to ALL
 * logged-in users (employee, manager, HR, CEO — everyone). One wish per
 * sender per birthday year (idempotent re-taps return alreadyWished).
 * Delivery = BirthdayGreeting row + bell notification + a small greeting-card
 * email to the employee.
 */
export async function POST(request: Request) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    }
    const decoded = (await verifyToken(token)) as { userId?: string; email?: string; tenantId?: string | null } | null;
    if (!decoded?.userId) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    }

    const body = await request.json().catch(() => ({}));
    const employeeId = String(body?.employeeId || '');
    const message = body?.message ? String(body.message).slice(0, 300) : null;
    if (!employeeId) {
      return NextResponse.json({ error: 'employeeId is required' }, { status: 400, headers: corsHeaders() });
    }

    const ddlErrors = await ensureBirthdayTables(db);

    const employee = await db.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, firstName: true, lastName: true, email: true, userId: true, status: true, originalBirthday: true, dateOfBirth: true },
    });
    if (!employee || employee.status !== 'active') {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404, headers: corsHeaders() });
    }
    // Task 138 — effective birthday: Original Birthday first, then the
    // automatic Date-of-Birth fallback (so an unfilled Original Birthday no
    // longer blocks wishes).
    const effectiveBirthday = employee.originalBirthday || employee.dateOfBirth;
    if (!effectiveBirthday) {
      return NextResponse.json({ error: 'No birth date recorded for this employee yet' }, { status: 400, headers: corsHeaders() });
    }

    // Wishes are a birthday-day affair (IST).
    const { year } = istToday();
    const todayMd = birthdayMonthDay(new Date(`${istToday().dateKey}T00:00:00Z`))!;
    const bdMd = birthdayMonthDay(effectiveBirthday);
    if (!bdMd || bdMd.month !== todayMd.month || bdMd.day !== todayMd.day) {
      return NextResponse.json({ error: "It's not this employee's birthday today — wishes open on the day" }, { status: 400, headers: corsHeaders() });
    }

    // One wish per sender per year.
    const existing = await db.birthdayGreeting.findFirst({
      where: { employeeId: employee.id, year, source: 'manual', senderUserId: decoded.userId },
    }).catch(() => null);
    if (existing) {
      return NextResponse.json({ success: true, alreadyWished: true, message: 'You already sent your wishes this year' }, { headers: corsHeaders() });
    }

    // Sender label: employee row if the account has one, else the email handle.
    const senderEmp = await db.employee.findUnique({
      where: { userId: decoded.userId },
      select: { firstName: true, lastName: true },
    }).catch(() => null);
    const senderName =
      `${senderEmp?.firstName || ''} ${senderEmp?.lastName || ''}`.trim() ||
      String(decoded.email || '').split('@')[0] ||
      'A colleague';

    const tenantName = await db.tenant.findFirst({ select: { name: true } }).then((t: any) => t?.name || '').catch(() => '');

    const result = await deliverBirthdayGreeting({
      db,
      tenantId: decoded.tenantId || '',
      tenantName,
      employee,
      year,
      source: 'manual',
      senderUserId: decoded.userId,
      senderName,
      message,
    });

    const warnings = [...result.errors, ...ddlErrors];
    return NextResponse.json({
      success: true,
      alreadyWished: false,
      delivered: { notifications: result.notifications, emails: result.emails },
      ...(warnings.length ? { warnings } : {}),
    }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Birthday wish POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
