import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { getAuthInfo } from '@/lib/companyScope';
import { hashPassword } from '@/lib/auth';

const CORS = { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization' };
export async function OPTIONS() { return NextResponse.json({}, { headers: CORS }); }

/**
 * POST /api/vendors/[id]/invite-employee
 *   body: { email, name, password? }
 *
 * HR (or vendor admin) creates a vendor_employee under a VendorCompany.
 * Unlike the admin invite (which emails a set-password link), this route
 * sets the password directly so the vendor employee can log in immediately.
 * Used by the E2E test flow to provision the vendor employee who performs
 * the verification.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(req);
  try {
    const auth = await getAuthInfo(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
    const allowed = ['super_admin','tenant_admin','ceo','admin','hr_admin','company_hr_admin','vendor_admin'];
    if (!allowed.includes(auth.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: CORS });

    const { id: vendorCompanyId } = await params;
    const body = await req.json();
    const { email, name, password } = body || {};
    if (!email || !name) return NextResponse.json({ error: 'email and name required' }, { status: 400, headers: CORS });

    // If caller is a vendor_admin, ensure they belong to THIS vendor company
    if (auth.role === 'vendor_admin') {
      const caller = await db.$queryRawUnsafe(`SELECT "vendorCompanyId" FROM "VendorUser" WHERE "email"=$1 LIMIT 1`, auth.email).catch(() => []) as any[];
      if (!caller[0] || caller[0].vendorCompanyId !== vendorCompanyId) {
        return NextResponse.json({ error: 'You can only add employees to your own vendor company' }, { status: 403, headers: CORS });
      }
    }

    // Vendor company must exist
    const vcRows = await db.$queryRawUnsafe(`SELECT id, name FROM "VendorCompany" WHERE id=$1 LIMIT 1`, vendorCompanyId).catch(() => []) as any[];
    if (vcRows.length === 0) return NextResponse.json({ error: 'Vendor company not found' }, { status: 404, headers: CORS });

    // De-dupe by email
    const existing = await db.$queryRawUnsafe(`SELECT id FROM "VendorUser" WHERE email=$1 LIMIT 1`, email.toLowerCase()).catch(() => []) as any[];
    if (existing.length > 0) {
      // If exists, just set the password + activate (idempotent)
      const hashed = await hashPassword(password || 'Welcome@123');
      await db.$executeRawUnsafe(`UPDATE "VendorUser" SET "name"=$1,"passwordHash"=$2,"passwordSetAt"=NOW(),"status"='active',"role"='vendor_employee',"updatedAt"=NOW() WHERE "id"=$3`, name, hashed, existing[0].id).catch(() => 0);
      return NextResponse.json({ message: 'Vendor employee updated + activated', vendorUserId: existing[0].id, email }, { headers: CORS });
    }

    const vuId = `vu-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    const hashed = await hashPassword(password || 'Welcome@123');
    await db.$executeRawUnsafe(
      `INSERT INTO "VendorUser" ("id","vendorCompanyId","email","name","role","status","passwordHash","passwordSetAt","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,'vendor_employee','active',$5,NOW(),NOW(),NOW())`,
      vuId, vendorCompanyId, email.toLowerCase(), name, hashed,
    );

    await db.auditLog.create({ data: { userId: auth.userId, action: 'VENDOR_EMPLOYEE_CREATED', module: 'vendor', details: `Created vendor employee ${email} under ${vcRows[0].name}` } }).catch(() => null);

    return NextResponse.json({ message: 'Vendor employee created + activated', vendorUserId: vuId, email, password: password || 'Welcome@123' }, { status: 201, headers: CORS });
  } catch (error) {
    console.error('Invite vendor employee error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}
