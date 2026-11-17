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

const DEFAULT_LEVELS = [
  { tier: 1, approverType: 'hr_admin', label: 'HR Admin Approval' },
  { tier: 2, approverType: 'finance', label: 'Finance / Budget Approval' },
  { tier: 3, approverType: 'ceo', label: 'CEO Final Approval' },
];

const DEFAULT_RULES = {
  salaryThreshold: 1500000,        // LPA — offers above this require extra approval
  requiredApproverRoles: ['hr_admin', 'finance', 'ceo'],
  rejectionBehavior: 'send_back_to_hr', // 'send_back_to_hr' | 'reject_permanently'
  candidateNotification: true,
  approvalReminderDays: 2,
  offerExpiryDays: 7,
  esignatureRequired: false,
  autoConvertAfterAcceptance: false,
  bgvRequired: true,
  preboardingAfterAcceptance: true,
  employeeIdFormat: 'EMP-{YYYY}-{NNN}',
};

/**
 * GET /api/offers/workflow-config
 *   Returns the per-tenant offer approval workflow configuration.
 *   If no row exists yet, returns the default config (above) so the UI
 *   can render a working starting point.
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
        `SELECT * FROM "OfferWorkflowConfig" WHERE "tenantId" = $1 LIMIT 1`,
        tenantId,
      ) as any[];
    } catch {}

    if (rows.length === 0) {
      return NextResponse.json({
        config: {
          tenantId,
          workflowType: 'recruitment',
          approvalRequired: true,
          levels: DEFAULT_LEVELS,
          rules: DEFAULT_RULES,
        },
        isDefault: true,
      }, { headers: corsHeaders() });
    }

    const row = rows[0];
    return NextResponse.json({
      config: {
        tenantId: row.tenantId,
        workflowType: row.workflowType || 'recruitment',
        approvalRequired: row.approvalRequired,
        levels: row.levels ? safeParse(row.levels, DEFAULT_LEVELS) : DEFAULT_LEVELS,
        rules: row.rules ? safeParse(row.rules, DEFAULT_RULES) : DEFAULT_RULES,
      },
      isDefault: false,
    }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Get offer workflow config error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

/**
 * PUT /api/offers/workflow-config
 *   Body: { approvalRequired, levels, rules }
 *
 *   Creates or updates the per-tenant workflow config.
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
      return NextResponse.json({ error: 'Only HR/Admin can configure workflow' }, { status: 403, headers: corsHeaders() });
    }

    const tenantId = (decoded as any).tenantId as string;
    const userId = (decoded as any).userId as string;
    if (!tenantId) return NextResponse.json({ error: 'No tenant context' }, { status: 400, headers: corsHeaders() });

    const body = await request.json();
    const { approvalRequired, levels, rules } = body;

    // Validate
    if (typeof approvalRequired !== 'boolean') {
      return NextResponse.json({ error: 'approvalRequired must be a boolean' }, { status: 400, headers: corsHeaders() });
    }
    if (levels && !Array.isArray(levels)) {
      return NextResponse.json({ error: 'levels must be an array' }, { status: 400, headers: corsHeaders() });
    }

    const levelsJson = levels ? JSON.stringify(levels) : JSON.stringify(DEFAULT_LEVELS);
    const rulesJson = rules ? JSON.stringify(rules) : JSON.stringify(DEFAULT_RULES);

    // Ensure table exists
    try {
      await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "OfferWorkflowConfig" (
        "id" TEXT NOT NULL,
        "tenantId" TEXT NOT NULL UNIQUE,
        "workflowType" TEXT NOT NULL DEFAULT 'recruitment',
        "approvalRequired" BOOLEAN NOT NULL DEFAULT true,
        "levels" TEXT,
        "rules" TEXT,
        "updatedBy" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "OfferWorkflowConfig_pkey" PRIMARY KEY ("id")
      )`);
    } catch {}

    // Upsert
    const existing = await db.$queryRawUnsafe(
      `SELECT "id" FROM "OfferWorkflowConfig" WHERE "tenantId" = $1 LIMIT 1`,
      tenantId,
    ).catch(() => []) as any[];

    if (existing.length === 0) {
      const id = `owfc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await db.$executeRawUnsafe(
        `INSERT INTO "OfferWorkflowConfig" ("id", "tenantId", "workflowType", "approvalRequired", "levels", "rules", "updatedBy", "updatedAt")
         VALUES ($1, $2, 'recruitment', $3, $4, $5, $6, NOW())`,
        id, tenantId, approvalRequired, levelsJson, rulesJson, userId,
      );
    } else {
      await db.$executeRawUnsafe(
        `UPDATE "OfferWorkflowConfig" SET
          "approvalRequired" = $3, "levels" = $4, "rules" = $5, "updatedBy" = $6, "updatedAt" = NOW()
         WHERE "id" = $1 AND "tenantId" = $2`,
        existing[0].id, tenantId, approvalRequired, levelsJson, rulesJson, userId,
      );
    }

    // Audit log
    try {
      await db.auditLog.create({
        data: { userId, action: 'UPDATE_OFFER_WORKFLOW_CONFIG', module: 'offers',
          details: `Updated offer workflow — approvalRequired=${approvalRequired}, levels=${levels?.length || DEFAULT_LEVELS.length}` },
      });
    } catch {}

    return NextResponse.json({
      success: true,
      config: {
        tenantId,
        workflowType: 'recruitment',
        approvalRequired,
        levels: levels || DEFAULT_LEVELS,
        rules: rules || DEFAULT_RULES,
      },
    }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Update offer workflow config error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

function safeParse<T>(s: string, fallback: T): T {
  try { return JSON.parse(s) as T; } catch { return fallback; }
}
