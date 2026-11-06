'use client';

/**
 * Find Candidates module — sidebar entry under RECRUITMENT.
 *
 * Cross-job candidate discovery with:
 *   - Search by name / email / keyword
 *   - Filter by skills (comma-separated, must match ALL)
 *   - Filter by min/max experience years
 *   - Filter by min/max expected salary (LPA)
 *   - Filter by application status
 *   - Filter by specific job posting
 *
 * Results render as visual candidate cards with:
 *   - Avatar (initials)
 *   - Name + email
 *   - Current title (parsed from resume)
 *   - Years of experience
 *   - Skill tags (top 6 skills)
 *   - AI match score badge (when available)
 *   - "View Profile" button → opens detail modal with full resume
 *
 * Reuses /api/recruitment/candidate-search — no new API created.
 */
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Search, RefreshCw, AlertTriangle, Loader2, Eye, MapPin, Briefcase, Mail, Phone,
  Star, Clock, DollarSign, Award, X, ChevronDown, ChevronUp, Filter,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface ParsedResume {
  name?: string;
  email?: string;
  phone?: string;
  location?: string;
  summary?: string;
  skills?: string[];
  experience?: Array<{ company?: string; role?: string; duration?: string }>;
  education?: Array<{ degree?: string; institution?: string; year?: string }>;
  certifications?: string[];
  languages?: string[];
}

interface Application {
  id: string;
  jobPostingId?: string;
  jobTitle?: string;
  position?: string;
  status?: string;
  appliedDate?: string;
}

interface Candidate {
  candidateEmail: string;
  candidateName: string;
  candidatePhone?: string;
  skills?: string[];
  totalExperienceYears?: number;
  expectedSalaryLpa?: number | null;
  latestStatus?: string;
  latestAppliedDate?: string;
  parsedResume?: ParsedResume;
  matchScore?: number | null;
  applications?: Application[];
}

interface JobPosting { id: string; title: string; }

const STATUS_COLORS: Record<string, string> = {
  applied: 'bg-blue-100 text-blue-800',
  screening: 'bg-amber-100 text-amber-800',
  shortlisted: 'bg-teal-100 text-teal-800',
  interview: 'bg-purple-100 text-purple-800',
  offered: 'bg-emerald-100 text-emerald-800',
  hired: 'bg-green-200 text-green-900',
  rejected: 'bg-red-100 text-red-800',
  talent_pool: 'bg-slate-100 text-slate-800',
};

function matchScoreColor(score: number | null | undefined): string {
  if (score == null) return 'bg-slate-100 text-slate-600';
  if (score >= 75) return 'bg-emerald-100 text-emerald-700';
  if (score >= 50) return 'bg-amber-100 text-amber-700';
  return 'bg-red-100 text-red-700';
}

function matchScoreLabel(score: number | null | undefined): string {
  if (score == null) return 'No score';
  return `${Math.round(score)}% match`;
}

