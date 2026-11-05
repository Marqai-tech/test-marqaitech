/**
 * Leave Carry-Forward Rules API
 * GET    — list rules for a policy (filter: ?policyRuleId=) or all company rules
 * POST   — create a rule (admin only)
 * PUT    — update a rule (admin only)
 * DELETE — delete a rule (admin only)
 */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { getCompanyFilter, getAuthInfo } from '@/lib/companyScope';
import { syncLeaveConfigSchema } from '@/lib/leave-config-schema-sync';
import { safeAuditLog } from '@/lib/audit-safe';

const ADMIN_ROLES = ['super_admin', 'tenant_admin', 'ceo', 'admin'];

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: cors() });
}

export async function GET(req: NextRequest) {
  const db = await getDb(req);
  try {
    await syncLeaveConfigSchema(db);
    const companyFilter = await getCompanyFilter(req);
    if (companyFilter === null) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: cors() });
    }
    const { searchParams } = new URL(req.url);
    const policyRuleId = searchParams.get('policyRuleId');
    const leaveTypeId = searchParams.get('leaveTypeId');

    // Join through LeavePolicyRule to enforce company scoping
    const companyId = (companyFilter as any).companyId;
    let rows: any[] = [];
    if (companyId) {
      const conditions = [`r."companyId" = $1`];
      const params: any[] = [companyId];
      if (policyRuleId) { conditions.push(`c."policyRuleId" = $${params.length + 1}`); params.push(policyRuleId); }
      if (leaveTypeId) {
        conditions.push(`(c."leaveTypeId" = $${params.length + 1} OR c."leaveTypeId" IS NULL)`);
        params.push(leaveTypeId);
      }
      rows = await db.$queryRawUnsafe(`
        SELECT c.*, r.name as "policyRuleName"
        FROM "LeaveCarryForwardRule" c
        JOIN "LeavePolicyRule" r ON r.id = c."policyRuleId"
        WHERE ${conditions.join(' AND ')} AND c.status = 'active'
        ORDER BY c.priority DESC, c."createdAt" ASC
      `, ...params);
    }
    return NextResponse.json({ data: rows }, { headers: cors() });
  } catch (error) {
    console.error('[carry-forward GET] error:', error);
    return NextResponse.json({ data: [] }, { headers: cors() });
  }
}

