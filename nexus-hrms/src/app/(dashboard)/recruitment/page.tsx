'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  FiBriefcase, FiPlus, FiUsers, FiClock, FiMapPin, FiCalendar, FiX, FiStar,
  FiChevronDown, FiChevronUp, FiEdit2, FiTrash2, FiEye, FiSearch, FiFilter, FiCheckCircle,
  FiClipboard, FiMail, FiPhone, FiVideo, FiGlobe, FiSettings, FiTrendingUp,
  FiUserCheck, FiAward, FiTarget, FiBarChart2, FiArrowRight, FiExternalLink,
  FiCheck, FiXCircle, FiAlertCircle, FiMessageSquare, FiDollarSign, FiFileText,
  FiZap, FiSend,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

/* ── Types ── */
interface Department { id: string; name: string }

interface Requisition {
  id: string; requisitionId: string; departmentId?: string | null; designationId?: string | null;
  positionType: string; numberOfOpenings: number; employmentType: string; skillsRequired?: string | null;
  experienceRequired?: string | null; qualification?: string | null; salaryBudget?: string | null;
  priority: string; expectedJoiningDate?: string | null; justification?: string | null;
  approvalStatus: string; approvedBy?: string | null; approvedAt?: string | null;
  rejectionReason?: string | null; requestedBy?: string | null; status: string; createdAt: string;
}

interface JobPosting {
  id: string; title: string; position: string; location?: string | null; type: string;
  experience?: string | null; salary?: string | null; description: string; requirements?: string | null;
  status: string; postedDate?: string | null; closingDate?: string | null; vacancies: number;
  department?: { id: string; name: string } | null; applications?: JobApplication[];
  _count?: { applications: number }; isInternal?: boolean; isExternal?: boolean;
  externalPortals?: string | null;
}

interface JobApplication {
  id: string; jobPostingId: string; candidateName: string; candidateEmail: string;
  candidatePhone?: string | null; source: string; status: string; appliedDate: string;
  rating?: number | null; expectedSalary?: string | null; notes?: string | null;
  skills?: string | null; experience?: string | null; currentCtc?: string | null;
  expectedCtc?: string | null; noticePeriod?: string | null; currentLocation?: string | null;
  aiResumeScore?: number | null; aiInterviewScore?: number | null; aiScreeningResult?: string | null;
  recruiterStatus?: string; clientStatus?: string | null; offerStatus?: string | null;
  jobPosting?: { id: string; title: string; department?: { id: string; name: string } | null };
  interviews?: Interview[]; offers?: Offer[];
}

interface Interview {
  id: string; jobApplicationId: string; round: number; type: string; title?: string | null;
  date: string; time?: string | null; duration?: number | null; location?: string | null;
  meetingUrl?: string | null; interviewerIds?: string | null; interviewerNames?: string | null;
  status: string; feedback?: string | null; score?: number | null; recommendation?: string | null;
  aiScore?: number | null; aiFeedback?: string | null;
  jobApplication?: { id: string; candidateName: string; candidateEmail: string; jobPosting?: { id: string; title: string; department?: { id: string; name: string } | null } };
}

interface Offer {
  id: string; jobApplicationId: string; offerNumber: string; candidateName: string;
  candidateEmail: string; jobTitle?: string | null; departmentId?: string | null;
  offeredSalary?: number | null; currency: string; salaryBreakup?: string | null;
  joiningBonus?: number | null; retentionBonus?: number | null; variablePay?: number | null;
  offerDate: string; joiningDate?: string | null; offerExpiryDate?: string | null;
  approvalStatus: string; candidateResponse?: string | null; responseDate?: string | null;
  negotiationNotes?: string | null; status: string; convertedToEmployee: boolean;
  employeeId?: string | null; notes?: string | null; createdAt: string;
  jobApplication?: { id: string; candidateName: string; candidateEmail: string; candidatePhone?: string; jobPosting?: { id: string; title: string; department?: { id: string; name: string } | null } };
}

