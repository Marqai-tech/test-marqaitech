import { lndAuth, json, CORS, nextCertificateNo, notify } from '@/lib/lnd-core';

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/**
 * PATCH /api/learning/enrollments/[id] — progress lifecycle:
 *   { action: 'start' }
 *   { action: 'progress', progress: 40, hoursSpent?: 2 }
 *   { action: 'complete', score, preTestScore?, postTestScore?, hoursSpent?, feedbackRating?,
 *     feedbackInstructor?, feedbackContent?, feedbackComments? } → auto-issues certificate on pass
 *   { action: 'linkGoal', goalId } — IDP / OKR linking
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await lndAuth(request);
  if (!auth) return json({ error: 'Unauthorized' }, 401);
  try {
    const { id } = await params;
    const body = await request.json();
    const enrollment = await auth.db.courseEnrollment.findUnique({
      where: { id },
      include: { course: { select: { id: true, title: true, passingScore: true, isCompliance: true } } },
    });
    if (!enrollment) return json({ error: 'Enrollment not found' }, 404);
    if (!auth.isAdmin && enrollment.employeeId !== auth.employeeId && auth.role !== 'manager') {
      return json({ error: 'Forbidden' }, 403);
    }

    const action = body.action || 'progress';

    if (action === 'start') {
      const updated = await auth.db.courseEnrollment.update({
        where: { id },
        data: { status: 'in_progress', startedAt: enrollment.startedAt || new Date(), progress: Math.max(enrollment.progress, 5) },
      });
      return json({ data: updated });
    }

    if (action === 'progress') {
      const updated = await auth.db.courseEnrollment.update({
        where: { id },
        data: {
          status: 'in_progress',
          startedAt: enrollment.startedAt || new Date(),
          progress: Math.min(100, Math.max(0, Number(body.progress) || 0)),
          hoursSpent: body.hoursSpent !== undefined ? Number(body.hoursSpent) : enrollment.hoursSpent,
        },
      });
      return json({ data: updated });
    }

    if (action === 'linkGoal') {
      const updated = await auth.db.courseEnrollment.update({
        where: { id },
        data: { goalId: body.goalId || null, okrId: body.okrId || null },
      });
      return json({ data: updated });
    }

    if (action === 'complete') {
      const score = Number(body.score) || 0;
      const passed = score >= (enrollment.course?.passingScore ?? 60);
      const data: Record<string, unknown> = {
        status: passed ? 'completed' : 'failed',
        progress: 100,
        completedAt: new Date(),
        score,
        attempts: enrollment.attempts + 1,
        hoursSpent: Number(body.hoursSpent) || enrollment.hoursSpent,
        feedbackRating: body.feedbackRating !== undefined && body.feedbackRating !== '' ? Number(body.feedbackRating) : enrollment.feedbackRating,
        feedbackInstructor: body.feedbackInstructor !== undefined && body.feedbackInstructor !== '' ? Number(body.feedbackInstructor) : enrollment.feedbackInstructor,
        feedbackContent: body.feedbackContent !== undefined && body.feedbackContent !== '' ? Number(body.feedbackContent) : enrollment.feedbackContent,
        feedbackComments: body.feedbackComments || enrollment.feedbackComments,
      };
      if (body.preTestScore !== undefined && body.preTestScore !== '') data.preTestScore = Number(body.preTestScore);
      if (body.postTestScore !== undefined && body.postTestScore !== '') data.postTestScore = Number(body.postTestScore);

      // Close the matching skill gap when a linked course is completed
      const updated = await auth.db.courseEnrollment.update({ where: { id }, data });

      if (passed) {
        try {
          await auth.db.skillGap.updateMany({
            where: { suggestedCourseId: enrollment.courseId, employeeId: enrollment.employeeId, status: { in: ['open', 'suggested', 'in_training'] } },
            data: { status: 'closed', resolvedEnrollmentId: id },
          });
          await auth.db.courseEnrollment.update({ where: { id }, data: { status: 'completed' } });
        } catch { /* non-fatal */ }

        // Auto-issue certificate
        let certificate = null;
        try {
          const certNo = await nextCertificateNo(auth.db);
          const renewalMonths = enrollment.course?.isCompliance ? 12 : null;
          const validUntil = renewalMonths ? new Date(Date.now() + renewalMonths * 30 * 24 * 3600 * 1000) : null;
          certificate = await auth.db.certificate.create({
            data: {
              enrollmentId: id,
              courseId: enrollment.courseId,
              employeeId: enrollment.employeeId,
              certificateNo: certNo,
              title: `${enrollment.course?.title || 'Course'} — Certificate of Completion`,
              score,
              issuedAt: new Date(),
              validFrom: new Date(),
              validUntil,
              renewalMonths,
              status: 'active',
            },
          }).catch(async () => {
            // certificateNo race — retry once with a fresh number
            const retryNo = await nextCertificateNo(auth.db);
            return auth.db.certificate.create({
              data: {
                enrollmentId: id,
                courseId: enrollment.courseId,
                employeeId: enrollment.employeeId,
                certificateNo: retryNo,
                title: `${enrollment.course?.title || 'Course'} — Certificate of Completion`,
                score,
                validFrom: new Date(),
                validUntil,
                renewalMonths,
                status: 'active',
              },
            });
          });
        } catch (e) {
          console.error('[lnd/enrollments] certificate issuance failed:', e);
        }

        // Employee completion notification + manager report
        const emp = await auth.db.employee.findUnique({
          where: { id: enrollment.employeeId },
          select: { userId: true, firstName: true, lastName: true, reportingManagerId: true },
        });
        if (emp?.userId) {
          await notify({
            tenantId: auth.tenantId,
            eventKey: 'learning.training.completed',
            recipients: [{ userId: emp.userId, name: `${emp.firstName} ${emp.lastName}` }],
            vars: { Course_Name: enrollment.course?.title || 'Course', Score: score, Certificate_No: certificate?.certificateNo || '—' },
            entity: { type: 'course_enrollment', id, link: '/learning' },
            origin: request.headers.get('origin'),
          });
        }
        if (emp?.reportingManagerId) {
          const mgr = await auth.db.employee.findUnique({
            where: { id: emp.reportingManagerId },
            select: { userId: true, firstName: true, lastName: true },
          });
          if (mgr?.userId) {
            await notify({
              tenantId: auth.tenantId,
              eventKey: 'learning.manager.completion_report',
              recipients: [{ userId: mgr.userId, name: `${mgr.firstName} ${mgr.lastName}` }],
              vars: { Employee_Name: `${emp.firstName} ${emp.lastName}`, Course_Name: enrollment.course?.title || 'Course', Score: score },
              entity: { type: 'course_enrollment', id, link: '/learning' },
              origin: request.headers.get('origin'),
            });
          }
        }
        return json({ data: updated, certificate }, 200);
      }
      return json({ data: updated });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (error) {
    console.error('[lnd/enrollments/id] PATCH error:', error);
    return json({ error: 'Failed to update enrollment' }, 500);
  }
}
