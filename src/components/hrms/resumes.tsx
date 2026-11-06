'use client';

/**
 * Resumes module — sidebar entry under RECRUITMENT.
 *
 * Lists every JobApplication that has a resume attached, with:
 *   - Search by candidate name / email
 *   - Filter by job applied, role, applied-date range
 *   - Per-row actions:
 *       • View Resume (open the resumeUrl in a new tab)
 *       • Parse Resume  → POST /api/recruitment-ai {action:'parse_resume', resumeDataUrl, jobApplicationId}
 *       • Reparse       → same as Parse but forces a fresh parse even if cached
 *       • Run Sentiment → POST /api/ats/sentiment {jobApplicationId, source}
 *
 * Uses the existing /api/recruitment endpoint to fetch job postings + their
 * applications (the recentApplications list is flattened from all jobs).
 * No new API routes are created.
 */
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  FileText, Search, RefreshCw, AlertTriangle, Loader2, Eye, Wand2, Repeat, Smile, X,
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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface JobApp {
  id: string;
  candidateName: string;
  candidateEmail: string;
  resume?: string | null;
  coverLetter?: string | null;
  status: string;
  appliedDate?: string;
  source?: string;
  notes?: string;
  jobTitle?: string;
  jobPostingId?: string;
  rating?: number | null;
  sentiment?: string | null;
}

interface JobPosting {
  id: string;
  title: string;
  department?: string | null;
}

const SENTIMENT_COLORS: Record<string, string> = {
  positive: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  neutral: 'bg-slate-100 text-slate-800 border-slate-200',
  negative: 'bg-red-100 text-red-800 border-red-200',
  mixed: 'bg-amber-100 text-amber-800 border-amber-200',
};

