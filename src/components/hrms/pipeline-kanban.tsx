'use client';

/**
 * Pipeline Kanban — sidebar entry under RECRUITMENT.
 *
 * Replaces the dropdown-style "Change Hiring Stage" UX with a visual
 * drag-and-drop Kanban board. Stages (columns) come from the tenant's
 * recruitment workflow config; candidate cards are pulled from
 * /api/recruitment's recentApplications list.
 *
 * Stage change uses the existing PATCH /api/recruitment/[id] endpoint
 * with body { status: 'new-stage' }. Server-side validation enforces
 * valid transitions (e.g. can't jump from 'applied' to 'offered').
 *
 * Drag-and-drop uses native HTML5 DnD — no extra dependencies. Touch
 * devices fall back to a click-then-pick-stage dropdown on each card.
 */
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  KanbanSquare, RefreshCw, AlertTriangle, Loader2, Search, ChevronDown, ChevronUp, User, Clock, Mail, Briefcase,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface PipelineStage {
  key: string;
  label: string;
  color?: string;
  slaDays?: number | null;
  enabled?: boolean;
}

interface Application {
  id: string;
  candidateName: string;
  candidateEmail: string;
  status: string;
  appliedDate?: string;
  jobTitle?: string;
  jobPostingId?: string;
  source?: string;
  rating?: number | null;
  resume?: string | null;
}

// Tailwind color tokens for the column header — keyed by stage.color from workflow config
const COLUMN_COLORS: Record<string, { header: string; bar: string; ring: string; chip: string }> = {
  slate:  { header: 'bg-slate-100 text-slate-700',   bar: 'bg-slate-400',   ring: 'ring-slate-300',   chip: 'bg-slate-100 text-slate-700' },
  blue:   { header: 'bg-blue-100 text-blue-700',      bar: 'bg-blue-500',    ring: 'ring-blue-300',    chip: 'bg-blue-100 text-blue-700' },
  amber:  { header: 'bg-amber-100 text-amber-700',   bar: 'bg-amber-500',   ring: 'ring-amber-300',   chip: 'bg-amber-100 text-amber-700' },
  violet: { header: 'bg-violet-100 text-violet-700', bar: 'bg-violet-500',  ring: 'ring-violet-300',  chip: 'bg-violet-100 text-violet-700' },
  green:  { header: 'bg-emerald-100 text-emerald-700', bar: 'bg-emerald-500', ring: 'ring-emerald-300', chip: 'bg-emerald-100 text-emerald-700' },
  red:    { header: 'bg-red-100 text-red-700',       bar: 'bg-red-500',     ring: 'ring-red-300',     chip: 'bg-red-100 text-red-700' },
  cyan:   { header: 'bg-cyan-100 text-cyan-700',     bar: 'bg-cyan-500',    ring: 'ring-cyan-300',    chip: 'bg-cyan-100 text-cyan-700' },
};

const colorFor = (key?: string) => COLUMN_COLORS[key || 'slate'] || COLUMN_COLORS.slate;

