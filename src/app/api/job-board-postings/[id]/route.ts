import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { ensureSchemaSynced } from '@/lib/schema-sync';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json(
        { error: 'No token provided' },
        { status: 401, headers: corsHeaders() }
      );
    }

    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401, headers: corsHeaders() }
      );
    }

    await ensureSchemaSynced();

    const { id } = await params;
    const posting = await prisma.jobBoardPosting.findUnique({
      where: { id },
      include: {
        jobPosting: {
          select: { id: true, title: true, status: true, department: { select: { id: true, name: true } } },
        },
      },
    });

    if (!posting) {
      return NextResponse.json(
        { error: 'Job board posting not found' },
        { status: 404, headers: corsHeaders() }
      );
    }

    return NextResponse.json({ posting }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Job board posting GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders() }
    );
  }
}

/**
 * DELETE /api/job-board-postings/[id]
 *
 * Closes the posting on the external board (stub).
 * Sets status='closed' and closedAt=now. Does NOT delete the row — we keep
 * the historical record for analytics.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json(
        { error: 'No token provided' },
        { status: 401, headers: corsHeaders() }
      );
    }

    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401, headers: corsHeaders() }
      );
    }

    await ensureSchemaSynced();

    const { id } = await params;

    const existing = await prisma.jobBoardPosting.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: 'Job board posting not found' },
        { status: 404, headers: corsHeaders() }
      );
    }

    if (existing.status === 'closed') {
      return NextResponse.json(
        { posting: existing, message: 'Already closed' },
        { headers: corsHeaders() }
      );
    }

    // Stub: simulate closing on the external board (no-op for now).
    // Real OAuth/API integration would call board's DELETE endpoint here.
    const updated = await prisma.jobBoardPosting.update({
      where: { id },
      data: {
        status: 'closed',
        closedAt: new Date(),
        lastSyncedAt: new Date(),
        lastSyncPayload: JSON.stringify({
          action: 'close',
          closedAt: new Date().toISOString(),
          closedBy: decoded.userId,
          previousStatus: existing.status,
        }),
      },
      include: {
        jobPosting: { select: { id: true, title: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'CLOSE_JOB_BOARD_POSTING',
        module: 'recruitment',
        details: `Closed ${existing.board} posting for job: ${updated.jobPosting?.title || existing.jobPostingId}`,
      },
    });

    return NextResponse.json(
      { posting: updated, message: 'Board posting closed' },
      { headers: corsHeaders() }
    );
  } catch (error) {
    console.error('Job board posting DELETE error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders() }
    );
  }
}
