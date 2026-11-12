import { NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { getAuthInfo } from '@/lib/companyScope';
import { CORS } from '@/lib/ecosystem-access';

function corsHeaders() {
  return CORS;
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

// BUG-5 fix: this route previously read/wrote the Prisma `Vendor` model while
// the list/create route (`/api/vendors/route.ts`) uses the raw `VendorCompany`
// table — IDs returned by the list could never be found here, so GET/PATCH/DELETE
// silently 404'd or edited a different table. Everything now operates on
// "VendorCompany" so the /vendors page is read-write consistent.
const VC_COLUMNS = 'id, name, email, phone, website, address, "supportedChecks", status, "createdById", "createdAt", "updatedAt"';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = await getDb(request);
  try {
    const auth = await getAuthInfo(request);
    if (!auth) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    if (!['super_admin','tenant_admin','admin','hr_admin','company_hr_admin','ceo'].includes((auth as any).role || '')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: corsHeaders() });
    }

    const { id } = await params;
    const rows = await db.$queryRawUnsafe(
      `SELECT ${VC_COLUMNS} FROM "VendorCompany" WHERE id = $1 LIMIT 1`, id,
    ).catch(() => []) as any[];
    if (rows.length === 0) {
      return NextResponse.json({ error: 'Vendor not found' }, { status: 404, headers: corsHeaders() });
    }

    return NextResponse.json({ vendor: rows[0] }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Get vendor error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = await getDb(request);
  try {
    const auth = await getAuthInfo(request);
    if (!auth) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    if (!['super_admin','tenant_admin','admin','hr_admin','company_hr_admin','ceo'].includes((auth as any).role || '')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: corsHeaders() });
    }

    const { id } = await params;
    const body = await request.json();

    const existing = await db.$queryRawUnsafe(
      `SELECT id FROM "VendorCompany" WHERE id = $1 LIMIT 1`, id,
    ).catch(() => []) as any[];
    if (existing.length === 0) {
      return NextResponse.json({ error: 'Vendor not found' }, { status: 404, headers: corsHeaders() });
    }

    // VendorCompany columns only — supportedChecks stored as JSON string.
    const name = body.name !== undefined ? String(body.name).trim() : undefined;
    if (name !== undefined && !name) {
      return NextResponse.json({ error: 'Vendor name cannot be empty' }, { status: 400, headers: corsHeaders() });
    }
    const email = body.email !== undefined ? (body.email || null) : undefined;
    const phone = body.phone !== undefined ? (body.phone || null) : undefined;
    const website = body.website !== undefined ? (body.website || null) : undefined;
    const address = body.address !== undefined ? (body.address || null) : undefined;
    const supportedChecks =
      body.supportedChecks !== undefined
        ? (typeof body.supportedChecks === 'string' ? body.supportedChecks : JSON.stringify(body.supportedChecks))
        : undefined;
    const status = body.status !== undefined ? String(body.status) : undefined;

    const sets: string[] = [];
    const vals: unknown[] = [];
    const push = (col: string, val: unknown) => { sets.push(`"${col}" = $${vals.length + 1}`); vals.push(val); };
    if (name !== undefined) push('name', name);
    if (email !== undefined) push('email', email);
    if (phone !== undefined) push('phone', phone);
    if (website !== undefined) push('website', website);
    if (address !== undefined) push('address', address);
    if (supportedChecks !== undefined) push('supportedChecks', supportedChecks);
    if (status !== undefined) push('status', status);
    sets.push(`"updatedAt" = NOW()`);

    await db.$executeRawUnsafe(
      `UPDATE "VendorCompany" SET ${sets.join(', ')} WHERE id = $${vals.length + 1}`,
      ...vals, id,
    );

    const updated = await db.$queryRawUnsafe(
      `SELECT ${VC_COLUMNS} FROM "VendorCompany" WHERE id = $1 LIMIT 1`, id,
    ) as any[];

    await db.auditLog.create({
      data: {
        userId: String((auth as any).userId || ''),
        action: 'UPDATE_VENDOR',
        module: 'vendors',
        details: `Updated vendor ${id} (${updated[0]?.name || 'unknown'})`,
      },
    }).catch(() => null);

    return NextResponse.json({ vendor: updated[0] }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Update vendor error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = await getDb(request);
  try {
    const auth = await getAuthInfo(request);
    if (!auth) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    if (!['super_admin','tenant_admin','admin','hr_admin','company_hr_admin','ceo'].includes((auth as any).role || '')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: corsHeaders() });
    }

    const { id } = await params;

    const existing = await db.$queryRawUnsafe(
      `SELECT id, name FROM "VendorCompany" WHERE id = $1 LIMIT 1`, id,
    ).catch(() => []) as any[];
    if (existing.length === 0) {
      return NextResponse.json({ error: 'Vendor not found' }, { status: 404, headers: corsHeaders() });
    }

    // Soft delete (matches list/create semantics)
    await db.$executeRawUnsafe(
      `UPDATE "VendorCompany" SET status = 'inactive', "updatedAt" = NOW() WHERE id = $1`, id,
    );

    await db.auditLog.create({
      data: {
        userId: String((auth as any).userId || ''),
        action: 'DELETE_VENDOR',
        module: 'vendors',
        details: `Soft deleted vendor ${id} (${existing[0].name})`,
      },
    }).catch(() => null);

    return NextResponse.json({ message: 'Vendor deactivated successfully' }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Delete vendor error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
