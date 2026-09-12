import { NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import {
  WORKFLOW_TYPES,
  WorkflowType,
  validateWorkflowConfig,
  resolveWorkflowConfig,
  DEFAULT_CONFIGS,
} from '@/lib/recruitment-workflow';

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

const MANAGE_ROLES = ['tenant_admin', 'admin', 'hr_admin', 'company_hr_admin', 'super_admin'];

function parseType(raw: string | null): WorkflowType | null {
  if (!raw) return null;
  return (WORKFLOW_TYPES as string[]).includes(raw) ? (raw as WorkflowType) : null;
}

// ─── GET: resolve effective config (config merged over defaults) ───
export async function GET(request: Request) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });

    const { searchParams } = new URL(request.url);
    const type = parseType(searchParams.get('type'));
    if (!type) {
      return NextResponse.json({ error: `Invalid or missing type — allowed: ${WORKFLOW_TYPES.join(', ')}` }, { status: 400, headers: corsHeaders() });
    }
    const companyId = searchParams.get('companyId') || null;
    const tenantId = decoded.tenantId as string | undefined;

    const effective = await resolveWorkflowConfig(db, tenantId, type, companyId);

    // Include the raw saved row (if any) so the UI can show "customized vs defaults"
    let saved: Record<string, unknown> | null = null;
    if (tenantId) {
      const rows = await (db as any).recruitmentWorkflowConfig.findMany({
        where: { tenantId, workflowType: type, isActive: true },
        orderBy: { updatedAt: 'desc' },
      }).catch(() => []);
      const row = companyId ? rows.find((r: any) => r.companyId === companyId) : rows.find((r: any) => !r.companyId);
      if (row) {
        let parsed: unknown = null;
        try { parsed = JSON.parse(row.config); } catch { /* ignore */ }
        saved = {
          id: row.id,
          name: row.name,
          description: row.description,
          companyId: row.companyId || null,
          config: parsed,
          updatedAt: row.updatedAt,
          updatedBy: row.updatedBy,
        };
      }
    }

    return NextResponse.json({ type, effective, saved, defaults: DEFAULT_CONFIGS[type] }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Get workflow config error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

// ─── PUT: save config (upsert tenant-wide or company-scoped) ───
export async function PUT(request: Request) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    if (!MANAGE_ROLES.includes(String(decoded.role))) {
      return NextResponse.json({ error: 'Not authorized to manage workflow configuration' }, { status: 403, headers: corsHeaders() });
    }
    const tenantId = decoded.tenantId as string | undefined;
    if (!tenantId) return NextResponse.json({ error: 'Tenant context required' }, { status: 400, headers: corsHeaders() });

    const body = await request.json();
    const type = parseType(body?.workflowType || body?.type || null);
    if (!type) {
      return NextResponse.json({ error: `Invalid or missing workflowType — allowed: ${WORKFLOW_TYPES.join(', ')}` }, { status: 400, headers: corsHeaders() });
    }
    if (decoded.role === 'super_admin' && !body?.companyId) {
      // super admins must scope explicitly — refuse to write cross-tenant
      return NextResponse.json({ error: 'super_admin must pass companyId scope to save workflow config' }, { status: 400, headers: corsHeaders() });
    }
    const companyId: string | null = body?.companyId || null;

    const validation = validateWorkflowConfig(type, body?.config);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400, headers: corsHeaders() });
    }

    const name = typeof body?.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 120) : `${type[0].toUpperCase()}${type.slice(1)} Workflow`;
    const description = typeof body?.description === 'string' ? body.description.slice(0, 300) : null;

    const existing = await (db as any).recruitmentWorkflowConfig.findFirst({
      where: { tenantId, workflowType: type, companyId, isActive: true },
    });

    const data = {
      tenantId,
      companyId,
      workflowType: type,
      name,
      description,
      config: JSON.stringify(validation.value),
      updatedBy: String(decoded.userId || ''),
      isActive: true,
    };

    let row;
    if (existing) {
      row = await (db as any).recruitmentWorkflowConfig.update({ where: { id: existing.id }, data });
    } else {
      row = await (db as any).recruitmentWorkflowConfig.create({ data: { ...data, createdBy: String(decoded.userId || '') } });
    }

    try {
      await (db as any).auditLog.create({
        data: {
          userId: String(decoded.userId || '') || null,
          action: 'WORKFLOW_CONFIG_UPDATED',
          module: 'recruitment',
          details: `${type} workflow configuration saved${companyId ? ` (company ${companyId})` : ''}.`,
        },
      }).catch(() => null);
    } catch { /* non-critical */ }

    return NextResponse.json({ success: true, config: row, effective: validation.value }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Save workflow config error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

// ─── DELETE: reset to defaults (deactivate saved row) ───
export async function DELETE(request: Request) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    if (!MANAGE_ROLES.includes(String(decoded.role))) {
      return NextResponse.json({ error: 'Not authorized to manage workflow configuration' }, { status: 403, headers: corsHeaders() });
    }
    const tenantId = decoded.tenantId as string | undefined;
    if (!tenantId) return NextResponse.json({ error: 'Tenant context required' }, { status: 400, headers: corsHeaders() });

    const { searchParams } = new URL(request.url);
    const type = parseType(searchParams.get('type'));
    if (!type) return NextResponse.json({ error: 'Invalid or missing type' }, { status: 400, headers: corsHeaders() });
    const companyId = searchParams.get('companyId') || null;

    const existing = await (db as any).recruitmentWorkflowConfig.findFirst({
      where: { tenantId, workflowType: type, companyId, isActive: true },
    });
    if (existing) {
      await (db as any).recruitmentWorkflowConfig.update({ where: { id: existing.id }, data: { isActive: false, updatedBy: String(decoded.userId || '') } });
    }
    return NextResponse.json({ success: true, reset: true, effective: DEFAULT_CONFIGS[type] }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Reset workflow config error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
