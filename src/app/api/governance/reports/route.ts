import { NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { withSchemaSync } from '@/lib/schema-sync';

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
  await withSchemaSync(() => Promise.resolve());

  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    }

    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    }

    const db = await getDb(request);

    const { searchParams } = new URL(request.url);
    const reportType = searchParams.get('type') || 'all';

    // ── Workflow Execution Stats ──
    const [
      totalWorkflowDefs,
      activeWorkflowDefs,
      totalInstances,
      instancesByStatus,
      recentExecutions,
    ] = await Promise.all([
      db.workflowDefinition.count(),
      db.workflowDefinition.count({ where: { isActive: true } }),
      db.workflowInstance.count(),
      db.workflowInstance.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      db.workflowInstance.findMany({
        take: 20,
        orderBy: { createdAt: 'desc' },
        include: {
          workflowDefinition: { select: { name: true, module: true } },
        },
      }),
    ]);

    const workflowStats = {
      totalDefinitions: totalWorkflowDefs,
      activeDefinitions: activeWorkflowDefs,
      totalInstances,
      byStatus: instancesByStatus.map((s) => ({
        status: s.status,
        count: s._count._all,
      })),
      recentExecutions: recentExecutions.map((e) => ({
        id: e.id,
        workflowName: e.workflowDefinition.name,
        module: e.workflowDefinition.module,
        entityType: e.entityType,
        status: e.status,
        currentStep: e.currentStep,
        createdAt: e.createdAt.toISOString(),
        updatedAt: e.updatedAt.toISOString(),
      })),
    };

    // ── Policy Compliance Metrics ──
    const [
      totalPolicies,
      activePolicies,
      policiesByCategory,
      policiesByStatus,
    ] = await Promise.all([
      db.policy.count(),
      db.policy.count({ where: { status: 'active' } }),
      db.policy.groupBy({
        by: ['category'],
        _count: { _all: true },
      }),
      db.policy.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
    ]);

    const policyMetrics = {
      total: totalPolicies,
      active: activePolicies,
      byCategory: policiesByCategory.map((p) => ({
        category: p.category,
        count: p._count._all,
      })),
      byStatus: policiesByStatus.map((p) => ({
        status: p.status,
        count: p._count._all,
      })),
    };

    // ── Audit Log Summary ──
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [
      auditLogCount,
      auditByModule,
      auditByAction,
    ] = await Promise.all([
      db.auditLog.count({
        where: { createdAt: { gte: thirtyDaysAgo } },
      }),
      db.auditLog.groupBy({
        by: ['module'],
        where: { createdAt: { gte: thirtyDaysAgo } },
        _count: { _all: true },
        orderBy: { _count: { _all: 'desc' } },
        take: 10,
      }),
      db.auditLog.groupBy({
        by: ['action'],
        where: { createdAt: { gte: thirtyDaysAgo } },
        _count: { _all: true },
        orderBy: { _count: { _all: 'desc' } },
        take: 10,
      }),
    ]);

    const auditSummary = {
      totalLast30Days: auditLogCount,
      byModule: auditByModule.map((a) => ({
        module: a.module,
        count: a._count._all,
      })),
      byAction: auditByAction.map((a) => ({
        action: a.action,
        count: a._count._all,
      })),
    };

    // ── Notification Delivery Stats ──
    const [
      totalNotifications,
      unreadNotifications,
      notificationsByCategory,
      notificationsByType,
    ] = await Promise.all([
      db.notification.count({
        where: { createdAt: { gte: thirtyDaysAgo } },
      }),
      db.notification.count({
        where: { isRead: false, createdAt: { gte: thirtyDaysAgo } },
      }),
      db.notification.groupBy({
        by: ['category'],
        where: { createdAt: { gte: thirtyDaysAgo } },
        _count: { _all: true },
      }),
      db.notification.groupBy({
        by: ['type'],
        where: { createdAt: { gte: thirtyDaysAgo } },
        _count: { _all: true },
      }),
    ]);

    const notificationStats = {
      totalLast30Days: totalNotifications,
      unreadLast30Days: unreadNotifications,
      byCategory: notificationsByCategory.map((n) => ({
        category: n.category,
        count: n._count._all,
      })),
      byType: notificationsByType.map((n) => ({
        type: n.type,
        count: n._count._all,
      })),
    };

    // Filter by requested report type
    const result: Record<string, unknown> = {};

    if (reportType === 'all' || reportType === 'workflow-analytics') {
      result.workflowStats = workflowStats;
    }
    if (reportType === 'all' || reportType === 'compliance-audit') {
      result.policyMetrics = policyMetrics;
      result.auditSummary = auditSummary;
    }
    if (reportType === 'all' || reportType === 'policy-adherence') {
      result.policyMetrics = policyMetrics;
      result.notificationStats = notificationStats;
    }

    // Always include all for the "all" type
    if (reportType === 'all') {
      result.notificationStats = notificationStats;
    }

    return NextResponse.json(result, { headers: corsHeaders() });
  } catch (error) {
    console.error('Governance reports error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
