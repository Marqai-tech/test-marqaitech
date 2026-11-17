import { NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { createToken, hashPassword } from '@/lib/auth';

export async function POST(request: Request) {
  const db = await getDb(request);
  try {
    const body = await request.json().catch(() => ({}));
    const firstName = String(body.firstName || '').trim();
    const lastName = String(body.lastName || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');

    if (!firstName || !lastName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'First name, last name and a valid email are required.' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must contain at least 8 characters.' }, { status: 400 });
    }

    const employee = await db.employee.findFirst({ where: { OR: [{ email }, { personalEmail: email }] }, select: { id: true } }).catch(() => null);
    const staff = await db.user.findUnique({ where: { email }, select: { role: true } }).catch(() => null);
    if (employee || (staff?.role && staff.role !== 'candidate')) {
      return NextResponse.json({ error: 'This email belongs to an employee account. Use Employee / HR login.' }, { status: 409 });
    }

    const existing = await db.candidatePortalUser.findUnique({ where: { candidateEmail: email }, select: { id: true } });
    if (existing) {
      return NextResponse.json({ error: 'A candidate account already exists. Please sign in.' }, { status: 409 });
    }

    const candidateName = `${firstName} ${lastName}`.trim();
    const passwordHash = await hashPassword(password);
    await db.candidatePortalUser.create({
      data: { candidateEmail: email, candidateName, passwordHash, passwordSetAt: new Date(), lastLoginAt: new Date() },
    });
    const token = await createToken({ kind: 'candidate', email, name: candidateName });

    return NextResponse.json({ ok: true, token, user: { name: candidateName, email } });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not create candidate account.' }, { status: 500 });
  }
}
