import { NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

const CORS = { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization' };

export async function OPTIONS() { return NextResponse.json({}, { headers: CORS }); }

function parsePortalDetails(raw: unknown): Record<string, any> {
  if (!raw) return {};
  if (typeof raw === 'string') { try { const v = JSON.parse(raw); return v && typeof v === 'object' ? v : {}; } catch { return {}; } }
  return raw as Record<string, any>;
}

// Minimum required fields per section (mirrors the PUT route in ../route.ts — BRD 5.5–5.7)
const SECTION_REQUIRED: Record<string, string[]> = {
  personal: ['firstName', 'lastName', 'dateOfBirth', 'gender', 'mobileNumber'],
  address: ['permanentAddressLine1', 'permanentCity', 'permanentState', 'permanentPincode'],
  family: ['emergencyContactName', 'emergencyContactRelation', 'emergencyContactMobile'],
  education: [],
  bank: ['accountHolderName', 'bankName', 'accountNumber', 'ifscCode'],
};

/**
 * POST /api/candidate-portal/onboarding/submit
 *   body: { declarationAccepted: true, declarationName: "Full Name" }
 *
 * BRD 5.4 portal steps 8–9 (Review & Declaration → Submit to HR):
 *  - validates every mandatory section is complete
 *  - records the signed declaration (name + timestamp)
 *  - sets portalSubmittedAt → the wizard becomes read-only for the candidate
 *  - notifies HR (portal message to the candidate + audit log entry)
 * Idempotent: re-submit after submission returns 409 unless HR returned
 * the details for correction (portalSubmittedAt cleared).
 */
export async function POST(request: Request) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token' }, { status: 401, headers: CORS });
    const decoded = await verifyToken(token);
    if (!decoded || (decoded as any).kind !== 'candidate')
      return NextResponse.json({ error: 'Invalid candidate token' }, { status: 401, headers: CORS });
    const candidateEmail = ((decoded as any).email as string).toLowerCase();
    const candidateName = ((decoded as any).name as string) || candidateEmail;

    const body = await request.json().catch(() => ({}));
    if (!body.declarationAccepted) {
      return NextResponse.json({ error: 'You must accept the declaration before submitting.', code: 'DECLARATION_REQUIRED' }, { status: 400, headers: CORS });
    }
    const declarationName = String(body.declarationName || '').trim();
    if (declarationName.length < 3) {
      return NextResponse.json({ error: 'Please type your full name to sign the declaration.', code: 'SIGNATURE_REQUIRED' }, { status: 400, headers: CORS });
    }

    const pbRows = await db.$queryRawUnsafe(
      `SELECT id, "candidateName", "portalDetails", "portalSubmittedAt" FROM "PreboardingCandidate" WHERE "candidateEmail" = $1 ORDER BY "createdAt" DESC LIMIT 1`, candidateEmail,
    ).catch(() => []) as any[];
    if (pbRows.length === 0)
      return NextResponse.json({ error: 'Not in onboarding pipeline', code: 'NOT_IN_ONBOARDING' }, { status: 404, headers: CORS });
    const pb = pbRows[0];

    if (pb.portalSubmittedAt) {
      return NextResponse.json({ error: 'Details already submitted to HR.', code: 'ALREADY_SUBMITTED' }, { status: 409, headers: CORS });
    }

    // ── Validate mandatory sections (BRD: candidate must not submit incomplete mandatory info) ──
    const details = parsePortalDetails(pb.portalDetails);
    const missing: string[] = [];
    for (const [section, required] of Object.entries(SECTION_REQUIRED)) {
      const sec = details[section];
      if (!sec) { missing.push(section); continue; }
      for (const field of required) {
        if (!sec[field] || String(sec[field]).trim() === '') missing.push(`${section}.${field}`);
      }
    }
    // Education: at least one education record OR explicitly marked fresher (no formal records)
    const edu = details.education || {};
    const eduRecords = Array.isArray(edu.records) ? edu.records : [];
    if (eduRecords.length === 0 && !edu.noEducationRecords) {
      missing.push('education.records');
    }
    if (missing.length > 0) {
      return NextResponse.json({ error: 'Please complete all mandatory sections before submitting.', code: 'INCOMPLETE', missing }, { status: 400, headers: CORS });
    }

    // ── Submit ──
    await db.$executeRawUnsafe(
      `UPDATE "PreboardingCandidate"
       SET "portalSubmittedAt" = NOW(), "declarationAcceptedAt" = NOW(), "declarationName" = $1,
           "correctionNote" = NULL, "correctionSetAt" = NULL, "updatedAt" = NOW()
       WHERE "id" = $2`,
      declarationName, pb.id,
    );

    // Candidate-facing confirmation message (their portal Messages)
    await db.$executeRawUnsafe(
      `INSERT INTO "CandidateMessage" ("id","candidateEmail","senderName","senderRole","message","body","createdAt","updatedAt")
       VALUES ($1,$2,'HR System','hr',$3,$3,NOW(),NOW())`,
      `msg-submit-${Date.now()}`, candidateEmail,
      `Thank you, ${declarationName}! Your preboarding details and declaration have been submitted to HR. HR will review and verify them; you'll be notified if anything needs correction. Your documents continue through their own verification workflow.`,
    ).catch((e: any) => console.warn('[portal submit] message insert failed:', e?.message));

    // Audit log
    await db.auditLog.create({
      data: {
        userId: pb.id,
        action: 'PREBOARDING_DETAILS_SUBMITTED',
        module: 'onboarding',
        details: `Candidate ${candidateEmail} submitted preboarding details (declaration signed: ${declarationName})`,
      },
    }).catch(() => null);

    return NextResponse.json({
      message: 'Details submitted to HR successfully.',
      submittedAt: new Date().toISOString(),
      declarationName,
    }, { status: 201, headers: CORS });
  } catch (error) {
    console.error('Candidate onboarding submit error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}
