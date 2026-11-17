import { NextRequest, NextResponse } from 'next/server';
import { getDb, getPlatformDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { getFeedContext } from '@/lib/feed-permissions';

/** GET /api/social-feed?type=general&companyId=xxx */
export async function GET(request: NextRequest) {
  const db = await getDb(request);
  const platformDb = getPlatformDb();
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const companyId = searchParams.get('companyId');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);

    const employee = await db.employee.findFirst({ where: { userId: decoded.userId as string } }).catch(() => null);

    // Task 138 — feed governance: who can raise feeds, and which posts I liked.
    // Admin logins WITHOUT an employee row still see the feeds (and can be
    // feed admins) — the employee row only narrows the company scope.
    const ctx = await getFeedContext(request, db, platformDb, decoded as { role?: string; tenantId?: string | null }, employee?.id ?? null);
    let likedPostIds = new Set<string>();
    if (employee) {
      try {
        const likes = await db.socialLike.findMany({ where: { userId: employee.id }, select: { postId: true } });
        likedPostIds = new Set(likes.map((l: { postId: string }) => l.postId));
      } catch { /* likes table may be empty — fine */ }
    }

    const where: Record<string, unknown> = { isActive: true };
    if (type) where.postType = type;
    if (companyId) where.companyId = companyId;
    else if (employee?.companyId) where.companyId = employee.companyId;

    const posts = await db.socialPost.findMany({
      where,
      orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      include: {
        author: { select: { id: true, firstName: true, lastName: true, avatar: true, designation: { select: { title: true } } } },
        comments: {
          where: { isActive: true },
          orderBy: { createdAt: 'asc' },
          include: { author: { select: { id: true, firstName: true, lastName: true, avatar: true } } },
          take: 20,
        },
      },
    });

    const parsed = posts.map(p => ({
      ...p,
      attachments: p.attachments ? JSON.parse(p.attachments) : [],
      hashtags: p.hashtags ? JSON.parse(p.hashtags) : [],
      isLikedByMe: likedPostIds.has(p.id),
    }));

    return NextResponse.json({
      posts: parsed,
      canCreate: ctx.permissions.canCreate,
      creationMode: ctx.permissions.creationMode,
      isFeedAdmin: ctx.permissions.isFeedAdmin,
    });
  } catch (error) {
    console.error('GET social-feed error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** POST /api/social-feed — Create post (governed: admins or enabled creators). */
export async function POST(request: NextRequest) {
  const db = await getDb(request);
  const platformDb = getPlatformDb();
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const body = await request.json();
    const { content, postType = 'general', companyId, attachments, hashtags, isPinned = false } = body;

    if (!content) return NextResponse.json({ error: 'content is required' }, { status: 400 });

    const employee = await db.employee.findFirst({ where: { userId: decoded.userId as string } });
    if (!employee) {
      return NextResponse.json({ error: 'Your login is not linked to an employee record — feeds are raised under an employee identity. Ask HR/Admin to link your account.' }, { status: 404 });
    }

    // Task 138 — RAISE permission: HR/admin always; employees only when the
    // admin enabled them in Collaboration → Settings → Social Feed Governance.
    const ctx = await getFeedContext(request, db, platformDb, decoded as { role?: string; tenantId?: string | null }, employee.id);
    if (!ctx.permissions.canCreate) {
      return NextResponse.json(
        {
          error: 'You can respond to feeds (like / comment) but cannot raise one yet — ask your HR / Admin to enable you in Collaboration → Settings → Social Feed',
          code: 'FEED_CREATE_NOT_ALLOWED',
          creationMode: ctx.permissions.creationMode,
        },
        { status: 403 },
      );
    }
    // Only admins may pin.
    const pinned = Boolean(isPinned) && ctx.permissions.isFeedAdmin;

    const post = await db.socialPost.create({
      data: {
        content,
        postType,
        authorId: employee.id,
        companyId: companyId || employee.companyId || null,
        attachments: attachments ? JSON.stringify(attachments) : null,
        hashtags: hashtags ? JSON.stringify(hashtags) : null,
        isPinned: pinned,
      },
      include: {
        author: { select: { id: true, firstName: true, lastName: true, avatar: true, designation: { select: { title: true } } } },
      },
    });

    return NextResponse.json({ post: { ...post, attachments: post.attachments ? JSON.parse(post.attachments) : [], hashtags: post.hashtags ? JSON.parse(post.hashtags) : [] } }, { status: 201 });
  } catch (error) {
    console.error('POST social-feed error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** PATCH /api/social-feed — Like, comment, or (author/admin) edit post */
export async function PATCH(request: NextRequest) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const body = await request.json();
    const { id, action, commentContent, ...updates } = body;
    if (!id) return NextResponse.json({ error: 'Post id is required' }, { status: 400 });

    const employee = await db.employee.findFirst({ where: { userId: decoded.userId as string } }).catch(() => null);
    if (!employee && !action) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });

    if (action === 'like') {
      // Toggle like — responding is open to every login (Task 138).
      const existing = await db.socialLike.findUnique({ where: { postId_userId: { postId: id, userId: employee.id } } });
      if (existing) {
        await db.socialLike.delete({ where: { id: existing.id } });
        await db.socialPost.update({ where: { id }, data: { likesCount: { decrement: 1 } } });
      } else {
        await db.socialLike.create({ data: { postId: id, userId: employee.id } });
        await db.socialPost.update({ where: { id }, data: { likesCount: { increment: 1 } } });
      }
      const post = await db.socialPost.findUnique({ where: { id } });
      return NextResponse.json({ post });
    }

    if (action === 'comment' && commentContent) {
      // Responding is open to every login (Task 138).
      const comment = await db.socialComment.create({
        data: { postId: id, authorId: employee.id, content: commentContent },
        include: { author: { select: { id: true, firstName: true, lastName: true, avatar: true } } },
      });
      await db.socialPost.update({ where: { id }, data: { commentsCount: { increment: 1 } } });
      return NextResponse.json({ comment });
    }

    // General update — Task 138: no more mass assignment. Only the author or
    // a feed admin may edit, and only a whitelist of fields. Admin logins
    // without an employee row moderate by role.
    const existing = await db.socialPost.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    const isFeedAdmin = decoded.role === 'super_admin' ||
      ['tenant_admin', 'ceo', 'admin', 'hr_admin', 'company_hr_admin'].includes(decoded.role as string);
    if (!employee && !isFeedAdmin) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    if (existing.authorId !== employee?.id && !isFeedAdmin) {
      return NextResponse.json({ error: 'Only the author or HR/Admin can edit this post' }, { status: 403 });
    }
    const allowed = ['content', 'postType', 'isPinned', 'attachments', 'hashtags'];
    const data: Record<string, unknown> = {};
    for (const k of allowed) {
      if (updates && typeof updates === 'object' && k in (updates as Record<string, unknown>)) {
        data[k] = (updates as Record<string, unknown>)[k];
      }
    }
    if (Object.keys(data).length === 0) return NextResponse.json({ error: 'No editable fields provided' }, { status: 400 });
    const post = await db.socialPost.update({ where: { id }, data });
    return NextResponse.json({ post });
  } catch (error) {
    console.error('PATCH social-feed error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** DELETE /api/social-feed?id=xxx — soft delete (author or HR/Admin only, Task 138) */
export async function DELETE(request: NextRequest) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Post id is required' }, { status: 400 });

    const employee = await db.employee.findFirst({ where: { userId: decoded.userId as string } }).catch(() => null);

    const existing = await db.socialPost.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    const isFeedAdmin = decoded.role === 'super_admin' ||
      ['tenant_admin', 'ceo', 'admin', 'hr_admin', 'company_hr_admin'].includes(decoded.role as string);
    if (!employee && !isFeedAdmin) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    if (existing.authorId !== employee?.id && !isFeedAdmin) {
      return NextResponse.json({ error: 'Only the author or HR/Admin can delete this post' }, { status: 403 });
    }

    const post = await db.socialPost.update({ where: { id }, data: { isActive: false } });
    return NextResponse.json({ post });
  } catch (error) {
    console.error('DELETE social-feed error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
