import { NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS });
}

/**
 * Candidate Portal messages (in-app notification feed).
 *
 *  GET  /api/candidate-portal/messages — own messages, newest first (50).
 *       Older tenant DBs carry a runtime-added "message" column; the base
 *       schema only has "body". Prefer "message", fall back to "body".
 *  POST /api/candidate-portal/messages { action: 'mark-all-read' }
 *
 * Auth: candidate-kind JWT only; scoped to the caller's own email.
 */
export async function GET(request: Request) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token' }, { status: 401, headers: CORS });
    const decoded = await verifyToken(token);
    if (!decoded || (decoded as any).kind !== 'candidate') {
      return NextResponse.json({ error: 'Invalid candidate token' }, { status: 401, headers: CORS });
    }
    const email = String((decoded as any).email || '').toLowerCase();

    let rows: any[] = [];
    // Preferred shape (matches the HR-side feed and every writer in the app).
    rows = await db.$queryRawUnsafe(
      `SELECT "id","senderName","senderRole","message","createdAt","readAt"
       FROM "CandidateMessage"
       WHERE LOWER("candidateEmail") = $1
       ORDER BY "createdAt" DESC
       LIMIT 50`,
      email,
    ).catch(() => []) as any[];

    // Fallback for DBs where only the base "body" column exists.
    if (rows.length === 0) {
      rows = await db.$queryRawUnsafe(
        `SELECT "id","senderName","senderRole","body" AS "message","createdAt","readAt"
         FROM "CandidateMessage"
         WHERE LOWER("candidateEmail") = $1
         ORDER BY "createdAt" DESC
         LIMIT 50`,
        email,
      ).catch(() => []) as any[];
    }

    return NextResponse.json({
      messages: rows.map((r: any) => ({
        id: r.id,
        senderName: r.senderName || 'HR System',
        senderRole: r.senderRole || 'system',
        message: r.message || '',
        createdAt: r.createdAt,
        readAt: r.readAt || null,
      })),
      unread: rows.filter((r: any) => !r.readAt).length,
    }, { headers: CORS });
  } catch (error) {
    console.error('candidate messages GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}

export async function POST(request: Request) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token' }, { status: 401, headers: CORS });
    const decoded = await verifyToken(token);
    if (!decoded || (decoded as any).kind !== 'candidate') {
      return NextResponse.json({ error: 'Invalid candidate token' }, { status: 401, headers: CORS });
    }
    const email = String((decoded as any).email || '').toLowerCase();

    const body = await request.json().catch(() => ({}));
    if (body?.action !== 'mark-all-read') {
      return NextResponse.json({ error: "action must be 'mark-all-read'" }, { status: 400, headers: CORS });
    }

    const updated = await db.$executeRawUnsafe(
      `UPDATE "CandidateMessage"
       SET "readAt" = NOW()
       WHERE LOWER("candidateEmail") = $1 AND "readAt" IS NULL`,
      email,
    ).catch(() => 0);

    return NextResponse.json({ message: 'Marked all as read', updated: Number(updated) }, { headers: CORS });
  } catch (error) {
    console.error('candidate messages POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}
