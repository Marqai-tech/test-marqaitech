import { NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const token = getTokenFromHeaders(request);
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
  }
  const decoded = await verifyToken(token);
  if (!decoded) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });
  }

  const db = await getDb(request);
  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);

  const employee = await db.employee.findFirst({
    where: { OR: [{ id }, { employeeId: id }] },
    select: { avatar: true, user: { select: { avatar: true } } },
  }).catch(() => null);

  const raw = (employee?.avatar || employee?.user?.avatar || '').trim();
  if (!raw) {
    return new NextResponse(null, { status: 404, headers: corsHeaders() });
  }
  if (/^https?:\/\//i.test(raw)) {
    return NextResponse.redirect(raw, { headers: corsHeaders() });
  }
  if (!raw.startsWith('data:')) {
    return new NextResponse(null, { status: 404, headers: corsHeaders() });
  }
  const comma = raw.indexOf(',');
  const meta = raw.slice(5, comma);
  const b64 = raw.slice(comma + 1);
  const mime = (meta.split(';')[0] || 'image/jpeg').trim();
  const bytes = Buffer.from(b64, 'base64');
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      ...corsHeaders(),
      'Content-Type': mime.startsWith('image/') ? mime : 'image/jpeg',
      'Cache-Control': 'private, max-age=300',
    },
  });
}
