'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  FiUser,
  FiMail,
  FiPhone,
  FiMapPin,
  FiBriefcase,
  FiHeart,
  FiDollarSign,
  FiShield,
  FiFileText,
  FiCalendar,
  FiClock,
  FiEdit2,
  FiAlertTriangle,
  FiHome,
  FiCreditCard,
  FiBookOpen,
  FiStar,
  FiCheckCircle,
  FiInfo,
  FiActivity,
  FiHash,
  FiRefreshCw,
  FiGlobe,
  FiCheck,
  FiX,
  FiCamera,
  FiPlus,
  FiDownload,
  FiList,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { loggedInPhotoUrl, fileToProfilePhotoDataUrl, MAX_PROFILE_PHOTO_LABEL } from '@/lib/profile-photo';
import { getToken } from '@/lib/token-storage';
import { canEditEmployeeRecords } from '@/lib/roleAccess';

function getAuthHeaders() {
  const token = getToken() || (typeof window !== 'undefined' ? useAuthStore.getState().token : null);
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

/* ──────────────────────────────────────────────
   Tab definitions
   ────────────────────────────────────────────── */
type ProfileTab = 'personal' | 'address' | 'employment' | 'bank' | 'emergency' | 'health' | 'policies' | 'documents' | 'experience' | 'custom';

const profileTabs: { key: ProfileTab; label: string; icon: React.ReactNode }[] = [
  { key: 'personal', label: 'Personal', icon: <FiUser className="w-4 h-4" /> },
  { key: 'address', label: 'Address', icon: <FiMapPin className="w-4 h-4" /> },
  { key: 'employment', label: 'Employment', icon: <FiBriefcase className="w-4 h-4" /> },
  { key: 'bank', label: 'Bank & Finance', icon: <FiCreditCard className="w-4 h-4" /> },
  { key: 'emergency', label: 'Emergency', icon: <FiHeart className="w-4 h-4" /> },
  { key: 'health', label: 'Health', icon: <FiShield className="w-4 h-4" /> },
  { key: 'policies', label: 'Policies', icon: <FiFileText className="w-4 h-4" /> },
  { key: 'experience', label: 'Experience', icon: <FiStar className="w-4 h-4" /> },
  { key: 'documents', label: 'Documents', icon: <FiBookOpen className="w-4 h-4" /> },
  { key: 'custom', label: 'Custom Fields', icon: <FiList className="w-4 h-4" /> },
];

/* ──────────────────────────────────────────────
   Custom Field definitions (mirrors the schema in /employees/settings →
   Custom Fields tab). Custom fields are stored in localStorage under
   '3boxes_hrms_custom_fields'. They are surfaced here as a dedicated tab
   on the My Profile page so that fields created by HR/Tenant admins
   actually show up on the employee's profile (previously they were
   defined in Settings but never rendered anywhere on the profile).
   ────────────────────────────────────────────── */
interface CustomFieldDef {
  id: string;
  name: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select' | 'toggle' | 'textarea';
  section: 'personal' | 'employment' | 'compensation' | 'custom';
  required: boolean;
  options?: string[];
  isActive: boolean;
}

function loadCustomFieldDefs(): CustomFieldDef[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem('3boxes_hrms_custom_fields');
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CustomFieldDef[];
    return Array.isArray(parsed) ? parsed.filter(f => f && f.isActive) : [];
  } catch { return []; }
}

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const FORM_DOC_CATEGORIES = [
  { value: 'identification', label: 'Identification & Legal', icon: '🪪' },
  { value: 'onboarding', label: 'Onboarding & Employment', icon: '📋' },
  { value: 'qualifications', label: 'Qualifications', icon: '🎓' },
  { value: 'financial', label: 'Financial & Statutory', icon: '💰' },
  { value: 'lifecycle', label: 'Lifecycle & Performance', icon: '📈' },
  { value: 'other', label: 'Other', icon: '📎' },
];
const DOC_TYPES = ['offer_letter', 'id_proof', 'contract', 'certificate', 'policy', 'aadhaar', 'pan_card', 'bank_proof', 'passport', 'visa', 'education', 'experience', 'medical', 'other'];
const fieldClass = 'w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400 bg-white';
const emptyDocDraft = () => ({
  name: '',
  category: 'onboarding',
  type: 'offer_letter',
  fileUrl: '',
  fileName: '',
  expiryDate: '',
  description: '',
});
const NOMINEE_RELATIONS = [
  { value: 'spouse', label: 'Spouse' },
  { value: 'father', label: 'Father' },
  { value: 'mother', label: 'Mother' },
  { value: 'son', label: 'Son' },
  { value: 'daughter', label: 'Daughter' },
  { value: 'brother', label: 'Brother' },
  { value: 'sister', label: 'Sister' },
  { value: 'other', label: 'Other' },
];
function NomineeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className={fieldClass}>
      <option value="">Select</option>
      {NOMINEE_RELATIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function EditField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      {children}
    </div>
  );
}

/* ──────────────────────────────────────────────
   Helper components – SmartHR Enhanced
   ────────────────────────────────────────────── */

/** Accent color type for section cards */
type AccentColor = 'blue' | 'emerald' | 'violet' | 'rose' | 'amber' | 'teal' | 'slate';

const accentMap: Record<AccentColor, { strip: string; iconBg: string; iconColor: string }> = {
  blue:    { strip: 'from-green-500 to-green-400',   iconBg: 'bg-green-50',    iconColor: 'text-green-500' },
  emerald: { strip: 'from-emerald-500 to-emerald-400', iconBg: 'bg-emerald-50', iconColor: 'text-emerald-500' },
  violet:  { strip: 'from-teal-500 to-teal-400',   iconBg: 'bg-teal-50',  iconColor: 'text-teal-500' },
  rose:    { strip: 'from-rose-500 to-rose-400',       iconBg: 'bg-rose-50',    iconColor: 'text-rose-500' },
  amber:   { strip: 'from-amber-500 to-amber-400',     iconBg: 'bg-amber-50',   iconColor: 'text-amber-500' },
  teal:    { strip: 'from-teal-500 to-teal-400',       iconBg: 'bg-teal-50',    iconColor: 'text-teal-500' },
  slate:   { strip: 'from-slate-400 to-slate-300',     iconBg: 'bg-slate-50',   iconColor: 'text-slate-500' },
};

function InfoRow({ label, value, icon, onClick }: { label: string; value: string; icon?: React.ReactNode; onClick?: () => void }) {
  return (
    <div className={`group ${onClick ? 'cursor-pointer' : ''}`} onClick={onClick} role={onClick ? 'link' : undefined} tabIndex={onClick ? 0 : undefined} onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); } : undefined}>
      <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-thb-text-muted mb-1.5">
        {icon && <span className="opacity-60 group-hover:opacity-100 transition-opacity">{icon}</span>}
        {label}
      </label>
      <div className="px-3 py-2.5 text-sm text-thb-text-primary bg-gradient-to-br from-slate-50/80 to-slate-100/60 rounded-lg border border-thb-border/40 hover:border-thb-border/80 transition-colors min-h-[38px] flex items-center">
        {value || <span className="text-thb-text-muted italic">Not provided</span>}
      </div>
    </div>
  );
}

function SectionCard({ title, icon, accent = 'blue', children, rightAction }: {
  title: string; icon: React.ReactNode; accent?: AccentColor; children: React.ReactNode; rightAction?: React.ReactNode;
}) {
  const colors = accentMap[accent] || accentMap.blue;
  return (
    <div className="thb-card overflow-hidden">
      {/* Gradient accent strip */}
      <div className={`h-[3px] bg-gradient-to-r ${colors.strip}`} />
      <div className="p-5">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-thb-border/60">
          <h4 className="text-sm font-semibold text-thb-text-primary flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-lg ${colors.iconBg} flex items-center justify-center shadow-sm`}>
              <span className={colors.iconColor}>{icon}</span>
            </div>
            {title}
          </h4>
          {rightAction}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{children}</div>
      </div>
    </div>
  );
}