/* ── Helpers ── */
function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('nexus_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

function formatDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatCurrency(n: number | null | undefined, currency = 'USD') {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

function getJobStatusBadge(status: string) {
  const map: Record<string, string> = { open: 'nexus-badge nexus-badge-success', closed: 'nexus-badge nexus-badge-error', on_hold: 'nexus-badge nexus-badge-warning', filled: 'nexus-badge nexus-badge-info', draft: 'nexus-badge' };
  const labels: Record<string, string> = { open: 'Open', closed: 'Closed', on_hold: 'On Hold', filled: 'Filled', draft: 'Draft' };
  return { className: map[status] || 'nexus-badge nexus-badge-info', label: labels[status] || status };
}

function getAppStatusBadge(status: string) {
  const map: Record<string, string> = { applied: 'nexus-badge nexus-badge-info', screening: 'nexus-badge nexus-badge-warning', ai_screening: 'bg-purple-50 text-purple-700 nexus-badge', interview: 'bg-orange-50 text-orange-700 nexus-badge', offered: 'bg-pink-50 text-pink-700 nexus-badge', hired: 'nexus-badge nexus-badge-success', rejected: 'nexus-badge nexus-badge-error', on_hold: 'nexus-badge nexus-badge-warning' };
  const labels: Record<string, string> = { applied: 'Applied', screening: 'Screening', ai_screening: 'AI Screening', interview: 'Interview', offered: 'Offered', hired: 'Hired', rejected: 'Rejected', on_hold: 'On Hold' };
  return { className: map[status] || 'nexus-badge nexus-badge-info', label: labels[status] || status };
}

function getApprovalBadge(status: string) {
  const map: Record<string, string> = { draft: 'nexus-badge', pending_manager: 'nexus-badge nexus-badge-warning', pending_hr: 'bg-orange-50 text-orange-700 nexus-badge', pending_budget: 'bg-purple-50 text-purple-700 nexus-badge', approved: 'nexus-badge nexus-badge-success', rejected: 'nexus-badge nexus-badge-error', cancelled: 'nexus-badge nexus-badge-info' };
  const labels: Record<string, string> = { draft: 'Draft', pending_manager: 'Pending Manager', pending_hr: 'Pending HR', pending_budget: 'Pending Budget', approved: 'Approved', rejected: 'Rejected', cancelled: 'Cancelled' };
  return { className: map[status] || 'nexus-badge', label: labels[status] || status };
}

function getPriorityBadge(priority: string) {
  const map: Record<string, string> = { low: 'nexus-badge nexus-badge-success', medium: 'nexus-badge nexus-badge-warning', high: 'bg-orange-50 text-orange-700 nexus-badge', critical: 'nexus-badge nexus-badge-error' };
  return { className: map[priority] || 'nexus-badge', label: priority.charAt(0).toUpperCase() + priority.slice(1) };
}

function getInterviewStatusBadge(status: string) {
  const map: Record<string, string> = { scheduled: 'nexus-badge nexus-badge-info', in_progress: 'nexus-badge nexus-badge-warning', completed: 'nexus-badge nexus-badge-success', cancelled: 'nexus-badge nexus-badge-error', rescheduled: 'bg-purple-50 text-purple-700 nexus-badge', no_show: 'bg-gray-50 text-gray-700 nexus-badge' };
  const labels: Record<string, string> = { scheduled: 'Scheduled', in_progress: 'In Progress', completed: 'Completed', cancelled: 'Cancelled', rescheduled: 'Rescheduled', no_show: 'No Show' };
  return { className: map[status] || 'nexus-badge', label: labels[status] || status };
}

function getOfferStatusBadge(status: string) {
  const map: Record<string, string> = { draft: 'nexus-badge', pending_approval: 'nexus-badge nexus-badge-warning', approved: 'nexus-badge nexus-badge-success', released: 'bg-blue-50 text-blue-700 nexus-badge', accepted: 'nexus-badge nexus-badge-success', rejected: 'nexus-badge nexus-badge-error', withdrawn: 'nexus-badge nexus-badge-info', expired: 'bg-gray-50 text-gray-700 nexus-badge' };
  const labels: Record<string, string> = { draft: 'Draft', pending_approval: 'Pending Approval', approved: 'Approved', released: 'Released', accepted: 'Accepted', rejected: 'Rejected', withdrawn: 'Withdrawn', expired: 'Expired' };
  return { className: map[status] || 'nexus-badge', label: labels[status] || status };
}

const TABS = [
  { key: 'dashboard', label: 'Dashboard', icon: FiBarChart2 },
  { key: 'requisitions', label: 'Requisitions', icon: FiClipboard },
  { key: 'jobs', label: 'Job Postings', icon: FiBriefcase },
  { key: 'candidates', label: 'Candidates', icon: FiUsers },
  { key: 'interviews', label: 'Interviews', icon: FiCalendar },
  { key: 'offers', label: 'Offers', icon: FiMail },
  { key: 'career', label: 'Career Page', icon: FiGlobe },
  { key: 'settings', label: 'Settings', icon: FiSettings },
];

const APP_STATUSES = ['applied','screening','ai_screening','interview','offered','hired','rejected','on_hold'];
const INTERVIEW_TYPES = ['ai_screening','technical','hr','managerial','client','final'];
const INTERVIEW_STATUSES = ['scheduled','in_progress','completed','cancelled','rescheduled','no_show'];
const SOURCES = ['website','referral','linkedin','indeed','naukri','vendor','internal','other'];

/* ── Component ── */
export default function RecruitmentPage() {
  const { user } = useAuthStore();
  const isAdmin = ['super_admin','tenant_admin','hr_admin'].includes(user?.role || '');
  const searchParams = useSearchParams();
  const router = useRouter();
  const activeTab = searchParams.get('tab') || 'dashboard';

  const setTab = (tab: string) => { router.push(`/recruitment?tab=${tab}`); };

  // Shared state
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);

  // Requisitions state
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [showReqForm, setShowReqForm] = useState(false);
  const [editingReqId, setEditingReqId] = useState<string | null>(null);
  const [reqForm, setReqForm] = useState({ departmentId:'', positionType:'new', numberOfOpenings:'1', employmentType:'full-time', skillsRequired:'', experienceRequired:'', qualification:'', salaryBudget:'', priority:'medium', expectedJoiningDate:'', justification:'', approvalStatus:'draft' });
  const [submittingReq, setSubmittingReq] = useState(false);
  const [viewingReqId, setViewingReqId] = useState<string | null>(null);
  const [deleteConfirmReqId, setDeleteConfirmReqId] = useState<string | null>(null);
  const [deletingReq, setDeletingReq] = useState(false);

  // Jobs state
  const [jobPostings, setJobPostings] = useState<JobPosting[]>([]);
  const [showJobForm, setShowJobForm] = useState(false);
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [jobForm, setJobForm] = useState({ title:'', departmentId:'', position:'', location:'', type:'full-time', experience:'', salary:'', description:'', requirements:'', vacancies:'1', closingDate:'', isInternal:false, isExternal:true });
  const [submittingJob, setSubmittingJob] = useState(false);
  const [viewingJobId, setViewingJobId] = useState<string | null>(null);
  const [deleteConfirmJobId, setDeleteConfirmJobId] = useState<string | null>(null);
  const [deletingJob, setDeletingJob] = useState(false);
  const [expandedJob, setExpandedJob] = useState<string | null>(null);

  // Candidates state
  const [candidates, setCandidates] = useState<JobApplication[]>([]);
  const [showCandidateForm, setShowCandidateForm] = useState(false);
  const [candidateForm, setCandidateForm] = useState({ jobPostingId:'', candidateName:'', candidateEmail:'', candidatePhone:'', source:'website', skills:'', experience:'', currentCtc:'', expectedCtc:'', noticePeriod:'', currentLocation:'', expectedSalary:'' });
  const [submittingCandidate, setSubmittingCandidate] = useState(false);
  const [viewingCandidateId, setViewingCandidateId] = useState<string | null>(null);
  const [candidateSearch, setCandidateSearch] = useState('');
  const [candidateFilter, setCandidateFilter] = useState('');

  // Interviews state
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [showInterviewForm, setShowInterviewForm] = useState(false);
  const [interviewForm, setInterviewForm] = useState({ jobApplicationId:'', round:'1', type:'technical', title:'', date:'', time:'', duration:'60', location:'', meetingUrl:'', interviewerNames:'' });
  const [submittingInterview, setSubmittingInterview] = useState(false);
  const [viewingInterviewId, setViewingInterviewId] = useState<string | null>(null);
  const [interviewFilter, setInterviewFilter] = useState('');

  // Offers state
  const [offers, setOffers] = useState<Offer[]>([]);
  const [showOfferForm, setShowOfferForm] = useState(false);
  const [offerForm, setOfferForm] = useState({ jobApplicationId:'', candidateName:'', candidateEmail:'', jobTitle:'', departmentId:'', offeredSalary:'', currency:'USD', joiningBonus:'', retentionBonus:'', variablePay:'', joiningDate:'', offerExpiryDate:'', notes:'' });
  const [submittingOffer, setSubmittingOffer] = useState(false);
  const [viewingOfferId, setViewingOfferId] = useState<string | null>(null);
  const [deleteConfirmOfferId, setDeleteConfirmOfferId] = useState<string | null>(null);
  const [deletingOffer, setDeletingOffer] = useState(false);
  const [offerFilter, setOfferFilter] = useState('');

  // Fetch all data
  const fetchAllData = useCallback(async () => {
    try {
      setLoading(true);
      const headers = getAuthHeaders();
      const [reqRes, jobsRes, candRes, intRes, offRes, deptRes] = await Promise.allSettled([
        fetch('/api/manpower-requisitions?limit=100', { headers }),
        fetch('/api/recruitment?limit=50', { headers }),
        fetch('/api/candidates?limit=100', { headers }),
        fetch('/api/interviews?limit=100', { headers }),
        fetch('/api/offers?limit=100', { headers }),
        fetch('/api/departments?limit=100', { headers }),
      ]);
      if (reqRes.status === 'fulfilled' && reqRes.value.ok) { const d = await reqRes.value.json(); setRequisitions(d.requisitions || []); }
      if (jobsRes.status === 'fulfilled' && jobsRes.value.ok) { const d = await jobsRes.value.json(); setJobPostings(d.jobPostings || []); }
      if (candRes.status === 'fulfilled' && candRes.value.ok) { const d = await candRes.value.json(); setCandidates(d.candidates || []); }
      if (intRes.status === 'fulfilled' && intRes.value.ok) { const d = await intRes.value.json(); setInterviews(d.interviews || []); }
      if (offRes.status === 'fulfilled' && offRes.value.ok) { const d = await offRes.value.json(); setOffers(d.offers || []); }
      if (deptRes.status === 'fulfilled' && deptRes.value.ok) { const d = await deptRes.value.json(); setDepartments(d.departments || []); }
    } catch { toast.error('Failed to load recruitment data'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { queueMicrotask(() => fetchAllData()); }, [fetchAllData]);

  /* ── Requisition Handlers ── */
  const handleSaveReq = async () => {
    if (!reqForm.departmentId) { toast.error('Department is required'); return; }
    try {
      setSubmittingReq(true);
      const payload = { ...reqForm, numberOfOpenings: parseInt(reqForm.numberOfOpenings) || 1 };
      const url = editingReqId ? `/api/manpower-requisitions/${editingReqId}` : '/api/manpower-requisitions';
      const method = editingReqId ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, headers: getAuthHeaders(), body: JSON.stringify(payload) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success(editingReqId ? 'Requisition updated' : 'Requisition created');
      setShowReqForm(false); setEditingReqId(null); fetchAllData();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Failed'); }
    finally { setSubmittingReq(false); }
  };

  const handleApproveReq = async (id: string, currentStatus: string) => {
    const nextStatus: Record<string, string> = { draft: 'pending_manager', pending_manager: 'pending_hr', pending_hr: 'pending_budget', pending_budget: 'approved' };
    const next = nextStatus[currentStatus];
    if (!next) return;
    try {
      const res = await fetch(`/api/manpower-requisitions/${id}`, { method: 'PATCH', headers: getAuthHeaders(), body: JSON.stringify({ approvalStatus: next }) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success(`Requisition ${next === 'approved' ? 'approved' : 'moved to ' + next.replace(/_/g, ' ')}`);
      fetchAllData();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Failed'); }
  };

  const handleRejectReq = async (id: string) => {
    const reason = prompt('Enter rejection reason:');
    if (!reason) return;
    try {
      const res = await fetch(`/api/manpower-requisitions/${id}`, { method: 'PATCH', headers: getAuthHeaders(), body: JSON.stringify({ approvalStatus: 'rejected', rejectionReason: reason }) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('Requisition rejected'); fetchAllData();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Failed'); }
  };

  const handleDeleteReq = async (id: string) => {
    try {
      setDeletingReq(true);
      const res = await fetch(`/api/manpower-requisitions/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('Requisition deleted'); setDeleteConfirmReqId(null); fetchAllData();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Failed'); }
    finally { setDeletingReq(false); }
  };

  /* ── Job Handlers ── */
  const handleSaveJob = async () => {
    if (!jobForm.title || !jobForm.departmentId || !jobForm.description) { toast.error('Title, department, and description are required'); return; }
    try {
      setSubmittingJob(true);
      const payload = { ...jobForm, vacancies: parseInt(jobForm.vacancies) || 1, isInternal: jobForm.isInternal, isExternal: jobForm.isExternal };
      if (editingJobId) {
        const res = await fetch(`/api/recruitment/${editingJobId}`, { method: 'PUT', headers: getAuthHeaders(), body: JSON.stringify(payload) });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
        toast.success('Job posting updated');
      } else {
        const res = await fetch('/api/recruitment', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify(payload) });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
        toast.success('Job posting created');
      }
      setShowJobForm(false); setEditingJobId(null); fetchAllData();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Failed'); }
    finally { setSubmittingJob(false); }
  };

  const handleDeleteJob = async (id: string) => {
    try {
      setDeletingJob(true);
      const res = await fetch(`/api/recruitment/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('Job posting deleted'); setDeleteConfirmJobId(null); fetchAllData();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Failed'); }
    finally { setDeletingJob(false); }
  };

  /* ── Candidate Handlers ── */
  const handleSaveCandidate = async () => {
    if (!candidateForm.jobPostingId || !candidateForm.candidateName || !candidateForm.candidateEmail) { toast.error('Job, name, and email are required'); return; }
    try {
      setSubmittingCandidate(true);
      const res = await fetch('/api/candidates', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify(candidateForm) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('Candidate added'); setShowCandidateForm(false); fetchAllData();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Failed'); }
    finally { setSubmittingCandidate(false); }
  };

  const handleUpdateCandidateStatus = async (id: string, status: string) => {
    try {
      const res = await fetch(`/api/candidates/${id}`, { method: 'PATCH', headers: getAuthHeaders(), body: JSON.stringify({ status }) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('Status updated'); fetchAllData();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Failed'); }
  };

  /* ── Interview Handlers ── */
  const handleSaveInterview = async () => {
    if (!interviewForm.jobApplicationId || !interviewForm.date) { toast.error('Candidate and date are required'); return; }
    try {
      setSubmittingInterview(true);
      const payload = { ...interviewForm, round: parseInt(interviewForm.round) || 1, duration: parseInt(interviewForm.duration) || 60, interviewerNames: JSON.stringify(interviewForm.interviewerNames ? interviewForm.interviewerNames.split(',').map(s => s.trim()) : []) };
      const res = await fetch('/api/interviews', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify(payload) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('Interview scheduled'); setShowInterviewForm(false); fetchAllData();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Failed'); }
    finally { setSubmittingInterview(false); }
  };

  /* ── Offer Handlers ── */
  const handleSaveOffer = async () => {
    if (!offerForm.jobApplicationId || !offerForm.candidateName || !offerForm.candidateEmail) { toast.error('Candidate info is required'); return; }
    try {
      setSubmittingOffer(true);
      const payload = { ...offerForm, offeredSalary: offerForm.offeredSalary ? parseFloat(offerForm.offeredSalary) : null, joiningBonus: offerForm.joiningBonus ? parseFloat(offerForm.joiningBonus) : null, retentionBonus: offerForm.retentionBonus ? parseFloat(offerForm.retentionBonus) : null, variablePay: offerForm.variablePay ? parseFloat(offerForm.variablePay) : null };
      const res = await fetch('/api/offers', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify(payload) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('Offer created'); setShowOfferForm(false); fetchAllData();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Failed'); }
    finally { setSubmittingOffer(false); }
  };

  const handleDeleteOffer = async (id: string) => {
    try {
      setDeletingOffer(true);
      const res = await fetch(`/api/offers/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('Offer deleted'); setDeleteConfirmOfferId(null); fetchAllData();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Failed'); }
    finally { setDeletingOffer(false); }
  };

  const handleOfferAction = async (id: string, action: string) => {
    try {
      let body: Record<string, unknown> = {};
      if (action === 'approve') body = { approvalStatus: 'approved', status: 'approved' };
      else if (action === 'release') body = { status: 'released' };
      else if (action === 'accept') body = { candidateResponse: 'accepted', status: 'accepted', responseDate: new Date().toISOString() };
      else if (action === 'reject') body = { candidateResponse: 'rejected', status: 'rejected', responseDate: new Date().toISOString() };
      else if (action === 'convert') body = { action: 'convert_to_employee' };

      const res = await fetch(`/api/offers/${id}`, { method: 'PATCH', headers: getAuthHeaders(), body: JSON.stringify(body) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success(`Offer ${action}d successfully`);
      fetchAllData();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Failed'); }
  };

  /* ── Computed Stats ── */
  const openPositions = jobPostings.filter(j => j.status === 'open').reduce((sum, j) => sum + j.vacancies, 0);
  const totalApplications = candidates.length;
  const interviewsScheduled = interviews.filter(i => i.status === 'scheduled').length;
  const offersPending = offers.filter(o => ['draft','pending_approval','approved','released'].includes(o.status)).length;
  const hiredCount = candidates.filter(c => c.status === 'hired').length;

  /* ── RENDER ── */
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-nexus-text-primary flex items-center gap-2">
            <FiBriefcase className="w-6 h-6 text-violet-500" />
            Recruitment
          </h1>
          <p className="text-nexus-text-secondary mt-1">Manage hiring pipeline from requisition to onboarding</p>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button key={tab.key} onClick={() => setTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${activeTab === tab.key ? 'bg-white text-nexus-text-primary shadow-sm' : 'text-nexus-text-secondary hover:text-nexus-text-primary'}`}>
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ═══════════════════ DASHBOARD TAB ═══════════════════ */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {[
              { label: 'Open Positions', value: openPositions, icon: FiBriefcase, color: 'text-violet-500', bg: 'bg-violet-50' },
              { label: 'Total Applications', value: totalApplications, icon: FiUsers, color: 'text-blue-500', bg: 'bg-blue-50' },
              { label: 'Interviews Scheduled', value: interviewsScheduled, icon: FiCalendar, color: 'text-amber-500', bg: 'bg-amber-50' },
              { label: 'Offers Pending', value: offersPending, icon: FiMail, color: 'text-pink-500', bg: 'bg-pink-50' },
              { label: 'Hired', value: hiredCount, icon: FiUserCheck, color: 'text-emerald-500', bg: 'bg-emerald-50' },
            ].map(stat => (
              <div key={stat.label} className="nexus-card p-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg ${stat.bg} flex items-center justify-center`}>
                    <stat.icon className={`w-5 h-5 ${stat.color}`} />
                  </div>
                  <div>
                    <p className="text-lg font-bold text-nexus-text-primary">{stat.value}</p>
                    <p className="text-xs text-nexus-text-muted">{stat.label}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pipeline Overview */}
          <div className="nexus-card p-6">
            <h3 className="text-lg font-semibold text-nexus-text-primary mb-4 flex items-center gap-2">
              <FiTrendingUp className="w-5 h-5 text-violet-500" />
              Candidate Pipeline
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
              {APP_STATUSES.slice(0, 7).map(status => {
                const count = candidates.filter(c => c.status === status).length;
                const badge = getAppStatusBadge(status);
                return (
                  <div key={status} className="text-center p-3 rounded-lg border border-nexus-border">
                    <p className="text-2xl font-bold text-nexus-text-primary">{count}</p>
                    <span className={`${badge.className} text-xs mt-1 inline-block`}>{badge.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recent Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="nexus-card p-6">
              <h3 className="text-sm font-semibold text-nexus-text-primary mb-4">Recent Applications</h3>
              <div className="space-y-3">
                {candidates.slice(0, 5).map(c => (
                  <div key={c.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50">
                    <div>
                      <p className="text-sm font-medium text-nexus-text-primary">{c.candidateName}</p>
                      <p className="text-xs text-nexus-text-muted">{c.jobPosting?.title || '—'}</p>
                    </div>
                    <span className={getAppStatusBadge(c.status).className}>{getAppStatusBadge(c.status).label}</span>
                  </div>
                ))}
                {candidates.length === 0 && <p className="text-sm text-nexus-text-muted text-center py-4">No applications yet</p>}
              </div>
            </div>
            <div className="nexus-card p-6">
              <h3 className="text-sm font-semibold text-nexus-text-primary mb-4">Upcoming Interviews</h3>
              <div className="space-y-3">
                {interviews.filter(i => i.status === 'scheduled').slice(0, 5).map(i => (
                  <div key={i.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50">
                    <div>
                      <p className="text-sm font-medium text-nexus-text-primary">{i.jobApplication?.candidateName || '—'}</p>
                      <p className="text-xs text-nexus-text-muted">Round {i.round} · {formatDate(i.date)}</p>
                    </div>
                    <span className={getInterviewStatusBadge(i.status).className}>{getInterviewStatusBadge(i.status).label}</span>
                  </div>
                ))}
                {interviews.filter(i => i.status === 'scheduled').length === 0 && <p className="text-sm text-nexus-text-muted text-center py-4">No upcoming interviews</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════ REQUISITIONS TAB ═══════════════════ */}
      {activeTab === 'requisitions' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 flex-1 mr-4">
              <div className="nexus-card p-3"><p className="text-lg font-bold text-nexus-text-primary">{requisitions.length}</p><p className="text-xs text-nexus-text-muted">Total</p></div>
              <div className="nexus-card p-3"><p className="text-lg font-bold text-amber-600">{requisitions.filter(r => r.approvalStatus.startsWith('pending')).length}</p><p className="text-xs text-nexus-text-muted">Pending</p></div>
              <div className="nexus-card p-3"><p className="text-lg font-bold text-emerald-600">{requisitions.filter(r => r.approvalStatus === 'approved').length}</p><p className="text-xs text-nexus-text-muted">Approved</p></div>
              <div className="nexus-card p-3"><p className="text-lg font-bold text-red-600">{requisitions.filter(r => r.approvalStatus === 'rejected').length}</p><p className="text-xs text-nexus-text-muted">Rejected</p></div>
            </div>
            {isAdmin && (
              <button onClick={() => { setShowReqForm(true); setEditingReqId(null); setReqForm({ departmentId:'', positionType:'new', numberOfOpenings:'1', employmentType:'full-time', skillsRequired:'', experienceRequired:'', qualification:'', salaryBudget:'', priority:'medium', expectedJoiningDate:'', justification:'', approvalStatus:'draft' }); }}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium text-sm shadow-sm shadow-blue-500/25 whitespace-nowrap">
                <FiPlus className="w-4 h-4" /> Add Requisition
              </button>
            )}
          </div>

          {showReqForm && (
            <div id="req-form" className="nexus-card border-l-4 border-l-teal-500 p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-nexus-text-primary">{editingReqId ? 'Edit Requisition' : 'New Manpower Requisition'}</h2>
                <button onClick={() => setShowReqForm(false)} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100"><FiX className="w-5 h-5" /></button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Department *</label>
                  <select value={reqForm.departmentId} onChange={e => setReqForm(p => ({ ...p, departmentId: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                    <option value="">Select Department</option>{departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select></div>
                <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Position Type</label>
                  <select value={reqForm.positionType} onChange={e => setReqForm(p => ({ ...p, positionType: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                    <option value="new">New Position</option><option value="replacement">Replacement</option>
                  </select></div>
                <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Openings</label>
                  <input type="number" min="1" value={reqForm.numberOfOpenings} onChange={e => setReqForm(p => ({ ...p, numberOfOpenings: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
                <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Employment Type</label>
                  <select value={reqForm.employmentType} onChange={e => setReqForm(p => ({ ...p, employmentType: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                    <option value="full-time">Full-time</option><option value="part-time">Part-time</option><option value="contract">Contract</option><option value="internship">Internship</option>
                  </select></div>
                <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Priority</label>
                  <select value={reqForm.priority} onChange={e => setReqForm(p => ({ ...p, priority: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                    <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option>
                  </select></div>
                <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Salary Budget</label>
                  <input type="text" value={reqForm.salaryBudget} onChange={e => setReqForm(p => ({ ...p, salaryBudget: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" placeholder="e.g., $80K-$120K" /></div>
                <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Skills Required</label>
                  <input type="text" value={reqForm.skillsRequired} onChange={e => setReqForm(p => ({ ...p, skillsRequired: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" placeholder="React, Node.js, etc." /></div>
                <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Experience</label>
                  <input type="text" value={reqForm.experienceRequired} onChange={e => setReqForm(p => ({ ...p, experienceRequired: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" placeholder="3-5 years" /></div>
                <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Expected Joining</label>
                  <input type="date" value={reqForm.expectedJoiningDate} onChange={e => setReqForm(p => ({ ...p, expectedJoiningDate: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
                <div className="sm:col-span-2 lg:col-span-3"><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Justification</label>
                  <textarea rows={2} value={reqForm.justification} onChange={e => setReqForm(p => ({ ...p, justification: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none" /></div>
              </div>
              <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-nexus-border">
                <button onClick={() => setShowReqForm(false)} className="px-4 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50">Cancel</button>
                <button onClick={handleSaveReq} disabled={submittingReq} className="px-6 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 shadow-sm shadow-blue-500/25">
                  {submittingReq ? 'Saving...' : 'Save'}</button>
              </div>
            </div>
          )}

          {/* Requisitions Table */}
          <div className="nexus-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr className="border-b border-nexus-border bg-slate-50/50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase">ID</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase">Department</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase">Openings</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase">Priority</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase">Approval</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase">Joining</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase">Actions</th>
                </tr></thead>
                <tbody>
                  {loading ? Array.from({length:3}).map((_,i) => (
                    <tr key={i} className="border-b border-nexus-border/50 animate-pulse"><td className="px-4 py-3"><div className="h-3 w-24 bg-slate-200 rounded" /></td><td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded" /></td><td className="px-4 py-3"><div className="h-3 w-8 bg-slate-200 rounded" /></td><td className="px-4 py-3"><div className="h-5 w-16 bg-slate-200 rounded-full" /></td><td className="px-4 py-3"><div className="h-5 w-20 bg-slate-200 rounded-full" /></td><td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded" /></td><td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded ml-auto" /></td></tr>
                  )) : requisitions.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-12 text-center"><FiClipboard className="w-10 h-10 text-nexus-text-muted mx-auto mb-3" /><p className="text-nexus-text-secondary font-medium">No requisitions yet</p></td></tr>
                  ) : requisitions.map(req => (
                    <tr key={req.id} className="border-b border-nexus-border/50 hover:bg-slate-50/50 transition-colors">
                      {deleteConfirmReqId === req.id ? (
                        <td colSpan={7} className="px-4 py-3 bg-red-50">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-red-700 font-medium">Delete requisition {req.requisitionId}?</span>
                            <div className="flex gap-2">
                              <button onClick={() => handleDeleteReq(req.id)} disabled={deletingReq} className="px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded-lg hover:bg-red-600 disabled:opacity-50">{deletingReq ? 'Deleting...' : 'Confirm'}</button>
                              <button onClick={() => setDeleteConfirmReqId(null)} className="px-3 py-1.5 border border-nexus-border text-xs font-medium rounded-lg hover:bg-slate-50">Cancel</button>
                            </div>
                          </div>
                        </td>
                      ) : (
                        <>
                          <td className="px-4 py-3 text-sm font-medium text-nexus-text-primary">{req.requisitionId}</td>
                          <td className="px-4 py-3 text-sm text-nexus-text-secondary">{departments.find(d => d.id === req.departmentId)?.name || '—'}</td>
                          <td className="px-4 py-3 text-sm text-nexus-text-primary">{req.numberOfOpenings}</td>
                          <td className="px-4 py-3"><span className={getPriorityBadge(req.priority).className}>{getPriorityBadge(req.priority).label}</span></td>
                          <td className="px-4 py-3"><span className={getApprovalBadge(req.approvalStatus).className}>{getApprovalBadge(req.approvalStatus).label}</span></td>
                          <td className="px-4 py-3 text-sm text-nexus-text-secondary">{formatDate(req.expectedJoiningDate)}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              {isAdmin && req.approvalStatus !== 'approved' && req.approvalStatus !== 'rejected' && (
                                <button onClick={() => handleApproveReq(req.id, req.approvalStatus)} className="p-2 rounded-lg text-nexus-text-muted hover:text-emerald-500 hover:bg-emerald-50 transition-colors" title="Approve"><FiCheck className="w-4 h-4" /></button>
                              )}
                              {isAdmin && req.approvalStatus.startsWith('pending') && (
                                <button onClick={() => handleRejectReq(req.id)} className="p-2 rounded-lg text-nexus-text-muted hover:text-red-500 hover:bg-red-50 transition-colors" title="Reject"><FiXCircle className="w-4 h-4" /></button>
                              )}
                              <button onClick={() => setViewingReqId(viewingReqId === req.id ? null : req.id)} className="p-2 rounded-lg text-nexus-text-muted hover:text-teal-500 hover:bg-teal-50 transition-colors" title="View"><FiEye className="w-4 h-4" /></button>
                              {isAdmin && <button onClick={() => setDeleteConfirmReqId(req.id)} className="p-2 rounded-lg text-nexus-text-muted hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete"><FiTrash2 className="w-4 h-4" /></button>}
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {viewingReqId && (() => {
            const req = requisitions.find(r => r.id === viewingReqId);
            if (!req) return null;
            return (
              <div className="nexus-card border-l-4 border-l-teal-500 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-nexus-text-primary">Requisition Details — {req.requisitionId}</h3>
                  <button onClick={() => setViewingReqId(null)} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100"><FiX className="w-5 h-5" /></button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div><p className="text-xs font-medium text-nexus-text-muted">Department</p><p className="text-sm text-nexus-text-primary mt-0.5">{departments.find(d => d.id === req.departmentId)?.name || '—'}</p></div>
                  <div><p className="text-xs font-medium text-nexus-text-muted">Position Type</p><p className="text-sm text-nexus-text-primary mt-0.5 capitalize">{req.positionType}</p></div>
                  <div><p className="text-xs font-medium text-nexus-text-muted">Openings</p><p className="text-sm text-nexus-text-primary mt-0.5">{req.numberOfOpenings}</p></div>
                  <div><p className="text-xs font-medium text-nexus-text-muted">Employment Type</p><p className="text-sm text-nexus-text-primary mt-0.5 capitalize">{req.employmentType}</p></div>
                  <div><p className="text-xs font-medium text-nexus-text-muted">Priority</p><p className="mt-0.5"><span className={getPriorityBadge(req.priority).className}>{req.priority}</span></p></div>
                  <div><p className="text-xs font-medium text-nexus-text-muted">Approval Status</p><p className="mt-0.5"><span className={getApprovalBadge(req.approvalStatus).className}>{getApprovalBadge(req.approvalStatus).label}</span></p></div>
                  <div><p className="text-xs font-medium text-nexus-text-muted">Skills</p><p className="text-sm text-nexus-text-primary mt-0.5">{req.skillsRequired || '—'}</p></div>
                  <div><p className="text-xs font-medium text-nexus-text-muted">Experience</p><p className="text-sm text-nexus-text-primary mt-0.5">{req.experienceRequired || '—'}</p></div>
                  <div><p className="text-xs font-medium text-nexus-text-muted">Salary Budget</p><p className="text-sm text-nexus-text-primary mt-0.5">{req.salaryBudget || '—'}</p></div>
                  <div><p className="text-xs font-medium text-nexus-text-muted">Expected Joining</p><p className="text-sm text-nexus-text-primary mt-0.5">{formatDate(req.expectedJoiningDate)}</p></div>
                  <div className="sm:col-span-2 lg:col-span-3"><p className="text-xs font-medium text-nexus-text-muted">Justification</p><p className="text-sm text-nexus-text-primary mt-0.5">{req.justification || '—'}</p></div>
                  {req.rejectionReason && <div className="sm:col-span-2 lg:col-span-3"><p className="text-xs font-medium text-nexus-text-muted">Rejection Reason</p><p className="text-sm text-red-600 mt-0.5">{req.rejectionReason}</p></div>}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ═══════════════════ JOB POSTINGS TAB ═══════════════════ */}
      {activeTab === 'jobs' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex gap-4">
              <div className="nexus-card p-3"><p className="text-lg font-bold text-emerald-600">{jobPostings.filter(j => j.status === 'open').length}</p><p className="text-xs text-nexus-text-muted">Open</p></div>
              <div className="nexus-card p-3"><p className="text-lg font-bold text-nexus-text-primary">{jobPostings.length}</p><p className="text-xs text-nexus-text-muted">Total</p></div>
            </div>
            {isAdmin && (
              <button onClick={() => { setShowJobForm(true); setEditingJobId(null); setJobForm({ title:'', departmentId:'', position:'', location:'', type:'full-time', experience:'', salary:'', description:'', requirements:'', vacancies:'1', closingDate:'', isInternal:false, isExternal:true }); }}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium text-sm shadow-sm shadow-blue-500/25">
                <FiPlus className="w-4 h-4" /> Post Job
              </button>
            )}
          </div>

          {showJobForm && (
            <div className="nexus-card border-l-4 border-l-violet-500 p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-nexus-text-primary">{editingJobId ? 'Edit Job Posting' : 'Post New Job'}</h2>
                <button onClick={() => setShowJobForm(false)} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100"><FiX className="w-5 h-5" /></button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Job Title *</label><input type="text" value={jobForm.title} onChange={e => setJobForm(p => ({...p, title: e.target.value}))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
                <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Department *</label>
                  <select value={jobForm.departmentId} onChange={e => setJobForm(p => ({...p, departmentId: e.target.value}))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                    <option value="">Select</option>{departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select></div>
                <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Position</label><input type="text" value={jobForm.position} onChange={e => setJobForm(p => ({...p, position: e.target.value}))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
                <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Location</label><input type="text" value={jobForm.location} onChange={e => setJobForm(p => ({...p, location: e.target.value}))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
                <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Type</label>
                  <select value={jobForm.type} onChange={e => setJobForm(p => ({...p, type: e.target.value}))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                    <option value="full-time">Full-time</option><option value="part-time">Part-time</option><option value="contract">Contract</option><option value="internship">Internship</option>
                  </select></div>
                <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Experience</label><input type="text" value={jobForm.experience} onChange={e => setJobForm(p => ({...p, experience: e.target.value}))} placeholder="3-5 years" className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
                <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Salary Range</label><input type="text" value={jobForm.salary} onChange={e => setJobForm(p => ({...p, salary: e.target.value}))} placeholder="$80K - $120K" className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
                <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Vacancies</label><input type="number" min="1" value={jobForm.vacancies} onChange={e => setJobForm(p => ({...p, vacancies: e.target.value}))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
                <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Closing Date</label><input type="date" value={jobForm.closingDate} onChange={e => setJobForm(p => ({...p, closingDate: e.target.value}))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-sm text-nexus-text-secondary"><input type="checkbox" checked={jobForm.isInternal} onChange={e => setJobForm(p => ({...p, isInternal: e.target.checked}))} className="rounded" /> Internal</label>
                  <label className="flex items-center gap-2 text-sm text-nexus-text-secondary"><input type="checkbox" checked={jobForm.isExternal} onChange={e => setJobForm(p => ({...p, isExternal: e.target.checked}))} className="rounded" /> External</label>
                </div>
              </div>
              <div className="mt-4"><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Description *</label><textarea rows={3} value={jobForm.description} onChange={e => setJobForm(p => ({...p, description: e.target.value}))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none" /></div>
              <div className="mt-4"><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Requirements</label><textarea rows={2} value={jobForm.requirements} onChange={e => setJobForm(p => ({...p, requirements: e.target.value}))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none" /></div>
              <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-nexus-border">
                <button onClick={() => setShowJobForm(false)} className="px-4 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50">Cancel</button>
                <button onClick={handleSaveJob} disabled={submittingJob} className="px-6 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50">{submittingJob ? 'Saving...' : 'Post Job'}</button>
              </div>
            </div>
          )}

          {/* Job Postings List */}
          <div className="space-y-4">
            {loading ? Array.from({length:3}).map((_,i) => <div key={i} className="nexus-card p-6 animate-pulse"><div className="h-5 w-48 bg-slate-200 rounded mb-3" /><div className="h-3 w-32 bg-slate-200 rounded" /></div>) :
            jobPostings.length === 0 ? (
              <div className="text-center py-12 nexus-card"><FiBriefcase className="w-12 h-12 text-nexus-text-muted mx-auto mb-3" /><p className="text-nexus-text-secondary font-medium">No job postings yet</p></div>
            ) : jobPostings.map(job => {
              const badge = getJobStatusBadge(job.status);
              const isExpanded = expandedJob === job.id;
              return (
                <div key={job.id} className={`nexus-card nexus-card-hover overflow-hidden ${deleteConfirmJobId === job.id ? 'border-red-200' : ''}`}>
                  {deleteConfirmJobId === job.id ? (
                    <div className="p-6 bg-red-50"><div className="flex items-center justify-between"><span className="text-sm text-red-700 font-medium">Delete &quot;{job.title}&quot;?</span><div className="flex gap-2"><button onClick={() => handleDeleteJob(job.id)} disabled={deletingJob} className="px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded-lg hover:bg-red-600 disabled:opacity-50">{deletingJob ? 'Deleting...' : 'Confirm'}</button><button onClick={() => setDeleteConfirmJobId(null)} className="px-3 py-1.5 border border-nexus-border text-xs font-medium rounded-lg hover:bg-slate-50">Cancel</button></div></div></div>
                  ) : (
                    <div className="p-6">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 flex-wrap"><h3 className="text-lg font-semibold text-nexus-text-primary">{job.title}</h3><span className={badge.className}>{badge.label}</span></div>
                          <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-nexus-text-secondary">
                            {job.department && <span className="flex items-center gap-1"><FiUsers className="w-3.5 h-3.5" />{job.department.name}</span>}
                            {job.location && <span className="flex items-center gap-1"><FiMapPin className="w-3.5 h-3.5" />{job.location}</span>}
                            <span className="flex items-center gap-1"><FiClock className="w-3.5 h-3.5" />{job.type}</span>
                            <span className="flex items-center gap-1"><FiUsers className="w-3.5 h-3.5" />{job.vacancies} Vacanc{job.vacancies > 1 ? 'ies' : 'y'}</span>
                            <span className="flex items-center gap-1"><FiCalendar className="w-3.5 h-3.5" />{formatDate(job.postedDate)}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {isAdmin && (
                            <>
                              <button onClick={() => setViewingJobId(viewingJobId === job.id ? null : job.id)} className="p-2 rounded-lg text-nexus-text-muted hover:text-violet-500 hover:bg-violet-50" title="View"><FiEye className="w-4 h-4" /></button>
                              <button onClick={() => { setEditingJobId(job.id); setJobForm({ title:job.title, departmentId:job.department?.id||'', position:job.position, location:job.location||'', type:job.type, experience:job.experience||'', salary:job.salary||'', description:job.description, requirements:job.requirements||'', vacancies:String(job.vacancies), closingDate:job.closingDate?job.closingDate.split('T')[0]:'', isInternal:job.isInternal||false, isExternal:job.isExternal!==false }); setShowJobForm(true); }} className="p-2 rounded-lg text-nexus-text-muted hover:text-amber-500 hover:bg-amber-50" title="Edit"><FiEdit2 className="w-4 h-4" /></button>
                              <button onClick={() => setDeleteConfirmJobId(job.id)} className="p-2 rounded-lg text-nexus-text-muted hover:text-red-500 hover:bg-red-50" title="Delete"><FiTrash2 className="w-4 h-4" /></button>
                            </>
                          )}
                          <button onClick={() => setExpandedJob(isExpanded ? null : job.id)} className="p-2 rounded-lg border border-nexus-border text-nexus-text-secondary hover:bg-slate-50">
                            {isExpanded ? <FiChevronUp className="w-4 h-4" /> : <FiChevronDown className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="border-t border-nexus-border p-4 mt-4 bg-slate-50/50 space-y-3">
                          <div><h4 className="text-sm font-semibold text-nexus-text-primary mb-1">Description</h4><p className="text-sm text-nexus-text-secondary whitespace-pre-wrap">{job.description}</p></div>
                          {job.requirements && <div><h4 className="text-sm font-semibold text-nexus-text-primary mb-1">Requirements</h4><p className="text-sm text-nexus-text-secondary whitespace-pre-wrap">{job.requirements}</p></div>}
                          <div className="flex gap-2 text-xs text-nexus-text-muted">
                            {job.isInternal && <span className="nexus-badge nexus-badge-info">Internal</span>}
                            {job.isExternal && <span className="nexus-badge nexus-badge-success">External</span>}
                            <span>{job.applications?.length || 0} applications</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══════════════════ CANDIDATES TAB ═══════════════════ */}
      {activeTab === 'candidates' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex gap-3 flex-1">
              <div className="relative flex-1"><FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-nexus-text-muted" /><input type="text" value={candidateSearch} onChange={e => setCandidateSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" placeholder="Search candidates..." /></div>
              <div className="flex items-center gap-2"><FiFilter className="w-4 h-4 text-nexus-text-muted" /><select value={candidateFilter} onChange={e => setCandidateFilter(e.target.value)} className="px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"><option value="">All Status</option>{APP_STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1).replace(/_/g,' ')}</option>)}</select></div>
            </div>
            {isAdmin && (
              <button onClick={() => { setShowCandidateForm(true); setCandidateForm({ jobPostingId:'', candidateName:'', candidateEmail:'', candidatePhone:'', source:'website', skills:'', experience:'', currentCtc:'', expectedCtc:'', noticePeriod:'', currentLocation:'', expectedSalary:'' }); }}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium text-sm shadow-sm shadow-blue-500/25 whitespace-nowrap">
                <FiPlus className="w-4 h-4" /> Add Candidate
              </button>
            )}
          </div>

          {showCandidateForm && (
            <div className="nexus-card border-l-4 border-l-blue-500 p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-nexus-text-primary">Add Candidate</h2>
                <button onClick={() => setShowCandidateForm(false)} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100"><FiX className="w-5 h-5" /></button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Job Posting *</label>
                  <select value={candidateForm.jobPostingId} onChange={e => setCandidateForm(p => ({...p, jobPostingId: e.target.value}))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                    <option value="">Select Job</option>{jobPostings.filter(j => j.status === 'open').map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
                  </select></div>
                <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Name *</label><input type="text" value={candidateForm.candidateName} onChange={e => setCandidateForm(p => ({...p, candidateName: e.target.value}))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
                <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Email *</label><input type="email" value={candidateForm.candidateEmail} onChange={e => setCandidateForm(p => ({...p, candidateEmail: e.target.value}))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
                <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Phone</label><input type="tel" value={candidateForm.candidatePhone} onChange={e => setCandidateForm(p => ({...p, candidatePhone: e.target.value}))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
                <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Source</label>
                  <select value={candidateForm.source} onChange={e => setCandidateForm(p => ({...p, source: e.target.value}))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                    {SOURCES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
                  </select></div>
                <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Skills</label><input type="text" value={candidateForm.skills} onChange={e => setCandidateForm(p => ({...p, skills: e.target.value}))} placeholder="React, Python, etc." className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
                <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Experience</label><input type="text" value={candidateForm.experience} onChange={e => setCandidateForm(p => ({...p, experience: e.target.value}))} placeholder="3 years" className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
                <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Current CTC</label><input type="text" value={candidateForm.currentCtc} onChange={e => setCandidateForm(p => ({...p, currentCtc: e.target.value}))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
                <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Expected CTC</label><input type="text" value={candidateForm.expectedCtc} onChange={e => setCandidateForm(p => ({...p, expectedCtc: e.target.value}))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
                <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Notice Period</label><input type="text" value={candidateForm.noticePeriod} onChange={e => setCandidateForm(p => ({...p, noticePeriod: e.target.value}))} placeholder="30 days" className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
                <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Location</label><input type="text" value={candidateForm.currentLocation} onChange={e => setCandidateForm(p => ({...p, currentLocation: e.target.value}))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
              </div>
              <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-nexus-border">
                <button onClick={() => setShowCandidateForm(false)} className="px-4 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50">Cancel</button>
                <button onClick={handleSaveCandidate} disabled={submittingCandidate} className="px-6 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50">{submittingCandidate ? 'Adding...' : 'Add Candidate'}</button>
              </div>
            </div>
          )}

          {/* Candidate Table */}
          <div className="nexus-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr className="border-b border-nexus-border bg-slate-50/50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase">Candidate</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase">Job</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase">Source</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase">AI Score</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase">Applied</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase">Actions</th>
                </tr></thead>
                <tbody>
                  {loading ? Array.from({length:3}).map((_,i) => (<tr key={i} className="border-b border-nexus-border/50 animate-pulse"><td className="px-4 py-3"><div className="h-3 w-24 bg-slate-200 rounded" /></td><td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded" /></td><td className="px-4 py-3"><div className="h-3 w-16 bg-slate-200 rounded" /></td><td className="px-4 py-3"><div className="h-3 w-8 bg-slate-200 rounded" /></td><td className="px-4 py-3"><div className="h-5 w-16 bg-slate-200 rounded-full" /></td><td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded" /></td><td className="px-4 py-3"><div className="h-3 w-16 bg-slate-200 rounded ml-auto" /></td></tr>)) :
                  candidates.filter(c => {
                    const matchSearch = !candidateSearch || c.candidateName.toLowerCase().includes(candidateSearch.toLowerCase()) || c.candidateEmail.toLowerCase().includes(candidateSearch.toLowerCase());
                    const matchFilter = !candidateFilter || c.status === candidateFilter;
                    return matchSearch && matchFilter;
                  }).length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-12 text-center"><FiUsers className="w-10 h-10 text-nexus-text-muted mx-auto mb-3" /><p className="text-nexus-text-secondary font-medium">No candidates found</p></td></tr>
                  ) : candidates.filter(c => {
                    const matchSearch = !candidateSearch || c.candidateName.toLowerCase().includes(candidateSearch.toLowerCase()) || c.candidateEmail.toLowerCase().includes(candidateSearch.toLowerCase());
                    const matchFilter = !candidateFilter || c.status === candidateFilter;
                    return matchSearch && matchFilter;
                  }).map(c => (
                    <tr key={c.id} className="border-b border-nexus-border/50 hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3"><p className="text-sm font-medium text-nexus-text-primary">{c.candidateName}</p><p className="text-xs text-nexus-text-muted">{c.candidateEmail}</p></td>
                      <td className="px-4 py-3 text-sm text-nexus-text-secondary">{c.jobPosting?.title || '—'}</td>
                      <td className="px-4 py-3 text-sm text-nexus-text-secondary capitalize">{c.source}</td>
                      <td className="px-4 py-3">
                        {c.aiResumeScore != null ? (
                          <span className={`text-sm font-semibold ${c.aiResumeScore >= 70 ? 'text-emerald-600' : c.aiResumeScore >= 40 ? 'text-amber-600' : 'text-red-600'}`}>{c.aiResumeScore.toFixed(0)}%</span>
                        ) : <span className="text-xs text-nexus-text-muted">—</span>}
                      </td>
                      <td className="px-4 py-3"><span className={getAppStatusBadge(c.status).className}>{getAppStatusBadge(c.status).label}</span></td>
                      <td className="px-4 py-3 text-sm text-nexus-text-secondary">{formatDate(c.appliedDate)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => setViewingCandidateId(viewingCandidateId === c.id ? null : c.id)} className="p-2 rounded-lg text-nexus-text-muted hover:text-blue-500 hover:bg-blue-50" title="View"><FiEye className="w-4 h-4" /></button>
                          {isAdmin && c.status !== 'hired' && c.status !== 'rejected' && (
                            <select value="" onChange={e => { if (e.target.value) handleUpdateCandidateStatus(c.id, e.target.value); }} className="px-2 py-1 rounded border border-nexus-border text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                              <option value="">Move to...</option>{APP_STATUSES.filter(s => s !== c.status).map(s => <option key={s} value={s}>{s.replace(/_/g,' ').replace(/\b\w/g, l => l.toUpperCase())}</option>)}
                            </select>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {viewingCandidateId && (() => {
            const c = candidates.find(x => x.id === viewingCandidateId);
            if (!c) return null;
            return (
              <div className="nexus-card border-l-4 border-l-blue-500 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-nexus-text-primary">{c.candidateName}</h3>
                  <button onClick={() => setViewingCandidateId(null)} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100"><FiX className="w-5 h-5" /></button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div><p className="text-xs font-medium text-nexus-text-muted">Email</p><p className="text-sm text-nexus-text-primary mt-0.5">{c.candidateEmail}</p></div>
                  <div><p className="text-xs font-medium text-nexus-text-muted">Phone</p><p className="text-sm text-nexus-text-primary mt-0.5">{c.candidatePhone || '—'}</p></div>
                  <div><p className="text-xs font-medium text-nexus-text-muted">Job Applied</p><p className="text-sm text-nexus-text-primary mt-0.5">{c.jobPosting?.title || '—'}</p></div>
                  <div><p className="text-xs font-medium text-nexus-text-muted">Source</p><p className="text-sm text-nexus-text-primary mt-0.5 capitalize">{c.source}</p></div>
                  <div><p className="text-xs font-medium text-nexus-text-muted">Status</p><p className="mt-0.5"><span className={getAppStatusBadge(c.status).className}>{getAppStatusBadge(c.status).label}</span></p></div>
                  <div><p className="text-xs font-medium text-nexus-text-muted">Applied Date</p><p className="text-sm text-nexus-text-primary mt-0.5">{formatDate(c.appliedDate)}</p></div>
                  <div><p className="text-xs font-medium text-nexus-text-muted">Skills</p><p className="text-sm text-nexus-text-primary mt-0.5">{c.skills || '—'}</p></div>
                  <div><p className="text-xs font-medium text-nexus-text-muted">Experience</p><p className="text-sm text-nexus-text-primary mt-0.5">{c.experience || '—'}</p></div>
                  <div><p className="text-xs font-medium text-nexus-text-muted">Current CTC</p><p className="text-sm text-nexus-text-primary mt-0.5">{c.currentCtc || '—'}</p></div>
                  <div><p className="text-xs font-medium text-nexus-text-muted">Expected CTC</p><p className="text-sm text-nexus-text-primary mt-0.5">{c.expectedCtc || '—'}</p></div>
                  <div><p className="text-xs font-medium text-nexus-text-muted">Notice Period</p><p className="text-sm text-nexus-text-primary mt-0.5">{c.noticePeriod || '—'}</p></div>
                  <div><p className="text-xs font-medium text-nexus-text-muted">Location</p><p className="text-sm text-nexus-text-primary mt-0.5">{c.currentLocation || '—'}</p></div>
                  <div><p className="text-xs font-medium text-nexus-text-muted">AI Resume Score</p><p className="text-sm font-semibold text-nexus-text-primary mt-0.5">{c.aiResumeScore != null ? `${c.aiResumeScore.toFixed(0)}%` : '—'}</p></div>
                  <div><p className="text-xs font-medium text-nexus-text-muted">AI Interview Score</p><p className="text-sm font-semibold text-nexus-text-primary mt-0.5">{c.aiInterviewScore != null ? `${c.aiInterviewScore.toFixed(0)}%` : '—'}</p></div>
                  <div><p className="text-xs font-medium text-nexus-text-muted">Rating</p><p className="text-sm text-nexus-text-primary mt-0.5">{c.rating ? '★'.repeat(c.rating) : '—'}</p></div>
                  {c.notes && <div className="sm:col-span-2 lg:col-span-3"><p className="text-xs font-medium text-nexus-text-muted">Notes</p><p className="text-sm text-nexus-text-primary mt-0.5">{c.notes}</p></div>}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ═══════════════════ INTERVIEWS TAB ═══════════════════ */}
      {activeTab === 'interviews' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex gap-3">
              <div className="nexus-card p-3"><p className="text-lg font-bold text-blue-600">{interviews.filter(i => i.status === 'scheduled').length}</p><p className="text-xs text-nexus-text-muted">Scheduled</p></div>
              <div className="nexus-card p-3"><p className="text-lg font-bold text-emerald-600">{interviews.filter(i => i.status === 'completed').length}</p><p className="text-xs text-nexus-text-muted">Completed</p></div>
            </div>
            <div className="flex gap-3">
              <select value={interviewFilter} onChange={e => setInterviewFilter(e.target.value)} className="px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                <option value="">All Status</option>{INTERVIEW_STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g,' ').replace(/\b\w/g, l => l.toUpperCase())}</option>)}
              </select>
              {isAdmin && (
                <button onClick={() => { setShowInterviewForm(true); setInterviewForm({ jobApplicationId:'', round:'1', type:'technical', title:'', date:'', time:'', duration:'60', location:'', meetingUrl:'', interviewerNames:'' }); }}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium text-sm shadow-sm shadow-blue-500/25">
                  <FiPlus className="w-4 h-4" /> Schedule Interview
                </button>
              )}
            </div>
          </div>

          {showInterviewForm && (
            <div className="nexus-card border-l-4 border-l-amber-500 p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-nexus-text-primary">Schedule Interview</h2>
                <button onClick={() => setShowInterviewForm(false)} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100"><FiX className="w-5 h-5" /></button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Candidate *</label>
                  <select value={interviewForm.jobApplicationId} onChange={e => setInterviewForm(p => ({...p, jobApplicationId: e.target.value}))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                    <option value="">Select Candidate</option>{candidates.filter(c => ['screening','ai_screening','interview','applied'].includes(c.status)).map(c => <option key={c.id} value={c.id}>{c.candidateName} — {c.jobPosting?.title || ''}</option>)}
                  </select></div>
                <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Round</label><input type="number" min="1" value={interviewForm.round} onChange={e => setInterviewForm(p => ({...p, round: e.target.value}))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
                <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Type</label>
                  <select value={interviewForm.type} onChange={e => setInterviewForm(p => ({...p, type: e.target.value}))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                    {INTERVIEW_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g,' ').replace(/\b\w/g, l => l.toUpperCase())}</option>)}
                  </select></div>
                <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Title</label><input type="text" value={interviewForm.title} onChange={e => setInterviewForm(p => ({...p, title: e.target.value}))} placeholder="Technical Round 1" className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
                <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Date *</label><input type="date" value={interviewForm.date} onChange={e => setInterviewForm(p => ({...p, date: e.target.value}))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
                <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Time</label><input type="time" value={interviewForm.time} onChange={e => setInterviewForm(p => ({...p, time: e.target.value}))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
                <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Duration (min)</label><input type="number" value={interviewForm.duration} onChange={e => setInterviewForm(p => ({...p, duration: e.target.value}))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
                <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Location</label><input type="text" value={interviewForm.location} onChange={e => setInterviewForm(p => ({...p, location: e.target.value}))} placeholder="Conference Room A" className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
                <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Meeting URL</label><input type="url" value={interviewForm.meetingUrl} onChange={e => setInterviewForm(p => ({...p, meetingUrl: e.target.value}))} placeholder="https://meet.google.com/..." className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
                <div className="sm:col-span-2 lg:col-span-3"><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Interviewers (comma-separated)</label><input type="text" value={interviewForm.interviewerNames} onChange={e => setInterviewForm(p => ({...p, interviewerNames: e.target.value}))} placeholder="John Williams, Sarah Johnson" className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
              </div>
              <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-nexus-border">
                <button onClick={() => setShowInterviewForm(false)} className="px-4 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50">Cancel</button>
                <button onClick={handleSaveInterview} disabled={submittingInterview} className="px-6 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50">{submittingInterview ? 'Scheduling...' : 'Schedule'}</button>
              </div>
            </div>
          )}

          <div className="nexus-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr className="border-b border-nexus-border bg-slate-50/50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase">Candidate</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase">Job</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase">Round</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase">Type</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase">Date/Time</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase">Score</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase">Actions</th>
                </tr></thead>
                <tbody>
                  {loading ? Array.from({length:3}).map((_,i) => (<tr key={i} className="border-b border-nexus-border/50 animate-pulse"><td className="px-4 py-3"><div className="h-3 w-24 bg-slate-200 rounded" /></td><td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded" /></td><td className="px-4 py-3"><div className="h-3 w-8 bg-slate-200 rounded" /></td><td className="px-4 py-3"><div className="h-3 w-16 bg-slate-200 rounded" /></td><td className="px-4 py-3"><div className="h-3 w-24 bg-slate-200 rounded" /></td><td className="px-4 py-3"><div className="h-5 w-16 bg-slate-200 rounded-full" /></td><td className="px-4 py-3"><div className="h-3 w-8 bg-slate-200 rounded" /></td><td className="px-4 py-3"><div className="h-3 w-16 bg-slate-200 rounded ml-auto" /></td></tr>)) :
                  interviews.filter(i => !interviewFilter || i.status === interviewFilter).length === 0 ? (
                    <tr><td colSpan={8} className="px-4 py-12 text-center"><FiCalendar className="w-10 h-10 text-nexus-text-muted mx-auto mb-3" /><p className="text-nexus-text-secondary font-medium">No interviews found</p></td></tr>
                  ) : interviews.filter(i => !interviewFilter || i.status === interviewFilter).map(iv => (
                    <tr key={iv.id} className="border-b border-nexus-border/50 hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-nexus-text-primary">{iv.jobApplication?.candidateName || '—'}</td>
                      <td className="px-4 py-3 text-sm text-nexus-text-secondary">{iv.jobApplication?.jobPosting?.title || '—'}</td>
                      <td className="px-4 py-3 text-sm text-nexus-text-primary">Round {iv.round}</td>
                      <td className="px-4 py-3 text-sm text-nexus-text-secondary capitalize">{iv.type?.replace(/_/g,' ')}</td>
                      <td className="px-4 py-3 text-sm text-nexus-text-secondary">{formatDate(iv.date)}{iv.time ? ` ${iv.time}` : ''}</td>
                      <td className="px-4 py-3"><span className={getInterviewStatusBadge(iv.status).className}>{getInterviewStatusBadge(iv.status).label}</span></td>
                      <td className="px-4 py-3 text-sm font-semibold text-nexus-text-primary">{iv.score ?? (iv.aiScore ?? '—')}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => setViewingInterviewId(viewingInterviewId === iv.id ? null : iv.id)} className="p-2 rounded-lg text-nexus-text-muted hover:text-amber-500 hover:bg-amber-50" title="View"><FiEye className="w-4 h-4" /></button>
                          {iv.meetingUrl && <a href={iv.meetingUrl} target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg text-nexus-text-muted hover:text-blue-500 hover:bg-blue-50" title="Join Meeting"><FiVideo className="w-4 h-4" /></a>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {viewingInterviewId && (() => {
            const iv = interviews.find(x => x.id === viewingInterviewId);
            if (!iv) return null;
            const interviewerList = iv.interviewerNames ? JSON.parse(iv.interviewerNames) : [];
            return (
              <div className="nexus-card border-l-4 border-l-amber-500 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-nexus-text-primary">Interview Details — Round {iv.round}</h3>
                  <button onClick={() => setViewingInterviewId(null)} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100"><FiX className="w-5 h-5" /></button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div><p className="text-xs font-medium text-nexus-text-muted">Candidate</p><p className="text-sm text-nexus-text-primary mt-0.5">{iv.jobApplication?.candidateName}</p></div>
                  <div><p className="text-xs font-medium text-nexus-text-muted">Job</p><p className="text-sm text-nexus-text-primary mt-0.5">{iv.jobApplication?.jobPosting?.title || '—'}</p></div>
                  <div><p className="text-xs font-medium text-nexus-text-muted">Type</p><p className="text-sm text-nexus-text-primary mt-0.5 capitalize">{iv.type?.replace(/_/g,' ')}</p></div>
                  <div><p className="text-xs font-medium text-nexus-text-muted">Date</p><p className="text-sm text-nexus-text-primary mt-0.5">{formatDate(iv.date)}</p></div>
                  <div><p className="text-xs font-medium text-nexus-text-muted">Time</p><p className="text-sm text-nexus-text-primary mt-0.5">{iv.time || '—'}</p></div>
                  <div><p className="text-xs font-medium text-nexus-text-muted">Duration</p><p className="text-sm text-nexus-text-primary mt-0.5">{iv.duration ? `${iv.duration} min` : '—'}</p></div>
                  <div><p className="text-xs font-medium text-nexus-text-muted">Location</p><p className="text-sm text-nexus-text-primary mt-0.5">{iv.location || '—'}</p></div>
                  <div><p className="text-xs font-medium text-nexus-text-muted">Interviewers</p><p className="text-sm text-nexus-text-primary mt-0.5">{interviewerList.length > 0 ? interviewerList.join(', ') : '—'}</p></div>
                  <div><p className="text-xs font-medium text-nexus-text-muted">Status</p><p className="mt-0.5"><span className={getInterviewStatusBadge(iv.status).className}>{getInterviewStatusBadge(iv.status).label}</span></p></div>
                  <div><p className="text-xs font-medium text-nexus-text-muted">Score</p><p className="text-sm font-semibold text-nexus-text-primary mt-0.5">{iv.score ?? '—'}</p></div>
                  {iv.aiScore != null && <div><p className="text-xs font-medium text-nexus-text-muted">AI Score</p><p className="text-sm font-semibold text-violet-600 mt-0.5">{iv.aiScore}</p></div>}
                  {iv.feedback && <div className="sm:col-span-2"><p className="text-xs font-medium text-nexus-text-muted">Feedback</p><p className="text-sm text-nexus-text-primary mt-0.5">{iv.feedback}</p></div>}
                  {iv.aiFeedback && <div className="sm:col-span-2"><p className="text-xs font-medium text-nexus-text-muted">AI Feedback</p><p className="text-sm text-violet-600 mt-0.5">{iv.aiFeedback}</p></div>}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ═══════════════════ OFFERS TAB ═══════════════════ */}
      {activeTab === 'offers' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex gap-4">
              <div className="nexus-card p-3"><p className="text-lg font-bold text-nexus-text-primary">{offers.length}</p><p className="text-xs text-nexus-text-muted">Total</p></div>
              <div className="nexus-card p-3"><p className="text-lg font-bold text-amber-600">{offers.filter(o => ['draft','pending_approval'].includes(o.status)).length}</p><p className="text-xs text-nexus-text-muted">Pending</p></div>
              <div className="nexus-card p-3"><p className="text-lg font-bold text-emerald-600">{offers.filter(o => o.status === 'accepted').length}</p><p className="text-xs text-nexus-text-muted">Accepted</p></div>
            </div>
            <div className="flex gap-3">
              <select value={offerFilter} onChange={e => setOfferFilter(e.target.value)} className="px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                <option value="">All Status</option><option value="draft">Draft</option><option value="pending_approval">Pending</option><option value="approved">Approved</option><option value="released">Released</option><option value="accepted">Accepted</option><option value="rejected">Rejected</option>
              </select>
              {isAdmin && (
                <button onClick={() => { setShowOfferForm(true); setOfferForm({ jobApplicationId:'', candidateName:'', candidateEmail:'', jobTitle:'', departmentId:'', offeredSalary:'', currency:'USD', joiningBonus:'', retentionBonus:'', variablePay:'', joiningDate:'', offerExpiryDate:'', notes:'' }); }}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium text-sm shadow-sm shadow-blue-500/25">
                  <FiPlus className="w-4 h-4" /> Create Offer
                </button>
              )}
            </div>
          </div>

          {showOfferForm && (
            <div className="nexus-card border-l-4 border-l-pink-500 p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-nexus-text-primary">Create Offer</h2>
                <button onClick={() => setShowOfferForm(false)} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100"><FiX className="w-5 h-5" /></button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Candidate *</label>
                  <select value={offerForm.jobApplicationId} onChange={e => { const c = candidates.find(x => x.id === e.target.value); setOfferForm(p => ({...p, jobApplicationId: e.target.value, candidateName: c?.candidateName || '', candidateEmail: c?.candidateEmail || '', jobTitle: c?.jobPosting?.title || '' })); }} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                    <option value="">Select Candidate</option>{candidates.filter(c => ['interview','offered'].includes(c.status)).map(c => <option key={c.id} value={c.id}>{c.candidateName} — {c.jobPosting?.title || ''}</option>)}
                  </select></div>
                <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Candidate Name</label><input type="text" value={offerForm.candidateName} onChange={e => setOfferForm(p => ({...p, candidateName: e.target.value}))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
                <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Email</label><input type="email" value={offerForm.candidateEmail} onChange={e => setOfferForm(p => ({...p, candidateEmail: e.target.value}))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
                <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Job Title</label><input type="text" value={offerForm.jobTitle} onChange={e => setOfferForm(p => ({...p, jobTitle: e.target.value}))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
                <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Offered Salary</label><input type="number" step="0.01" value={offerForm.offeredSalary} onChange={e => setOfferForm(p => ({...p, offeredSalary: e.target.value}))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
                <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Currency</label>
                  <select value={offerForm.currency} onChange={e => setOfferForm(p => ({...p, currency: e.target.value}))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                    <option value="USD">USD</option><option value="INR">INR</option><option value="EUR">EUR</option><option value="GBP">GBP</option>
                  </select></div>
                <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Joining Bonus</label><input type="number" value={offerForm.joiningBonus} onChange={e => setOfferForm(p => ({...p, joiningBonus: e.target.value}))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
                <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Joining Date</label><input type="date" value={offerForm.joiningDate} onChange={e => setOfferForm(p => ({...p, joiningDate: e.target.value}))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
                <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Expiry Date</label><input type="date" value={offerForm.offerExpiryDate} onChange={e => setOfferForm(p => ({...p, offerExpiryDate: e.target.value}))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
                <div className="sm:col-span-2 lg:col-span-3"><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Notes</label><textarea rows={2} value={offerForm.notes} onChange={e => setOfferForm(p => ({...p, notes: e.target.value}))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none" /></div>
              </div>
              <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-nexus-border">
                <button onClick={() => setShowOfferForm(false)} className="px-4 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50">Cancel</button>
                <button onClick={handleSaveOffer} disabled={submittingOffer} className="px-6 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50">{submittingOffer ? 'Creating...' : 'Create Offer'}</button>
              </div>
            </div>
          )}

          <div className="nexus-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr className="border-b border-nexus-border bg-slate-50/50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase">Offer #</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase">Candidate</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase">Job</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase">Salary</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase">Response</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase">Actions</th>
                </tr></thead>
                <tbody>
                  {loading ? Array.from({length:3}).map((_,i) => (<tr key={i} className="border-b border-nexus-border/50 animate-pulse"><td className="px-4 py-3"><div className="h-3 w-24 bg-slate-200 rounded" /></td><td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded" /></td><td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded" /></td><td className="px-4 py-3"><div className="h-3 w-16 bg-slate-200 rounded" /></td><td className="px-4 py-3"><div className="h-5 w-16 bg-slate-200 rounded-full" /></td><td className="px-4 py-3"><div className="h-3 w-16 bg-slate-200 rounded" /></td><td className="px-4 py-3"><div className="h-3 w-16 bg-slate-200 rounded ml-auto" /></td></tr>)) :
                  offers.filter(o => !offerFilter || o.status === offerFilter).length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-12 text-center"><FiMail className="w-10 h-10 text-nexus-text-muted mx-auto mb-3" /><p className="text-nexus-text-secondary font-medium">No offers found</p></td></tr>
                  ) : offers.filter(o => !offerFilter || o.status === offerFilter).map(o => (
                    <tr key={o.id} className="border-b border-nexus-border/50 hover:bg-slate-50/50 transition-colors">
                      {deleteConfirmOfferId === o.id ? (
                        <td colSpan={7} className="px-4 py-3 bg-red-50"><div className="flex items-center justify-between"><span className="text-sm text-red-700 font-medium">Delete offer {o.offerNumber}?</span><div className="flex gap-2"><button onClick={() => handleDeleteOffer(o.id)} disabled={deletingOffer} className="px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded-lg hover:bg-red-600 disabled:opacity-50">{deletingOffer ? 'Deleting...' : 'Confirm'}</button><button onClick={() => setDeleteConfirmOfferId(null)} className="px-3 py-1.5 border border-nexus-border text-xs font-medium rounded-lg hover:bg-slate-50">Cancel</button></div></div></td>
                      ) : (
                        <>
                          <td className="px-4 py-3 text-sm font-medium text-nexus-text-primary">{o.offerNumber}</td>
                          <td className="px-4 py-3"><p className="text-sm font-medium text-nexus-text-primary">{o.candidateName}</p><p className="text-xs text-nexus-text-muted">{o.candidateEmail}</p></td>
                          <td className="px-4 py-3 text-sm text-nexus-text-secondary">{o.jobTitle || '—'}</td>
                          <td className="px-4 py-3 text-sm font-semibold text-nexus-text-primary">{formatCurrency(o.offeredSalary, o.currency)}</td>
                          <td className="px-4 py-3"><span className={getOfferStatusBadge(o.status).className}>{getOfferStatusBadge(o.status).label}</span></td>
                          <td className="px-4 py-3 text-sm text-nexus-text-secondary capitalize">{o.candidateResponse || '—'}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => setViewingOfferId(viewingOfferId === o.id ? null : o.id)} className="p-2 rounded-lg text-nexus-text-muted hover:text-pink-500 hover:bg-pink-50" title="View"><FiEye className="w-4 h-4" /></button>
                              {isAdmin && o.status === 'draft' && <button onClick={() => handleOfferAction(o.id, 'approve')} className="p-2 rounded-lg text-nexus-text-muted hover:text-emerald-500 hover:bg-emerald-50" title="Approve"><FiCheck className="w-4 h-4" /></button>}
                              {isAdmin && o.status === 'approved' && <button onClick={() => handleOfferAction(o.id, 'release')} className="p-2 rounded-lg text-nexus-text-muted hover:text-blue-500 hover:bg-blue-50" title="Release"><FiSend className="w-4 h-4" /></button>}
                              {isAdmin && o.status === 'released' && <><button onClick={() => handleOfferAction(o.id, 'accept')} className="p-2 rounded-lg text-nexus-text-muted hover:text-emerald-500 hover:bg-emerald-50" title="Accept"><FiCheckCircle className="w-4 h-4" /></button><button onClick={() => handleOfferAction(o.id, 'reject')} className="p-2 rounded-lg text-nexus-text-muted hover:text-red-500 hover:bg-red-50" title="Reject"><FiXCircle className="w-4 h-4" /></button></>}
                              {isAdmin && o.status === 'accepted' && !o.convertedToEmployee && <button onClick={() => handleOfferAction(o.id, 'convert')} className="p-2 rounded-lg text-nexus-text-muted hover:text-violet-500 hover:bg-violet-50" title="Convert to Employee"><FiUserCheck className="w-4 h-4" /></button>}
                              {isAdmin && <button onClick={() => setDeleteConfirmOfferId(o.id)} className="p-2 rounded-lg text-nexus-text-muted hover:text-red-500 hover:bg-red-50" title="Delete"><FiTrash2 className="w-4 h-4" /></button>}
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {viewingOfferId && (() => {
            const o = offers.find(x => x.id === viewingOfferId);
            if (!o) return null;
            return (
              <div className="nexus-card border-l-4 border-l-pink-500 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-nexus-text-primary">Offer Details — {o.offerNumber}</h3>
                  <button onClick={() => setViewingOfferId(null)} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100"><FiX className="w-5 h-5" /></button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div><p className="text-xs font-medium text-nexus-text-muted">Candidate</p><p className="text-sm text-nexus-text-primary mt-0.5">{o.candidateName}</p></div>
                  <div><p className="text-xs font-medium text-nexus-text-muted">Email</p><p className="text-sm text-nexus-text-primary mt-0.5">{o.candidateEmail}</p></div>
                  <div><p className="text-xs font-medium text-nexus-text-muted">Job Title</p><p className="text-sm text-nexus-text-primary mt-0.5">{o.jobTitle || '—'}</p></div>
                  <div><p className="text-xs font-medium text-nexus-text-muted">Offered Salary</p><p className="text-sm font-semibold text-nexus-text-primary mt-0.5">{formatCurrency(o.offeredSalary, o.currency)}</p></div>
                  <div><p className="text-xs font-medium text-nexus-text-muted">Joining Bonus</p><p className="text-sm text-nexus-text-primary mt-0.5">{formatCurrency(o.joiningBonus, o.currency)}</p></div>
                  <div><p className="text-xs font-medium text-nexus-text-muted">Variable Pay</p><p className="text-sm text-nexus-text-primary mt-0.5">{formatCurrency(o.variablePay, o.currency)}</p></div>
                  <div><p className="text-xs font-medium text-nexus-text-muted">Offer Date</p><p className="text-sm text-nexus-text-primary mt-0.5">{formatDate(o.offerDate)}</p></div>
                  <div><p className="text-xs font-medium text-nexus-text-muted">Joining Date</p><p className="text-sm text-nexus-text-primary mt-0.5">{formatDate(o.joiningDate)}</p></div>
                  <div><p className="text-xs font-medium text-nexus-text-muted">Expiry Date</p><p className="text-sm text-nexus-text-primary mt-0.5">{formatDate(o.offerExpiryDate)}</p></div>
                  <div><p className="text-xs font-medium text-nexus-text-muted">Status</p><p className="mt-0.5"><span className={getOfferStatusBadge(o.status).className}>{getOfferStatusBadge(o.status).label}</span></p></div>
                  <div><p className="text-xs font-medium text-nexus-text-muted">Approval</p><p className="text-sm text-nexus-text-primary mt-0.5 capitalize">{o.approvalStatus?.replace(/_/g,' ')}</p></div>
                  <div><p className="text-xs font-medium text-nexus-text-muted">Candidate Response</p><p className="text-sm text-nexus-text-primary mt-0.5 capitalize">{o.candidateResponse || '—'}</p></div>
                  {o.convertedToEmployee && <div><p className="text-xs font-medium text-nexus-text-muted">Converted</p><p className="text-sm text-emerald-600 font-semibold mt-0.5">Yes — Employee Created</p></div>}
                  {o.notes && <div className="sm:col-span-2 lg:col-span-3"><p className="text-xs font-medium text-nexus-text-muted">Notes</p><p className="text-sm text-nexus-text-primary mt-0.5">{o.notes}</p></div>}
                  {o.negotiationNotes && <div className="sm:col-span-2 lg:col-span-3"><p className="text-xs font-medium text-nexus-text-muted">Negotiation Notes</p><p className="text-sm text-nexus-text-primary mt-0.5">{o.negotiationNotes}</p></div>}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ═══════════════════ CAREER PAGE TAB ═══════════════════ */}
      {activeTab === 'career' && (
        <div className="space-y-6">
          <div className="nexus-card p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-semibold text-nexus-text-primary flex items-center gap-2"><FiGlobe className="w-5 h-5 text-violet-500" /> Career Page Preview</h3>
                <p className="text-sm text-nexus-text-secondary mt-1">This is how candidates see your open positions externally</p>
              </div>
              <button className="inline-flex items-center gap-2 px-4 py-2 bg-violet-500 text-white rounded-lg hover:bg-violet-600 font-medium text-sm">
                <FiExternalLink className="w-4 h-4" /> Open Public Page
              </button>
            </div>
            <div className="border border-nexus-border rounded-xl p-6 bg-slate-50/50">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-nexus-text-primary">Join Our Team</h2>
                <p className="text-nexus-text-secondary mt-2">We&apos;re looking for talented people to grow with us</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {jobPostings.filter(j => j.status === 'open' && j.isExternal !== false).map(job => (
                  <div key={job.id} className="nexus-card p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="text-sm font-semibold text-nexus-text-primary">{job.title}</h4>
                      <span className="nexus-badge nexus-badge-success text-xs">Open</span>
                    </div>
                    <div className="space-y-1 text-xs text-nexus-text-secondary">
                      {job.department && <p className="flex items-center gap-1"><FiUsers className="w-3 h-3" />{job.department.name}</p>}
                      {job.location && <p className="flex items-center gap-1"><FiMapPin className="w-3 h-3" />{job.location}</p>}
                      {job.type && <p className="flex items-center gap-1"><FiClock className="w-3 h-3" />{job.type}</p>}
                      {job.salary && <p className="flex items-center gap-1"><FiDollarSign className="w-3 h-3" />{job.salary}</p>}
                    </div>
                    <button className="mt-3 w-full py-2 bg-violet-500 text-white text-xs font-medium rounded-lg hover:bg-violet-600 transition-colors">Apply Now</button>
                  </div>
                ))}
                {jobPostings.filter(j => j.status === 'open' && j.isExternal !== false).length === 0 && (
                  <div className="col-span-full text-center py-8"><p className="text-nexus-text-muted">No open positions to display</p></div>
                )}
              </div>
            </div>
          </div>

          <div className="nexus-card p-6">
            <h3 className="text-lg font-semibold text-nexus-text-primary mb-4">Internal Job Board</h3>
            <p className="text-sm text-nexus-text-secondary mb-4">Positions available for internal employees only</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {jobPostings.filter(j => j.status === 'open' && j.isInternal).map(job => (
                <div key={job.id} className="p-4 rounded-lg border border-nexus-border bg-blue-50/50">
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="text-sm font-semibold text-nexus-text-primary">{job.title}</h4>
                    <span className="nexus-badge nexus-badge-info text-xs">Internal</span>
                  </div>
                  <div className="text-xs text-nexus-text-secondary space-y-1">
                    {job.department && <p>{job.department.name}</p>}
                    {job.location && <p>{job.location}</p>}
                  </div>
                </div>
              ))}
              {jobPostings.filter(j => j.status === 'open' && j.isInternal).length === 0 && (
                <p className="text-sm text-nexus-text-muted">No internal positions currently</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════ SETTINGS TAB ═══════════════════ */}
      {activeTab === 'settings' && (
        <div className="space-y-6">
          <div className="nexus-card p-6">
            <h3 className="text-lg font-semibold text-nexus-text-primary mb-4 flex items-center gap-2"><FiZap className="w-5 h-5 text-violet-500" /> AI Screening Settings</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Auto-Screening Threshold</label><input type="number" defaultValue={60} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" /><p className="text-xs text-nexus-text-muted mt-1">Candidates below this score will be auto-rejected</p></div>
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">AI Interview Level</label>
                <select defaultValue="medium" className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                  <option value="basic">Basic — General questions</option><option value="medium">Medium — Role-specific questions</option><option value="advanced">Advanced — Technical deep dive</option>
                </select></div>
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Auto-Schedule Interview</label>
                <select defaultValue="disabled" className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                  <option value="disabled">Disabled</option><option value="score_above_70">If AI Score &gt; 70%</option><option value="all_candidates">All Candidates</option>
                </select></div>
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Resume Parsing</label>
                <select defaultValue="enabled" className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                  <option value="enabled">Enabled — Auto-extract skills</option><option value="disabled">Disabled</option>
                </select></div>
            </div>
            <button className="mt-4 px-4 py-2.5 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600">Save Settings</button>
          </div>

          <div className="nexus-card p-6">
            <h3 className="text-lg font-semibold text-nexus-text-primary mb-4 flex items-center gap-2"><FiMail className="w-5 h-5 text-pink-500" /> Email Templates</h3>
            <div className="space-y-3">
              {['Application Received', 'Interview Scheduled', 'Offer Letter', 'Rejection', 'Onboarding Welcome'].map(tpl => (
                <div key={tpl} className="flex items-center justify-between p-3 rounded-lg border border-nexus-border hover:bg-slate-50">
                  <div><p className="text-sm font-medium text-nexus-text-primary">{tpl}</p><p className="text-xs text-nexus-text-muted">Customizable email template</p></div>
                  <button className="px-3 py-1.5 border border-nexus-border text-xs font-medium rounded-lg hover:bg-slate-50">Edit</button>
                </div>
              ))}
            </div>
          </div>

          <div className="nexus-card p-6">
            <h3 className="text-lg font-semibold text-nexus-text-primary mb-4 flex items-center gap-2"><FiTarget className="w-5 h-5 text-emerald-500" /> Source Tracking</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {SOURCES.map(source => {
                const count = candidates.filter(c => c.source === source).length;
                return (
                  <div key={source} className="text-center p-3 rounded-lg border border-nexus-border">
                    <p className="text-lg font-bold text-nexus-text-primary">{count}</p>
                    <p className="text-xs text-nexus-text-muted capitalize">{source}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
