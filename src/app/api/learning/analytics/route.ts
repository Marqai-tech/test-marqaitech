import { lndAuth, json, CORS } from '@/lib/lnd-core';

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/**
 * GET /api/learning/analytics — Training ROI & Kirkpatrick 4-Level dashboard.
 *   Level 1 Reaction   → feedback ratings (overall / instructor / content) + sentiment split
 *   Level 2 Learning   → pre-test vs post-test score deltas
 *   Level 3 Behavior   → performance-review skills rating 90 days before vs after completion
 *   Level 4 Results    → training spend (course cost + hours × blended rate) vs estimated
 *                        productivity benefit (avg post-test gain proxy × salary factor)
 */
export async function GET(request: Request) {
  const auth = await lndAuth(request);
  if (!auth) return json({ error: 'Unauthorized' }, 401);
  try {
    const scopeWhere = auth.companyId ? { OR: [{ companyId: auth.companyId }, { companyId: null }] } : {};
    const enrollments = await auth.db.courseEnrollment.findMany({
      where: scopeWhere,
      include: {
        course: { select: { id: true, title: true, category: true, cost: true, level: true } },
        employee: { select: { id: true, department: { select: { name: true } }, salary: true } },
      },
      take: 2000,
    });

    const total = enrollments.length;
    const completed = enrollments.filter((e: { status: string }) => e.status === 'completed');
    const completionRate = total ? Math.round((completed.length / total) * 100) : 0;

    // By category
    const byCategory: Record<string, { total: number; completed: number }> = {};
    for (const e of enrollments) {
      const cat = e.course?.category || 'other';
      byCategory[cat] = byCategory[cat] || { total: 0, completed: 0 };
      byCategory[cat].total++;
      if (e.status === 'completed') byCategory[cat].completed++;
    }
    const categories = Object.entries(byCategory).map(([name, v]) => ({ name, ...v, completionPct: Math.round((v.completed / v.total) * 100) }));

    // L1 — Reaction
    const rated = completed.filter((e: { feedbackRating: number | null }) => e.feedbackRating);
    const avg = (arr: number[]) => (arr.length ? Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 10) / 10 : null);
    const l1 = {
      responses: rated.length,
      overall: avg(rated.map((e: { feedbackRating: number }) => e.feedbackRating)),
      instructor: avg(rated.filter((e: { feedbackInstructor: number | null }) => e.feedbackInstructor).map((e: { feedbackInstructor: number }) => e.feedbackInstructor)),
      content: avg(rated.filter((e: { feedbackContent: number | null }) => e.feedbackContent).map((e: { feedbackContent: number }) => e.feedbackContent)),
      promoters: rated.filter((e: { feedbackRating: number }) => e.feedbackRating >= 4).length,
      detractors: rated.filter((e: { feedbackRating: number }) => e.feedbackRating <= 2).length,
    };

    // L2 — Learning
    const tested = completed.filter((e: { preTestScore: number | null; postTestScore: number | null }) => e.preTestScore !== null && e.postTestScore !== null);
    const avgPre = avg(tested.map((e: { preTestScore: number }) => e.preTestScore));
    const avgPost = avg(tested.map((e: { postTestScore: number }) => e.postTestScore));
    const l2 = {
      tested: tested.length,
      avgPre, avgPost,
      delta: avgPre !== null && avgPost !== null ? Math.round((avgPost - avgPre) * 10) / 10 : null,
      retentionPct: tested.length ? Math.round((tested.filter((e: { postTestScore: number; preTestScore: number }) => e.postTestScore > e.preTestScore).length / tested.length) * 100) : null,
      avgScore: avg(completed.filter((e: { score: number | null }) => e.score).map((e: { score: number }) => e.score)),
    };

    // L3 — Behavior: skills rating 90d before vs after training completion
    const DAY90 = 90 * 24 * 3600 * 1000;
    const empIds = [...new Set(completed.map((e: { employeeId: string }) => e.employeeId))];
    const reviews = empIds.length ? await auth.db.performanceReview.findMany({
      where: { employeeId: { in: empIds.slice(0, 300) }, skillsRating: { gt: 0 } },
      select: { employeeId: true, skillsRating: true, reviewDate: true },
      orderBy: { reviewDate: 'desc' },
      take: 1200,
    }) : [];
    const byEmp: Record<string, { before: number[]; after: number[] }> = {};
    for (const r of reviews) {
      byEmp[r.employeeId] = byEmp[r.employeeId] || { before: [], after: [] };
    }
    for (const e of completed) {
      const completionTime = e.completedAt ? new Date(e.completedAt).getTime() : null;
      if (!completionTime) continue;
      const revs = reviews.filter((r: { employeeId: string }) => r.employeeId === e.employeeId);
      for (const r of revs) {
        if (!r.reviewDate) continue;
        const t = new Date(r.reviewDate).getTime();
        if (t < completionTime && completionTime - t <= DAY90) byEmp[e.employeeId]?.before.push(r.skillsRating);
        if (t > completionTime && t - completionTime <= DAY90) byEmp[e.employeeId]?.after.push(r.skillsRating);
      }
    }
    const paired = Object.entries(byEmp).filter(([, v]) => v.before.length && v.after.length);
    const l3 = {
      pairedEmployees: paired.length,
      avgBefore: paired.length ? avg(paired.map(([, v]) => v.before.reduce((s, v2) => s + v2, 0) / v.before.length)) : null,
      avgAfter: paired.length ? avg(paired.map(([, v]) => v.after.reduce((s, v2) => s + v2, 0) / v.after.length)) : null,
      improved: paired.filter(([, v]) => (v.after.reduce((s, v2) => s + v2, 0) / v.after.length) > (v.before.reduce((s, v2) => s + v2, 0) / v.before.length)).length,
    };
    if (l3.avgBefore !== null && l3.avgAfter !== null) l3.delta = Math.round((l3.avgAfter - l3.avgBefore) * 10) / 10;

    // L4 — Results / ROI (INR)
    const BLENDED_HOURLY = 450; // ₹/hour blended loaded cost for learning hours
    let spend = 0;
    for (const e of enrollments) {
      spend += Number(e.course?.cost) || 0;
      spend += (e.hoursSpent || 0) * BLENDED_HOURLY;
    }
    // Estimated annual benefit: post-training productivity uplift proxy —
    // 1% salary uplift per 10-point post-test gain, annualized over trained population
    let benefit = 0;
    for (const e of completed) {
      const salary = Number(e.employee?.salary) || 600000;
      const gain = (e.postTestScore ?? e.score ?? 0) - (e.preTestScore ?? 0);
      const upliftPct = Math.max(0, Math.min(15, gain * 0.1)) / 100;
      benefit += salary * upliftPct;
    }
    const l4 = {
      spendINR: Math.round(spend),
      estimatedBenefitINR: Math.round(benefit),
      roiPct: spend > 0 ? Math.round(((benefit - spend) / spend) * 100) : null,
      trainedHeadcount: empIds.length,
      blendedHourlyRateINR: BLENDED_HOURLY,
      formula: 'ROI% = (estimated annual productivity benefit − training spend) ÷ training spend × 100; spend = course cost + learning hours × ₹' + BLENDED_HOURLY + '/hr blended rate',
    };

    // Department stats
    const byDept: Record<string, { total: number; completed: number }> = {};
    for (const e of enrollments) {
      const d = e.employee?.department?.name || 'Unassigned';
      byDept[d] = byDept[d] || { total: 0, completed: 0 };
      byDept[d].total++;
      if (e.status === 'completed') byDept[d].completed++;
    }
    const departments = Object.entries(byDept).map(([name, v]) => ({ name, ...v, completionPct: Math.round((v.completed / v.total) * 100) })).sort((a, b) => b.total - a.total);

    // Top courses by completions
    const byCourse: Record<string, { title: string; completions: number; ratingSum: number; ratings: number }> = {};
    for (const e of enrollments) {
      const key = e.courseId;
      byCourse[key] = byCourse[key] || { title: e.course?.title || 'Unknown', completions: 0, ratingSum: 0, ratings: 0 };
      if (e.status === 'completed') byCourse[key].completions++;
      if (e.feedbackRating) { byCourse[key].ratingSum += e.feedbackRating; byCourse[key].ratings++; }
    }
    const topCourses = Object.values(byCourse).sort((a, b) => b.completions - a.completions).slice(0, 8)
      .map((c) => ({ ...c, avgRating: c.ratings ? Math.round((c.ratingSum / c.ratings) * 10) / 10 : null }));

    // Promotion readiness: employees completing all required courses of promotion tracks
    const tracks = await auth.db.learningPath.findMany({
      where: { isPromotionTrack: true, ...scopeWhere },
      include: { pathCourses: { where: { isRequired: true }, select: { courseId: true } } },
    });
    const readiness: Record<string, { name: string; required: number; eligible: number; inProgress: number }> = {};
    for (const t of tracks) {
      const key = t.id;
      const reqIds = t.pathCourses.map((pc: { courseId: string }) => pc.courseId);
      if (!reqIds.length) continue;
      readiness[key] = readiness[key] || { name: t.name, required: reqIds.length, eligible: 0, inProgress: 0 };
    }
    const trackEnrollments = tracks.length ? await auth.db.courseEnrollment.findMany({
      where: { pathId: { in: tracks.map((t: { id: string }) => t.id) } },
      select: { pathId: true, employeeId: true, courseId: true, status: true },
    }) : [];
    for (const t of tracks) {
      const reqIds = t.pathCourses.map((pc: { courseId: string }) => pc.courseId);
      const emps = [...new Set(trackEnrollments.filter((e: { pathId: string }) => e.pathId === t.id).map((e: { employeeId: string }) => e.employeeId))];
      for (const emp of emps) {
        const done = trackEnrollments.filter((e: { pathId: string; employeeId: string; courseId: string; status: string }) => e.pathId === t.id && e.employeeId === emp && reqIds.includes(e.courseId) && e.status === 'completed').length;
        if (done >= reqIds.length) readiness[t.id].eligible++;
        else readiness[t.id].inProgress++;
      }
    }

    return json({
      data: {
        totals: { total, completed: completed.length, completionRate, inProgress: enrollments.filter((e: { status: string }) => e.status === 'in_progress').length },
        categories, departments, topCourses,
        kirkpatrick: { l1, l2, l3, l4 },
        promotionReadiness: Object.values(readiness),
      },
    });
  } catch (error) {
    console.error('[lnd/analytics] GET error:', error);
    return json({ error: 'Failed to load analytics' }, 500);
  }
}
