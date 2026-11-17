import { randomInt } from 'crypto';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { hashPassword } from '@/lib/auth';
import { sendEmail } from '@/lib/email';

const OTP_TTL_MS = 15 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] || character);

export async function POST(request: Request) {
  const db = await getDb(request);
  try {
    const body = await request.json().catch(() => ({}));
    const firstName = String(body.firstName || '').trim();
    const lastName = String(body.lastName || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!firstName || !lastName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: 'First name, last name and a valid email are required.' }, { status: 400 });
    if (password.length < 8) return NextResponse.json({ error: 'Password must contain at least 8 characters.' }, { status: 400 });

    const employee = await db.employee.findFirst({ where: { OR: [{ email }, { personalEmail: email }] }, select: { id: true } }).catch(() => null);
    const staff = await db.user.findUnique({ where: { email }, select: { role: true } }).catch(() => null);
    if (employee || (staff?.role && staff.role !== 'candidate')) return NextResponse.json({ error: 'This email belongs to an employee account. Use Employee / HR login.' }, { status: 409 });

    const existing = await db.candidatePortalUser.findUnique({ where: { candidateEmail: email } });
    if (existing?.passwordHash) return NextResponse.json({ error: 'A verified candidate account already exists. Please sign in.' }, { status: 409 });
    if (existing && Date.now() - existing.updatedAt.getTime() < RESEND_COOLDOWN_MS) {
      const retryAfter = Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - existing.updatedAt.getTime())) / 1000);
      return NextResponse.json({ error: `Please wait ${retryAfter} seconds before requesting another code.`, retryAfter }, { status: 429 });
    }

    const candidateName = `${firstName} ${lastName}`.trim();
    const otp = String(randomInt(100000, 1000000));
    const [otpHash, pendingPasswordHash] = await Promise.all([hashPassword(otp), hashPassword(password)]);
    const otpExpiresAt = new Date(Date.now() + OTP_TTL_MS);
    await db.candidatePortalUser.upsert({
      where: { candidateEmail: email },
      create: { candidateEmail: email, candidateName, currentOtpHash: otpHash, otpExpiresAt, magicToken: pendingPasswordHash },
      update: { candidateName, currentOtpHash: otpHash, otpExpiresAt, magicToken: pendingPasswordHash },
    });

    const delivery = await sendEmail({
      to: email,
      subject: 'Verify your 3Boxes candidate account',
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#1e293b"><h2>Verify your candidate account</h2><p>Hello ${escapeHtml(candidateName)},</p><p>Use this verification code to finish creating your candidate account:</p><div style="font-size:30px;font-weight:700;letter-spacing:8px;padding:18px;background:#ecfdf5;color:#047857;text-align:center;border-radius:10px">${otp}</div><p>This code expires in 15 minutes. Do not share it with anyone.</p><p>If you did not request this account, you can ignore this email.</p></div>`,
    });
    if (!delivery.success) return NextResponse.json({ error: 'We could not deliver the verification email. Please try again.' }, { status: 502 });
    return NextResponse.json({ ok: true, email, message: 'Verification code sent to your email.', expiresIn: 900, resendAfter: 60 });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not start candidate registration.' }, { status: 500 });
  }
}
