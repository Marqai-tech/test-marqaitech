'use client';

import { useEffect, useState, useCallback, useRef, Suspense } from 'react';
import {
  FiUserPlus,
  FiCheckCircle,
  FiFileText,
  FiShield,
  FiClock,
  FiPlus,
  FiX,
  FiEdit2,
  FiTrash2,
  FiSearch,
  FiFilter,
  FiChevronRight,
  FiGrid,
  FiBarChart2,
} from 'react-icons/fi';
import ModuleDashboardShell, { DashboardTabConfig } from '@/components/ModuleDashboardShell';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import ModuleTips from '@/components/ModuleTips';
import ModuleWorkflow from '@/components/ModuleWorkflow';
import { DEFAULT_PREBOARDING_CONFIG } from '@/lib/recruitment-workflow';
/* Task 156-b — shared SmartHR widgets (white StatCards + Panels); the shell
   now renders the SmartHR gradient banner itself. */
import { Panel, StatCard } from '@/components/dashboard/smarthr-widgets';

/* ── Types ── */
interface PreboardingCandidate {
  id: string;
  name: string;
  email: string;
  position: string;
  stage: string;
  startDate: string;
  documents: DocumentItem[];
  bgv: BGVRecord | null;
  hrVerified: boolean;
}

interface DocumentItem {
  type: string;
  status: 'pending' | 'uploaded' | 'verified' | 'rejected';
}

interface BGVRecord {
  vendor: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  submittedDate: string | null;
  completedDate: string | null;
  notes: string;
}

/* ── Constants ── */
// NOTE: the preboarding stage ladder is now DYNAMIC — it is configured per
// tenant in Recruitment → Workflow Configuration (/recruitment/workflow-config)
// and resolved from DEFAULT_PREBOARDING_CONFIG at runtime.
const STAGES = DEFAULT_PREBOARDING_CONFIG.stages.map(s => s.label);

const DOC_TYPES = [
  'ID Proof',
  'Address Proof',
  'Education Certs',
  'Previous Employment',
  'Medical',
  'Bank Details',
];

/* ── Helpers ── */
function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

function formatDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function getStageBadge(stage: string) {
  const idx = STAGES.indexOf(stage);
  const colors = [
    'bg-slate-50 text-slate-700 thb-badge',
    'bg-green-50 text-green-700 thb-badge',
    'bg-amber-50 text-amber-700 thb-badge',
    'bg-teal-50 text-teal-700 thb-badge',
    'bg-cyan-50 text-cyan-700 thb-badge',
    'bg-emerald-50 text-emerald-700 thb-badge',
    'thb-badge thb-badge-success',
  ];
  return { className: colors[idx] || 'thb-badge thb-badge-info', label: stage };
}

function getDocStatusBadge(status: string) {
  const map: Record<string, string> = {
    pending: 'thb-badge thb-badge-warning',
    uploaded: 'bg-green-50 text-green-700 thb-badge',
    verified: 'thb-badge thb-badge-success',
    rejected: 'thb-badge thb-badge-error',
  };
  const labels: Record<string, string> = {
    pending: 'Pending', uploaded: 'Uploaded', verified: 'Verified', rejected: 'Rejected',
  };
  return { className: map[status] || 'thb-badge thb-badge-info', label: labels[status] || status };
}

function getBGVStatusBadge(status: string) {
  const map: Record<string, string> = {
    pending: 'thb-badge thb-badge-warning',
    in_progress: 'bg-cyan-50 text-cyan-700 thb-badge',
    completed: 'thb-badge thb-badge-success',
    failed: 'thb-badge thb-badge-error',
  };
  const labels: Record<string, string> = {
    pending: 'Pending', in_progress: 'In Progress', completed: 'Completed', failed: 'Failed',
  };
  return { className: map[status] || 'thb-badge thb-badge-info', label: labels[status] || status };
}

