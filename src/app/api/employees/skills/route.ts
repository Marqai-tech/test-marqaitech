import { NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

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

// GET /api/employees/skills[?q=&level=&companyId=]
// Skill inventory search — powers the resource-request skill picker + matchmaking UI.
// Returns distinct skills with holder counts + levels, and (when ?q= or ?withEmployees=1)
// the matching employees carrying those skills (live profiles from the HRMS database).
export async function GET(request: Request) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    const decoded = token ? await verifyToken(token) : null;
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });

    const { searchParams } = new URL(request.url);
    const q = (searchParams.get('q') || '').trim();
    const companyId = searchParams.get('companyId') || null;
    const withEmployees = searchParams.get('withEmployees') === '1';

    const skillRows = await db.employeeSkill.findMany({
      where: q ? { skill: { contains: q, mode: 'insensitive' } } : {},
      select: { skill: true, level: true, yearsOfExp: true, employee: { select: { id: true, companyId: true, status: true } } },
      take: 5000,
    });

    // aggregate distinct skills
    const bySkill = new Map<string, { skill: string; holders: number; maxLevel: string; avgYears: number }>();
    const LEVEL_RANK: Record<string, number> = { beginner: 1, intermediate: 2, advanced: 3, expert: 4 };
    const years: Record<string, { total: number; count: number }> = {};
    for (const row of skillRows) {
      if (companyId && row.employee?.companyId !== companyId) continue;
      if (row.employee?.status === 'terminated') continue;
      const key = row.skill.trim();
      const existing = bySkill.get(key);
      if (!existing) {
        bySkill.set(key, { skill: key, holders: 1, maxLevel: row.level, avgYears: 0 });
        years[key] = { total: row.yearsOfExp || 0, count: row.yearsOfExp ? 1 : 0 };
      } else {
        existing.holders++;
        if ((LEVEL_RANK[row.level] || 0) > (LEVEL_RANK[existing.maxLevel] || 0)) existing.maxLevel = row.level;
        years[key].total += row.yearsOfExp || 0;
        if (row.yearsOfExp) years[key].count++;
      }
    }
    const skills = Array.from(bySkill.values())
      .map((s) => ({ ...s, avgYears: years[s.skill].count ? Math.round((years[s.skill].total / years[s.skill].count) * 10) / 10 : 0 }))
      .sort((a, b) => b.holders - a.holders)
      .slice(0, 100);

    let employees: any[] = [];
    if (withEmployees) {
      const empRows = await db.employee.findMany({
        where: {
          status: { not: 'terminated' },
          ...(companyId ? { companyId } : {}),
          ...(q ? { skills: { some: { skill: { contains: q, mode: 'insensitive' } } } } : {}),
        },
        select: {
          id: true, firstName: true, lastName: true, employeeId: true, timezone: true, defaultWeeklyHours: true,
          designation: { select: { title: true } },
          department: { select: { name: true } },
          skills: { select: { skill: true, level: true, yearsOfExp: true } },
        },
        take: 100,
      });
      employees = empRows.map((e: any) => ({
        id: e.id,
        name: `${e.firstName || ''} ${e.lastName || ''}`.trim(),
        employeeCode: e.employeeId,
        designation: e.designation?.title || null,
        department: e.department?.name || null,
        timezone: e.timezone,
        skills: e.skills,
      }));
    }

    return NextResponse.json({ skills, employees }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Skills search error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