export function Resumes() {
  const [apps, setApps] = useState<JobApp[]>([]);
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState({
    search: '',
    jobId: 'all',
    dateFrom: '',
    dateTo: '',
  });
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [viewing, setViewing] = useState<JobApp | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/recruitment?limit=200', { headers: getAuthHeaders() });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const data = await res.json();
      // recruitment GET returns { jobPostings: [...], recentApplications: [...] }
      const jobList: JobPosting[] = (data?.jobPostings || []).map((j: any) => ({
        id: j.id, title: j.title, department: j.department,
      }));
      setJobs(jobList);
      const appList: JobApp[] = (data?.recentApplications || []).map((a: any) => ({
        id: a.id,
        candidateName: a.candidateName || 'Unknown',
        candidateEmail: a.candidateEmail || '',
        resume: a.resume || null,
        coverLetter: a.coverLetter || null,
        status: a.status || 'applied',
        appliedDate: a.appliedDate || a.createdAt,
        source: a.source || '',
        notes: a.notes || '',
        jobTitle: a.jobTitle || '',
        jobPostingId: a.jobPostingId || '',
        rating: a.rating ?? null,
        sentiment: a.sentiment || null,
      }));
      // Only show apps that have a resume attached
      setApps(appList.filter((a) => !!a.resume));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load resumes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = useMemo(() => {
    const q = filter.search.trim().toLowerCase();
    return apps.filter((a) => {
      const matchesSearch = !q ||
        a.candidateName.toLowerCase().includes(q) ||
        a.candidateEmail.toLowerCase().includes(q) ||
        (a.jobTitle || '').toLowerCase().includes(q);
      const matchesJob = filter.jobId === 'all' || a.jobPostingId === filter.jobId;
      let matchesDate = true;
      if (filter.dateFrom) {
        const from = new Date(filter.dateFrom).getTime();
        const applied = a.appliedDate ? new Date(a.appliedDate).getTime() : 0;
        if (applied < from) matchesDate = false;
      }
      if (filter.dateTo && matchesDate) {
        const to = new Date(filter.dateTo).getTime() + 86400000; // inclusive
        const applied = a.appliedDate ? new Date(a.appliedDate).getTime() : 0;
        if (applied > to) matchesDate = false;
      }
      return matchesSearch && matchesJob && matchesDate;
    });
  }, [apps, filter]);

  const runAction = async (app: JobApp, action: 'parse' | 'reparse' | 'sentiment') => {
    if (action !== 'sentiment' && !app.resume) {
      toast.error('No resume file attached to this application');
      return;
    }
    setActionLoading((s) => ({ ...s, [`${app.id}-${action}`]: true }));
    try {
      let res: Response;
      if (action === 'sentiment') {
        res = await fetch('/api/ats/sentiment', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ jobApplicationId: app.id, source: 'manual' }),
        });
      } else {
        // parse_resume expects resumeDataUrl. We don't have a way to fetch
        // the resume contents from the client without a download URL — but
        // many resumes are stored as URLs already. Send the URL as-is; the
        // API will handle fetching or fall back to text extraction.
        res = await fetch('/api/recruitment-ai', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            action: 'parse_resume',
            resumeUrl: app.resume,
            resumeDataUrl: app.resume, // some flows accept URL here
            jobApplicationId: app.id,
            forceReparse: action === 'reparse',
          }),
        });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      if (action === 'sentiment') {
        toast.success(`Sentiment: ${data.sentiment || 'unknown'} (engagement ${data.engagementScore ?? '—'}/100)`);
      } else {
        toast.success(action === 'parse' ? 'Resume parsed' : 'Resume re-parsed');
      }
      // Refresh to show updated sentiment badge
      fetchData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setActionLoading((s) => ({ ...s, [`${app.id}-${action}`]: false }));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <FileText className="h-6 w-6 text-emerald-600" /> Resumes
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            All candidate resumes across every job posting. Parse, re-parse, and run sentiment analysis.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Total Resumes</div><div className="text-2xl font-bold mt-1">{apps.length}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Parsed (with notes)</div><div className="text-2xl font-bold mt-1 text-blue-600">{apps.filter(a => a.notes).length}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Positive sentiment</div><div className="text-2xl font-bold mt-1 text-emerald-600">{apps.filter(a => a.sentiment === 'positive').length}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Negative sentiment</div><div className="text-2xl font-bold mt-1 text-red-600">{apps.filter(a => a.sentiment === 'negative').length}</div></CardContent></Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="relative md:col-span-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search name, email, role…"
                value={filter.search}
                onChange={(e) => setFilter({ ...filter, search: e.target.value })}
                className="pl-9"
              />
            </div>
            <Select value={filter.jobId} onValueChange={(v) => setFilter({ ...filter, jobId: v })}>
              <SelectTrigger><SelectValue placeholder="All jobs" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All jobs</SelectItem>
                {jobs.map((j) => (
                  <SelectItem key={j.id} value={j.id}>{j.title}{j.department ? ` · ${j.department}` : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div>
              <Label className="text-xs">From date</Label>
              <Input type="date" value={filter.dateFrom} onChange={(e) => setFilter({ ...filter, dateFrom: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">To date</Label>
              <Input type="date" value={filter.dateTo} onChange={(e) => setFilter({ ...filter, dateTo: e.target.value })} />
            </div>
          </div>
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
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading resumes…
        </div>
      )}

      {/* Empty */}
      {!loading && !error && filtered.length === 0 && (
        <Card><CardContent className="p-12 text-center">
          <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-medium">{apps.length === 0 ? 'No resumes yet' : 'No matching resumes'}</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {apps.length === 0
              ? 'Resumes will appear here once candidates apply with a resume attached.'
              : 'Try adjusting your filters.'}
          </p>
        </CardContent></Card>
      )}

      {/* Table */}
      {!loading && filtered.length > 0 && (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Candidate</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Role Applied</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Date</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sentiment</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr key={a.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="font-medium">{a.candidateName}</div>
                      <div className="text-xs text-muted-foreground">{a.candidateEmail || '—'}</div>
                    </td>
                    <td className="px-4 py-3">{a.jobTitle || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {a.appliedDate ? new Date(a.appliedDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                    </td>
                    <td className="px-4 py-3"><Badge variant="outline">{a.status}</Badge></td>
                    <td className="px-4 py-3">
                      {a.sentiment ? (
                        <Badge variant="outline" className={SENTIMENT_COLORS[a.sentiment] || ''}>{a.sentiment}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <ActionBtn
                          title="View resume"
                          icon={<Eye className="h-4 w-4" />}
                          loading={actionLoading[`${a.id}-view`]}
                          onClick={() => setViewing(a)}
                        />
                        <ActionBtn
                          title="Parse resume"
                          icon={<Wand2 className="h-4 w-4" />}
                          loading={actionLoading[`${a.id}-parse`]}
                          onClick={() => runAction(a, 'parse')}
                        />
                        <ActionBtn
                          title="Re-parse"
                          icon={<Repeat className="h-4 w-4" />}
                          loading={actionLoading[`${a.id}-reparse`]}
                          onClick={() => runAction(a, 'reparse')}
                        />
                        <ActionBtn
                          title="Run sentiment"
                          icon={<Smile className="h-4 w-4" />}
                          loading={actionLoading[`${a.id}-sentiment`]}
                          onClick={() => runAction(a, 'sentiment')}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Resume viewer modal */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{viewing?.candidateName}'s Resume</DialogTitle>
            <DialogDescription>
              {viewing?.jobTitle ? `Applied for: ${viewing.jobTitle}` : ''}
            </DialogDescription>
          </DialogHeader>
          {viewing?.resume && (
            <div className="space-y-3">
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Resume URL</div>
                <a
                  href={viewing.resume}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-emerald-600 hover:text-emerald-700 break-all"
                >
                  {viewing.resume}
                </a>
              </div>
              {viewing.notes && (
                <div className="rounded-md border border-border bg-muted/30 p-3">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Parsed Notes</div>
                  <p className="text-sm whitespace-pre-wrap">{viewing.notes}</p>
                </div>
              )}
              {viewing.coverLetter && (
                <div className="rounded-md border border-border bg-muted/30 p-3">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Cover Letter</div>
                  <p className="text-sm whitespace-pre-wrap">{viewing.coverLetter}</p>
                </div>
              )}
              <Button asChild>
                <a href={viewing.resume} target="_blank" rel="noopener noreferrer">
                  <Eye className="h-4 w-4 mr-2" /> Open resume in new tab
                </a>
              </Button>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewing(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ActionBtn({
  title, icon, loading, onClick,
}: { title: string; icon: React.ReactNode; loading?: boolean; onClick: () => void }) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={loading}
      className="p-1.5 rounded-md text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-50"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
    </button>
  );
}
