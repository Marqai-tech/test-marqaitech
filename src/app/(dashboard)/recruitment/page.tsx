'use client';

import { useEffect, useState, useCallback, Fragment, useMemo } from 'react';
import Link from 'next/link';
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
  FiEdit2,
  FiTrash2,
  FiFileText,
  FiRefreshCw,
  FiUpload,
  FiActivity,
  FiMail,
  FiPhone,
  FiAward,
  FiBriefcase as FiWork,
  FiZap,
  FiShield,
  FiLock,
  FiBarChart2,
  FiExternalLink,
  FiArrowRight,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import ModuleTips from '@/components/ModuleTips';
import ModuleWorkflow from '@/components/ModuleWorkflow';
import ModuleIntro from '@/components/ModuleIntro';
import {
  maskCandidateFields,
  buildPiiMaskTooltip,
  PiiPolicyEntry,
} from '@/lib/pii-mask';

/* ── Recruitment Tips ── */
const recruitmentTips = [
  {
    title: 'Create Requisitions First',
    description: 'Create job requisitions first, then post them to the Job Portal',
  },
  {
    title: 'Use AI Interview',
    description: 'Use AI Interview to automatically screen candidates with customizable question sets',
  },
  {
    title: 'Track the Hiring Funnel',
    description: 'Track candidates through the hiring funnel: Applied → Screened → Interviewed → Offered → Hired',
  },
  {
    title: 'Source Effectiveness Report',
    description: 'The Source Effectiveness report helps identify which job boards yield the best candidates',
  },
  {
    title: 'Offer Letter Templates',
    description: 'Set up offer letter templates to speed up the hiring process',
  },
];

/* ── Recruitment Workflow Steps ── */
const recruitmentWorkflowSteps = [
  { step: 1, title: 'Create Job Requisition', description: 'Define the role, department, and hiring requirements' },
  { step: 2, title: 'Post Job Opening', description: 'Publish the job listing to attract candidates' },
  { step: 3, title: 'Receive Applications', description: 'Candidates apply through the portal or external sources' },
  { step: 4, title: 'Screen Candidates', description: 'Review applications and shortlist qualified candidates' },
  { step: 5, title: 'Schedule Interviews', description: 'Set up interview rounds with the hiring team' },
  { step: 6, title: 'Make Offer', description: 'Extend an offer letter to the selected candidate' },
  { step: 7, title: 'Hire Candidate', description: 'Candidate accepts and is onboarded into the system' },
  { step: 8, title: 'Update Employee Records', description: 'Create the employee profile from the hired candidate data' },
];

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

interface ParsedResume {
  name: string;
  email: string;
  phone: string;
  location?: string;
  summary?: string;
  skills: string[];
  education: { institution: string; degree: string; year?: string }[];
  experience: { company: string; role: string; duration: string; description?: string }[];
  certifications: string[];
  languages: string[];
}

interface ResumeParseRow {
  id: string;
  language: string | null;
  parsedData: string;
  confidence: number;
  sourceFormat: string;
  parseError: string | null;
  createdAt: string;
}

interface SentimentRow {
  id: string;
  sentiment: 'positive' | 'neutral' | 'negative' | 'mixed';
  engagementScore: number;
  dropoffRisk: number;
  rationale: string | null;
  source: string;
  createdAt: string;
}

interface Department { id: string; name: string }

/* ── Helpers ── */
function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
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

function getSentimentBadge(s: SentimentRow | null | undefined) {
  if (!s) return { className: 'bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full text-[10px] font-semibold', label: 'No sentiment', title: 'No sentiment analysis run yet' };
  const map: Record<string, string> = {
    positive: 'bg-emerald-100 text-emerald-700',
    neutral: 'bg-slate-100 text-slate-600',
    negative: 'bg-red-100 text-red-700',
    mixed: 'bg-amber-100 text-amber-700',
  };
  const label = `${s.sentiment} · ${s.engagementScore}/100`;
  return {
    className: `${map[s.sentiment] || map.neutral} px-2 py-0.5 rounded-full text-[10px] font-semibold`,
    label,
    title: s.rationale || `Engagement ${s.engagementScore}, dropoff risk ${s.dropoffRisk}`,
  };
}

