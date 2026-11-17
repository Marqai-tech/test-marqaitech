'use client';

/**
 * Talent Pool — two-tab view:
 *   1. Applicants — all candidates who applied for jobs, with a "Move to Talent Pool"
 *      button on each row (replaces the old small icon in the Recruitment applicants view).
 *   2. Talent Pool Candidates — candidates already saved to the talent pool.
 */
import { useEffect, useState, useCallback, useMemo } from 'react';
import { FiSearch, FiUsers, FiStar, FiMail, FiTrash2, FiPlus, FiClock, FiArrowRight, FiUserPlus } from 'react-icons/fi';
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

interface JobApplicant {
  id: string;
  candidateName: string;
  candidateEmail: string;
  candidatePhone?: string;
  status: string;
  appliedDate?: string;
  expectedSalary?: string;
  source?: string;
  jobPosting?: { id: string; title: string; department?: { name: string } };
  jobPostingId?: string;
}

export default function TalentPoolPage() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'applicants' | 'talent_pool'>('applicants');
  const [candidates, setCandidates] = useState<TalentPoolCandidate[]>([]);
  const [applicants, setApplicants] = useState<JobApplicant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [movingIds, setMovingIds] = useState<Set<string>>(new Set());

  // ── Fetch existing talent pool candidates ──
  const fetchCandidates = useCallback(async () => {
    try {
      const res = await fetch('/api/recruitment/talent-pool', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setCandidates(data.candidates || data.data || []);
      }
    } catch {
      // silent — the Applicants tab is the primary view
    }
  }, []);

  // ── Fetch all job applicants (candidates who applied for jobs) ──
  const fetchApplicants = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/recruitment?limit=100', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        // The API returns { jobPostings: [{ applications: [...] }, ...] }
        // Flatten all applications across all job postings.
        const jobs = data.jobPostings || data.jobs || [];
        const allApps: JobApplicant[] = [];
        for (const job of jobs) {
          const apps = job.applications || [];
          for (const app of apps) {
            allApps.push({
              ...app,
              jobPosting: { id: job.id, title: job.title, department: job.department },
              jobPostingId: job.id,
            });
          }
        }
        setApplicants(allApps);
      }
    } catch {
      toast.error('Failed to load applicants');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      fetchApplicants();
      fetchCandidates();
    });
  }, [fetchApplicants, fetchCandidates]);

  // ── Move an applicant to the talent pool ──
  const handleMoveToTalentPool = async (app: JobApplicant) => {
    setMovingIds(prev => new Set(prev).add(app.id));
    try {
      const res = await fetch('/api/recruitment/talent-pool', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          applicationId: app.id,
          notes: `Moved from job application for "${app.jobPosting?.title || 'Unknown role'}"`,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to move candidate');
      }
      toast.success(`${app.candidateName} moved to Talent Pool`);
      // Refresh talent pool candidates
      fetchCandidates();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to move candidate to talent pool');
    } finally {
      setMovingIds(prev => {
        const next = new Set(prev);
        next.delete(app.id);
        return next;
      });
    }
  };

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

  // ── Filtered lists ──
  const filteredApplicants = useMemo(() => {
    if (!search) return applicants;
    const q = search.toLowerCase();
    return applicants.filter(a =>
      (a.candidateName || '').toLowerCase().includes(q) ||
      (a.candidateEmail || '').toLowerCase().includes(q) ||
      (a.jobPosting?.title || '').toLowerCase().includes(q) ||
      (a.jobPosting?.department?.name || '').toLowerCase().includes(q)
    );
  }, [applicants, search]);

  const filteredCandidates = useMemo(() => {
    if (!search) return candidates;
    const q = search.toLowerCase();
    return candidates.filter(c =>
      (c.candidateName || '').toLowerCase().includes(q) ||
      (c.candidateEmail || '').toLowerCase().includes(q) ||
      (c.skillsSnapshot || '').toLowerCase().includes(q) ||
      (c.jobTitle || '').toLowerCase().includes(q)
    );
  }, [candidates, search]);

  const getInitials = (name: string) =>
    (name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <ModuleDashboardShell
      moduleKey="recruitment"
      moduleLabel="Recruitment"
      title="Talent Pool"
      subtitle="Move applicants to the talent pool for future opportunities"
      tabs={[
        { label: 'Applicants', key: 'applicants', icon: <FiUserPlus className="w-4 h-4" /> },
        { label: 'Talent Pool Candidates', key: 'talent_pool', icon: <FiUsers className="w-4 h-4" /> },
      ]}
    >
      <div className="space-y-6">
        {/* Tab Switcher */}
        <div className="thb-card p-1.5 inline-flex gap-1">
          <button
            onClick={() => setActiveTab('applicants')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'applicants'
                ? 'bg-violet-600 text-white shadow-sm'
                : 'text-thb-text-secondary hover:bg-slate-100'
            }`}
          >
            <FiUserPlus className="w-4 h-4" />
            Applicants ({applicants.length})
          </button>
          <button
            onClick={() => setActiveTab('talent_pool')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'talent_pool'
                ? 'bg-violet-600 text-white shadow-sm'
                : 'text-thb-text-secondary hover:bg-slate-100'
            }`}
          >
            <FiUsers className="w-4 h-4" />
            Talent Pool Candidates ({candidates.length})
          </button>
        </div>

        {/* Search Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-thb-text-primary">
              {activeTab === 'applicants' ? 'Job Applicants' : 'Talent Pool Candidates'}
            </h2>
            <p className="text-sm text-thb-text-secondary mt-1">
              {activeTab === 'applicants'
                ? 'Click "Move to Talent Pool" to save a candidate for future opportunities'
                : `${candidates.length} candidate${candidates.length !== 1 ? 's' : ''} saved for future opportunities`}
            </p>
          </div>
          <div className="relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-thb-text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email, role, or department..."
              className="w-full sm:w-80 pl-10 pr-4 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400"
            />
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* APPLICANTS TAB                                              */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {activeTab === 'applicants' && (
          <div className="thb-card overflow-hidden">
            {loading ? (
              <div className="p-10 text-center text-sm text-thb-text-muted">Loading applicants...</div>
            ) : filteredApplicants.length === 0 ? (
              <div className="p-12 text-center">
                <FiUsers className="w-12 h-12 text-thb-text-muted mx-auto mb-3" />
                <p className="text-thb-text-secondary font-medium">
                  {search ? 'No applicants match your search.' : 'No job applicants yet.'}
                </p>
                <p className="text-sm text-thb-text-muted mt-1">
                  {search ? 'Try a different search term.' : 'Applicants will appear here once candidates apply for jobs.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-thb-border bg-slate-50/50">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Candidate</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Applied Role</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Department</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Status</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Applied</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredApplicants.map((app) => {
                      const isMoving = movingIds.has(app.id);
                      return (
                        <tr key={app.id} className="border-b border-thb-border/50 hover:bg-slate-50/50 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-400 to-cyan-500 flex items-center justify-center text-white text-xs font-bold">
                                {getInitials(app.candidateName)}
                              </div>
                              <div>
                                <p className="text-sm font-medium text-thb-text-primary">{app.candidateName || 'Unknown'}</p>
                                <p className="text-xs text-thb-text-muted">{app.candidateEmail}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-thb-text-secondary">
                            {app.jobPosting?.title || '—'}
                          </td>
                          <td className="px-4 py-3 text-sm text-thb-text-secondary">
                            {app.jobPosting?.department?.name || '—'}
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 capitalize">
                              {app.status || 'applied'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-thb-text-muted whitespace-nowrap">
                            {app.appliedDate ? new Date(app.appliedDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) : '—'}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => handleMoveToTalentPool(app)}
                              disabled={isMoving}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-medium hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              title="Move this candidate to the Talent Pool"
                            >
                              {isMoving ? (
                                <>
                                  <FiClock className="w-3.5 h-3.5 animate-spin" />
                                  Moving...
                                </>
                              ) : (
                                <>
                                  <FiArrowRight className="w-3.5 h-3.5" />
                                  Move to Talent Pool
                                </>
                              )}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* TALENT POOL CANDIDATES TAB                                  */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {activeTab === 'talent_pool' && (
          <div className="thb-card overflow-hidden">
            {loading ? (
              <div className="p-10 text-center text-sm text-thb-text-muted">Loading talent pool...</div>
            ) : filteredCandidates.length === 0 ? (
              <div className="p-12 text-center">
                <FiUsers className="w-12 h-12 text-thb-text-muted mx-auto mb-3" />
                <p className="text-thb-text-secondary font-medium">
                  {search ? 'No candidates match your search.' : 'No candidates in the talent pool yet.'}
                </p>
                <p className="text-sm text-thb-text-muted mt-1">
                  {search ? 'Try a different search term.' : 'Go to the Applicants tab and click "Move to Talent Pool" to add candidates.'}
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
                    {filteredCandidates.map((c) => (
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
        )}
      </div>
    </ModuleDashboardShell>
  );
}
