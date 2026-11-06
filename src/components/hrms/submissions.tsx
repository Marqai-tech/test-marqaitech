'use client';

/**
 * Submissions module — sidebar entry under RECRUITMENT.
 *
 * Lists every JobApplication that has been *submitted* by a candidate
 * (any status except 'draft' / 'withdrawn'). Includes:
 *   - Search by candidate name / email
 *   - Filter by job applied, role, applied-date range, status
 *   - Multi-select with checkboxes
 *   - Bulk delete (with confirmation) — calls DELETE on each selected app
 *
 * Reuses the existing /api/recruitment endpoint (GET) and the per-app
 * DELETE on /api/recruitment/[id]. No new API routes are created.
 */
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Inbox, Search, RefreshCw, AlertTriangle, Loader2, Trash2, X, CheckSquare, Square, ChevronDown,
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

interface Submission {
  id: string;
  candidateName: string;
  candidateEmail: string;
  status: string;
  appliedDate?: string;
  source?: string;
  jobTitle?: string;
  jobPostingId?: string;
  resume?: string | null;
}

interface JobPosting {
  id: string;
  title: string;
  department?: string | null;
}

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

// Statuses that count as "submitted" — anything that's not a draft or removed
const SUBMITTED_STATUSES = new Set([
  'applied', 'screening', 'shortlisted', 'interview', 'offered', 'hired',
  'rejected', 'talent_pool', 'on_hold', 'pending',
]);

