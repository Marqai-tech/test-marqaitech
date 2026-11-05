import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';

/**
 * Jobs API — backed by the real JobPosting model (the legacy `Job` model was
 * never part of the current Prisma schema; the old fabricated demo fallback
 * that used to live in the catch block has been REMOVED — GOLDEN RULE:
 * no sample data may ever be returned, callers get real tenant data or an
 * empty list / explicit error instead).
 */
export async function GET(req: NextRequest) {
  const db = await getDb(req);
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get('status');
    const department = url.searchParams.get('department');
    const companyId = url.searchParams.get('companyId');
    const search = url.searchParams.get('search');
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (companyId) where.department = { companyId };
    if (department) where.department = { ...((where.department as object) || {}), name: { contains: department } };
    if (search) {
      where.OR = [
        { title: { contains: search } },
        { position: { contains: search } },
        { location: { contains: search } },
      ];
    }

    const [rows, total] = await Promise.all([
      db.jobPosting.findMany({
        where,
        skip,
        take: limit,
        orderBy: { postedDate: 'desc' },
        include: {
          department: { select: { id: true, name: true, companyId: true } },
          _count: { select: { applications: true } },
        },
      }),
      db.jobPosting.count({ where }),
    ]);

    return NextResponse.json({
      data: rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Jobs GET error:', error);
    // NO demo fallback — return a real error so callers never render fake data
    return NextResponse.json({ error: 'Failed to load jobs' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const db = await getDb(req);
  try {
    const body = await req.json();
    const {
      title, description, requirements, departmentId, location,
      type, experience, salary, closingDate, vacancies, status,
    } = body;

    if (!title || !description || !departmentId) {
      return NextResponse.json(
        { error: 'Missing required fields: title, description, departmentId' },
        { status: 400 }
      );
    }

    const jobPosting = await db.jobPosting.create({
      data: {
        title,
        description,
        requirements: requirements || null,
        departmentId,
        position: body.position || title,
        location: location || null,
        type: type || 'full-time',
        experience: experience || null,
        salary: salary || null,
        status: status || 'open',
        postedDate: (status || 'open') === 'open' ? new Date() : null,
        closingDate: closingDate ? new Date(closingDate) : null,
        vacancies: vacancies || 1,
      },
      include: { department: { select: { id: true, name: true, companyId: true } } },
    });

    await db.auditLog.create({
      data: {
        action: 'CREATE_JOB_POSTING',
        entity: 'JobPosting',
        entityId: jobPosting.id,
        userId: body.createdBy || null,
        details: `Created job posting: ${title}`,
      },
    }).catch(() => null);

    return NextResponse.json(jobPosting, { status: 201 });
  } catch (error) {
    console.error('Jobs POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const db = await getDb(req);
  try {
    const body = await req.json();
    const { id, ...updateData } = body;

    if (!id) {
      return NextResponse.json({ error: 'Job ID is required' }, { status: 400 });
    }

    const existing = await db.jobPosting.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    if (updateData.closingDate) {
      updateData.closingDate = new Date(updateData.closingDate);
    }
    if (updateData.status === 'open' && !existing.postedDate) {
      updateData.postedDate = new Date();
    }
    delete updateData.companyId;
    delete updateData.department;
    delete updateData._count;

    const jobPosting = await db.jobPosting.update({
      where: { id },
      data: updateData,
      include: {
        department: { select: { id: true, name: true, companyId: true } },
        _count: { select: { applications: true } },
      },
    });

    await db.auditLog.create({
      data: {
        action: 'UPDATE_JOB_POSTING',
        entity: 'JobPosting',
        entityId: id,
        userId: body.updatedBy || null,
        details: `Updated job posting: ${existing.title}`,
      },
    }).catch(() => null);

    return NextResponse.json(jobPosting);
  } catch (error) {
    console.error('Jobs PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
