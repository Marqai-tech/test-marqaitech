/**
 * Algorithmic Resource Matchmaking.
 *
 * Matches project role requirements against the live HRMS database:
 *   - Skill inventory (EmployeeSkill: skill + level + yearsOfExp)
 *   - Availability window (existing allocations incl. soft reservations, approved leaves)
 *   - Geographic alignment (employee timezone vs project/tenant timezone)
 *
 * Scoring (0–100):
 *   skills   — up to 60 pts: (matched skills / required) × 60, weighted by level headroom
 *   capacity — up to 25 pts: fully available 25, partial (would exceed only with this req) 12, busy 0
 *   context  — up to 15 pts: same department 8, timezone aligned 4, cost-rate known 3
 */

export interface SkillRequirement {
  skill: string;
  level?: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  minYears?: number;
}

export interface MatchCandidate {
  employeeId: string;
  employeeCode?: string | null;
  name: string;
  designation?: string | null;
  department?: string | null;
  timezone?: string | null;
  score: number;
  matchedSkills: Array<{ skill: string; level: string; yearsOfExp: number | null; meetsLevel: boolean }>;
  missingSkills: string[];
  availability: 'available' | 'partial' | 'busy';
  availabilityNote: string;
  currentAllocations: Array<{ projectName: string; allocationPct: number; status: string }>;
  reasons: string[];
}

const LEVEL_ORDER: Record<string, number> = { beginner: 1, intermediate: 2, advanced: 3, expert: 4 };

function levelSatisfied(empLevel: string | undefined, reqLevel?: string): boolean {
  if (!reqLevel) return true;
  return (LEVEL_ORDER[(empLevel || '').toLowerCase()] || 0) >= (LEVEL_ORDER[reqLevel.toLowerCase()] || 2);
}

