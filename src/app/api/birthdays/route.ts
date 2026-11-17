import { NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { ensureBirthdayTables, birthdayMonthDay, istToday } from '@/lib/birthday-greetings';

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
 * Task 136 — birthday data for the self-service dashboard section.
 * Task 138 — WIDENED:
 *  - `thisMonth` = EVERY active employee whose birthday falls in the CURRENT
 *    month (shown for the whole month, not just near the day).
 *  - Original Birthday fallback: employees whose Original Birthday was never
 *    filled now fall back to their Date of Birth automatically (the DOB value
 *    can still be overridden per-employee by HR/Employee via Original Birthday).
 * `today`   = active employees whose (effective) birthday is today (IST).
 * `upcoming`= the next 45 days AFTER the current month ends, nearest first.
 * Visible to EVERY logged-in user — sending wishes is for all user logins.
 */
export async function GET(request: Request) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    }
    const decoded = (await verifyToken(token)) as { userId?: string; tenantId?: string | null } | null;
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    }

    const ddlErrors = await ensureBirthdayTables(db);
    const { year, month } = istToday();
    const todayMd = birthdayMonthDay(new Date(`${istToday().dateKey}T00:00:00Z`))!;

    // Task 138 — effective birthday = Original Birthday ?? Date of Birth.
    const employees = await db.employee.findMany({
      where: {
        status: 'active',
        OR: [{ originalBirthday: { not: null } }, { dateOfBirth: { not: null } }],
      },
      select: {
        id: true, firstName: true, lastName: true, employeeId: true, email: true,
        userId: true, avatar: true, originalBirthday: true, dateOfBirth: true,
        department: { select: { name: true } },
        designation: { select: { title: true } },
        // Task 149 — photos are often on the linked User record (my-profile
        // upload) — fall back to it so the birthday card shows real photos.
        user: { select: { avatar: true } },
      },
    });

    const upcomingWithDays: Array<{ emp: any; daysUntil: number; md: { month: number; day: number } }> = [];
    const today: any[] = [];
    const thisMonth: Array<{ emp: any; dayOfMonth: number }> = [];
    for (const e of employees) {
      // Original Birthday wins; Date of Birth is the automatic fallback.
      const effective = e.originalBirthday || e.dateOfBirth;
      const md = birthdayMonthDay(effective);
      if (!md) continue;
      (e as any).effectiveBirthday = effective;
      if (md.month === todayMd.month && md.day === todayMd.day) {
        today.push(e);
        continue;
      }
      if (md.month === month) {
        // Rest of the current month — listed until the month ends.
        thisMonth.push({ emp: e, dayOfMonth: md.day });
        continue;
      }
      // days until this year's (or next year's) occurrence
      const thisYear = new Date(Date.UTC(year, md.month - 1, md.day));
      const nowUtc = new Date(`${istToday().dateKey}T00:00:00Z`);
      let next = thisYear;
      if (next.getTime() < nowUtc.getTime()) next = new Date(Date.UTC(year + 1, md.month - 1, md.day));
      const daysUntil = Math.round((next.getTime() - nowUtc.getTime()) / 86400000);
      if (daysUntil <= 45) upcomingWithDays.push({ emp: e, daysUntil, md });
    }
    upcomingWithDays.sort((a, b) => a.daysUntil - b.daysUntil);
    thisMonth.sort((a, b) => a.dayOfMonth - b.dayOfMonth);

    // Wishes are fetched for today + the whole month so the mini wishes-feed
    // and wish counts stay accurate all month long.
    const wishIds = [...today.map((e) => e.id), ...thisMonth.map((t) => t.emp.id)];
    const greetings = wishIds.length
      ? await db.birthdayGreeting.findMany({
          where: { employeeId: { in: wishIds }, year },
          select: { employeeId: true, source: true, senderUserId: true, senderName: true, message: true, createdAt: true },
        }).catch(() => [])
      : [];

    const shape = (e: any) => ({
      employeeId: e.id,
      name: `${e.firstName || ''} ${e.lastName || ''}`.trim(),
      employeeCode: e.employeeId || '',
      department: e.department?.name || null,
      designation: e.designation?.title || null,
      avatar: e.avatar || e.user?.avatar || null,
      originalBirthday: e.originalBirthday,
      dateOfBirth: e.dateOfBirth,
      birthdaySource: e.originalBirthday ? 'original_birthday' : 'date_of_birth',
      hasLogin: Boolean(e.userId),
    });

    const decorate = (e: any) => {
      const wishes = greetings.filter((g: any) => g.employeeId === e.id);
      return {
        ...shape(e),
        wishes: wishes.map((g: any) => ({ senderName: g.senderName || 'A colleague', source: g.source, message: g.message || null })),
        wishCount: wishes.length,
        wishedByMe: wishes.some((g: any) => g.senderUserId && g.senderUserId === decoded!.userId),
      };
    };

    const todayOut = today.map(decorate);
    const thisMonthOut = thisMonth.map(({ emp, dayOfMonth }) => ({ ...decorate(emp), dayOfMonth }));

    return NextResponse.json({
      today: todayOut,
      thisMonth: thisMonthOut,
      upcoming: upcomingWithDays.slice(0, 12).map(({ emp, daysUntil }) => ({ ...shape(emp), daysUntil })),
      date: istToday().dateKey,
      ...(ddlErrors.length ? { warnings: ddlErrors } : {}),
    }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Birthdays GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