/** Mini stat card for the stats row */
function StatCard({ icon, label, value, subtext, colorClass }: {
  icon: React.ReactNode; label: string; value: string; subtext?: string; colorClass: string;
}) {
  return (
    <div className="thb-card thb-card-hover p-4 flex items-start gap-3.5">
      <div className={`w-10 h-10 rounded-xl ${colorClass} flex items-center justify-center shrink-0 shadow-sm`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-thb-text-muted leading-tight">{label}</p>
        <p className="text-lg font-bold text-thb-text-primary mt-0.5 leading-tight">{value}</p>
        {subtext && <p className="text-[11px] text-thb-text-muted mt-0.5">{subtext}</p>}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────
   Main Component
   ────────────────────────────────────────────── */
export default function MyProfilePage() {
  const router = useRouter();
  const { user, fetchUser } = useAuthStore();
  const [activeTab, setActiveTab] = useState<ProfileTab>('personal');
  const [profileData, setProfileData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [photoSaving, setPhotoSaving] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [docDraft, setDocDraft] = useState(emptyDocDraft());
  const [addingDoc, setAddingDoc] = useState(false);
  const [documents, setDocuments] = useState<Record<string, unknown>[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentsLoadedFor, setDocumentsLoadedFor] = useState<string | null>(null);
  const [documentsError, setDocumentsError] = useState<string | null>(null);
  // Custom field definitions — loaded from localStorage (the same key the
  // HR/Tenant admin writes to from /employees/settings → Custom Fields).
  const [customFieldDefs, setCustomFieldDefs] = useState<CustomFieldDef[]>([]);

  const fetchProfile = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/users/profile', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setProfileData(data);
        // Initialize edit form with current data
        const emp = data.employee as Record<string, unknown> | null;
        setEditForm({
          firstName: (emp?.firstName as string) || '',
          lastName: (emp?.lastName as string) || '',
          name: data.name || '',
          personalEmail: (emp?.personalEmail as string) || '',
          phone: (emp?.phone as string) || '',
          emergencyContactName: (emp?.emergencyContactName as string) || '',
          emergencyContactPhone: (emp?.emergencyContactPhone as string) || '',
          emergencyContactRelation: (emp?.emergencyContactRelation as string) || '',
          address: (emp?.address as string) || '',
          city: (emp?.city as string) || '',
          state: (emp?.state as string) || '',
          zipCode: (emp?.zipCode as string) || '',
          country: (emp?.country as string) || '',
          currentAddress: (emp?.currentAddress as string) || '',
          currentCity: (emp?.currentCity as string) || '',
          currentState: (emp?.currentState as string) || '',
          currentZipCode: (emp?.currentZipCode as string) || '',
          currentCountry: (emp?.currentCountry as string) || '',
          dateOfBirth: String(emp?.dateOfBirth || '').slice(0, 10),
          gender: (emp?.gender as string) || '',
          bloodGroup: (emp?.bloodGroup as string) || '',
          maritalStatus: (emp?.maritalStatus as string) || '',
          nationality: (emp?.nationality as string) || '',
          bankName: (emp?.bankName as string) || '',
          bankAccountNo: (emp?.bankAccountNo as string) || '',
          bankIfscCode: (emp?.bankIfscCode as string) || '',
          panNumber: (emp?.panNumber as string) || '',
          aadhaarNumber: (emp?.aadhaarNumber as string) || '',
          taxId: (emp?.taxId as string) || '',
          hasChronicIllness: (emp?.hasChronicIllness as string) || '',
          chronicIllnessDetails: (emp?.chronicIllnessDetails as string) || '',
          hasAllergies: (emp?.hasAllergies as string) || '',
          allergyDetails: (emp?.allergyDetails as string) || '',
          hasDisability: (emp?.hasDisability as string) || '',
          disabilityDetails: (emp?.disabilityDetails as string) || '',
          isOnMedication: (emp?.isOnMedication as string) || '',
          medicationDetails: (emp?.medicationDetails as string) || '',
          hasHadSurgery: (emp?.hasHadSurgery as string) || '',
          surgeryDetails: (emp?.surgeryDetails as string) || '',
          emergencyMedicalCondition: (emp?.emergencyMedicalCondition as string) || '',
          primaryPhysicianName: (emp?.primaryPhysicianName as string) || '',
          primaryPhysicianPhone: (emp?.primaryPhysicianPhone as string) || '',
          healthInsuranceProvider: (emp?.healthInsuranceProvider as string) || '',
          healthInsurancePolicyNo: (emp?.healthInsurancePolicyNo as string) || '',
          previousEmployer1: (emp?.previousEmployer1 as string) || '',
          previousDesignation1: (emp?.previousDesignation1 as string) || '',
          previousDuration1: (emp?.previousDuration1 as string) || '',
          previousReason1: (emp?.previousReason1 as string) || '',
          previousEmployer2: (emp?.previousEmployer2 as string) || '',
          previousDesignation2: (emp?.previousDesignation2 as string) || '',
          previousDuration2: (emp?.previousDuration2 as string) || '',
          previousReason2: (emp?.previousReason2 as string) || '',
          previousEmployer3: (emp?.previousEmployer3 as string) || '',
          previousDesignation3: (emp?.previousDesignation3 as string) || '',
          previousDuration3: (emp?.previousDuration3 as string) || '',
          previousReason3: (emp?.previousReason3 as string) || '',
          totalExperience: (emp?.totalExperience as string) || '',
          pfNumber: (emp?.pfNumber as string) || '',
          pfUAN: (emp?.pfUAN as string) || '',
          pfNomineeName: (emp?.pfNomineeName as string) || '',
          pfNomineeRelation: (emp?.pfNomineeRelation as string) || '',
          pfNomineePercentage: (emp?.pfNomineePercentage as string) || '',
          esiNumber: (emp?.esiNumber as string) || '',
          esiDispensary: (emp?.esiDispensary as string) || '',
          esiNomineeName: (emp?.esiNomineeName as string) || '',
          esiNomineeRelation: (emp?.esiNomineeRelation as string) || '',
          professionalTaxNumber: (emp?.professionalTaxNumber as string) || '',
          lwfNumber: (emp?.lwfNumber as string) || '',
        });
      } else {
        const errData = await res.json().catch(() => ({}));
        setError(errData.error || 'Failed to load profile');
      }
    } catch {
      setError('Network error. Please check your connection.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  // Load custom field definitions from localStorage on mount, and re-load
  // whenever the user switches to the Custom Fields tab (so newly-added
  // fields by HR show up without a hard refresh).
  useEffect(() => { setCustomFieldDefs(loadCustomFieldDefs()); }, []);
  useEffect(() => { if (activeTab === 'custom') setCustomFieldDefs(loadCustomFieldDefs()); }, [activeTab]);

  const loadDocuments = useCallback(async (employeeId: string) => {
    if (!employeeId) return;
    setDocumentsLoading(true);
    setDocumentsError(null);
    try {
      const res = await fetch(`/api/employees/${encodeURIComponent(employeeId)}/documents`, {
        headers: getAuthHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not load documents');
      setDocuments(Array.isArray(data.documents) ? data.documents : []);
      setDocumentsLoadedFor(employeeId);
    } catch (err) {
      setDocumentsError(err instanceof Error ? err.message : 'Could not load documents');
    } finally {
      setDocumentsLoading(false);
    }
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/users/profile', {
        method: 'PATCH',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...editForm,
          name: `${editForm.firstName || ''} ${editForm.lastName || ''}`.trim() || editForm.name,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update profile');
      // Task 86: employee self-edits route high-risk fields (name, DOB, bank,
      // KYC…) through the approval workflow. Surface what happened.
      const pending: string[] = Array.isArray(data.pendingFields) ? data.pendingFields : [];
      const failures: string[] = Array.isArray(data.errors) ? data.errors : [];
      failures.forEach((e: string) => toast.error(e));
      if (pending.length > 0) {
        toast.success(`Profile saved — ${pending.length} change(s) sent for approval`);
      } else {
        toast.success(data.message || 'Profile updated successfully');
      }
      setIsEditing(false);
      fetchProfile();
      fetchUser();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoSaving(true);
    try {
      const photo = await fileToProfilePhotoDataUrl(file);
      if (!photo.ok) {
        toast.error(photo.error);
        return;
      }
      const res = await fetch('/api/users/profile', {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ avatar: photo.dataUrl }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to update photo');
      toast.success('Photo updated');
      setProfileData((prev) => {
        if (!prev) return prev;
        const employee = prev.employee && typeof prev.employee === 'object'
          ? { ...(prev.employee as Record<string, unknown>), avatar: photo.dataUrl }
          : prev.employee;
        return { ...prev, avatar: photo.dataUrl, employee };
      });
      await fetchUser();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update photo');
    } finally {
      setPhotoSaving(false);
    }
  };

  const updateEditField = (field: string, value: string) => {
    setEditForm(prev => ({ ...prev, [field]: value }));
  };

  const handleAddDocument = async () => {
    const employeeRecordId = String((profileData?.employee as Record<string, unknown> | null | undefined)?.id || '');
    if (!employeeRecordId) {
      toast.error('Employee record not found');
      return;
    }
    if (!docDraft.name.trim()) {
      toast.error('Document name is required');
      return;
    }
    setAddingDoc(true);
    try {
      const res = await fetch(`/api/employees/${employeeRecordId}/documents`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name: docDraft.name.trim(),
          category: docDraft.category,
          type: docDraft.type,
          fileUrl: docDraft.fileUrl || undefined,
          description: docDraft.description || undefined,
          expiryDate: docDraft.expiryDate || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to add document');
      toast.success('Document added');
      setDocDraft(emptyDocDraft());
      await loadDocuments(employeeRecordId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add document');
    } finally {
      setAddingDoc(false);
    }
  };

  const handleDocFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      toast.error('File must be under 3MB. For larger files, paste a shareable link instead.', { duration: 6000 });
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setDocDraft((prev) => ({ ...prev, fileUrl: reader.result as string, fileName: file.name }));
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleDeleteDocument = async (docId: string) => {
    const employeeRecordId = String((profileData?.employee as Record<string, unknown> | null | undefined)?.id || '');
    if (!employeeRecordId || !docId) return;
    try {
      const res = await fetch(`/api/employees/${employeeRecordId}/documents?docId=${encodeURIComponent(docId)}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to delete document');
      }
      toast.success('Document deleted');
      await loadDocuments(employeeRecordId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete document');
    }
  };

  const emp = profileData?.employee as Record<string, unknown> | null | undefined;
  const showFields = isEditing;
  const tenant = profileData?.tenant as Record<string, unknown> | null | undefined;
  const debugInfo = profileData?._debug as Record<string, unknown> | undefined;

  const getInitials = (name: string) =>
    name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

  const formatDate = (val: unknown) => {
    if (!val || typeof val !== 'string') return '—';
    try { return new Date(val + 'T00:00:00').toLocaleDateString(); } catch { return '—'; }
  };

  const str = (val: unknown): string => (val as string) || '';

  /** Calculate days employed from joining date */
  const getDaysEmployed = () => {
    if (!emp?.dateOfJoining || typeof emp.dateOfJoining !== 'string') return '—';
    try {
      const joinDate = new Date(emp.dateOfJoining + 'T00:00:00');
      const now = new Date();
      const diffMs = now.getTime() - joinDate.getTime();
      const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      if (days < 0) return '0';
      if (days < 30) return `${days} day${days !== 1 ? 's' : ''}`;
      const months = Math.floor(days / 30);
      if (months < 12) return `${months} month${months !== 1 ? 's' : ''}`;
      const years = Math.floor(months / 12);
      const remMonths = months % 12;
      return remMonths > 0 ? `${years}y ${remMonths}m` : `${years} year${years !== 1 ? 's' : ''}`;
    } catch {
      return '—';
    }
  };

  /** Get status badge class */
  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'active': return 'thb-badge thb-badge-success';
      case 'on_leave': return 'thb-badge thb-badge-warning';
      case 'inactive': return 'thb-badge thb-badge-error';
      case 'resigned': return 'thb-badge thb-badge-error';
      case 'suspended': return 'thb-badge thb-badge-error';
      default: return 'thb-badge thb-badge-info';
    }
  };

  /* ───── Loading State ───── */
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="relative w-16 h-16 mx-auto mb-4">
            <div className="absolute inset-0 rounded-full border-4 border-slate-100" />
            <div className="absolute inset-0 rounded-full border-4 border-green-500 border-t-transparent animate-spin" />
          </div>
          <p className="text-sm font-medium text-thb-text-secondary">Loading your profile...</p>
          <p className="text-xs text-thb-text-muted mt-1">Fetching employee details</p>
        </div>
      </div>
    );
  }

  /* ───── Error State ───── */
  if (error) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="thb-card p-10 text-center max-w-md overflow-hidden">
          <div className="h-[3px] bg-gradient-to-r from-red-500 to-red-400 -mx-10 -mt-10 mb-6" />
          <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
            <FiAlertTriangle className="w-7 h-7 text-red-500" />
          </div>
          <h2 className="text-lg font-semibold text-thb-text-primary mb-2">Failed to Load Profile</h2>
          <p className="text-sm text-thb-text-secondary mb-6">{error}</p>
          <button
            onClick={() => fetchProfile()}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-green-500 text-white text-sm font-medium hover:bg-green-600 transition-colors shadow-sm"
          >
            <FiRefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  const displayName = user?.name || `${str(emp?.firstName)} ${str(emp?.lastName)}`.trim() || 'Employee';
  const displayEmail = user?.email || str(emp?.email) || '';
  const employeeId = str(emp?.employeeId);
  const status = str(emp?.status);
  const department = str(emp?.department);
  const designation = str(emp?.designation);
  const profilePhoto = loggedInPhotoUrl({
    avatar: str(profileData?.avatar) || user?.avatar || null,
    employee: { avatar: str(emp?.avatar) || user?.employee?.avatar || null },
  });

  return (
    <div className="space-y-6">
      {/* Debug banner — temporary, remove after fixing */}
      {debugInfo && !emp && (
        <div className="thb-card p-4 border-2 border-amber-300 bg-amber-50">
          <p className="text-sm font-semibold text-amber-800">Debug Info (Profile Data Issue)</p>
          <div className="mt-2 text-xs text-amber-700 space-y-1">
            <p>User found in platform DB: {String(debugInfo.foundInPlatform)}</p>
            <p>Has employee data: {String(debugInfo.hasEmployee)}</p>
            <p>Employee email: {String(debugInfo.empEmail)}</p>
            <p>User email: {str(profileData?.email)}</p>
            <p>User ID: {str(profileData?.id)}</p>
            <p>Tenant: {tenant ? str(tenant?.name) : 'null'}</p>
            <p className="mt-2 text-amber-600">If hasEmployee is false, the Employee record doesn't exist in any DB for this user. The employee list may show data because it queries by companyId, not userId.</p>
          </div>
        </div>
      )}
      {/* ═══════════════════════════════════════════
          Profile Header Card – SmartHR Style
          ═══════════════════════════════════════════ */}
      <div className="thb-card overflow-hidden">
        {/* Gradient Banner */}
        <div className="relative h-[120px] bg-gradient-to-r from-green-600 via-green-500 to-teal-400 overflow-hidden">
          {/* Decorative pattern */}
          <div className="absolute inset-0 opacity-10">
            <svg width="100%" height="100%">
              <defs>
                <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="1" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />
            </svg>
          </div>
          {/* Decorative circles */}
          <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-white/5" />
          <div className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full bg-white/5" />
          <div className="absolute top-4 right-20 w-20 h-20 rounded-full bg-white/5" />
        </div>

        {/* Profile Content – overlaps banner */}
        <div className="relative px-6 pb-6">
          {/* Avatar – overlapping the banner */}
          <div className="-mt-[60px] mb-4 flex flex-wrap items-end justify-between gap-3">
            <div className="flex items-end gap-4">
              <div className="relative shrink-0">
                {profilePhoto ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profilePhoto}
                    alt={displayName}
                    className="w-[120px] h-[120px] rounded-full object-cover shadow-xl ring-4 ring-white"
                  />
                ) : (
                  <div className="w-[120px] h-[120px] rounded-full bg-gradient-to-br from-green-500 to-teal-400 flex items-center justify-center text-white text-[40px] font-bold shadow-xl ring-4 ring-white">
                    {displayName ? getInitials(displayName) : '??'}
                  </div>
                )}
                <label
                  className={`absolute bottom-1 right-1 w-9 h-9 rounded-full bg-green-500 text-white flex items-center justify-center shadow-md ring-2 ring-white ${photoSaving ? 'opacity-60 pointer-events-none' : 'cursor-pointer hover:bg-green-600'}`}
                  title={`Change photo (max ${MAX_PROFILE_PHOTO_LABEL})`}
                >
                  <FiCamera className="w-4 h-4" />
                  <input type="file" accept="image/*" className="hidden" disabled={photoSaving} onChange={handlePhotoChange} />
                </label>
              </div>
                  <div className="pb-2">
                <h1 className="text-2xl font-bold text-thb-text-primary leading-tight">{displayName}</h1>
                <p className="text-sm text-thb-text-secondary mt-0.5 flex items-center gap-1.5">
                  <FiMail className="w-3.5 h-3.5" />
                  {displayEmail}
                </p>
                <p className="text-xs text-thb-text-muted mt-1">Change photo anytime. JPG, PNG or GIF. Max {MAX_PROFILE_PHOTO_LABEL}.</p>
              </div>
            </div>
            <div className="flex items-center gap-2 pb-2 shrink-0">
              {showFields ? (
                <>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-green-500 text-white text-sm font-medium hover:bg-green-600 transition-colors disabled:opacity-50"
                  >
                    {saving ? <FiRefreshCw className="w-4 h-4 animate-spin" /> : <FiCheck className="w-4 h-4" />}
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button
                    onClick={() => setIsEditing(false)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-100 text-slate-600 text-sm font-medium hover:bg-slate-200 transition-colors"
                  >
                    <FiX className="w-4 h-4" />
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setIsEditing(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-green-50 text-green-600 text-sm font-medium hover:bg-green-100 transition-colors border border-green-100"
                >
                  <FiEdit2 className="w-4 h-4" />
                  Edit Profile
                </button>
              )}
            </div>
          </div>

          {/* Chips Row */}
          <div className="flex flex-wrap items-center gap-2">
            {employeeId && (
              <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 font-mono font-medium border border-slate-200/80">
                <FiHash className="w-3 h-3 text-slate-400" />
                {employeeId}
              </span>
            )}
            {department && (
              <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-green-50 text-green-600 font-medium border border-green-100">
                <FiBriefcase className="w-3 h-3" />
                {department}
              </span>
            )}
            {designation && (
              <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-teal-50 text-teal-600 font-medium border border-teal-100">
                <FiStar className="w-3 h-3" />
                {designation}
              </span>
            )}
            {status && (
              <span className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium capitalize ${getStatusStyle(status)}`}>
                <FiCheckCircle className="w-3 h-3" />
                {status.replace('_', ' ')}
              </span>
            )}
            {str(emp?.dateOfJoining) && (
              <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-teal-50 text-teal-600 font-medium border border-teal-100">
                <FiCalendar className="w-3 h-3" />
                Joined on {formatDate(emp?.dateOfJoining)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════
          Quick Stats Row
          ═══════════════════════════════════════════ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<FiCalendar className="w-5 h-5 text-green-500" />}
          label="Days Employed"
          value={getDaysEmployed()}
          subtext={emp?.dateOfJoining ? `Since ${formatDate(emp.dateOfJoining).split(',')[0]}` : undefined}
          colorClass="bg-green-50"
        />
        <StatCard
          icon={<FiActivity className="w-5 h-5 text-emerald-500" />}
          label="Attendance Rate"
          value="—"
          subtext="Current month"
          colorClass="bg-emerald-50"
        />
        <StatCard
          icon={<FiHeart className="w-5 h-5 text-amber-500" />}
          label="Leave Balance"
          value="—"
          subtext="Available leaves"
          colorClass="bg-amber-50"
        />
      </div>

      {/* ═══════════════════════════════════════════
          Tab Navigation – SmartHR Style
          ═══════════════════════════════════════════ */}
      <div className="thb-card overflow-hidden">
        <div className="bg-slate-50/60 border-b border-thb-border overflow-x-auto">
          <nav className="flex min-w-max px-1">
            {profileTabs.map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => {
                    setActiveTab(tab.key);
                    const employeeRecordId = String((profileData?.employee as Record<string, unknown> | null | undefined)?.id || '');
                    if (tab.key === 'documents' && employeeRecordId && documentsLoadedFor !== employeeRecordId) {
                      void loadDocuments(employeeRecordId);
                    }
                  }}
                  className={`relative flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all whitespace-nowrap ${
                    isActive
                      ? 'text-green-600'
                      : 'text-thb-text-secondary hover:text-thb-text-primary'
                  }`}
                >
                  <span className={isActive ? 'text-green-500' : 'text-thb-text-muted'}>{tab.icon}</span>
                  {tab.label}
                  {/* Active indicator – blue bottom border */}
                  {isActive && (
                    <span className="absolute bottom-0 left-2 right-2 h-[2.5px] rounded-t-full bg-gradient-to-r from-green-500 to-teal-400" />
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* ═══════════════════════════════════════════
          Tab Content
          ═══════════════════════════════════════════ */}
      <div className="min-h-[400px]">

        {/* ─── Personal Tab ─── */}
        {activeTab === 'personal' && (
          <div className="space-y-5">
            <SectionCard title="Basic Information" icon={<FiUser className="w-4 h-4" />} accent="blue">
              {isEditing ? (
                <div className="col-span-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <EditField label="First Name">
                    <input type="text" value={editForm.firstName || ''} onChange={e => updateEditField('firstName', e.target.value)} className={fieldClass} />
                  </EditField>
                  <EditField label="Last Name">
                    <input type="text" value={editForm.lastName || ''} onChange={e => updateEditField('lastName', e.target.value)} className={fieldClass} />
                  </EditField>
                  <EditField label="Personal Email">
                    <input type="email" value={editForm.personalEmail || ''} onChange={e => updateEditField('personalEmail', e.target.value)} className={fieldClass} />
                  </EditField>
                  <EditField label="Phone">
                    <input type="tel" value={editForm.phone || ''} onChange={e => updateEditField('phone', e.target.value)} className={fieldClass} />
                  </EditField>
                  <EditField label="Gender">
                    <select value={editForm.gender || ''} onChange={e => updateEditField('gender', e.target.value)} className={fieldClass}>
                      <option value="">Select</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </EditField>
                  <EditField label="Date of Birth">
                    <input type="date" value={editForm.dateOfBirth || ''} onChange={e => updateEditField('dateOfBirth', e.target.value)} className={fieldClass} />
                  </EditField>
                  <EditField label="Marital Status">
                    <select value={editForm.maritalStatus || ''} onChange={e => updateEditField('maritalStatus', e.target.value)} className={fieldClass}>
                      <option value="">Select</option>
                      <option value="single">Single</option>
                      <option value="married">Married</option>
                      <option value="divorced">Divorced</option>
                      <option value="widowed">Widowed</option>
                    </select>
                  </EditField>
                  <EditField label="Nationality">
                    <input type="text" value={editForm.nationality || ''} onChange={e => updateEditField('nationality', e.target.value)} className={fieldClass} />
                  </EditField>
                  <EditField label="Official Email">
                    <input type="email" value={str(emp?.email)} disabled className={`${fieldClass} bg-slate-50 text-slate-500`} />
                  </EditField>
                </div>
              ) : (
                <>
                  <InfoRow label="Full Name" value={`${str(emp?.firstName)} ${str(emp?.lastName)}`} icon={<FiUser className="w-3.5 h-3.5" />} />
                  <InfoRow label="Official Email" value={str(emp?.email)} icon={<FiMail className="w-3.5 h-3.5" />} />
                  <InfoRow label="Personal Email" value={str(emp?.personalEmail)} icon={<FiMail className="w-3.5 h-3.5" />} />
                  <InfoRow label="Phone" value={str(emp?.phone)} icon={<FiPhone className="w-3.5 h-3.5" />} />
                  <InfoRow label="Gender" value={str(emp?.gender) ? String(emp?.gender).charAt(0).toUpperCase() + String(emp?.gender).slice(1) : ''} />
                  <InfoRow label="Blood Group" value={str(emp?.bloodGroup)} icon={<FiHeart className="w-3.5 h-3.5" />} />
                  <InfoRow label="Date of Birth" value={formatDate(emp?.dateOfBirth)} icon={<FiCalendar className="w-3.5 h-3.5" />} />
                  <InfoRow label="Marital Status" value={str(emp?.maritalStatus) ? String(emp?.maritalStatus).charAt(0).toUpperCase() + String(emp?.maritalStatus).slice(1) : ''} />
                  <InfoRow label="Nationality" value={str(emp?.nationality)} icon={<FiMapPin className="w-3.5 h-3.5" />} />
                </>
              )}
            </SectionCard>

            <SectionCard title="Quick Info" icon={<FiInfo className="w-4 h-4" />} accent="emerald">
              <InfoRow label="Employee ID" value={str(emp?.employeeId)} icon={<FiHash className="w-3.5 h-3.5" />} />
              <InfoRow
                label="Reporting Manager"
                value={emp?.reportingManager ? `${str((emp.reportingManager as Record<string, unknown>).firstName)} ${str((emp.reportingManager as Record<string, unknown>).lastName)}`.trim() : 'Not assigned'}
                icon={<FiUser className="w-3.5 h-3.5" />}
                // Only HR/admins can navigate to another employee's record by
                // clicking the Reporting Manager field. Regular employees
                // previously could click it, get redirected to /employees/{id},
                // and bounce back to /my-profile because they don't have
                // permission to view other employee detail pages — making it
                // look like the page was "reloading to my profile".
                // Reporting Manager is an HR-managed field; employees can
                // view it here but cannot change it (only HR can).
                onClick={
                  canEditEmployeeRecords(user?.role) && emp?.reportingManager && (emp.reportingManager as Record<string, unknown>).id
                    ? () => router.push(`/employees/${String((emp.reportingManager as Record<string, unknown>).id)}`)
                    : undefined
                }
              />
              <InfoRow label="Status" value={str(emp?.status) ? String(emp?.status).replace('_', ' ').charAt(0).toUpperCase() + String(emp?.status).replace('_', ' ').slice(1) : ''} icon={<FiCheckCircle className="w-3.5 h-3.5" />} />
              <InfoRow label="Department" value={str(emp?.department)} icon={<FiBriefcase className="w-3.5 h-3.5" />} />
              <InfoRow label="Designation" value={str(emp?.designation)} icon={<FiStar className="w-3.5 h-3.5" />} />
              <InfoRow label="Branch" value={str(emp?.branch)} icon={<FiMapPin className="w-3.5 h-3.5" />} />
              <InfoRow label="Date of Joining" value={formatDate(emp?.dateOfJoining)} icon={<FiCalendar className="w-3.5 h-3.5" />} />
              <InfoRow label="Company" value={str(tenant?.name)} icon={<FiBriefcase className="w-3.5 h-3.5" />} />
            </SectionCard>

            {/* Dependents */}
            {Array.isArray(emp?.dependents) && (emp?.dependents as unknown[]).length > 0 && (
              <SectionCard title="Dependents" icon={<FiHeart className="w-4 h-4" />} accent="rose">
                {(emp?.dependents as Record<string, unknown>[]).map((dep, idx) => (
                  <div key={idx} className="col-span-full">
                    <div className="p-4 bg-slate-50/60 rounded-xl border border-thb-border/40">
                      <p className="text-xs font-semibold text-thb-text-muted uppercase tracking-wider mb-3">Dependent {idx + 1}</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <InfoRow label="Name" value={str(dep.name)} />
                        <InfoRow label="Relationship" value={str(dep.relationship)} />
                        <InfoRow label="Date of Birth" value={formatDate(dep.dateOfBirth)} />
                        <InfoRow label="Gender" value={str(dep.gender)} />
                      </div>
                    </div>
                  </div>
                ))}
              </SectionCard>
            )}
          </div>
        )}

        {/* ─── Address Tab ─── */}
        {activeTab === 'address' && (
          <div className="space-y-5">
            <SectionCard title="Permanent Address" icon={<FiHome className="w-4 h-4" />} accent="violet">
              {showFields ? (
                <div className="col-span-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <EditField label="Street Address"><input type="text" value={editForm.address || ''} onChange={e => updateEditField('address', e.target.value)} className={fieldClass} /></EditField>
                  <EditField label="City"><input type="text" value={editForm.city || ''} onChange={e => updateEditField('city', e.target.value)} className={fieldClass} /></EditField>
                  <EditField label="State"><input type="text" value={editForm.state || ''} onChange={e => updateEditField('state', e.target.value)} className={fieldClass} /></EditField>
                  <EditField label="ZIP Code"><input type="text" value={editForm.zipCode || ''} onChange={e => updateEditField('zipCode', e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="6-digit PIN" className={fieldClass} /></EditField>
                  <EditField label="Country"><input type="text" value={editForm.country || ''} onChange={e => updateEditField('country', e.target.value)} className={fieldClass} /></EditField>
                </div>
              ) : (
                <>
                  <InfoRow label="Street Address" value={str(emp?.address)} icon={<FiMapPin className="w-3.5 h-3.5" />} />
                  <InfoRow label="City" value={str(emp?.city)} />
                  <InfoRow label="State" value={str(emp?.state)} />
                  <InfoRow label="ZIP / Postal Code" value={str(emp?.zipCode)} icon={<FiHash className="w-3.5 h-3.5" />} />
                  <InfoRow label="Country" value={str(emp?.country)} icon={<FiGlobe className="w-3.5 h-3.5" />} />
                </>
              )}
            </SectionCard>
            <SectionCard title="Current Address" icon={<FiMapPin className="w-4 h-4" />} accent="teal">
              {showFields ? (
                <div className="col-span-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <EditField label="Street Address"><input type="text" value={editForm.currentAddress || ''} onChange={e => updateEditField('currentAddress', e.target.value)} className={fieldClass} /></EditField>
                  <EditField label="City"><input type="text" value={editForm.currentCity || ''} onChange={e => updateEditField('currentCity', e.target.value)} className={fieldClass} /></EditField>
                  <EditField label="State"><input type="text" value={editForm.currentState || ''} onChange={e => updateEditField('currentState', e.target.value)} className={fieldClass} /></EditField>
                  <EditField label="ZIP Code"><input type="text" value={editForm.currentZipCode || ''} onChange={e => updateEditField('currentZipCode', e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="6-digit PIN" className={fieldClass} /></EditField>
                  <EditField label="Country"><input type="text" value={editForm.currentCountry || ''} onChange={e => updateEditField('currentCountry', e.target.value)} className={fieldClass} /></EditField>
                </div>
              ) : (
                <>
                  <InfoRow label="Street Address" value={str(emp?.currentAddress)} icon={<FiMapPin className="w-3.5 h-3.5" />} />
                  <InfoRow label="City" value={str(emp?.currentCity)} />
                  <InfoRow label="State" value={str(emp?.currentState)} />
                  <InfoRow label="ZIP / Postal Code" value={str(emp?.currentZipCode)} icon={<FiHash className="w-3.5 h-3.5" />} />
                  <InfoRow label="Country" value={str(emp?.currentCountry)} icon={<FiGlobe className="w-3.5 h-3.5" />} />
                </>
              )}
            </SectionCard>
          </div>
        )}

        {/* ─── Employment Tab ─── */}
        {activeTab === 'employment' && (
          <div className="space-y-5">
            <SectionCard title="Employment Details" icon={<FiBriefcase className="w-4 h-4" />} accent="blue">
              <InfoRow label="Employee ID" value={str(emp?.employeeId)} icon={<FiHash className="w-3.5 h-3.5" />} />
              <InfoRow label="Department" value={str(emp?.department)} icon={<FiBriefcase className="w-3.5 h-3.5" />} />
              <InfoRow label="Designation" value={str(emp?.designation)} icon={<FiStar className="w-3.5 h-3.5" />} />
              <InfoRow label="Branch" value={str(emp?.branch)} icon={<FiMapPin className="w-3.5 h-3.5" />} />
              <InfoRow label="Date of Joining" value={formatDate(emp?.dateOfJoining)} icon={<FiCalendar className="w-3.5 h-3.5" />} />
              <InfoRow label="Status" value={str(emp?.status) ? String(emp?.status).replace('_', ' ').charAt(0).toUpperCase() + String(emp?.status).replace('_', ' ').slice(1) : ''} icon={<FiCheckCircle className="w-3.5 h-3.5" />} />
            </SectionCard>

            <SectionCard title="Organization" icon={<FiInfo className="w-4 h-4" />} accent="emerald">
              <InfoRow label="Company" value={str(tenant?.name)} icon={<FiBriefcase className="w-3.5 h-3.5" />} />
              <InfoRow label="Company Plan" value={str(tenant?.plan)} icon={<FiStar className="w-3.5 h-3.5" />} />
              <InfoRow label="Currency" value={str(tenant?.currency)} icon={<FiDollarSign className="w-3.5 h-3.5" />} />
              <InfoRow label="Timezone" value={str(tenant?.timezone)} icon={<FiClock className="w-3.5 h-3.5" />} />
            </SectionCard>
          </div>
        )}

        {/* ─── Bank & Finance Tab ─── */}
        {activeTab === 'bank' && (
          <div className="space-y-5">
            <SectionCard title="Bank Account Details" icon={<FiCreditCard className="w-4 h-4" />} accent="emerald">
              {showFields ? (
                <div className="col-span-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <EditField label="Bank Name"><input type="text" value={editForm.bankName || ''} onChange={e => updateEditField('bankName', e.target.value)} className={fieldClass} /></EditField>
                  <EditField label="Bank Account No"><input type="text" value={editForm.bankAccountNo || ''} onChange={e => updateEditField('bankAccountNo', e.target.value.replace(/\D/g, '').slice(0, 18))} placeholder="9-18 digits" className={fieldClass} /></EditField>
                  <EditField label="IFSC Code"><input type="text" value={editForm.bankIfscCode || ''} onChange={e => updateEditField('bankIfscCode', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11))} placeholder="e.g., SBIN0001234" className={fieldClass} /></EditField>
                  <EditField label="PAN Number"><input type="text" value={editForm.panNumber || ''} onChange={e => updateEditField('panNumber', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))} placeholder="e.g., ABCDE1234F" className={fieldClass} /></EditField>
                  <EditField label="Aadhaar Number"><input type="text" value={editForm.aadhaarNumber || ''} onChange={e => updateEditField('aadhaarNumber', e.target.value.replace(/\D/g, '').slice(0, 12))} placeholder="12-digit UID" className={fieldClass} /></EditField>
                </div>
              ) : (
                <>
                  <InfoRow label="Bank Name" value={str(emp?.bankName)} icon={<FiCreditCard className="w-3.5 h-3.5" />} />
                  <InfoRow label="Bank Account No" value={str(emp?.bankAccountNo)} icon={<FiHash className="w-3.5 h-3.5" />} />
                  <InfoRow label="IFSC Code" value={str(emp?.bankIfscCode)} icon={<FiHash className="w-3.5 h-3.5" />} />
                  <InfoRow label="PAN Number" value={str(emp?.panNumber)} icon={<FiFileText className="w-3.5 h-3.5" />} />
                  <InfoRow label="Aadhaar Number" value={str(emp?.aadhaarNumber)} icon={<FiShield className="w-3.5 h-3.5" />} />
                </>
              )}
            </SectionCard>
            <SectionCard title="Provident Fund (PF)" icon={<FiShield className="w-4 h-4" />} accent="violet">
              {showFields ? (
                <div className="col-span-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <EditField label="PF Number"><input type="text" value={editForm.pfNumber || ''} onChange={e => updateEditField('pfNumber', e.target.value)} placeholder="e.g., PF/MH/12345/678" className={fieldClass} /></EditField>
                  <EditField label="UAN Number"><input type="text" value={editForm.pfUAN || ''} onChange={e => updateEditField('pfUAN', e.target.value.replace(/\D/g, '').slice(0, 12))} placeholder="12-digit UAN" className={fieldClass} /></EditField>
                  <EditField label="Nominee Name"><input type="text" value={editForm.pfNomineeName || ''} onChange={e => updateEditField('pfNomineeName', e.target.value)} placeholder="Full name of nominee" className={fieldClass} /></EditField>
                  <EditField label="Nominee Relationship"><NomineeSelect value={editForm.pfNomineeRelation || ''} onChange={(v) => updateEditField('pfNomineeRelation', v)} /></EditField>
                  <EditField label="Nomination Percentage"><input type="number" min="0" max="100" value={editForm.pfNomineePercentage || ''} onChange={e => updateEditField('pfNomineePercentage', e.target.value)} placeholder="e.g., 100" className={fieldClass} /></EditField>
                </div>
              ) : (
                <>
                  <InfoRow label="PF Number" value={str(emp?.pfNumber)} />
                  <InfoRow label="UAN Number" value={str(emp?.pfUAN)} />
                  <InfoRow label="Nominee Name" value={str(emp?.pfNomineeName)} />
                  <InfoRow label="Nominee Relationship" value={NOMINEE_RELATIONS.find(o => o.value === str(emp?.pfNomineeRelation))?.label || str(emp?.pfNomineeRelation)} />
                  <InfoRow label="Nomination Percentage" value={str(emp?.pfNomineePercentage)} />
                </>
              )}
            </SectionCard>
            <SectionCard title="Employee State Insurance (ESI)" icon={<FiHeart className="w-4 h-4" />} accent="rose">
              {showFields ? (
                <div className="col-span-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <EditField label="ESI Number"><input type="text" value={editForm.esiNumber || ''} onChange={e => updateEditField('esiNumber', e.target.value)} placeholder="e.g., 31-00-123456-000-0001" className={fieldClass} /></EditField>
                  <EditField label="ESI Dispensary"><input type="text" value={editForm.esiDispensary || ''} onChange={e => updateEditField('esiDispensary', e.target.value)} placeholder="Assigned dispensary name" className={fieldClass} /></EditField>
                  <EditField label="Nominee Name"><input type="text" value={editForm.esiNomineeName || ''} onChange={e => updateEditField('esiNomineeName', e.target.value)} placeholder="Full name of nominee" className={fieldClass} /></EditField>
                  <EditField label="Nominee Relationship"><NomineeSelect value={editForm.esiNomineeRelation || ''} onChange={(v) => updateEditField('esiNomineeRelation', v)} /></EditField>
                </div>
              ) : (
                <>
                  <InfoRow label="ESI Number" value={str(emp?.esiNumber)} />
                  <InfoRow label="ESI Dispensary" value={str(emp?.esiDispensary)} />
                  <InfoRow label="Nominee Name" value={str(emp?.esiNomineeName)} />
                  <InfoRow label="Nominee Relationship" value={NOMINEE_RELATIONS.find(o => o.value === str(emp?.esiNomineeRelation))?.label || str(emp?.esiNomineeRelation)} />
                </>
              )}
            </SectionCard>
            <SectionCard title="Other Statutory" icon={<FiFileText className="w-4 h-4" />} accent="amber">
              {showFields ? (
                <div className="col-span-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <EditField label="Professional Tax Number"><input type="text" value={editForm.professionalTaxNumber || ''} onChange={e => updateEditField('professionalTaxNumber', e.target.value)} placeholder="PT registration number" className={fieldClass} /></EditField>
                  <EditField label="LWF Number"><input type="text" value={editForm.lwfNumber || ''} onChange={e => updateEditField('lwfNumber', e.target.value)} placeholder="Labour Welfare Fund number" className={fieldClass} /></EditField>
                </div>
              ) : (
                <>
                  <InfoRow label="Professional Tax Number" value={str(emp?.professionalTaxNumber)} />
                  <InfoRow label="LWF Number" value={str(emp?.lwfNumber)} />
                </>
              )}
            </SectionCard>
          </div>
        )}

        {activeTab === 'emergency' && (
          <div className="space-y-5">
            <SectionCard title="Emergency Contact" icon={<FiHeart className="w-4 h-4" />} accent="rose">
              {showFields ? (
                <div className="col-span-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <EditField label="Emergency Contact Name"><input type="text" value={editForm.emergencyContactName || ''} onChange={e => updateEditField('emergencyContactName', e.target.value)} className={fieldClass} /></EditField>
                  <EditField label="Emergency Contact Phone"><input type="tel" value={editForm.emergencyContactPhone || ''} onChange={e => updateEditField('emergencyContactPhone', e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="10-digit mobile" className={fieldClass} /></EditField>
                  <EditField label="Relationship"><NomineeSelect value={editForm.emergencyContactRelation || ''} onChange={(v) => updateEditField('emergencyContactRelation', v)} /></EditField>
                </div>
              ) : (
                <>
                  <InfoRow label="Contact Name" value={str(emp?.emergencyContactName)} icon={<FiUser className="w-3.5 h-3.5" />} />
                  <InfoRow label="Relationship" value={NOMINEE_RELATIONS.find(o => o.value === str(emp?.emergencyContactRelation))?.label || str(emp?.emergencyContactRelation)} />
                  <InfoRow label="Contact Phone" value={str(emp?.emergencyContactPhone)} icon={<FiPhone className="w-3.5 h-3.5" />} />
                </>
              )}
            </SectionCard>
          </div>
        )}

        {/* ─── Health Tab ─── */}
        {activeTab === 'health' && (
          <div className="space-y-5">
            <SectionCard title="Health History" icon={<FiShield className="w-4 h-4" />} accent="rose">
              {showFields ? (
                <div className="col-span-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <EditField label="Blood Group">
                    <select value={editForm.bloodGroup || ''} onChange={e => updateEditField('bloodGroup', e.target.value)} className={fieldClass}>
                      <option value="">Select</option>
                      {BLOOD_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </EditField>
                  {([
                    ['hasChronicIllness', 'Has Chronic Illness?', 'chronicIllnessDetails', 'Chronic Illness Details'],
                    ['hasAllergies', 'Has Allergies?', 'allergyDetails', 'Allergy Details'],
                    ['hasDisability', 'Has Disability?', 'disabilityDetails', 'Disability Details'],
                    ['isOnMedication', 'On Medication?', 'medicationDetails', 'Medication Details'],
                    ['hasHadSurgery', 'Has Had Surgery?', 'surgeryDetails', 'Surgery Details'],
                  ] as const).map(([flag, flagLabel, details, detailsLabel]) => (
                    <div key={flag} className="contents">
                      <EditField label={flagLabel}>
                        <select value={editForm[flag] || ''} onChange={e => updateEditField(flag, e.target.value)} className={fieldClass}>
                          <option value="">Select</option>
                          <option value="no">No</option>
                          <option value="yes">Yes</option>
                        </select>
                      </EditField>
                      {editForm[flag] === 'yes' && (
                        <EditField label={detailsLabel}>
                          <input type="text" value={editForm[details] || ''} onChange={e => updateEditField(details, e.target.value)} className={fieldClass} />
                        </EditField>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <InfoRow label="Blood Group" value={str(emp?.bloodGroup)} icon={<FiHeart className="w-3.5 h-3.5" />} />
                  <InfoRow label="Chronic Illness" value={str(emp?.hasChronicIllness) === 'yes' ? `Yes — ${str(emp?.chronicIllnessDetails) || 'No details'}` : str(emp?.hasChronicIllness) === 'no' ? 'No' : ''} />
                  <InfoRow label="Allergies" value={str(emp?.hasAllergies) === 'yes' ? `Yes — ${str(emp?.allergyDetails) || 'No details'}` : str(emp?.hasAllergies) === 'no' ? 'No' : ''} />
                  <InfoRow label="Disability" value={str(emp?.hasDisability) === 'yes' ? `Yes — ${str(emp?.disabilityDetails) || 'No details'}` : str(emp?.hasDisability) === 'no' ? 'No' : ''} />
                  <InfoRow label="On Medication" value={str(emp?.isOnMedication) === 'yes' ? `Yes — ${str(emp?.medicationDetails) || 'No details'}` : str(emp?.isOnMedication) === 'no' ? 'No' : ''} />
                  <InfoRow label="Previous Surgery" value={str(emp?.hasHadSurgery) === 'yes' ? `Yes — ${str(emp?.surgeryDetails) || 'No details'}` : str(emp?.hasHadSurgery) === 'no' ? 'No' : ''} />
                </>
              )}
            </SectionCard>
            <SectionCard title="Emergency Medical & Insurance" icon={<FiActivity className="w-4 h-4" />} accent="amber">
              {showFields ? (
                <div className="col-span-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <EditField label="Emergency Medical Condition"><input type="text" value={editForm.emergencyMedicalCondition || ''} onChange={e => updateEditField('emergencyMedicalCondition', e.target.value)} className={fieldClass} /></EditField>
                  <EditField label="Primary Physician Name"><input type="text" value={editForm.primaryPhysicianName || ''} onChange={e => updateEditField('primaryPhysicianName', e.target.value)} className={fieldClass} /></EditField>
                  <EditField label="Primary Physician Phone"><input type="tel" value={editForm.primaryPhysicianPhone || ''} onChange={e => updateEditField('primaryPhysicianPhone', e.target.value)} className={fieldClass} /></EditField>
                  <EditField label="Health Insurance Provider"><input type="text" value={editForm.healthInsuranceProvider || ''} onChange={e => updateEditField('healthInsuranceProvider', e.target.value)} className={fieldClass} /></EditField>
                  <EditField label="Health Insurance Policy No"><input type="text" value={editForm.healthInsurancePolicyNo || ''} onChange={e => updateEditField('healthInsurancePolicyNo', e.target.value)} className={fieldClass} /></EditField>
                </div>
              ) : (
                <>
                  <InfoRow label="Emergency Medical Condition" value={str(emp?.emergencyMedicalCondition)} />
                  <InfoRow label="Primary Physician" value={str(emp?.primaryPhysicianName)} icon={<FiUser className="w-3.5 h-3.5" />} />
                  <InfoRow label="Physician Phone" value={str(emp?.primaryPhysicianPhone)} icon={<FiPhone className="w-3.5 h-3.5" />} />
                  <InfoRow label="Insurance Provider" value={str(emp?.healthInsuranceProvider)} />
                  <InfoRow label="Policy Number" value={str(emp?.healthInsurancePolicyNo)} />
                </>
              )}
            </SectionCard>
          </div>
        )}

        {/* ─── Policies Tab ─── */}
        {activeTab === 'policies' && (
          <div className="space-y-5">
            <SectionCard title="Assigned Policies" icon={<FiFileText className="w-4 h-4" />} accent="amber">
              <InfoRow label="Leave Policy" value={str(emp?.leavePolicyId) ? 'Assigned' : 'Not Assigned'} icon={<FiCalendar className="w-3.5 h-3.5" />} />
              <InfoRow label="Attendance Policy" value={str(emp?.attendancePolicyId) ? 'Assigned' : 'Not Assigned'} icon={<FiClock className="w-3.5 h-3.5" />} />
              <InfoRow label="Travel Policy" value={str(emp?.travelPolicyId) ? 'Assigned' : 'Not Assigned'} icon={<FiMapPin className="w-3.5 h-3.5" />} />
              <InfoRow label="Salary Structure" value={str(emp?.salaryStructureId) ? 'Assigned' : 'Not Assigned'} icon={<FiDollarSign className="w-3.5 h-3.5" />} />
            </SectionCard>
          </div>
        )}

        {/* ─── Experience Tab ─── */}
        {activeTab === 'experience' && (
          <div className="space-y-5">
            {([1, 2, 3] as const).map((n) => (
              <SectionCard key={n} title={`Experience ${n}`} icon={<FiBriefcase className="w-4 h-4" />} accent="blue">
                {showFields ? (
                  <div className="col-span-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <EditField label="Previous Employer"><input type="text" value={editForm[`previousEmployer${n}`] || ''} onChange={e => updateEditField(`previousEmployer${n}`, e.target.value)} className={fieldClass} /></EditField>
                    <EditField label="Designation"><input type="text" value={editForm[`previousDesignation${n}`] || ''} onChange={e => updateEditField(`previousDesignation${n}`, e.target.value)} className={fieldClass} /></EditField>
                    <EditField label="Duration"><input type="text" value={editForm[`previousDuration${n}`] || ''} onChange={e => updateEditField(`previousDuration${n}`, e.target.value)} placeholder="e.g., 2 years" className={fieldClass} /></EditField>
                    <div className="md:col-span-2 lg:col-span-3">
                      <EditField label="Reason for Leaving"><input type="text" value={editForm[`previousReason${n}`] || ''} onChange={e => updateEditField(`previousReason${n}`, e.target.value)} className={fieldClass} /></EditField>
                    </div>
                  </div>
                ) : (
                  <>
                    <InfoRow label="Previous Employer" value={str(emp?.[`previousEmployer${n}`])} icon={<FiBriefcase className="w-3.5 h-3.5" />} />
                    <InfoRow label="Designation" value={str(emp?.[`previousDesignation${n}`])} icon={<FiStar className="w-3.5 h-3.5" />} />
                    <InfoRow label="Duration" value={str(emp?.[`previousDuration${n}`])} icon={<FiClock className="w-3.5 h-3.5" />} />
                    <InfoRow label="Reason for Leaving" value={str(emp?.[`previousReason${n}`])} />
                  </>
                )}
              </SectionCard>
            ))}
            <SectionCard title="Total Experience" icon={<FiStar className="w-4 h-4" />} accent="teal">
              {showFields ? (
                <EditField label="Total Experience">
                  <input type="text" value={editForm.totalExperience || ''} onChange={e => updateEditField('totalExperience', e.target.value)} placeholder="e.g., 5 years" className={fieldClass} />
                </EditField>
              ) : (
                <InfoRow label="Total Experience" value={str(emp?.totalExperience)} />
              )}
            </SectionCard>
          </div>
        )}

        {/* ─── Documents Tab ─── */}
        {activeTab === 'documents' && (
          <div className="space-y-5">
            {showFields && (
              <SectionCard title="Add Document" icon={<FiPlus className="w-4 h-4" />} accent="emerald">
                <div className="col-span-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <EditField label="Document Name">
                    <input type="text" value={docDraft.name} onChange={e => setDocDraft(prev => ({ ...prev, name: e.target.value }))} placeholder="e.g., Offer Letter — Signed" className={fieldClass} />
                  </EditField>
                  <EditField label="Category">
                    <select value={docDraft.category} onChange={e => setDocDraft(prev => ({ ...prev, category: e.target.value }))} className={fieldClass}>
                      {FORM_DOC_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.icon} {c.label}</option>)}
                    </select>
                  </EditField>
                  <EditField label="Document Type">
                    <select value={docDraft.type} onChange={e => setDocDraft(prev => ({ ...prev, type: e.target.value }))} className={fieldClass}>
                      {DOC_TYPES.map((t) => (
                        <option key={t} value={t}>{t.replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase())}</option>
                      ))}
                    </select>
                  </EditField>
                  <EditField label="Upload File">
                    <label className="flex-1 px-3 py-2 rounded-lg border border-dashed border-slate-200 text-sm text-slate-500 cursor-pointer hover:bg-slate-50 truncate block">
                      {docDraft.fileName || 'Choose file (PDF, JPG, PNG — max 3MB)'}
                      <input type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" className="hidden" onChange={handleDocFilePick} />
                    </label>
                    {docDraft.fileName && (
                      <button type="button" onClick={() => setDocDraft(prev => ({ ...prev, fileUrl: '', fileName: '' }))} className="mt-1 text-xs text-red-500">Remove file</button>
                    )}
                  </EditField>
                  <EditField label="or File Link">
                    <input type="text" value={docDraft.fileName ? '' : docDraft.fileUrl} onChange={e => setDocDraft(prev => ({ ...prev, fileUrl: e.target.value, fileName: '' }))} placeholder="https://drive.google.com/..." className={fieldClass} />
                  </EditField>
                  <EditField label="Expiry Date">
                    <input type="date" value={docDraft.expiryDate} onChange={e => setDocDraft(prev => ({ ...prev, expiryDate: e.target.value }))} className={fieldClass} />
                  </EditField>
                  <div className="md:col-span-2 lg:col-span-3">
                    <EditField label="Description">
                      <input type="text" value={docDraft.description} onChange={e => setDocDraft(prev => ({ ...prev, description: e.target.value }))} placeholder="Optional notes about this document" className={fieldClass} />
                    </EditField>
                  </div>
                </div>
                <div className="col-span-full">
                  <button
                    type="button"
                    onClick={handleAddDocument}
                    disabled={addingDoc}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-green-500 text-white text-sm font-medium hover:bg-green-600 disabled:opacity-50"
                  >
                    {addingDoc ? <FiRefreshCw className="w-4 h-4 animate-spin" /> : <FiPlus className="w-4 h-4" />}
                    {addingDoc ? 'Adding...' : 'Add document'}
                  </button>
                </div>
              </SectionCard>
            )}
            {documentsLoading ? (
              <div className="thb-card p-8 text-center text-sm text-thb-text-muted">Loading documents…</div>
            ) : documentsError ? (
              <div className="thb-card p-8 text-center">
                <p className="text-sm text-red-600">{documentsError}</p>
                <button
                  type="button"
                  onClick={() => {
                    const employeeRecordId = String(emp?.id || '');
                    if (employeeRecordId) void loadDocuments(employeeRecordId);
                  }}
                  className="mt-3 text-sm font-medium text-teal-600 hover:text-teal-700"
                >Retry</button>
              </div>
            ) : documents.length > 0 ? (
              <SectionCard title="Uploaded Documents" icon={<FiBookOpen className="w-4 h-4" />} accent="blue">
                <div className="col-span-full space-y-2">
                  {documents.map((doc, idx) => {
                    const fileUrl = str(doc.fileUrl);
                    const isData = fileUrl.startsWith('data:');
                    const cat = FORM_DOC_CATEGORIES.find((c) => c.value === str(doc.category));
                    return (
                    <div key={str(doc.id) || idx} className="flex items-center justify-between gap-3 p-3.5 bg-slate-50/60 rounded-xl border border-thb-border/40 hover:border-thb-border/80 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center shrink-0">
                          <FiFileText className="w-4.5 h-4.5 text-green-500" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-thb-text-primary truncate">{str(doc.name)}</p>
                          <p className="text-xs text-thb-text-muted">
                            {cat?.label || 'Other'} · {str(doc.type).replace(/_/g, ' ')}
                            {str(doc.expiryDate) ? ` · Expires ${formatDate(doc.expiryDate)}` : ''}
                          </p>
                          {str(doc.description) && <p className="text-xs text-thb-text-muted mt-0.5 line-clamp-2">{str(doc.description)}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {fileUrl && (
                          <a href={fileUrl} {...(isData ? { download: str(doc.name) } : { target: '_blank', rel: 'noopener noreferrer' })} className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-teal-600 hover:bg-teal-50 rounded">
                            <FiDownload className="w-3 h-3" /> Download
                          </a>
                        )}
                        {showFields && str(doc.id) && (
                          <button type="button" onClick={() => handleDeleteDocument(str(doc.id))} className="p-1.5 text-red-500 hover:bg-red-50 rounded" title="Delete document">
                            <FiX className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <span className={`text-[10px] px-2.5 py-1 rounded-md font-semibold uppercase tracking-wider ${
                          str(doc.status) === 'verified' ? 'bg-emerald-50 text-emerald-600' :
                          str(doc.status) === 'pending' || str(doc.status) === 'requested' ? 'bg-amber-50 text-amber-600' :
                          'bg-slate-50 text-slate-500'
                        }`}>{str(doc.status) || 'Uploaded'}</span>
                      </div>
                    </div>
                    );
                  })}
                </div>
              </SectionCard>
            ) : (
              <div className="thb-card overflow-hidden">
                <div className="h-[3px] bg-gradient-to-r from-slate-400 to-slate-300" />
                <div className="p-12 text-center">
                  <div className="w-14 h-14 rounded-full bg-slate-50 flex items-center justify-center mx-auto mb-4">
                    <FiFileText className="w-7 h-7 text-thb-text-muted" />
                  </div>
                  <h3 className="text-sm font-semibold text-thb-text-primary mb-1">No Documents</h3>
                  <p className="text-xs text-thb-text-muted">{showFields ? 'Use the form above to add a document with type.' : 'Click Edit Profile to add documents.'}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── Custom Fields Tab ───
            Renders custom fields defined by HR/Tenant admins from
            /employees/settings → Custom Fields. Values are read from the
            employee record by `field.name` key. If a field has no value
            yet, it shows an empty placeholder until the employee or admin
            fills it in. */}
        {activeTab === 'custom' && (
          <div className="space-y-5">
            {customFieldDefs.length === 0 ? (
              <div className="thb-card overflow-hidden">
                <div className="h-[3px] bg-gradient-to-r from-slate-400 to-slate-300" />
                <div className="p-12 text-center">
                  <div className="w-14 h-14 rounded-full bg-slate-50 flex items-center justify-center mx-auto mb-4">
                    <FiList className="w-7 h-7 text-thb-text-muted" />
                  </div>
                  <h3 className="text-sm font-semibold text-thb-text-primary mb-1">No Custom Fields Configured</h3>
                  <p className="text-xs text-thb-text-muted">
                    Your HR admin has not added any custom fields yet. Fields created in
                    {' '}
                    <a href="/employees/settings" className="text-teal-600 hover:underline">Employee Settings → Custom Fields</a>
                    {' '}will appear here.
                  </p>
                </div>
              </div>
            ) : (
              <>
                {/* Group fields by section so they render in the same
                    grouping the HR admin sees on the settings page. */}
                {(['personal', 'employment', 'compensation', 'custom'] as const).map(section => {
                  const sectionFields = customFieldDefs.filter(f => f.section === section);
                  if (sectionFields.length === 0) return null;
                  const sectionLabel = { personal: 'Personal Information', employment: 'Employment Details', compensation: 'Compensation & Statutory', custom: 'Custom Fields' }[section];
                  const sectionIcon = { personal: <FiUser className="w-4 h-4" />, employment: <FiBriefcase className="w-4 h-4" />, compensation: <FiDollarSign className="w-4 h-4" />, custom: <FiList className="w-4 h-4" /> }[section];
                  return (
                    <SectionCard key={section} title={sectionLabel} icon={sectionIcon} accent="blue">
                      <div className="col-span-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {sectionFields.map(field => {
                          // Pull the value from the employee record by field.name.
                          // Falls back to whatever the user has typed in edit mode
                          // (editForm[field.name]) so unsaved edits render correctly.
                          const rawValue = isEditing
                            ? (editForm[field.name] ?? (emp?.[field.name] != null ? String(emp[field.name]) : ''))
                            : (emp?.[field.name] != null ? String(emp[field.name]) : '');
                          const updateValue = (v: string) => setEditForm(prev => ({ ...prev, [field.name]: v }));
                          return (
                            <EditField key={field.id} label={`${field.label}${field.required ? ' *' : ''}`}>
                              {field.type === 'textarea' ? (
                                <textarea
                                  value={rawValue}
                                  onChange={e => updateValue(e.target.value)}
                                  disabled={!isEditing}
                                  rows={3}
                                  className={fieldClass}
                                  placeholder={isEditing ? `Enter ${field.label}` : '—'}
                                />
                              ) : field.type === 'select' ? (
                                <select
                                  value={rawValue}
                                  onChange={e => updateValue(e.target.value)}
                                  disabled={!isEditing}
                                  className={fieldClass}
                                >
                                  <option value="">{isEditing ? 'Select…' : '—'}</option>
                                  {(field.options || []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                </select>
                              ) : field.type === 'toggle' ? (
                                <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-sm cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={rawValue === 'true' || rawValue === '1' || rawValue.toLowerCase() === 'yes'}
                                    onChange={e => updateValue(e.target.checked ? 'true' : 'false')}
                                    disabled={!isEditing}
                                    className="rounded border-slate-300 text-green-500 focus:ring-green-500"
                                  />
                                  <span className="text-slate-700">{rawValue === 'true' || rawValue === '1' ? 'Yes' : 'No'}</span>
                                </label>
                              ) : (
                                <input
                                  type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                                  value={rawValue}
                                  onChange={e => updateValue(e.target.value)}
                                  disabled={!isEditing}
                                  className={fieldClass}
                                  placeholder={isEditing ? `Enter ${field.label}` : '—'}
                                />
                              )}
                            </EditField>
                          );
                        })}
                      </div>
                    </SectionCard>
                  );
                })}
                {!isEditing && (
                  <p className="text-xs text-thb-text-muted text-center">
                    Click <span className="font-medium text-thb-text-primary">Edit Profile</span> at the top of the page to update these fields.
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


