'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  FiSearch, FiMapPin, FiBriefcase, FiStar, FiBookmark,
  FiClock, FiGlobe, FiArrowRight, FiZap, FiUsers, FiCalendar,
  FiDollarSign, FiPlus, FiX, FiEye, FiEdit2, FiTrash2,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import ModuleTips from '@/components/ModuleTips';
import ModuleWorkflow from '@/components/ModuleWorkflow';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

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
  applications?: { id: string; candidateName: string; status: string }[];
  _count?: { applications: number };
}

const jobPortalTips = [
  { title: 'Career Page Branding', description: 'Customize your public career page with company branding, culture highlights, and employee testimonials.' },
  { title: 'SEO Optimization', description: 'Optimize job postings with relevant keywords and structured data to improve visibility on search engines.' },
  { title: 'Application Forms', description: 'Design application forms that balance collecting essential information with a smooth candidate experience.' },
  { title: 'Auto-Screening', description: 'Set up automated screening rules based on qualifications, experience, and skills to shortlist faster.' },
  { title: 'Candidate Experience', description: 'Ensure timely updates and transparent communication throughout the application and interview process.' },
];

const jobPortalWorkflowSteps = [
  { step: 1, title: 'Configure Career Page', description: 'Set up branding and layout' },
  { step: 2, title: 'Publish Job Listings', description: 'Post open positions with details' },
  { step: 3, title: 'Set Application Form', description: 'Customize the application form fields' },
  { step: 4, title: 'Enable Auto-Screening', description: 'Configure screening rules and criteria' },
  { step: 5, title: 'Review Applications', description: 'Evaluate incoming applications' },
  { step: 6, title: 'Shortlist Candidates', description: 'Select candidates for interviews' },
  { step: 7, title: 'Schedule Interviews', description: 'Coordinate interview slots with panel' },
];

/* ── Featured Jobs (demo) ── */
const FEATURED_JOBS = [
  { id: 'fj1', title: 'Senior AI/ML Engineer', company: 'Marq AI Tech Pvt Ltd', location: 'Mumbai, India', salary: '₹35L - ₹50L', match: 95, tags: ['AI/ML', 'Python', 'TensorFlow'] },
  { id: 'fj2', title: 'Product Design Lead', company: 'Nexus Solutions', location: 'Hyderabad, India', salary: '₹25L - ₹40L', match: 88, tags: ['Design', 'Figma', 'Leadership'] },
  { id: 'fj3', title: 'DevOps Architect', company: 'Nexus Staffing', location: 'Bangalore, India', salary: '₹30L - ₹45L', match: 82, tags: ['AWS', 'Kubernetes', 'CI/CD'] },
];

function getJobStatusBadge(status: string) {
  const map: Record<string, string> = {
    open: 'nexus-badge nexus-badge-success',
    closed: 'nexus-badge nexus-badge-error',
    on_hold: 'nexus-badge nexus-badge-warning',
    filled: 'nexus-badge nexus-badge-info',
    draft: 'nexus-badge nexus-badge-primary',
  };
  return map[status] || 'nexus-badge nexus-badge-info';
}

function formatDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function JobPortalPage() {
  const { user } = useAuthStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [locationFilter, setLocationFilter] = useState('all');
  const [jobPostings, setJobPostings] = useState<JobPosting[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'browse' | 'featured'>('browse');

  // Apply form state
  const [showApplyForm, setShowApplyForm] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string>('');
  const [applyForm, setApplyForm] = useState({
    candidateName: '', candidateEmail: '', candidatePhone: '',
    expectedSalary: '', source: 'portal',
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchJobs = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/recruitment?limit=50', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setJobPostings(data.jobPostings || []);
      }
    } catch {
      toast.error('Failed to load jobs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { queueMicrotask(() => fetchJobs()); }, [fetchJobs]);

  // Extract unique locations
  const uniqueLocations = useMemo(() => {
    const locations = new Set<string>();
    jobPostings.forEach((job) => {
      if (job.location) locations.add(job.location);
    });
    return Array.from(locations).sort();
  }, [jobPostings]);

  // Filter jobs
  const filteredJobs = useMemo(() => {
    return jobPostings.filter((job) => {
      const matchesSearch = job.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (job.department?.name?.toLowerCase() || '').includes(searchQuery.toLowerCase());
      const matchesLocation = locationFilter === 'all' ||
        (job.location?.toLowerCase() || '').includes(locationFilter.toLowerCase());
      return matchesSearch && matchesLocation;
    });
  }, [jobPostings, searchQuery, locationFilter]);

  const handleApply = (jobId: string) => {
    setSelectedJobId(jobId);
    setShowApplyForm(true);
    setApplyForm({ candidateName: '', candidateEmail: '', candidatePhone: '', expectedSalary: '', source: 'portal' });
    setTimeout(() => document.getElementById('apply-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const handleSubmitApply = async () => {
    if (!applyForm.candidateName || !applyForm.candidateEmail) {
      toast.error('Name and email are required');
      return;
    }
    try {
      setSubmitting(true);
      const res = await fetch('/api/recruitment', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ action: 'apply', jobPostingId: selectedJobId, ...applyForm }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('Application submitted successfully');
      setShowApplyForm(false);
      fetchJobs();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit application');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-nexus-text-primary flex items-center gap-2">
            <FiGlobe className="w-6 h-6 text-sky-500" />
            Job Portal
          </h1>
          <p className="text-nexus-text-secondary mt-1">Find your next career opportunity</p>
        </div>
      </div>

      <ModuleTips moduleKey="job_portal" title="Job Portal Tips" tips={jobPortalTips} userRole={user?.role} />
      <ModuleWorkflow moduleKey="job_portal" title="How to Manage the Job Portal" subtitle="Follow this workflow to set up and manage your career portal" steps={jobPortalWorkflowSteps} accentColor="cyan" userRole={user?.role} />

      {/* Search Bar */}
      <div className="nexus-card p-6 bg-gradient-to-r from-sky-50 to-blue-50 border-sky-200">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-nexus-text-muted" />
            <input placeholder="Search jobs by title, skill, or keyword..." className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 h-11" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
          <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} className="px-4 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 h-11 w-full sm:w-48">
            <option value="all">All Locations</option>
            {uniqueLocations.filter(loc => loc && loc.trim()).map((loc) => (
              <option key={loc} value={loc.toLowerCase()}>{loc}</option>
            ))}
          </select>
          <button className="h-11 bg-blue-500 text-white px-6 rounded-lg hover:bg-blue-600 font-medium text-sm shadow-sm shadow-blue-500/25 transition-colors flex items-center gap-2" onClick={() => fetchJobs()}>
            <FiSearch className="w-4 h-4" /> Search
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-lg w-fit">
        <button onClick={() => setActiveTab('browse')} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'browse' ? 'bg-white text-nexus-text-primary shadow-sm' : 'text-nexus-text-secondary hover:text-nexus-text-primary'}`}>
          Browse Jobs
        </button>
        <button onClick={() => setActiveTab('featured')} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${activeTab === 'featured' ? 'bg-white text-nexus-text-primary shadow-sm' : 'text-nexus-text-secondary hover:text-nexus-text-primary'}`}>
          <FiStar className="w-4 h-4 text-amber-500" /> Featured
        </button>
      </div>

      {/* Featured Jobs Tab */}
      {activeTab === 'featured' && (
        <div className="space-y-4">
          {/* AI Recommendations */}
          <div className="nexus-card p-4 border-l-4 border-l-purple-500">
            <div className="flex items-center gap-2 mb-3">
              <FiZap className="w-5 h-5 text-purple-500" />
              <h3 className="text-sm font-semibold text-nexus-text-primary">AI Job Recommendations</h3>
              <span className="nexus-badge nexus-badge-purple">AI</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { reason: 'Based on your skills in React and TypeScript', match: 92 },
                { reason: 'Matches your experience level (5+ years)', match: 85 },
                { reason: 'Aligned with your location preferences', match: 78 },
              ].map((rec, i) => (
                <div key={i} className="p-3 rounded-lg bg-purple-50 border border-purple-100">
                  <p className="text-xs text-nexus-text-secondary mb-1">{rec.reason}</p>
                  <span className="bg-emerald-50 text-emerald-700 text-xs font-medium px-2 py-0.5 rounded-full">{rec.match}% match</span>
                </div>
              ))}
            </div>
          </div>

          {/* Featured Job Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURED_JOBS.map(job => (
              <div key={job.id} className="nexus-card nexus-card-hover p-5 border-amber-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1"><FiZap className="w-3 h-3" /> Featured</span>
                  <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold px-2 py-0.5 rounded-full">{job.match}% Match</span>
                </div>
                <h3 className="font-semibold text-sm text-nexus-text-primary mb-1">{job.title}</h3>
                <p className="text-xs text-nexus-text-secondary flex items-center gap-1 mb-1"><FiGlobe className="w-3 h-3" />{job.company}</p>
                <div className="flex flex-wrap items-center gap-2 text-xs text-nexus-text-muted mb-3">
                  <span className="flex items-center gap-1"><FiMapPin className="w-3 h-3" />{job.location}</span>
                  <span className="flex items-center gap-1"><FiDollarSign className="w-3 h-3" />{job.salary}</span>
                </div>
                <div className="flex flex-wrap gap-1 mb-3">
                  {job.tags.map(tag => (
                    <span key={tag} className="bg-slate-100 text-slate-700 text-[10px] font-medium px-2 py-0.5 rounded-full">{tag}</span>
                  ))}
                </div>
                <button className="w-full bg-emerald-600 text-white text-sm font-medium py-2 rounded-lg hover:bg-emerald-700 transition-colors flex items-center justify-center gap-1">
                  Apply Now <FiArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Browse Jobs Tab */}
      {activeTab === 'browse' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <FiBriefcase className="w-5 h-5 text-blue-500" />
            <h2 className="text-lg font-semibold text-nexus-text-primary">All Open Positions ({filteredJobs.length})</h2>
          </div>

          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="nexus-card p-6 animate-pulse">
                <div className="h-5 w-48 bg-slate-200 rounded mb-3" />
                <div className="h-3 w-32 bg-slate-200 rounded mb-4" />
                <div className="flex gap-4"><div className="h-3 w-20 bg-slate-200 rounded" /><div className="h-3 w-20 bg-slate-200 rounded" /></div>
              </div>
            ))
          ) : filteredJobs.length === 0 ? (
            <div className="text-center py-12 nexus-card">
              <FiBriefcase className="w-12 h-12 text-nexus-text-muted mx-auto mb-3" />
              <p className="text-nexus-text-secondary font-medium">No open positions found</p>
              <p className="text-sm text-nexus-text-muted mt-1">
                {searchQuery || locationFilter !== 'all'
                  ? 'Try adjusting your search criteria'
                  : 'Check back later for new opportunities'}
              </p>
              {(searchQuery || locationFilter !== 'all') && (
                <button onClick={() => { setSearchQuery(''); setLocationFilter('all'); }} className="mt-3 px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors">
                  Clear Filters
                </button>
              )}
            </div>
          ) : (
            filteredJobs.map(job => (
              <div key={job.id} className="nexus-card nexus-card-hover p-5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="font-semibold text-nexus-text-primary">{job.title}</h3>
                      <span className={getJobStatusBadge(job.status)}>{job.status.replace('_', ' ')}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-nexus-text-muted">
                      {job.department && <span className="flex items-center gap-1"><FiBriefcase className="w-3 h-3" />{job.department.name}</span>}
                      {job.location && <span className="flex items-center gap-1"><FiMapPin className="w-3 h-3" />{job.location}</span>}
                      <span className="flex items-center gap-1"><FiClock className="w-3 h-3" />{job.type}</span>
                      <span className="flex items-center gap-1"><FiUsers className="w-3 h-3" />{job._count?.applications || job.applications?.length || 0} applicants</span>
                      <span className="flex items-center gap-1"><FiCalendar className="w-3 h-3" />{formatDate(job.postedDate)}</span>
                      {job.vacancies > 1 && <span className="flex items-center gap-1"><FiUsers className="w-3 h-3" />{job.vacancies} positions</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button className="p-2 rounded-lg text-nexus-text-muted hover:text-amber-500 hover:bg-amber-50 transition-colors"><FiBookmark className="w-4 h-4" /></button>
                    <button onClick={() => handleApply(job.id)} className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors flex items-center gap-1.5">
                      Apply <FiArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Apply Form */}
      {showApplyForm && (
        <div id="apply-form" className="nexus-card border-l-4 border-l-emerald-500">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-nexus-text-primary">Apply for Position</h2>
              <button onClick={() => setShowApplyForm(false)} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors"><FiX className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Full Name *</label>
                <input value={applyForm.candidateName} onChange={e => setApplyForm(p => ({ ...p, candidateName: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="John Doe" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Email *</label>
                <input type="email" value={applyForm.candidateEmail} onChange={e => setApplyForm(p => ({ ...p, candidateEmail: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="john@example.com" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Phone</label>
                <input value={applyForm.candidatePhone} onChange={e => setApplyForm(p => ({ ...p, candidatePhone: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="+91 98765 43210" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Expected Salary</label>
                <input value={applyForm.expectedSalary} onChange={e => setApplyForm(p => ({ ...p, expectedSalary: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="e.g., ₹15L" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Source</label>
                <select value={applyForm.source} onChange={e => setApplyForm(p => ({ ...p, source: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                  <option value="portal">Job Portal</option>
                  <option value="referral">Referral</option>
                  <option value="linkedin">LinkedIn</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-nexus-border">
              <button onClick={() => setShowApplyForm(false)} className="px-4 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors">Cancel</button>
              <button onClick={handleSubmitApply} disabled={submitting} className="px-6 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 shadow-sm shadow-emerald-500/25 transition-colors">
                {submitting ? 'Submitting...' : 'Submit Application'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
