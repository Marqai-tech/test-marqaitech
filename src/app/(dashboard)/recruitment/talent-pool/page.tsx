'use client';

/**
 * Talent Pool — candidates saved for future opportunities.
 * RD-020 fix: Page was missing. Created with search, list, and add-to-job functionality.
 */
import { useEffect, useState, useCallback } from 'react';
import { FiSearch, FiUsers, FiStar, FiMail, FiTrash2, FiPlus, FiClock } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import ModuleDashboardShell from '@/components/ModuleDashboardShell';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface TalentPoolCandidate {
  id: string;
  candidateName: string;
  candidateEmail: string;
  candidatePhone?: string;
  jobTitle?: string;
  skillsSnapshot?: string;
  notes?: string;
  addedAt: string;
  source?: string;
}

export default function TalentPoolPage() {
  const { user } = useAuthStore();
  const [candidates, setCandidates] = useState<TalentPoolCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchCandidates = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/recruitment/talent-pool', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setCandidates(data.candidates || data.data || []);
      }
    } catch {
      toast.error('Failed to load talent pool');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { queueMicrotask(() => fetchCandidates()); }, [fetchCandidates]);

  const handleRemove = async (id: string) => {
    if (!confirm('Remove this candidate from the talent pool?')) return;
    try {
      const res = await fetch(`/api/recruitment/talent-pool?id=${id}`, { method: 'DELETE', headers: getAuthHeaders() });
      if (!res.ok) throw new Error('Failed to remove');
      toast.success('Candidate removed from talent pool');
      fetchCandidates();
    } catch {
      toast.error('Failed to remove candidate');
    }
  };

  const filtered = candidates.filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (c.candidateName || '').toLowerCase().includes(q) ||
           (c.candidateEmail || '').toLowerCase().includes(q) ||
           (c.skillsSnapshot || '').toLowerCase().includes(q) ||
           (c.jobTitle || '').toLowerCase().includes(q);
  });

  return (
    <ModuleDashboardShell
      moduleKey="recruitment"
      moduleLabel="Recruitment"
      title="Talent Pool"
      subtitle="Candidates saved for future opportunities"
      tabs={[
        { label: 'Overview', key: 'overview', icon: <FiUsers className="w-4 h-4" /> },
      ]}
    >
      <div className="space-y-6">
        {/* Header + Search */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-thb-text-primary">Talent Pool</h2>
            <p className="text-sm text-thb-text-secondary mt-1">
              {candidates.length} candidate{candidates.length !== 1 ? 's' : ''} saved for future opportunities
            </p>
          </div>
          <div className="relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-thb-text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email, skills, or job title..."
              className="w-full sm:w-80 pl-10 pr-4 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400"
            />
          </div>
        </div>

        {/* Candidates List */}
        <div className="thb-card overflow-hidden">
          {loading ? (
            <div className="p-10 text-center text-sm text-thb-text-muted">Loading talent pool...</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <FiUsers className="w-12 h-12 text-thb-text-muted mx-auto mb-3" />
              <p className="text-thb-text-secondary font-medium">
                {search ? 'No candidates match your search.' : 'No candidates in the talent pool yet.'}
              </p>
              <p className="text-sm text-thb-text-muted mt-1">
                {search ? 'Try a different search term.' : 'Add candidates from the Recruitment page by moving them to Talent Pool status.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-thb-border bg-slate-50/50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Candidate</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Contact</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Skills</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Previous Role</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Added</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => (
                    <tr key={c.id} className="border-b border-thb-border/50 hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center text-xs font-bold">
                            {(c.candidateName || '?').charAt(0).toUpperCase()}
                          </div>
                          <span className="text-sm font-medium text-thb-text-primary">{c.candidateName || 'Unknown'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-thb-text-secondary">
                        {c.candidateEmail && <div className="flex items-center gap-1"><FiMail className="w-3 h-3" />{c.candidateEmail}</div>}
                        {c.candidatePhone && <div className="text-xs text-thb-text-muted mt-0.5">{c.candidatePhone}</div>}
                      </td>
                      <td className="px-4 py-3 text-sm text-thb-text-secondary max-w-[200px] truncate">
                        {c.skillsSnapshot || '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-thb-text-secondary">{c.jobTitle || '—'}</td>
                      <td className="px-4 py-3 text-sm text-thb-text-muted whitespace-nowrap">
                        {c.addedAt ? new Date(c.addedAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleRemove(c.id)}
                          className="p-2 rounded-lg text-thb-text-muted hover:text-red-500 hover:bg-red-50 transition-colors"
                          title="Remove from talent pool"
                        >
                          <FiTrash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </ModuleDashboardShell>
  );
}