export function Submissions() {
  const [apps, setApps] = useState<Submission[]>([]);
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState({
    search: '',
    jobId: 'all',
    status: 'all',
    dateFrom: '',
    dateTo: '',
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/recruitment?limit=500', { headers: getAuthHeaders() });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const data = await res.json();
      const jobList: JobPosting[] = (data?.jobPostings || []).map((j: any) => ({
        id: j.id, title: j.title, department: j.department,
      }));
      setJobs(jobList);
      const list: Submission[] = (data?.recentApplications || [])
        .map((a: any) => ({
          id: a.id,
          candidateName: a.candidateName || 'Unknown',
          candidateEmail: a.candidateEmail || '',
          status: a.status || 'applied',
          appliedDate: a.appliedDate || a.createdAt,
          source: a.source || '',
          jobTitle: a.jobTitle || '',
          jobPostingId: a.jobPostingId || '',
          resume: a.resume || null,
        }))
        .filter((a: Submission) => SUBMITTED_STATUSES.has(a.status));
      setApps(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load submissions');
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
      const matchesStatus = filter.status === 'all' || a.status === filter.status;
      let matchesDate = true;
      if (filter.dateFrom) {
        const from = new Date(filter.dateFrom).getTime();
        const applied = a.appliedDate ? new Date(a.appliedDate).getTime() : 0;
        if (applied < from) matchesDate = false;
      }
      if (filter.dateTo && matchesDate) {
        const to = new Date(filter.dateTo).getTime() + 86400000;
        const applied = a.appliedDate ? new Date(a.appliedDate).getTime() : 0;
        if (applied > to) matchesDate = false;
      }
      return matchesSearch && matchesJob && matchesStatus && matchesDate;
    });
  }, [apps, filter]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((a) => selected.has(a.id));
  const toggleAll = () => {
    if (allFilteredSelected) {
      setSelected((s) => {
        const next = new Set(s);
        filtered.forEach((a) => next.delete(a.id));
        return next;
      });
    } else {
      setSelected((s) => {
        const next = new Set(s);
        filtered.forEach((a) => next.add(a.id));
        return next;
      });
    }
  };
  const toggleOne = (id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  const handleBulkDelete = async () => {
    setDeleting(true);
    let successCount = 0;
    let failCount = 0;
    const ids = Array.from(selected);
    await Promise.all(ids.map(async (id) => {
      try {
        const res = await fetch(`/api/recruitment/${id}`, {
          method: 'DELETE',
          headers: getAuthHeaders(),
        });
        if (res.ok) successCount++;
        else failCount++;
      } catch {
        failCount++;
      }
    }));
    setDeleting(false);
    setBulkDeleteOpen(false);
    if (successCount > 0) toast.success(`Deleted ${successCount} submission${successCount > 1 ? 's' : ''}`);
    if (failCount > 0) toast.error(`Failed to delete ${failCount} submission${failCount > 1 ? 's' : ''}`);
    clearSelection();
    fetchData();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Inbox className="h-6 w-6 text-emerald-600" /> Submissions
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            All candidate submissions across job postings. Filter, multi-select, and bulk delete.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Total Submissions</div><div className="text-2xl font-bold mt-1">{apps.length}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">In Interview</div><div className="text-2xl font-bold mt-1 text-purple-600">{apps.filter(a => a.status === 'interview').length}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Offered</div><div className="text-2xl font-bold mt-1 text-emerald-600">{apps.filter(a => a.status === 'offered').length}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Hired</div><div className="text-2xl font-bold mt-1 text-green-700">{apps.filter(a => a.status === 'hired').length}</div></CardContent></Card>
      </div>

      {/* Selection bar */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <div className="text-sm text-emerald-800 flex items-center gap-2">
            <CheckSquare className="h-4 w-4" />
            <span className="font-medium">{selected.size}</span> selected
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={clearSelection}>Clear</Button>
            <Button variant="destructive" size="sm" onClick={() => setBulkDeleteOpen(true)}>
              <Trash2 className="h-4 w-4 mr-2" /> Delete Selected
            </Button>
          </div>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div className="relative md:col-span-2">
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
                  <SelectItem key={j.id} value={j.id}>{j.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="talent_pool">Talent Pool</SelectItem>
              </SelectContent>
            </Select>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">From</Label>
                <Input type="date" value={filter.dateFrom} onChange={(e) => setFilter({ ...filter, dateFrom: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">To</Label>
                <Input type="date" value={filter.dateTo} onChange={(e) => setFilter({ ...filter, dateTo: e.target.value })} />
              </div>
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
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading submissions…
        </div>
      )}

      {/* Empty */}
      {!loading && !error && filtered.length === 0 && (
        <Card><CardContent className="p-12 text-center">
          <Inbox className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-medium">{apps.length === 0 ? 'No submissions yet' : 'No matching submissions'}</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {apps.length === 0
              ? 'Candidate submissions will appear here once they apply to a job posting.'
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
                  <th className="text-left px-4 py-3 w-10">
                    <button
                      onClick={toggleAll}
                      title={allFilteredSelected ? 'Deselect all' : 'Select all'}
                      className="text-muted-foreground hover:text-emerald-600"
                    >
                      {allFilteredSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                    </button>
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Candidate</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Role</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Submitted</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Source</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Resume</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr key={a.id} className={`border-b last:border-0 hover:bg-muted/30 ${selected.has(a.id) ? 'bg-emerald-50/50' : ''}`}>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleOne(a.id)}
                        title={selected.has(a.id) ? 'Deselect' : 'Select'}
                        className="text-muted-foreground hover:text-emerald-600"
                      >
                        {selected.has(a.id) ? <CheckSquare className="h-4 w-4 text-emerald-600" /> : <Square className="h-4 w-4" />}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{a.candidateName}</div>
                      <div className="text-xs text-muted-foreground">{a.candidateEmail || '—'}</div>
                    </td>
                    <td className="px-4 py-3">{a.jobTitle || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {a.appliedDate ? new Date(a.appliedDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{a.source || '—'}</td>
                    <td className="px-4 py-3">
                      <Badge className={STATUS_COLORS[a.status] || 'bg-slate-100 text-slate-800'}>{a.status}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {a.resume ? (
                        <a href={a.resume} target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:text-emerald-700 text-xs">
                          View
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Bulk delete confirm */}
      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {selected.size} submission{selected.size > 1 ? 's' : ''}?</DialogTitle>
            <DialogDescription>
              This will permanently remove the selected submissions and their associated data. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              You are about to delete <strong>{selected.size}</strong> submission{selected.size > 1 ? 's' : ''}.
              Make sure this is intentional — candidates will need to re-apply if removed.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDeleteOpen(false)} disabled={deleting}>Cancel</Button>
            <Button variant="destructive" onClick={handleBulkDelete} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Delete {selected.size} submission{selected.size > 1 ? 's' : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
