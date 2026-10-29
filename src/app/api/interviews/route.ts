import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { createNotification, sendNotificationEmail } from '@/lib/notifications';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

/**
 * Task 167: Interview scheduling API
 *
 * GET  /api/interviews — list interviews (filter by jobApplicationId, status, type, scope=mine)
 * POST /api/interviews — schedule a new interview
 *   Body: { jobApplicationId, type, date, time, duration, location, meetingUrl, panelMemberIds: string[] }
 *   - Creates Interview row
 *   - Stores panel member IDs in the interviewer field as comma-separated string
 *   - Notifies each panel member (in-app + email)
 *   - Updates JobApplication.status to 'interview'
 */
export async function GET(req: NextRequest) {
  const db = await getDb(req);
  try {
    const token = getTokenFromHeaders(req as unknown as Request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });

    const url = new URL(req.url);
    const jobApplicationId = url.searchParams.get('jobApplicationId');
    const status = url.searchParams.get('status');
    const type = url.searchParams.get('type');
    const scope = url.searchParams.get('scope'); // 'mine' = interviews where I'm a panelist

    // Task 167: use RAW SQL for schema-drift resilience
    let sql = `SELECT i.*, ja."candidateName", ja."candidateEmail", jp."title" AS "jobTitle"
               FROM "Interview" i
               LEFT JOIN "JobApplication" ja ON ja."id" = i."jobApplicationId"
               LEFT JOIN "JobPosting" jp ON jp."id" = ja."jobPostingId"
               WHERE 1=1`;
    const params: unknown[] = [];
    let pIdx = 1;

    if (jobApplicationId) { sql += ` AND i."jobApplicationId" = $${pIdx++}`; params.push(jobApplicationId); }
    if (status) { sql += ` AND i."status" = $${pIdx++}`; params.push(status); }
    if (type) { sql += ` AND i."type" = $${pIdx++}`; params.push(type); }

    // 'mine' scope: interviews where the current user is a panel member
    if (scope === 'mine' && decoded.userId) {
      sql += ` AND i."interviewer" LIKE $${pIdx++}`;
      params.push(`%${decoded.userId}%`);
    }

    sql += ` ORDER BY i."date" DESC, i."time" DESC LIMIT 100`;

    const interviews = await db.$queryRawUnsafe(sql, ...params).catch(() => []) as any[];

    return NextResponse.json({ data: interviews }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Interviews GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

export async function POST(req: NextRequest) {
  const db = await getDb(req);
  try {
    const token = getTokenFromHeaders(req as unknown as Request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });

    const body = await req.json();
    const { jobApplicationId, type, date, time, duration, location, meetingUrl, panelMemberIds, panelMemberEmails } = body;

    if (!jobApplicationId || !date) {
      return NextResponse.json({ error: 'Missing required fields: jobApplicationId, date' }, { status: 400, headers: corsHeaders() });
    }

    // Validate interview type
    const validTypes = ['ai', 'technical', 'hr', 'offline_panel'];
    const interviewType = validTypes.includes(type) ? type : 'technical';

    // Store panel member IDs as comma-separated string in the interviewer field
    // Task 167: support both panelMemberIds (user IDs) and panelMemberEmails (emails)
    let panelMembers: string[] = [];
    if (Array.isArray(panelMemberIds) && panelMemberIds.length > 0) {
      panelMembers = panelMemberIds.filter(Boolean);
    } else if (Array.isArray(panelMemberEmails) && panelMemberEmails.length > 0) {
      // Resolve emails to user IDs
      for (const email of panelMemberEmails.filter(Boolean)) {
        try {
          const userRows = await db.$queryRawUnsafe(
            `SELECT "id" FROM "User" WHERE LOWER("email") = LOWER($1) LIMIT 1`, email,
          ) as any[];
          if (userRows[0]?.id) panelMembers.push(userRows[0].id);
        } catch {}
      }
    }
    const interviewerStr = panelMembers.join(',');

    // Create the interview via RAW SQL (schema-drift safe)
    const interviewId = `int-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      await db.$executeRawUnsafe(
        `INSERT INTO "Interview" ("id", "jobApplicationId", "type", "date", "time", "duration", "location", "meetingUrl", "interviewer", "status", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'scheduled', NOW(), NOW())`,
        interviewId, jobApplicationId, interviewType,
        new Date(date), time || null, duration || null,
        location || null, meetingUrl || null, interviewerStr || null,
      );
    } catch (insertErr) {
      console.error('[Interviews POST] insert failed:', insertErr);
      return NextResponse.json({ error: 'Failed to schedule interview' }, { status: 500, headers: corsHeaders() });
    }

    // Update the job application status to 'interview'
    try {
      await db.$executeRawUnsafe(
        `UPDATE "JobApplication" SET "status" = 'interview', "updatedAt" = NOW() WHERE "id" = $1`,
        jobApplicationId,
      );
    } catch { /* non-fatal */ }

    // Fetch the application details for notifications
    const appRows = await db.$queryRawUnsafe(
      `SELECT "candidateName", "candidateEmail", "jobPostingId" FROM "JobApplication" WHERE "id" = $1 LIMIT 1`,
      jobApplicationId,
    ) as any[];
    const app = appRows[0];

    // Fetch job title
    let jobTitle = 'the position';
    if (app?.jobPostingId) {
      try {
        const jobRows = await db.$queryRawUnsafe(`SELECT "title" FROM "JobPosting" WHERE "id" = $1 LIMIT 1`, app.jobPostingId) as any[];
        if (jobRows[0]?.title) jobTitle = jobRows[0].title;
      } catch {}
    }

    // Notify each panel member
    if (panelMembers.length > 0 && decoded.tenantId) {
      const typeLabels: Record<string, string> = {
        ai: 'AI Interview', technical: 'Technical Interview', hr: 'HR Interview', offline_panel: 'Panel Interview',
      };
      const typeLabel = typeLabels[interviewType] || 'Interview';
      const dateStr = new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      const timeStr = time || 'TBD';

      for (const memberId of panelMembers) {
        try {
          // In-app notification
          const notif = await createNotification({
            tenantId: decoded.tenantId as string,
            userId: memberId,
            title: `Interview Assigned: ${typeLabel}`,
            message: `You have been assigned as a panel member for a ${typeLabel} for ${app?.candidateName || 'a candidate'} (${jobTitle}) on ${dateStr} at ${timeStr}.${location ? ` Location: ${location}.` : ''}${meetingUrl ? ` Meeting: ${meetingUrl}.` : ''}`,
            type: 'workflow',
            category: 'recruitment',
            link: '/my-interviews',
          }).catch(() => null);

          // Email notification
          if (notif?.id) {
            const panelUser = await db.user.findUnique({ where: { id: memberId }, select: { email: true, name: true } }).catch(() => null);
            if (panelUser?.email) {
              await sendNotificationEmail(
                db, decoded.tenantId as string, notif, panelUser.email,
                `Interview Assigned: ${typeLabel}`,
                `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
                  <h2 style="color:#4f46e5;">Interview Panel Assignment</h2>
                  <p>Dear ${panelUser.name || 'Panel Member'},</p>
                  <p>You have been assigned as a panel member for a <strong>${typeLabel}</strong>.</p>
                  <table style="width:100%;border-collapse:collapse;margin:16px 0;">
                    <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Candidate:</td><td style="padding:8px;border:1px solid #ddd;">${app?.candidateName || 'N/A'}</td></tr>
                    <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Position:</td><td style="padding:8px;border:1px solid #ddd;">${jobTitle}</td></tr>
                    <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Date:</td><td style="padding:8px;border:1px solid #ddd;">${dateStr}</td></tr>
                    <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Time:</td><td style="padding:8px;border:1px solid #ddd;">${timeStr}</td></tr>
                    ${location ? `<tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Location:</td><td style="padding:8px;border:1px solid #ddd;">${location}</td></tr>` : ''}
                    ${meetingUrl ? `<tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Meeting Link:</td><td style="padding:8px;border:1px solid #ddd;"><a href="${meetingUrl}">${meetingUrl}</a></td></tr>` : ''}
                  </table>
                  <p>Please prepare for the interview. You can submit your feedback after the interview from the My Interviews page.</p>
                  <p>Regards,<br/>HR Team</p>
                </div>`,
              ).catch(() => null);
            }
          }
        } catch { /* non-fatal */ }
      }
    }

    // Audit log
    await db.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'SCHEDULE_INTERVIEW',
        module: 'recruitment',
        details: `Scheduled ${interviewType} interview for ${app?.candidateName || jobApplicationId} on ${new Date(date).toLocaleDateString()}`,
      },
    }).catch(() => null);

    return NextResponse.json({
      id: interviewId,
      jobApplicationId,
      type: interviewType,
      date, time, duration, location, meetingUrl,
      panelMembers: panelMembers,
      status: 'scheduled',
    }, { status: 201, headers: corsHeaders() });
  } catch (error) {
    console.error('Interviews POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

/**
 * PATCH /api/interviews — update interview (submit feedback/ratings, change status)
 * Body: { id, status?, feedback?, score? }
 */
export async function PATCH(req: NextRequest) {
  const db = await getDb(req);
  try {
    const token = getTokenFromHeaders(req as unknown as Request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });

    const body = await req.json();
    const { id, status, feedback, score } = body;

    if (!id) return NextResponse.json({ error: 'Interview ID is required' }, { status: 400, headers: corsHeaders() });

    const sets: string[] = [];
    const params: unknown[] = [];
    let pIdx = 1;

    if (status !== undefined) {
      const validStatuses = ['scheduled', 'completed', 'cancelled', 'rescheduled'];
      if (!validStatuses.includes(status)) {
        return NextResponse.json({ error: `Invalid status. Must be: ${validStatuses.join(', ')}` }, { status: 400, headers: corsHeaders() });
      }
      sets.push(`"status" = $${pIdx++}`); params.push(status);
    }
    if (feedback !== undefined) { sets.push(`"feedback" = $${pIdx++}`); params.push(feedback); }
    if (score !== undefined) { sets.push(`"score" = $${pIdx++}`); params.push(Number(score) || null); }
    sets.push(`"updatedAt" = NOW()`);
    params.push(id);

    await db.$executeRawUnsafe(
      `UPDATE "Interview" SET ${sets.join(', ')} WHERE "id" = $${pIdx}`,
      ...params,
    );

    // Audit log
    await db.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'UPDATE_INTERVIEW',
        module: 'recruitment',
        details: `Updated interview ${id}: ${status ? `status=${status}` : ''} ${feedback ? `feedback submitted` : ''}`,
      },
    }).catch(() => null);

    return NextResponse.json({ success: true, id, status, feedback, score }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Interviews PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
