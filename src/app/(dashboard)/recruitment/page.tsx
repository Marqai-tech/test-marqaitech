'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiBriefcase,
  FiPlus,
  FiUsers,
  FiClock,
  FiMapPin,
  FiCalendar,
  FiX,
  FiStar,
  FiChevronDown,
  FiChevronUp,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

/* ── Types ── */
interface JobPosting {
  id: string;
  title: string;
  position: string;
  location?: string | null;
  type: string;
  experience?: string | null;
  salary?: string | null;
  description: string;
  requirements?: string | null;
  status: string;
  postedDate: string;
  closingDate?: string | null;
  vacancies: number;
  department?: { id: string; name: string } | null;
  applications?: JobApplication[];
  _count?: { applications: number };
}

interface JobApplication {
  id: string;
  candidateName: string;
  candidateEmail: string;
  candidatePhone?: string | null;
  source: string;
  status: string;
  appliedDate: string;
  rating?: number | null;
  expectedSalary?: string | null;
  notes?: string | null;
  jobPosting?: { id: string; title: string };
  jobPostingId: string;
}

interface Department { id: string; name: string }

/* ── Helpers ── */
function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('nexus_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

function formatDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function getJobStatusBadge(status: string) {
  const map: Record<string, string> = {
    open: 'nexus-badge nexus-badge-success',
    closed: 'nexus-badge nexus-badge-error',
    on_hold: 'nexus-badge nexus-badge-warning',
    filled: 'nexus-badge nexus-badge-info',
  };
  const labels: Record<string, string> = { open: 'Open', closed: 'Closed', on_hold: 'On Hold', filled: 'Filled' };
  return { className: map[status] || 'nexus-badge nexus-badge-info', label: labels[status] || status };
}

function getAppStatusBadge(status: string) {
  const map: Record<string, string> = {
    applied: 'nexus-badge nexus-badge-info',
    screening: 'nexus-badge nexus-badge-warning',
    interview: 'bg-orange-50 text-orange-700 nexus-badge',
    offered: 'nexus-badge nexus-badge-purple',
    hired: 'nexus-badge nexus-badge-success',
    rejected: 'nexus-badge nexus-badge-error',
  };
  const labels: Record<string, string> = { applied: 'Applied', screening: 'Screening', interview: 'Interview', offered: 'Offered', hired: 'Hired', rejected: 'Rejected' };
  return { className: map[status] || 'nexus-badge nexus-badge-info', label: labels[status] || status };
}

const initialJobForm = {
  title: '',
  departmentId: '',
  position: '',
  location: '',
  type: 'full-time',
  experience: '',
  salary: '',
  description: '',
  requirements: '',
  vacancies: '1',
  closingDate: '',
};

const initialAppForm = {
  jobPostingId: '',
  candidateName: '',
  candidateEmail: '',
  candidatePhone: '',
  expectedSalary: '',
  source: 'website',
};

/* ── Component ── */
export default function RecruitmentPage() {
  const { user } = useAuthStore();
  const isAdmin = ['super_admin', 'tenant_admin', 'hr_admin'].includes(user?.role || '');

  const [activeTab, setActiveTab] = useState<'postings' | 'applications'>('postings');
  const [jobPostings, setJobPostings] = useState<JobPosting[]>([]);
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState<Department[]>([]);

  const [showJobModal, setShowJobModal] = useState(false);
  const [jobForm, setJobForm] = useState(initialJobForm);
  const [submittingJob, setSubmittingJob] = useState(false);

  const [showAppModal, setShowAppModal] = useState(false);
  const [appForm, setAppForm] = useState(initialAppForm);
  const [submittingApp, setSubmittingApp] = useState(false);

  const [expandedJob, setExpandedJob] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const headers = getAuthHeaders();
      const [jobsRes] = await Promise.allSettled([
        fetch('/api/recruitment?limit=50', { headers }),
      ]);

      if (jobsRes.status === 'fulfilled' && jobsRes.value.ok) {
        const data = await jobsRes.value.json();
        setJobPostings(data.jobPostings || []);
        // Extract departments
        const deptMap = new Map<string, Department>();
        (data.jobPostings || []).forEach((j: JobPosting) => {
          if (j.department) deptMap.set(j.department.id, j.department);
        });
        setDepartments(Array.from(deptMap.values()));

        // Flatten applications
        const allApps: JobApplication[] = [];
        (data.jobPostings || []).forEach((j: JobPosting) => {
          if (j.applications) {
            j.applications.forEach(a => allApps.push({ ...a, jobPosting: { id: j.id, title: j.title } }));
          }
        });
        setApplications(allApps);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to load recruitment data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { queueMicrotask(() => fetchData()); }, [fetchData]);

  /* Also fetch departments from employees API */
  useEffect(() => {
    queueMicrotask(async () => {
      try {
        const deptRes = await fetch('/api/employees?limit=500', { headers: getAuthHeaders() });
        if (deptRes.ok) {
          const data = await deptRes.json();
          const deptMap = new Map<string, Department>();
          (data.employees || []).forEach((e: { department?: { id: string; name: string } }) => {
            if (e.department) deptMap.set(e.department.id, e.department);
          });
          if (deptMap.size > 0) setDepartments(Array.from(deptMap.values()));
        }
      } catch { /* ignore */ }
    });
  }, []);

  /* Create Job Posting */
  const handleCreateJob = async () => {
    if (!jobForm.title || !jobForm.departmentId || !jobForm.description) {
      toast.error('Please fill in required fields: title, department, description');
      return;
    }
    try {
      setSubmittingJob(true);
      const res = await fetch('/api/recruitment', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ ...jobForm, vacancies: parseInt(jobForm.vacancies) || 1 }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('Job posting created successfully');
      setShowJobModal(false);
      setJobForm(initialJobForm);
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create job posting');
    } finally {
      setSubmittingJob(false);
    }
  };

  /* Submit Application */
  const handleSubmitApp = async () => {
    if (!appForm.candidateName || !appForm.candidateEmail || !appForm.jobPostingId) {
      toast.error('Please fill in required fields');
      return;
    }
    try {
      setSubmittingApp(true);
      // We'll use the recruitment API to create an application
      await fetch('/api/recruitment', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ action: 'apply', ...appForm }),
      });
      toast.success('Application submitted successfully');
      setShowAppModal(false);
      setAppForm(initialAppForm);
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit application');
    } finally {
      setSubmittingApp(false);
    }
  };

  const openApplyModal = (jobId: string) => {
    setAppForm(prev => ({ ...prev, jobPostingId: jobId }));
    setShowAppModal(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-nexus-text-primary flex items-center gap-2">
            <FiBriefcase className="w-6 h-6 text-violet-500" />
            Recruitment
          </h1>
          <p className="text-nexus-text-secondary mt-1">Manage job postings and applications</p>
        </div>
        {isAdmin && (
          <button onClick={() => { setJobForm(initialJobForm); setShowJobModal(true); }} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium text-sm shadow-sm shadow-blue-500/25 transition-colors">
            <FiPlus className="w-4 h-4" />
            Post Job
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-lg w-fit">
        <button onClick={() => setActiveTab('postings')} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'postings' ? 'bg-white text-nexus-text-primary shadow-sm' : 'text-nexus-text-secondary hover:text-nexus-text-primary'}`}>
          Job Postings
        </button>
        <button onClick={() => setActiveTab('applications')} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'applications' ? 'bg-white text-nexus-text-primary shadow-sm' : 'text-nexus-text-secondary hover:text-nexus-text-primary'}`}>
          Applications
        </button>
      </div>

      {/* Job Postings Tab */}
      {activeTab === 'postings' && (
        <div className="space-y-4">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="nexus-card p-6 animate-pulse">
                <div className="h-5 w-48 bg-slate-200 rounded mb-3" />
                <div className="h-3 w-32 bg-slate-200 rounded mb-4" />
                <div className="flex gap-4"><div className="h-3 w-20 bg-slate-200 rounded" /><div className="h-3 w-20 bg-slate-200 rounded" /></div>
              </div>
            ))
          ) : jobPostings.length === 0 ? (
            <div className="text-center py-12 nexus-card">
              <FiBriefcase className="w-12 h-12 text-nexus-text-muted mx-auto mb-3" />
              <p className="text-nexus-text-secondary font-medium">No job postings yet</p>
              <p className="text-sm text-nexus-text-muted mt-1">Create your first job posting to start hiring</p>
            </div>
          ) : (
            jobPostings.map(job => {
              const badge = getJobStatusBadge(job.status);
              const isExpanded = expandedJob === job.id;
              return (
                <div key={job.id} className="nexus-card nexus-card-hover overflow-hidden">
                  <div className="p-6">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 flex-wrap">
                          <h3 className="text-lg font-semibold text-nexus-text-primary">{job.title}</h3>
                          <span className={badge.className}>{badge.label}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-nexus-text-secondary">
                          {job.department && <span className="flex items-center gap-1"><FiUsers className="w-3.5 h-3.5" />{job.department.name}</span>}
                          {job.location && <span className="flex items-center gap-1"><FiMapPin className="w-3.5 h-3.5" />{job.location}</span>}
                          <span className="flex items-center gap-1"><FiClock className="w-3.5 h-3.5" />{job.type}</span>
                          <span className="flex items-center gap-1"><FiUsers className="w-3.5 h-3.5" />{job.vacancies} Vacanc{job.vacancies > 1 ? 'ies' : 'y'}</span>
                          <span className="flex items-center gap-1"><FiCalendar className="w-3.5 h-3.5" />Posted {formatDate(job.postedDate)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button onClick={() => openApplyModal(job.id)} className="px-3 py-2 bg-blue-500 text-white rounded-lg text-xs font-medium hover:bg-blue-600 transition-colors">
                          Apply
                        </button>
                        <button onClick={() => setExpandedJob(isExpanded ? null : job.id)} className="p-2 rounded-lg border border-nexus-border text-nexus-text-secondary hover:bg-slate-50 transition-colors">
                          {isExpanded ? <FiChevronUp className="w-4 h-4" /> : <FiChevronDown className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="border-t border-nexus-border p-6 bg-slate-50/50 space-y-4">
                      <div>
                        <h4 className="text-sm font-semibold text-nexus-text-primary mb-2">Description</h4>
                        <p className="text-sm text-nexus-text-secondary whitespace-pre-wrap">{job.description}</p>
                      </div>
                      {job.requirements && (
                        <div>
                          <h4 className="text-sm font-semibold text-nexus-text-primary mb-2">Requirements</h4>
                          <p className="text-sm text-nexus-text-secondary whitespace-pre-wrap">{job.requirements}</p>
                        </div>
                      )}
                      {(job.experience || job.salary) && (
                        <div className="flex gap-4">
                          {job.experience && <span className="text-sm text-nexus-text-secondary">Experience: <strong>{job.experience}</strong></span>}
                          {job.salary && <span className="text-sm text-nexus-text-secondary">Salary: <strong>{job.salary}</strong></span>}
                        </div>
                      )}
                      {/* Applications for this job */}
                      {job.applications && job.applications.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold text-nexus-text-primary mb-2">Applications ({job.applications.length})</h4>
                          <div className="space-y-2">
                            {job.applications.map(app => {
                              const appBadge = getAppStatusBadge(app.status);
                              return (
                                <div key={app.id} className="flex items-center justify-between p-3 bg-white rounded-lg border border-nexus-border">
                                  <div>
                                    <p className="text-sm font-medium text-nexus-text-primary">{app.candidateName}</p>
                                    <p className="text-xs text-nexus-text-muted">{app.candidateEmail} · Applied {formatDate(app.appliedDate)}</p>
                                  </div>
                                  <span className={appBadge.className}>{appBadge.label}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Applications Tab */}
      {activeTab === 'applications' && (
        <div className="nexus-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-nexus-border bg-slate-50/50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Candidate</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Job Title</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Source</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Applied Date</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Rating</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-nexus-border/50 animate-pulse">
                      <td className="px-4 py-3"><div className="h-3 w-28 bg-slate-200 rounded" /></td>
                      <td className="px-4 py-3"><div className="h-3 w-32 bg-slate-200 rounded" /></td>
                      <td className="px-4 py-3"><div className="h-3 w-16 bg-slate-200 rounded" /></td>
                      <td className="px-4 py-3"><div className="h-5 w-16 bg-slate-200 rounded-full" /></td>
                      <td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded" /></td>
                      <td className="px-4 py-3"><div className="h-3 w-12 bg-slate-200 rounded" /></td>
                    </tr>
                  ))
                ) : applications.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center">
                      <FiUsers className="w-10 h-10 text-nexus-text-muted mx-auto mb-3" />
                      <p className="text-nexus-text-secondary font-medium">No applications yet</p>
                    </td>
                  </tr>
                ) : (
                  applications.map(app => {
                    const badge = getAppStatusBadge(app.status);
                    return (
                      <tr key={app.id} className="border-b border-nexus-border/50 hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-nexus-text-primary">{app.candidateName}</p>
                          <p className="text-xs text-nexus-text-muted">{app.candidateEmail}</p>
                        </td>
                        <td className="px-4 py-3 text-sm text-nexus-text-secondary">{app.jobPosting?.title || '—'}</td>
                        <td className="px-4 py-3 text-sm text-nexus-text-secondary capitalize">{app.source}</td>
                        <td className="px-4 py-3"><span className={badge.className}>{badge.label}</span></td>
                        <td className="px-4 py-3 text-sm text-nexus-text-secondary">{formatDate(app.appliedDate)}</td>
                        <td className="px-4 py-3">
                          {app.rating ? (
                            <span className="flex items-center gap-1 text-amber-500"><FiStar className="w-3.5 h-3.5 fill-amber-500" /><span className="text-sm font-medium">{app.rating}</span></span>
                          ) : '—'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Post Job Modal */}
      {showJobModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto animate-fade-in" onClick={() => setShowJobModal(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full my-8 animate-slide-in-down" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-nexus-border">
              <h2 className="text-lg font-semibold text-nexus-text-primary">Post New Job</h2>
              <button onClick={() => setShowJobModal(false)} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors"><FiX className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Job Title *</label>
                  <input type="text" value={jobForm.title} onChange={e => setJobForm(p => ({ ...p, title: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Department *</label>
                  <select value={jobForm.departmentId} onChange={e => setJobForm(p => ({ ...p, departmentId: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                    <option value="">Select Department</option>
                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Position</label>
                  <input type="text" value={jobForm.position} onChange={e => setJobForm(p => ({ ...p, position: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Location</label>
                  <input type="text" value={jobForm.location} onChange={e => setJobForm(p => ({ ...p, location: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Type</label>
                  <select value={jobForm.type} onChange={e => setJobForm(p => ({ ...p, type: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                    <option value="full-time">Full-time</option>
                    <option value="part-time">Part-time</option>
                    <option value="contract">Contract</option>
                    <option value="internship">Internship</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Experience</label>
                  <input type="text" value={jobForm.experience} onChange={e => setJobForm(p => ({ ...p, experience: e.target.value }))} placeholder="e.g., 3-5 years" className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Salary Range</label>
                  <input type="text" value={jobForm.salary} onChange={e => setJobForm(p => ({ ...p, salary: e.target.value }))} placeholder="e.g., $80K - $120K" className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Vacancies</label>
                  <input type="number" min="1" value={jobForm.vacancies} onChange={e => setJobForm(p => ({ ...p, vacancies: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Closing Date</label>
                  <input type="date" value={jobForm.closingDate} onChange={e => setJobForm(p => ({ ...p, closingDate: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Description *</label>
                <textarea rows={4} value={jobForm.description} onChange={e => setJobForm(p => ({ ...p, description: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Requirements</label>
                <textarea rows={3} value={jobForm.requirements} onChange={e => setJobForm(p => ({ ...p, requirements: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-6 border-t border-nexus-border">
              <button onClick={() => setShowJobModal(false)} className="px-4 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors">Cancel</button>
              <button onClick={handleCreateJob} disabled={submittingJob} className="px-6 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 shadow-sm shadow-blue-500/25 transition-colors">
                {submittingJob ? 'Creating...' : 'Post Job'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Apply Modal */}
      {showAppModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setShowAppModal(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full animate-slide-in-down" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-nexus-border">
              <h2 className="text-lg font-semibold text-nexus-text-primary">Submit Application</h2>
              <button onClick={() => setShowAppModal(false)} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors"><FiX className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Candidate Name *</label>
                <input type="text" value={appForm.candidateName} onChange={e => setAppForm(p => ({ ...p, candidateName: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Email *</label>
                <input type="email" value={appForm.candidateEmail} onChange={e => setAppForm(p => ({ ...p, candidateEmail: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Phone</label>
                <input type="tel" value={appForm.candidatePhone} onChange={e => setAppForm(p => ({ ...p, candidatePhone: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Expected Salary</label>
                <input type="text" value={appForm.expectedSalary} onChange={e => setAppForm(p => ({ ...p, expectedSalary: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Source</label>
                <select value={appForm.source} onChange={e => setAppForm(p => ({ ...p, source: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                  <option value="website">Website</option>
                  <option value="referral">Referral</option>
                  <option value="linkedin">LinkedIn</option>
                  <option value="indeed">Indeed</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-6 border-t border-nexus-border">
              <button onClick={() => setShowAppModal(false)} className="px-4 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors">Cancel</button>
              <button onClick={handleSubmitApp} disabled={submittingApp} className="px-6 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 shadow-sm shadow-blue-500/25 transition-colors">
                {submittingApp ? 'Submitting...' : 'Submit Application'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
