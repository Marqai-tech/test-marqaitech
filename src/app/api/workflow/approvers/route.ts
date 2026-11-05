import { NextRequest, NextResponse } from 'next/server';
import { getDb, getPlatformDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { resolveCompanyScope } from '@/lib/companyScope';

/**
 * GET /api/workflow/approvers?module=leave|wfh|gatepass|permission|regularize|overtime|compoff[&leaveTypeId=...]
 *
 * Returns the resolved approver chain for the currently-authenticated user,
 * for the given module's workflow. Each tier is resolved to a concrete user
 * (name + email) where possible, so the employee can see exactly who will
 * approve their request at each tier BEFORE they submit it.
 *
 * Response shape:
 *   {
 *     module: 'leave',
 *     tiers: [
 *       { tier: 1, label: 'Reporting Manager', approverType: 'reporting_manager',
 *         user: { id, name, email } | null },
 *       { tier: 2, label: 'HR Admin', approverType: 'hr_admin',
 *         user: { id, name, email } | null },
 *     ],
 *     source: 'tenant_config' | 'default'
 *   }
 */
export async function GET(request: NextRequest) {
  const db = await getDb(request);
  const platformDb = getPlatformDb();
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const scope = await resolveCompanyScope(request);
    if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const module = (searchParams.get('module') || 'leave').toLowerCase();
    const leaveTypeId = searchParams.get('leaveTypeId') || undefined;

    // Resolve the current user's Employee record (for tier resolution)
    const employee = await db.employee.findFirst({
      where: { userId: scope.userId, status: 'active' },
      select: {
        id: true, userId: true, reportingManagerId: true, departmentId: true,
        department: { select: { id: true, headId: true } },
      },
    });

    if (!employee) {
      // User has no Employee record — return an empty chain (e.g. tenant_admin)
      return NextResponse.json({
        module,
        tiers: [],
        source: 'no_employee_record',
        note: 'Your user is not linked to an Employee record, so no approver chain can be resolved.',
      });
    }

    const tenantId = scope.tenantId;
    const tiers: Array<{
      tier: number;
      label: string;
      approverType: string;
      user: { id: string; name: string; email: string } | null;
    }> = [];

    let source: 'tenant_config' | 'default' = 'default';

    if (module === 'leave') {
      // ─── LEAVE workflow ───
      const { loadWorkflowConfig, resolveApproverForTier } = await import('@/lib/leave-workflow');
      const { config, configId } = await loadWorkflowConfig(db, tenantId, leaveTypeId || null);
      if (configId) source = 'tenant_config';

      for (const tier of config.tiers || []) {
        const approverUserId = await resolveApproverForTier(db, employee.id, tenantId, tier);
        let userObj: { id: string; name: string; email: string } | null = null;
        if (approverUserId) {
          const u = await db.user.findUnique({
            where: { id: approverUserId },
            select: { id: true, name: true, email: true },
          }).catch(() => null);
          if (u) userObj = u;
        }
        tiers.push({
          tier: tier.tier,
          label: tier.label || tier.approverType,
          approverType: tier.approverType,
          user: userObj,
        });
      }
    } else {
      // ─── ATTENDANCE-family workflow (wfh, gatepass, permission, regularize, overtime, compoff) ───
      const att = await import('@/lib/attendance-workflow');
      const REQUEST_TYPE_MAP: Record<string, string> = {
        wfh: 'WFH',
        gatepass: 'GATE_PASS',
        permission: 'HOURLY_PERMISSION',
        regularize: 'REGULARIZATION',
        compoff: 'COMP_OFF',
        overtime: 'OVERTIME',
      };
      const requestType = REQUEST_TYPE_MAP[module] as any;

      // loadWorkflowConfig returns the configured or default chain
      let levels: any[] = [];
      let configSource = 'default';
      if (requestType && att.DEFAULT_WORKFLOW_CONFIGS[requestType]) {
        try {
          const { config, configId } = await att.loadWorkflowConfig(
            db,
            scope.companyId || null,
            requestType,
            undefined,
          );
          levels = config.levels || [];
          if (configId) configSource = 'tenant_config';
        } catch {
          levels = att.DEFAULT_WORKFLOW_CONFIGS[requestType].levels || [];
        }
      } else if (requestType) {
        // OVERTIME / COMP_OFF have no entry in DEFAULT_WORKFLOW_CONFIGS —
        // synthesize a sensible default: reporting_manager → hr_admin
        levels = [
          { level: 1, actorType: 'reporting_manager', label: 'Reporting Manager', slaHours: 48 },
          { level: 2, actorType: 'hr_admin', label: 'HR Administrator', slaHours: 24 },
        ];
      }
      source = configSource as any;

      for (const lvl of levels) {
        const actorUserId = await att.resolveActorForLevel(db, employee.id, tenantId, lvl.actorType).catch(() => null);
        let userObj: { id: string; name: string; email: string } | null = null;
        if (actorUserId) {
          const u = await db.user.findUnique({
            where: { id: actorUserId },
            select: { id: true, name: true, email: true },
          }).catch(() => null);
          if (u) userObj = u;
        }
        // A reporting manager may have an Employee profile/email but no linked
        // User row yet. Show the actual assigned manager in the preview instead
        // of the misleading runtime placeholder; email delivery can still use
        // the employee's official email.
        if (!userObj && lvl.actorType === 'reporting_manager' && employee.reportingManagerId) {
          const managerEmployee = await db.employee.findUnique({
            where: { id: employee.reportingManagerId },
            select: { id: true, firstName: true, lastName: true, email: true },
          });
          if (managerEmployee?.email) {
            userObj = {
              id: managerEmployee.id,
              name: `${managerEmployee.firstName} ${managerEmployee.lastName}`.trim(),
              email: managerEmployee.email,
            };
          }
        }
        tiers.push({
          tier: lvl.level,
          label: lvl.label || lvl.actorType,
          approverType: lvl.actorType,
          user: userObj,
        });
      }
    }

    return NextResponse.json({
      module,
      tiers,
      source,
      employeeName: `${employee.id ? '' : ''}`, // don't leak; UI already knows
    });
  } catch (error) {
    console.error('GET /api/workflow/approvers error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 },
    );
  }
}