/* ── Demo Data ── */
const preboardingTips = [
  { title: 'Send Welcome Kits', description: 'Prepare and send digital welcome kits with company info, culture handbook, and team introductions before Day 1.' },
  { title: 'Collect Documents Early', description: 'Request all required documents (ID, address proof, education certs) as soon as the offer is accepted.' },
  { title: 'IT Setup Preparation', description: 'Provision email accounts, laptop, software licenses, and access credentials before the employee starts.' },
  { title: 'Assign Onboarding Buddy', description: 'Pair new hires with experienced team members to help them navigate the company culture and processes.' },
  { title: 'Set Expectations', description: 'Share the first-week schedule, role expectations, and performance goals to give new hires a clear start.' },
];

const preboardingWorkflowSteps = [
  { step: 1, title: 'Send Offer Acceptance', description: 'Confirm the offer and collect signed acceptance letter' },
  { step: 2, title: 'Collect Pre-joining Documents', description: 'Gather ID proofs, certificates, and bank details' },
  { step: 3, title: 'Setup IT Access', description: 'Provision email, laptop, and system credentials' },
  { step: 4, title: 'Assign Onboarding Buddy', description: 'Pair with an experienced team member for guidance' },
  { step: 5, title: 'Send Welcome Kit', description: 'Share company handbook, culture guide, and team info' },
  { step: 6, title: 'Schedule Day 1', description: 'Plan orientation sessions and introduction meetings' },
  { step: 7, title: 'Confirm Joining', description: 'Verify all tasks complete and candidate is Day 1 ready' },
];

/* ── Demo data removed (GOLDEN RULE): candidates come exclusively from /api/preboarding ── */

const initialForm = {
  name: '',
  email: '',
  position: '',
  stage: 'Offer Accepted',
  startDate: '',
};

/* ── Placeholder Tabs ── */

const preboardingTabs: DashboardTabConfig[] = [
  { label: 'Overview', key: 'overview', icon: <FiGrid className="w-4 h-4" /> },
  { label: 'Reports', key: 'reports', icon: <FiFileText className="w-4 h-4" />, isNew: true },
];

function PreboardingReportsPlaceholder() {
  return (
    <div className="flex flex-col items-center py-8">
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg mb-4">
        <FiFileText className="w-7 h-7 text-white" />
      </div>
      <h3 className="text-lg font-bold text-thb-text-primary mb-1">Reports & Analytics</h3>
      <p className="text-sm text-thb-text-secondary text-center max-w-md mb-4">
        BGV status reports, document tracking, and onboarding-readiness analytics
      </p>
      <a href="/preboarding/reports" className="inline-flex items-center gap-2 px-5 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-medium transition-colors">
        <FiBarChart2 className="w-4 h-4" /> Go to Reports
      </a>
    </div>
  );
}

function PreboardingPageContent() {
  return (
    <ModuleDashboardShell
      moduleKey="preboarding"
      moduleLabel="Preboarding"
      title="Preboarding Dashboard"
      trail={['Onboarding', 'Preboarding']}
      moduleIcon={<FiFileText className="w-5 h-5 text-white" />}
      gradientColor="from-lime-500 to-green-600"
      tabs={preboardingTabs}
      overviewContent={<PreboardingContent />}
      children={{
        reports: <PreboardingReportsPlaceholder />,
      }}
    />
  );
}

export default function PreboardingPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-lime-500 border-t-transparent rounded-full" /></div>}>
      <PreboardingPageContent />
    </Suspense>
  );
}

