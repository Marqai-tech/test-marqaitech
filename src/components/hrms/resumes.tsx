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
  Download, ExternalLink, FileWarning,
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

// ─── Resume file helpers ───
// The resume field on JobApplication can be either:
//   (a) An HTTP/HTTPS URL pointing to an externally hosted file
//   (b) A data URL containing the file inline, e.g.
//       "data:application/pdf;base64,JVBERi0xLjQK..."
//       "data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,..."
//
// Browsers can render PDF data URLs inline (in a new tab) but CANNOT
// render DOCX/DOC inline. For DOCX we must trigger a download.

interface ResumeMeta {
  isDataUrl: boolean;
  mimeType: string;       // e.g. "application/pdf"
  fileExt: string;        // e.g. "pdf", "docx"
  isPdf: boolean;         // PDFs can be previewed inline
  isDoc: boolean;         // DOC/DOCX must be downloaded
  canPreviewInline: boolean;
}

function parseResume(resume?: string | null): ResumeMeta | null {
  if (!resume) return null;
  if (resume.startsWith('http://') || resume.startsWith('https://')) {
    // External URL — assume PDF if URL ends in .pdf, else assume it's viewable
    const ext = resume.split('.').pop()?.toLowerCase().split('?')[0] || '';
    return {
      isDataUrl: false,
      mimeType: ext === 'pdf' ? 'application/pdf' : 'application/octet-stream',
      fileExt: ext || 'bin',
      isPdf: ext === 'pdf',
      isDoc: ['doc', 'docx'].includes(ext),
      canPreviewInline: ext === 'pdf',
    };
  }
  // Data URL
  const match = resume.match(/^data:([^;]+);base64,/);
  if (!match) return null;
  const mime = match[1];
  const isPdf = mime === 'application/pdf';
  const isDoc = mime.includes('wordprocessing') || mime === 'application/msword';
  let fileExt = 'bin';
  if (isPdf) fileExt = 'pdf';
  else if (mime.includes('wordprocessing')) fileExt = 'docx';
  else if (mime === 'application/msword') fileExt = 'doc';
  else if (mime === 'text/plain') fileExt = 'txt';
  else if (mime === 'image/png') fileExt = 'png';
  else if (mime === 'image/jpeg') fileExt = 'jpg';
  return {
    isDataUrl: true,
    mimeType: mime,
    fileExt,
    isPdf,
    isDoc,
    canPreviewInline: isPdf,
  };
}

function sanitizeFilename(name: string): string {
  return (name || 'candidate').replace(/[^a-zA-Z0-9-_ ]/g, '').replace(/\s+/g, '-').toLowerCase() || 'candidate';
}

function buildFilename(candidateName: string, jobTitle: string | undefined, ext: string): string {
  const base = sanitizeFilename(candidateName);
  const job = jobTitle ? `-${sanitizeFilename(jobTitle)}` : '';
  return `${base}${job}-resume.${ext}`;
}

/** Convert a data URL string to a Blob (used for download + object URL preview). */
function dataUrlToBlob(dataUrl: string): Blob | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  const mime = match[1];
  const base64 = match[2];
  try {
    const byteString = atob(base64);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    return new Blob([ab], { type: mime });
  } catch {
    return null;
  }
}

/** Open the resume in a new tab (PDFs render inline; DOCX falls back to download). */
function openResume(resume: string, meta: ResumeMeta, filename: string) {
  if (!meta.isDataUrl) {
    // External URL — open directly
    window.open(resume, '_blank', 'noopener,noreferrer');
    return;
  }
  const blob = dataUrlToBlob(resume);
  if (!blob) {
    toast.error('Could not decode the resume file');
    return;
  }
  const url = URL.createObjectURL(blob);
  if (meta.canPreviewInline) {
    // PDFs — open in new tab so the browser renders them inline
    window.open(url, '_blank', 'noopener,noreferrer');
    // Revoke after 60s to free memory
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } else {
    // DOCX/DOC/etc — trigger a download (browsers can't render these inline)
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast.success(`Downloading ${filename}`);
  }
}