export function parseSkillRequirements(raw: unknown): SkillRequirement[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as SkillRequirement[];
  try {
    const parsed = JSON.parse(String(raw));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Find and score candidate employees for a role requirement.
 * db = tenant Prisma client. Scope: same company as the project by default.
 */
export async function matchEmployeesForRequirement(
  db: any,
  requirement: {
    requiredSkills?: unknown;
    startDate?: Date | string | null;
    endDate?: Date | string | null;
    allocationPct?: number | null;
    companyId?: string | null;
    departmentId?: string | null;
  },
  opts?: { limit?: number; thresholdPct?: number; excludeEmployeeIds?: string[] }
): Promise<MatchCandidate[]> {
  const reqs = parseSkillRequirements(requirement.requiredSkills).filter((r) => r && r.skill);
  const limit = Math.min(50, opts?.limit ?? 20);
  const thresholdPct = opts?.thresholdPct ?? 100;
  const requestedPct = requirement.allocationPct ?? 100;
  const winStart = requirement.startDate ? new Date(requirement.startDate) : new Date();
  const winEnd = requirement.endDate ? new Date(requirement.endDate) : new Date(Date.now() + 90 * 24 * 3600 * 1000);

  // 1. Candidate pool — same company, active, not excluded
  const poolWhere: Record<string, unknown> = {
    status: { not: 'terminated' },
    ...(requirement.companyId ? { companyId: requirement.companyId } : {}),
    ...(opts?.excludeEmployeeIds?.length ? { id: { notIn: opts.excludeEmployeeIds } } : {}),
  };

  // 2. If skills required, pre-filter to employees having at least one of them
  if (reqs.length > 0) {
    (poolWhere as any).skills = {
      some: { skill: { in: reqs.map((r) => r.skill), mode: 'insensitive' } },
    };
  }

  let employees = await db.employee.findMany({
    where: poolWhere,
    select: {
      id: true, employeeId: true, firstName: true, lastName: true,
      timezone: true, defaultWeeklyHours: true,
      designation: { select: { title: true } },
      department: { select: { id: true, name: true } },
      skills: { select: { skill: true, level: true, yearsOfExp: true } },
      userId: true,
    },
    take: 300,
  });

  // FALLBACK: when the skill-filtered pool is empty (e.g. sparse skill inventory),
  // return the general pool with 0 skill credit instead of an empty result so
  // managers still see availability-based candidates.
  if (employees.length === 0 && reqs.length > 0) {
    delete (poolWhere as any).skills;
    employees = await db.employee.findMany({
      where: poolWhere,
      select: {
        id: true, employeeId: true, firstName: true, lastName: true,
        timezone: true, defaultWeeklyHours: true,
        designation: { select: { title: true } },
        department: { select: { id: true, name: true } },
        skills: { select: { skill: true, level: true, yearsOfExp: true } },
        userId: true,
      },
      take: 200,
    });
  }

  if (employees.length === 0) return [];

  const empIds = employees.map((e: any) => e.id);

  // 3. Live availability data
  const [allocations, leaves, costRates] = await Promise.all([
    db.projectAllocation.findMany({
      where: {
        employeeId: { in: empIds },
        status: { in: ['active', 'soft'] },
        OR: [
          { startDate: { lte: winEnd }, endDate: null },
          { startDate: { lte: winEnd }, endDate: { gte: winStart } },
          { startDate: { gte: winStart } },
        ],
      },
      include: { project: { select: { name: true } } },
    }),
    db.leaveRequest.findMany({
      where: { employeeId: { in: empIds }, status: 'approved', startDate: { lte: winEnd }, endDate: { gte: winStart } },
      select: { employeeId: true, startDate: true, endDate: true },
    }).catch(() => []),
    db.employeeCostRate.findMany({ where: { employeeId: { in: empIds }, isActive: true }, select: { employeeId: true } })
      .catch(() => []),
  ]);

  const costRateSet = new Set((costRates || []).map((c: any) => c.employeeId));

  const candidates: MatchCandidate[] = [];

  for (const emp of employees) {
    const reasons: string[] = [];
    const empSkills = emp.skills || [];
    const skillByName = new Map<string, { skill: string; level: string; yearsOfExp: number | null }>();
    for (const s of empSkills) skillByName.set(s.skill.toLowerCase(), s);

    // ── Skill scoring
    const matchedSkills: MatchCandidate['matchedSkills'] = [];
    const missingSkills: string[] = [];
    let skillPoints = 0;
    for (const req of reqs) {
      const found = skillByName.get(req.skill.toLowerCase());
      if (found) {
        const meets = levelSatisfied(found.level, req.level);
        matchedSkills.push({ skill: found.skill, level: found.level, yearsOfExp: found.yearsOfExp, meetsLevel: meets });
        if (meets) {
          skillPoints += 60 / reqs.length;
          const yrs = found.yearsOfExp ?? 0;
          if (req.minYears && yrs >= req.minYears) skillPoints += Math.min(5, (yrs - req.minYears) * 1);
        } else {
          skillPoints += 12 / reqs.length; // partial credit for having the skill below level
        }
      } else {
        missingSkills.push(req.skill);
      }
    }

    // ── Availability scoring
    const empAllocs = (allocations || []).filter((a: any) => a.employeeId === emp.id);
    const committedPct = empAllocs.reduce((sum: number, a: any) => sum + (a.allocationPct ?? 100), 0);
    const onLeave = (leaves || []).some(
      (l: any) => l.employeeId === emp.id &&
        new Date(l.startDate).getTime() <= winEnd.getTime() &&
        new Date(l.endDate).getTime() >= winStart.getTime()
    );
    const projected = committedPct + requestedPct;
    let availability: MatchCandidate['availability'] = 'available';
    let availabilityNote = `No conflicting allocations in ${winStart.toISOString().slice(0, 10)} → ${winEnd.toISOString().slice(0, 10)}`;
    let capacityPoints = 25;
    if (onLeave) {
      availability = 'busy';
      capacityPoints = 0;
      availabilityNote = 'Approved leave inside the requested window';
      reasons.push('On approved leave during window');
    } else if (projected > thresholdPct) {
      availability = 'busy';
      capacityPoints = 0;
      availabilityNote = `Already committed ${committedPct}% — adding this role would exceed ${thresholdPct}%`;
      reasons.push(`Committed ${committedPct}% to other projects in window`);
    } else if (committedPct > thresholdPct - requestedPct && committedPct > 0) {
      availability = 'partial';
      capacityPoints = 12;
      availabilityNote = `Partial availability — committed ${committedPct}%, fits ${Math.max(0, thresholdPct - committedPct)}% more`;
      reasons.push(`Partial capacity available (${committedPct}% already booked)`);
    } else if (committedPct > 0) {
      availabilityNote = `Available alongside current ${committedPct}% commitment`;
    }

    // ── Context scoring
    let contextPoints = 0;
    if (requirement.departmentId && emp.department?.id === requirement.departmentId) {
      contextPoints += 8;
      reasons.push(`Same department (${emp.department?.name})`);
    }
    if (emp.timezone) {
      contextPoints += 4;
      reasons.push(`Timezone aligned (${emp.timezone})`);
    }
    if (costRateSet.has(emp.id)) {
      contextPoints += 3;
      reasons.push('Cost rate on record (billing-ready)');
    }
    if (matchedSkills.length > 0) {
      reasons.push(`Skills matched: ${matchedSkills.map((m) => m.skill).join(', ')}`);
    }
    if (matchedSkills.length === 0 && reqs.length === 0) {
      skillPoints = 45; // no skills specified — neutral base
    }

    const score = Math.min(100, Math.round(skillPoints + capacityPoints + contextPoints));

    candidates.push({
      employeeId: emp.id,
      employeeCode: emp.employeeId,
      name: `${emp.firstName || ''} ${emp.lastName || ''}`.trim(),
      designation: emp.designation?.title || null,
      department: emp.department?.name || null,
      timezone: emp.timezone || null,
      score,
      matchedSkills,
      missingSkills,
      availability,
      availabilityNote,
      currentAllocations: empAllocs.map((a: any) => ({
        projectName: a.project?.name || 'Project',
        allocationPct: a.allocationPct ?? 100,
        status: a.status,
      })),
      reasons,
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, limit);
}
