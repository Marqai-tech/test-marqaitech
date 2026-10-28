import { lndAuth, companyWhere, json, CORS, notify } from '@/lib/lnd-core';

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

interface ReqRow { id: string; name: string; category: string; frequency: string; courseId: string | null; graceDays: number; isActive: boolean }

/**
 * GET /api/learning/compliance — compliance matrix + audit metrics.
 * Returns requirements, per-employee completion status in the current cycle and
 * department-level compliance percentages (audit-ready).
 */
export async function GET(request: Request) {
  const auth = await lndAuth(request);
  if (!auth) return json({ error: 'Unauthorized' }, 401);
  try {
    const requirements = (await auth.db.complianceRequirement.findMany({
      where: { ...companyWhere(auth.companyId) },
      include: { course: { select: { id: true, title: true } } },
      orderBy: { name: 'asc' },
    })) as unknown as ReqRow[];

    const employees = await auth.db.employee.findMany({
      where: { status: 'active', ...(auth.companyId ? { companyId: auth.companyId } : {}) },
      select: { id: true, employeeId: true, firstName: true, lastName: true, department: { select: { name: true } } },
      take: 500,
    });

    const courseIds = requirements.map((r) => r.courseId).filter(Boolean) as string[];
    const enrollments = courseIds.length ? await auth.db.courseEnrollment.findMany({
      where: { courseId: { in: courseIds } },
      select: { courseId: true, employeeId: true, status: true, completedAt: true },
    }) : [];

    // cycle window: annual → last 12 months; biannual → 6; quarterly → 3; one_time → any
    const now = new Date();
    const cycleMonths = (freq: string) => (freq === 'quarterly' ? 3 : freq === 'biannual' ? 6 : freq === 'annual' ? 12 : 0);
    const doneBy = new Map<string, Date>();
    for (const e of enrollments) {
      if (e.status === 'completed' && e.completedAt) {
        const key = `${e.courseId}:${e.employeeId}`;
        const prev = doneBy.get(key);
        if (!prev || new Date(e.completedAt) > prev) doneBy.set(key, new Date(e.completedAt));
      }
    }

    const matrix = employees.map((emp) => {
      const items = requirements.map((r) => {
        if (!r.courseId) return { requirementId: r.id, status: 'no_course' as const, completedAt: null as Date | null };
        const key = `${r.courseId}:${emp.id}`;
        const completedAt = doneBy.get(key) || null;
        const months = cycleMonths(r.frequency);
        const inCycle = completedAt && (months === 0 || (now.getTime() - completedAt.getTime()) <= months * 30 * 24 * 3600 * 1000);
        return { requirementId: r.id, status: inCycle ? ('complete' as const) : ('overdue' as const), completedAt };
      });
      const complete = items.filter((i) => i.status === 'complete').length;
      return {
        employee: emp,
        items,
        compliancePct: requirements.length ? Math.round((complete / requirements.length) * 100) : 100,
      };
    });

    const byDept: Record<string, { total: number; pctSum: number }> = {};
    for (const m of matrix) {
      const dept = m.employee.department?.name || 'Unassigned';
      byDept[dept] = byDept[dept] || { total: 0, pctSum: 0 };
      byDept[dept].total++;
      byDept[dept].pctSum += m.compliancePct;
    }
    const departments = Object.entries(byDept).map(([name, v]) => ({ name, compliancePct: Math.round(v.pctSum / v.total), employees: v.total }));
    const overall = matrix.length ? Math.round(matrix.reduce((s: number, m: { compliancePct: number }) => s + m.compliancePct, 0) / matrix.length) : 100;

    return json({ data: { requirements, matrix, departments, overall } });
  } catch (error) {
    console.error('[lnd/compliance] GET error:', error);
    return json({ error: 'Failed to load compliance overview' }, 500);
  }
}

/**
 * POST /api/learning/compliance — actions:
 *   { action: 'create', name, category, courseId?, frequency?, appliesToDepartments?, graceDays? }
 *   { action: 'update', id, ...fields }
 *   { action: 'assignNow', id }  — auto-enrol all covered employees in the linked course
 *   { action: 'exportAudit' }    — one-click audit CSV (text/csv response)
 */
