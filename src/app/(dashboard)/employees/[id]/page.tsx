'use client';

import { useEffect, useState, useCallback } from 'react';
import { openDocumentInNewTab } from '@/lib/document-viewer';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  FiArrowLeft,
  FiUser,
  FiMail,
  FiPhone,
  FiMapPin,
  FiCalendar,
  FiBriefcase,
  FiDollarSign,
  FiFileText,
  FiClock,
  FiHeart,
  FiShield,
  FiUpload,
  FiEdit2,
  FiGlobe,
  FiDroplet,
  FiHome,
  FiUsers,
  FiAward,
  FiTrendingUp,
  FiStar,
  FiHash,
  FiCheckCircle,
  FiXCircle,
  FiCreditCard,
  FiRefreshCw,
  FiPlus,
  FiTrash2,
  FiToggleLeft,
  FiAlertCircle,
  FiDownload,
  FiX,
  FiLayers,
  FiEye,
  FiExternalLink,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { useCompanyContextStore, useCompanyContextPersistHydrated } from '@/store/companyContextStore';
import { canAccessEmployeeSettings, canEditEmployeeRecords } from '@/lib/roleAccess';
import IdentityVerification from '@/components/employees/IdentityVerification';
import SelfEditProfileModal from '@/components/hrms/SelfEditProfileModal';
import ProfileSectionEditRequest, { type ProfileSection } from '@/components/employees/ProfileSectionEditRequest';
import { employeePhotoUrl } from '@/lib/profile-photo';
import { isSafeDocumentUrl } from '@/lib/sanitize';
import { getToken } from '@/lib/token-storage';
import { formatHoursHm } from '@/lib/format-hours';

