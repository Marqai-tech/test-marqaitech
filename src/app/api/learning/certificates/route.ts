import { lndAuth, companyWhere, json, CORS, nextCertificateNo } from '@/lib/lnd-core';

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/** GET /api/learning/certificates — validity tracking + renewal alerts */
export async function GET(request: Request) {
  const auth = await lndAuth(request);
  if (!auth) return json({ error: 'Unauthorized' }, 401);
  try {
    const where: Record<string, unknown> = { ...companyWhere(auth.companyId) };
    const { searchParams } = new URL(request.url);
    if (searchParams.get('mine') === 'true' && auth.employeeId) where.employeeId = auth.employeeId;

    const certs = await auth.db.certificate.findMany({
      where,
      include: {
        employee: { select: { id: true, employeeId: true, firstName: true, lastName: true, department: { select: { name: true } } } },
        course: { select: { id: true, title: true, category: true } },
      },
      orderBy: { issuedAt: 'desc' },
      take: 300,
    });
    const DAY = 24 * 3600 * 1000;
    const data = certs.map((c: Record<string, unknown> & { validUntil: Date | null }) => {
      const daysToExpiry = c.validUntil ? Math.ceil((new Date(c.validUntil).getTime() - Date.now()) / DAY) : null;
      const band = daysToExpiry === null ? 'lifetime' : daysToExpiry <= 0 ? 'expired' : daysToExpiry <= 15 ? 'critical' : daysToExpiry <= 30 ? 'warning' : daysToExpiry <= 60 ? 'upcoming' : 'valid';
      return { ...c, daysToExpiry, band };
    });
    const stats = {
      total: data.length,
      active: data.filter((c: { band: string }) => c.band === 'valid' || c.band === 'lifetime' || c.band === 'upcoming').length,
      expiring60: data.filter((c: { daysToExpiry: number | null }) => c.daysToExpiry !== null && c.daysToExpiry > 0 && c.daysToExpiry <= 60).length,
      expiring30: data.filter((c: { daysToExpiry: number | null }) => c.daysToExpiry !== null && c.daysToExpiry > 0 && c.daysToExpiry <= 30).length,
      expiring15: data.filter((c: { daysToExpiry: number | null }) => c.daysToExpiry !== null && c.daysToExpiry > 0 && c.daysToExpiry <= 15).length,
      expired: data.filter((c: { band: string }) => c.band === 'expired').length,
    };
    return json({ data, stats });
  } catch (error) {
    console.error('[lnd/certificates] GET error:', error);
    return json({ error: 'Failed to load certificates' }, 500);
  }
}

/** POST /api/learning/certificates — manual issuance (compliance/external certs) */
export async function POST(request: Request) {
  const auth = await lndAuth(request);
  if (!auth) return json({ error: 'Unauthorized' }, 401);
  if (!auth.isApprover) return json({ error: 'Forbidden' }, 403);
  try {
    const body = await request.json();
    if (!body.employeeId || !body.title) return json({ error: 'employeeId and title are required' }, 400);
    const certNo = await nextCertificateNo(auth.db);
    const renewalMonths = body.renewalMonths ? Number(body.renewalMonths) : null;
    const cert = await auth.db.certificate.create({
      data: {
        employeeId: body.employeeId,
        courseId: body.courseId || null,
        certificateNo: certNo,
        title: body.title,
        score: body.score ? Number(body.score) : null,
        skillAwarded: body.skillAwarded || null,
        validFrom: body.validFrom ? new Date(body.validFrom) : new Date(),
        validUntil: body.validUntil ? new Date(body.validUntil) : renewalMonths ? new Date(Date.now() + renewalMonths * 30 * 24 * 3600 * 1000) : null,
        renewalMonths,
        status: 'active',
      },
    });
    return json({ data: cert }, 201);
  } catch (error) {
    console.error('[lnd/certificates] POST error:', error);
    return json({ error: 'Failed to issue certificate' }, 500);
  }
}

/** PATCH /api/learning/certificates — renew or revoke */
export async function PATCH(request: Request) {
  const auth = await lndAuth(request);
  if (!auth) return json({ error: 'Unauthorized' }, 401);
  if (!auth.isApprover) return json({ error: 'Forbidden' }, 403);
  try {
    const body = await request.json();
    if (!body.id) return json({ error: 'id is required' }, 400);
    if (body.action === 'renew') {
      const cert = await auth.db.certificate.findUnique({ where: { id: body.id } });
      if (!cert) return json({ error: 'Certificate not found' }, 404);
      const months = cert.renewalMonths || 12;
      const base = cert.validUntil && new Date(cert.validUntil) > new Date() ? new Date(cert.validUntil) : new Date();
      const validUntil = new Date(base.getTime() + months * 30 * 24 * 3600 * 1000);
      const updated = await auth.db.certificate.update({
        where: { id: body.id },
        data: { status: 'active', lastRenewedAt: new Date(), validUntil, remindersSent: {} },
      });
      return json({ data: updated });
    }
    if (body.action === 'revoke') {
      const updated = await auth.db.certificate.update({ where: { id: body.id }, data: { status: 'revoked' } });
      return json({ data: updated });
    }
    return json({ error: 'Unknown action' }, 400);
  } catch (error) {
    console.error('[lnd/certificates] PATCH error:', error);
    return json({ error: 'Failed to update certificate' }, 500);
  }
}
