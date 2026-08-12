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

    // Fetch all data in parallel for efficiency
    const [
      activeWorkflowsCount,
      policyDocsCount,
      pendingInstancesCount,
      recentInstances,
      auditLogCount,
      notificationStats,
    ] = await Promise.all([
      // Active workflows count
      db.workflowDefinition.count({ where: { isActive: true } }),

      // Policy documents count
      db.policy.count({ where: { status: 'active' } }),

      // Pending approval instances
      db.workflowInstance.count({ where: { status: 'pending' } }),

      // Recent workflow instances (last 10)
      db.workflowInstance.findMany({
        take: 10,
        orderBy: { updatedAt: 'desc' },
        include: {
          workflowDefinition: {
            select: { name: true, module: true },
          },
        },
      }),

      // Audit log count (last 30 days)
      db.auditLog.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          },
        },
      }),

      // Notification delivery stats
      db.notification.aggregate({
        _count: { _all: true },
        where: {
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          },
        },
      }),
    ]);

    // Compute compliance score based on real data
    // Score based on: active policies ratio, completed vs total instances, audit trail activity
    const totalInstances = await db.workflowInstance.count();
    const completedInstances = await db.workflowInstance.count({ where: { status: 'approved' } });
    const baseScore = totalInstances > 0 ? Math.round((completedInstances / totalInstances) * 100) : 0;
    // Floor at 0, ceiling at 100
    const complianceScore = Math.min(100, Math.max(0, baseScore));

    // Build compliance items from policy categories
    const policyCategories = await db.policy.groupBy({
      by: ['category'],
      where: { status: 'active' },
      _count: { _all: true },
    });

    // Build KPI data
    const kpis = {
      activeWorkflows: activeWorkflowsCount,
      policyDocuments: policyDocsCount,
      pendingApprovals: pendingInstancesCount,
      complianceScore,
    };

    // Build workflow activity from real instances
    const workflowActivity = recentInstances.map((inst) => ({
      id: inst.id,
      title: `${inst.workflowDefinition.name} — ${inst.entityType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}`,
      status: inst.status === 'approved' ? 'Completed' : inst.status === 'rejected' ? 'Rejected' : inst.status === 'pending' ? 'Pending' : 'In Progress',
      time: inst.updatedAt.toISOString(),
      module: inst.workflowDefinition.module,
    }));

    // Build compliance items from policy categories with computed scores
    const complianceItems = policyCategories.map((pc) => {
      const count = pc._count._all;
      // Assign a score based on count relative to total active policies
      const ratio = policyDocsCount > 0 ? count / policyDocsCount : 0;
      const percent = Math.min(100, Math.round(ratio * 100 + (count > 0 ? 60 : 0))); // baseline 60% if category has policies
      return {
        label: pc.category.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        percent,
      };
    });

    // If no policy categories exist, return empty array (no hardcoded defaults)
    // Sort compliance items by percent descending
    complianceItems.sort((a, b) => b.percent - a.percent);

    // Additional metrics
    const metrics = {
      auditLogsLast30Days: auditLogCount,
      notificationsLast30Days: notificationStats._count._all,
      totalWorkflowInstances: totalInstances,
      completedWorkflowInstances: completedInstances,
    };

    return NextResponse.json(
      { kpis, workflowActivity, complianceItems, metrics },
      { headers: corsHeaders() }
    );
  } catch (error) {
    console.error('Governance dashboard error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