/* ── Component ── */
function PreboardingContent() {
  const { user } = useAuthStore();
  const isAdmin = ['super_admin', 'tenant_admin', 'ceo', 'admin'].includes(user?.role || '');

  const [candidates, setCandidates] = useState<PreboardingCandidate[]>([]);
  const [usingLiveData, setUsingLiveData] = useState(false);
  // Dynamic workflow configuration (drives the stage ladder shown everywhere)
  const [stageLabels, setStageLabels] = useState<string[]>(
    DEFAULT_PREBOARDING_CONFIG.stages.filter(s => s.enabled !== false).map(s => s.label)
  );
  const [statusToLabel, setStatusToLabel] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const s of DEFAULT_PREBOARDING_CONFIG.stages) m[s.key] = s.label;
    return m;
  });
  const [labelToStatus, setLabelToStatus] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const s of DEFAULT_PREBOARDING_CONFIG.stages) m[s.label] = s.key;
    return m;
  });
  // Refs mirror the config maps so fetchData stays stable (runs once) while
  // always mapping candidates with the latest configuration
  const statusToLabelRef = useRef(statusToLabel);
  const stageLabelsRef = useRef(stageLabels);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStage, setFilterStage] = useState('');
  const [activeTab, setActiveTab] = useState<'pipeline' | 'documents' | 'bgv'>('pipeline');

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);

  // GAP-3 fix: gate config state — read from the workflow configuration API
  // so we can enforce document/HR verification gates on the client side.
  const [blockJoiningUntilDocs, setBlockJoiningUntilDocs] = useState(false);
  const [requireHRVerification, setRequireHRVerification] = useState(false);

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  /* Fetch data — LIVE preboarding records from the conversion cascade.
     Stage ladder comes from the tenant's dynamic workflow configuration. */
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      // Load workflow config first (falls back to defaults on failure)
      try {
        const cfgRes = await fetch('/api/recruitment/workflow-config?type=preboarding', { headers: getAuthHeaders() });
        if (cfgRes.ok) {
          const cfgJson = await cfgRes.json();
          const stages = (cfgJson.effective?.stages || []) as Array<{ key: string; label: string; enabled?: boolean }>;
          const enabled = stages.filter(s => s.enabled !== false);
          const labels = enabled.map(s => s.label);
          const s2l: Record<string, string> = { cancelled: 'Cancelled' };
          const l2s: Record<string, string> = { 'Cancelled': 'cancelled' };
          for (const s of stages) { s2l[s.key] = s.label; l2s[s.label] = s.key; }
          setStageLabels(labels);
          setStatusToLabel(s2l);
          setLabelToStatus(l2s);
          statusToLabelRef.current = s2l;
          stageLabelsRef.current = labels;
          // GAP-3 fix: read the gate toggles from config
          setBlockJoiningUntilDocs(!!cfgJson.effective?.blockJoiningUntilDocsComplete);
          setRequireHRVerification(!!cfgJson.effective?.requireHRVerification);
        }
      } catch { /* defaults already set */ }

      const res = await fetch('/api/preboarding?limit=100', { headers: getAuthHeaders() });
      if (res.ok) {
        setUsingLiveData(true);
        const data = await res.json();
        const live = (data.candidates || []) as Array<Record<string, unknown>>;
        if (live.length > 0) {
          // status → display label comes from the workflow configuration
          const statusToStage = statusToLabelRef.current;
          const docTypes = ['offer_letter', 'id_proof', 'tax_forms', 'direct_deposit', 'employment_agreement', 'emergency_contact'];
          const mapped: PreboardingCandidate[] = live.map((c) => {
            const status = String(c.status || 'offer_accepted');
            const bgvStatus = String(c.backgroundCheckStatus || 'pending');
            let docs: DocumentItem[] = [];
            try {
              const parsed = typeof c.documentsUploaded === 'string' && (c.documentsUploaded as string).startsWith('[')
                ? JSON.parse(c.documentsUploaded as string)
                : null;
              if (Array.isArray(parsed)) docs = parsed;
            } catch { /* ignore */ }
            if (!docs.length) {
              docs = docTypes.map((t) => ({ type: t, status: 'pending' as const }));
            }
            return {
              id: String(c.id),
              name: String(c.candidateName || 'Unknown'),
              email: String(c.candidateEmail || ''),
              position: String(c.jobTitle || 'New Hire'),
              stage: statusToStage[status] || stageLabelsRef.current[0] || 'Offer Accepted',
              startDate: c.joiningDate ? String(c.joiningDate).slice(0, 10) : '',
              documents: docs,
              bgv: {
                vendor: 'Sterling',
                status: (bgvStatus === 'cleared' ? 'completed' : bgvStatus === 'failed' ? 'failed' : bgvStatus === 'pending' ? 'pending' : 'in_progress') as BGVRecord['status'],
                submittedDate: null,
                completedDate: bgvStatus === 'cleared' || bgvStatus === 'failed' ? new Date().toISOString().slice(0, 10) : null,
                notes: String(c.backgroundCheckNotes || ''),
              },
              hrVerified: Boolean(c.hrVerified),
            };
          });
          setCandidates(mapped);
          return;
        }
        setCandidates([]);
      }
    } catch {
      // Keep current list — never fall back to sample data
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { queueMicrotask(() => fetchData()); }, [fetchData]);

  /* Stats */
  const totalCandidates = candidates.length;
  const inProgress = candidates.filter(c => c.stage !== stageLabels[0] && c.stage !== stageLabels[stageLabels.length - 1]).length;
  const pendingBGV = candidates.filter(c => c.bgv && ['pending', 'in_progress'].includes(c.bgv.status)).length;
  const readyDay1 = candidates.filter(c => c.stage === stageLabels[stageLabels.length - 1]).length;

  /* Filtered */
  const filtered = candidates.filter(c => {
    const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.position.toLowerCase().includes(search.toLowerCase()) || c.email.toLowerCase().includes(search.toLowerCase());
    const matchStage = !filterStage || c.stage === filterStage;
    return matchSearch && matchStage;
  });

  /* Pipeline counts per stage (from workflow configuration) */
  const stageCounts = stageLabels.map(stage => ({
    stage,
    count: candidates.filter(c => c.stage === stage).length,
  }));

  /* Form handlers */
  const handleShowAddForm = () => {
    setForm(initialForm);
    setEditingId(null);
    setShowForm(true);
    setTimeout(() => document.getElementById('crud-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const handleShowEditForm = (c: PreboardingCandidate) => {
    setForm({ name: c.name, email: c.email, position: c.position, stage: c.stage, startDate: c.startDate });
    setEditingId(c.id);
    setShowForm(true);
    setTimeout(() => document.getElementById('crud-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const handleCancelForm = () => { setShowForm(false); setEditingId(null); setForm(initialForm); };

  const handleSubmit = async () => {
    if (!form.name || !form.email || !form.position) {
      toast.error('Please fill in required fields: Name, Email, Position');
      return;
    }
    try {
      setSubmitting(true);
      if (editingId) {
        setCandidates(prev => prev.map(c => c.id === editingId ? { ...c, name: form.name, email: form.email, position: form.position, stage: form.stage, startDate: form.startDate || c.startDate } : c));
        toast.success('Candidate updated successfully');
      } else {
        const newCandidate: PreboardingCandidate = {
          id: Date.now().toString(),
          name: form.name, email: form.email, position: form.position, stage: form.stage,
          startDate: form.startDate || new Date().toISOString().split('T')[0],
          documents: DOC_TYPES.map(t => ({ type: t, status: 'pending' as const })),
          bgv: null, hrVerified: false,
        };
        setCandidates(prev => [newCandidate, ...prev]);
        toast.success('Candidate added successfully');
      }
      handleCancelForm();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (id: string) => {
    setCandidates(prev => prev.filter(c => c.id !== id));
    toast.success('Candidate removed');
    setDeleteConfirmId(null);
    setDeleting(false);
  };

  const handleAdvanceStage = async (id: string) => {
    const current = candidates.find(c => c.id === id);
    if (!current) return;
    const currentIdx = stageLabels.indexOf(current.stage);
    if (currentIdx < 0 || currentIdx >= stageLabels.length - 1) return;
    const nextLabel = stageLabels[currentIdx + 1];
    const nextStatus = labelToStatus[nextLabel];

    // GAP-3 fix: enforce the document gate when advancing to the final stage.
    // If blockJoiningUntilDocsComplete is enabled, prevent advancing to the
    // last stage (Day 1 Ready / Joined) if any document is in 'pending' or
    // 'rejected' state.
    if (currentIdx + 1 === stageLabels.length - 1 && blockJoiningUntilDocs) {
      const pendingDocs = (current.documents || []).filter(
        (d: { status: string }) => d.status === 'pending' || d.status === 'rejected'
      );
      if (pendingDocs.length > 0) {
        toast.error(`Cannot advance to "${nextLabel}" — ${pendingDocs.length} document(s) still pending or rejected. Complete document verification first.`);
        return;
      }
    }

    // GAP-3 fix: enforce the HR verification gate when advancing to the final stage.
    if (currentIdx + 1 === stageLabels.length - 1 && requireHRVerification && !current.hrVerified) {
      toast.error(`Cannot advance to "${nextLabel}" — HR verification is required before joining. Mark the candidate as HR Verified first.`);
      return;
    }

    // Optimistic update
    setCandidates(prev => prev.map(c => (c.id === id ? { ...c, stage: nextLabel } : c)));
    // Persist to the workflow engine (status key from configuration)
    if (nextStatus) {
      try {
        const res = await fetch(`/api/preboarding/${id}`, {
          method: 'PATCH',
          headers: getAuthHeaders(),
          body: JSON.stringify({ status: nextStatus }),
        });
        if (!res.ok) throw new Error('save failed');
        toast.success(`Stage advanced to "${nextLabel}"`);
      } catch {
        toast.error('Could not save the stage change — reverted');
        setCandidates(prev => prev.map(c => (c.id === id ? { ...c, stage: current.stage } : c)));
      }
    } else {
      toast.success('Stage advanced');
    }
  };

  const toggleHRVerify = (id: string) => {
    setCandidates(prev => prev.map(c => c.id === id ? { ...c, hrVerified: !c.hrVerified } : c));
    toast.success('HR verification toggled');
  };

  const tabs = [
    { key: 'pipeline' as const, label: 'Pipeline', icon: FiUserPlus },
    { key: 'documents' as const, label: 'Documents', icon: FiFileText },
    { key: 'bgv' as const, label: 'BGV Tracking', icon: FiShield },
  ];

  return (
    <div className="space-y-6">
      {/* Task 156 — header actions (moved from the old in-content banner; the shell now renders the SmartHR banner) */}
      <div className="flex items-center justify-between gap-2 flex-wrap -mt-1">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Live-data status chip (was on the banner's gradient; now restyled for white background) */}
          <span
            className="inline-flex items-center gap-1.5 bg-white border border-slate-200 text-slate-700 shadow-sm text-xs font-semibold rounded-lg px-3 py-2"
            title={usingLiveData ? 'Candidates converted from recruitment appear here' : 'Convert a hired candidate in Recruitment'}
          >
            <span className={`w-2 h-2 rounded-full ${usingLiveData ? 'bg-emerald-400' : 'bg-slate-300'}`} />
            {usingLiveData ? 'Live data' : 'No records yet'}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isAdmin && (
            <button
              onClick={handleShowAddForm}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-[#FF9B44] to-[#FFC107] text-white text-sm font-semibold shadow-sm hover:opacity-90 transition-all"
            >
              <FiPlus className="w-4 h-4" />
              Add Candidate
            </button>
          )}
        </div>
      </div>

      {/* Module Tips & Workflow */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ModuleTips moduleKey="preboarding" title="Preboarding Tips" tips={preboardingTips} userRole={user?.role} />
        <ModuleWorkflow moduleKey="preboarding" title="How to Manage Pre-boarding" steps={preboardingWorkflowSteps} accentColor="emerald" userRole={user?.role} />
      </div>

      {/* Stats Cards — shared SmartHR StatCard (Task 156-b) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          label="Total Candidates"
          value={totalCandidates}
          sub="In pre-boarding workflow"
          icon={<FiUserPlus className="w-5 h-5" />}
          bg="bg-[#3A57C4]/10 text-[#3A57C4]"
          ring="ring-[#3A57C4]/20"
        />
        <StatCard
          label="In Progress"
          value={inProgress}
          sub="Between first and final stage"
          icon={<FiClock className="w-5 h-5" />}
          bg="bg-[#009EFB]/10 text-[#009EFB]"
          ring="ring-[#009EFB]/20"
        />
        <StatCard
          label="Pending BGV"
          value={pendingBGV}
          sub="Background verification open"
          icon={<FiShield className="w-5 h-5" />}
          bg="bg-[#FF9B44]/15 text-[#FF9B44]"
          ring="ring-[#FF9B44]/20"
        />
        <StatCard
          label="Ready for Day 1"
          value={readyDay1}
          sub="Reached the final stage"
          icon={<FiCheckCircle className="w-5 h-5" />}
          bg="bg-[#10B981]/10 text-[#10B981]"
          ring="ring-[#10B981]/20"
        />
      </div>

      {/* Stage Pipeline Bar */}
      <div className="thb-card p-4">
        <h3 className="text-sm font-semibold text-thb-text-secondary mb-3">{stageLabels.length}-Stage Workflow Pipeline</h3>
        <div className="flex items-center gap-1 overflow-x-auto pb-2">
          {stageCounts.map((s, i) => (
            <div key={s.stage} className="flex items-center">
              <div className={`flex flex-col items-center min-w-[100px] px-3 py-2 rounded-lg ${i <= stageLabels.indexOf(filtered[0]?.stage || '') ? 'bg-[#3A57C4]/10 border border-[#3A57C4]/25' : 'bg-slate-50 border border-slate-200'}`}>
                <span className="text-[10px] text-thb-text-muted text-center leading-tight">{s.stage}</span>
                <span className="text-sm font-bold text-thb-text-primary mt-1">{s.count}</span>
              </div>
              {i < stageLabels.length - 1 && <FiChevronRight className="w-4 h-4 text-thb-text-muted flex-shrink-0 mx-0.5" />}
            </div>
          ))}
        </div>
      </div>

      {/* Tabs — royal active pill (Task 156-b, SmartHR tab pattern) */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl w-fit">
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === tab.key ? 'bg-[#3A57C4] text-white shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}>
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-thb-text-muted" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search candidates..." className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400" />
        </div>
        <div className="flex items-center gap-2">
          <FiFilter className="w-4 h-4 text-thb-text-muted" />
          <select value={filterStage} onChange={e => setFilterStage(e.target.value)} className="px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400">
            <option value="">All Stages</option>
            {stageLabels.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* Embedded CRUD Form */}
      {showForm && (
        <div id="crud-form" className="thb-card border-l-4 border-l-emerald-500 animate-slide-in-down">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-thb-text-primary">{editingId ? 'Edit Candidate' : 'Add New Candidate'}</h2>
              <button onClick={handleCancelForm} className="p-2 rounded-lg text-thb-text-muted hover:text-thb-text-primary hover:bg-slate-100 transition-colors"><FiX className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-thb-text-secondary mb-1">Full Name <span className="text-red-500 font-bold">*</span></label>
                <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g., John Doe" className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-thb-text-secondary mb-1">Email <span className="text-red-500 font-bold">*</span></label>
                <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="john@company.com" className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-thb-text-secondary mb-1">Position <span className="text-red-500 font-bold">*</span></label>
                <input type="text" value={form.position} onChange={e => setForm(p => ({ ...p, position: e.target.value }))} placeholder="e.g., Senior Developer" className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-thb-text-secondary mb-1">Stage</label>
                <select value={form.stage} onChange={e => setForm(p => ({ ...p, stage: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400">
                  {stageLabels.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-thb-text-secondary mb-1">Start Date</label>
                <input type="date" value={form.startDate} onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-thb-border">
              <button onClick={handleCancelForm} className="px-4 py-2.5 rounded-lg border border-thb-border text-sm font-medium text-thb-text-secondary hover:bg-slate-50 transition-colors">Cancel</button>
              <button onClick={handleSubmit} disabled={submitting} className="px-6 py-2.5 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 disabled:opacity-50 shadow-sm shadow-emerald-500/25 transition-colors">{submitting ? 'Saving...' : editingId ? 'Update' : 'Add Candidate'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Tab Content: Pipeline — SmartHR Panel (Task 156-b) */}
      {activeTab === 'pipeline' && (
        <Panel title="Candidate Pipeline" icon={<FiUserPlus className="w-4 h-4" />} accent="text-[#3A57C4]">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-thb-border bg-slate-50/50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Candidate</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Position</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Stage</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Start Date</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">HR Verified</th>
                  {isAdmin && <th className="text-right px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i} className="border-b border-thb-border/50 animate-pulse">
                      <td className="px-4 py-3"><div className="h-3 w-28 bg-slate-200 rounded" /></td>
                      <td className="px-4 py-3"><div className="h-3 w-24 bg-slate-200 rounded" /></td>
                      <td className="px-4 py-3"><div className="h-5 w-28 bg-slate-200 rounded-full" /></td>
                      <td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded" /></td>
                      <td className="px-4 py-3"><div className="h-3 w-12 bg-slate-200 rounded" /></td>
                      {isAdmin && <td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded ml-auto" /></td>}
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={isAdmin ? 6 : 5} className="px-4 py-12 text-center">
                      <FiUserPlus className="w-10 h-10 text-thb-text-muted mx-auto mb-3" />
                      <p className="text-thb-text-secondary font-medium">No candidates found</p>
                      <p className="text-sm text-thb-text-muted mt-1">Add candidates to start the pre-boarding process</p>
                    </td>
                  </tr>
                ) : (
                  filtered.map(c => {
                    const stageBadge = getStageBadge(c.stage);
                    return (
                      <tr key={c.id} className="border-b border-thb-border/50 hover:bg-slate-50/50 transition-colors">
                        {deleteConfirmId === c.id ? (
                          <td colSpan={isAdmin ? 6 : 5} className="px-4 py-3 bg-red-50">
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-red-700 font-medium">Remove &quot;{c.name}&quot; from pre-boarding?</span>
                              <div className="flex items-center gap-2">
                                <button onClick={() => handleDelete(c.id)} disabled={deleting} className="px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors">{deleting ? 'Removing...' : 'Confirm'}</button>
                                <button onClick={() => setDeleteConfirmId(null)} className="px-3 py-1.5 border border-thb-border text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors">Cancel</button>
                              </div>
                            </div>
                          </td>
                        ) : (
                          <>
                            <td className="px-4 py-3">
                              <p className="text-sm font-medium text-thb-text-primary">{c.name}</p>
                              <p className="text-xs text-thb-text-muted">{c.email}</p>
                            </td>
                            <td className="px-4 py-3 text-sm text-thb-text-secondary">{c.position}</td>
                            <td className="px-4 py-3"><span className={stageBadge.className}>{stageBadge.label}</span></td>
                            <td className="px-4 py-3 text-sm text-thb-text-secondary">{formatDate(c.startDate)}</td>
                            <td className="px-4 py-3">
                              <button onClick={() => toggleHRVerify(c.id)} className={`text-xs font-medium px-2 py-1 rounded-lg transition-colors ${c.hrVerified ? 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100' : 'text-slate-500 bg-slate-50 hover:bg-slate-100'}`}>
                                {c.hrVerified ? 'Verified' : 'Pending'}
                              </button>
                            </td>
                            {isAdmin && (
                              <td className="px-4 py-3">
                                <div className="flex items-center justify-end gap-1">
                                  {c.stage !== stageLabels[stageLabels.length - 1] && (
                                    <button onClick={() => handleAdvanceStage(c.id)} className="p-2 rounded-lg text-thb-text-muted hover:text-emerald-500 hover:bg-emerald-50 transition-colors" title="Advance Stage">
                                      <FiChevronRight className="w-4 h-4" />
                                    </button>
                                  )}
                                  <button onClick={() => handleShowEditForm(c)} className="p-2 rounded-lg text-thb-text-muted hover:text-green-500 hover:bg-green-50 transition-colors" title="Edit"><FiEdit2 className="w-4 h-4" /></button>
                                  <button onClick={() => setDeleteConfirmId(c.id)} className="p-2 rounded-lg text-thb-text-muted hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete"><FiTrash2 className="w-4 h-4" /></button>
                                </div>
                              </td>
                            )}
                          </>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* Tab Content: Documents */}
      {activeTab === 'documents' && (
        <div className="space-y-4">
          {filtered.length === 0 ? (
            <div className="thb-card p-12 text-center">
              <FiFileText className="w-10 h-10 text-thb-text-muted mx-auto mb-3" />
              <p className="text-thb-text-secondary font-medium">No document records found</p>
            </div>
          ) : (
            filtered.map(c => (
              <div key={c.id} className="thb-card p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm font-semibold text-thb-text-primary">{c.name}</p>
                    <p className="text-xs text-thb-text-muted">{c.position}</p>
                  </div>
                  <span className={getStageBadge(c.stage).className}>{c.stage}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                  {c.documents.map((doc, i) => {
                    const db = getDocStatusBadge(doc.status);
                    return (
                      <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-thb-border">
                        <FiFileText className="w-3.5 h-3.5 text-thb-text-muted flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-[10px] font-medium text-thb-text-secondary truncate">{doc.type}</p>
                          <span className={`text-[9px] ${db.className}`}>{db.label}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab Content: BGV Tracking — SmartHR Panel (Task 156-b) */}
      {activeTab === 'bgv' && (
        <Panel title="BGV Tracking" icon={<FiShield className="w-4 h-4" />} accent="text-[#6C4FD6]">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-thb-border bg-slate-50/50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Candidate</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Vendor</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">BGV Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Submitted</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Completed</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Notes</th>
                </tr>
              </thead>
              <tbody>
                {filtered.filter(c => c.bgv).length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center">
                      <FiShield className="w-10 h-10 text-thb-text-muted mx-auto mb-3" />
                      <p className="text-thb-text-secondary font-medium">No BGV records found</p>
                      <p className="text-sm text-thb-text-muted mt-1">BGV tracking begins at the Background Verification stage</p>
                    </td>
                  </tr>
                ) : (
                  filtered.filter(c => c.bgv).map(c => {
                    const bgvBadge = getBGVStatusBadge(c.bgv!.status);
                    return (
                      <tr key={c.id} className="border-b border-thb-border/50 hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-thb-text-primary">{c.name}</p>
                          <p className="text-xs text-thb-text-muted">{c.position}</p>
                        </td>
                        <td className="px-4 py-3 text-sm text-thb-text-secondary">{c.bgv!.vendor}</td>
                        <td className="px-4 py-3"><span className={bgvBadge.className}>{bgvBadge.label}</span></td>
                        <td className="px-4 py-3 text-sm text-thb-text-secondary">{formatDate(c.bgv!.submittedDate)}</td>
                        <td className="px-4 py-3 text-sm text-thb-text-secondary">{formatDate(c.bgv!.completedDate)}</td>
                        <td className="px-4 py-3 text-sm text-thb-text-secondary truncate max-w-[200px]">{c.bgv!.notes || '—'}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}
