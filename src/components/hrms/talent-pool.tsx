'use client';

/**
 * Talent Pool module — sidebar entry under RECRUITMENT.
 *
 * Reuses the existing /api/recruitment/talent-pool endpoint (which is
 * already wired to the CandidateTalentPool Prisma model). Provides a
 * clean searchable list of saved candidates, with:
 *   - Search by name / email / skills
 *   - Filter by job category
 *   - Add to talent pool from a job application
 *   - Remove from talent pool
 *   - Notes + placement status
 *
 * This is a v1 scaffold — a full Kanban of "Sourced / Contacted / In
 * Process / Placed / Rejected" can be added in a follow-up iteration
 * without changing the API contract.
 */
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { UsersRound, Plus, Search, RefreshCw, X, AlertTriangle, Loader2, Trash2, Briefcase, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  skillsSnapshot?: string;
  notes?: string;
  placedAt?: string;
  removedAt?: string | null;
  expiresAt?: string | null;
}

export function TalentPool() {
  const [entries, setEntries] = useState<TalentPoolEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ candidateEmail: '', candidateName: '', skillsSnapshot: '', notes: '', jobApplicationId: '' });
  const [submitting, setSubmitting] = useState(false);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/recruitment/talent-pool', { headers: getAuthHeaders() });
      if (!res.ok) {
        // Try alternate response shape — some endpoints return {data:[...]} on success
        const txt = await res.text();
        throw new Error(`Failed (${res.status}): ${txt.slice(0, 200)}`);
      }
      const data = await res.json();
      const list: TalentPoolEntry[] = data?.data || data?.entries || data || [];
      setEntries(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load talent pool');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) =>
      (e.candidateName || '').toLowerCase().includes(q) ||
      (e.candidateEmail || '').toLowerCase().includes(q) ||
      (e.skillsSnapshot || '').toLowerCase().includes(q) ||
      (e.notes || '').toLowerCase().includes(q)
    );
  }, [entries, search]);

  const handleAdd = async () => {
    if (!addForm.candidateEmail || !addForm.candidateName) {
      toast.error('Name and email are required');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/recruitment/talent-pool', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(addForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add to talent pool');
      toast.success('Added to talent pool');
      setShowAdd(false);
      setAddForm({ candidateEmail: '', candidateName: '', skillsSnapshot: '', notes: '', jobApplicationId: '' });
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
        method: 'DELETE',
        headers: getAuthHeaders(),
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
            Saved candidates across all job applications — your private shortlist.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchEntries} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4 mr-2" /> Add Candidate
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Total Candidates</div><div className="text-2xl font-bold mt-1">{entries.length}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Placed</div><div className="text-2xl font-bold mt-1 text-emerald-600">{entries.filter(e => e.placedAt).length}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">With Skills</div><div className="text-2xl font-bold mt-1 text-blue-600">{entries.filter(e => e.skillsSnapshot).length}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">With Notes</div><div className="text-2xl font-bold mt-1 text-purple-600">{entries.filter(e => e.notes).length}</div></CardContent></Card>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, skills, notes…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
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
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading talent pool…
        </div>
      )}

      {/* Empty */}
      {!loading && !error && filtered.length === 0 && (
        <Card><CardContent className="p-12 text-center">
          <UsersRound className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-medium">{search ? 'No matching candidates' : 'Talent pool is empty'}</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {search ? 'Try a different search term.' : 'Add candidates from the Recruitment page or use the Add Candidate button.'}
          </p>
        </CardContent></Card>
      )}

      {/* List */}
      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((e) => (
            <Card key={e.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-sm font-semibold shrink-0">
                      {(e.candidateName || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium truncate">{e.candidateName || 'Unknown'}</div>
                      <div className="text-xs text-muted-foreground truncate flex items-center gap-1">
                        <Mail className="h-3 w-3" /> {e.candidateEmail || '—'}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemove(e.id)}
                    className="text-muted-foreground hover:text-red-600 transition-colors"
                    title="Remove from talent pool"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {e.skillsSnapshot && (
                  <div className="mt-3">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Skills</div>
                    <div className="flex flex-wrap gap-1">
                      {e.skillsSnapshot.split(/[,;|]/).map((s, idx) => (
                        s.trim() && <Badge key={idx} variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">{s.trim()}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {e.notes && (
                  <div className="mt-3">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Notes</div>
                    <p className="text-sm text-muted-foreground line-clamp-2">{e.notes}</p>
                  </div>
                )}

                <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Briefcase className="h-3 w-3" />
                    {e.placedAt ? `Placed ${new Date(e.placedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : 'Available'}
                  </span>
                  {e.jobApplicationId && <Badge variant="outline">Linked application</Badge>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add modal */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Candidate to Talent Pool</DialogTitle>
            <DialogDescription>
              Save a candidate for future openings. You can link them to an existing application or keep them as a standalone contact.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Candidate Name <span className="text-red-500">*</span></Label>
              <Input value={addForm.candidateName} onChange={(e) => setAddForm({ ...addForm, candidateName: e.target.value })} />
            </div>
            <div>
              <Label>Candidate Email <span className="text-red-500">*</span></Label>
              <Input type="email" value={addForm.candidateEmail} onChange={(e) => setAddForm({ ...addForm, candidateEmail: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <Label>Skills (comma-separated)</Label>
              <Input placeholder="React, Node.js, PostgreSQL" value={addForm.skillsSnapshot} onChange={(e) => setAddForm({ ...addForm, skillsSnapshot: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <Label>Notes</Label>
              <textarea
                className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="Why are you saving this candidate?"
                value={addForm.notes}
                onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })}
              />
            </div>
            <div className="md:col-span-2">
              <Label>Linked Job Application ID (optional)</Label>
              <Input placeholder="ja-..." value={addForm.jobApplicationId} onChange={(e) => setAddForm({ ...addForm, jobApplicationId: e.target.value })} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)} disabled={submitting}>Cancel</Button>
            <Button onClick={handleAdd} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Add to Pool
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
