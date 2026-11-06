import { NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

const ALL_ROLES = ['hr_admin', 'tenant_admin', 'manager', 'finance', 'dept_head', 'ceo', 'hr_head', 'candidate'];

const ALL_PERMISSIONS = [
  'view_offers', 'create_offer', 'edit_offer', 'delete_draft',
  'select_template', 'generate_preview', 'download_pdf', 'submit_for_approval',
  'approve_offer', 'reject_offer', 'send_offer', 'cancel_offer',
  'view_offer_history', 'convert_employee',
];

// Default permission matrix — applied when the tenant has no saved config yet
const DEFAULT_MATRIX: Record<string, Record<string, boolean>> = {
  hr_admin:      Object.fromEntries(ALL_PERMISSIONS.map(p => [p, !['convert_employee'].includes(p) || true])),
  tenant_admin:  Object.fromEntries(ALL_PERMISSIONS.map(p => [p, true])),
  manager:       Object.fromEntries(ALL_PERMISSIONS.map(p => [p, ['view_offers', 'generate_preview', 'download_pdf', 'view_offer_history'].includes(p)])),
  finance:       Object.fromEntries(ALL_PERMISSIONS.map(p => [p, ['view_offers', 'approve_offer', 'reject_offer', 'view_offer_history'].includes(p)])),
  dept_head:     Object.fromEntries(ALL_PERMISSIONS.map(p => [p, ['view_offers', 'approve_offer', 'reject_offer', 'view_offer_history'].includes(p)])),
  ceo:           Object.fromEntries(ALL_PERMISSIONS.map(p => [p, ['view_offers', 'approve_offer', 'reject_offer', 'send_offer', 'view_offer_history', 'convert_employee'].includes(p)])),
  hr_head:       Object.fromEntries(ALL_PERMISSIONS.map(p => [p, true])),
  candidate:     Object.fromEntries(ALL_PERMISSIONS.map(p => [p, false])),
};

/**
 * GET /api/offers/permissions
 *   Returns the full permission matrix for the tenant. If no rows exist
 *   yet, returns the default matrix (above) so the UI has something to
 *   show on first visit.
 */
export async function GET(request: Request) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });

    const tenantId = (decoded as any).tenantId as string;
    if (!tenantId) return NextResponse.json({ error: 'No tenant context' }, { status: 400, headers: corsHeaders() });

    let rows: any[] = [];
    try {
      rows = await db.$queryRawUnsafe(
        `SELECT "role", "permission", "allowed" FROM "OfferPermission" WHERE "tenantId" = $1`,
        tenantId,
      ) as any[];
    } catch {}

    // Build the matrix
    const matrix: Record<string, Record<string, boolean>> = {};
    for (const role of ALL_ROLES) {
      matrix[role] = { ...DEFAULT_MATRIX[role] };
    }
    // Overlay saved rows
    for (const r of rows) {
      if (!matrix[r.role]) matrix[r.role] = {};
      matrix[r.role][r.permission] = r.allowed;
    }

    return NextResponse.json({
      roles: ALL_ROLES,
      permissions: ALL_PERMISSIONS,
      matrix,
      isDefault: rows.length === 0,
    }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Get offer permissions error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

/**
 * PUT /api/offers/permissions
 *   Body: { matrix: { [role]: { [permission]: boolean } } }
 *
 *   Replaces the entire permission matrix for the tenant. Uses upsert
 *   semantics on each (role, permission) pair.
 */
export async function PUT(request: Request) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });

    const HR_ROLES = ['super_admin', 'tenant_admin', 'admin', 'hr_admin', 'company_hr_admin'];
    if (!HR_ROLES.includes((decoded as any).role || '')) {
      return NextResponse.json({ error: 'Only HR/Admin can configure permissions' }, { status: 403, headers: corsHeaders() });
    }

    const tenantId = (decoded as any).tenantId as string;
    const userId = (decoded as any).userId as string;
    if (!tenantId) return NextResponse.json({ error: 'No tenant context' }, { status: 400, headers: corsHeaders() });

    const body = await request.json();
    const matrix = body?.matrix;
    if (!matrix || typeof matrix !== 'object') {
      return NextResponse.json({ error: 'matrix object is required' }, { status: 400, headers: corsHeaders() });
    }

    // Safety rule: candidates can never have any permission other than view
    if (matrix.candidate) {
      for (const p of ALL_PERMISSIONS) {
        if (p !== 'view_offers') matrix.candidate[p] = false;
      }
    }

    // Ensure table exists
    try {
      await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "OfferPermission" (
        "id" TEXT NOT NULL,
        "tenantId" TEXT NOT NULL,
        "role" TEXT NOT NULL,
        "permission" TEXT NOT NULL,
        "allowed" BOOLEAN NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "OfferPermission_pkey" PRIMARY KEY ("id")
      )`);
      await db.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "OfferPermission_tenantId_role_permission_key" ON "OfferPermission"("tenantId", "role", "permission")`);
    } catch {}

    let upserted = 0;
    for (const role of Object.keys(matrix)) {
      for (const permission of Object.keys(matrix[role])) {
        const allowed = !!matrix[role][permission];
        const id = `operm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        try {
          // Upsert via raw SQL — INSERT ON CONFLICT
          await db.$executeRawUnsafe(
            `INSERT INTO "OfferPermission" ("id", "tenantId", "role", "permission", "allowed", "updatedAt")
             VALUES ($1, $2, $3, $4, $5, NOW())
             ON CONFLICT ("tenantId", "role", "permission")
             DO UPDATE SET "allowed" = EXCLUDED."allowed", "updatedAt" = NOW()`,
            id, tenantId, role, permission, allowed,
          );
          upserted++;
        } catch (e) {
          console.warn(`[Permissions PUT] failed to upsert ${role}/${permission}:`, e instanceof Error ? e.message : e);
        }
      }
    }

    // Audit log
    try {
      await db.auditLog.create({
        data: { userId, action: 'UPDATE_OFFER_PERMISSIONS', module: 'offers',
          details: `Updated offer permission matrix — ${upserted} rules` },
      });
    } catch {}

    return NextResponse.json({ success: true, upserted, roles: ALL_ROLES, permissions: ALL_PERMISSIONS, matrix }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Update offer permissions error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
