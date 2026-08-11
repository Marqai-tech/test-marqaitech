import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

/** GET /api/email?folder=inbox&page=1&limit=50 */
export async function GET(request: NextRequest) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const folder = searchParams.get('folder') || 'inbox';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
    const search = searchParams.get('search');

    const employee = await db.employee.findFirst({ where: { userId: decoded.id } });
    if (!employee) return NextResponse.json({ emails: [], total: 0 });

    const where: Record<string, unknown> = { isActive: true };
    if (folder === 'starred') {
      where.isStarred = true;
    } else {
      where.folder = folder;
    }
    if (search) {
      where.OR = [
        { subject: { contains: search, mode: 'insensitive' } },
        { body: { contains: search, mode: 'insensitive' } },
        { fromName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [emails, total] = await Promise.all([
      db.emailMessage.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          sender: { select: { id: true, firstName: true, lastName: true, avatar: true } },
        },
      }),
      db.emailMessage.count({ where }),
    ]);

    // Parse JSON fields
    const parsed = emails.map(e => ({
      ...e,
      toAddresses: JSON.parse(e.toAddresses || '[]'),
      ccAddresses: e.ccAddresses ? JSON.parse(e.ccAddresses) : [],
      bccAddresses: e.bccAddresses ? JSON.parse(e.bccAddresses) : [],
      attachments: e.attachments ? JSON.parse(e.attachments) : [],
      labels: e.labels ? JSON.parse(e.labels) : [],
    }));

    return NextResponse.json({ emails: parsed, total });
  } catch (error) {
    console.error('GET email error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** POST /api/email — Send or draft email */
export async function POST(request: NextRequest) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const body = await request.json();
    const { subject, body: emailBody, toAddresses, ccAddresses, bccAddresses, folder = 'sent', hasAttachments = false, attachments, labels, priority = 'normal', threadId, repliedToId, companyId } = body;

    if (!subject || !emailBody || !toAddresses) {
      return NextResponse.json({ error: 'subject, body, and toAddresses are required' }, { status: 400 });
    }

    const employee = await db.employee.findFirst({ where: { userId: decoded.id } });
    if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });

    const email = await db.emailMessage.create({
      data: {
        subject,
        body: emailBody,
        fromAddress: employee.email,
        fromName: `${employee.firstName} ${employee.lastName}`,
        toAddresses: JSON.stringify(toAddresses),
        ccAddresses: ccAddresses ? JSON.stringify(ccAddresses) : null,
        bccAddresses: bccAddresses ? JSON.stringify(bccAddresses) : null,
        folder,
        hasAttachments,
        attachments: attachments ? JSON.stringify(attachments) : null,
        labels: labels ? JSON.stringify(labels) : null,
        senderId: employee.id,
        threadId,
        repliedToId,
        priority,
        companyId: companyId || employee.companyId || null,
      },
    });

    return NextResponse.json({ email }, { status: 201 });
  } catch (error) {
    console.error('POST email error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** PATCH /api/email — Update email (read, star, move folder) */
export async function PATCH(request: NextRequest) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const body = await request.json();
    const { id, ...updates } = body;
    if (!id) return NextResponse.json({ error: 'Email id is required' }, { status: 400 });

    if (updates.labels) updates.labels = JSON.stringify(updates.labels);

    const email = await db.emailMessage.update({ where: { id }, data: updates });
    return NextResponse.json({ email });
  } catch (error) {
    console.error('PATCH email error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** DELETE /api/email?id=xxx */
export async function DELETE(request: NextRequest) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Email id is required' }, { status: 400 });

    const email = await db.emailMessage.update({ where: { id }, data: { folder: 'trash' } });
    return NextResponse.json({ email });
  } catch (error) {
    console.error('DELETE email error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
