'use client';

/**
 * Schedule Interview module — sidebar entry under RECRUITMENT.
 *
 * Shows a clean list of upcoming + past interviews with the new dynamic
 * Round N badge. Reuses the existing /api/interviews endpoint — no new
 * API required.
 *
 * Round numbering is computed server-side (MAX(round) + 1 per candidate),
 * so the badge rendered here reflects the real round sequence.
 *
 * The new "prevent double-booking" guard on /api/interviews POST will
 * return HTTP 409 with code ACTIVE_INTERVIEW_EXISTS if HR tries to
 * schedule a new interview while a previous one is still active. We
 * surface that error inline in the schedule modal.
 */
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { CalendarClock, Plus, Search, RefreshCw, X, AlertTriangle, Loader2, MapPin, Video, Clock, User, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

const TYPE_LABELS: Record<string, string> = {
  ai: 'AI Interview',
  technical: 'Technical',
  hr: 'HR',
  offline_panel: 'Panel',
};

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-800',
  rescheduled: 'bg-amber-100 text-amber-800',
  completed: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-red-100 text-red-800',
  no_show: 'bg-slate-100 text-slate-800',
};

interface Interview {
  id: string;
  jobApplicationId: string;
  type: string;
  date: string;
  time?: string;
  duration?: number;
  location?: string;
  meetingUrl?: string;
  status: string;
  round?: number;
  candidateName?: string;
  candidateEmail?: string;
  jobTitle?: string;
  panelMembers?: Array<{ id: string; name: string; email: string; designation?: string; confirmationStatus?: string; hasFeedback?: boolean }>;
}

interface ScheduleForm {
  jobApplicationId: string;
  type: string;
  date: string;
  time: string;
  duration: number;
  location: string;
  meetingUrl: string;
}

const emptyForm: ScheduleForm = {
  jobApplicationId: '',
  type: 'technical',
  date: '',
  time: '',
  duration: 60,
  location: '',
  meetingUrl: '',
};

