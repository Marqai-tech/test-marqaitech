import { NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

/**
 * Task 150 — Project-Management CLIENTS endpoint.
 *
 * GET /api/project-management/clients
 *   → the client database joined to the PM module: every client with
 *     its projects (names + status) and the issues/tickets the client
 *     raised (ProjectTask rows with source = "external" for this client):
 *     counts + the most recent open issues per client. Powers the
 *     /project-management/clients grid (SmartHR clients-grid style).
 *
 * GET /api/project-management/clients?clientId=X
 *   → that client's full issue list (for the per-client issues drawer).
 */

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
    const clientId = searchParams.get('clientId');
    const search = searchParams.get('search');

    // ── Per-client issue drawer: full external-task list for ONE client ──
    if (clientId) {
      const client = await db.client.findUnique({
        where: { id: clientId },
        select: { id: true, name: true, code: true, contactName: true, contactEmail: true, contactPhone: true, status: true },
      });
      if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404, headers: corsHeaders() });

      const issues = await db.projectTask.findMany({
        where: { source: 'external', clientId },
        select: {
          id: true, name: true, priority: true, status: true,
          taskType: true, workflowStep: true, plannedEnd: true, createdAt: true,
          assignedToId: true,
          projectId: true,
          project: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      // enrich assignees (assignedToId has no relation on ProjectTask)
      const assigneeIds = Array.from(new Set(issues.map((t: any) => t.assignedToId).filter(Boolean))) as string[];
      const assignees = assigneeIds.length
        ? await db.employee.findMany({ where: { id: { in: assigneeIds } }, select: { id: true, firstName: true, lastName: true } })
        : [];
      const aMap = new Map(assignees.map((a: any) => [a.id, `${a.firstName} ${a.lastName}`]));
      return NextResponse.json(
        { client, issues: issues.map((t: any) => ({ ...t, assignedToName: aMap.get(t.assignedToId) || null })) },
        { headers: corsHeaders() }
      );
    }

    // ── Grid: all clients + their projects + raised-issue counts ──
    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { contactName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const clients = await db.client.findMany({
      where,
      select: {
        id: true, name: true, code: true, industry: true,
        contactName: true, contactEmail: true, contactPhone: true,
        city: true, country: true, status: true, createdAt: true,
        projects: {
          select: { id: true, name: true, status: true, progress: true },
          orderBy: { createdAt: 'desc' },
          take: 4,
        },
        _count: { select: { projects: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    // External-issue stats per client (source = external, grouped by clientId)
    const issueRows = await db.projectTask.groupBy({
      by: ['clientId'],
      where: { source: 'external', clientId: { not: null } },
      _count: { _all: true },
    });
    const openRows = await db.projectTask.groupBy({
      by: ['clientId'],
      where: { source: 'external', clientId: { not: null }, status: { notIn: ['done', 'cancelled'] } },
      _count: { _all: true },
    });
    const issueMap = new Map(issueRows.map((r) => [r.clientId as string, r._count._all]));
    const openMap = new Map(openRows.map((r) => [r.clientId as string, r._count._all]));

    const enriched = clients.map((c: any) => ({
      ...c,
      issuesTotal: issueMap.get(c.id) || 0,
      issuesOpen: openMap.get(c.id) || 0,
    }));

    const stats = {
      total: enriched.length,
      active: enriched.filter((c) => c.status === 'active').length,
      inactive: enriched.filter((c) => c.status !== 'active').length,
      openIssues: enriched.reduce((a: number, c: any) => a + c.issuesOpen, 0),
    };

    return NextResponse.json({ clients: enriched, stats }, { headers: corsHeaders() });
  } catch (error) {
    console.error('PM clients error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
