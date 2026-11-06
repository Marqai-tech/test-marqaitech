'use client';

/**
 * Talent Pool module — sidebar entry under RECRUITMENT.
 *
 * Easy-access version:
 *   - Big "+ Add Candidate" button at the top right
 *   - Add modal supports TWO modes:
 *       (a) Pick from existing applications (auto-suggest by name/email)
 *       (b) Enter manually (name + email + skills + notes)
 *   - Full filter bar: search, status, skills, date range
 *   - Card grid with: avatar, name, email, skills, notes, placement
 *     status, source ("Manual" or "From application"), added date
 *
 * Reuses /api/recruitment/talent-pool (GET/POST/DELETE) and
 * /api/recruitment (to load applications for the picker).
 */
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  UsersRound, Plus, Search, RefreshCw, X, AlertTriangle, Loader2,
  Trash2, Briefcase, Mail, Star, Filter, FileText, UserPlus, Calendar,
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

interface TalentPoolEntry {
  id: string;
  candidateEmail: string;
  candidateName: string;
  companyId?: string;
  jobApplicationId?: string;
  skillsSnapshot?: string | null;
  notes?: string | null;
  placedAt?: string | null;
  removedAt?: string | null;
  expiresAt?: string | null;
  createdAt?: string;
}

interface Application {
  id: string;
  candidateName: string;
  candidateEmail: string;
  position?: string;
  jobTitle?: string;
  status: string;
}

type AddMode = 'picker' | 'manual';

const STATUS_FILTERS = [
  { value: 'all', label: 'All statuses' },
  { value: 'active', label: 'Active (in pool)' },
  { value: 'placed', label: 'Placed' },
  { value: 'removed', label: 'Removed' },
];

function parseSkills(s?: string | null): string[] {
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    if (Array.isArray(parsed)) return parsed.map(String).slice(0, 8);
    if (typeof parsed === 'string') return parsed.split(/[,;|]/).map(s => s.trim()).filter(Boolean);
  } catch {
    // Not JSON — treat as comma-separated
    return s.split(/[,;|]/).map(s => s.trim()).filter(Boolean).slice(0, 8);
  }
  return [];
}

function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return iso; }
}

