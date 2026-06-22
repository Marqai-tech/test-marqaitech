/**
 * Candidate Portal — Forgot Password / Magic Link (REQ-CAND-06)
 *
 * POST /api/candidate-portal/auth/forgot-password
 *   body: { email }
 *
 * Generates a time-bound (30-minute) magic-link token, hashes it (bcrypt),
 * and persists the hash to CandidatePasswordReset. The raw token is sent to
 * the candidate's email as a magic link.
 *
 * Security:
 *   - The raw token is NEVER stored — only the bcrypt hash.
 *   - Tokens expire after 30 minutes (per spec: "time-bound token expiration").
 *   - Any previously-issued unused tokens for this email are expired immediately
 *     to prevent token accumulation.
 *   - The endpoint always returns 200 OK (even if the email doesn't exist)
 *     to prevent email-enumeration attacks.
 *
 * NOTE: Email sending is currently stubbed (console.log in dev). In production,
 * wire this up to SendGrid/Postmark/SES via the env-configured provider.
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';
import { randomBytes } from 'crypto';
import { getRequestMeta } from '@/lib/candidate-auth';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS });
}

const TOKEN_EXPIRY_MINUTES = 30;

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = String(body.email || '').trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: 'email is required' }, { status: 400, headers: CORS });
  }

  const { ip, ua } = getRequestMeta(request);

  // Look up the candidate portal user. If they don't exist, we still return
  // 200 OK (don't leak which emails are registered — anti-enumeration).
  const user = await prisma.candidatePortalUser.findUnique({
    where: { candidateEmail: email },
  });

  if (user) {
    // Expire any previously-issued unused tokens for this email
    await prisma.candidatePasswordReset.updateMany({
      where: {
        candidateEmail: email,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { expiresAt: new Date() },
    });

    // Generate a 32-byte random token (URL-safe base64)
    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = await hashPassword(rawToken);
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MINUTES * 60 * 1000);

    await prisma.candidatePasswordReset.create({
      data: {
        candidateEmail: email,
        tokenHash,
        requestedFromIp: ip,
        requestedFromUa: ua,
        expiresAt,
      },
    });

    // Build the magic link
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ||
      (typeof request !== 'undefined' ? new URL(request.url).origin : 'https://nexus-hrms-mu.vercel.app');
    const magicLink = `${baseUrl}/candidate-portal/reset-password?token=${rawToken}&email=${encodeURIComponent(email)}`;

    // Send email — in dev, log it; in production, wire up a real provider.
    if (process.env.NODE_ENV !== 'production') {
      console.log('\n========== CANDIDATE MAGIC LINK ==========');
      console.log(`To: ${email}`);
      console.log(`Name: ${user.candidateName}`);
      console.log(`Link (expires in ${TOKEN_EXPIRY_MINUTES} min): ${magicLink}`);
      console.log('==========================================\n');
    } else {
      // TODO: integrate with SendGrid/Postmark/SES
      // For now, log server-side so ops can retrieve in an emergency
      console.log(`[forgot-password] Magic link generated for ${email} — email provider not configured`);
    }
  }

  // Always return the same response to prevent email enumeration
  return NextResponse.json({
    ok: true,
    message: 'If an account exists for that email, a password-reset link has been sent. The link expires in 30 minutes.',
  }, { headers: CORS });
}