export async function POST(req: NextRequest) {
  const db = await getDb(req);
  try {
    await syncLeaveConfigSchema(db);
    const auth = await getAuthInfo(req);
    if (!auth || !ADMIN_ROLES.includes(auth.role)) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403, headers: cors() });
    }
    const body = await req.json();
    const { policyRuleId, leaveTypeId, conditionField, conditionOperator, conditionValue,
            carryForwardDays, encashmentDays, remainingTreatment, priority, status } = body;

    if (!policyRuleId) {
      return NextResponse.json({ error: 'policyRuleId is required' }, { status: 400, headers: cors() });
    }

    // Verify policy rule exists in caller's company
    const cf = await getCompanyFilter(req);
    const companyId = (cf as any)?.companyId;
    if (companyId) {
      const pr = await db.leavePolicyRule.findFirst({ where: { id: policyRuleId, companyId }, select: { id: true } });
      if (!pr) return NextResponse.json({ error: 'Policy rule not found in your company' }, { status: 404, headers: cors() });
    }

    const id = `lcfr_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    await db.$executeRawUnsafe(`
      INSERT INTO "LeaveCarryForwardRule"
        ("id", "policyRuleId", "leaveTypeId", "conditionField", "conditionOperator", "conditionValue",
         "carryForwardDays", "encashmentDays", "remainingTreatment", "priority", "status", "createdBy", "updatedBy", "createdAt", "updatedAt")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
    `,
      id, policyRuleId, leaveTypeId || null,
      conditionField || 'balance', conditionOperator || 'gte', Number(conditionValue) || 0,
      Number(carryForwardDays) || 0, Number(encashmentDays) || 0,
      remainingTreatment || 'expire', Number(priority) || 0, status || 'active',
      auth.userId, auth.userId,
    );

    await safeAuditLog(db, {
      userId: auth.userId,
      action: 'leave_carry_forward_rule.create',
      module: 'leave_configuration',
      details: `Created carry-forward rule ${id} for policy ${policyRuleId}`,
    }).catch(() => {});

    return NextResponse.json({ id, message: 'Rule created' }, { status: 201, headers: cors() });
  } catch (error) {
    console.error('[carry-forward POST] error:', error);
    return NextResponse.json({ error: 'Failed to create carry-forward rule' }, { status: 500, headers: cors() });
  }
}

export async function PUT(req: NextRequest) {
  const db = await getDb(req);
  try {
    await syncLeaveConfigSchema(db);
    const auth = await getAuthInfo(req);
    if (!auth || !ADMIN_ROLES.includes(auth.role)) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403, headers: cors() });
    }
    const body = await req.json();
    const { id, leaveTypeId, conditionField, conditionOperator, conditionValue,
            carryForwardDays, encashmentDays, remainingTreatment, priority, status } = body;

    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400, headers: cors() });

    const sets: string[] = [];
    const vals: any[] = [];
    let pIdx = 1;
    if (leaveTypeId !== undefined) { sets.push(`"leaveTypeId" = $${pIdx++}`); vals.push(leaveTypeId || null); }
    if (conditionField !== undefined) { sets.push(`"conditionField" = $${pIdx++}`); vals.push(conditionField); }
    if (conditionOperator !== undefined) { sets.push(`"conditionOperator" = $${pIdx++}`); vals.push(conditionOperator); }
    if (conditionValue !== undefined) { sets.push(`"conditionValue" = $${pIdx++}`); vals.push(Number(conditionValue)); }
    if (carryForwardDays !== undefined) { sets.push(`"carryForwardDays" = $${pIdx++}`); vals.push(Number(carryForwardDays)); }
    if (encashmentDays !== undefined) { sets.push(`"encashmentDays" = $${pIdx++}`); vals.push(Number(encashmentDays)); }
    if (remainingTreatment !== undefined) { sets.push(`"remainingTreatment" = $${pIdx++}`); vals.push(remainingTreatment); }
    if (priority !== undefined) { sets.push(`"priority" = $${pIdx++}`); vals.push(Number(priority)); }
    if (status !== undefined) { sets.push(`"status" = $${pIdx++}`); vals.push(status); }
    sets.push(`"updatedBy" = $${pIdx++}`); vals.push(auth.userId);
    sets.push(`"updatedAt" = NOW()`);
    vals.push(id);

    await db.$executeRawUnsafe(`UPDATE "LeaveCarryForwardRule" SET ${sets.join(', ')} WHERE "id" = $${pIdx}`, ...vals);

    await safeAuditLog(db, {
      userId: auth.userId,
      action: 'leave_carry_forward_rule.update',
      module: 'leave_configuration',
      details: `Updated carry-forward rule ${id}`,
    }).catch(() => {});

    return NextResponse.json({ message: 'Rule updated' }, { headers: cors() });
  } catch (error) {
    console.error('[carry-forward PUT] error:', error);
    return NextResponse.json({ error: 'Failed to update carry-forward rule' }, { status: 500, headers: cors() });
  }
}

export async function DELETE(req: NextRequest) {
  const db = await getDb(req);
  try {
    await syncLeaveConfigSchema(db);
    const auth = await getAuthInfo(req);
    if (!auth || !ADMIN_ROLES.includes(auth.role)) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403, headers: cors() });
    }
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400, headers: cors() });

    await db.$executeRawUnsafe(`DELETE FROM "LeaveCarryForwardRule" WHERE "id" = $1`, id);

    await safeAuditLog(db, {
      userId: auth.userId,
      action: 'leave_carry_forward_rule.delete',
      module: 'leave_configuration',
      details: `Deleted carry-forward rule ${id}`,
    }).catch(() => {});

    return NextResponse.json({ message: 'Rule deleted' }, { headers: cors() });
  } catch (error) {
    console.error('[carry-forward DELETE] error:', error);
    return NextResponse.json({ error: 'Failed to delete carry-forward rule' }, { status: 500, headers: cors() });
  }
}
