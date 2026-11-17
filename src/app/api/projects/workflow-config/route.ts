import { NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import {
  validateProjectWorkflowConfig,
  mergeProjectWorkflowConfig,
  resolveProjectWorkflowConfig,
  DEFAULT_PROJECT_WORKFLOW_CONFIG,
} from '@/lib/project-workflow';

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

// GET /api/projects/workflow-config[?companyId=]
// Returns the effective config (resolved) + raw row meta.
export async function GET(request: Request) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    const decoded = token ? await verifyToken(token) : null;
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    }
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId') || null;
    const tenantId = (decoded as any).tenantId || null;

    const effective = await resolveProjectWorkflowConfig(db, tenantId, companyId);
    const rows = tenantId
      ? await db.projectWorkflowConfig.findMany({
          where: { tenantId, isActive: true, ...(companyId ? { OR: [{ companyId }, { companyId: null }] } : {}) },
          orderBy: { updatedAt: 'desc' },
        }).catch(() => [])
      : [];

    return NextResponse.json(
      { config: effective, defaults: DEFAULT_PROJECT_WORKFLOW_CONFIG, rows },
      { headers: corsHeaders() }
    );
  } catch (error) {
    console.error('Get project workflow config error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

// PUT /api/projects/workflow-config  { companyId?: string|null, config: {...}, name?, description? }
// Admin-only (tenant_admin / super_admin / admin). Upserts the row (company-scoped or tenant-wide).
export async function PUT(request: Request) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });

    const role = (decoded as any).role;
    if (!['tenant_admin', 'ceo', 'super_admin', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Only administrators can modify the project delivery workflow' }, { status: 403, headers: corsHeaders() });
    }

    const body = await request.json();
    const companyId = body.companyId || null;
    const tenantId = (decoded as any).tenantId || null;
    if (!tenantId) return NextResponse.json({ error: 'No tenant context' }, { status: 400, headers: corsHeaders() });
    if (role === 'super_admin' && !companyId) {
      return NextResponse.json({ error: 'super_admin must scope the config to a companyId' }, { status: 400, headers: corsHeaders() });
    }

    // Validate the merged config (partial updates allowed)
    const existing = await resolveProjectWorkflowConfig(db, tenantId, companyId);
    const merged = mergeProjectWorkflowConfig({ ...existing, ...(body.config || {}) });
    const validated = validateProjectWorkflowConfig(merged);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400, headers: corsHeaders() });
    }

    const row = await db.projectWorkflowConfig.upsert({
      where: { tenantId_companyId: { tenantId, companyId: companyId as string } },
      create: {
        tenantId,
        companyId,
        config: JSON.stringify(validated.value),
        name: body.name || 'Project Delivery Workflow',
        description: body.description || null,
        createdBy: (decoded as any).userId,
        updatedBy: (decoded as any).userId,
      },
      update: {
        config: JSON.stringify(validated.value),
        name: body.name || 'Project Delivery Workflow',
        description: body.description ?? null,
        isActive: true,
        updatedBy: (decoded as any).userId,
      },
    });

    await db.auditLog.create({
      data: {
        userId: (decoded as any).userId as string,
        action: 'UPDATE_PROJECT_WORKFLOW_CONFIG',
        module: 'projects',
        details: `Project delivery workflow config updated (companyId=${companyId || 'tenant-wide'})`,
      },
    }).catch(() => null);

    return NextResponse.json({ config: JSON.parse(row.config), row: { id: row.id, companyId: row.companyId, updatedAt: row.updatedAt } }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Update project workflow config error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

// DELETE /api/projects/workflow-config[?companyId=] — reset to defaults (deactivate row)
export async function DELETE(request: Request) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    const role = (decoded as any).role;
    if (!['tenant_admin', 'ceo', 'super_admin', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Only administrators can reset the workflow configuration' }, { status: 403, headers: corsHeaders() });
    }
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId') || null;
    const tenantId = (decoded as any).tenantId || null;
    if (!tenantId) return NextResponse.json({ error: 'No tenant context' }, { status: 400, headers: corsHeaders() });

    await db.projectWorkflowConfig.updateMany({
      where: { tenantId, companyId },
      data: { isActive: false, updatedBy: (decoded as any).userId },
    });

    return NextResponse.json({ ok: true, config: DEFAULT_PROJECT_WORKFLOW_CONFIG }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Delete project workflow config error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
