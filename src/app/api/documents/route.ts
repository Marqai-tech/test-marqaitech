import { NextResponse } from 'next/server';
import { getDb, getPlatformDb } from '@/lib/tenant-db';
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

export async function GET(request: Request) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const employeeId = searchParams.get('employeeId');
    const type = searchParams.get('type');
    const status = searchParams.get('status');

    // BUG_031 fix: SECURITY — restrict document visibility by role.
    // Previously the API returned ALL documents in the tenant DB when no
    // `employeeId` query param was passed, regardless of the caller's role.
    // That meant a plain employee hitting /api/documents could see every
    // other employee's documents (Probation Confirmation Letter, Address
    // proof, Education certificates, etc.) — a serious data leak.
    //
    // Rules:
    //   - super_admin / tenant_admin / admin / hr_manager: may view any
    //     employee's documents. If `employeeId` query param is supplied we
    //     filter by it; otherwise we return all (admin-level access).
    //   - employee / manager / finance / it_admin and any other self-service
    //     role: may ONLY view their own documents. We resolve their employeeId
    //     from the JWT's userId and force the where clause — ignoring any
    //     client-supplied employeeId that tries to read another person's docs.
    const role = (decoded.role as string) || '';
    const ADMIN_ROLES = ['super_admin', 'tenant_admin', 'admin', 'hr_manager'];
    const isAdmin = ADMIN_ROLES.includes(role.toLowerCase());

    const where: Record<string, unknown> = {};
    if (type) where.type = type;
    if (status) where.status = status;

    if (isAdmin) {
      // Admins can filter by any employeeId (or see all if not specified).
      if (employeeId) where.employeeId = employeeId;
    } else {
      // Non-admin: force-filter to the caller's own employeeId.
      const userId = decoded.userId as string;
      const me = await db.employee.findUnique({
        where: { userId },
        select: { id: true },
      }).catch(() => null);
      if (!me) {
        // No employee record linked to this user — return empty rather than
        // leaking other employees' documents.
        return NextResponse.json({
          documents: [],
          pagination: { page, limit, total: 0, totalPages: 0 },
        }, { headers: corsHeaders() });
      }
      where.employeeId = me.id;
    }

    const [documents, total] = await Promise.all([
      db.document.findMany({
        where,
        include: {
          employee: { select: { id: true, firstName: true, lastName: true, employeeId: true } },
        },
        orderBy: { uploadedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.document.count({ where }),
    ]);

    return NextResponse.json({ documents, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Get documents error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

export async function POST(request: Request) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });

    const body = await request.json();
    const { employeeId, name, type, expiryDate } = body;

    if (!employeeId || !name || !type) {
      return NextResponse.json({ error: 'Missing required fields: employeeId, name, type' }, { status: 400, headers: corsHeaders() });
    }

    const document = await db.document.create({
      data: {
        employeeId,
        name,
        type,
        status: body.status || 'active',
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        fileUrl: body.fileUrl || null,
        description: body.description || null,
      },
      include: { employee: { select: { id: true, firstName: true, lastName: true, employeeId: true } } },
    });

    return NextResponse.json({ document }, { status: 201, headers: corsHeaders() });
  } catch (error) {
    console.error('Create document error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
