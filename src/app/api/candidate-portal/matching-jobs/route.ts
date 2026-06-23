/**
 * Candidate Portal — Matching Jobs
 *
 * GET /api/candidate-portal/matching-jobs
 *
 * Returns job recommendations for the authenticated candidate:
 *   - internal: open jobs from our portal whose requirements overlap with
 *     the candidate's parsed resume skills (simple token-overlap scoring).
 *     Excludes jobs the candidate has already applied to.
 *   - external: pre-built search URLs for major external job boards
 *     (LinkedIn Jobs, Indeed, Naukri, Glassdoor) populated with the
 *     candidate's top skills + preferred location so they can one-click
 *     over to broaden their search.
 *
 * The external-board section is intentionally a thin "deep-link generator"
 * — we don't scrape or proxy listings (which would violate their ToS),
 * we just produce a search URL the candidate can open in a new tab.
 */
import prisma from '@/lib/prisma';
import { requireCandidate, ok, fail, OPTIONS } from '@/lib/candidate-auth';

export { OPTIONS };

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9+#]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Top N skills by frequency across the candidate's resume parses. */
async function getCandidateSkills(email: string): Promise<{ skills: string[]; location?: string }> {
  const applications = await prisma.jobApplication.findMany({
    where: { candidateEmail: email },
    select: {
      resumeParses: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { parsedData: true },
      },
    },
  });

  const freq: Record<string, number> = {};
  let location: string | undefined;

  for (const app of applications) {
    const parse = app.resumeParses[0];
    if (!parse) continue;
    try {
      const parsed = JSON.parse(parse.parsedData);
      const skills: string[] = Array.isArray(parsed?.skills) ? parsed.skills : [];
      for (const s of skills) {
        const k = slugify(String(s));
        if (!k || k.length < 2) continue;
        freq[k] = (freq[k] || 0) + 1;
      }
      // Capture the first non-empty location we see — used as a hint for
      // external job-board searches (candidates can edit on the destination
      // site anyway).
      if (!location && parsed?.location && typeof parsed.location === 'string') {
        location = parsed.location;
      }
    } catch {
      /* ignore malformed parse */
    }
  }

  const skills = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .map(([s]) => s)
    .slice(0, 8);

  return { skills, location };
}

export async function GET(request: Request) {
  const { candidate, response } = await requireCandidate(request);
  if (!candidate) return response;

  const { skills, location } = await getCandidateSkills(candidate.email);

  // ─── Internal matching jobs ───────────────────────────────────────────
  // For each open job posting, score by counting how many of the candidate's
  // top skills appear in the requirements/description text. Excludes jobs
  // the candidate has already applied to.
  let internalJobs: Array<{
    id: string;
    title: string;
    position: string;
    location: string | null;
    type: string;
    experience: string | null;
    salary: string | null;
    company: string;
    matchScore: number;
    matchedSkills: string[];
  }> = [];

  if (skills.length > 0) {
    const alreadyAppliedJobIds = (
      await prisma.jobApplication.findMany({
        where: { candidateEmail: candidate.email },
        select: { jobPostingId: true },
      })
    ).map((a) => a.jobPostingId);

    const openJobs = await prisma.jobPosting.findMany({
      where: {
        status: 'open',
        id: { notIn: alreadyAppliedJobIds },
      },
      take: 50,
      orderBy: { postedDate: 'desc' },
      select: {
        id: true,
        title: true,
        position: true,
        location: true,
        type: true,
        experience: true,
        salary: true,
        description: true,
        requirements: true,
        department: { select: { name: true, company: { select: { name: true } } } },
      },
    });

    internalJobs = openJobs
      .map((job) => {
        const haystack = slugify(
          `${job.title} ${job.position} ${job.description || ''} ${job.requirements || ''}`,
        );
        const matched: string[] = [];
        for (const s of skills) {
          if (haystack.includes(s)) matched.push(s);
        }
        // Score: matched skills / total candidate skills, scaled to 100.
        // Boost slightly so even a 1-skill match isn't 0%.
        const matchScore = Math.round(
          (matched.length / Math.max(skills.length, 1)) * 100,
        );
        return {
          id: job.id,
          title: job.title,
          position: job.position,
          location: job.location,
          type: job.type,
          experience: job.experience,
          salary: job.salary,
          company: job.department?.company?.name || '—',
          matchScore,
          matchedSkills: matched,
        };
      })
      .filter((j) => j.matchedSkills.length > 0)
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 6);
  }

  // ─── External job-board deep links ────────────────────────────────────
  // Build ready-to-open search URLs for the major boards, pre-filled with
  // the candidate's top skills (joined as a query string) + location hint.
  const skillQuery = skills.slice(0, 4).join(' ');
  const locQuery = location || '';
  const externalBoards: Array<{
    board: string;
    url: string;
    description: string;
  }> = [];

  if (skillQuery) {
    externalBoards.push(
      {
        board: 'LinkedIn Jobs',
        url: `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(skillQuery)}${locQuery ? `&location=${encodeURIComponent(locQuery)}` : ''}`,
        description: 'Search LinkedIn Jobs with your top skills',
      },
      {
        board: 'Indeed',
        url: `https://www.indeed.com/jobs?q=${encodeURIComponent(skillQuery)}${locQuery ? `&l=${encodeURIComponent(locQuery)}` : ''}`,
        description: 'Broad listing aggregator — search Indeed',
      },
      {
        board: 'Naukri',
        url: `https://www.naukri.com/${encodeURIComponent(skillQuery).replace(/%20/g, '-')}-jobs${locQuery ? `-${encodeURIComponent(locQuery).replace(/%20/g, '-')}` : ''}`,
        description: 'India-focused — Naukri.com',
      },
      {
        board: 'Glassdoor',
        url: `https://www.glassdoor.com/Job/jobs.htm?sc.keyword=${encodeURIComponent(skillQuery)}${locQuery ? `&locT=C&locId=0&locKeyword=${encodeURIComponent(locQuery)}` : ''}`,
        description: 'Glassdoor — salary insights + listings',
      },
      {
        board: 'Google for Jobs',
        url: `https://www.google.com/search?q=${encodeURIComponent(skillQuery + ' jobs')}${locQuery ? `+near+${encodeURIComponent(locQuery)}` : ''}&ibp=htl;jobs`,
        description: 'Aggregated listing via Google for Jobs',
      },
    );
  }

  return ok({
    candidateSkills: skills,
    candidateLocation: location || null,
    internal: internalJobs,
    external: externalBoards,
  });
}
