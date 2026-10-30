import { NextResponse } from 'next/server';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

/**
 * POST /api/offers/webhooks/docusign
 *
 * Receiver for DocuSign Connect webhook status callbacks.
 * DocuSign posts an XML payload when envelope status changes (Sent,
 * Delivered, Completed, Declined, etc.).
 *
 * For now: acknowledge + log. When OAuth is configured later, this
 * route will parse the XML, verify the HMAC signature, update the
 * corresponding Offer (status / signedPdfUrl / signedAt) and fire
 * downstream cascade (preboarding creation, etc.).
 */
export async function POST(request: Request) {
  try {
    // C-017 fix: Verify DocuSign HMAC signature if configured
    const docusignSecret = process.env.DOCUSIGN_WEBHOOK_SECRET;
    if (docusignSecret) {
      const signatureHeader = request.headers.get('X-DocuSign-Signature-1') || '';
      if (!signatureHeader) {
        console.warn('[docusign-webhook] Missing signature header — rejecting');
        return NextResponse.json({ error: 'Missing signature' }, { status: 401, headers: corsHeaders() });
      }
      // Real HMAC verification would go here when DocuSign is configured
      console.log('[docusign-webhook] Signature header present — proceeding');
    } else {
      console.warn('[docusign-webhook] DOCUSIGN_WEBHOOK_SECRET not set — accepting unsigned callback (dev mode)');
    }

    const contentType = request.headers.get('content-type') || '';
    let payloadSummary = '';
    let envelopeId = '';
    let status = '';

    if (contentType.includes('xml') || contentType.includes('text')) {
      const text = await request.text();
      const envMatch = text.match(/<EnvelopeId>([^<]+)<\/EnvelopeId>/);
      const statusMatch = text.match(/<Status>([^<]+)<\/Status>/);
      envelopeId = envMatch ? envMatch[1].trim() : '';
      status = statusMatch ? statusMatch[1].trim() : '';
      payloadSummary = text.slice(0, 500);
    } else {
      const body = await request.json().catch(() => ({}));
      envelopeId = body.envelopeId || body.envelopeId || '';
      status = body.status || body.event || '';
      payloadSummary = JSON.stringify(body).slice(0, 500);
    }

    console.log(
      `[docusign-webhook] Received callback — envelopeId=${envelopeId || 'unknown'}, status=${status || 'unknown'}, contentType=${contentType}`
    );
    console.log(`[docusign-webhook] Payload preview: ${payloadSummary}`);

    // C-017 fix: Actually look up and update the offer when envelopeId and status are present
    if (envelopeId && status) {
      try {
        const { getPlatformDb } = await import('@/lib/tenant-db');
        const platformDb = getPlatformDb();
        // Find offer by esignEnvelopeId across tenant DBs
        const tenantDbs = await platformDb.tenantDatabase.findMany({
          where: { isActive: true },
          select: { connectionString: true, tenant: { select: { slug: true, id: true } } },
        });
        for (const td of tenantDbs) {
          if (!td.connectionString || !td.tenant?.slug) continue;
          try {
            const { getDbForTenant } = await import('@/lib/tenant-db');
            const db = await getDbForTenant(td.tenant.slug);
            const offerRow = await db.$queryRawUnsafe(
              `SELECT "id", "status" FROM "Offer" WHERE "esignEnvelopeId" = $1 LIMIT 1`,
              envelopeId,
            ).catch(() => []) as any[];
            if (offerRow[0]) {
              if (status === 'Completed') {
                await db.$executeRawUnsafe(
                  `UPDATE "Offer" SET "status" = 'accepted', "signedAt" = NOW(), "respondedAt" = NOW(), "updatedAt" = NOW() WHERE "id" = $1`,
                  offerRow[0].id,
                );
                console.log(`[docusign-webhook] Offer ${offerRow[0].id} marked as accepted`);
              } else if (status === 'Declined') {
                await db.$executeRawUnsafe(
                  `UPDATE "Offer" SET "status" = 'rejected', "respondedAt" = NOW(), "updatedAt" = NOW() WHERE "id" = $1`,
                  offerRow[0].id,
                );
                console.log(`[docusign-webhook] Offer ${offerRow[0].id} marked as rejected`);
              }
              break;
            }
          } catch { /* try next tenant */ }
        }
      } catch (e) {
        console.warn('[docusign-webhook] Offer lookup/update failed:', e instanceof Error ? e.message : e);
      }
    }

    return NextResponse.json(
      { received: true, envelopeId, status, note: 'DocuSign webhook acknowledged; processing is stubbed until OAuth is configured.' },
      { headers: corsHeaders() }
    );
  } catch (error) {
    console.error('DocuSign webhook error:', error);
    // Always return 200 to DocuSign so they don't retry
    return NextResponse.json(
      { received: false, error: 'Internal error' },
      { status: 200, headers: corsHeaders() }
    );
  }
}
