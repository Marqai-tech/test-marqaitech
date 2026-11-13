import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { getDb } from '@/lib/tenant-db';
import { getAuthInfo } from '@/lib/companyScope';
import { hashPassword } from '@/lib/auth';

const CORS = { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization' };
export async function OPTIONS() { return NextResponse.json({}, { headers: CORS }); }

export async function POST(req: Request) {
  const db = await getDb(req);
  try {
    const auth = await getAuthInfo(req as any);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
    const isAdmin = ['super_admin','tenant_admin','ceo','admin','hr_admin','company_hr_admin'].includes(auth.role);
    if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: CORS });

    const body = await req.json();
    const { applicationId, offerId, candidateEmail, candidateName, candidatePhone,
      joiningDate, employmentType, ctc, workLocation, startDate, jobTitle, companyEmail } = body || {};
    // `let` — the FK hardening below may normalize these to valid ids or null.
    let departmentId = body?.departmentId || null;
    let designationId = body?.designationId || null;
    let reportingManagerId = body?.reportingManagerId || null;

    if (!candidateEmail && !applicationId && !offerId)
      return NextResponse.json({ error: 'Provide applicationId, offerId, or candidateEmail' }, { status: 400, headers: CORS });

    let resolvedEmail = candidateEmail || '';
    let resolvedName = candidateName || '';
    let resolvedPhone = candidatePhone || '';
    let resolvedJobTitle = jobTitle || '';

    if (applicationId) {
      const app = await db.jobApplication.findUnique({ where: { id: applicationId }, include: { jobPosting: { select: { title: true, departmentId: true } } } }).catch(() => null);
      if (app) { resolvedEmail = resolvedEmail || app.candidateEmail; resolvedName = resolvedName || app.candidateName; resolvedPhone = resolvedPhone || app.candidatePhone || ''; resolvedJobTitle = resolvedJobTitle || app.jobPosting?.title || ''; }
    }
    if (offerId && !resolvedEmail) {
      const offer = await db.offer.findUnique({ where: { id: offerId } }).catch(() => null);
      if (offer) { resolvedEmail = offer.candidateEmail; resolvedName = offer.candidateName; resolvedJobTitle = offer.position || ''; }
    }
    if (!resolvedEmail) return NextResponse.json({ error: 'Could not determine candidate email' }, { status: 400, headers: CORS });

    // ─── BRD §2.1 gate (server-side): preboarding requires an ACCEPTED offer ───
    // Mirrors the gate added to /api/recruitment/convert. Exception: an
    // application whose status is 'hired' is the recruitment module's own
    // accepted state (the Convert action there only renders for hired rows).
    if (offerId) {
      const o = await db.$queryRawUnsafe(`SELECT "status" FROM "Offer" WHERE "id"=$1 LIMIT 1`, offerId).catch(() => []) as any[];
      if (!o.length || o[0].status !== 'accepted') {
        return NextResponse.json({ error: `BRD §2.1: preboarding can only start for an ACCEPTED offer (current: '${o[0]?.status || 'not found'}'). Use the BRD 5.3 initiation screen.` }, { status: 409, headers: CORS });
      }
    } else {
      const acceptedOffer = await db.$queryRawUnsafe(
        `SELECT 1 FROM "Offer" WHERE LOWER("candidateEmail") = $1 AND "status" = 'accepted' LIMIT 1`,
        resolvedEmail.toLowerCase(),
      ).catch(() => []) as any[];
      if (!acceptedOffer.length) {
        if (applicationId) {
          const app = await db.$queryRawUnsafe(`SELECT "status" FROM "JobApplication" WHERE "id"=$1 LIMIT 1`, applicationId).catch(() => []) as any[];
          if (app.length && app[0].status === 'hired') {
            // recruitment's own accepted state — allow (legacy quick path)
          } else {
            return NextResponse.json({ error: 'BRD §2.1: no accepted offer found for this candidate/application. Preboarding blocked.' }, { status: 409, headers: CORS });
          }
        } else {
          return NextResponse.json({ error: 'BRD §2.1: no accepted offer found for this candidate. Preboarding blocked.' }, { status: 409, headers: CORS });
        }
      }
    }

    // ─── Harden FK targets: departmentId / designationId / reportingManagerId ───
    // API consumers may pass a User id for reportingManagerId (the UI sends an
    // Employee id). Resolve User→Employee so mark-joined's FK insert cannot fail.
    if (reportingManagerId) {
      const empOk = await db.$queryRawUnsafe(`SELECT id FROM "Employee" WHERE id = $1 LIMIT 1`, reportingManagerId).catch(() => []) as any[];
      if (!empOk[0]) {
        const viaUser = await db.$queryRawUnsafe(`SELECT e."id" FROM "Employee" e JOIN "User" u ON u.id = e."userId" WHERE u.id = $1 LIMIT 1`, reportingManagerId).catch(() => []) as any[];
        if (viaUser[0]) reportingManagerId = viaUser[0].id;
        else reportingManagerId = null;
      }
    }
    if (departmentId) {
      const deptOk = await db.$queryRawUnsafe(`SELECT id FROM "Department" WHERE id = $1 LIMIT 1`, departmentId).catch(() => []) as any[];
      if (!deptOk[0]) departmentId = null;
    }
    if (designationId) {
      const desgOk = await db.$queryRawUnsafe(`SELECT id FROM "Designation" WHERE id = $1 LIMIT 1`, designationId).catch(() => []) as any[];
      if (!desgOk[0]) designationId = null;
    }

    const existing = await db.$queryRawUnsafe(`SELECT id, "onboardingStatus" FROM "PreboardingCandidate" WHERE "candidateEmail" = $1 AND "onboardingStatus" IN ('bgv_pending','provisional_employee','active_employee') LIMIT 1`, resolvedEmail.toLowerCase()).catch(() => []) as any[];
    if (existing.length > 0) return NextResponse.json({ error: `Already in onboarding (status: ${existing[0].onboardingStatus})` }, { status: 409, headers: CORS });

    let portalUser = await db.$queryRawUnsafe(`SELECT id FROM "CandidatePortalUser" WHERE "candidateEmail" = $1 LIMIT 1`, resolvedEmail.toLowerCase()).catch(() => []) as any[];
    let portalUserId = portalUser[0]?.id || null;
    if (!portalUserId) {
      const cpuId = `cpu-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
      const hashed = await hashPassword('Welcome@123');
      const newPortal = await db.$queryRawUnsafe(`INSERT INTO "CandidatePortalUser" ("id","candidateEmail","candidateName","passwordHash","passwordSetAt","createdAt","updatedAt") VALUES ($1,$2,$3,$4,NOW(),NOW(),NOW()) RETURNING id`, cpuId, resolvedEmail.toLowerCase(), resolvedName, hashed).catch(() => []) as any[];
      portalUserId = newPortal[0]?.id || cpuId;
    }

    const finalCompanyEmail = companyEmail || `${resolvedName.split(' ')[0].toLowerCase()}@marqaitech.com`;

    let existingUser = await db.user.findUnique({ where: { email: finalCompanyEmail } }).catch(() => null);
    if (!existingUser) {
      const hashedPwd = await hashPassword(`Pending!${randomBytes(12).toString('base64url')}`);
      existingUser = await db.user.create({ data: { email: finalCompanyEmail, password: hashedPwd, name: resolvedName, role: 'employee', status: 'inactive', tenantId: auth.tenantId || null } }).catch(() => null as any);
    }

    const pbId = `pb-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    const jDate = joiningDate ? new Date(joiningDate) : new Date();
    const sDate = startDate ? new Date(startDate) : jDate;
    await db.$executeRawUnsafe(
      `INSERT INTO "PreboardingCandidate" ("id","candidateName","candidateEmail","candidatePhone","jobTitle","departmentId","designationId","reportingManagerId","employmentType","offeredSalary","currency","ctc","workLocation","joiningDate","startDate","offerDate","candidatePortalUserId","companyEmail","onboardingStatus","status","backgroundCheckStatus","convertedById","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'INR',$11,$12,$13,$14,NOW(),$15,$16,'bgv_pending','document_collection','pending',$17,NOW(),NOW())`,
      pbId, resolvedName, resolvedEmail.toLowerCase(), resolvedPhone||null, resolvedJobTitle||null, departmentId||null, designationId||null, reportingManagerId||null, employmentType||'full-time', ctc?Number(ctc):null, ctc?Number(ctc):null, workLocation||null, jDate, sDate, portalUserId, finalCompanyEmail, auth.userId,
    );

    const defaultDocs = [{type:'aadhaar',label:'Aadhaar Card'},{type:'pan',label:'PAN Card'},{type:'education_cert',label:'Educational Certificate'},{type:'experience_letter',label:'Previous Employment Experience Letter'},{type:'bank_proof',label:'Bank Account Proof'},{type:'address_proof',label:'Address Proof'}];
    for (const doc of defaultDocs) {
      const docId = `doc-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
      await db.$executeRawUnsafe(`INSERT INTO "OnboardingDocument" ("id","preboardingCandidateId","candidateEmail","documentType","documentLabel","status","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,'pending',NOW(),NOW())`, docId, pbId, resolvedEmail.toLowerCase(), doc.type, doc.label).catch(() => 0);
    }

    // CandidateMessage requires NOT NULL senderName + body in the DB — omitting
    // them made this insert fail silently, so candidates never saw the welcome note.
    await db.$executeRawUnsafe(`INSERT INTO "CandidateMessage" ("id","candidateEmail","senderName","senderRole","message","body","createdAt","updatedAt") VALUES ($1,$2,'HR System','system',$3,$3,NOW(),NOW())`, `msg-${Date.now()}`, resolvedEmail.toLowerCase(), `Welcome to onboarding! Status: BGV Pending. Please upload your documents.`).catch((e) => console.warn('[convert] portal message insert failed:', e?.message));
    await db.auditLog.create({ data: { userId: auth.userId, action: 'CANDIDATE_CONVERTED_TO_DRAFT', module: 'onboarding', details: `Converted ${resolvedName} (${resolvedEmail}) to draft. Company email: ${finalCompanyEmail}` } }).catch(() => null);

    return NextResponse.json({ message: 'Candidate converted to draft. Status: BGV Pending.', preboardingCandidateId: pbId, candidateEmail: resolvedEmail, companyEmail: finalCompanyEmail, onboardingStatus: 'bgv_pending', documentsSeeded: defaultDocs.length }, { status: 201, headers: CORS });
  } catch (error) {
    console.error('Convert-to-draft error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Conversion failed' }, { status: 500, headers: CORS });
  }
}
