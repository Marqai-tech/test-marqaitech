/**
 * Policy Rule Config detail API — update + delete + patch (status toggle)
 */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { getAuthInfo } from '@/lib/companyScope';
import { safeAuditLog } from '@/lib/audit-safe';

const ADMIN_ROLES = ['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_admin'];

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: cors() });
}

// PUT — full update
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(req);
  try {
    const auth = await getAuthInfo(req);
    if (!auth || !ADMIN_ROLES.includes(auth.role)) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403, headers: cors() });
    }

    const { id } = await params;
    const body = await req.json();
    const { name, description, policyRuleId, leaveTypeId, category, value, unit, effectiveFrom, effectiveTo, status } = body;

    if (!name || !policyRuleId || !category || value === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400, headers: cors() });
    }

    await db.$executeRawUnsafe(`
      UPDATE "PolicyRuleConfig"
      SET "name" = $2, "description" = $3, "policyRuleId" = $4, "leaveTypeId" = $5,
          "category" = $6, "value" = $7, "unit" = $8,
          "effectiveFrom" = $9, "effectiveTo" = $10, "status" = $11,
          "updatedBy" = $12, "updatedAt" = NOW()
      WHERE id = $1
    `,
      id, name, description || null, policyRuleId, leaveTypeId || null, category, String(value), unit || '',
      effectiveFrom ? new Date(effectiveFrom) : null, effectiveTo ? new Date(effectiveTo) : null,
      status || 'active', auth.userId
    );

    await safeAuditLog(db, {
      userId: auth.userId,
      action: 'policy_rule_config.update',
      module: 'leave_configuration',
      details: `Updated policy rule config ${id}: ${name}`,
    }).catch(() => {});

    return NextResponse.json({ message: 'Rule updated' }, { headers: cors() });
  } catch (error: any) {
    console.error('[policy-rule-configs PUT] error:', error);
    return NextResponse.json({ error: 'Failed to update rule' }, { status: 500, headers: cors() });
  }
}

// PATCH — partial update (e.g. status toggle)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(req);
  try {
    const auth = await getAuthInfo(req);
    if (!auth || !ADMIN_ROLES.includes(auth.role)) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403, headers: cors() });
    }

    const { id } = await params;
    const body = await req.json();
    const { status } = body;

    if (!status || !['active', 'inactive'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400, headers: cors() });
    }

    await db.$executeRawUnsafe(`
      UPDATE "PolicyRuleConfig" SET status = $2, "updatedBy" = $3, "updatedAt" = NOW() WHERE id = $1
    `, id, status, auth.userId);

    return NextResponse.json({ message: `Rule ${status}` }, { headers: cors() });
  } catch (error) {
    console.error('[policy-rule-configs PATCH] error:', error);
    return NextResponse.json({ error: 'Failed to update' }, { status: 500, headers: cors() });
  }
}

// DELETE
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(req);
  try {
    const auth = await getAuthInfo(req);
    if (!auth || !ADMIN_ROLES.includes(auth.role)) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403, headers: cors() });
    }

    const { id } = await params;
    await db.$executeRawUnsafe(`DELETE FROM "PolicyRuleConfig" WHERE id = $1`, id);

    await safeAuditLog(db, {
      userId: auth.userId,
      action: 'policy_rule_config.delete',
      module: 'leave_configuration',
      details: `Deleted policy rule config ${id}`,
    }).catch(() => {});

    return NextResponse.json({ message: 'Rule deleted' }, { headers: cors() });
  } catch (error) {
    console.error('[policy-rule-configs DELETE] error:', error);
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500, headers: cors() });
  }
}
