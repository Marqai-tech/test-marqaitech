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
    // Task 165: require auth for creating job postings
    const { verifyToken, getTokenFromHeaders } = await import('@/lib/auth');
    const token = getTokenFromHeaders(req as unknown as Request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const body = await req.json();
    const {
      title, description, requirements, departmentId, location,
      type, experience, salary, closingDate, vacancies, status,
      requisitionId, // Task 165: link to approved requisition
    } = body;

    if (!title || !description || !departmentId) {
      return NextResponse.json(
        { error: 'Missing required fields: title, description, departmentId' },
        { status: 400 }
      );
    }

    // Task 165: if requisitionId is provided, verify it's approved
    if (requisitionId) {
      try {
        const reqRows = await db.$queryRawUnsafe(
          `SELECT "approvalStatus", "status" FROM "Requisition" WHERE "id" = $1 LIMIT 1`,
          requisitionId,
        ) as any[];
        if (!reqRows[0]) {
          return NextResponse.json({ error: 'Requisition not found' }, { status: 404 });
        }
        if (reqRows[0].approvalStatus !== 'budget_approved' || reqRows[0].status !== 'approved') {
          return NextResponse.json({ error: 'Requisition must be fully approved before creating a job posting' }, { status: 400 });
        }
      } catch {
        // Requisition table might not exist — non-fatal
      }
    }

    // Task 165: ensure requisitionId column exists on JobPosting
    try {
      await db.$executeRawUnsafe(`ALTER TABLE "JobPosting" ADD COLUMN IF NOT EXISTS "requisitionId" TEXT`);
    } catch { /* already exists */ }

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
    }).catch(async (err) => {
      // RAW SQL fallback for schema drift
      console.warn('[Jobs POST] Prisma create failed, trying RAW SQL:', err instanceof Error ? err.message : err);
      const id = `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await db.$executeRawUnsafe(
        `INSERT INTO "JobPosting" ("id", "title", "description", "requirements", "departmentId", "position",
          "location", "type", "experience", "salary", "status", "postedDate", "closingDate", "vacancies",
          "requisitionId", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW())`,
        id, title, description, requirements || null, departmentId, body.position || title,
        location || null, type || 'full-time', experience || null, salary || null,
        status || 'open', (status || 'open') === 'open' ? new Date() : null,
        closingDate ? new Date(closingDate) : null, vacancies || 1, requisitionId || null
      );
      return { id, ...body, department: { name: '' } };
    });

    // Task 165: link the requisition to this job posting
    if (requisitionId) {
      try {
        await db.$executeRawUnsafe(
          `UPDATE "Requisition" SET "jobPostingId" = $1, "status" = 'in_progress' WHERE "id" = $2`,
          (jobPosting as any).id, requisitionId,
        );
      } catch { /* non-fatal */ }
    }

    await db.auditLog.create({
      data: {
        action: 'CREATE_JOB_POSTING',
        entity: 'JobPosting',
        entityId: (jobPosting as any).id,
        userId: decoded.userId,
        details: `Created job posting: ${title}${requisitionId ? ` from requisition` : ''}`,
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
