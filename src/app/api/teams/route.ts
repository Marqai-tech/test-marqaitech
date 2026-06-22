import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

/**
 * GET /api/teams?type=virtual|crew|shift&companyId=xxx
 * Returns the list of teams. Employees see teams they're a member of;
 * admins see all teams.
 */
export async function GET(request: NextRequest) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const teamType = searchParams.get('type');
    const companyId = searchParams.get('companyId');

    const where: Record<string, unknown> = { isActive: true };
    if (teamType) where.teamType = teamType;
    if (companyId) where.companyId = companyId;

    // Non-admins: only teams they're a member of (or teams they lead)
    if (!['super_admin', 'tenant_admin', 'hr_admin'].includes(decoded.role)) {
      const employee = await prisma.employee.findFirst({ where: { userId: decoded.id } });
      if (employee) {
        where.OR = [
          { leadId: employee.id },
          { members: { some: { employeeId: employee.id, leftAt: null } } },
        ];
      }
    }

    const teams = await prisma.team.findMany({
      where,
      include: {
        lead: { select: { id: true, firstName: true, lastName: true, email: true, avatar: true } },
        members: {
          where: { leftAt: null },
          include: {
            employee: { select: { id: true, firstName: true, lastName: true, email: true, avatar: true, designation: { select: { title: true } } } },
          },
        },
        _count: { select: { members: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ teams });
  } catch (error) {
    console.error('GET /api/teams error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/teams
 * Body: { name, description?, teamType?, companyId?, leadId?, memberIds?: string[] }
 */
export async function POST(request: NextRequest) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const body = await request.json();
    const { name, description, teamType = 'virtual', companyId, leadId, memberIds = [] } = body;
    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

    // Resolve creator employee ID
    const creator = await prisma.employee.findFirst({ where: { userId: decoded.id } });
    const creatorId = creator?.id || leadId;

    const team = await prisma.team.create({
      data: {
        name,
        description,
        teamType,
        companyId,
        leadId: leadId || creatorId,
        members: memberIds.length > 0 ? {
          create: memberIds.map((empId: string) => ({
            employeeId: empId,
            role: empId === (leadId || creatorId) ? 'lead' : 'member',
          })),
        } : undefined,
      },
      include: { members: true },
    });

    return NextResponse.json({ team }, { status: 201 });
  } catch (error) {
    console.error('POST /api/teams error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