export function PipelineKanban() {
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [jobFilter, setJobFilter] = useState<string>('all');
  const [jobs, setJobs] = useState<Array<{ id: string; title: string }>>([]);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [movingIds, setMovingIds] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/recruitment?limit=500', { headers: getAuthHeaders() });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const data = await res.json();
      const stageList: PipelineStage[] = (data?.workflowStages || [])
        .filter((s: PipelineStage) => s.enabled !== false);
      setStages(stageList);
      const jobList = (data?.jobPostings || []).map((j: any) => ({ id: j.id, title: j.title }));
      setJobs(jobList);
      const appList: Application[] = (data?.recentApplications || []).map((a: any) => ({
        id: a.id,
        candidateName: a.candidateName || 'Unknown',
        candidateEmail: a.candidateEmail || '',
        status: a.status || 'applied',
        appliedDate: a.appliedDate || a.createdAt,
        jobTitle: a.jobTitle || '',
        jobPostingId: a.jobPostingId || '',
        source: a.source || '',
        rating: a.rating ?? null,
        resume: a.resume || null,
      }));
      setApps(appList);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load pipeline');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Group apps by status, but only for enabled stages. Apps with status
  // not in any stage column (e.g. 'withdrawn', 'talent_pool') are shown
  // in a catch-all "Other" column at the end.
  const grouped = useMemo(() => {
    const map: Record<string, Application[]> = {};
    for (const s of stages) map[s.key] = [];
    const others: Application[] = [];
    for (const a of apps) {
      if (search) {
        const q = search.toLowerCase();
        if (!a.candidateName.toLowerCase().includes(q) &&
            !a.candidateEmail.toLowerCase().includes(q) &&
            !(a.jobTitle || '').toLowerCase().includes(q)) continue;
      }
      if (jobFilter !== 'all' && a.jobPostingId !== jobFilter) continue;
      if (map[a.status]) map[a.status].push(a);
      else others.push(a);
    }
    return { map, others };
  }, [apps, stages, search, jobFilter]);

  const totalVisible = useMemo(() => {
    return Object.values(grouped.map).reduce((sum, arr) => sum + arr.length, 0) + grouped.others.length;
  }, [grouped]);

  const moveCard = useCallback(async (appId: string, newStatus: string) => {
    const app = apps.find((a) => a.id === appId);
    if (!app) return;
    if (app.status === newStatus) return; // no-op

    // Optimistic update — move the card immediately for snappy UX
    setApps((prev) => prev.map((a) => (a.id === appId ? { ...a, status: newStatus } : a)));
    setMovingIds((s) => new Set(s).add(appId));

    try {
      const res = await fetch(`/api/recruitment/${appId}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Revert optimistic update on failure
        setApps((prev) => prev.map((a) => (a.id === appId ? { ...a, status: app.status } : a)));
        throw new Error(data?.error || `Failed (${res.status})`);
      }
      toast.success(`${app.candidateName} → ${newStatus}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to move candidate');
    } finally {
      setMovingIds((s) => {
        const next = new Set(s);
        next.delete(appId);
        return next;
      });
    }
  }, [apps]);

  const onDragStart = (e: React.DragEvent, appId: string) => {
    setDraggedId(appId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', appId);
  };

  const onDragEnd = () => {
    setDraggedId(null);
    setDragOverStage(null);
  };

  const onDragOver = (e: React.DragEvent, stageKey: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverStage !== stageKey) setDragOverStage(stageKey);
  };

  const onDrop = (e: React.DragEvent, stageKey: string) => {
    e.preventDefault();
    const appId = e.dataTransfer.getData('text/plain') || draggedId;
    if (appId) moveCard(appId, stageKey);
    setDraggedId(null);
    setDragOverStage(null);
  };

  const toggleCollapse = (stageKey: string) => {
    setCollapsed((s) => {
      const next = new Set(s);
      if (next.has(stageKey)) next.delete(stageKey);
      else next.add(stageKey);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <KanbanSquare className="h-6 w-6 text-emerald-600" /> Pipeline Kanban
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Drag candidate cards between stages. Stage changes call PATCH /api/recruitment/[id] and notify the candidate by email.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Total Candidates</div><div className="text-2xl font-bold mt-1">{totalVisible}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Stages</div><div className="text-2xl font-bold mt-1">{stages.length}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">In Interview</div><div className="text-2xl font-bold mt-1 text-amber-600">{(grouped.map['interview'] || []).length}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Hired</div><div className="text-2xl font-bold mt-1 text-emerald-600">{(grouped.map['hired'] || []).length}</div></CardContent></Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="relative md:col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search candidates, emails, roles…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={jobFilter} onValueChange={setJobFilter}>
              <SelectTrigger><SelectValue placeholder="All jobs" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All jobs</SelectItem>
                {jobs.map((j) => (
                  <SelectItem key={j.id} value={j.id}>{j.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading pipeline…
        </div>
      )}

      {/* Empty */}
      {!loading && !error && totalVisible === 0 && (
        <Card><CardContent className="p-12 text-center">
          <KanbanSquare className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-medium">No candidates in pipeline</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Once candidates apply to your job postings, they will appear here as Kanban cards.
          </p>
        </CardContent></Card>
      )}

      {/* Kanban board */}
      {!loading && !error && totalVisible > 0 && (
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-3 min-w-max">
            {stages.map((stage) => {
              const cards = grouped.map[stage.key] || [];
              const colors = colorFor(stage.color);
              const isCollapsed = collapsed.has(stage.key);
              const isDropTarget = dragOverStage === stage.key;
              return (
                <div
                  key={stage.key}
                  className={`w-72 shrink-0 rounded-lg border bg-card transition-all ${isDropTarget ? `ring-2 ${colors.ring} border-transparent` : 'border-border'}`}
                  onDragOver={(e) => onDragOver(e, stage.key)}
                  onDragLeave={() => setDragOverStage(null)}
                  onDrop={(e) => onDrop(e, stage.key)}
                >
                  {/* Column header */}
                  <div className={`px-3 py-2.5 rounded-t-lg flex items-center justify-between ${colors.header}`}>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleCollapse(stage.key)}
                        className="hover:bg-black/5 rounded p-0.5"
                        title={isCollapsed ? 'Expand' : 'Collapse'}
                      >
                        {isCollapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
                      </button>
                      <span className="font-semibold text-sm">{stage.label}</span>
                      {stage.slaDays && (
                        <Badge variant="outline" className={`text-[10px] h-4 px-1 ${colors.chip} border-transparent`}>
                          SLA {stage.slaDays}d
                        </Badge>
                      )}
                    </div>
                    <Badge variant="secondary" className="text-xs">{cards.length}</Badge>
                  </div>

                  {/* Top color bar */}
                  <div className={`h-1 ${colors.bar}`} />

                  {/* Cards */}
                  {!isCollapsed && (
                    <div className="p-2 space-y-2 max-h-[calc(100vh-22rem)] overflow-y-auto">
                      {cards.length === 0 && (
                        <div className="text-center py-6 text-xs text-muted-foreground">
                          Drop candidates here
                        </div>
                      )}
                      {cards.map((a) => (
                        <PipelineCard
                          key={a.id}
                          app={a}
                          isDragging={draggedId === a.id}
                          isMoving={movingIds.has(a.id)}
                          onDragStart={(e) => onDragStart(e, a.id)}
                          onDragEnd={onDragEnd}
                          onMove={(newStatus) => moveCard(a.id, newStatus)}
                          stages={stages}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* "Other" column for statuses not in any stage */}
            {grouped.others.length > 0 && (
              <div className="w-72 shrink-0 rounded-lg border border-dashed border-border bg-muted/30">
                <div className="px-3 py-2.5 rounded-t-lg flex items-center justify-between bg-muted text-muted-foreground">
                  <span className="font-semibold text-sm">Other</span>
                  <Badge variant="secondary" className="text-xs">{grouped.others.length}</Badge>
                </div>
                <div className="p-2 space-y-2 max-h-[calc(100vh-22rem)] overflow-y-auto">
                  {grouped.others.map((a) => (
                    <PipelineCard
                      key={a.id}
                      app={a}
                      isDragging={draggedId === a.id}
                      isMoving={movingIds.has(a.id)}
                      onDragStart={(e) => onDragStart(e, a.id)}
                      onDragEnd={onDragEnd}
                      onMove={(newStatus) => moveCard(a.id, newStatus)}
                      stages={stages}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface PipelineCardProps {
  app: Application;
  isDragging: boolean;
  isMoving: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onMove: (newStatus: string) => void;
  stages: PipelineStage[];
}

function PipelineCard({ app, isDragging, isMoving, onDragStart, onDragEnd, onMove, stages }: PipelineCardProps) {
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const dateStr = app.appliedDate
    ? new Date(app.appliedDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    : '';
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`bg-background border border-border rounded-md p-2.5 cursor-grab active:cursor-grabbing transition-all hover:shadow-sm ${isDragging ? 'opacity-40 rotate-1' : ''} ${isMoving ? 'animate-pulse' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-semibold shrink-0">
            {(app.candidateName || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="font-medium text-sm truncate">{app.candidateName}</div>
            {app.candidateEmail && (
              <div className="text-[10px] text-muted-foreground truncate flex items-center gap-0.5">
                <Mail className="h-2.5 w-2.5" /> {app.candidateEmail}
              </div>
            )}
          </div>
        </div>
        {app.rating != null && app.rating > 0 && (
          <Badge variant="outline" className="text-[10px] h-4 px-1 shrink-0">★ {app.rating}</Badge>
        )}
      </div>

      {app.jobTitle && (
        <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1">
          <Briefcase className="h-3 w-3" /> {app.jobTitle}
        </div>
      )}

      <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Clock className="h-2.5 w-2.5" /> {dateStr || '—'}
        </span>
        {app.source && <span>{app.source}</span>}
      </div>

      {/* Mobile / fallback: click-to-move menu */}
      <div className="mt-2 relative">
        <button
          onClick={() => setShowMoveMenu(!showMoveMenu)}
          className="text-[10px] text-emerald-600 hover:text-emerald-700 flex items-center gap-0.5"
        >
          Move to <ChevronDown className="h-2.5 w-2.5" />
        </button>
        {showMoveMenu && (
          <div className="absolute top-full left-0 mt-1 z-10 bg-background border border-border rounded-md shadow-lg p-1 min-w-[140px]">
            {stages.map((s) => (
              <button
                key={s.key}
                onClick={() => {
                  setShowMoveMenu(false);
                  onMove(s.key);
                }}
                disabled={s.key === app.status}
                className="w-full text-left text-xs px-2 py-1 rounded hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {s.label}{s.key === app.status ? ' (current)' : ''}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