export function FindCandidates() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<Candidate | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filter, setFilter] = useState({
    q: '',
    skills: '',
    minExp: '',
    maxExp: '',
    minSalary: '',
    maxSalary: '',
    status: 'all',
    jobId: 'all',
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Build query string
      const params = new URLSearchParams();
      params.set('limit', '200');
      if (filter.q.trim()) params.set('q', filter.q.trim());
      if (filter.skills.trim()) params.set('skills', filter.skills.trim());
      if (filter.minExp) params.set('minExperienceYears', filter.minExp);
      if (filter.maxExp) params.set('maxExperienceYears', filter.maxExp);
      if (filter.minSalary) params.set('minSalary', filter.minSalary);
      if (filter.maxSalary) params.set('maxSalary', filter.maxSalary);
      if (filter.status !== 'all') params.set('status', filter.status);
      if (filter.jobId !== 'all') params.set('jobPostingId', filter.jobId);

      const res = await fetch(`/api/recruitment/candidate-search?${params.toString()}`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const data = await res.json();
      const list: Candidate[] = data?.candidates || data?.results || data?.data || (Array.isArray(data) ? data : []);
      setCandidates(list);

      // Also fetch job postings for the filter dropdown (single call)
      if (jobs.length === 0) {
        try {
          const recRes = await fetch('/api/recruitment?limit=200', { headers: getAuthHeaders() });
          if (recRes.ok) {
            const recData = await recRes.json();
            setJobs((recData?.jobPostings || []).map((j: any) => ({ id: j.id, title: j.title })));
          }
        } catch { /* non-fatal */ }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load candidates');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter.q, filter.skills, filter.minExp, filter.maxExp, filter.minSalary, filter.maxSalary, filter.status, filter.jobId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Derived stats
  const stats = useMemo(() => {
    const total = candidates.length;
    const withMatch = candidates.filter((c) => c.matchScore != null);
    const avgMatch = withMatch.length > 0
      ? Math.round(withMatch.reduce((sum, c) => sum + (c.matchScore || 0), 0) / withMatch.length)
      : null;
    const totalSkills = new Set(candidates.flatMap((c) => c.skills || [])).size;
    return { total, avgMatch, totalSkills };
  }, [candidates]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Search className="h-6 w-6 text-emerald-600" /> Find Candidates
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Search across all candidates who have applied to your job postings. Filter by skills, experience, salary, and more.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Candidates Found</div>
          <div className="text-2xl font-bold mt-1">{stats.total}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Avg AI Match Score</div>
          <div className="text-2xl font-bold mt-1 text-emerald-600">{stats.avgMatch != null ? `${stats.avgMatch}%` : '—'}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Unique Skills</div>
          <div className="text-2xl font-bold mt-1 text-blue-600">{stats.totalSkills}</div>
        </CardContent></Card>
      </div>

      {/* Search + filter toggle */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, or keyword…"
                value={filter.q}
                onChange={(e) => setFilter({ ...filter, q: e.target.value })}
                className="pl-9"
              />
            </div>
            <Button variant="outline" onClick={() => setShowFilters(!showFilters)}>
              <Filter className="h-4 w-4 mr-2" />
              {showFilters ? 'Hide Filters' : 'Show Filters'}
              {showFilters ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />}
            </Button>
          </div>

          {showFilters && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-3 border-t border-border">
              <div>
                <Label className="text-xs">Skills (comma-separated, must match all)</Label>
                <Input
                  placeholder="react, node.js, postgresql"
                  value={filter.skills}
                  onChange={(e) => setFilter({ ...filter, skills: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">Min Experience (years)</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={filter.minExp}
                  onChange={(e) => setFilter({ ...filter, minExp: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">Max Experience (years)</Label>
                <Input
                  type="number"
                  placeholder="20"
                  value={filter.maxExp}
                  onChange={(e) => setFilter({ ...filter, maxExp: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">Min Salary (LPA)</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={filter.minSalary}
                  onChange={(e) => setFilter({ ...filter, minSalary: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">Max Salary (LPA)</Label>
                <Input
                  type="number"
                  placeholder="100"
                  value={filter.maxSalary}
                  onChange={(e) => setFilter({ ...filter, maxSalary: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">Application Status</Label>
                <Select value={filter.status} onValueChange={(v) => setFilter({ ...filter, status: v })}>
                  <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="applied">Applied</SelectItem>
                    <SelectItem value="screening">Screening</SelectItem>
                    <SelectItem value="shortlisted">Shortlisted</SelectItem>
                    <SelectItem value="interview">Interview</SelectItem>
                    <SelectItem value="offered">Offered</SelectItem>
                    <SelectItem value="hired">Hired</SelectItem>
                    <SelectItem value="talent_pool">Talent Pool</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Job Posting</Label>
                <Select value={filter.jobId} onValueChange={(v) => setFilter({ ...filter, jobId: v })}>
                  <SelectTrigger><SelectValue placeholder="All jobs" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All jobs</SelectItem>
                    {jobs.map((j) => (
                      <SelectItem key={j.id} value={j.id}>{j.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-3 flex justify-end">
                <Button variant="outline" size="sm" onClick={() => setFilter({
                  q: '', skills: '', minExp: '', maxExp: '', minSalary: '', maxSalary: '', status: 'all', jobId: 'all',
                })}>
                  <X className="h-3 w-3 mr-1" /> Clear all filters
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 flex items-start gap-2">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <div>{error}</div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Searching candidates…
        </div>
      )}

      {/* Empty */}
      {!loading && !error && candidates.length === 0 && (
        <Card><CardContent className="p-12 text-center">
          <Search className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-medium">No candidates found</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Try adjusting your search terms or filters. Candidates will appear here once they apply to your job postings.
          </p>
        </CardContent></Card>
      )}

      {/* Candidate cards grid */}
      {!loading && !error && candidates.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {candidates.map((c, idx) => (
            <CandidateCard key={`${c.candidateEmail}-${idx}`} candidate={c} onView={() => setViewing(c)} />
          ))}
        </div>
      )}

      {/* Profile modal */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{viewing?.candidateName || 'Candidate Profile'}</DialogTitle>
            <DialogDescription>
              {viewing?.candidateEmail}
            </DialogDescription>
          </DialogHeader>
          {viewing && <CandidateDetail candidate={viewing} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CandidateCard({ candidate, onView }: { candidate: Candidate; onView: () => void }) {
  const skills = (candidate.skills || candidate.parsedResume?.skills || []).slice(0, 6);
  const location = candidate.parsedResume?.location;
  const experience = candidate.totalExperienceYears || 0;
  const matchScore = candidate.matchScore;
  const latestStatus = candidate.latestStatus;
  const applicationsCount = candidate.applications?.length || 0;

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-base font-semibold shrink-0">
              {(candidate.candidateName || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="font-medium truncate">{candidate.candidateName || 'Unknown'}</div>
              <div className="text-xs text-muted-foreground truncate flex items-center gap-1">
                <Mail className="h-3 w-3" /> {candidate.candidateEmail || '—'}
              </div>
            </div>
          </div>
          <Badge className={`shrink-0 ${matchScoreColor(matchScore)}`}>
            <Star className="h-3 w-3 mr-0.5" />
            {matchScore != null ? `${Math.round(matchScore)}%` : '—'}
          </Badge>
        </div>

        {/* Meta row */}
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mb-3">
          {experience > 0 && (
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {experience} yr{experience !== 1 ? 's' : ''} exp</span>
          )}
          {candidate.expectedSalaryLpa && (
            <span className="flex items-center gap-1"><DollarSign className="h-3 w-3" /> {candidate.expectedSalaryLpa} LPA</span>
          )}
          {location && (
            <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {location}</span>
          )}
          {latestStatus && (
            <Badge variant="outline" className={`text-[10px] h-5 px-1.5 ${STATUS_COLORS[latestStatus] || ''}`}>
              {latestStatus}
            </Badge>
          )}
          {applicationsCount > 1 && (
            <span className="flex items-center gap-1"><Briefcase className="h-3 w-3" /> {applicationsCount} applications</span>
          )}
        </div>

        {/* Skills */}
        {skills.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {skills.map((s, i) => (
              <Badge key={i} variant="outline" className="text-[10px] h-5 px-1.5 bg-emerald-50 text-emerald-700 border-emerald-200">
                {s.length > 28 ? `${s.slice(0, 28)}…` : s}
              </Badge>
            ))}
            {(candidate.skills || candidate.parsedResume?.skills || []).length > 6 && (
              <Badge variant="outline" className="text-[10px] h-5 px-1.5 bg-slate-50 text-slate-600 border-slate-200">
                +{(candidate.skills || candidate.parsedResume?.skills || []).length - 6} more
              </Badge>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-border">
          <span className="text-xs text-muted-foreground">
            {candidate.latestAppliedDate
              ? `Applied ${new Date(candidate.latestAppliedDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
              : ''}
          </span>
          <Button size="sm" variant="outline" onClick={onView}>
            <Eye className="h-3.5 w-3.5 mr-1.5" /> View Profile
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CandidateDetail({ candidate }: { candidate: Candidate }) {
  const parsed = candidate.parsedResume;
  const skills = candidate.skills || parsed?.skills || [];
  const experience = parsed?.experience || [];
  const education = parsed?.education || [];
  const certifications = parsed?.certifications || [];

  return (
    <div className="space-y-4">
      {/* Contact + meta */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Email</div>
          <div className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> {candidate.candidateEmail || '—'}</div>
        </div>
        <div>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Phone</div>
          <div className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {candidate.candidatePhone || parsed?.phone || '—'}</div>
        </div>
        <div>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Total Experience</div>
          <div>{candidate.totalExperienceYears || 0} years</div>
        </div>
        <div>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Expected Salary</div>
          <div>{candidate.expectedSalaryLpa ? `${candidate.expectedSalaryLpa} LPA` : '—'}</div>
        </div>
      </div>

      {/* Match score + status */}
      <div className="flex items-center gap-3">
        {candidate.matchScore != null && (
          <Badge className={matchScoreColor(candidate.matchScore)}>
            <Star className="h-3 w-3 mr-1" /> {Math.round(candidate.matchScore)}% AI Match
          </Badge>
        )}
        {candidate.latestStatus && (
          <Badge variant="outline" className={STATUS_COLORS[candidate.latestStatus] || ''}>
            Status: {candidate.latestStatus}
          </Badge>
        )}
      </div>

      {/* Summary */}
      {parsed?.summary && (
        <div className="rounded-md border border-border bg-muted/30 p-3">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Summary</div>
          <p className="text-sm whitespace-pre-wrap">{parsed.summary}</p>
        </div>
      )}

      {/* Skills */}
      {skills.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Skills ({skills.length})</div>
          <div className="flex flex-wrap gap-1">
            {skills.map((s, i) => (
              <Badge key={i} variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">{s}</Badge>
            ))}
          </div>
        </div>
      )}

      {/* Experience */}
      {experience.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Experience ({experience.length})</div>
          <div className="space-y-2">
            {experience.map((e, i) => (
              <div key={i} className="rounded-md border border-border p-2 text-sm">
                <div className="font-medium">{e.role || 'Role'}</div>
                <div className="text-xs text-muted-foreground">{e.company || 'Company'} · {e.duration || 'Duration N/A'}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Education */}
      {education.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Education ({education.length})</div>
          <div className="space-y-2">
            {education.map((e, i) => (
              <div key={i} className="rounded-md border border-border p-2 text-sm">
                <div className="font-medium">{e.degree || 'Degree'}</div>
                <div className="text-xs text-muted-foreground">{e.institution || 'Institution'} · {e.year || ''}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Certifications */}
      {certifications.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Certifications ({certifications.length})</div>
          <div className="flex flex-wrap gap-1">
            {certifications.map((c, i) => (
              <Badge key={i} variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                <Award className="h-3 w-3 mr-1" /> {c}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Applications */}
      {candidate.applications && candidate.applications.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Applied to ({candidate.applications.length})
          </div>
          <div className="space-y-1">
            {candidate.applications.map((a, i) => (
              <div key={i} className="flex items-center justify-between text-sm rounded-md border border-border p-2">
                <div className="flex items-center gap-2">
                  <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-medium">{a.jobTitle || a.position || 'Position'}</span>
                </div>
                <div className="flex items-center gap-2">
                  {a.status && <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[a.status] || ''}`}>{a.status}</Badge>}
                  {a.appliedDate && (
                    <span className="text-xs text-muted-foreground">
                      {new Date(a.appliedDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
