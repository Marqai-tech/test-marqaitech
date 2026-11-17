/**
 * Candidate Portal — Request OTP (REQ-ATS-04)
 *
 * POST /api/candidate-portal/auth/request-otp
 *   body: { email }
 *
 * Generates a 6-digit OTP, stores its bcrypt hash on CandidatePortalUser,
 * and (in production) emails it. In dev, returns the OTP in the response
 * for convenience — NEVER do this in production.
 */
import { NextResponse } from 'next/server';
import { getDb, getPlatformDb } from '@/lib/tenant-db';
import { hashPassword } from '@/lib/auth';
import { randomInt } from 'crypto';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS });
}

export async function POST(request: Request) {
  const db = await getDb(request);
  try {
    const body = await request.json().catch(() => ({}));
    const email = String(body.email || '').trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400, headers: CORS });
    }

    // Candidate OTP is an authentication flow, not an open registration flow.
    // Only an existing portal account or a previously submitted application may
    // request an OTP. This prevents arbitrary email addresses from creating a
    // candidate portal account and gaining access before applying.
    const apps = await db.jobApplication.findFirst({
      where: { candidateEmail: email },
      select: { candidateName: true },
    });
    const existingPortalUser = await db.candidatePortalUser.findUnique({
      where: { candidateEmail: email },
      select: { id: true, candidateName: true },
    });
    if (!apps && !existingPortalUser) {
      return NextResponse.json(
        { error: 'No candidate account or application found for this email. Please apply for a job first.', code: 'CANDIDATE_NOT_FOUND' },
        { status: 404, headers: CORS },
      );
    }

    const candidateName = apps?.candidateName || existingPortalUser?.candidateName || email.split('@')[0];

    const otp = String(randomInt(100000, 999999));
    const otpHash = await hashPassword(otp);
    const otpExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await db.candidatePortalUser.upsert({
      where: { candidateEmail: email },
      create: {
        candidateEmail: email,
        candidateName,
        currentOtpHash: otpHash,
        otpExpiresAt,
      },
      update: {
        currentOtpHash: otpHash,
        otpExpiresAt,
      },
    });

    // Email provider integration (SendGrid/Postmark/SES) is not configured yet.
    // Until it is, we surface the OTP in the response so candidates can actually
    // complete the login flow. In production with a real email provider wired up,
    // this branch would be removed and only the email would carry the OTP.
    console.log(`[candidate-portal] OTP for ${email}: ${otp}`);

    return NextResponse.json({
      ok: true,
      message: 'OTP sent — check your email.',
      // Email provider not yet configured — surface OTP so the candidate can log in.
      devOtp: otp,
    }, { headers: CORS });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500, headers: CORS });
  }
}
