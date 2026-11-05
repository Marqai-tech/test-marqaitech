import { lndAuth, companyWhere, json, CORS } from '@/lib/lnd-core';

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/** GET /api/learning/signoffs — bulk digital sign-off campaigns */
export async function GET(request: Request) {
  const auth = await lndAuth(request);
  if (!auth) return json({ error: 'Unauthorized' }, 401);
  try {
    const signoffs = await auth.db.policySignOff.findMany({
      where: { ...companyWhere(auth.companyId) },
      include: { acks: { include: { employee: { select: { id: true, employeeId: true, firstName: true, lastName: true, department: { select: { name: true } } } } } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const data = (signoffs as unknown as Array<Record<string, unknown> & { acks: { status: string }[] }>).map((s) => {
      const signed = s.acks.filter((a) => a.status === 'signed').length;
      return { ...s, totalTargets: s.acks.length, signedCount: signed, pendingCount: s.acks.length - signed, signPct: s.acks.length ? Math.round((signed / s.acks.length) * 100) : 0 };
    });
    const myPending = auth.employeeId
      ? data.filter((s) => s.acks.some((a: { employee: { id: string }; status: string }) => a.employee.id === auth.employeeId && a.status === 'pending'))
      : [];
    return json({ data, myPendingIds: myPending.map((s) => s.id) });
  } catch (error) {
    console.error('[lnd/signoffs] GET error:', error);
    return json({ error: 'Failed to load sign-offs' }, 500);
  }
}

/** POST /api/learning/signoffs — push a policy/acknowledgement campaign to all active employees */
export async function POST(request: Request) {
  const auth = await lndAuth(request);
  if (!auth) return json({ error: 'Unauthorized' }, 401);
  if (!auth.isAdmin && auth.role !== 'hr_manager') return json({ error: 'Forbidden' }, 403);
  try {
    const body = await request.json();
    if (!body.title) return json({ error: 'title is required' }, 400);
    const signoff = await auth.db.policySignOff.create({
      data: {
        title: body.title,
        policyVersion: body.policyVersion || null,
        description: body.description || null,
        documentUrl: body.documentUrl || null,
        requiresSignature: body.requiresSignature !== false,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        status: 'published',
        companyId: auth.companyId,
        createdById: auth.userId,
      },
    });
    const emps = await auth.db.employee.findMany({
      where: { status: 'active', ...(auth.companyId ? { companyId: auth.companyId } : {}) },
      select: { id: true },
      take: 500,
    });
    if (emps.length) {
      await auth.db.policySignOffAck.createMany({
        data: emps.map((e: { id: string }) => ({ signOffId: signoff.id, employeeId: e.id, status: 'pending' })),
        skipDuplicates: true,
      });
    }
    return json({ data: { ...signoff, totalTargets: emps.length } }, 201);
  } catch (error) {
    console.error('[lnd/signoffs] POST error:', error);
    return json({ error: 'Failed to create sign-off campaign' }, 500);
  }
}

/** PATCH /api/learning/signoffs — employee signature or admin close-out */
export async function PATCH(request: Request) {
  const auth = await lndAuth(request);
  if (!auth) return json({ error: 'Unauthorized' }, 401);
  try {
    const body = await request.json();
    if (!body.signOffId) return json({ error: 'signOffId is required' }, 400);

    if (body.action === 'sign') {
      if (!auth.employeeId) return json({ error: 'No employee context' }, 400);
      const ack = await auth.db.policySignOffAck.upsert({
        where: { signOffId_employeeId: { signOffId: body.signOffId, employeeId: auth.employeeId } },
        create: { signOffId: body.signOffId, employeeId: auth.employeeId, status: 'signed', signedAt: new Date(), signatureName: body.signatureName || 'Signed', remarks: body.remarks || null },
        update: { status: 'signed', signedAt: new Date(), signatureName: body.signatureName || 'Signed', remarks: body.remarks || null },
      });
      return json({ data: ack });
    }

    if (body.action === 'close') {
      if (!auth.isAdmin && auth.role !== 'hr_manager') return json({ error: 'Forbidden' }, 403);
      const updated = await auth.db.policySignOff.update({ where: { id: body.signOffId }, data: { status: 'closed' } });
      return json({ data: updated });
    }

    if (body.action === 'remind') {
      if (!auth.isAdmin && auth.role !== 'hr_manager') return json({ error: 'Forbidden' }, 403);
      const pending = await auth.db.policySignOffAck.findMany({
        where: { signOffId: body.signOffId, status: 'pending' },
        include: { employee: { select: { userId: true, firstName: true, lastName: true } } },
        take: 60,
      });
      const { notify } = await import('@/lib/lnd-core');
      const signoff = await auth.db.policySignOff.findUnique({ where: { id: body.signOffId }, select: { title: true } });
      const recipients = pending.map((p: { employee: { userId: string; firstName: string; lastName: string } }) => ({
        userId: p.employee.userId, name: `${p.employee.firstName} ${p.employee.lastName}`,
      })).filter((r: { userId: string | null }) => r.userId);
      await notify({
        tenantId: auth.tenantId,
        eventKey: 'learning.compliance.reminder',
        recipients,
        vars: { Course_Name: `Signature required: ${signoff?.title || 'Policy'}`, Due_Date: 'ASAP', Mandatory: 'Yes — legally binding acknowledgement' },
        entity: { type: 'policy_signoff', id: body.signOffId, link: '/learning' },
        origin: request.headers.get('origin'),
      });
      return json({ data: { reminded: recipients.length } });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (error) {
    console.error('[lnd/signoffs] PATCH error:', error);
    return json({ error: 'Sign-off action failed' }, 500);
  }
}