export function ScheduleInterview() {
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState({ search: '', status: 'all', type: 'all' });
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<ScheduleForm>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchInterviews = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/interviews?limit=200', { headers: getAuthHeaders() });
      if (!res.ok) throw new Error('Failed to load interviews');
      const data = await res.json();
      const list: Interview[] = data?.data || data || [];
      list.sort((a, b) => {
        const da = new Date(`${a.date}T${a.time || '00:00'}`).getTime();
        const db = new Date(`${b.date}T${b.time || '00:00'}`).getTime();
        return db - da;
      });
      setInterviews(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load interviews');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchInterviews(); }, [fetchInterviews]);

  const filtered = useMemo(() => {
    return interviews.filter((i) => {
      const q = filter.search.trim().toLowerCase();
      const matches = !q ||
        (i.candidateName || '').toLowerCase().includes(q) ||
        (i.candidateEmail || '').toLowerCase().includes(q) ||
        (i.jobTitle || '').toLowerCase().includes(q) ||
        (i.type || '').toLowerCase().includes(q);
      const statusOk = filter.status === 'all' || i.status === filter.status;
      const typeOk = filter.type === 'all' || i.type === filter.type;
      return matches && statusOk && typeOk;
    });
  }, [interviews, filter]);

  // Group by upcoming / past
  const now = Date.now();
  const upcoming = filtered.filter((i) => {
    const t = new Date(`${i.date}T${i.time || '00:00'}`).getTime();
    return t >= now && (i.status === 'scheduled' || i.status === 'rescheduled');
  });
  const past = filtered.filter((i) => !upcoming.includes(i));

  const handleSubmit = async () => {
    setFormError(null);
    if (!form.jobApplicationId || !form.date) {
      setFormError('Application ID and date are required');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/interviews', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          jobApplicationId: form.jobApplicationId,
          type: form.type,
          date: form.date,
          time: form.time || undefined,
          duration: Number(form.duration) || 60,
          location: form.location || undefined,
          meetingUrl: form.meetingUrl || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Surface the new ACTIVE_INTERVIEW_EXISTS guard message
        if (data?.code === 'ACTIVE_INTERVIEW_EXISTS' || res.status === 409) {
          throw new Error(data.error || 'Candidate already has an active interview. Cancel or complete it first.');
        }
        throw new Error(data.error || 'Failed to schedule interview');
      }
      const round = data?.round;
      toast.success(round && round > 1 ? `Interview scheduled — Round ${round}` : 'Interview scheduled — Round 1');
      setShowModal(false);
      setForm(emptyForm);
      fetchInterviews();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to schedule interview');
    } finally {
      setSubmitting(false);
    }
  };

  const roundBadge = (round?: number) => {
    if (!round || round <= 1) return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Round 1</Badge>;
    return <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100">Round {round}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <CalendarClock className="h-6 w-6 text-emerald-600" /> Schedule Interview
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Round numbers are computed automatically — Round 1, Round 2, Round 3…
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchInterviews} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          <Button size="sm" onClick={() => { setForm(emptyForm); setFormError(null); setShowModal(true); }}>
            <Plus className="h-4 w-4 mr-2" /> Schedule Interview
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Total</div><div className="text-2xl font-bold mt-1">{interviews.length}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Upcoming</div><div className="text-2xl font-bold mt-1 text-blue-600">{upcoming.length}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Completed</div><div className="text-2xl font-bold mt-1 text-emerald-600">{interviews.filter(i => i.status === 'completed').length}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Cancelled</div><div className="text-2xl font-bold mt-1 text-red-600">{interviews.filter(i => i.status === 'cancelled').length}</div></CardContent></Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search candidate, role, type…"
                value={filter.search}
                onChange={(e) => setFilter({ ...filter, search: e.target.value })}
                className="pl-9"
              />
            </div>
            <Select value={filter.status} onValueChange={(v) => setFilter({ ...filter, status: v })}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="scheduled">Scheduled</SelectItem>
                <SelectItem value="rescheduled">Rescheduled</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="no_show">No-show</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filter.type} onValueChange={(v) => setFilter({ ...filter, type: v })}>
              <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="technical">Technical</SelectItem>
                <SelectItem value="hr">HR</SelectItem>
                <SelectItem value="ai">AI Interview</SelectItem>
                <SelectItem value="offline_panel">Panel</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Error banner */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 flex items-start gap-2">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <div>{error}</div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading interviews…
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && filtered.length === 0 && (
        <Card><CardContent className="p-12 text-center">
          <CalendarClock className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-medium">No interviews found</h3>
          <p className="text-sm text-muted-foreground mt-1">Try adjusting filters, or schedule a new interview.</p>
        </CardContent></Card>
      )}

      {/* Upcoming */}
      {!loading && upcoming.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Upcoming ({upcoming.length})</h2>
          <div className="space-y-2">
            {upcoming.map((i) => <InterviewRow key={i.id} i={i} roundBadge={roundBadge} />)}
          </div>
        </div>
      )}

      {/* Past */}
      {!loading && past.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Past ({past.length})</h2>
          <div className="space-y-2">
            {past.map((i) => <InterviewRow key={i.id} i={i} roundBadge={roundBadge} />)}
          </div>
        </div>
      )}

      {/* Schedule modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Schedule New Interview</DialogTitle>
            <DialogDescription>
              Round will be auto-computed (MAX existing round + 1). The system blocks scheduling if the candidate already has an active interview.
            </DialogDescription>
          </DialogHeader>

          {formError && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>{formError}</div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <Label>Application ID <span className="text-red-500">*</span></Label>
              <Input
                placeholder="e.g. ja-1730123..."
                value={form.jobApplicationId}
                onChange={(e) => setForm({ ...form, jobApplicationId: e.target.value })}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Find this in the Recruitment → Candidates list, or copy the application ID from the URL bar.
              </p>
            </div>
            <div>
              <Label>Interview Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="technical">Technical</SelectItem>
                  <SelectItem value="hr">HR</SelectItem>
                  <SelectItem value="ai">AI Interview</SelectItem>
                  <SelectItem value="offline_panel">Panel (Offline)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Date <span className="text-red-500">*</span></Label>
              <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div>
              <Label>Time</Label>
              <Input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
            </div>
            <div>
              <Label>Duration (minutes)</Label>
              <Input
                type="number"
                value={form.duration}
                onChange={(e) => setForm({ ...form, duration: Number(e.target.value) || 60 })}
              />
            </div>
            <div>
              <Label>Location (offline)</Label>
              <Input placeholder="Conference Room A" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </div>
            <div>
              <Label>Meeting URL (online)</Label>
              <Input placeholder="https://meet.google.com/..." value={form.meetingUrl} onChange={(e) => setForm({ ...form, meetingUrl: e.target.value })} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)} disabled={submitting}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InterviewRow({ i, roundBadge }: { i: Interview; roundBadge: (r?: number) => React.ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const dateStr = i.date ? new Date(i.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'TBD';
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-sm font-semibold">
              {(i.candidateName || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
            </div>
            <div>
              <div className="font-medium flex items-center gap-2 flex-wrap">
                {i.candidateName || 'Unknown candidate'}
                {roundBadge(i.round)}
                <Badge variant="outline">{TYPE_LABELS[i.type] || i.type}</Badge>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-3 flex-wrap">
                <span className="flex items-center gap-1"><User className="h-3 w-3" /> {i.candidateEmail || '—'}</span>
                <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {dateStr}{i.time ? ` · ${i.time}` : ''}</span>
                {i.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {i.location}</span>}
                {i.meetingUrl && <span className="flex items-center gap-1"><Video className="h-3 w-3" /> Online</span>}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">{i.jobTitle || 'Position TBD'}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={STATUS_COLORS[i.status] || 'bg-slate-100 text-slate-800'}>{i.status}</Badge>
            {i.panelMembers && i.panelMembers.length > 0 && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-xs text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
              >
                {i.panelMembers.length} panelist{i.panelMembers.length > 1 ? 's' : ''}
                <ChevronRight className={`h-3 w-3 transition-transform ${expanded ? 'rotate-90' : ''}`} />
              </button>
            )}
          </div>
        </div>

        {expanded && i.panelMembers && i.panelMembers.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Panel Members</div>
            <div className="space-y-1">
              {i.panelMembers.map((pm) => (
                <div key={pm.id} className="flex items-center justify-between text-sm">
                  <div>
                    <span className="font-medium">{pm.name}</span>
                    <span className="text-muted-foreground ml-2">· {pm.designation || '—'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={
                      pm.confirmationStatus === 'accepted' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                      pm.confirmationStatus === 'declined' ? 'bg-red-50 text-red-700 border-red-200' :
                      'bg-amber-50 text-amber-700 border-amber-200'
                    }>
                      {pm.confirmationStatus || 'pending'}
                    </Badge>
                    {pm.hasFeedback && <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Feedback given</Badge>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