function getAuthHeaders() {
  const token = getToken() || (typeof window !== 'undefined' ? useAuthStore.getState().token : null);
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

// ─── Employee Policies Tab Component ───
function EmployeePoliciesTab({ employeeId }: { employeeId: string }) {
  const { user } = useAuthStore();
  const scopeQuery = useCompanyContextStore(s => s.scopeQuery);
  const selectedTenantId = useCompanyContextStore(s => s.selectedTenantId);
  const isAdmin = user?.role === 'super_admin' || (user?.role === 'tenant_admin' || user?.role === 'ceo') || user?.role === 'admin';
  const [policies, setPolicies] = useState<{ leave?: Record<string, unknown>; attendance?: Record<string, unknown>; travel?: Record<string, unknown>; salaryStructure?: Record<string, unknown>; leavePolicyId?: string | null; attendancePolicyId?: string | null; travelPolicyId?: string | null; salaryStructureId?: string | null } | null>(null);
  const [leavePolicies, setLeavePolicies] = useState<Array<{ id: string; title: string; version: string; effectiveDate?: string | null }>>([]);
  const [attendancePolicies, setAttendancePolicies] = useState<Array<{ id: string; title: string; version: string; effectiveDate?: string | null }>>([]);
  const [travelPolicies, setTravelPolicies] = useState<Array<{ id: string; title: string; version: string; effectiveDate?: string | null }>>([]);
  const [salaryStructures, setSalaryStructures] = useState<Array<{ id: string; name: string }>>([]);
  const [saving, setSaving] = useState<string | null>(null);
  // Task 137 — assigned company policy documents (view + download grid)
  const [companyPolicies, setCompanyPolicies] = useState<Array<Record<string, unknown>>>([]);

  const fetchPolicies = useCallback(async () => {
    const sqBase = scopeQuery();
    const sq = sqBase ? `${sqBase}&` : '';
    try {
      const [polRes, lpRes, apRes, tpRes, ssRes, cpRes] = await Promise.allSettled([
        fetch(`/api/employees/${employeeId}/policies?${sq}`, { headers: getAuthHeaders() }),
        // BUG FIX: usable=1 excludes inactive and future-dated policies from
        // the employee policy dropdowns.
        fetch(`/api/policies?${sq}category=leave&usable=1`, { headers: getAuthHeaders() }),
        fetch(`/api/policies?${sq}category=attendance&usable=1`, { headers: getAuthHeaders() }),
        fetch(`/api/policies?${sq}category=travel&usable=1`, { headers: getAuthHeaders() }),
        fetch(`/api/salary-structures?${sq}`, { headers: getAuthHeaders() }),
        // Task 137 — every ACTIVE company policy document (with its file)
        fetch(`/api/policies?${sq}status=active&includeFile=1&limit=100`, { headers: getAuthHeaders() }),
      ]);
      if (polRes.status === 'fulfilled' && polRes.value.ok) { const d = await polRes.value.json(); setPolicies(d.data); }
      if (lpRes.status === 'fulfilled' && lpRes.value.ok) { const d = await lpRes.value.json(); setLeavePolicies((d.policies || d.data || [])); }
      if (apRes.status === 'fulfilled' && apRes.value.ok) { const d = await apRes.value.json(); setAttendancePolicies((d.policies || d.data || [])); }
      if (tpRes.status === 'fulfilled' && tpRes.value.ok) { const d = await tpRes.value.json(); setTravelPolicies((d.policies || d.data || [])); }
      if (ssRes.status === 'fulfilled' && ssRes.value.ok) { const d = await ssRes.value.json(); setSalaryStructures((d.salaryStructures || d.data || [])); }
      if (cpRes.status === 'fulfilled' && cpRes.value.ok) {
        const d = await cpRes.value.json();
        const list = d.policies || d.data || [];
        setCompanyPolicies(Array.isArray(list) ? list.filter((p: Record<string, unknown>) => p.status !== 'inactive') : []);
      }
    } catch { /* silently */ }
  }, [employeeId, scopeQuery, selectedTenantId]);

  useEffect(() => { queueMicrotask(() => fetchPolicies()); }, [fetchPolicies]);

  const handleSave = async (field: string, value: string | null) => {
    setSaving(field);
    try {
      const res = await fetch(`/api/employees/${employeeId}/policies`, {
        method: 'PUT', headers: getAuthHeaders(),
        body: JSON.stringify({ [field]: value }),
      });
      if (res.ok) { toast.success('Updated'); fetchPolicies(); }
      else { toast.error('Failed'); }
    } catch { toast.error('Failed'); }
    finally { setSaving(null); }
  };

  const policyDropdown = (label: string, field: string, items: Array<{ id: string; title: string; version: string; effectiveDate?: string | null }>, currentId: string | null | undefined, icon: React.ReactNode) => (
    <div className="thb-card p-5">
      <h4 className="text-sm font-semibold text-thb-text-primary mb-3 flex items-center gap-2">{icon}{label}</h4>
      <select
        value={currentId || ''}
        onChange={e => handleSave(field, e.target.value || null)}
        disabled={!isAdmin || saving === field}
        className="w-full px-3 py-2 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 disabled:opacity-50"
      >
        <option value="">— Not Assigned —</option>
        {items.map(p => <option key={p.id} value={p.id}>{p.title} (v{p.version})</option>)}
      </select>
      {currentId && items.find(p => p.id === currentId) && (
        <div className="mt-3 p-3 rounded-lg bg-slate-50 border border-thb-border text-xs text-thb-text-secondary">
          <p><span className="font-medium">Title:</span> {items.find(p => p.id === currentId)?.title}</p>
          <p><span className="font-medium">Version:</span> {items.find(p => p.id === currentId)?.version}</p>
          {items.find(p => p.id === currentId)?.effectiveDate && <p><span className="font-medium">Effective:</span> {new Date(items.find(p => p.id === currentId)!.effectiveDate!).toLocaleDateString()}</p>}
        </div>
      )}
      {saving === field && <p className="text-xs text-green-500 mt-2">Saving...</p>}
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Task 137 — Assigned Company Policies grid (every employee can view/download) */}
      <div className="thb-card p-5">
        <h4 className="text-sm font-semibold text-thb-text-primary mb-1 flex items-center gap-2"><FiShield className="w-4 h-4 text-violet-500" />Assigned Company Policies</h4>
        <p className="text-xs text-thb-text-muted mb-4">Policy documents assigned to this employee — view or download them from here.</p>
        {companyPolicies.length === 0 ? (
          <p className="text-xs text-thb-text-muted">No active company policies published yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {companyPolicies.map((p) => {
              const title = String(p.title || 'Untitled policy');
              const category = String(p.category || 'other');
              const version = String(p.version || '1.0');
              const fileName = String(p.fileName || '');
              const fileUrl = String(p.fileUrl || '');
              const isData = fileUrl.startsWith('data:');
              const eff = p.effectiveDate ? new Date(String(p.effectiveDate)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
              return (
                <div key={String(p.id)} className="p-3 rounded-xl border border-thb-border bg-white flex flex-col gap-2">
                  <div className="flex items-start gap-2">
                    <div className="w-9 h-9 rounded-lg bg-violet-50 border border-violet-100 flex items-center justify-center flex-shrink-0">
                      <FiShield className="w-4 h-4 text-violet-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-thb-text-primary truncate" title={title}>{title}</p>
                      <p className="text-[10px] text-thb-text-muted">
                        <span className="capitalize">{category.replace(/_/g, ' ')}</span> · v{version}{eff ? ` · from ${eff}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-auto">
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          // Task 139 — open the ORIGINAL document (native PDF/image render
                          // via a blob URL); description fallback only when no file exists.
                          if (fileUrl) {
                            const opened = openDocumentInNewTab(fileUrl, fileName || `${title}.pdf`);
                            if (!opened) toast.error('Could not open the policy document — use Download instead');
                          } else {
                            const w = window.open('', '_blank');
                            if (w) {
                              w.document.write(`<html><head><title>${title}</title></head><body style="font-family:Arial,sans-serif;padding:24px;white-space:pre-wrap"><h2 style="color:#10b981">${title}</h2><p><em>Policy description (no file attached)</em></p>${String(p.description || '').slice(0, 200000)}</body></html>`);
                              w.document.close();
                            }
                          }
                        } catch { toast.error('Could not open the policy'); }
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-violet-50 text-violet-700 text-xs font-semibold hover:bg-violet-100 transition-colors"
                    >
                      <FiEye className="w-3.5 h-3.5" /> View
                    </button>
                    {fileUrl ? (
                      <a
                        href={fileUrl}
                        download={fileName || `${title}.${isData ? 'pdf' : 'txt'}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold hover:bg-slate-200 transition-colors"
                      >
                        <FiDownload className="w-3.5 h-3.5" /> Download{fileName ? '' : ' link'}
                      </a>
                    ) : (
                      <span className="text-[10px] text-thb-text-muted">No document attached</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {!isAdmin && <div className="p-3 rounded-lg bg-amber-50 border border-amber-100 text-xs text-amber-700">Only admins can modify policy mappings.</div>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {policyDropdown('Leave Policy', 'leavePolicyId', leavePolicies, policies?.leavePolicyId, <FiCalendar className="w-4 h-4 text-green-500" />)}
        {policyDropdown('Attendance Policy', 'attendancePolicyId', attendancePolicies, policies?.attendancePolicyId, <FiClock className="w-4 h-4 text-emerald-500" />)}
        {policyDropdown('Travel Policy', 'travelPolicyId', travelPolicies, policies?.travelPolicyId, <FiBriefcase className="w-4 h-4 text-amber-500" />)}
        <div className="thb-card p-5">
          <h4 className="text-sm font-semibold text-thb-text-primary mb-3 flex items-center gap-2"><FiDollarSign className="w-4 h-4 text-emerald-500" />Salary Structure</h4>
          <select
            value={policies?.salaryStructureId || ''}
            onChange={e => handleSave('salaryStructureId', e.target.value || null)}
            disabled={!isAdmin || saving === 'salaryStructureId'}
            className="w-full px-3 py-2 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 disabled:opacity-50"
          >
            <option value="">— Not Assigned —</option>
            {salaryStructures.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {saving === 'salaryStructureId' && <p className="text-xs text-green-500 mt-2">Saving...</p>}
        </div>
      </div>
    </div>
  );
}

function formatDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function getStatusBadge(status: string) {
  const map: Record<string, string> = {
    active: 'bg-gradient-to-r from-emerald-500 to-teal-400 text-white thb-badge shadow-sm shadow-emerald-200',
    on_leave: 'bg-gradient-to-r from-amber-500 to-orange-400 text-white thb-badge shadow-sm shadow-amber-200',
    terminated: 'bg-gradient-to-r from-red-500 to-rose-400 text-white thb-badge shadow-sm shadow-red-200',
    resigned: 'bg-gradient-to-r from-slate-500 to-slate-400 text-white thb-badge shadow-sm shadow-slate-200',
  };
  const labels: Record<string, string> = { active: 'Active', on_leave: 'On Leave', terminated: 'Terminated', resigned: 'Resigned' };
  return { className: map[status] || 'thb-badge thb-badge-info', label: labels[status] || status };
}

interface EmployeeData {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  personalEmail?: string | null;
  avatar?: string | null;
  user?: { id?: string; email?: string; role?: string; avatar?: string | null } | null;
  department?: { id: string; name: string; company?: { id: string; name: string; code: string | null } | null } | null;
  designation?: { id: string; title: string } | null;
  branch?: { id: string; name: string; company?: { id: string; name: string; code: string | null } | null } | null;
  company?: { id: string; name: string; code: string | null } | null;
  dateOfJoining: string;
  status: string;
  dateOfBirth?: string | null;
  originalBirthday?: string | null;
  gender?: string | null;
  maritalStatus?: string | null;
  nationality?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  country?: string | null;
  currentAddress?: string | null;
  currentCity?: string | null;
  currentState?: string | null;
  currentZipCode?: string | null;
  currentCountry?: string | null;
  bloodGroup?: string | null;
  bankName?: string | null;
  bankAccountNo?: string | null;
  bankIfscCode?: string | null;
  panNumber?: string | null;
  aadhaarNumber?: string | null;
  salary?: number | null;
  salaryCurrency?: string;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  emergencyContactRelation?: string | null;
  leaveBalances?: Array<{
    id: string;
    total: number;
    used: number;
    remaining: number;
    year: number;
    leaveType: { id: string; name: string; code: string };
  }>;
  dependents?: Array<{ id: string; name: string; relation: string; dateOfBirth?: string | null; gender?: string | null }>;
  qualifications?: Array<{ id: string; degree: string; institution: string; year: number; percentage?: number | null }>;
  // Task 137 — richer experience rows + interests + company tags
  interests?: string | null;
  experiences?: Array<{ id: string; company: string; designation: string; startDate: string; endDate?: string | null; isCurrent: boolean; description?: string | null; companyLogo?: string | null; companyCategory?: string | null; companyLevel?: string | null; domains?: string[] | string | null; letters?: Array<{ name?: string; type?: string; fileUrl?: string }> | string | null }>;
  achievements?: Array<{ id: string; title: string; description?: string | null; category?: string | null; issuer?: string | null; achievedOn?: string | null }>;
  kycVerification?: string | null;
  kycVerifiedAt?: string | null;
  skills?: Array<{ id: string; skill: string; level: string; yearsOfExp?: number | null }>;
  documents?: Array<{ id: string; name: string; type: string; fileUrl?: string | null; status: string; uploadedAt: string; expiryDate?: string | null }>;
  assetAssignments?: Array<{ id: string; status: string; assignedDate: string; asset: { id: string; name: string; assetTag: string; category: string } }>;
  reportingManager?: { id: string; firstName: string; lastName: string; employeeId: string; designation?: { title: string } | null } | null;
  _count?: { directReports: number } | null;
}

const tabs = ['Overview', 'Personal', 'Employment', 'Experience', 'Achievements', 'Documents', 'Verification', 'Leave', 'Attendance', 'Payroll', 'Health', 'Policies', 'Company Mapping'] as const;
type TabName = typeof tabs[number];

// Task 158 — currency symbol from the employee's salaryCurrency (system
// default INR). The Payroll tab previously hard-coded "$", which showed
// dollars to Indian-origin employees; now every payslip row renders in the
// employee's own currency, consistent with the rest of the system.
function currencySymbol(code?: string | null): string {
  switch ((code || 'INR').toUpperCase()) {
    case 'INR': return '₹';
    case 'USD': return '$';
    case 'EUR': return '€';
    case 'GBP': return '£';
    case 'AED': return 'AED ';
    default: return `${code} `;
  }
}

// Task 158 — self-service banner shown on the employee's OWN profile for the
// editable sections: explains the HR-approval flow and opens the request
// modal. A pending request shows an amber chip instead of the button.
function SelfServiceEditBanner({
  sectionLabel,
  pending,
  onRequest,
}: {
  sectionLabel: string;
  pending: boolean;
  onRequest: () => void;
}) {
  return (
    <div className="thb-card p-4 flex flex-col sm:flex-row sm:items-center gap-3 border-l-4 border-l-teal-500">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-thb-text-primary">Want to correct your {sectionLabel} details?</p>
        <p className="text-xs text-thb-text-muted mt-0.5">
          Submit an edit request — HR reviews it and your official record updates only after approval.
        </p>
      </div>
      {pending ? (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-xs font-semibold whitespace-nowrap">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
          Edit pending HR approval
        </span>
      ) : (
        <button
          onClick={onRequest}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 shadow-sm whitespace-nowrap"
        >
          <FiEdit2 className="w-3.5 h-3.5" />
          Request Edit
        </button>
      )}
    </div>
  );
}

// ─── Info Field Component ───
function InfoField({ label, value, icon, accentColor, onNavigate, navigateHint }: { label: string; value?: string | null; icon?: React.ReactNode; accentColor?: string; onNavigate?: () => void; navigateHint?: string }) {
  return (
    <div className="flex items-start gap-3 py-3 pl-3 border-l-2 border-transparent hover:border-l-green-400 transition-colors group">
      {icon && <span className="mt-0.5 text-thb-text-muted flex-shrink-0 group-hover:text-green-500 transition-colors">{icon}</span>}
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-thb-text-muted mb-0.5">{label}</p>
        {onNavigate && value ? (
          <button
            onClick={onNavigate}
            title={navigateHint || 'Open profile'}
            className="text-sm font-medium text-green-600 hover:text-green-700 hover:underline break-words text-left transition-colors"
          >
            {value}
          </button>
        ) : (
          <p className="text-sm font-medium text-thb-text-primary break-words">{value || '—'}</p>
        )}
      </div>
    </div>
  );
}

// ─── Section Card Component ───
function SectionCard({ title, icon, children, accentGradient }: { title: string; icon?: React.ReactNode; children: React.ReactNode; accentGradient?: string }) {
  const gradient = accentGradient || 'from-teal-500 via-green-500 to-cyan-400';
  return (
    <div className="thb-card overflow-hidden relative">
      {/* Colorful left border */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b ${gradient}`} />
      <div className={`px-6 py-4 border-b border-thb-border bg-gradient-to-r from-teal-50/60 via-green-50/40 to-cyan-50/30`}>
        <h3 className="text-sm font-semibold text-thb-text-primary flex items-center gap-2">
          {icon}
          {title}
        </h3>
      </div>
      <div className="p-6">
        {children}
      </div>
    </div>
  );
}

// ─── Stat Card Component ───
function StatCard({ icon, label, value, subtitle, colorClass, borderGradient }: { icon: React.ReactNode; label: string; value: string | number; subtitle?: string; colorClass: string; borderGradient: string }) {
  return (
    <div className={`thb-card p-5 flex items-start gap-4 relative overflow-hidden border-l-4 border-transparent`}>
      {/* Gradient left border */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b ${borderGradient}`} />
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm ${colorClass}`}>
        {icon}
      </div>
      <div>
        <p className="text-xs font-medium text-thb-text-muted mb-1">{label}</p>
        <p className="text-xl font-bold text-thb-text-primary">{value}</p>
        {subtitle && <p className="text-[11px] text-thb-text-muted mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

// Task 154 — accepts an optional selfEmployeeId so the SAME page component
// renders on /my-profile for the logged-in user (My Profile ≡ Employee List
// → View Details, per user request). When set, params are ignored and the
// "Back to Employees" navigation is hidden (self-service roles cannot open
// the /employees area).
export default function EmployeeDetailPage({ selfEmployeeId }: { selfEmployeeId?: string } = {}) {
  const params = useParams();
  const router = useRouter();
  const id = selfEmployeeId || (params?.id as string) || '';
  const { user } = useAuthStore();
  const canManageMappings = canAccessEmployeeSettings(user?.role);
  const canEditRecord = canEditEmployeeRecords(user?.role);
  const persistHydrated = useCompanyContextPersistHydrated();
  const scopeQuery = useCompanyContextStore(s => s.scopeQuery);
  const selectedTenantId = useCompanyContextStore(s => s.selectedTenantId);

  const [employee, setEmployee] = useState<EmployeeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabName>('Overview');
  const [showSelfEdit, setShowSelfEdit] = useState(false);
  const [companyMappings, setCompanyMappings] = useState<Array<{ id: string; companyId: string; employeeCode: string; isPrimary: boolean; department?: { name: string } | null; designation?: { title: string } | null; branch?: { name: string } | null; company?: { name: string; code?: string } | null }>>([]);
  // Task 158 — self-service section edit requests (Experience / Achievements /
  // Documents / Verification / Health) visible on the employee's OWN profile.
  const [editSection, setEditSection] = useState<ProfileSection | null>(null);
  const [mySectionRequests, setMySectionRequests] = useState<Array<{ id: string; fieldName: string; status: string; createdAt: string; approverComments?: string | null }>>([]);

  const [attendance, setAttendance] = useState<Array<{ id: string; date: string; checkIn?: string | null; checkOut?: string | null; workHours?: number | null; overtime?: number | null; status: string }>>([]);
  const [payrolls, setPayrolls] = useState<Array<{ id: string; month: number; year: number; grossSalary: number; totalDeductions: number; netSalary: number; status: string; paidDate?: string | null }>>([]);
  const [leaveRequests, setLeaveRequests] = useState<Array<{ id: string; startDate: string; endDate: string; reason?: string | null; status: string; halfDay: boolean; leaveType: { name: string } }>>([]);
  const [now] = useState(() => Date.now());

  const fetchEmployee = useCallback(async (signal?: AbortSignal) => {
    try {
      setLoading(true);
      setLoadError(null);
      const sq = scopeQuery();
      const qs = sq ? `?${sq}` : '';
      const res = await fetch(`/api/employees/${encodeURIComponent(id)}${qs}`, { headers: getAuthHeaders(), signal });
      if (signal?.aborted) return;
      if (res.status === 503) {
        setLoadError('Database temporarily unavailable. Please try again.');
        setEmployee(null);
        return;
      }
      if (res.status === 404) {
        setLoadError('Employee not found in database.');
        setEmployee(null);
        return;
      }
      if (!res.ok) {
        setLoadError(`Failed to load employee (HTTP ${res.status})`);
        setEmployee(null);
        return;
      }
      const data = await res.json();
      if (signal?.aborted) return;
      setEmployee(data.employee);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.error('Failed to load employee details:', err);
      setLoadError('Network error. Please check your connection and try again.');
      setEmployee(null);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [id, scopeQuery, selectedTenantId]);

  const fetchCompanyMappings = useCallback(async () => {
    if (!employee) return;
    try {
      const sq = scopeQuery();
      const qs = sq ? `&${sq}` : '';
      const res = await fetch(`/api/employees/company-mappings?employeeId=${employee.id}${qs}`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setCompanyMappings(data.mappings || []);
      }
    } catch { /* silently */ }
  }, [employee, scopeQuery, selectedTenantId]);

  // Task 158 — the employee's own section-edit requests (status chips + the
  // "My Profile Edit Requests" panel on the Overview tab).
  const fetchMySectionRequests = useCallback(async () => {
    if (!selfEmployeeId) return;
    try {
      const res = await fetch('/api/employees/update-requests?scope=mine', { headers: getAuthHeaders() });
      if (!res.ok) return;
      const d = await res.json();
      setMySectionRequests(d.requests || []);
    } catch { /* optional surface */ }
  }, [selfEmployeeId]);

  useEffect(() => {
    if (employee?.id && selfEmployeeId) queueMicrotask(() => { fetchMySectionRequests(); });
  }, [employee?.id, selfEmployeeId, fetchMySectionRequests]);

  const fetchRelatedData = useCallback(async () => {
    if (!employee) return;
    const sqBase = scopeQuery();
    const sq = sqBase ? `${sqBase}&` : '';
    try {
      const headers = getAuthHeaders();
      const [attRes, payRes, leaveRes] = await Promise.allSettled([
        fetch(`/api/attendance?${sq}employeeId=${employee.id}&limit=30`, { headers }),
        fetch(`/api/payroll?${sq}employeeId=${employee.id}&limit=12`, { headers }),
        fetch(`/api/leave?${sq}employeeId=${employee.id}&limit=20`, { headers }),
      ]);
      if (attRes.status === 'fulfilled' && attRes.value.ok) {
        const d = await attRes.value.json();
        setAttendance(d.attendance || []);
      }
      if (payRes.status === 'fulfilled' && payRes.value.ok) {
        const d = await payRes.value.json();
        setPayrolls(d.payrolls || []);
      }
      if (leaveRes.status === 'fulfilled' && leaveRes.value.ok) {
        const d = await leaveRes.value.json();
        setLeaveRequests(d.leaveRequests || []);
      }
    } catch (err) {
      console.error(err);
    }
  }, [employee, scopeQuery, selectedTenantId]);

  useEffect(() => {
    if (!persistHydrated) return;
    const ac = new AbortController();
    queueMicrotask(() => fetchEmployee(ac.signal));
    return () => ac.abort();
  }, [fetchEmployee, persistHydrated]);

  useEffect(() => {
    if (employee) queueMicrotask(() => fetchRelatedData());
  }, [employee, fetchRelatedData]);

  useEffect(() => {
    if (employee && activeTab === 'Company Mapping') queueMicrotask(() => fetchCompanyMappings());
  }, [employee, activeTab, fetchCompanyMappings]);

  // ─── Loading State ───
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="thb-card overflow-hidden animate-pulse">
          <div className="h-32 bg-gradient-to-r from-slate-200 to-slate-100" />
          <div className="px-6 pb-6 -mt-12">
            <div className="flex items-end gap-5">
              <div className="w-[120px] h-[120px] rounded-2xl bg-slate-200 border-4 border-white" />
              <div className="pb-3 space-y-2 flex-1">
                <div className="h-6 w-48 bg-slate-200 rounded" />
                <div className="h-4 w-64 bg-slate-200 rounded" />
              </div>
            </div>
          </div>
        </div>
        <div className="thb-card p-6 animate-pulse">
          <div className="flex gap-4 mb-6">
            {[1,2,3,4,5].map(i => <div key={i} className="h-8 w-20 bg-slate-200 rounded" />)}
          </div>
          <div className="grid grid-cols-3 gap-4">
            {[1,2,3,4,5,6].map(i => <div key={i} className="h-16 bg-slate-200 rounded" />)}
          </div>
        </div>
      </div>
    );
  }

  // ─── Not Found / Error State ───
  if (!employee) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-5">
            <FiUser className="w-10 h-10 text-slate-300" />
          </div>
          <p className="text-lg font-semibold text-thb-text-primary mb-1">Employee Not Found</p>
          <p className="text-sm text-thb-text-secondary mb-2">The employee you&apos;re looking for doesn&apos;t exist or has been removed.</p>
          {loadError && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
              {loadError}
            </p>
          )}
          <p className="text-xs text-thb-text-muted mb-5">Employee ID: {id}</p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => fetchEmployee()}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 transition-colors shadow-sm"
            >
              <FiRefreshCw className="w-4 h-4" />
              Retry
            </button>
            {!selfEmployeeId && (
            <button
              onClick={() => router.push('/employees')}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors shadow-sm"
            >
              <FiArrowLeft className="w-4 h-4" />
              Back to Employees
            </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const badge = getStatusBadge(employee.status);
  const initials = `${employee.firstName[0]}${employee.lastName[0]}`;
  const profilePhoto = employeePhotoUrl(employee);
  const isOwnProfile = Boolean(
    (user?.employee?.id && user.employee.id === employee.id)
    || (user?.id && employee.user?.id && user.id === employee.user.id)
    || (user?.email && employee.email && user.email.toLowerCase() === employee.email.toLowerCase()),
  );
  const profileViewOnly = !canEditRecord && !isOwnProfile;
  // Task 158 — pending section-request chips on the employee's own profile.
  const SECTION_REQUEST_KEYS: ProfileSection[] = ['experience', 'achievements', 'documents', 'verification', 'health'];
  const SECTION_REQUEST_LABELS: Record<ProfileSection, string> = { experience: 'Experience', achievements: 'Achievements', documents: 'Documents', verification: 'Verification', health: 'Health' };
  const pendingSectionField = new Set(
    mySectionRequests.filter((r) => r.status === 'pending' && SECTION_REQUEST_KEYS.includes(r.fieldName as ProfileSection)).map((r) => r.fieldName),
  );
  const sectionRequestRows = mySectionRequests.filter((r) => SECTION_REQUEST_KEYS.includes(r.fieldName as ProfileSection)).slice(0, 6);
  const daysEmployed = Math.floor((now - new Date(employee.dateOfJoining).getTime()) / (1000 * 60 * 60 * 24));
  const totalLeaveBalance = employee.leaveBalances?.reduce((sum, lb) => sum + lb.remaining, 0) || 0;
  const attendanceRate = attendance.length > 0 ? Math.round((attendance.filter(a => ['present', 'late'].includes(a.status)).length / attendance.length) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* ═══════════════════════════════════════════
          PROFILE HEADER CARD — SmartHR Style
          ═══════════════════════════════════════════ */}
      <div className="thb-card overflow-hidden">
        {/* Gradient Strip */}
        <div className="h-32 bg-gradient-to-r from-teal-600 via-fuchsia-500 to-cyan-400 relative">
          {/* Subtle pattern overlay */}
          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'0.4\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' }} />
        </div>

        {/* Profile Content - overlaps the gradient */}
        <div className="px-6 pb-6 -mt-12 relative">
          <div className="flex flex-col sm:flex-row items-start sm:items-end gap-5">
            {/* Avatar */}
            <div className="flex-shrink-0">
              {profilePhoto ? (
                <img
                  src={profilePhoto}
                  alt={`${employee.firstName} ${employee.lastName}`}
                  className="w-[120px] h-[120px] rounded-2xl object-cover border-4 border-white shadow-lg"
                />
              ) : (
                <div className="w-[120px] h-[120px] rounded-2xl bg-gradient-to-br from-rose-500 via-teal-500 to-emerald-600 flex items-center justify-center text-white text-4xl font-bold border-4 border-white shadow-lg">
                  {initials}
                </div>
              )}
            </div>

            {/* Name, Designation, Meta */}
            <div className="flex-1 min-w-0 pb-1">
              <div className="flex flex-wrap items-center gap-3 mb-1">
                <h1 className="text-2xl font-bold text-thb-text-primary tracking-tight">
                  {employee.firstName} {employee.lastName}
                </h1>
                <span className={badge.className}>{badge.label}</span>
              </div>
              <p className="text-sm text-thb-text-secondary font-medium mb-2">
                {employee.designation?.title || 'No Designation'}
              </p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-thb-text-muted">
                <span className="inline-flex items-center gap-1.5 bg-white border border-thb-border rounded-md px-2.5 py-1 font-medium text-thb-text-secondary shadow-sm">
                  <FiHash className="w-3 h-3" />
                  {employee.employeeId}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <FiBriefcase className="w-3 h-3" />
                  {employee.department?.name || 'No Department'}
                </span>
                {employee.branch && (
                  <span className="inline-flex items-center gap-1.5">
                    <FiBriefcase className="w-3 h-3" />
                    {employee.branch.name}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <FiCalendar className="w-3 h-3" />
                  Joined {formatDate(employee.dateOfJoining)}
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 flex-shrink-0 sm:pb-1">
              {canEditRecord && (
              <button
                onClick={() => router.push(`/employees?editId=${id}`)}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-teal-600 via-fuchsia-500 to-cyan-500 text-white rounded-lg text-sm font-medium hover:from-teal-700 hover:via-fuchsia-600 hover:to-cyan-600 transition-all shadow-md shadow-fuchsia-200/50"
              >
                <FiEdit2 className="w-3.5 h-3.5" />
                Edit
              </button>
              )}
              {/* Task 162: ESS self-edit — employees editing their OWN profile
                  get the contact-details editor (PATCH /api/users/profile:
                  low-risk applied directly, high-risk routed to approvals). */}
              {!canEditRecord && isOwnProfile && (
                <button
                  onClick={() => setShowSelfEdit(true)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-teal-600 via-fuchsia-500 to-cyan-500 text-white rounded-lg text-sm font-medium hover:from-teal-700 hover:via-fuchsia-600 hover:to-cyan-600 transition-all shadow-md shadow-fuchsia-200/50"
                >
                  <FiEdit2 className="w-3.5 h-3.5" />
                  Edit Profile
                </button>
              )}
              {profileViewOnly && (
                <span className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-500 bg-slate-50 border border-slate-200 rounded-lg">
                  View only
                </span>
              )}
              {!selfEmployeeId && (
              <button
                onClick={() => router.push('/employees')}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-thb-border text-thb-text-secondary rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors shadow-sm"
              >
                <FiArrowLeft className="w-3.5 h-3.5" />
                Back
              </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════
          STAT CARDS ROW
          ═══════════════════════════════════════════ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<FiCalendar className="w-5 h-5 text-green-600" />}
          label="Days Employed"
          value={daysEmployed}
          subtitle={`Since ${formatDate(employee.dateOfJoining)}`}
          colorClass="bg-gradient-to-br from-green-100 to-green-50"
          borderGradient="from-green-500 via-green-400 to-cyan-400"
        />
        <StatCard
          icon={<FiClock className="w-5 h-5 text-emerald-600" />}
          label="Attendance Rate"
          value={`${attendanceRate}%`}
          subtitle="Last 30 days"
          colorClass="bg-gradient-to-br from-emerald-100 to-emerald-50"
          borderGradient="from-emerald-500 via-teal-400 to-green-400"
        />
        <StatCard
          icon={<FiCalendar className="w-5 h-5 text-amber-600" />}
          label="Leave Balance"
          value={totalLeaveBalance}
          subtitle="Days remaining"
          colorClass="bg-gradient-to-br from-amber-100 to-amber-50"
          borderGradient="from-amber-500 via-orange-400 to-yellow-400"
        />
        <StatCard
          icon={<FiDollarSign className="w-5 h-5 text-teal-600" />}
          label="Salary"
          value={employee.salary ? `${currencySymbol(employee.salaryCurrency)} ${(employee.salary / 1000).toFixed(0)}K` : '—'}
          subtitle={employee.salary ? employee.salary.toLocaleString() : undefined}
          colorClass="bg-gradient-to-br from-teal-100 to-teal-50"
          borderGradient="from-teal-500 via-teal-400 to-fuchsia-400"
        />
      </div>

      {/* ═══════════════════════════════════════════
          TAB NAVIGATION + CONTENT
          ═══════════════════════════════════════════ */}
      {/* Task 137 — mandatory/optional section clarity on the view page */}
      <div className="flex items-center gap-4 text-xs text-thb-text-secondary flex-wrap px-1">
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
          <span className="text-red-500 font-bold">*</span> Mandatory sections: Personal, Address, Employment, Bank, Emergency, Health
        </span>
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
          Optional sections: Statutory, Overseas, Experience, Documents, Policies, Company Mapping
        </span>
      </div>
      <div className="thb-card overflow-hidden">
        {/* Tab Bar */}
        <div className="border-b border-thb-border bg-gradient-to-r from-teal-50/30 via-green-50/20 to-cyan-50/30 overflow-x-auto">
          <nav className="flex px-6">
            {tabs.map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`relative px-4 py-3.5 text-sm font-medium whitespace-nowrap transition-all ${
                  activeTab === tab
                    ? 'text-transparent bg-clip-text bg-gradient-to-r from-teal-600 to-cyan-500'
                    : 'text-thb-text-muted hover:text-thb-text-primary'
                }`}
              >
                {tab}
                {activeTab === tab && (
                  <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-gradient-to-r from-teal-500 via-fuchsia-500 to-cyan-400 rounded-full" />
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-6">

          {/* ── Overview Tab ── */}
          {activeTab === 'Overview' && (
            <div className="space-y-6">
              {/* Task 158 — self-service: status of my section edit requests */}
              {selfEmployeeId && sectionRequestRows.length > 0 && (
                <SectionCard title="My Profile Edit Requests" icon={<FiEdit2 className="w-4 h-4 text-teal-500" />} accentGradient="from-teal-500 via-cyan-400 to-emerald-400">
                  <div className="space-y-2">
                    {sectionRequestRows.map((r) => {
                      const label = SECTION_REQUEST_LABELS[r.fieldName as ProfileSection] || r.fieldName;
                      const statusStyle: Record<string, string> = {
                        pending: 'bg-amber-50 text-amber-700 border-amber-200',
                        approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                        applied: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                        rejected: 'bg-rose-50 text-rose-700 border-rose-200',
                        cancelled: 'bg-slate-50 text-slate-600 border-slate-200',
                      };
                      return (
                        <div key={r.id} className="flex items-center gap-3 p-3 rounded-lg border border-thb-border hover:bg-slate-50/60 transition-colors">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-thb-text-primary">{label} edit request</p>
                            <p className="text-xs text-thb-text-muted">{new Date(r.createdAt).toLocaleString()}{r.approverComments ? ` — “${r.approverComments}”` : ''}</p>
                          </div>
                          <span className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold capitalize ${statusStyle[r.status] || 'bg-slate-50 text-slate-600 border-slate-200'}`}>{r.status}</span>
                        </div>
                      );
                    })}
                    <Link href="/employees/update-requests" className="inline-flex items-center gap-1 text-xs font-semibold text-teal-600 hover:text-teal-700 mt-1">View all in Update Requests →</Link>
                  </div>
                </SectionCard>
              )}
              {/* Personal Information */}
              <SectionCard title="Personal Information" icon={<FiUser className="w-4 h-4 text-green-500" />} accentGradient="from-green-500 via-emerald-400 to-teal-400">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-0">
                  <InfoField label="Full Name" value={`${employee.firstName} ${employee.lastName}`} icon={<FiUser className="w-3.5 h-3.5" />} />
                  <InfoField label="Date of Birth" value={formatDate(employee.dateOfBirth)} icon={<FiCalendar className="w-3.5 h-3.5" />} />
                  <InfoField label="Original Birthday" value={formatDate(employee.originalBirthday)} icon={<FiCalendar className="w-3.5 h-3.5" />} />
                  <InfoField label="Gender" value={employee.gender} icon={<FiUser className="w-3.5 h-3.5" />} />
                  <InfoField label="Marital Status" value={employee.maritalStatus} icon={<FiHeart className="w-3.5 h-3.5" />} />
                  <InfoField label="Nationality" value={employee.nationality} icon={<FiGlobe className="w-3.5 h-3.5" />} />
                  <InfoField label="Blood Group" value={employee.bloodGroup} icon={<FiDroplet className="w-3.5 h-3.5" />} />
                </div>
              </SectionCard>

              {/* Contact Information */}
              <SectionCard title="Contact Information" icon={<FiMail className="w-4 h-4 text-emerald-500" />} accentGradient="from-emerald-500 via-teal-400 to-cyan-400">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-0">
                  <InfoField label="Email" value={employee.email} icon={<FiMail className="w-3.5 h-3.5" />} />
                  <InfoField label="Phone" value={employee.phone} icon={<FiPhone className="w-3.5 h-3.5" />} />
                  <InfoField label="Permanent Address" value={[employee.address, employee.city, employee.state, employee.zipCode, employee.country].filter(Boolean).join(', ') || null} icon={<FiHome className="w-3.5 h-3.5" />} />
                  <InfoField label="Current Address" value={[employee.currentAddress, employee.currentCity, employee.currentState, employee.currentZipCode, employee.currentCountry].filter(Boolean).join(', ') || null} icon={<FiMapPin className="w-3.5 h-3.5" />} />
                </div>
              </SectionCard>

              {/* Reporting & Team — mirrors the Reporting Manager field on the
                  Add/Edit forms; drives leave approvals, notifications, org chart */}
              <SectionCard title="Reporting & Team" icon={<FiUsers className="w-4 h-4 text-cyan-500" />} accentGradient="from-cyan-500 via-teal-400 to-emerald-400">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-0">
                  <InfoField
                    label="Reporting Manager"
                    value={employee.reportingManager ? `${employee.reportingManager.firstName} ${employee.reportingManager.lastName}${employee.reportingManager.employeeId ? ` · ${employee.reportingManager.employeeId}` : ''}` : 'No Reporting Manager'}
                    icon={<FiBriefcase className="w-3.5 h-3.5" />}
                    onNavigate={employee.reportingManager ? () => router.push(`/employees/${employee.reportingManager!.id}`) : undefined}
                    navigateHint="Open reporting manager profile"
                  />
                  <InfoField label="Direct Reports" value={employee._count?.directReports ? `${employee._count.directReports} team member${employee._count.directReports === 1 ? '' : 's'}` : '—'} icon={<FiUsers className="w-3.5 h-3.5" />} />
                  <InfoField label="Reporting Manager Designation" value={employee.reportingManager?.designation?.title} icon={<FiUser className="w-3.5 h-3.5" />} />
                </div>
                <p className="text-xs text-thb-text-muted mt-2 ml-3">Leave approvals, workflow notifications and the org chart position are driven by the reporting manager. Admins can change it via Edit → Employment.</p>
              </SectionCard>

              {/* Emergency Contact */}
              <SectionCard title="Emergency Contact" icon={<FiHeart className="w-4 h-4 text-rose-500" />} accentGradient="from-rose-500 via-pink-400 to-fuchsia-400">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-0">
                  <InfoField label="Contact Name" value={employee.emergencyContactName} icon={<FiUser className="w-3.5 h-3.5" />} />
                  <InfoField label="Relationship" value={employee.emergencyContactRelation} />
                  <InfoField label="Contact Phone" value={employee.emergencyContactPhone} icon={<FiPhone className="w-3.5 h-3.5" />} />
                </div>
              </SectionCard>

              {/* Skills */}
              {employee.skills && employee.skills.length > 0 && (
                <SectionCard title="Skills" icon={<FiAward className="w-4 h-4 text-teal-500" />} accentGradient="from-teal-500 via-teal-400 to-fuchsia-400">
                  <div className="flex flex-wrap gap-2">
                    {employee.skills.map(s => (
                      <span key={s.id} className="inline-flex items-center gap-1.5 bg-gradient-to-r from-teal-100 to-fuchsia-100 text-teal-700 px-2.5 py-1 rounded-full text-xs font-medium shadow-sm">
                        <FiTrendingUp className="w-3 h-3" />
                        {s.skill}
                        <span className="opacity-60">·</span>
                        {s.level}
                      </span>
                    ))}
                  </div>
                </SectionCard>
              )}
            </div>
          )}

          {/* ── Personal Tab ── */}
          {activeTab === 'Personal' && (
            <div className="space-y-6">
              {/* Personal Details */}
              <SectionCard title="Personal Details" icon={<FiUser className="w-4 h-4 text-green-500" />} accentGradient="from-green-500 via-emerald-400 to-teal-400">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-0">
                  <InfoField label="First Name" value={employee.firstName} />
                  <InfoField label="Last Name" value={employee.lastName} />
                  <InfoField label="Email" value={employee.email} icon={<FiMail className="w-3.5 h-3.5" />} />
                  <InfoField label="Phone" value={employee.phone} icon={<FiPhone className="w-3.5 h-3.5" />} />
                  <InfoField label="Date of Birth" value={formatDate(employee.dateOfBirth)} icon={<FiCalendar className="w-3.5 h-3.5" />} />
                  <InfoField label="Original Birthday" value={formatDate(employee.originalBirthday)} icon={<FiCalendar className="w-3.5 h-3.5" />} />
                  <InfoField label="Gender" value={employee.gender} />
                  <InfoField label="Marital Status" value={employee.maritalStatus} />
                  <InfoField label="Nationality" value={employee.nationality} icon={<FiGlobe className="w-3.5 h-3.5" />} />
                  <InfoField label="Blood Group" value={employee.bloodGroup} icon={<FiDroplet className="w-3.5 h-3.5" />} />
                </div>
              </SectionCard>

              <SectionCard title="Permanent Address" icon={<FiHome className="w-4 h-4 text-emerald-500" />} accentGradient="from-emerald-500 via-teal-400 to-cyan-400">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-0">
                  <InfoField label="Street Address" value={employee.address} icon={<FiHome className="w-3.5 h-3.5" />} />
                  <InfoField label="City" value={employee.city} icon={<FiMapPin className="w-3.5 h-3.5" />} />
                  <InfoField label="State" value={employee.state} />
                  <InfoField label="ZIP Code" value={employee.zipCode} />
                  <InfoField label="Country" value={employee.country} icon={<FiGlobe className="w-3.5 h-3.5" />} />
                </div>
              </SectionCard>

              <SectionCard title="Current Address" icon={<FiMapPin className="w-4 h-4 text-cyan-500" />} accentGradient="from-cyan-500 via-teal-400 to-emerald-400">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-0">
                  <InfoField label="Street Address" value={employee.currentAddress} icon={<FiMapPin className="w-3.5 h-3.5" />} />
                  <InfoField label="City" value={employee.currentCity} icon={<FiMapPin className="w-3.5 h-3.5" />} />
                  <InfoField label="State" value={employee.currentState} />
                  <InfoField label="ZIP Code" value={employee.currentZipCode} />
                  <InfoField label="Country" value={employee.currentCountry} icon={<FiGlobe className="w-3.5 h-3.5" />} />
                </div>
              </SectionCard>

              {/* Emergency Contact */}
              <SectionCard title="Emergency Contact" icon={<FiHeart className="w-4 h-4 text-rose-500" />} accentGradient="from-rose-500 via-pink-400 to-fuchsia-400">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-0">
                  <InfoField label="Contact Name" value={employee.emergencyContactName} icon={<FiUser className="w-3.5 h-3.5" />} />
                  <InfoField label="Relationship" value={employee.emergencyContactRelation} />
                  <InfoField label="Contact Phone" value={employee.emergencyContactPhone} icon={<FiPhone className="w-3.5 h-3.5" />} />
                </div>
              </SectionCard>

              {/* Dependents */}
              {employee.dependents && employee.dependents.length > 0 && (
                <SectionCard title="Dependents" icon={<FiUsers className="w-4 h-4 text-amber-500" />} accentGradient="from-amber-500 via-orange-400 to-yellow-400">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-thb-border">
                          <th className="text-left py-3 text-xs font-semibold text-thb-text-muted uppercase tracking-wider">Name</th>
                          <th className="text-left py-3 text-xs font-semibold text-thb-text-muted uppercase tracking-wider">Relation</th>
                          <th className="text-left py-3 text-xs font-semibold text-thb-text-muted uppercase tracking-wider">Date of Birth</th>
                          <th className="text-left py-3 text-xs font-semibold text-thb-text-muted uppercase tracking-wider">Gender</th>
                        </tr>
                      </thead>
                      <tbody>
                        {employee.dependents.map(dep => (
                          <tr key={dep.id} className="border-b border-thb-border/50 hover:bg-slate-50/50 transition-colors">
                            <td className="py-3 text-sm font-medium text-thb-text-primary">{dep.name}</td>
                            <td className="py-3 text-sm text-thb-text-secondary">{dep.relation}</td>
                            <td className="py-3 text-sm text-thb-text-secondary">{formatDate(dep.dateOfBirth)}</td>
                            <td className="py-3 text-sm text-thb-text-secondary">{dep.gender || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </SectionCard>
              )}

              {/* Task 137 — Interests (Personal tab) */}
              <SectionCard title="Interests" icon={<FiHeart className="w-4 h-4 text-violet-500" />} accentGradient="from-violet-500 via-fuchsia-400 to-pink-400">
                {(() => {
                  const interests = String((employee as unknown as Record<string, unknown>).interests || '')
                    .split(',').map(s => s.trim()).filter(Boolean);
                  if (!interests.length) {
                    return <p className="text-xs text-thb-text-muted">No interests recorded. Add them from Edit Employee → Personal → Interests.</p>;
                  }
                  return (
                    <div className="flex flex-wrap gap-2">
                      {interests.map((s, i) => (
                        <span key={`${s}-${i}`} className="inline-flex items-center px-3 py-1.5 rounded-full bg-violet-50 text-violet-700 text-xs font-medium border border-violet-200">
                          {s}
                        </span>
                      ))}
                    </div>
                  );
                })()}
              </SectionCard>
            </div>
          )}

          {/* ── Employment Tab ── */}
          {activeTab === 'Employment' && (
            <div className="space-y-6">
              {/* Employment Details */}
              <SectionCard title="Employment Details" icon={<FiBriefcase className="w-4 h-4 text-green-500" />} accentGradient="from-green-500 via-emerald-400 to-teal-400">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-0">
                  <InfoField label="Employee ID" value={employee.employeeId} icon={<FiHash className="w-3.5 h-3.5" />} />
                  <InfoField label="Department" value={employee.department?.name} icon={<FiBriefcase className="w-3.5 h-3.5" />} />
                  <InfoField label="Designation" value={employee.designation?.title} icon={<FiUser className="w-3.5 h-3.5" />} />
                  <InfoField
                    label="Reporting Manager"
                    value={employee.reportingManager ? `${employee.reportingManager.firstName} ${employee.reportingManager.lastName}${employee.reportingManager.employeeId ? ` · ${employee.reportingManager.employeeId}` : ''}` : 'No Reporting Manager'}
                    icon={<FiUsers className="w-3.5 h-3.5" />}
                    onNavigate={employee.reportingManager ? () => router.push(`/employees/${employee.reportingManager!.id}`) : undefined}
                    navigateHint="Open reporting manager profile"
                  />
                  <InfoField label="Direct Reports" value={employee._count?.directReports ? `${employee._count.directReports} team member${employee._count.directReports === 1 ? '' : 's'}` : '—'} icon={<FiUsers className="w-3.5 h-3.5" />} />
                  <InfoField label="Branch" value={employee.branch?.name} icon={<FiBriefcase className="w-3.5 h-3.5" />} />
                  <InfoField label="Date of Joining" value={formatDate(employee.dateOfJoining)} icon={<FiCalendar className="w-3.5 h-3.5" />} />
                  <InfoField label="Status" value={badge.label} />
                  <InfoField label="Employee Status" value={(employee as unknown as Record<string, unknown>).employeeStatus ? String((employee as unknown as Record<string, unknown>).employeeStatus).charAt(0).toUpperCase() + String((employee as unknown as Record<string, unknown>).employeeStatus).slice(1) : '—'} />
                  <InfoField label="Employee Type" value={(employee as unknown as Record<string, unknown>).employeeType ? String((employee as unknown as Record<string, unknown>).employeeType).replace(/_/g, ' ').charAt(0).toUpperCase() + String((employee as unknown as Record<string, unknown>).employeeType).slice(1).replace(/_/g, ' ') : '—'} />
                  <InfoField label="Personal Email" value={(employee as unknown as Record<string, unknown>).personalEmail as string || '—'} icon={<FiMail className="w-3.5 h-3.5" />} />
                  <InfoField label="Reporting Manager Designation" value={employee.reportingManager?.designation?.title} icon={<FiUser className="w-3.5 h-3.5" />} />
                </div>
              </SectionCard>

              {/* Task 137 — Technical Skills (feeds the skill matrix) */}
              <SectionCard title="Technical Skills" icon={<FiAward className="w-4 h-4 text-teal-500" />} accentGradient="from-teal-500 via-teal-400 to-fuchsia-400">
                {(employee.skills || []).length === 0 ? (
                  <p className="text-xs text-thb-text-muted">No technical skills recorded. Add them from Edit Employee → Employment → Technical Skills.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {(employee.skills || []).map((sk) => {
                      const lvl = (sk.level || 'intermediate').toLowerCase();
                      const color = lvl === 'expert'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : lvl === 'advanced'
                          ? 'bg-teal-50 text-teal-700 border-teal-200'
                          : lvl === 'beginner'
                            ? 'bg-slate-50 text-slate-600 border-slate-200'
                            : 'bg-sky-50 text-sky-700 border-sky-200';
                      return (
                        <div key={sk.id} className="flex items-center justify-between gap-2 p-3 rounded-lg border border-thb-border bg-white">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-thb-text-primary truncate">{sk.skill}</p>
                            <p className="text-[11px] text-thb-text-muted capitalize">{lvl}{sk.yearsOfExp ? ` · ${sk.yearsOfExp} yr${sk.yearsOfExp === 1 ? '' : 's'}` : ''}</p>
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border capitalize flex-shrink-0 ${color}`}>{lvl}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </SectionCard>

              {/* Bank Details */}
              <SectionCard title="Bank & Statutory Details" icon={<FiShield className="w-4 h-4 text-teal-500" />} accentGradient="from-teal-500 via-teal-400 to-fuchsia-400">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-0">
                  <InfoField label="Bank Name" value={employee.bankName} icon={<FiBriefcase className="w-3.5 h-3.5" />} />
                  <InfoField label="Account No" value={employee.bankAccountNo} icon={<FiHash className="w-3.5 h-3.5" />} />
                  <InfoField label="IFSC Code" value={employee.bankIfscCode} />
                  <InfoField label="PAN Number" value={employee.panNumber} icon={<FiFileText className="w-3.5 h-3.5" />} />
                  <InfoField label="Aadhaar Number" value={employee.aadhaarNumber} icon={<FiShield className="w-3.5 h-3.5" />} />
                </div>
              </SectionCard>

              {/* Qualifications */}
              {employee.qualifications && employee.qualifications.length > 0 && (
                <SectionCard title="Qualifications" icon={<FiAward className="w-4 h-4 text-green-500" />} accentGradient="from-green-500 via-emerald-400 to-teal-400">
                  <div className="space-y-4">
                    {employee.qualifications.map(q => (
                      <div key={q.id} className="flex items-start gap-4 p-4 rounded-xl border border-thb-border hover:bg-slate-50/50 transition-colors">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-100 to-green-50 flex items-center justify-center flex-shrink-0">
                          <FiAward className="w-5 h-5 text-green-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-thb-text-primary">{q.degree}</p>
                          <p className="text-xs text-thb-text-secondary mt-0.5">{q.institution}</p>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-xs text-thb-text-muted">Year: {q.year}</span>
                            {q.percentage && <span className="text-xs text-thb-text-muted">Score: {q.percentage}%</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </SectionCard>
              )}
            </div>
          )}

          {activeTab === 'Experience' && (
            <div className="space-y-6">
              {selfEmployeeId && (
                <SelfServiceEditBanner sectionLabel="experience" pending={pendingSectionField.has('experience')} onRequest={() => setEditSection('experience')} />
              )}
              {/* Task 137 — dynamic experience entries (legacy previousEmployer1..3 rows fall back below) */}
              {(employee.experiences || []).map((exp, i) => {
                const dur = (() => {
                  try {
                    const start = new Date(exp.startDate);
                    const end = exp.isCurrent || !exp.endDate ? new Date() : new Date(exp.endDate);
                    if (isNaN(start.getTime())) return '';
                    let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
                    if (end.getDate() < start.getDate()) months -= 1;
                    if (months < 0) return '';
                    const years = Math.floor(months / 12);
                    const mos = months % 12;
                    if (years && mos) return `${years} yr${years > 1 ? 's' : ''} ${mos} mo${mos > 1 ? 's' : ''}`;
                    if (years) return `${years} yr${years > 1 ? 's' : ''}`;
                    return months ? `${months} mo${months > 1 ? 's' : ''}` : 'Just joined';
                  } catch { return ''; }
                })();
                return (
                  <SectionCard key={exp.id || i} title={`Experience ${i + 1}${exp.isCurrent ? ' (Current)' : ''}`} icon={<FiTrendingUp className="w-4 h-4 text-amber-500" />} accentGradient="from-amber-500 via-orange-400 to-yellow-400">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-lg bg-white border border-thb-border flex items-center justify-center overflow-hidden flex-shrink-0">
                        {exp.companyLogo ? (
                          <img src={exp.companyLogo} alt={exp.company} className="w-9 h-9 object-contain" />
                        ) : (
                          <FiBriefcase className="w-5 h-5 text-slate-300" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <p className="text-sm font-semibold text-thb-text-primary">{exp.company}</p>
                          {exp.companyCategory && (
                            <span className="px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 text-[10px] font-semibold border border-violet-200">
                              {({ listed: 'Listed', non_listed: 'Non-Listed', government: 'Government', psu: 'PSU', startup: 'Startup', other: 'Other' } as Record<string, string>)[exp.companyCategory] || exp.companyCategory}
                            </span>
                          )}
                          {exp.companyLevel && (
                            <span className="px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 text-[10px] font-semibold border border-teal-200">
                              {({ mnc: 'MNC', tier_1: 'Tier-1', tier_2: 'Tier-2', tier_3: 'Tier-3', large: 'Large Enterprise', mid: 'Mid-Size', startup: 'Startup', small: 'Small Company' } as Record<string, string>)[exp.companyLevel] || exp.companyLevel}
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-0">
                          <InfoField label="Designation" value={exp.designation} icon={<FiUser className="w-3.5 h-3.5" />} />
                          <InfoField label="From" value={new Date(exp.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} icon={<FiCalendar className="w-3.5 h-3.5" />} />
                          <InfoField label="To" value={exp.isCurrent ? 'Currently working' : (exp.endDate ? new Date(exp.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : null)} icon={<FiClock className="w-3.5 h-3.5" />} />
                          {dur && <InfoField label="Duration" value={dur} />}
                          {exp.description && <InfoField label="Reason for Leaving" value={exp.description} />}
                        </div>
                        {(() => {
                          // Task 138 — domains worked + proof letters for this employer
                          const parseJson = (v: unknown): unknown[] | null => {
                            if (Array.isArray(v)) return v;
                            if (typeof v === 'string' && v.trim()) { try { const j = JSON.parse(v); return Array.isArray(j) ? j : null; } catch { return null; } }
                            return null;
                          };
                          const doms = parseJson(exp.domains) as string[] | null;
                          const letters = (parseJson(exp.letters) || []) as Array<{ name?: string; type?: string; fileUrl?: string }>;
                          const letterLabels: Record<string, string> = {
                            offer_letter: 'Offer Letter', relieving_letter: 'Relieving Letter', experience_letter: 'Experience Letter',
                            appraisal_letter: 'Appraisal / Increment Letter', payslip: 'Payslip', other: 'Other Letter',
                          };
                          if (!doms?.length && !letters.length) return null;
                          return (
                            <div className="mt-3 pt-3 border-t border-slate-100 space-y-2.5">
                              {doms && doms.length > 0 && (
                                <div>
                                  <p className="text-[10px] font-semibold text-thb-text-muted uppercase tracking-wider mb-1.5">Domains worked in</p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {doms.map((d) => (
                                      <span key={d} className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-medium">{d}</span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {letters.length > 0 && (
                                <div>
                                  <p className="text-[10px] font-semibold text-thb-text-muted uppercase tracking-wider mb-1.5">Letters from this company</p>
                                  <div className="flex flex-wrap gap-2">
                                    {letters.filter((l) => l.fileUrl).map((l, li) => (
                                      <a
                                        key={li}
                                        href={l.fileUrl || '#'}
                                        {...(l.fileUrl?.startsWith('data:') ? { download: l.name || 'letter' } : { target: '_blank', rel: 'noopener noreferrer' })}
                                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-teal-200 bg-teal-50 text-teal-700 text-[11px] font-medium hover:bg-teal-100 transition-colors"
                                      >
                                        <FiFileText className="w-3.5 h-3.5" />
                                        {letterLabels[l.type || 'other'] || 'Letter'}{l.name && !l.fileUrl?.startsWith('data:') ? ` · ${l.name}` : ''}
                                      </a>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </SectionCard>
                );
              })}
              {/* Legacy static rows (pre-Task-137 data) — hidden once dynamic entries exist */}
              {(employee.experiences || []).length === 0 && ([1, 2, 3] as const).map((n) => {
                const rec = employee as unknown as Record<string, unknown>;
                const hasLegacy = Boolean(rec[`previousEmployer${n}`]);
                if (!hasLegacy) return null;
                return (
                  <SectionCard key={n} title={`Experience ${n}`} icon={<FiTrendingUp className="w-4 h-4 text-amber-500" />} accentGradient="from-amber-500 via-orange-400 to-yellow-400">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-0">
                      <InfoField label="Previous Employer" value={(rec[`previousEmployer${n}`] as string) || null} icon={<FiBriefcase className="w-3.5 h-3.5" />} />
                      <InfoField label="Designation" value={(rec[`previousDesignation${n}`] as string) || null} icon={<FiUser className="w-3.5 h-3.5" />} />
                      <InfoField label="Duration" value={(rec[`previousDuration${n}`] as string) || null} icon={<FiClock className="w-3.5 h-3.5" />} />
                      <InfoField label="Reason for Leaving" value={(rec[`previousReason${n}`] as string) || null} />
                    </div>
                  </SectionCard>
                );
              })}
              {(employee.experiences || []).length === 0 && !((employee as unknown as Record<string, unknown>).previousEmployer1 || (employee as unknown as Record<string, unknown>).previousEmployer2 || (employee as unknown as Record<string, unknown>).previousEmployer3) && (
                <div className="thb-card p-6 text-center">
                  <FiBriefcase className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-thb-text-muted">No previous experience recorded yet. Add entries from Edit Employee → Experience.</p>
                </div>
              )}
              <SectionCard title="Total Experience" icon={<FiStar className="w-4 h-4 text-teal-500" />} accentGradient="from-teal-500 via-teal-400 to-emerald-400">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-0">
                  <InfoField label="Total Experience" value={(() => {
                    const rec = employee as unknown as Record<string, unknown>;
                    const spans = (employee.experiences || []).map((x) => ({ startDate: x.startDate, endDate: x.endDate, isCurrent: x.isCurrent }));
                    let months = 0;
                    for (const sp of spans) {
                      if (!sp.startDate) continue;
                      try {
                        const st = new Date(sp.startDate);
                        const en = sp.isCurrent || !sp.endDate ? new Date() : new Date(sp.endDate);
                        let m = (en.getFullYear() - st.getFullYear()) * 12 + (en.getMonth() - st.getMonth());
                        if (en.getDate() < st.getDate()) m -= 1;
                        if (m > 0) months += m;
                      } catch { /* skip */ }
                    }
                    const yrs = Math.round((months / 12) * 10) / 10;
                    if (yrs > 0) return `${yrs} yr${yrs === 1 ? '' : 's'}`;
                    return (rec.totalExperience as string) || null;
                  })()} />
                </div>
              </SectionCard>
            </div>
          )}

          {/* ── Documents Tab ── */}
          {activeTab === 'Documents' && (
            <div className="space-y-6">
              {selfEmployeeId && (
                <SelfServiceEditBanner sectionLabel="document" pending={pendingSectionField.has('documents')} onRequest={() => setEditSection('documents')} />
              )}
              <EmployeeDocumentsTab employeeId={employee.id} initialDocuments={employee.documents || []} viewOnly={profileViewOnly} />
            </div>
          )}

          {/* ── Achievements Tab (Task 138) ── */}
          {activeTab === 'Achievements' && (
            <div className="space-y-6">
              {selfEmployeeId && (
                <SelfServiceEditBanner sectionLabel="achievements" pending={pendingSectionField.has('achievements')} onRequest={() => setEditSection('achievements')} />
              )}
              {(employee.achievements || []).map((a, i) => (
                <SectionCard key={a.id || i} title={a.title || `Achievement ${i + 1}`} icon={<FiAward className="w-4 h-4 text-violet-500" />} accentGradient="from-violet-500 via-purple-400 to-fuchsia-400">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-0">
                    <InfoField label="Category" value={({ previous_company: 'Previous Company', certification: 'Certification', award: 'Award / Recognition', academic: 'Academic', community: 'Community / Social', other: 'Other' } as Record<string, string>)[a.category || 'other'] || a.category || null} icon={<FiAward className="w-3.5 h-3.5" />} />
                    <InfoField label="Issued by" value={a.issuer || null} icon={<FiBriefcase className="w-3.5 h-3.5" />} />
                    <InfoField label="Date" value={a.achievedOn ? new Date(a.achievedOn).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : null} icon={<FiCalendar className="w-3.5 h-3.5" />} />
                    {a.description && <InfoField label="Description" value={a.description} />}
                  </div>
                </SectionCard>
              ))}
              {(employee.achievements || []).length === 0 && (
                <div className="thb-card p-6 text-center">
                  <FiAward className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-thb-text-muted">No achievements recorded yet. Add them from Edit Employee → Experience → Achievements (from the previous company experience or any other source).</p>
                </div>
              )}
            </div>
          )}

          {/* ── Verification Tab (Task 138 — Aadhaar / PAN / DigiLocker) ── */}
          {activeTab === 'Verification' && (
            <div className="space-y-6">
              {selfEmployeeId && (
                <SelfServiceEditBanner sectionLabel="verification" pending={pendingSectionField.has('verification')} onRequest={() => setEditSection('verification')} />
              )}
              <IdentityVerification employeeId={employee.id} canVerify={canEditRecord} />
            </div>
          )}

          {/* ── Leave Tab ── */}
          {activeTab === 'Leave' && (
            <div className="space-y-6">
              {/* Leave Balances */}
              {employee.leaveBalances && employee.leaveBalances.length > 0 && (
                <SectionCard title="Leave Balances" icon={<FiCalendar className="w-4 h-4 text-green-500" />} accentGradient="from-green-500 via-emerald-400 to-teal-400">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {employee.leaveBalances.map(lb => {
                      const pct = lb.total > 0 ? (lb.used / lb.total) * 100 : 0;
                      const barColor = pct > 80 ? 'bg-gradient-to-r from-red-500 to-rose-400' : pct > 50 ? 'bg-gradient-to-r from-amber-500 to-orange-400' : 'bg-gradient-to-r from-green-500 to-cyan-400';
                      return (
                        <div key={lb.id} className="p-4 rounded-xl border border-thb-border hover:shadow-md transition-all hover:border-green-200">
                          <div className="flex items-center justify-between mb-3">
                            <p className="text-sm font-semibold text-thb-text-primary">{lb.leaveType.name}</p>
                            <span className="text-xs font-medium text-thb-text-muted">{lb.year}</span>
                          </div>
                          <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden mb-3">
                            <div className={`h-full rounded-full transition-all shadow-sm ${barColor}`} style={{ width: `${pct}%` }} />
                          </div>
                          <div className="flex items-center justify-between text-xs text-thb-text-muted">
                            <span>Total: <strong className="text-thb-text-secondary">{lb.total}</strong></span>
                            <span>Used: <strong className="text-thb-text-secondary">{lb.used}</strong></span>
                            <span>Remaining: <strong className="text-emerald-600">{lb.remaining}</strong></span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </SectionCard>
              )}

              {/* Leave History */}
              <SectionCard title="Leave History" icon={<FiClock className="w-4 h-4 text-amber-500" />} accentGradient="from-amber-500 via-orange-400 to-yellow-400">
                {leaveRequests.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                      <FiCalendar className="w-8 h-8 text-slate-300" />
                    </div>
                    <p className="text-sm text-thb-text-muted">No leave requests found</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-thb-border">
                          <th className="text-left py-3 text-xs font-semibold text-thb-text-muted uppercase tracking-wider">Type</th>
                          <th className="text-left py-3 text-xs font-semibold text-thb-text-muted uppercase tracking-wider">From</th>
                          <th className="text-left py-3 text-xs font-semibold text-thb-text-muted uppercase tracking-wider">To</th>
                          <th className="text-left py-3 text-xs font-semibold text-thb-text-muted uppercase tracking-wider">Reason</th>
                          <th className="text-left py-3 text-xs font-semibold text-thb-text-muted uppercase tracking-wider">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {leaveRequests.map(lr => {
                          const statusMap: Record<string, string> = { pending: 'thb-badge thb-badge-warning', approved: 'thb-badge thb-badge-success', rejected: 'thb-badge thb-badge-error', cancelled: 'bg-slate-100 text-slate-600 thb-badge' };
                          return (
                            <tr key={lr.id} className="border-b border-thb-border/50 hover:bg-slate-50/50 transition-colors">
                              <td className="py-3 text-sm font-medium text-thb-text-primary">{lr.leaveType.name}</td>
                              <td className="py-3 text-sm text-thb-text-secondary">{formatDate(lr.startDate)}</td>
                              <td className="py-3 text-sm text-thb-text-secondary">{formatDate(lr.endDate)}</td>
                              <td className="py-3 text-sm text-thb-text-secondary truncate max-w-[200px]">{lr.reason || '—'}</td>
                              <td className="py-3"><span className={statusMap[lr.status] || 'thb-badge thb-badge-info'}>{lr.status}</span></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </SectionCard>
            </div>
          )}

          {/* ── Attendance Tab ── */}
          {activeTab === 'Attendance' && (
            <SectionCard title="Recent Attendance" icon={<FiClock className="w-4 h-4 text-emerald-500" />} accentGradient="from-emerald-500 via-teal-400 to-cyan-400">
              {attendance.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                    <FiClock className="w-8 h-8 text-slate-300" />
                  </div>
                  <p className="text-sm text-thb-text-muted">No attendance records found</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-thb-border">
                        <th className="text-left py-3 text-xs font-semibold text-thb-text-muted uppercase tracking-wider">Date</th>
                        <th className="text-left py-3 text-xs font-semibold text-thb-text-muted uppercase tracking-wider">Check In</th>
                        <th className="text-left py-3 text-xs font-semibold text-thb-text-muted uppercase tracking-wider">Check Out</th>
                        <th className="text-left py-3 text-xs font-semibold text-thb-text-muted uppercase tracking-wider">Work Hours</th>
                        <th className="text-left py-3 text-xs font-semibold text-thb-text-muted uppercase tracking-wider">Overtime</th>
                        <th className="text-left py-3 text-xs font-semibold text-thb-text-muted uppercase tracking-wider">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attendance.map(a => {
                        const statusMap: Record<string, string> = { present: 'thb-badge thb-badge-success', absent: 'thb-badge thb-badge-error', late: 'bg-orange-50 text-orange-700 thb-badge', half_day: 'thb-badge thb-badge-warning', holiday: 'thb-badge thb-badge-info', weekend: 'bg-slate-100 text-slate-600 thb-badge', on_leave: 'thb-badge thb-badge-warning' };
                        const statusLabels: Record<string, string> = { present: 'Present', absent: 'Absent', late: 'Present (Late)', half_day: 'Half Day', holiday: 'Holiday', weekend: 'Weekend', on_leave: 'On Leave' };
                        return (
                          <tr key={a.id} className="border-b border-thb-border/50 hover:bg-slate-50/50 transition-colors">
                            <td className="py-3 text-sm font-medium text-thb-text-primary">{formatDate(a.date)}</td>
                            <td className="py-3 text-sm text-thb-text-secondary">{a.checkIn ? formatDateTime(a.checkIn) : '—'}</td>
                            <td className="py-3 text-sm text-thb-text-secondary">{a.checkOut ? formatDateTime(a.checkOut) : '—'}</td>
                            <td className="py-3 text-sm text-thb-text-secondary">{a.workHours != null ? formatHoursHm(a.workHours) : '—'}</td>
                            <td className="py-3 text-sm text-thb-text-secondary">{a.overtime != null && a.overtime > 0 ? formatHoursHm(a.overtime) : '—'}</td>
                            <td className="py-3"><span className={statusMap[a.status] || 'thb-badge thb-badge-info'}>{statusLabels[a.status] || a.status.replace('_', ' ')}</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          )}

          {/* ── Payroll Tab ── */}
          {activeTab === 'Payroll' && (
            <SectionCard title="Recent Payslips" icon={<FiDollarSign className="w-4 h-4 text-emerald-500" />} accentGradient="from-emerald-500 via-teal-400 to-cyan-400">
              {payrolls.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                    <FiDollarSign className="w-8 h-8 text-slate-300" />
                  </div>
                  <p className="text-sm text-thb-text-muted">No payroll records found</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-thb-border">
                        <th className="text-left py-3 text-xs font-semibold text-thb-text-muted uppercase tracking-wider">Month</th>
                        <th className="text-left py-3 text-xs font-semibold text-thb-text-muted uppercase tracking-wider">Gross Salary</th>
                        <th className="text-left py-3 text-xs font-semibold text-thb-text-muted uppercase tracking-wider">Deductions</th>
                        <th className="text-left py-3 text-xs font-semibold text-thb-text-muted uppercase tracking-wider">Net Salary</th>
                        <th className="text-left py-3 text-xs font-semibold text-thb-text-muted uppercase tracking-wider">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payrolls.map(p => {
                        const months = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                        const statusMap: Record<string, string> = { draft: 'thb-badge thb-badge-warning', processed: 'thb-badge thb-badge-info', paid: 'thb-badge thb-badge-success', cancelled: 'thb-badge thb-badge-error' };
                        return (
                          <tr key={p.id} className="border-b border-thb-border/50 hover:bg-slate-50/50 transition-colors">
                            <td className="py-3 text-sm font-medium text-thb-text-primary">{months[p.month]} {p.year}</td>
                            <td className="py-3 text-sm text-thb-text-secondary">{currencySymbol(employee.salaryCurrency)}{p.grossSalary.toLocaleString()}</td>
                            <td className="py-3 text-sm text-red-500">{currencySymbol(employee.salaryCurrency)}{p.totalDeductions.toLocaleString()}</td>
                            <td className="py-3 text-sm font-semibold text-emerald-600">{currencySymbol(employee.salaryCurrency)}{p.netSalary.toLocaleString()}</td>
                            <td className="py-3"><span className={statusMap[p.status] || 'thb-badge thb-badge-info'}>{p.status}</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          )}

          {/* ── Health Tab ── */}
          {activeTab === 'Health' && (
            <div className="space-y-6">
              {selfEmployeeId && (
                <SelfServiceEditBanner sectionLabel="health" pending={pendingSectionField.has('health')} onRequest={() => setEditSection('health')} />
              )}
              {/* Vitals & Blood */}
              <SectionCard title="Vitals & Blood Information" icon={<FiHeart className="w-4 h-4 text-red-500" />} accentGradient="from-red-500 via-rose-400 to-pink-400">
                <p className="text-xs text-thb-text-muted mb-4">Employee health information for workplace safety and emergency preparedness.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-0">
                  <InfoField label="Blood Group" value={employee.bloodGroup} icon={<FiDroplet className="w-3.5 h-3.5" />} />
                  <InfoField label="Emergency Condition" value={(employee as unknown as Record<string, unknown>).emergencyMedicalCondition as string} />
                </div>
              </SectionCard>

              {/* Medical History */}
              <SectionCard title="Medical History" icon={<FiShield className="w-4 h-4 text-amber-500" />} accentGradient="from-amber-500 via-orange-400 to-yellow-400">
                <div className="space-y-3">
                  {[
                    { label: 'Chronic Illness', value: (employee as unknown as Record<string, unknown>).hasChronicIllness as string, details: (employee as unknown as Record<string, unknown>).chronicIllnessDetails as string },
                    { label: 'Allergies', value: (employee as unknown as Record<string, unknown>).hasAllergies as string, details: (employee as unknown as Record<string, unknown>).allergyDetails as string },
                    { label: 'Disability', value: (employee as unknown as Record<string, unknown>).hasDisability as string, details: (employee as unknown as Record<string, unknown>).disabilityDetails as string },
                    { label: 'On Medication', value: (employee as unknown as Record<string, unknown>).isOnMedication as string, details: (employee as unknown as Record<string, unknown>).medicationDetails as string },
                    { label: 'Previous Surgery', value: (employee as unknown as Record<string, unknown>).hasHadSurgery as string, details: (employee as unknown as Record<string, unknown>).surgeryDetails as string },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center gap-3 p-3 rounded-lg border border-thb-border hover:bg-slate-50/50 transition-colors">
                      {item.value === 'yes' ? (
                        <FiCheckCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                      ) : (
                        <FiXCircle className="w-4 h-4 text-slate-300 flex-shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-thb-text-primary">{item.label}</p>
                        <p className="text-xs text-thb-text-muted">{item.value === 'yes' ? `Yes — ${item.details || 'No details provided'}` : item.value === 'no' ? 'No' : '—'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </SectionCard>

              {/* Task 137 — Insurance (renamed from "Physician & Insurance") + family details */}
              <SectionCard title="Insurance" icon={<FiShield className="w-4 h-4 text-green-500" />} accentGradient="from-green-500 via-emerald-400 to-teal-400">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-0">
                  <InfoField label="Primary Physician" value={(employee as unknown as Record<string, unknown>).primaryPhysicianName as string} icon={<FiUser className="w-3.5 h-3.5" />} />
                  <InfoField label="Physician Phone" value={(employee as unknown as Record<string, unknown>).primaryPhysicianPhone as string} icon={<FiPhone className="w-3.5 h-3.5" />} />
                  <InfoField label="Insurance Provider" value={(employee as unknown as Record<string, unknown>).healthInsuranceProvider as string} icon={<FiShield className="w-3.5 h-3.5" />} />
                  <InfoField label="Policy Number" value={(employee as unknown as Record<string, unknown>).healthInsurancePolicyNo as string} icon={<FiFileText className="w-3.5 h-3.5" />} />
                </div>

                {/* Family details covered under the medical insurance */}
                <div className="mt-5 pt-4 border-t border-thb-border/60">
                  <p className="text-xs font-semibold text-thb-text-primary mb-3">Family Details (Medical Insurance)</p>
                  {(employee.dependents || []).length === 0 ? (
                    <p className="text-xs text-thb-text-muted">No family members recorded for insurance cover. Add them from Edit Employee → Health → Insurance.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {(employee.dependents || []).map((dep) => (
                        <div key={dep.id} className="flex items-center gap-3 p-3 rounded-lg border border-thb-border bg-white">
                          <div className="w-9 h-9 rounded-full bg-rose-50 border border-rose-100 flex items-center justify-center flex-shrink-0">
                            <FiUsers className="w-4 h-4 text-rose-500" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-thb-text-primary truncate">{dep.name}</p>
                            <p className="text-xs text-thb-text-muted capitalize">
                              {dep.relation}{dep.dateOfBirth ? ` · ${new Date(dep.dateOfBirth).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </SectionCard>
            </div>
          )}

          {/* ── Policies Tab ── */}
          {activeTab === 'Policies' && <EmployeePoliciesTab employeeId={employee.id} />}

          {/* ── Company Mapping Tab ── */}
          {activeTab === 'Company Mapping' && (
            <div className="space-y-5">
              {/* Info Banner */}
              <div className="thb-card border-l-4 border-l-emerald-500 bg-gradient-to-r from-emerald-50/60 to-teal-50/40">
                <div className="p-4 flex items-start gap-3">
                  <FiBriefcase className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-slate-900 mb-1">Company Mappings</p>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      This employee can be mapped to multiple companies with different employee IDs per company.
                      When mapped, they can switch between companies using the header dropdown.
                    </p>
                  </div>
                </div>
              </div>

              {/* Mapping Summary */}
              <div className="thb-card overflow-hidden">
                <div className="px-5 py-4 border-b border-thb-border flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-thb-text-primary flex items-center gap-2">
                      <FiBriefcase className="w-4 h-4 text-emerald-500" />
                      Company Mapping Overview
                    </h3>
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">
                        {companyMappings.filter(m => !m.isPrimary).length + 1} Total Compan{companyMappings.filter(m => !m.isPrimary).length + 1 === 1 ? 'y' : 'ies'}
                      </span>
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700">
                        {companyMappings.filter(m => !m.isPrimary).length + 1} Primary
                      </span>
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600">
                        {companyMappings.filter(m => !m.isPrimary).length} Secondary
                      </span>
                    </div>
                  </div>
                  {canManageMappings && (
                  <button
                    onClick={() => router.push('/employees/settings')}
                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-medium transition-colors"
                  >
                    <FiEdit2 className="w-3.5 h-3.5" /> Manage Mappings
                  </button>
                  )}
                </div>

                {/* All Company Mappings - including primary */}
                <div className="divide-y divide-thb-border">
                  {/* Primary Company (from Employee record) */}
                  <div className="flex items-center gap-4 px-5 py-4 bg-emerald-50/30">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
                      <FiBriefcase className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-thb-text-primary">{employee.company?.name || employee.department?.company?.name || employee.branch?.company?.name || 'Primary Company'}</p>
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">PRIMARY</span>
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-thb-text-secondary font-medium">Employee ID: <span className="text-emerald-600 font-bold">{employee.employeeId}</span></span>
                        {employee.designation && <span className="text-xs text-thb-text-muted">Designation: {employee.designation.title}</span>}
                        {employee.department && <span className="text-xs text-thb-text-muted">Dept: {employee.department.name}</span>}
                        {employee.branch && <span className="text-xs text-thb-text-muted">Branch: {employee.branch.name}</span>}
                      </div>
                    </div>
                  </div>

                  {/* Additional Company Mappings (excluding primary which is shown above) */}
                  {companyMappings.filter(m => !m.isPrimary).length === 0 ? (
                    <div className="px-5 py-6 text-center">
                      <FiGlobe className="w-6 h-6 text-thb-text-muted mx-auto mb-2" />
                      <p className="text-sm text-thb-text-muted">No additional company mappings</p>
                      {canManageMappings && (
                      <p className="text-xs text-thb-text-muted mt-1">
                        Go to <button onClick={() => router.push('/employees/settings')} className="text-green-600 hover:underline font-medium">Employee Settings &gt; Map Company</button> to add mappings
                      </p>
                      )}
                    </div>
                  ) : (
                    companyMappings.filter(m => !m.isPrimary).map(mapping => (
                      <div key={mapping.id} className={`flex items-center gap-4 px-5 py-4 ${mapping.isPrimary ? 'bg-green-50/20' : ''}`}>
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${mapping.isPrimary ? 'bg-gradient-to-br from-green-500 to-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                          <FiGlobe className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-thb-text-primary">{mapping.company?.name || 'Unknown Company'}</p>
                            {mapping.isPrimary ? (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">PRIMARY</span>
                            ) : (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">SECONDARY</span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-xs text-thb-text-secondary font-medium">Employee ID: <span className={mapping.isPrimary ? 'text-emerald-600 font-bold' : 'text-slate-700 font-bold'}>{mapping.employeeCode}</span></span>
                            {mapping.department && <span className="text-xs text-thb-text-muted">Dept: {mapping.department.name}</span>}
                            {mapping.designation && <span className="text-xs text-thb-text-muted">Role: {mapping.designation.title}</span>}
                            {mapping.branch && <span className="text-xs text-thb-text-muted">Branch: {mapping.branch.name}</span>}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Summary Bar */}
                <div className="px-5 py-3 bg-slate-50 border-t border-thb-border">
                  <div className="flex items-center gap-4 text-xs text-thb-text-muted flex-wrap">
                    <span className="font-medium">Summary:</span>
                    <span>{companyMappings.filter(m => !m.isPrimary).length + 1} compan{(companyMappings.filter(m => !m.isPrimary).length + 1) === 1 ? 'y' : 'ies'} mapped</span>
                    <span className="text-emerald-600 font-semibold">1 primary</span>
                    <span className="text-slate-500">{companyMappings.filter(m => !m.isPrimary).length} secondary</span>
                    <span className="ml-auto font-medium">Employee IDs: {[employee.employeeId, ...companyMappings.filter(m => !m.isPrimary).map(m => m.employeeCode)].join(', ')}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Task 158 — self-service section edit request modal */}
        {editSection && employee && (
          <ProfileSectionEditRequest
            section={editSection}
            employeeId={employee.id}
            employee={employee as unknown as Record<string, unknown>}
            onClose={() => setEditSection(null)}
            onSubmitted={(message) => {
              setEditSection(null);
              toast.success(message);
              queueMicrotask(() => { fetchMySectionRequests(); });
            }}
          />
        )}
      </div>

      {/* Task 162: ESS self-edit modal (own profile, non-HR roles) */}
      {showSelfEdit && employee && (
        <SelfEditProfileModal
          employee={{
            id: employee.id,
            phone: employee.phone,
            personalEmail: employee.personalEmail,
            currentAddress: employee.currentAddress,
            currentCity: employee.currentCity,
            currentState: employee.currentState,
            currentZipCode: employee.currentZipCode,
            currentCountry: employee.currentCountry,
            emergencyContactName: employee.emergencyContactName,
            emergencyContactPhone: employee.emergencyContactPhone,
            emergencyContactRelation: employee.emergencyContactRelation,
          }}
          onClose={() => setShowSelfEdit(false)}
          onSaved={() => { fetchEmployee(); }}
        />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
//  Employee Documents Tab — full document management with categories,
//  upload, request, expiry tracking, and file manager integration.
// ════════════════════════════════════════════════════════════════════

interface EmployeeDocument {
  id: string;
  name: string;
  type: string;
  category?: string;
  fileUrl?: string | null;
  status: string;
  uploadedAt?: string | null;
  expiryDate?: string | null;
  description?: string | null;
  isRequested?: boolean;
  requiredFormat?: string | null;
  maxFileSizeMb?: number | null;
}

const DOC_CATEGORIES = [
  { value: 'identification', label: 'Identification & Legal', icon: '🪪' },
  { value: 'onboarding', label: 'Onboarding & Employment', icon: '📋' },
  { value: 'qualifications', label: 'Qualifications', icon: '🎓' },
  { value: 'financial', label: 'Financial & Statutory', icon: '💰' },
  { value: 'lifecycle', label: 'Lifecycle & Performance', icon: '📈' },
  { value: 'other', label: 'Other', icon: '📎' },
];
const DOC_TYPES = ['offer_letter','id_proof','contract','certificate','policy','other','aadhaar','pan_card','bank_proof','passport','visa','education','experience','resume','medical'];

function EmployeeDocumentsTab({ employeeId, initialDocuments, viewOnly = false }: { employeeId: string; initialDocuments: EmployeeDocument[]; viewOnly?: boolean }) {
  const { user } = useAuthStore();
  const isAdmin = canEditEmployeeRecords(user?.role);
  const [documents, setDocuments] = useState<EmployeeDocument[]>(initialDocuments);
  const [showUpload, setShowUpload] = useState(false);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [showRequest, setShowRequest] = useState(false);
  const [activeCategory, setActiveCategory] = useState('all');

  const fetchDocs = async () => {
    try {
      const r = await fetch(`/api/employees/${employeeId}/documents`, { headers: getAuthHeaders() });
      const d = await r.json();
      if (r.ok) setDocuments(d.documents || []);
    } catch { /* ignore */ }
  };
  useEffect(() => { fetchDocs(); }, [employeeId]);

  const handleDelete = async (docId: string, name: string) => {
    if (!confirm(`Delete document "${name}"?`)) return;
    try {
      const r = await fetch(`/api/employees/${employeeId}/documents?docId=${docId}`, { method: 'DELETE', headers: getAuthHeaders() });
      if (r.ok) { toast.success('Document deleted'); fetchDocs(); }
      else toast.error('Failed to delete');
    } catch { toast.error('Failed'); }
  };

  const filteredDocs = activeCategory === 'all' ? documents : documents.filter(d => (d.category || 'other') === activeCategory);
  const expiringDocs = documents.filter(d => {
    if (!d.expiryDate) return false;
    const days = Math.ceil((new Date(d.expiryDate).getTime() - Date.now()) / 86400000);
    return days >= 0 && days <= 30;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-thb-text-primary">Employee Documents</h3>
          <p className="text-xs text-thb-text-muted mt-0.5">{documents.length} documents · centralized in File Manager</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && !viewOnly && (
            <button onClick={() => setShowRequest(true)} className="inline-flex items-center gap-2 px-3 py-2 border border-thb-border rounded-lg text-xs font-medium text-thb-text-secondary hover:bg-slate-50">
              <FiAlertCircle className="w-3.5 h-3.5" /> Request Document
            </button>
          )}
          {!viewOnly && (
          <button onClick={() => setShowBulkUpload(true)} className="inline-flex items-center gap-2 px-3 py-2 border border-green-600 text-green-700 rounded-lg text-xs font-medium hover:bg-green-50">
            <FiLayers className="w-3.5 h-3.5" /> Bulk Upload
          </button>
          )}
          {!viewOnly && (
          <button onClick={() => setShowUpload(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700">
            <FiUpload className="w-3.5 h-3.5" /> Upload Document
          </button>
          )}
        </div>
      </div>

      {expiringDocs.length > 0 && (
        <div className="p-3 rounded-lg border border-amber-200 bg-amber-50">
          <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
            <FiAlertCircle className="w-4 h-4" /> {expiringDocs.length} document(s) expiring within 30 days
          </p>
          <ul className="mt-1 space-y-0.5">
            {expiringDocs.map(d => <li key={d.id} className="text-xs text-amber-700">• {d.name} — expires {formatDate(d.expiryDate)}</li>)}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        <button onClick={() => setActiveCategory('all')} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${activeCategory === 'all' ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>All ({documents.length})</button>
        {DOC_CATEGORIES.map(cat => {
          const count = documents.filter(d => (d.category || 'other') === cat.value).length;
          return <button key={cat.value} onClick={() => setActiveCategory(cat.value)} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${activeCategory === cat.value ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{cat.icon} {cat.label} ({count})</button>;
        })}
      </div>

      {filteredDocs.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4"><FiFileText className="w-8 h-8 text-slate-300" /></div>
          <p className="text-sm font-medium text-thb-text-secondary mb-1">No documents in this category</p>
          <p className="text-xs text-thb-text-muted">Upload documents or request them from the employee.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDocs.map(doc => {
            const cat = DOC_CATEGORIES.find(c => c.value === (doc.category || 'other'));
            const isExpiring = doc.expiryDate && Math.ceil((new Date(doc.expiryDate).getTime() - Date.now()) / 86400000) <= 30;
            const isExpired = doc.expiryDate && new Date(doc.expiryDate) < new Date();
            return (
              <div key={doc.id} className="thb-card p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-2">
                  <span className="text-2xl">{cat?.icon || '📎'}</span>
                  <div className="flex items-center gap-1">
                    {doc.isRequested && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">Requested</span>}
                    {isExpired && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">Expired</span>}
                    {isExpiring && !isExpired && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">Expiring</span>}
                  </div>
                </div>
                <p className="text-sm font-semibold text-thb-text-primary truncate">{doc.name}</p>
                <p className="text-[10px] text-slate-400 mt-0.5 capitalize">{doc.type.replace(/_/g, ' ')}</p>
                {doc.description && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{doc.description}</p>}
                <div className="mt-2 space-y-0.5 text-[11px] text-slate-400">
                  {doc.uploadedAt && <p>Uploaded: {formatDate(doc.uploadedAt)}</p>}
                  {doc.expiryDate && <p className={isExpiring ? 'text-amber-600 font-medium' : ''}>Expires: {formatDate(doc.expiryDate)}</p>}
                  {doc.requiredFormat && <p>Required: {doc.requiredFormat.toUpperCase()}</p>}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  {doc.fileUrl && isSafeDocumentUrl(doc.fileUrl) && <button type="button" onClick={() => { const ok = openDocumentInNewTab(doc.fileUrl as string, doc.name); if (!ok) toast.error('Could not open the document'); }} className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-violet-600 hover:bg-violet-50 rounded"><FiEye className="w-3 h-3" /> View</button>}
                  {doc.fileUrl && isSafeDocumentUrl(doc.fileUrl) && <a href={doc.fileUrl} {...((doc.fileUrl || '').startsWith('data:') ? { download: doc.name } : { target: '_blank', rel: 'noopener noreferrer' })} className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-teal-600 hover:bg-teal-50 rounded"><FiDownload className="w-3 h-3" /> Download</a>}
                  {doc.fileUrl && !isSafeDocumentUrl(doc.fileUrl) && <span className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-red-500 bg-red-50 rounded" title="This link was blocked for security reasons">Blocked link</span>}
                  {isAdmin && !viewOnly && <button onClick={() => handleDelete(doc.id, doc.name)} className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-red-500 hover:bg-red-50 rounded ml-auto"><FiTrash2 className="w-3 h-3" /></button>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showUpload && <UploadDocModal employeeId={employeeId} onClose={() => setShowUpload(false)} onDone={() => { setShowUpload(false); fetchDocs(); }} />}
      {showBulkUpload && <BulkUploadModal employeeId={employeeId} onClose={() => setShowBulkUpload(false)} onDone={() => { setShowBulkUpload(false); fetchDocs(); }} />}
      {showRequest && <RequestDocModal employeeId={employeeId} onClose={() => setShowRequest(false)} onDone={() => { setShowRequest(false); fetchDocs(); }} />}
    </div>
  );
}

function UploadDocModal({ employeeId, onClose, onDone }: { employeeId: string; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(''); const [category, setCategory] = useState('identification');
  const [type, setType] = useState('id_proof'); const [fileUrl, setFileUrl] = useState('');
  const [description, setDescription] = useState(''); const [expiryDate, setExpiryDate] = useState(''); const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!name || !fileUrl) { toast.error('Name and file URL are required'); return; }
    // QA fix — Document Link Security: reject unsafe URLs before they are persisted
    if (!isSafeDocumentUrl(fileUrl)) { toast.error('Unsafe document link blocked. Use a full http(s):// URL (e.g. https://…)'); return; }
    setSaving(true);
    try {
      const r = await fetch(`/api/employees/${employeeId}/documents`, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ name, category, type, fileUrl, description, expiryDate: expiryDate || undefined }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Failed');
      toast.success('Document uploaded'); onDone();
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Failed'); } finally { setSaving(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b"><h3 className="font-semibold">Upload Document</h3><button onClick={onClose}><FiX className="w-5 h-5 text-slate-400" /></button></div>
        <div className="p-5 space-y-3">
          <div><label className="block text-xs font-medium text-slate-600 mb-1">Document Name *</label><input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Aadhaar Card" className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium text-slate-600 mb-1">Category</label><select value={category} onChange={e => setCategory(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm bg-white">{DOC_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
            <div><label className="block text-xs font-medium text-slate-600 mb-1">Type</label><select value={type} onChange={e => setType(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm bg-white">{DOC_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}</select></div>
          </div>
          <div><label className="block text-xs font-medium text-slate-600 mb-1">File URL *</label><input value={fileUrl} onChange={e => setFileUrl(e.target.value)} placeholder="https://..." className="w-full px-3 py-2 border rounded-lg text-sm" /><p className="text-[10px] text-slate-400 mt-0.5">Upload via File Manager and paste the URL here.</p></div>
          <div><label className="block text-xs font-medium text-slate-600 mb-1">Expiry Date (optional)</label><input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
          <div><label className="block text-xs font-medium text-slate-600 mb-1">Description</label><textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
        </div>
        <div className="flex justify-end gap-3 px-5 py-4 border-t"><button onClick={onClose} className="px-4 py-2 text-sm text-slate-600">Cancel</button><button onClick={submit} disabled={saving} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">{saving ? 'Uploading…' : 'Upload'}</button></div>
      </div>
    </div>
  );
}

/**
 * Bulk Upload modal — pick multiple files at once (≤3MB each); every file is
 * read to a data URL and uploaded as its own document record. Shared
 * category/type/expiry/description apply to the whole batch; each document
 * is named after its file.
 */
function BulkUploadModal({ employeeId, onClose, onDone }: { employeeId: string; onClose: () => void; onDone: () => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [category, setCategory] = useState('identification');
  const [type, setType] = useState('other');
  const [expiryDate, setExpiryDate] = useState('');
  const [description, setDescription] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, failed: 0 });

  const handlePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = '';
    const accepted: File[] = [];
    for (const f of picked) {
      if (f.size > 3 * 1024 * 1024) { toast.error(`${f.name}: exceeds 3MB — skipped`, { duration: 5000 }); continue; }
      accepted.push(f);
    }
    if (accepted.length) setFiles((prev) => [...prev, ...accepted]);
  };

  const removeFile = (idx: number) => setFiles((prev) => prev.filter((_, i) => i !== idx));

  const readFile = (file: File): Promise<string | null> => new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });

  const submit = async () => {
    if (!files.length) { toast.error('Choose at least one file'); return; }
    setUploading(true);
    setProgress({ done: 0, failed: 0 });
    let done = 0; let failed = 0;
    for (const file of files) {
      try {
        const dataUrl = await readFile(file);
        if (!dataUrl) throw new Error('read failed');
        // Name = filename without extension (readable, matches single-upload UX)
        const docName = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || file.name;
        const r = await fetch(`/api/employees/${employeeId}/documents`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            name: docName, category, type,
            fileUrl: dataUrl,
            description: description || undefined,
            expiryDate: expiryDate || undefined,
          }),
        });
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d.error || 'upload failed');
        }
        done++;
      } catch {
        failed++;
      }
      setProgress({ done, failed });
    }
    setUploading(false);
    if (failed === 0) toast.success(`${done} document${done === 1 ? '' : 's'} uploaded`);
    else toast.error(`${done} uploaded, ${failed} failed`, { duration: 5000 });
    if (done > 0) onDone(); else onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b"><h3 className="font-semibold">Bulk Upload Documents</h3><button onClick={onClose}><FiX className="w-5 h-5 text-slate-400" /></button></div>
        <div className="p-5 space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Files (select multiple) *</label>
            <label className="flex items-center justify-center gap-2 px-3 py-6 rounded-lg border border-dashed border-thb-border text-sm text-slate-500 cursor-pointer hover:bg-slate-50">
              <FiLayers className="w-5 h-5 text-green-600" />
              <span>{files.length ? `${files.length} file(s) ready` : 'Click to choose files — any type, max 3MB each'}</span>
              <input type="file" multiple className="hidden" onChange={handlePick} />
            </label>
            {files.length > 0 && (
              <ul className="mt-2 max-h-32 overflow-y-auto space-y-1">
                {files.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 text-xs text-slate-600 bg-slate-50 rounded px-2 py-1">
                    <span className="truncate">{f.name} · {(f.size / 1024).toFixed(0)} KB</span>
                    <button type="button" onClick={() => removeFile(i)} className="text-red-500 hover:text-red-700 shrink-0"><FiX className="w-3.5 h-3.5" /></button>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[10px] text-slate-400 mt-1">Each document is named after its file and uploaded with the shared category/type below.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium text-slate-600 mb-1">Category (all files)</label><select value={category} onChange={e => setCategory(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm bg-white">{DOC_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
            <div><label className="block text-xs font-medium text-slate-600 mb-1">Type (all files)</label><select value={type} onChange={e => setType(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm bg-white">{DOC_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}</select></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium text-slate-600 mb-1">Expiry Date (optional)</label><input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
            <div><label className="block text-xs font-medium text-slate-600 mb-1">Description (optional)</label><input value={description} onChange={e => setDescription(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
          </div>
          {uploading && (
            <p className="text-xs text-teal-700 bg-teal-50 rounded-lg px-3 py-2">
              Uploading… {progress.done + progress.failed}/{files.length} processed{progress.failed ? ` · ${progress.failed} failed` : ''}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-3 px-5 py-4 border-t"><button onClick={onClose} className="px-4 py-2 text-sm text-slate-600">Cancel</button><button onClick={submit} disabled={uploading || !files.length} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">{uploading ? 'Uploading…' : `Upload ${files.length || ''} Document${files.length === 1 ? '' : 's'}`}</button></div>
      </div>
    </div>
  );
}

function RequestDocModal({ employeeId, onClose, onDone }: { employeeId: string; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(''); const [category, setCategory] = useState('identification');
  const [type, setType] = useState('id_proof'); const [requiredFormat, setRequiredFormat] = useState('pdf');
  const [maxFileSizeMb, setMaxFileSizeMb] = useState(10); const [description, setDescription] = useState(''); const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!name) { toast.error('Document name is required'); return; }
    setSaving(true);
    try {
      const r = await fetch(`/api/employees/${employeeId}/documents`, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ action: 'request', name, category, type, requiredFormat, maxFileSizeMb, description }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Failed');
      toast.success('Document request sent'); onDone();
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Failed'); } finally { setSaving(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b"><h3 className="font-semibold">Request Document</h3><button onClick={onClose}><FiX className="w-5 h-5 text-slate-400" /></button></div>
        <div className="p-5 space-y-3">
          <div><label className="block text-xs font-medium text-slate-600 mb-1">Document Name *</label><input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Address Proof" className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium text-slate-600 mb-1">Category</label><select value={category} onChange={e => setCategory(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm bg-white">{DOC_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
            <div><label className="block text-xs font-medium text-slate-600 mb-1">Type</label><select value={type} onChange={e => setType(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm bg-white">{DOC_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}</select></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium text-slate-600 mb-1">Required Format</label><select value={requiredFormat} onChange={e => setRequiredFormat(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm bg-white"><option value="pdf">PDF</option><option value="jpg">JPG</option><option value="png">PNG</option><option value="doc">DOC</option></select></div>
            <div><label className="block text-xs font-medium text-slate-600 mb-1">Max Size (MB)</label><input type="number" value={maxFileSizeMb} onChange={e => setMaxFileSizeMb(Number(e.target.value))} min={1} max={50} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
          </div>
          <div><label className="block text-xs font-medium text-slate-600 mb-1">Instructions</label><textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="Instructions for the employee" className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
        </div>
        <div className="flex justify-end gap-3 px-5 py-4 border-t"><button onClick={onClose} className="px-4 py-2 text-sm text-slate-600">Cancel</button><button onClick={submit} disabled={saving} className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">{saving ? 'Sending…' : 'Send Request'}</button></div>
      </div>
    </div>
  );
}