/** Force-trigger a download (works for any file type). */
function downloadResume(resume: string, meta: ResumeMeta, filename: string) {
  if (!meta.isDataUrl) {
    // External URL — trigger download via fetch + blob
    fetch(resume).then(r => r.blob()).then(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast.success(`Downloading ${filename}`);
    }).catch(() => {
      // Fallback: open in new tab
      window.open(resume, '_blank', 'noopener,noreferrer');
    });
    return;
  }
  const blob = dataUrlToBlob(resume);
  if (!blob) {
    toast.error('Could not decode the resume file');
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  toast.success(`Downloading ${filename}`);
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
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">File</th>
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
                      {(() => {
                        const meta = parseResume(a.resume);
                        if (!meta) return <span className="text-xs text-muted-foreground">—</span>;
                        return (
                          <Badge variant="outline" className={`text-[10px] uppercase ${
                            meta.isPdf ? 'bg-red-50 text-red-700 border-red-200' :
                            meta.isDoc ? 'bg-blue-50 text-blue-700 border-blue-200' :
                            'bg-slate-50 text-slate-700 border-slate-200'
                          }`}>
                            {meta.fileExt}
                          </Badge>
                        );
                      })()}
                    </td>
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
                        {(() => {
                          const meta = parseResume(a.resume);
                          if (!meta) return null;
                          const filename = buildFilename(a.candidateName, a.jobTitle, meta.fileExt);
                          return (
                            <ActionBtn
                              title={meta.canPreviewInline ? `Open ${meta.fileExt.toUpperCase()} in new tab` : `Download ${meta.fileExt.toUpperCase()}`}
                              icon={meta.canPreviewInline ? <ExternalLink className="h-4 w-4" /> : <Download className="h-4 w-4" />}
                              onClick={() => openResume(a.resume!, meta, filename)}
                            />
                          );
                        })()}
                        <ActionBtn
                          title="Save to disk"
                          icon={<Download className="h-4 w-4" />}
                          onClick={() => {
                            const meta = parseResume(a.resume);
                            if (!meta) { toast.error('Resume format not recognized'); return; }
                            const filename = buildFilename(a.candidateName, a.jobTitle, meta.fileExt);
                            downloadResume(a.resume!, meta, filename);
                          }}
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
          {viewing?.resume && (() => {
            const meta = parseResume(viewing.resume);
            const filename = meta ? buildFilename(viewing.candidateName, viewing.jobTitle, meta.fileExt) : 'resume';
            if (!meta) {
              return (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 flex items-start gap-2">
                  <FileWarning className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>Resume format not recognized. The resume field is set but doesn't look like a URL or data URL.</div>
                </div>
              );
            }
            return (
              <div className="space-y-3">
                {/* File info card */}
                <div className="rounded-md border border-border bg-muted/30 p-3 flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-md flex items-center justify-center shrink-0 ${
                    meta.isPdf ? 'bg-red-100 text-red-700' :
                    meta.isDoc ? 'bg-blue-100 text-blue-700' :
                    'bg-slate-100 text-slate-700'
                  }`}>
                    <FileText className="h-6 w-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm truncate">{filename}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[10px] uppercase">{meta.fileExt}</Badge>
                      <span>{meta.mimeType}</span>
                      {meta.isDataUrl ? (
                        <span className="text-emerald-600">Embedded file</span>
                      ) : (
                        <span className="text-blue-600">External URL</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex gap-2 flex-wrap">
                  {meta.canPreviewInline ? (
                    <Button onClick={() => openResume(viewing.resume!, meta, filename)}>
                      <ExternalLink className="h-4 w-4 mr-2" /> Open in new tab
                    </Button>
                  ) : (
                    <Button onClick={() => openResume(viewing.resume!, meta, filename)}>
                      <Download className="h-4 w-4 mr-2" /> Download {meta.fileExt.toUpperCase()}
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => downloadResume(viewing.resume!, meta, filename)}>
                    <Download className="h-4 w-4 mr-2" /> Save to disk
                  </Button>
                </div>

                {/* Helper note for DOCX files */}
                {meta.isDoc && (
                  <div className="rounded-md border border-blue-200 bg-blue-50 p-2 text-xs text-blue-800 flex items-start gap-2">
                    <FileWarning className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <div>
                      DOC/DOCX files can't be previewed in the browser — they will be downloaded to your computer. Open the downloaded file with Microsoft Word, Google Docs, or LibreOffice.
                    </div>
                  </div>
                )}

                {/* Parsed notes */}
                {viewing.notes && (
                  <div className="rounded-md border border-border bg-muted/30 p-3">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Parsed Notes</div>
                    <p className="text-sm whitespace-pre-wrap">{viewing.notes}</p>
                  </div>
                )}

                {/* Cover letter */}
                {viewing.coverLetter && (
                  <div className="rounded-md border border-border bg-muted/30 p-3">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Cover Letter</div>
                    <p className="text-sm whitespace-pre-wrap">{viewing.coverLetter}</p>
                  </div>
                )}
              </div>
            );
          })()}
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
