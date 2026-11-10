import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { getAuthInfo } from '@/lib/companyScope';

const CORS = { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, POST, PATCH, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization' };
export async function OPTIONS() { return NextResponse.json({}, { headers: CORS }); }

/** GET /api/vendors — list all vendor companies (HR/Admin only) */
/** POST /api/vendors — create vendor company */
export async function GET(req: NextRequest) {
  const db = await getDb(req);
  try {
    const auth = await getAuthInfo(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
    const isAdmin = ['super_admin','tenant_admin','ceo','admin','hr_admin','company_hr_admin'].includes(auth.role);
    if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: CORS });

    const vendors = await db.$queryRawUnsafe(`SELECT * FROM "VendorCompany" ORDER BY "createdAt" DESC`).catch(() => []) as any[];
    return NextResponse.json({ vendors }, { headers: CORS });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}

export async function POST(req: NextRequest) {
  const db = await getDb(req);
  try {
    const auth = await getAuthInfo(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
    const isAdmin = ['super_admin','tenant_admin','ceo','admin','hr_admin','company_hr_admin'].includes(auth.role);
    if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: CORS });

    const body = await req.json();
    const { name, email, phone, website, address, supportedChecks } = body || {};
    if (!name) return NextResponse.json({ error: 'Vendor name required' }, { status: 400, headers: CORS });

    const id = `vc-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    await db.$executeRawUnsafe(
      `INSERT INTO "VendorCompany" ("id","name","email","phone","website","address","supportedChecks","status","createdById","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,'active',$8,NOW(),NOW())`,
      id, name, email||null, phone||null, website||null, address||null, supportedChecks?JSON.stringify(supportedChecks):null, auth.userId,
    );

    await db.auditLog.create({ data: { userId: auth.userId, action: 'VENDOR_COMPANY_CREATED', module: 'bgv', details: `Created vendor: ${name}` } }).catch(() => null);
    return NextResponse.json({ message: 'Vendor created', vendorId: id, name }, { status: 201, headers: CORS });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}