export function TalentPool() {
  const [entries, setEntries] = useState<TalentPoolEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addMode, setAddMode] = useState<AddMode>('picker');
  const [applications, setApplications] = useState<Application[]>([]);
  const [pickerSearch, setPickerSearch] = useState('');
  const [selectedAppId, setSelectedAppId] = useState<string>('');
  const [manualForm, setManualForm] = useState({ candidateName: '', candidateEmail: '', skills: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filter, setFilter] = useState({
    search: '',
    status: 'all',
    skills: '',
    dateFrom: '',
    dateTo: '',
  });

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/recruitment/talent-pool', { headers: getAuthHeaders() });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Failed (${res.status}): ${txt.slice(0, 200)}`);
      }
      const data = await res.json();
      const list = data?.data || data?.entries || data?.talentPool || (Array.isArray(data) ? data : []);
      setEntries(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load talent pool');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchApplications = useCallback(async () => {
    try {
      const res = await fetch('/api/recruitment?limit=200', { headers: getAuthHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      const apps: Application[] = (data?.recentApplications || []).map((a: any) => ({
        id: a.id,
        candidateName: a.candidateName || 'Unknown',
        candidateEmail: a.candidateEmail || '',
        position: a.jobTitle || a.position || '',
        status: a.status || 'applied',
      }));
      setApplications(apps);
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const filtered = useMemo(() => {
    const q = filter.search.trim().toLowerCase();
    const skillsQ = filter.skills.trim().toLowerCase();
    return entries.filter((e) => {
      // Search: name / email / skills / notes
      const matchesSearch = !q ||
        (e.candidateName || '').toLowerCase().includes(q) ||
        (e.candidateEmail || '').toLowerCase().includes(q) ||
        (e.skillsSnapshot || '').toLowerCase().includes(q) ||
        (e.notes || '').toLowerCase().includes(q);
      // Skills filter (candidate must have ALL listed skills)
      const matchesSkills = !skillsQ || (() => {
        const candidateSkills = parseSkills(e.skillsSnapshot).map(s => s.toLowerCase());
        const required = skillsQ.split(/[,;|]/).map(s => s.trim()).filter(Boolean);
        return required.every(req => candidateSkills.some(cs => cs.includes(req)));
      })();
      // Status filter
      const matchesStatus = filter.status === 'all' || (() => {
        if (filter.status === 'placed') return !!e.placedAt;
        if (filter.status === 'removed') return !!e.removedAt;
        if (filter.status === 'active') return !e.placedAt && !e.removedAt;
        return true;
      })();
      // Date range filter (on createdAt)
      let matchesDate = true;
      if (filter.dateFrom) {
        const from = new Date(filter.dateFrom).getTime();
        const created = e.createdAt ? new Date(e.createdAt).getTime() : 0;
        if (created < from) matchesDate = false;
      }
      if (filter.dateTo && matchesDate) {
        const to = new Date(filter.dateTo).getTime() + 86400000;
        const created = e.createdAt ? new Date(e.createdAt).getTime() : 0;
        if (created > to) matchesDate = false;
      }
      return matchesSearch && matchesSkills && matchesStatus && matchesDate;
    });
  }, [entries, filter]);

  // Picker-filtered applications (only show those not yet in talent pool)
  const filteredApps = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    const existingEmails = new Set(entries.map(e => e.candidateEmail.toLowerCase()));
    return applications
      .filter(a => !existingEmails.has(a.candidateEmail.toLowerCase()))
      .filter(a => !q ||
        a.candidateName.toLowerCase().includes(q) ||
        a.candidateEmail.toLowerCase().includes(q) ||
        (a.position || '').toLowerCase().includes(q))
      .slice(0, 20);
  }, [applications, pickerSearch, entries]);

  const stats = useMemo(() => ({
    total: entries.length,
    active: entries.filter(e => !e.placedAt && !e.removedAt).length,
    placed: entries.filter(e => e.placedAt).length,
    removed: entries.filter(e => e.removedAt).length,
    withSkills: entries.filter(e => parseSkills(e.skillsSnapshot).length > 0).length,
    withNotes: entries.filter(e => e.notes).length,
  }), [entries]);

  const handleAdd = async () => {
    setSubmitting(true);
    try {
      let payload: Record<string, unknown>;
      if (addMode === 'picker') {
        if (!selectedAppId) {
          toast.error('Pick a candidate from the list first');
          setSubmitting(false);
          return;
        }
        payload = { applicationId: selectedAppId };
      } else {
        if (!manualForm.candidateName || !manualForm.candidateEmail) {
          toast.error('Name and email are required for manual entry');
          setSubmitting(false);
          return;
        }
        payload = {
          candidateName: manualForm.candidateName,
          candidateEmail: manualForm.candidateEmail,
          skillsSnapshot: manualForm.skills || null,
          notes: manualForm.notes || null,
        };
      }
      const res = await fetch('/api/recruitment/talent-pool', {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      toast.success(`${data.message || 'Added to talent pool'}`);
      setShowAdd(false);
      setManualForm({ candidateName: '', candidateEmail: '', skills: '', notes: '' });
      setSelectedAppId('');
      setPickerSearch('');
      fetchEntries();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to add');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = async (id: string) => {
    if (!confirm('Remove this candidate from the talent pool?')) return;
    try {
      const res = await fetch(`/api/recruitment/talent-pool?id=${encodeURIComponent(id)}`, {
        method: 'DELETE', headers: getAuthHeaders(),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to remove');
      }
      toast.success('Removed from talent pool');
      fetchEntries();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to remove');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <UsersRound className="h-6 w-6 text-emerald-600" /> Talent Pool
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Saved candidates across all job postings. Add candidates manually or pick from existing applications.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchEntries} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          <Button size="sm" onClick={() => { setShowAdd(true); fetchApplications(); }}>
            <Plus className="h-4 w-4 mr-2" /> Add Candidate
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        <StatCard label="Total" value={stats.total} color="text-slate-700" />
        <StatCard label="Active" value={stats.active} color="text-emerald-600" />
        <StatCard label="Placed" value={stats.placed} color="text-blue-600" />
        <StatCard label="Removed" value={stats.removed} color="text-red-600" />
        <StatCard label="With Skills" value={stats.withSkills} color="text-violet-600" />
        <StatCard label="With Notes" value={stats.withNotes} color="text-amber-600" />
      </div>

      {/* Search + filter toggle */}
      <Card>
        <CardContent className="p-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, skills, notes…"
                value={filter.search}
                onChange={(e) => setFilter({ ...filter, search: e.target.value })}
                className="pl-9"
              />
            </div>
            <Button variant="outline" onClick={() => setShowFilters(!showFilters)}>
              <Filter className="h-4 w-4 mr-2" />
              {showFilters ? 'Hide Filters' : 'Show Filters'}
            </Button>
          </div>

          {showFilters && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-3 mt-3 border-t border-border">
              <div>
                <Label className="text-xs">Status</Label>
                <Select value={filter.status} onValueChange={(v) => setFilter({ ...filter, status: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_FILTERS.map(s => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Skills (comma-separated, must have all)</Label>
                <Input
                  placeholder="react, node.js, postgresql"
                  value={filter.skills}
                  onChange={(e) => setFilter({ ...filter, skills: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Added from</Label>
                <Input type="date" value={filter.dateFrom} onChange={(e) => setFilter({ ...filter, dateFrom: e.target.value })} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Added to</Label>
                <Input type="date" value={filter.dateTo} onChange={(e) => setFilter({ ...filter, dateTo: e.target.value })} className="mt-1" />
              </div>
              <div className="md:col-span-4 flex justify-end">
                <Button variant="outline" size="sm" onClick={() => setFilter({
                  search: '', status: 'all', skills: '', dateFrom: '', dateTo: '',
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
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading talent pool…
        </div>
      )}

      {/* Empty */}
      {!loading && !error && filtered.length === 0 && (
        <Card><CardContent className="p-12 text-center">
          <UsersRound className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-medium">{entries.length === 0 ? 'Talent pool is empty' : 'No matching candidates'}</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {entries.length === 0
              ? 'Click "Add Candidate" to add candidates manually or pick from existing applications.'
              : 'Try adjusting your filters.'}
          </p>
        </CardContent></Card>
      )}

      {/* Card grid */}
      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((e) => {
            const skills = parseSkills(e.skillsSnapshot);
            const isPlaced = !!e.placedAt;
            const isRemoved = !!e.removedAt;
            const isManual = !e.jobApplicationId;
            return (
              <Card key={e.id} className={`hover:shadow-md transition-shadow ${isRemoved ? 'opacity-60' : ''}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-base font-semibold shrink-0">
                        {(e.candidateName || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium truncate flex items-center gap-2">
                          {e.candidateName || 'Unknown'}
                          {isManual && (
                            <Badge variant="outline" className="text-[10px] h-4 px-1 bg-blue-50 text-blue-700 border-blue-200">
                              <UserPlus className="h-2.5 w-2.5 mr-0.5" /> Manual
                            </Badge>
                          )}
                          {!isManual && (
                            <Badge variant="outline" className="text-[10px] h-4 px-1 bg-slate-50 text-slate-600 border-slate-200">
                              <FileText className="h-2.5 w-2.5 mr-0.5" /> From application
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground truncate flex items-center gap-1">
                          <Mail className="h-3 w-3" /> {e.candidateEmail || '—'}
                        </div>
                      </div>
                    </div>
                    {!isRemoved && (
                      <button
                        onClick={() => handleRemove(e.id)}
                        className="text-muted-foreground hover:text-red-600 transition-colors p-1"
                        title="Remove from talent pool"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
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
                    </div>
                  )}

                  {/* Notes */}
                  {e.notes && (
                    <div className="mb-3 text-xs rounded-md border border-border bg-muted/30 p-2">
                      <div className="font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">Notes</div>
                      <p className="line-clamp-2">{e.notes}</p>
                    </div>
                  )}

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-3 border-t border-border text-xs">
                    <div className="flex items-center gap-2">
                      {isPlaced ? (
                        <Badge className="bg-blue-100 text-blue-700">
                          <Star className="h-3 w-3 mr-0.5" /> Placed {formatDate(e.placedAt)}
                        </Badge>
                      ) : isRemoved ? (
                        <Badge className="bg-red-100 text-red-700">Removed</Badge>
                      ) : (
                        <Badge className="bg-emerald-100 text-emerald-700">Available</Badge>
                      )}
                    </div>
                    <div className="text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> Added {formatDate(e.createdAt)}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add Candidate modal */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-emerald-600" /> Add Candidate to Talent Pool
            </DialogTitle>
            <DialogDescription>
              Pick from existing applications, or enter candidate details manually.
            </DialogDescription>
          </DialogHeader>

          {/* Mode toggle */}
          <div className="flex gap-2 p-1 rounded-md bg-muted">
            <button
              onClick={() => setAddMode('picker')}
              className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors ${
                addMode === 'picker' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <FileText className="h-4 w-4 inline mr-1.5" /> From Applications
            </button>
            <button
              onClick={() => setAddMode('manual')}
              className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors ${
                addMode === 'manual' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <UserPlus className="h-4 w-4 inline mr-1.5" /> Enter Manually
            </button>
          </div>

          {addMode === 'picker' ? (
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search applications by name, email, position…"
                  value={pickerSearch}
                  onChange={(e) => setPickerSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="max-h-72 overflow-y-auto rounded-md border border-border">
                {filteredApps.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    {applications.length === 0 ? 'Loading applications…' : 'No matching applications (or all candidates are already in the pool).'}
                  </div>
                ) : (
                  filteredApps.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => setSelectedAppId(a.id)}
                      className={`w-full text-left p-3 border-b last:border-0 hover:bg-accent transition-colors flex items-center gap-3 ${
                        selectedAppId === a.id ? 'bg-emerald-50' : ''
                      }`}
                    >
                      <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-semibold shrink-0">
                        {a.candidateName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm truncate">{a.candidateName}</div>
                        <div className="text-xs text-muted-foreground truncate">{a.candidateEmail}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs text-muted-foreground truncate max-w-[140px]">{a.position || '—'}</div>
                        <Badge variant="outline" className="text-[10px] h-4 px-1 mt-0.5">{a.status}</Badge>
                      </div>
                    </button>
                  ))
                )}
              </div>
              {selectedAppId && (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-800">
                  ✓ Selected: {applications.find(a => a.id === selectedAppId)?.candidateName} ({applications.find(a => a.id === selectedAppId)?.candidateEmail})
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Candidate Name <span className="text-red-500">*</span></Label>
                <Input value={manualForm.candidateName} onChange={(e) => setManualForm({ ...manualForm, candidateName: e.target.value })} placeholder="Rahul Sharma" />
              </div>
              <div>
                <Label>Candidate Email <span className="text-red-500">*</span></Label>
                <Input type="email" value={manualForm.candidateEmail} onChange={(e) => setManualForm({ ...manualForm, candidateEmail: e.target.value })} placeholder="rahul@example.com" />
              </div>
              <div className="md:col-span-2">
                <Label>Skills (comma-separated)</Label>
                <Input value={manualForm.skills} onChange={(e) => setManualForm({ ...manualForm, skills: e.target.value })} placeholder="React, Node.js, PostgreSQL" />
              </div>
              <div className="md:col-span-2">
                <Label>Notes</Label>
                <textarea
                  className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="Why are you saving this candidate? (e.g. strong React skills, good culture fit, available immediately)"
                  value={manualForm.notes}
                  onChange={(e) => setManualForm({ ...manualForm, notes: e.target.value })}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)} disabled={submitting}>Cancel</Button>
            <Button onClick={handleAdd} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              Add to Pool
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Card><CardContent className="p-3">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">{label}</div>
    </CardContent></Card>
  );
}
