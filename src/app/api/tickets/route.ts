import { NextResponse } from 'next/server';
import { getDb, getPlatformDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { getServerHiddenSlugs, PLATFORM_PLACEHOLDER_NAME, isServerLiveSite } from '@/lib/tenant-filter';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

async function generateTicketId(db: Awaited<ReturnType<typeof getDb>>): Promise<string> {
  const lastTicket = await db.ticket.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { ticketId: true },
  });

  let nextNum = 1;
  if (lastTicket && lastTicket.ticketId) {
    const match = lastTicket.ticketId.match(/TK-(\d+)/);
    if (match) {
      nextNum = parseInt(match[1]) + 1;
    }
  }

  return `TK-${nextNum.toString().padStart(4, '0')}`;
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

export async function GET(request: Request) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    }

    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const status = searchParams.get('status');
    const priority = searchParams.get('priority');
    const categoryId = searchParams.get('categoryId');
    const requesterId = searchParams.get('requesterId');
    const assignedAgentId = searchParams.get('assignedAgentId');
    const tenantIdParam = searchParams.get('tenantId');
    // Task 141 — ?mine=1: server-enforced self-scope for the mobile HR Help
    // Desk. The client cannot widen the view by passing someone else's
    // requesterId — the caller's OWN user id always wins.
    const mine = searchParams.get('mine') === '1';

    const isAdmin = ['super_admin', 'tenant_admin', 'ceo', 'admin'].includes(decoded.role as string);

    // ─── GOLDEN RULE: No dummy/seed data on LIVE for super_admin ───
    // The Ticket model has no tenantId, so for super_admin on the platform DB,
    // we'd see orphan/seed tickets. Return empty for super_admin with no
    // specific requester/tenant filter.
    if (decoded.role === 'super_admin' && !requesterId && !assignedAgentId && !tenantIdParam && isServerLiveSite(request)) {
      return NextResponse.json(
        { tickets: [], pagination: { page, limit, total: 0, totalPages: 0 } },
        { headers: corsHeaders() }
      );
    }

    // ─── Filter out hidden tenants (Marq AI Tech Pvt Ltd placeholder + demo) ───
    const hiddenSlugs = getServerHiddenSlugs(request);
    const hiddenTenants = await getPlatformDb().tenant.findMany({
      where: { slug: { in: hiddenSlugs } },
      select: { id: true, name: true },
    });
    const hiddenTenantIds = hiddenTenants.map(t => t.id);
    const hiddenTenantNames = hiddenTenants.map(t => t.name);

    const where: Record<string, unknown> = {};

    // For non-admin users, only show their own tickets by default
    if (!isAdmin && !requesterId && !assignedAgentId) {
      where.requesterId = decoded.userId as string;
    }

    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (categoryId) where.categoryId = categoryId;
    if (mine) {
      where.requesterId = decoded.userId as string;
    } else if (requesterId) {
      where.requesterId = requesterId;
    }
    if (assignedAgentId) where.assignedAgentId = assignedAgentId;

    let tickets: unknown[] = [];
    let total = 0;
    try {
      [tickets, total] = await Promise.all([
        db.ticket.findMany({
          where,
          include: {
            category: { select: { id: true, name: true, type: true, slaHours: true } },
            comments: { take: 3, orderBy: { createdAt: 'desc' } },
            _count: { select: { comments: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        db.ticket.count({ where }),
      ]);
    } catch (dbError) {
      console.error('Ticket DB query error:', dbError);
      // Try again without the category include (might be a relation issue)
      try {
        [tickets, total] = await Promise.all([
          db.ticket.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * limit,
            take: limit,
          }),
          db.ticket.count({ where }),
        ]);
      } catch (fallbackError) {
        console.error('Ticket fallback query error:', fallbackError);
        return NextResponse.json(
          { tickets: [], pagination: { page, limit, total: 0, totalPages: 0 } },
          { headers: corsHeaders() }
        );
      }
    }

    // Transform tickets to include a string category field for backward compatibility
    // FILTER OUT tickets that look like dummy/seed data:
    // - Tickets with requesterName matching hidden tenant names (e.g., "Marq AI Tech Pvt Ltd")
    // - Orphan tickets with no real requester info (placeholder seed data)
    const transformedTickets = tickets
      .map((ticket: Record<string, unknown>) => {
        const t = ticket as { category?: { name?: string; type?: string }; _count?: { comments?: number }; requesterType?: string; requesterName?: string; subject?: string; [key: string]: unknown };
        const { category, _count, ...rest } = t;
        return {
          ...rest,
          category: (category as { name?: string; type?: string })?.name || (category as { name?: string; type?: string })?.type || rest.requesterType || 'general',
          categoryDetails: category,
          commentCount: ( _count as { comments?: number })?.comments || 0,
        };
      })
      .filter((t: Record<string, unknown>) => {
        // Exclude tickets whose requesterName matches a hidden tenant name
        const requesterName = String(t.requesterName || '');
        if (hiddenTenantNames.some(name => requesterName.includes(name))) return false;
        /* Task 152 — the subject-based seed filter used to hide REAL user
           tickets (any subject containing "test"/"dummy"/"sample" silently
           vanished — that is exactly why mobile-raised HR tickets appeared
           missing). Seed/demo placeholder rows have NO real requester, so
           the filter now only applies to requester-less rows. */
        const requesterId = String(t.requesterId || '');
        if (!requesterId) {
          const subject = String(t.subject || '').toLowerCase();
          if (subject.includes('test ticket') || subject.includes('dummy') || subject.includes('sample')) return false;
        }
        return true;
      });

    // Recalculate total after filtering
    const filteredTotal = transformedTickets.length;

    return NextResponse.json(
      { tickets: transformedTickets, pagination: { page, limit, total: filteredTotal, totalPages: Math.ceil(filteredTotal / limit) } },
      { headers: corsHeaders() }
    );
  } catch (error) {
    console.error('Get tickets error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500, headers: corsHeaders() }
    );
  }
}

export async function POST(request: Request) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    }

    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    }

    const body = await request.json();
    const {
      categoryId, requesterType, requesterId, requesterName,
      subject, description, priority, assignedAgentId, assignedAgentName,
      slaDeadline, attachments, tags,
    } = body;

    if (!subject || !description) {
      return NextResponse.json(
        { error: 'Missing required fields: subject, description' },
        { status: 400, headers: corsHeaders() }
      );
    }

    const effectiveRequesterId = requesterId || (decoded.userId as string);
    const effectiveRequesterName = requesterName || (decoded.email as string) || 'Unknown';

    const ticketId = await generateTicketId(db);

    // Calculate SLA deadline from category if not provided
    let slaDeadlineDate: Date | null = null;
    if (slaDeadline) {
      slaDeadlineDate = new Date(slaDeadline);
    } else if (categoryId) {
      try {
        const category = await db.ticketCategory.findUnique({ where: { id: categoryId } });
        if (category) {
          slaDeadlineDate = new Date(Date.now() + category.slaHours * 60 * 60 * 1000);
        }
      } catch (e) {
        console.error('Failed to lookup category for SLA:', e);
      }
    }

    const ticket = await db.ticket.create({
      data: {
        ticketId,
        categoryId: categoryId || null,
        requesterType: requesterType || 'employee',
        requesterId: effectiveRequesterId,
        requesterName: effectiveRequesterName,
        subject,
        description,
        priority: priority || 'medium',
        status: 'open',
        assignedAgentId: assignedAgentId || null,
        assignedAgentName: assignedAgentName || null,
        slaDeadline: slaDeadlineDate,
        attachments: attachments || null,
        tags: tags || null,
      },
      include: {
        category: true,
      },
    });

    try {
      await db.auditLog.create({
        data: {
          userId: decoded.userId as string,
          action: 'CREATE_TICKET',
          module: 'tickets',
          details: `Created ticket ${ticketId}: ${subject}`,
        },
      });
    } catch (e) {
      console.error('Failed to create audit log:', e);
    }

    // Notify assigned agent if any
    if (assignedAgentId && decoded.tenantId) {
      try {
        const { createNotification } = await import('@/lib/notifications');
        await createNotification({
          tenantId: decoded.tenantId as string,
          userId: assignedAgentId,
          title: 'New Ticket Assigned',
          message: `Ticket ${ticketId} has been assigned to you: ${subject}`,
          type: 'info',
          category: 'alert',
          link: `/helpdesk`,
        });
      } catch (e) {
        console.error('Failed to send notification:', e);
      }
    }

    /* Task 152 — HR ticket notifications: tickets raised WITHOUT an assigned
       agent (typical HR tickets from the mobile app / employee self-service)
       previously notified NOBODY. Now:
         1. every tenant admin / HR user gets an in-app notification,
         2. HR + admins get a best-effort email via the tenant mail channel,
         3. the requester gets a "ticket received" confirmation. */
    try {
      const { createNotification } = await import('@/lib/notifications');
      const adminRoles = ['tenant_admin', 'hr_admin', 'admin', 'ceo', 'super_admin'];
      const recipients = await db.user.findMany({
        where: { role: { in: adminRoles } },
        select: { id: true, email: true, role: true },
        take: 25,
      }).catch(() => []);

      const target = assignedAgentId
        ? recipients.filter((u) => u.id !== assignedAgentId)
        : recipients;
      for (const u of target) {
        await createNotification({
          tenantId: decoded.tenantId as string,
          userId: u.id,
          title: 'New HR Ticket Received',
          message: `Ticket ${ticketId} (${priority || 'medium'} priority) raised by ${effectiveRequesterName}: ${subject}`,
          type: 'info',
          category: 'alert',
          link: '/helpdesk/tickets',
        }).catch(() => null);
      }
      // requester confirmation
      await createNotification({
        tenantId: decoded.tenantId as string,
        userId: effectiveRequesterId,
        title: 'Ticket Submitted',
        message: `Your ticket ${ticketId} — "${subject}" — has been received and is being reviewed by the HR/team.`,
        type: 'success',
        category: 'system',
        link: '/helpdesk/tickets',
      }).catch(() => null);

      // Best-effort email to admins/HR (tenant SMTP/Resend when configured)
      const emails = (target.map((u) => u.email).filter(Boolean) as string[]).slice(0, 10);
      if (emails.length && decoded.tenantId) {
        const { sendTenantEmail } = await import('@/lib/notification-channels');
        for (const to of emails) {
          void sendTenantEmail(db, decoded.tenantId as string, {
            to,
            subject: `[${ticketId}] New ticket: ${subject}`,
            html: `<p>A new ticket was raised in 3Boxes HRMS.</p>
                   <ul>
                     <li><b>Ticket:</b> ${ticketId}</li>
                     <li><b>Subject:</b> ${subject}</li>
                     <li><b>Priority:</b> ${priority || 'medium'}</li>
                     <li><b>Raised by:</b> ${effectiveRequesterName}</li>
                   </ul>
                   <p>Open the Help Desk to respond.</p>`,
          }).catch(() => null);
        }
      }
    } catch (e) {
      console.error('Task152 ticket notification flow failed:', e);
    }

    return NextResponse.json({ ticket }, { status: 201, headers: corsHeaders() });
  } catch (error) {
    console.error('Create ticket error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500, headers: corsHeaders() }
    );
  }
}
