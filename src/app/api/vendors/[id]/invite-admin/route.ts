import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { getAuthInfo } from '@/lib/companyScope';
import { hashPassword } from '@/lib/auth';

const CORS = { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization' };
export async function OPTIONS() { return NextResponse.json({}, { headers: CORS }); }

/** POST /api/vendors/[id]/invite-admin — invite a vendor admin */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(req);
  try {
    const auth = await getAuthInfo(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
    const isAdmin = ['super_admin','tenant_admin','ceo','admin','hr_admin','company_hr_admin'].includes(auth.role);
    if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: CORS });

    const { id: vendorCompanyId } = await params;
    const body = await req.json();
    const { email, name } = body || {};
    if (!email || !name) return NextResponse.json({ error: 'email and name required' }, { status: 400, headers: CORS });

    // Check vendor exists
    const vcRows = await db.$queryRawUnsafe(`SELECT * FROM "VendorCompany" WHERE "id"=$1 LIMIT 1`, vendorCompanyId).catch(() => []) as any[];
    if (vcRows.length === 0) return NextResponse.json({ error: 'Vendor not found' }, { status: 404, headers: CORS });

    const vuId = `vu-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    const inviteToken = `inv-${Date.now()}-${Math.random().toString(36).slice(2,12)}`;
    await db.$executeRawUnsafe(
      `INSERT INTO "VendorUser" ("id","vendorCompanyId","email","name","role","status","inviteToken","invitedAt","invitedById","createdAt","updatedAt") VALUES ($1,$2,$3,$4,'vendor_admin','pending',$5,NOW(),$6,NOW(),NOW())`,
      vuId, vendorCompanyId, email.toLowerCase(), name, inviteToken, auth.userId,
    );

    // Send invite email
    try {
      const { sendEmail } = await import('@/lib/email');
      await sendEmail({
        to: email, subject: `Invitation: Vendor Admin for ${vcRows[0].name}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
          <h2>You've been invited as a Vendor Admin</h2>
          <p>You have been invited to be a Vendor Admin for <strong>${vcRows[0].name}</strong>.</p>
          <p>Please click the link below to set your password and activate your account:</p>
          <a href="https://3boxes-hrms-beta.vercel.app/vendor/set-password?token=${inviteToken}" style="display:inline-block;background:#059669;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;margin:16px 0;">Set Your Password</a>
          <p>This link will expire in 7 days.</p>
        </div>`,
      }).catch(() => null);
    } catch {}

    await db.auditLog.create({ data: { userId: auth.userId, action: 'VENDOR_ADMIN_INVITED', module: 'bgv', details: `Invited ${email} as admin for vendor ${vendorCompanyId}` } }).catch(() => null);
    return NextResponse.json({ message: 'Vendor admin invited', vendorUserId: vuId, email }, { status: 201, headers: CORS });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}
