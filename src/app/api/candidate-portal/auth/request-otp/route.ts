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
import prisma from '@/lib/prisma';
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
  try {
    const body = await request.json().catch(() => ({}));
    const email = String(body.email || '').trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400, headers: CORS });
    }

    // Look up candidate name from any job application they've ever submitted
    const apps = await prisma.jobApplication.findFirst({
      where: { candidateEmail: email },
      select: { candidateName: true },
    });
    if (!apps) {
      // Don't leak whether email exists — return success
      return NextResponse.json({ ok: true, message: 'If you have applied, an OTP has been sent.' }, { headers: CORS });
    }

    const otp = String(randomInt(100000, 999999));
    const otpHash = await hashPassword(otp);
    const otpExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await prisma.candidatePortalUser.upsert({
      where: { candidateEmail: email },
      create: {
        candidateEmail: email,
        candidateName: apps.candidateName,
        currentOtpHash: otpHash,
        otpExpiresAt,
      },
      update: {
        currentOtpHash: otpHash,
        otpExpiresAt,
      },
    });

    // TODO: integrate with email provider (SendGrid / Postmark / SES)
    // For now, log it (dev only). In production the email service would pick this up.
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[candidate-portal] OTP for ${email}: ${otp}`);
    }

    return NextResponse.json({
      ok: true,
      message: 'If you have applied, an OTP has been sent.',
      // Dev-only: include the OTP so the user can test without an email service
      ...(process.env.NODE_ENV !== 'production' ? { devOtp: otp } : {}),
    }, { headers: CORS });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500, headers: CORS });
  }
}