function formatTimestamp(sec: number | null | undefined) {
  if (sec === null || sec === undefined) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
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

  const [activeTab, setActiveTab] = useState<'postings' | 'applications' | 'search'>('postings');
  const [jobPostings, setJobPostings] = useState<JobPosting[]>([]);
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState<Department[]>([]);

  // Job form state
  const [showJobForm, setShowJobForm] = useState(false);
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [jobForm, setJobForm] = useState(initialJobForm);
  const [submittingJob, setSubmittingJob] = useState(false);

  // Application form state
  const [showAppForm, setShowAppForm] = useState(false);
  const [appForm, setAppForm] = useState(initialAppForm);
  const [submittingApp, setSubmittingApp] = useState(false);

  // Application edit state (inline status change)
  const [editingAppId, setEditingAppId] = useState<string | null>(null);
  const [editAppStatus, setEditAppStatus] = useState('');

  // Delete confirmation
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [expandedJob, setExpandedJob] = useState<string | null>(null);

  /* ─── Job Search Matrix (talent-acquisition candidate shortlisting) ─── */
  // Recruiter filters candidates across ALL applications by skill, experience,
  // salary range, status, or free-text query — to build a shortlist for a
  // specific open requirement.
  const [searchFilters, setSearchFilters] = useState({
    skills: '',
    minExperienceYears: '',
    maxExperienceYears: '',
    minSalary: '',
    maxSalary: '',
    status: '',
    jobPostingId: '',
    q: '',
  });
  const [searchResults, setSearchResults] = useState<{
    candidates: any[];
    summary: { totalMatches: number; avgExperienceYears: number; avgExpectedSalaryLpa: number | null; uniqueSkills: string[] };
    filters: any;
  } | null>(null);
  const [searching, setSearching] = useState(false);

  const runCandidateSearch = useCallback(async () => {
    setSearching(true);
    try {
      const params = new URLSearchParams();
      if (searchFilters.skills) params.set('skills', searchFilters.skills);
      if (searchFilters.minExperienceYears) params.set('minExperienceYears', searchFilters.minExperienceYears);
      if (searchFilters.maxExperienceYears) params.set('maxExperienceYears', searchFilters.maxExperienceYears);
      if (searchFilters.minSalary) params.set('minSalary', searchFilters.minSalary);
      if (searchFilters.maxSalary) params.set('maxSalary', searchFilters.maxSalary);
      if (searchFilters.status) params.set('status', searchFilters.status);
      if (searchFilters.jobPostingId) params.set('jobPostingId', searchFilters.jobPostingId);
      if (searchFilters.q) params.set('q', searchFilters.q);
      params.set('limit', '100');
      const r = await fetch(`/api/recruitment/candidate-search?${params.toString()}`, { headers: getAuthHeaders() });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Search failed');
      setSearchResults(d);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Search failed');
      setSearchResults(null);
    } finally {
      setSearching(false);
    }
  }, [searchFilters]);

  /* ─── WAVE2-A: PII masking policies (REQ-SEC-REC-03) ─── */
  const [piiPolicies, setPiiPolicies] = useState<PiiPolicyEntry[]>([]);

  // Role flag: recruiters + admins see full values; everyone else (hiring panel,
  // interviewers, managers) sees masked values per the tenant policy.
  const isRecruiterOrAdmin = ['super_admin', 'tenant_admin', 'hr_admin', 'recruiter', 'recruiter_admin'].includes(user?.role || '');

  useEffect(() => {
    // Fetch tenant PII policies once on mount. Non-admins also need this so
    // they can resolve the visibleToRoles whitelist for their own role.
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/ats/pii-policy', { headers: getAuthHeaders() });
        if (!r.ok) {
          if (!cancelled) setPiiPolicies([]);
          return;
        }
        const d = await r.json();
        if (!cancelled) setPiiPolicies(d.policies || []);
      } catch {
        if (!cancelled) setPiiPolicies([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Memoized masked copy of the applications list. We mask only the PII fields
  // that exist on the JobApplication row (email + phone today). The original
  // `applications` array is preserved for editing flows so admins can still
  // PATCH the raw candidateEmail through the inline edit form.
  const maskedApplications = useMemo(() => {
    if (!applications || applications.length === 0) return [];
    return applications.map(a =>
      maskCandidateFields(
        a as unknown as Record<string, unknown>,
        user?.role,
        piiPolicies,
      ) as unknown as JobApplication & { __piiMaskedFields?: string[] }
    );
  }, [applications, piiPolicies, user?.role]);

  /* ─── WAVE2-C: Resume parser + sentiment state ─── */
  const [expandedAppId, setExpandedAppId] = useState<string | null>(null);
  const [parseByApp, setParseByApp] = useState<Record<string, { parse: ResumeParseRow | null; parsed: ParsedResume | null; loading: boolean }>>({});
  const [sentimentByApp, setSentimentByApp] = useState<Record<string, SentimentRow | null>>({});
  const [parsingAppId, setParsingAppId] = useState<string | null>(null);
  const [runningSentimentAppId, setRunningSentimentAppId] = useState<string | null>(null);

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

        // ─── WAVE2-C: Lazy-load latest sentiment per application (batched) ───
        // Cap to the first 30 applications to avoid hammering the API.
        Promise.all(
          allApps.slice(0, 30).map(async (a) => {
            try {
              const r = await fetch(`/api/ats/sentiment?jobApplicationId=${a.id}`, { headers });
              if (!r.ok) return [a.id, null] as const;
              const d = await r.json();
              return [a.id, d.sentiment || null] as const;
            } catch {
              return [a.id, null] as const;
            }
          }),
        ).then((entries) => {
          const map: Record<string, SentimentRow | null> = {};
          entries.forEach(([id, s]) => { map[id] = s; });
          setSentimentByApp(map);
        }).catch(() => { /* ignore */ });
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

  /* Open Job Form - Add */
  const handleOpenAddJobForm = () => {
    setEditingJobId(null);
    setJobForm(initialJobForm);
    setShowJobForm(true);
    setShowAppForm(false);
    setDeleteConfirmId(null);
    setTimeout(() => document.getElementById('crud-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  /* Open Job Form - Edit */
  const handleOpenEditJobForm = (job: JobPosting) => {
    setEditingJobId(job.id);
    setJobForm({
      title: job.title,
      departmentId: job.department?.id || '',
      position: job.position,
      location: job.location || '',
      type: job.type,
      experience: job.experience || '',
      salary: job.salary || '',
      description: job.description,
      requirements: job.requirements || '',
      vacancies: String(job.vacancies),
      closingDate: job.closingDate ? job.closingDate.split('T')[0] : '',
    });
    setShowJobForm(true);
    setShowAppForm(false);
    setDeleteConfirmId(null);
    setTimeout(() => document.getElementById('crud-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const handleCancelJobForm = () => {
    setShowJobForm(false);
    setEditingJobId(null);
    setJobForm(initialJobForm);
  };

  /* Create / Update Job Posting */
  const handleSaveJob = async () => {
    if (!jobForm.title || !jobForm.departmentId || !jobForm.description) {
      toast.error('Please fill in required fields: title, department, description');
      return;
    }
    try {
      setSubmittingJob(true);
      const payload = { ...jobForm, vacancies: parseInt(jobForm.vacancies) || 1 };

      if (editingJobId) {
        const res = await fetch(`/api/recruitment/${editingJobId}`, {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify(payload),
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
        toast.success('Job posting updated successfully');
      } else {
        const res = await fetch('/api/recruitment', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(payload),
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
        toast.success('Job posting created successfully');
      }
      handleCancelJobForm();
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save job posting');
    } finally {
      setSubmittingJob(false);
    }
  };

  /* Delete Job Posting */
  const handleDeleteJob = async (id: string) => {
    try {
      setDeleting(true);
      const res = await fetch(`/api/recruitment/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('Job posting deleted successfully');
      setDeleteConfirmId(null);
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete job posting');
    } finally {
      setDeleting(false);
    }
  };

  /* Open Application Form */
  const handleOpenApplyForm = (jobId: string) => {
    setAppForm(prev => ({ ...prev, jobPostingId: jobId }));
    setShowAppForm(true);
    setShowJobForm(false);
    setDeleteConfirmId(null);
    setTimeout(() => document.getElementById('crud-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const handleCancelAppForm = () => {
    setShowAppForm(false);
    setAppForm(initialAppForm);
  };

  /* Submit Application */
  const handleSubmitApp = async () => {
    if (!appForm.candidateName || !appForm.candidateEmail || !appForm.jobPostingId) {
      toast.error('Please fill in required fields');
      return;
    }
    try {
      setSubmittingApp(true);
      await fetch('/api/recruitment', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ action: 'apply', ...appForm }),
      });
      toast.success('Application submitted successfully');
      handleCancelAppForm();
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit application');
    } finally {
      setSubmittingApp(false);
    }
  };

  /* Update Application Status (inline) */
  const handleOpenAppEdit = (app: JobApplication) => {
    setEditingAppId(app.id);
    setEditAppStatus(app.status);
  };

  const handleCancelAppEdit = () => {
    setEditingAppId(null);
    setEditAppStatus('');
  };

  const handleSaveAppStatus = async (appId: string) => {
    try {
      const res = await fetch(`/api/recruitment/${appId}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status: editAppStatus }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('Application status updated');
      handleCancelAppEdit();
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to update status');
    }
  };

  /* ─────────────────────────────────────────────────────────── */
  /* WAVE2-C: Parsed resume + sentiment actions                  */
  /* ─────────────────────────────────────────────────────────── */

  const fetchParsedResume = useCallback(async (appId: string) => {
    setParseByApp(prev => ({ ...prev, [appId]: { parse: prev[appId]?.parse ?? null, parsed: prev[appId]?.parsed ?? null, loading: true } }));
    try {
      const r = await fetch(`/api/ats/parse-resume?jobApplicationId=${appId}`, { headers: getAuthHeaders() });
      const d = r.ok ? await r.json() : { parse: null, parsedData: null };
      let parsed: ParsedResume | null = null;
      try { parsed = d.parsedData ? (typeof d.parsedData === 'string' ? JSON.parse(d.parsedData) : d.parsedData) : null; } catch { parsed = null; }
      setParseByApp(prev => ({ ...prev, [appId]: { parse: d.parse || null, parsed, loading: false } }));
    } catch {
      setParseByApp(prev => ({ ...prev, [appId]: { parse: null, parsed: null, loading: false } }));
    }
  }, []);

  const handleToggleAppExpand = (appId: string) => {
    const next = expandedAppId === appId ? null : appId;
    setExpandedAppId(next);
    if (next && !parseByApp[appId]) {
      fetchParsedResume(appId);
    }
  };

  const handleUploadResume = async (appId: string, file: File) => {
    // Convert file → base64 data URL → POST to parser
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      if (!dataUrl) { toast.error('Failed to read file'); return; }
      try {
        setParsingAppId(appId);
        const r = await fetch('/api/ats/parse-resume', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ jobApplicationId: appId, resumeDataUrl: dataUrl }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d?.error || 'Parse failed');
        toast.success(`Resume parsed (confidence ${Math.round((d.confidence || 0) * 100)}%, ${d.language || 'en'})`);
        // Refetch parse + sentiment for this app
        await fetchParsedResume(appId);
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : 'Failed to parse resume');
      } finally {
        setParsingAppId(null);
      }
    };
    reader.onerror = () => toast.error('Failed to read file');
    reader.readAsDataURL(file);
  };

  const handleReparse = async (appId: string) => {
    // Re-parse requires the original resume file. Since we don't store it,
    // we prompt the user to re-upload. If they have no resume on file, we
    // try to re-extract from the existing rawText stored on the latest parse.
    const existing = parseByApp[appId]?.parse;
    if (!existing) {
      toast.error('No prior parse — upload a resume first');
      return;
    }
    // Trigger the hidden file input
    const input = document.getElementById(`resume-upload-${appId}`) as HTMLInputElement | null;
    if (input) {
      input.click();
      return;
    }
  };

  const handleRunSentiment = async (appId: string) => {
    try {
      setRunningSentimentAppId(appId);
      const r = await fetch('/api/ats/sentiment', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ jobApplicationId: appId, source: 'chat_screening' }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || 'Sentiment failed');
      setSentimentByApp(prev => ({ ...prev, [appId]: d }));
      toast.success(`Sentiment: ${d.sentiment} (engagement ${d.engagementScore}/100)`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to compute sentiment');
    } finally {
      setRunningSentimentAppId(null);
    }
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
          {/* REQ-SEC-REC-03 PII masked indicator */}
          {!isRecruiterOrAdmin ? (
            <span className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-semibold ring-1 ring-emerald-200" title="PII is masked for your role per REQ-SEC-REC-03.">
              <FiShield className="w-3 h-3" /> PII masked for hiring panel
            </span>
          ) : (
            <Link href="/recruitment/pii-policy" className="inline-flex items-center gap-1.5 mt-2 text-[11px] font-semibold text-violet-600 hover:text-violet-700">
              <FiLock className="w-3 h-3" /> Configure PII masking policy
            </Link>
          )}
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <Link
              href="/recruitment/analytics"
              className="inline-flex items-center gap-2 px-3 py-2.5 border border-violet-200 text-violet-700 rounded-lg hover:bg-violet-50 font-medium text-sm transition-colors"
              title="Recruitment Analytics: Cost per Hire, Time to Fill, source effectiveness"
            >
              <FiBarChart2 className="w-4 h-4" />
              <span className="hidden sm:inline">Analytics</span>
            </Link>
            <Link
              href="/recruitment/job-boards"
              className="inline-flex items-center gap-2 px-3 py-2.5 border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-50 font-medium text-sm transition-colors"
              title="Manage all external job board postings"
            >
              <FiExternalLink className="w-4 h-4" />
              <span className="hidden sm:inline">Job Boards</span>
            </Link>
            <button onClick={handleOpenAddJobForm} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium text-sm shadow-sm shadow-blue-500/25 transition-colors">
              <FiPlus className="w-4 h-4" />
              Post Job
            </button>
          </div>
        )}
      </div>

      {/* Module Intro — minimized by default with hover preview */}
      <ModuleIntro
        title="Recruitment & ATS"
        subtitle="Requisitions → Job postings → Applications → Interviews → Offers → Onboarding"
        srsRef="REQ-ATS-01..12 · REQ-SEC-REC-01..03"
        icon={<FiBriefcase className="w-4 h-4" />}
        accent="violet"
        quickStats={
          <>
            <span><b className="text-slate-700">{jobPostings.length}</b> jobs</span>
            <span><b className="text-violet-600">{jobPostings.reduce((n, j) => n + (j._count?.applications || 0), 0)}</b> applications</span>
          </>
        }
      >
        <p>
          The Recruitment module is a full Applicant Tracking System (ATS) covering the end-to-end hiring
          funnel — from raising a job requisition with department / hiring manager approval, posting the
          job internally and externally, receiving applications, screening, scheduling interviews (manual
          and AI-proctored), rolling out offers, and converting accepted candidates into employees.
        </p>
        <p>
          PII is masked for hiring panel members per REQ-SEC-REC-03 by default; only authorized recruiters
          and HR admins see full candidate contact details. All candidate activity — applications, interview
          feedback, sentiment scores, AI interview sessions, and offer history — is consolidated into a
          single candidate timeline that recruiters can audit at any time.
        </p>
        <p>
          The Candidate Portal (separate login) lets external candidates self-serve: dashboard with their
          application status, upcoming interviews, resume insights, skill matrix, AI suggestions, and
          recommended learning courses for skills they're missing for the jobs they applied to.
        </p>
      </ModuleIntro>

      {/* Module Tips */}
      <ModuleTips
        moduleKey="recruitment"
        title="Recruitment Tips"
        tips={recruitmentTips}
        userRole={user?.role}
      />

      <ModuleWorkflow
        moduleKey="recruitment"
        title="How to Hire Through Recruitment"
        subtitle="Follow this workflow to manage the full hiring process"
        steps={recruitmentWorkflowSteps}
        accentColor="violet"
        userRole={user?.role}
      />

      {/* Embedded Job Posting Form (Add/Edit) */}
      {showJobForm && (
        <div id="crud-form" className="nexus-card border-l-4 border-l-violet-500 transition-all duration-300 ease-in-out">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-nexus-text-primary">
                {editingJobId ? 'Edit Job Posting' : 'Post New Job'}
              </h2>
              <button onClick={handleCancelJobForm} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors">
                <FiX className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
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
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-nexus-border">
                <button onClick={handleCancelJobForm} className="px-4 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors">Cancel</button>
                <button onClick={handleSaveJob} disabled={submittingJob} className="px-6 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 shadow-sm shadow-blue-500/25 transition-colors">
                  {submittingJob ? 'Saving...' : editingJobId ? 'Update Job' : 'Post Job'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Embedded Application Form */}
      {showAppForm && (
        <div id="crud-form" className="nexus-card border-l-4 border-l-blue-500 transition-all duration-300 ease-in-out">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-nexus-text-primary">Submit Application</h2>
              <button onClick={handleCancelAppForm} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors">
                <FiX className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              {appForm.jobPostingId && (
                <div className="p-3 rounded-lg bg-blue-50 border border-blue-100">
                  <p className="text-sm text-blue-700 font-medium">
                    <FiBriefcase className="w-4 h-4 inline mr-1" />
                    Applying for: {jobPostings.find(j => j.id === appForm.jobPostingId)?.title || 'Selected Job'}
                  </p>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Job Posting *</label>
                <select value={appForm.jobPostingId} onChange={e => setAppForm(p => ({ ...p, jobPostingId: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                  <option value="">Select Job</option>
                  {jobPostings.filter(j => j.status === 'open').map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
                </select>
              </div>
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
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-nexus-border">
                <button onClick={handleCancelAppForm} className="px-4 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors">Cancel</button>
                <button onClick={handleSubmitApp} disabled={submittingApp} className="px-6 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 shadow-sm shadow-blue-500/25 transition-colors">
                  {submittingApp ? 'Submitting...' : 'Submit Application'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-lg w-fit flex-wrap">
        <button onClick={() => setActiveTab('postings')} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'postings' ? 'bg-white text-nexus-text-primary shadow-sm' : 'text-nexus-text-secondary hover:text-nexus-text-primary'}`}>
          Job Postings
        </button>
        <button onClick={() => setActiveTab('applications')} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'applications' ? 'bg-white text-nexus-text-primary shadow-sm' : 'text-nexus-text-secondary hover:text-nexus-text-primary'}`}>
          Applications
        </button>
        <button onClick={() => setActiveTab('search')} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'search' ? 'bg-white text-nexus-text-primary shadow-sm' : 'text-nexus-text-secondary hover:text-nexus-text-primary'}`}>
          Candidate Search
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
              const isDeleting = deleteConfirmId === job.id;
              return (
                <div key={job.id} className={`nexus-card nexus-card-hover overflow-hidden transition-colors ${isDeleting ? 'border-red-200' : ''}`}>
                  {isDeleting ? (
                    <div className="p-6 bg-red-50">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
                            <FiTrash2 className="w-4 h-4 text-red-500" />
                          </div>
                          <span className="text-sm text-red-700 font-medium">Are you sure you want to delete &quot;{job.title}&quot;? This action cannot be undone.</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => handleDeleteJob(job.id)} disabled={deleting} className="px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors">
                            {deleting ? 'Deleting...' : 'Confirm Delete'}
                          </button>
                          <button onClick={() => setDeleteConfirmId(null)} className="px-3 py-1.5 border border-nexus-border text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors">
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
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
                            <Link
                              href={`/recruitment/${job.id}`}
                              className="px-3 py-2 border border-violet-200 text-violet-700 rounded-lg text-xs font-medium hover:bg-violet-50 transition-colors inline-flex items-center gap-1"
                              title="View job detail, funnel, candidates, and multi-post to boards"
                            >
                              View Detail <FiArrowRight className="w-3 h-3" />
                            </Link>
                            <button onClick={() => handleOpenApplyForm(job.id)} className="px-3 py-2 bg-blue-500 text-white rounded-lg text-xs font-medium hover:bg-blue-600 transition-colors">
                              Apply
                            </button>
                            {isAdmin && (
                              <>
                                <button onClick={() => handleOpenEditJobForm(job)} className="p-2 rounded-lg text-nexus-text-muted hover:text-amber-500 hover:bg-amber-50 transition-colors" title="Edit">
                                  <FiEdit2 className="w-4 h-4" />
                                </button>
                                <button onClick={() => setDeleteConfirmId(job.id)} className="p-2 rounded-lg text-nexus-text-muted hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete">
                                  <FiTrash2 className="w-4 h-4" />
                                </button>
                              </>
                            )}
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
                              <div className="flex items-center justify-between mb-2">
                                <h4 className="text-sm font-semibold text-nexus-text-primary">Applications ({job.applications.length})</h4>
                                {!isRecruiterOrAdmin && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-semibold ring-1 ring-emerald-200" title="PII is masked for your role per REQ-SEC-REC-03.">
                                    <FiShield className="w-2.5 h-2.5" /> PII masked
                                  </span>
                                )}
                              </div>
                              <div className="space-y-2">
                                {job.applications.map(rawApp => {
                                  // Apply PII masking inline so the expanded per-job list also honors the tenant policy.
                                  const app = maskCandidateFields(
                                    rawApp as unknown as Record<string, unknown>,
                                    user?.role,
                                    piiPolicies,
                                  ) as unknown as JobApplication & { __piiMaskedFields?: string[] };
                                  const appBadge = getAppStatusBadge(app.status);
                                  const isEditing = editingAppId === app.id;
                                  const maskedFields = app.__piiMaskedFields || [];
                                  return (
                                    <div key={app.id} className={`flex items-center justify-between p-3 bg-white rounded-lg border transition-colors ${isEditing ? 'border-blue-300 bg-blue-50/50' : 'border-nexus-border'}`}>
                                      <div className="min-w-0">
                                        <div className="flex items-center gap-1.5">
                                          <p className="text-sm font-medium text-nexus-text-primary">{app.candidateName}</p>
                                          {maskedFields.length > 0 && (
                                            <span
                                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-semibold ring-1 ring-emerald-200"
                                              title={buildPiiMaskTooltip(maskedFields)}
                                            >
                                              <FiShield className="w-2.5 h-2.5" /> PII masked
                                            </span>
                                          )}
                                        </div>
                                        <p className="text-xs text-nexus-text-muted">{app.candidateEmail} · Applied {formatDate(app.appliedDate)}</p>
                                      </div>
                                      {isEditing ? (
                                        <div className="flex items-center gap-2">
                                          <select
                                            value={editAppStatus}
                                            onChange={e => setEditAppStatus(e.target.value)}
                                            className="px-2 py-1 rounded border border-nexus-border text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                          >
                                            <option value="applied">Applied</option>
                                            <option value="screening">Screening</option>
                                            <option value="interview">Interview</option>
                                            <option value="offered">Offered</option>
                                            <option value="hired">Hired</option>
                                            <option value="rejected">Rejected</option>
                                          </select>
                                          <button onClick={() => handleSaveAppStatus(app.id)} className="px-2.5 py-1 bg-blue-500 text-white text-xs font-medium rounded hover:bg-blue-600 transition-colors">
                                            Save
                                          </button>
                                          <button onClick={handleCancelAppEdit} className="px-2.5 py-1 border border-nexus-border text-xs font-medium rounded hover:bg-slate-50 transition-colors">
                                            Cancel
                                          </button>
                                        </div>
                                      ) : (
                                        <div className="flex items-center gap-2">
                                          <span className={appBadge.className}>{appBadge.label}</span>
                                          {isAdmin && (
                                            <button onClick={() => handleOpenAppEdit(app)} className="p-1 rounded text-nexus-text-muted hover:text-amber-500 hover:bg-amber-50 transition-colors" title="Edit Status">
                                              <FiEdit2 className="w-3.5 h-3.5" />
                                            </button>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </>
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
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Sentiment</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Applied Date</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Rating</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Actions</th>
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
                      <td className="px-4 py-3"><div className="h-5 w-20 bg-slate-200 rounded-full" /></td>
                      <td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded" /></td>
                      <td className="px-4 py-3"><div className="h-3 w-12 bg-slate-200 rounded" /></td>
                      <td className="px-4 py-3"><div className="h-3 w-12 bg-slate-200 rounded ml-auto" /></td>
                    </tr>
                  ))
                ) : applications.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center">
                      <FiUsers className="w-10 h-10 text-nexus-text-muted mx-auto mb-3" />
                      <p className="text-nexus-text-secondary font-medium">No applications yet</p>
                    </td>
                  </tr>
                ) : (
                  <>
                    {maskedApplications.map(app => {
                    const badge = getAppStatusBadge(app.status);
                    const isEditing = editingAppId === app.id;
                    const isAppExpanded = expandedAppId === app.id;
                    const sentiment = sentimentByApp[app.id];
                    const parseState = parseByApp[app.id];
                    const sentimentBadge = getSentimentBadge(sentiment);
                    const maskedFields = app.__piiMaskedFields || [];
                    const piiTooltip = buildPiiMaskTooltip(maskedFields);
                    return (
                      <Fragment key={app.id}>
                      <tr className={`border-b border-nexus-border/50 transition-colors ${isEditing ? 'bg-blue-50/50' : 'hover:bg-slate-50/50'}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-nexus-text-primary">{app.candidateName}</p>
                              <p className="text-xs text-nexus-text-muted">{app.candidateEmail}</p>
                            </div>
                            {maskedFields.length > 0 && (
                              <span
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-semibold ring-1 ring-emerald-200 flex-shrink-0"
                                title={piiTooltip}
                              >
                                <FiShield className="w-2.5 h-2.5" /> PII masked
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-nexus-text-secondary">{app.jobPosting?.title || '—'}</td>
                        <td className="px-4 py-3 text-sm text-nexus-text-secondary capitalize">{app.source}</td>
                        <td className="px-4 py-3">
                          {isEditing ? (
                            <select
                              value={editAppStatus}
                              onChange={e => setEditAppStatus(e.target.value)}
                              className="px-2 py-1 rounded border border-nexus-border text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                            >
                              <option value="applied">Applied</option>
                              <option value="screening">Screening</option>
                              <option value="interview">Interview</option>
                              <option value="offered">Offered</option>
                              <option value="hired">Hired</option>
                              <option value="rejected">Rejected</option>
                            </select>
                          ) : (
                            <span className={badge.className}>{badge.label}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={sentimentBadge.className} title={sentimentBadge.title}>{sentimentBadge.label}</span>
                          {isAdmin && (
                            <button
                              onClick={() => handleRunSentiment(app.id)}
                              disabled={runningSentimentAppId === app.id}
                              className="ml-2 p-1 rounded text-nexus-text-muted hover:text-violet-600 hover:bg-violet-50 transition-colors disabled:opacity-50"
                              title="Run sentiment analysis"
                            >
                              {runningSentimentAppId === app.id ? <FiRefreshCw className="w-3 h-3 animate-spin" /> : <FiActivity className="w-3 h-3" />}
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-nexus-text-secondary">{formatDate(app.appliedDate)}</td>
                        <td className="px-4 py-3">
                          {app.rating ? (
                            <span className="flex items-center gap-1 text-amber-500"><FiStar className="w-3.5 h-3.5 fill-amber-500" /><span className="text-sm font-medium">{app.rating}</span></span>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3">
                          {isEditing ? (
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => handleSaveAppStatus(app.id)} className="px-2.5 py-1 bg-blue-500 text-white text-xs font-medium rounded hover:bg-blue-600 transition-colors">
                                Save
                              </button>
                              <button onClick={handleCancelAppEdit} className="px-2.5 py-1 border border-nexus-border text-xs font-medium rounded hover:bg-slate-50 transition-colors">
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-1">
                              {isAdmin && (
                                <button onClick={() => handleOpenAppEdit(app)} className="p-2 rounded-lg text-nexus-text-muted hover:text-amber-500 hover:bg-amber-50 transition-colors" title="Edit Status">
                                  <FiEdit2 className="w-4 h-4" />
                                </button>
                              )}
                              <button onClick={() => handleToggleAppExpand(app.id)} className={`p-2 rounded-lg border transition-colors ${isAppExpanded ? 'bg-violet-50 text-violet-600 border-violet-200' : 'text-nexus-text-secondary border-nexus-border hover:bg-slate-50'}`} title="View parsed resume">
                                {isAppExpanded ? <FiChevronUp className="w-4 h-4" /> : <FiChevronDown className="w-4 h-4" />}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                      {isAppExpanded && (
                        <tr className="bg-slate-50/40">
                          <td colSpan={8} className="px-6 py-5">
                            <ParsedResumePanel
                              appId={app.id}
                              state={parseState}
                              parsing={parsingAppId === app.id}
                              onUpload={handleUploadResume}
                              onReparse={handleReparse}
                            />
                          </td>
                        </tr>
                      )}
                      </Fragment>
                    );
                    })}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── Candidate Search Tab (Job Search Matrix) ─── */}
      {/* Recruiter filters candidates across ALL applications by skill,
          experience, salary range, status, or free-text query — to build
          a shortlist for a specific open requirement. */}
      {activeTab === 'search' && (
        <div className="space-y-4">
          {/* Filter panel */}
          <div className="nexus-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <FiUsers className="w-4 h-4 text-violet-600" />
              <h3 className="text-sm font-semibold text-nexus-text-primary">Candidate Shortlist Filters</h3>
              <span className="text-[11px] text-nexus-text-muted ml-2">
                Filter candidates across all applications by skill, experience, salary, and more
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="text-[11px] font-medium text-nexus-text-secondary uppercase tracking-wider">Skills (comma-separated)</label>
                <input
                  type="text"
                  value={searchFilters.skills}
                  onChange={(e) => setSearchFilters({ ...searchFilters, skills: e.target.value })}
                  placeholder="react, nodejs, aws"
                  className="mt-1 w-full px-3 py-2 border border-nexus-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
                <p className="text-[10px] text-nexus-text-muted mt-0.5">Candidate must have ALL listed skills</p>
              </div>

              <div>
                <label className="text-[11px] font-medium text-nexus-text-secondary uppercase tracking-wider">Experience (years)</label>
                <div className="mt-1 flex gap-1.5">
                  <input
                    type="number"
                    min="0"
                    value={searchFilters.minExperienceYears}
                    onChange={(e) => setSearchFilters({ ...searchFilters, minExperienceYears: e.target.value })}
                    placeholder="Min"
                    className="w-full px-2 py-2 border border-nexus-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                  <input
                    type="number"
                    min="0"
                    value={searchFilters.maxExperienceYears}
                    onChange={(e) => setSearchFilters({ ...searchFilters, maxExperienceYears: e.target.value })}
                    placeholder="Max"
                    className="w-full px-2 py-2 border border-nexus-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-medium text-nexus-text-secondary uppercase tracking-wider">Expected Salary (LPA)</label>
                <div className="mt-1 flex gap-1.5">
                  <input
                    type="number"
                    min="0"
                    value={searchFilters.minSalary}
                    onChange={(e) => setSearchFilters({ ...searchFilters, minSalary: e.target.value })}
                    placeholder="Min"
                    className="w-full px-2 py-2 border border-nexus-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                  <input
                    type="number"
                    min="0"
                    value={searchFilters.maxSalary}
                    onChange={(e) => setSearchFilters({ ...searchFilters, maxSalary: e.target.value })}
                    placeholder="Max"
                    className="w-full px-2 py-2 border border-nexus-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-medium text-nexus-text-secondary uppercase tracking-wider">Status</label>
                <select
                  value={searchFilters.status}
                  onChange={(e) => setSearchFilters({ ...searchFilters, status: e.target.value })}
                  className="mt-1 w-full px-3 py-2 border border-nexus-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white"
                >
                  <option value="">All (excl. rejected)</option>
                  <option value="applied">Applied</option>
                  <option value="screening">Screening</option>
                  <option value="interview">Interview</option>
                  <option value="offered">Offered</option>
                  <option value="hired">Hired</option>
                  <option value="talent_pool">Talent Pool</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-medium text-nexus-text-secondary uppercase tracking-wider">Job Posting</label>
                <select
                  value={searchFilters.jobPostingId}
                  onChange={(e) => setSearchFilters({ ...searchFilters, jobPostingId: e.target.value })}
                  className="mt-1 w-full px-3 py-2 border border-nexus-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white"
                >
                  <option value="">All jobs</option>
                  {jobPostings.map(j => (
                    <option key={j.id} value={j.id}>{j.title}</option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="text-[11px] font-medium text-nexus-text-secondary uppercase tracking-wider">Search name / email / skill</label>
                <input
                  type="text"
                  value={searchFilters.q}
                  onChange={(e) => setSearchFilters({ ...searchFilters, q: e.target.value })}
                  placeholder="e.g. alice@example.com or python"
                  className="mt-1 w-full px-3 py-2 border border-nexus-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  onKeyDown={(e) => { if (e.key === 'Enter') runCandidateSearch(); }}
                />
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <button
                onClick={runCandidateSearch}
                disabled={searching}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:bg-slate-300 text-white text-sm font-medium transition-colors"
              >
                {searching ? (
                  <><div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Searching…</>
                ) : (
                  <><FiBarChart2 className="w-3.5 h-3.5" /> Search Candidates</>
                )}
              </button>
              <button
                onClick={() => {
                  setSearchFilters({ skills: '', minExperienceYears: '', maxExperienceYears: '', minSalary: '', maxSalary: '', status: '', jobPostingId: '', q: '' });
                  setSearchResults(null);
                }}
                className="px-3 py-2 rounded-lg border border-nexus-border text-xs font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors"
              >
                Clear filters
              </button>
            </div>
          </div>

          {/* Results */}
          {searchResults && (
            <>
              {/* Summary stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="nexus-card p-3">
                  <p className="text-[10px] uppercase tracking-wider text-nexus-text-muted font-medium">Total Matches</p>
                  <p className="text-2xl font-bold text-violet-600 mt-0.5">{searchResults.summary.totalMatches}</p>
                </div>
                <div className="nexus-card p-3">
                  <p className="text-[10px] uppercase tracking-wider text-nexus-text-muted font-medium">Avg Experience</p>
                  <p className="text-2xl font-bold text-nexus-text-primary mt-0.5">
                    {searchResults.summary.avgExperienceYears}<span className="text-xs font-medium ml-1 text-nexus-text-muted">yrs</span>
                  </p>
                </div>
                <div className="nexus-card p-3">
                  <p className="text-[10px] uppercase tracking-wider text-nexus-text-muted font-medium">Avg Expected Salary</p>
                  <p className="text-2xl font-bold text-nexus-text-primary mt-0.5">
                    {searchResults.summary.avgExpectedSalaryLpa !== null ? (
                      <>{searchResults.summary.avgExpectedSalaryLpa}<span className="text-xs font-medium ml-1 text-nexus-text-muted">LPA</span></>
                    ) : '—'}
                  </p>
                </div>
                <div className="nexus-card p-3">
                  <p className="text-[10px] uppercase tracking-wider text-nexus-text-muted font-medium">Unique Skills Found</p>
                  <p className="text-2xl font-bold text-nexus-text-primary mt-0.5">{searchResults.summary.uniqueSkills.length}</p>
                </div>
              </div>

              {/* Unique skills cloud (clickable to add to filter) */}
              {searchResults.summary.uniqueSkills.length > 0 && (
                <div className="nexus-card p-3">
                  <p className="text-[11px] font-semibold text-nexus-text-secondary uppercase tracking-wider mb-2">Skills found in matching candidates (click to filter)</p>
                  <div className="flex flex-wrap gap-1.5">
                    {searchResults.summary.uniqueSkills.slice(0, 40).map(s => (
                      <button
                        key={s}
                        onClick={() => {
                          const current = searchFilters.skills.split(',').map(x => x.trim()).filter(Boolean);
                          if (!current.includes(s)) {
                            setSearchFilters({ ...searchFilters, skills: [...current, s].join(', ') });
                          }
                        }}
                        className="text-[10px] px-2 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100 transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Candidate cards */}
              {searchResults.candidates.length === 0 ? (
                <div className="nexus-card text-center py-12">
                  <FiUsers className="w-12 h-12 text-nexus-text-muted mx-auto mb-3" />
                  <p className="text-nexus-text-secondary font-medium">No candidates match your filters</p>
                  <p className="text-sm text-nexus-text-muted mt-1">Try widening the experience / salary range or removing some skills</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {searchResults.candidates.map((c: any, idx: number) => {
                    const masked = !isRecruiterOrAdmin ? maskCandidateFields({
                      candidateName: c.candidateName,
                      candidateEmail: c.candidateEmail,
                      candidatePhone: c.candidatePhone,
                    }, user?.role, piiPolicies) : null;
                    const displayName = masked?.candidateName ?? c.candidateName;
                    const displayEmail = masked?.candidateEmail ?? c.candidateEmail;
                    const displayPhone = masked?.candidatePhone ?? c.candidatePhone;
                    return (
                      <div key={c.candidateEmail} className="nexus-card p-4 hover:shadow-md transition-shadow">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[10px] font-mono text-nexus-text-muted">#{idx + 1}</span>
                              <h4 className="text-sm font-semibold text-nexus-text-primary">{displayName}</h4>
                              <span className={`text-[10px] px-2 py-0.5 rounded border ${getAppStatusBadge(c.latestStatus).className}`}>
                                {c.latestStatus}
                              </span>
                              {c.matchScore !== null && (
                                <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${
                                  c.matchScore >= 75 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                  c.matchScore >= 50 ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                                  'bg-rose-50 text-rose-700 border border-rose-200'
                                }`}>
                                  ★ Match: {Math.round(c.matchScore)}%
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-nexus-text-secondary">
                              <span className="flex items-center gap-1"><FiMail className="w-3 h-3" />{displayEmail}</span>
                              {displayPhone && <span className="flex items-center gap-1"><FiPhone className="w-3 h-3" />{displayPhone}</span>}
                              <span className="flex items-center gap-1"><FiBriefcase className="w-3 h-3" />{c.totalExperienceYears > 0 ? `${c.totalExperienceYears.toFixed(1)} yrs exp` : 'Exp unknown'}</span>
                              {c.expectedSalaryLpa !== null && (
                                <span className="flex items-center gap-1"><FiStar className="w-3 h-3" />₹{c.expectedSalaryLpa} LPA</span>
                              )}
                            </div>
                            {c.skills.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {c.skills.slice(0, 15).map((s: string, i: number) => (
                                  <span key={`${s}-${i}`} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                                    {s}
                                  </span>
                                ))}
                                {c.skills.length > 15 && (
                                  <span className="text-[10px] px-1.5 py-0.5 text-slate-500">+{c.skills.length - 15} more</span>
                                )}
                              </div>
                            )}
                            {c.applications.length > 0 && (
                              <div className="mt-2 text-[11px] text-nexus-text-muted">
                                <span className="font-medium">Applied to:</span>{' '}
                                {c.applications.slice(0, 3).map((a: any, i: number) => (
                                  <span key={a.id}>
                                    {i > 0 && ' · '}
                                    <span className="text-nexus-text-secondary">{a.jobTitle}</span>
                                    {a.company && <span className="text-nexus-text-muted"> ({a.company})</span>}
                                  </span>
                                ))}
                                {c.applications.length > 3 && <span className="text-nexus-text-muted"> +{c.applications.length - 3} more</span>}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Parsed Resume expandable panel                                              */
/* ─────────────────────────────────────────────────────────────────────────── */

function ParsedResumePanel({
  appId,
  state,
  parsing,
  onUpload,
  onReparse,
}: {
  appId: string;
  state: { parse: ResumeParseRow | null; parsed: ParsedResume | null; loading: boolean } | undefined;
  parsing: boolean;
  onUpload: (appId: string, file: File) => void;
  onReparse: (appId: string) => void;
}) {
  const parse = state?.parse || null;
  const parsed = state?.parsed || null;
  const loading = state?.loading || parsing;

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2">
          <FiFileText className="w-5 h-5 text-violet-500" />
          <h4 className="text-sm font-semibold text-nexus-text-primary">Parsed Resume</h4>
          {parse && (
            <div className="flex items-center gap-2 ml-2">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 uppercase">{parse.language || '—'}</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${parse.confidence >= 0.8 ? 'bg-emerald-100 text-emerald-700' : parse.confidence >= 0.5 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                {Math.round(parse.confidence * 100)}% conf
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 uppercase">{parse.sourceFormat}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* hidden file input */}
          <input
            id={`resume-upload-${appId}`}
            type="file"
            accept=".pdf,.docx,.doc,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,text/plain"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload(appId, f);
              e.target.value = '';
            }}
          />
          <label
            htmlFor={`resume-upload-${appId}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-violet-500 text-white text-xs font-medium rounded-lg hover:bg-violet-600 cursor-pointer transition-colors"
          >
            <FiUpload className="w-3.5 h-3.5" />
            Upload &amp; Parse
          </label>
          {parse && (
            <button
              onClick={() => onReparse(appId)}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-nexus-border text-xs font-medium rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              {loading ? <FiRefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FiRefreshCw className="w-3.5 h-3.5" />}
              Re-parse
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-nexus-text-muted py-6">
          <FiRefreshCw className="w-4 h-4 animate-spin" />
          Parsing resume…
        </div>
      ) : !parse ? (
        <div className="py-6 text-center">
          <FiFileText className="w-8 h-8 text-nexus-text-muted mx-auto mb-2" />
          <p className="text-sm text-nexus-text-secondary font-medium">No parsed resume yet</p>
          <p className="text-xs text-nexus-text-muted mt-1">Upload a PDF, DOCX, DOC, or TXT resume to extract structured data via ZAI.</p>
        </div>
      ) : parse.parseError && !parsed ? (
        <div className="p-4 rounded-lg bg-red-50 border border-red-200">
          <p className="text-sm font-semibold text-red-700">Parse failed</p>
          <p className="text-xs text-red-600 mt-1">{parse.parseError}</p>
        </div>
      ) : !parsed ? (
        <div className="p-4 rounded-lg bg-amber-50 border border-amber-200">
          <p className="text-sm text-amber-700">Resume was parsed but structured data is unavailable.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Top-level identity */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-white border border-nexus-border">
              <p className="text-xs font-semibold text-nexus-text-muted uppercase mb-1">Name</p>
              <p className="text-sm font-medium text-nexus-text-primary">{parsed.name || '—'}</p>
            </div>
            <div className="p-3 rounded-lg bg-white border border-nexus-border">
              <p className="text-xs font-semibold text-nexus-text-muted uppercase mb-1">Contact</p>
              <div className="text-sm text-nexus-text-secondary space-y-0.5">
                {parsed.email && <p className="flex items-center gap-1.5"><FiMail className="w-3 h-3" /> {parsed.email}</p>}
                {parsed.phone && <p className="flex items-center gap-1.5"><FiPhone className="w-3 h-3" /> {parsed.phone}</p>}
                {parsed.location && <p className="flex items-center gap-1.5"><FiMapPin className="w-3 h-3" /> {parsed.location}</p>}
              </div>
            </div>
          </div>

          {/* Summary */}
          {parsed.summary && (
            <div className="p-3 rounded-lg bg-white border border-nexus-border">
              <p className="text-xs font-semibold text-nexus-text-muted uppercase mb-1">Summary</p>
              <p className="text-sm text-nexus-text-secondary">{parsed.summary}</p>
            </div>
          )}

          {/* Skills */}
          {parsed.skills && parsed.skills.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-nexus-text-muted uppercase mb-2">Skills ({parsed.skills.length})</p>
              <div className="flex flex-wrap gap-1.5">
                {parsed.skills.map((s, i) => (
                  <span key={`${s}-${i}`} className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-medium border border-blue-100">{s}</span>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Experience */}
            <div>
              <p className="text-xs font-semibold text-nexus-text-muted uppercase mb-2 flex items-center gap-1.5"><FiWork className="w-3 h-3" /> Experience ({(parsed.experience || []).length})</p>
              <div className="space-y-2">
                {(parsed.experience || []).map((x, i) => (
                  <div key={i} className="p-3 rounded-lg bg-white border border-nexus-border">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-nexus-text-primary">{x.role || '—'} · {x.company || '—'}</p>
                      <span className="text-[10px] text-nexus-text-muted">{x.duration || ''}</span>
                    </div>
                    {x.description && <p className="text-xs text-nexus-text-secondary mt-1">{x.description}</p>}
                  </div>
                ))}
                {(parsed.experience || []).length === 0 && <p className="text-xs text-nexus-text-muted">No experience extracted.</p>}
              </div>
            </div>

            {/* Education */}
            <div>
              <p className="text-xs font-semibold text-nexus-text-muted uppercase mb-2 flex items-center gap-1.5"><FiAward className="w-3 h-3" /> Education ({(parsed.education || []).length})</p>
              <div className="space-y-2">
                {(parsed.education || []).map((e, i) => (
                  <div key={i} className="p-3 rounded-lg bg-white border border-nexus-border">
                    <p className="text-sm font-medium text-nexus-text-primary">{e.degree || '—'}</p>
                    <p className="text-xs text-nexus-text-secondary">{e.institution || '—'}{e.year ? ` · ${e.year}` : ''}</p>
                  </div>
                ))}
                {(parsed.education || []).length === 0 && <p className="text-xs text-nexus-text-muted">No education extracted.</p>}
              </div>
            </div>
          </div>

          {/* Certifications + Languages */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <p className="text-xs font-semibold text-nexus-text-muted uppercase mb-2">Certifications ({(parsed.certifications || []).length})</p>
              {(parsed.certifications || []).length > 0 ? (
                <ul className="text-sm text-nexus-text-secondary list-disc list-inside space-y-0.5">
                  {parsed.certifications.map((c, i) => <li key={i}>{c}</li>)}
                </ul>
              ) : <p className="text-xs text-nexus-text-muted">None extracted.</p>}
            </div>
            <div>
              <p className="text-xs font-semibold text-nexus-text-muted uppercase mb-2">Languages ({(parsed.languages || []).length})</p>
              {(parsed.languages || []).length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {parsed.languages.map((l, i) => <span key={i} className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-medium uppercase">{l}</span>)}
                </div>
              ) : <p className="text-xs text-nexus-text-muted">None extracted.</p>}
            </div>
          </div>

          {/* Parse error (non-fatal) */}
          {parse.parseError && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
              <strong>Note:</strong> {parse.parseError}
            </div>
          )}

          {/* Raw text preview */}
          <details className="group">
            <summary className="cursor-pointer text-xs font-semibold text-nexus-text-muted hover:text-nexus-text-primary flex items-center gap-1">
              <FiFileText className="w-3 h-3" /> Show raw extracted text
            </summary>
            <pre className="mt-2 p-3 rounded-lg bg-slate-50 border border-nexus-border text-xs text-nexus-text-secondary whitespace-pre-wrap max-h-48 overflow-y-auto">
              {/* rawText is not returned by the API to keep payloads small; show a hint instead */}
              Raw resume text is stored on the server (ResumeParse.rawText). Open this record via /api/ats/parse-resume/{`{id}`} to view it.
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}
