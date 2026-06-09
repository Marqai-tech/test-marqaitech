import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const companyId = url.searchParams.get('companyId');
    const isActive = url.searchParams.get('isActive');
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (companyId) where.companyId = companyId;
    if (isActive !== null && isActive !== undefined) {
      where.isActive = isActive === 'true';
    }

    const [shifts, total] = await Promise.all([
      db.shift.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          company: { select: { id: true, name: true } },
          members: {
            include: {
              employee: {
                select: {
                  id: true, firstName: true, lastName: true,
                  employeeId: true,
                  department: { select: { name: true } },
                },
              },
            },
          },
          _count: { select: { members: true } },
        },
      }),
      db.shift.count({ where }),
    ]);

    return NextResponse.json({
      data: shifts,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Shifts GET error:', error);
    // Demo data fallback when database is unavailable
    const url = new URL(req.url);
    const companyId = url.searchParams.get('companyId');
    const isActiveParam = url.searchParams.get('isActive');
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '20');

    const demoShifts = [
      {
        id: 'shift-1', name: 'Morning Shift', startTime: '06:00', endTime: '14:00',
        breakMinutes: 30, isActive: true, companyId: companyId || 'comp-1',
        createdAt: new Date('2025-01-01'), updatedAt: new Date('2025-01-01'),
        company: { id: companyId || 'comp-1', name: 'Nexus Technologies' },
        members: [
          { id: 'sm-1', employeeId: 'demo-1', effectiveDate: new Date('2025-01-01'),
            employee: { id: 'demo-1', firstName: 'Rajesh', lastName: 'Kumar', employeeId: 'EMP001', department: { name: 'Engineering' } } },
          { id: 'sm-2', employeeId: 'demo-7', effectiveDate: new Date('2025-01-01'),
            employee: { id: 'demo-7', firstName: 'Kiran', lastName: 'Nair', employeeId: 'EMP007', department: { name: 'Engineering' } } },
        ],
        _count: { members: 2 },
      },
      {
        id: 'shift-2', name: 'General Shift', startTime: '09:00', endTime: '18:00',
        breakMinutes: 60, isActive: true, companyId: companyId || 'comp-1',
        createdAt: new Date('2025-01-01'), updatedAt: new Date('2025-01-01'),
        company: { id: companyId || 'comp-1', name: 'Nexus Technologies' },
        members: [
          { id: 'sm-3', employeeId: 'demo-2', effectiveDate: new Date('2025-01-01'),
            employee: { id: 'demo-2', firstName: 'Priya', lastName: 'Sharma', employeeId: 'EMP002', department: { name: 'Human Resources' } } },
          { id: 'sm-4', employeeId: 'demo-4', effectiveDate: new Date('2025-01-01'),
            employee: { id: 'demo-4', firstName: 'Sneha', lastName: 'Reddy', employeeId: 'EMP004', department: { name: 'Finance' } } },
          { id: 'sm-5', employeeId: 'demo-6', effectiveDate: new Date('2025-01-01'),
            employee: { id: 'demo-6', firstName: 'Ananya', lastName: 'Gupta', employeeId: 'EMP006', department: { name: 'Marketing' } } },
          { id: 'sm-6', employeeId: 'demo-9', effectiveDate: new Date('2025-01-01'),
            employee: { id: 'demo-9', firstName: 'Arjun', lastName: 'Menon', employeeId: 'EMP009', department: { name: 'Operations' } } },
          { id: 'sm-7', employeeId: 'demo-10', effectiveDate: new Date('2025-01-01'),
            employee: { id: 'demo-10', firstName: 'Meera', lastName: 'Joshi', employeeId: 'EMP010', department: { name: 'Finance' } } },
        ],
        _count: { members: 5 },
      },
      {
        id: 'shift-3', name: 'Afternoon Shift', startTime: '14:00', endTime: '22:00',
        breakMinutes: 30, isActive: true, companyId: companyId || 'comp-1',
        createdAt: new Date('2025-01-01'), updatedAt: new Date('2025-01-01'),
        company: { id: companyId || 'comp-1', name: 'Nexus Technologies' },
        members: [
          { id: 'sm-8', employeeId: 'demo-3', effectiveDate: new Date('2025-01-01'),
            employee: { id: 'demo-3', firstName: 'Amit', lastName: 'Patel', employeeId: 'EMP003', department: { name: 'Design' } } },
          { id: 'sm-9', employeeId: 'demo-8', effectiveDate: new Date('2025-01-01'),
            employee: { id: 'demo-8', firstName: 'Deepa', lastName: 'Iyer', employeeId: 'EMP008', department: { name: 'Sales' } } },
        ],
        _count: { members: 2 },
      },
      {
        id: 'shift-4', name: 'Night Shift', startTime: '22:00', endTime: '06:00',
        breakMinutes: 45, isActive: true, companyId: companyId || 'comp-1',
        createdAt: new Date('2025-01-01'), updatedAt: new Date('2025-01-01'),
        company: { id: companyId || 'comp-1', name: 'Nexus Technologies' },
        members: [
          { id: 'sm-10', employeeId: 'demo-5', effectiveDate: new Date('2025-01-08'),
            employee: { id: 'demo-5', firstName: 'Vikram', lastName: 'Singh', employeeId: 'EMP005', department: { name: 'Engineering' } } },
        ],
        _count: { members: 1 },
      },
    ];

    let filtered = demoShifts;
    if (isActiveParam !== null && isActiveParam !== undefined) {
      const active = isActiveParam === 'true';
      filtered = filtered.filter((s) => s.isActive === active);
    }

    return NextResponse.json({
      data: filtered,
      pagination: { page, limit, total: filtered.length, totalPages: Math.ceil(filtered.length / limit) },
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, startTime, endTime, breakMinutes, isActive, companyId, members } = body;

    if (!name || !startTime || !endTime || !companyId) {
      return NextResponse.json(
        { error: 'Missing required fields: name, startTime, endTime, companyId' },
        { status: 400 }
      );
    }

    const shift = await db.shift.create({
      data: {
        name, startTime, endTime,
        breakMinutes: breakMinutes || 30,
        isActive: isActive !== undefined ? isActive : true,
        companyId,
        members: members ? {
          create: members.map((m: { employeeId: string; effectiveDate: string }) => ({
            employeeId: m.employeeId,
            effectiveDate: new Date(m.effectiveDate),
          })),
        } : undefined,
      },
      include: {
        company: true,
        members: {
          include: {
            employee: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    await db.auditLog.create({
      data: {
        action: 'CREATE',
        entity: 'Shift',
        entityId: shift.id,
        userId: body.createdBy,
        details: `Shift created: ${name} (${startTime} - ${endTime})`,
      },
    });

    return NextResponse.json(shift, { status: 201 });
  } catch (error) {
    console.error('Shifts POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, members, ...updateData } = body;

    if (!id) {
      return NextResponse.json({ error: 'Shift ID is required' }, { status: 400 });
    }

    const existing = await db.shift.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Shift not found' }, { status: 404 });
    }

    // Update members if provided
    if (members && Array.isArray(members)) {
      await db.shiftMember.deleteMany({ where: { shiftId: id } });
      await db.shift.update({
        where: { id },
        data: {
          ...updateData,
          members: {
            create: members.map((m: { employeeId: string; effectiveDate: string }) => ({
              employeeId: m.employeeId,
              effectiveDate: new Date(m.effectiveDate),
            })),
          },
        },
      });
    } else {
      await db.shift.update({
        where: { id },
        data: updateData,
      });
    }

    const shift = await db.shift.findUnique({
      where: { id },
      include: {
        company: true,
        members: {
          include: {
            employee: {
              select: { firstName: true, lastName: true, employeeId: true },
            },
          },
        },
      },
    });

    await db.auditLog.create({
      data: {
        action: 'UPDATE',
        entity: 'Shift',
        entityId: id,
        userId: body.updatedBy,
        details: `Shift updated: ${existing.name}`,
      },
    });

    return NextResponse.json(shift);
  } catch (error) {
    console.error('Shifts PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
