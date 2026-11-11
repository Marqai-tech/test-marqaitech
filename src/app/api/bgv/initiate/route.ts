import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { getAuthInfo } from '@/lib/companyScope';

const CORS = { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization' };
export async function OPTIONS() { return NextResponse.json({}, { headers: CORS }); }

/** POST /api/bgv/initiate — HR initiates BGV with a vendor */
export async function POST(req: NextRequest) {
  const db = await getDb(req);
  try {
    const auth = await getAuthInfo(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
    const isAdmin = ['super_admin','tenant_admin','ceo','admin','hr_admin','company_hr_admin'].includes(auth.role);
    if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: CORS });

    const body = await req.json();
    const { candidateEmail, candidateName, preboardingCandidateId, vendorCompanyId, checks, documents, dueDate, instructions } = body || {};
    if (!candidateEmail || !vendorCompanyId) return NextResponse.json({ error: 'candidateEmail and vendorCompanyId required' }, { status: 400, headers: CORS });

    // Check vendor exists and is active
    const vcRows = await db.$queryRawUnsafe(`SELECT * FROM "VendorCompany" WHERE "id"=$1 AND "status"='active' LIMIT 1`, vendorCompanyId).catch(() => []) as any[];
    if (vcRows.length === 0) return NextResponse.json({ error: 'Vendor not found or inactive' }, { status: 404, headers: CORS });

    // Prevent duplicate active request
    const existing = await db.$queryRawUnsafe(
      `SELECT id, status FROM "BgvRequest" WHERE "candidateEmail"=$1 AND "status" NOT IN ('approved_by_hr','rejected_by_hr','cancelled') LIMIT 1`, candidateEmail.toLowerCase(),
    ).catch(() => []) as any[];
    if (existing.length > 0)
      return NextResponse.json({ error: 'Active BGV request already exists', requestId: existing[0].id, status: existing[0].status }, { status: 409, headers: CORS });

    const reqId = `bgv-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    await db.$executeRawUnsafe(
      `INSERT INTO "BgvRequest" ("id","candidateEmail","candidateName","preboardingCandidateId","vendorCompanyId","initiatedByHRId","status","dueDate","instructions","checks","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,'awaiting_assignment',$7,$8,$9,NOW(),NOW())`,
      reqId, candidateEmail.toLowerCase(), candidateName||null, preboardingCandidateId||null, vendorCompanyId, auth.userId,
      dueDate?new Date(dueDate):null, instructions||null, checks?JSON.stringify(checks):null,
    );

    // Create BgvCheck rows
    if (checks && Array.isArray(checks)) {
      for (const check of checks) {
        const checkId = `chk-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
        await db.$executeRawUnsafe(
          `INSERT INTO "BgvCheck" ("id","bgvRequestId","checkType","checkLabel","status","createdAt","updatedAt") VALUES ($1,$2,$3,$4,'pending',NOW(),NOW())`,
          checkId, reqId, check.type||check, check.label||check,
        ).catch(() => 0);
      }
    }

    // Share documents with vendor
    // Accepts either full document objects or plain document IDs (strings).
    // fileUrl is ALWAYS resolved server-side from OnboardingDocument so the
    // client never needs to pass (or can tamper with) the underlying file data.
    if (documents && Array.isArray(documents)) {
      for (const doc of documents) {
        const shareId = `sh-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
        let docId: string | null = null;
        let docType: string | null = null;
        let docLabel: string | null = null;
        if (typeof doc === 'string') {
          docId = doc;
        } else if (doc && typeof doc === 'object') {
          docId = (doc as any).id || null;
          docType = (doc as any).documentType || null;
          docLabel = (doc as any).documentLabel || null;
        }
        if (docId) {
          // Resolve + enforce ownership: the document must belong to the
          // preboarding candidate being verified (when provided).
          const docRows = await db.$queryRawUnsafe(
            `SELECT "documentType", "documentLabel", "fileUrl" FROM "OnboardingDocument" WHERE "id" = $1 ${preboardingCandidateId ? `AND "preboardingCandidateId" = $2` : ''} LIMIT 1`,
            ...(preboardingCandidateId ? [docId, preboardingCandidateId] : [docId]),
          ).catch(() => []) as any[];
          if (docRows[0]) {
            docType = docRows[0].documentType || docType;
            docLabel = docRows[0].documentLabel || docLabel;
            await db.$executeRawUnsafe(
              `INSERT INTO "BgvDocumentShare" ("id","bgvRequestId","onboardingDocumentId","documentType","documentLabel","fileUrl","sharedById") VALUES ($1,$2,$3,$4,$5,$6,$7)`,
              shareId, reqId, docId, docType, docLabel, docRows[0].fileUrl || null, auth.userId,
            ).catch(() => 0);
          }
        } else if (docType || docLabel) {
          await db.$executeRawUnsafe(
            `INSERT INTO "BgvDocumentShare" ("id","bgvRequestId","onboardingDocumentId","documentType","documentLabel","fileUrl","sharedById") VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            shareId, reqId, null, docType, docLabel, null, auth.userId,
          ).catch(() => 0);
        }
      }
    }

    // Notify vendor admins
    const vendorAdmins = await db.$queryRawUnsafe(`SELECT email FROM "VendorUser" WHERE "vendorCompanyId"=$1 AND "role"='vendor_admin' AND "status"='active'`, vendorCompanyId).catch(() => []) as any[];
    for (const admin of vendorAdmins) {
      try {
        const { sendEmail } = await import('@/lib/email');
        await sendEmail({
          to: admin.email, subject: 'New BGV Request Received',
          html: `<p>A new Background Verification request has been received for ${candidateName}.</p><p>Please log in to your vendor dashboard to assign it.</p>`,
        }).catch(() => null);
      } catch {}
    }

    await db.auditLog.create({ data: { userId: auth.userId, action: 'BGV_REQUEST_INITIATED', module: 'bgv', details: `Initiated BGV for ${candidateName} → vendor ${vcRows[0].name}` } }).catch(() => null);

    return NextResponse.json({ message: 'BGV request created. Status: Awaiting Assignment.', requestId: reqId, status: 'awaiting_assignment', vendor: vcRows[0].name }, { status: 201, headers: CORS });
  } catch (error) {
    console.error('BGV initiate error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}
