import { NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { createToken, verifyPassword } from '@/lib/auth';

export async function POST(request: Request) {
  const db = await getDb(request);
  try {
    const body = await request.json().catch(() => ({}));
    const email = String(body.email || '').trim().toLowerCase();
    const otp = String(body.otp || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\d{6}$/.test(otp)) return NextResponse.json({ error: 'Enter the six-digit verification code.' }, { status: 400 });

    const user = await db.candidatePortalUser.findUnique({ where: { candidateEmail: email } });
    if (!user || user.passwordHash || !user.currentOtpHash || !user.otpExpiresAt || !user.magicToken) return NextResponse.json({ error: 'No pending account verification was found.' }, { status: 404 });
    if (user.otpExpiresAt.getTime() < Date.now()) return NextResponse.json({ error: 'The verification code has expired. Request a new code.' }, { status: 410 });
    if (!await verifyPassword(otp, user.currentOtpHash)) return NextResponse.json({ error: 'The verification code is incorrect.' }, { status: 401 });

    const verified = await db.candidatePortalUser.update({
      where: { id: user.id },
      data: { passwordHash: user.magicToken, passwordSetAt: new Date(), currentOtpHash: null, otpExpiresAt: null, magicToken: null, lastLoginAt: new Date() },
    });
    const token = await createToken({ kind: 'candidate', email: verified.candidateEmail, name: verified.candidateName });
    return NextResponse.json({ ok: true, token, user: { name: verified.candidateName, email: verified.candidateEmail } });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not verify candidate account.' }, { status: 500 });
  }
}