export async function POST(request: Request) {
  const auth = await lndAuth(request);
  if (!auth) return json({ error: 'Unauthorized' }, 401);
  if (!auth.isAdmin && auth.role !== 'hr_manager') return json({ error: 'Forbidden' }, 403);
  try {
    const body = await request.json();

    if (body.action === 'create') {
      if (!body.name || !body.category) return json({ error: 'name and category are required' }, 400);
      const req = await auth.db.complianceRequirement.create({
        data: {
          name: body.name,
          category: body.category,
          description: body.description || null,
          courseId: body.courseId || null,
          frequency: body.frequency || 'annual',
          appliesToDepartments: body.appliesToDepartments ? body.appliesToDepartments : ['all'],
          graceDays: Number(body.graceDays) || 0,
          companyId: auth.companyId,
        },
      });
      return json({ data: req }, 201);
    }

    if (body.action === 'update') {
      const data: Record<string, unknown> = {};
      for (const f of ['name', 'category', 'description', 'frequency']) if (f in body) data[f] = body[f];
      if ('courseId' in body) data.courseId = body.courseId || null;
      if ('graceDays' in body) data.graceDays = Number(body.graceDays) || 0;
      if ('isActive' in body) data.isActive = Boolean(body.isActive);
      const req = await auth.db.complianceRequirement.update({ where: { id: body.id }, data });
      return json({ data: req });
    }

    if (body.action === 'assignNow') {
      const req = await auth.db.complianceRequirement.findUnique({ where: { id: body.id }, include: { course: true } });
      if (!req) return json({ error: 'Requirement not found' }, 404);
      if (!req.courseId) return json({ error: 'Requirement has no linked course' }, 400);
      const emps = await auth.db.employee.findMany({
        where: { status: 'active', ...(auth.companyId ? { companyId: auth.companyId } : {}) },
        select: { id: true, userId: true, firstName: true, lastName: true },
        take: 500,
      });
      let created = 0, skipped = 0;
      const recipients: { userId: string; name?: string }[] = [];
      for (const e of emps) {
        try {
          await auth.db.courseEnrollment.create({
            data: {
              courseId: req.courseId,
              employeeId: e.id,
              source: 'compliance_auto',
              status: 'assigned',
              dueDate: new Date(Date.now() + 30 * 24 * 3600 * 1000),
              isMandatory: true,
              companyId: auth.companyId,
            },
          });
          created++;
          if (e.userId && recipients.length < 60) recipients.push({ userId: e.userId, name: `${e.firstName} ${e.lastName}` });
        } catch { skipped++; }
      }
      await auth.db.complianceRequirement.update({ where: { id: body.id }, data: { lastAssignedAt: new Date() } });
      await notify({
        tenantId: auth.tenantId,
        eventKey: 'learning.compliance.reminder',
        recipients,
        vars: { Course_Name: req.course?.title || req.name, Due_Date: new Date(Date.now() + 30 * 24 * 3600 * 1000).toLocaleDateString('en-IN'), Mandatory: 'Yes — statutory compliance' },
        entity: { type: 'compliance_requirement', id: body.id, link: '/learning/compliance' },
        origin: request.headers.get('origin'),
      });
      return json({ data: { created, skippedDuplicates: skipped, notified: recipients.length } });
    }

    if (body.action === 'exportAudit') {
      // Re-compute the matrix inline for CSV
      const requirements = await auth.db.complianceRequirement.findMany({ where: companyWhere(auth.companyId) });
      const employees = await auth.db.employee.findMany({
        where: { status: 'active', ...(auth.companyId ? { companyId: auth.companyId } : {}) },
        select: { id: true, employeeId: true, firstName: true, lastName: true, department: { select: { name: true } } },
        take: 500,
      });
      const courseIds = requirements.map((r: { courseId: string | null }) => r.courseId).filter(Boolean) as string[];
      const enrollments = courseIds.length ? await auth.db.courseEnrollment.findMany({
        where: { courseId: { in: courseIds }, status: 'completed' },
        select: { courseId: true, employeeId: true, completedAt: true },
      }) : [];
      const doneBy = new Set(enrollments.map((e: { courseId: string; employeeId: string }) => `${e.courseId}:${e.employeeId}`));
      const lines = ['Employee ID,Employee,Department,' + requirements.map((r: { name: string }) => `"${r.name.replace(/"/g, '""')}"`).join(',')];
      for (const emp of employees) {
        const cells = requirements.map((r: { courseId: string | null }) => (r.courseId ? (doneBy.has(`${r.courseId}:${emp.id}`) ? 'Complete' : 'Overdue') : 'N/A'));
        lines.push(`${emp.employeeId},"${emp.firstName} ${emp.lastName}","${emp.department?.name || 'Unassigned'}",${cells.join(',')}`);
      }
      return new Response(lines.join('\n'), {
        status: 200,
        headers: { ...CORS, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="compliance-audit-${new Date().toISOString().slice(0, 10)}.csv"` },
      });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (error) {
    console.error('[lnd/compliance] POST error:', error);
    return json({ error: 'Compliance action failed' }, 500);
  }
}
