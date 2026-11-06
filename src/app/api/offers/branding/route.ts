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

/**
 * GET /api/offers/branding
 *   Returns the per-tenant OfferBranding row. If none exists yet, returns
 *   a default empty branding object with version=0 so the UI knows to
 *   show a "set up branding" prompt.
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

    // Use raw SQL for schema-drift resilience (table may not exist on first call)
    let rows: any[] = [];
    try {
      rows = await db.$queryRawUnsafe(
        `SELECT * FROM "OfferBranding" WHERE "tenantId" = $1 LIMIT 1`,
        tenantId,
      ) as any[];
    } catch {
      // table doesn't exist yet — return defaults
    }

    if (rows.length === 0) {
      return NextResponse.json({
        branding: {
          tenantId,
          logo: null, companyName: null, address: null, email: null, phone: null,
          website: null, colors: null, signature: null,
          signatoryName: null, signatoryDesignation: null,
          defaultFooterText: null, legalNotice: null,
          version: 0,
        },
        isDefault: true,
      }, { headers: corsHeaders() });
    }

    return NextResponse.json({ branding: rows[0], isDefault: false }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Get offer branding error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

/**
 * PUT /api/offers/branding
 *   Body: { logo?, companyName?, address?, email?, phone?, website?,
 *           colors?, signature?, signatoryName?, signatoryDesignation?,
 *           defaultFooterText?, legalNotice? }
 *
 *   Creates or updates the per-tenant branding row. Bumps version on
 *   every update so generated PDFs can detect stale branding.
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
      return NextResponse.json({ error: 'Only HR/Admin can configure branding' }, { status: 403, headers: corsHeaders() });
    }

    const tenantId = (decoded as any).tenantId as string;
    if (!tenantId) return NextResponse.json({ error: 'No tenant context' }, { status: 400, headers: corsHeaders() });

    const body = await request.json();
    const {
      logo, companyName, address, email, phone, website,
      colors, signature, signatoryName, signatoryDesignation,
      defaultFooterText, legalNotice,
    } = body;

    // Ensure table exists
    try {
      await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "OfferBranding" (
        "id" TEXT NOT NULL,
        "tenantId" TEXT NOT NULL UNIQUE,
        "logo" TEXT, "companyName" TEXT, "address" TEXT, "email" TEXT, "phone" TEXT,
        "website" TEXT, "colors" TEXT, "signature" TEXT,
        "signatoryName" TEXT, "signatoryDesignation" TEXT,
        "defaultFooterText" TEXT, "legalNotice" TEXT,
        "version" INTEGER NOT NULL DEFAULT 1,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "OfferBranding_pkey" PRIMARY KEY ("id")
      )`);
    } catch {}

    // Check if row exists
    const existing = await db.$queryRawUnsafe(
      `SELECT "id", "version" FROM "OfferBranding" WHERE "tenantId" = $1 LIMIT 1`,
      tenantId,
    ).catch(() => []) as any[];

    const newVersion = (existing[0]?.version || 0) + 1;

    if (existing.length === 0) {
      // INSERT
      const id = `obrand-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await db.$executeRawUnsafe(
        `INSERT INTO "OfferBranding" ("id", "tenantId", "logo", "companyName", "address", "email",
          "phone", "website", "colors", "signature", "signatoryName", "signatoryDesignation",
          "defaultFooterText", "legalNotice", "version", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())`,
        id, tenantId,
        logo || null, companyName || null, address || null, email || null, phone || null,
        website || null, colors || null, signature || null,
        signatoryName || null, signatoryDesignation || null,
        defaultFooterText || null, legalNotice || null,
        newVersion,
      );
      return NextResponse.json({ branding: { id, tenantId, ...body, version: newVersion }, created: true }, { status: 201, headers: corsHeaders() });
    }

    // UPDATE existing
    const id = existing[0].id;
    await db.$executeRawUnsafe(
      `UPDATE "OfferBranding" SET
        "logo" = COALESCE($3, "logo"),
        "companyName" = COALESCE($4, "companyName"),
        "address" = COALESCE($5, "address"),
        "email" = COALESCE($6, "email"),
        "phone" = COALESCE($7, "phone"),
        "website" = COALESCE($8, "website"),
        "colors" = COALESCE($9, "colors"),
        "signature" = COALESCE($10, "signature"),
        "signatoryName" = COALESCE($11, "signatoryName"),
        "signatoryDesignation" = COALESCE($12, "signatoryDesignation"),
        "defaultFooterText" = COALESCE($13, "defaultFooterText"),
        "legalNotice" = COALESCE($14, "legalNotice"),
        "version" = $15,
        "updatedAt" = NOW()
       WHERE "id" = $1 AND "tenantId" = $2`,
      id, tenantId,
      logo || null, companyName || null, address || null, email || null, phone || null,
      website || null, colors || null, signature || null,
      signatoryName || null, signatoryDesignation || null,
      defaultFooterText || null, legalNotice || null,
      newVersion,
    );

    return NextResponse.json({ branding: { id, tenantId, ...body, version: newVersion }, updated: true }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Update offer branding error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
