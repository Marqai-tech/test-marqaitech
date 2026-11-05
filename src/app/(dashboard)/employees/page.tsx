'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { openDocumentInNewTab } from '@/lib/document-viewer';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  FiUsers,
  FiPlus,
  FiPaperclip,
  FiSearch,
  FiEdit2,
  FiTrash2,
  FiEye,
  FiX,
  FiChevronLeft,
  FiChevronRight,

  FiShield,
  FiActivity,
  FiGrid,
  FiList,
  FiMail,
  FiPhone,
  FiCalendar,
  FiUserCheck,
  FiUserX,
  FiUserPlus,
  FiDownload,
  FiSettings,
  FiClock,
  FiFileText,
  FiBriefcase,
  FiRefreshCw,
  FiAward,
  FiHeart,
  FiExternalLink,
  FiHome,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { useCompanyContextStore, useCompanyContextPersistHydrated } from '@/store/companyContextStore';
import { canAccessEmployeeSettings, canEditEmployeeRecords } from '@/lib/roleAccess';
import { fileToProfilePhotoDataUrl, MAX_PROFILE_PHOTO_LABEL } from '@/lib/profile-photo';
import { isSafeDocumentUrl } from '@/lib/sanitize';
import { getToken } from '@/lib/token-storage';
import {
  validateEmail as validateEmailFormat,
  validatePhone,
  validateAadhaar,
  validatePAN,
  validateIFSC,
  validateBankAccount,
  validateUAN,
  validateName,
  validateZipCode,
  validateNationality,
  validatePFNumber,
  validateNomineeName,
  validateLWFNumber,
  validateESINumber,
  onlyDigits,
  onlyLetters,
  phoneInputFilter,
  limitLength,
} from '@/lib/validators';
import ModuleTips from '@/components/ModuleTips';
import ModuleWorkflow from '@/components/ModuleWorkflow';
import BulkImportTab from '@/components/BulkImportTab';
import CompanyNameAutocomplete from '@/components/CompanyNameAutocomplete';
// Note: CompanyLogo + useDebouncedValue were used by PreviousEmployerInput,
// which was removed when origin's Task-137 dynamic-experiences UI (which has
// its own autoFetchExperienceLogo) was merged. The /api/company-logo proxy
// is still used by fetchCompanyLogoFromWeb above as the primary logo source.


/* ── Employee Tips ── */
const employeeTips = [
  {
    title: 'Auto-Generated Employee Codes',
    description: 'Employee codes are auto-generated based on the prefix and sequence in Settings',
  },
  {
    title: 'Complete Onboarding Tasks',
    description: 'Complete all onboarding tasks before marking new hires as Active',
  },
  {
    title: 'Bulk Import from CSV',
    description: 'Use the bulk import feature to add multiple employees at once from a CSV file',
  },
  {
    title: 'Document Expiry Reminders',
    description: 'Configure document expiry reminders to stay compliant with visa and license renewals',
  },
  {
    title: 'Set Up Reporting Managers',
    description: 'Set up reporting manager relationships to enable approval workflows',
  },
];

/* ── Employee Workflow Steps ── */
const employeeWorkflowSteps = [
  { step: 1, title: 'Add Employee', description: 'Create a new employee record with basic details' },
  { step: 2, title: 'Complete Profile Details', description: 'Fill in personal information and contact details' },
  { step: 3, title: 'Assign Department & Designation', description: 'Set the employee\'s department and job title' },
  { step: 4, title: 'Set Bank Details', description: 'Configure bank account and financial information' },
  { step: 5, title: 'Configure Reporting Manager', description: 'Assign the employee\'s reporting manager for approvals' },
  { step: 6, title: 'Mark Active', description: 'Activate the employee after onboarding is complete' },
  { step: 7, title: 'Review Employee Directory', description: 'Verify all employee details in the directory' },
];

/* ── Task 137 — Experience section constants + helpers ── */
export const COMPANY_CATEGORIES = [
  { value: '', label: 'Select Category' },
  { value: 'listed', label: 'Listed' },
  { value: 'non_listed', label: 'Non-Listed' },
  { value: 'government', label: 'Government' },
  { value: 'psu', label: 'PSU' },
  { value: 'startup', label: 'Startup' },
  { value: 'other', label: 'Other' },
] as const;

export const COMPANY_LEVELS = [
  { value: '', label: 'Select Level' },
  { value: 'mnc', label: 'MNC' },
  { value: 'tier_1', label: 'Tier-1' },
  { value: 'tier_2', label: 'Tier-2' },
  { value: 'tier_3', label: 'Tier-3' },
  { value: 'large', label: 'Large Enterprise' },
  { value: 'mid', label: 'Mid-Size' },
  { value: 'startup', label: 'Startup' },
  { value: 'small', label: 'Small Company' },
] as const;

export const COMPANY_CATEGORY_LABELS: Record<string, string> = {
  listed: 'Listed', non_listed: 'Non-Listed', government: 'Government',
  psu: 'PSU', startup: 'Startup', other: 'Other',
};
export const COMPANY_LEVEL_LABELS: Record<string, string> = {
  mnc: 'MNC', tier_1: 'Tier-1', tier_2: 'Tier-2', tier_3: 'Tier-3',
  large: 'Large Enterprise', mid: 'Mid-Size', startup: 'Startup', small: 'Small Company',
};

// Task 138 — domains an employee worked in at a company (multi-select).
export const EXPERIENCE_DOMAINS = [
  'Development', 'Testing / QA', 'DevOps / Infra', 'Support', 'Implementation',
  'Sales', 'Marketing', 'Operations', 'Finance & Accounts', 'Human Resources',
  'Design', 'Data & Analytics', 'Project Management', 'Consulting', 'Research',
  'Manufacturing', 'Quality', 'Procurement', 'Legal & Compliance', 'Training',
] as const;

// Task 138 — proof letters attached to a previous employer.
export const EXPERIENCE_LETTER_TYPES = [
  { value: 'offer_letter', label: 'Offer Letter' },
  { value: 'relieving_letter', label: 'Relieving Letter' },
  { value: 'experience_letter', label: 'Experience Letter' },
  { value: 'appraisal_letter', label: 'Appraisal / Increment Letter' },
  { value: 'payslip', label: 'Payslip' },
  { value: 'other', label: 'Other Letter' },
] as const;
export const EXPERIENCE_LETTER_LABELS: Record<string, string> = Object.fromEntries(
  EXPERIENCE_LETTER_TYPES.map((t) => [t.value, t.label]),
);

// Task 138 — achievements (previous company experience or any other source).
export const ACHIEVEMENT_CATEGORY_OPTIONS = [
  { value: 'previous_company', label: 'Previous Company' },
  { value: 'certification', label: 'Certification' },
  { value: 'award', label: 'Award / Recognition' },
  { value: 'academic', label: 'Academic' },
  { value: 'community', label: 'Community / Social' },
  { value: 'other', label: 'Other' },
] as const;
export const ACHIEVEMENT_CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  ACHIEVEMENT_CATEGORY_OPTIONS.map((c) => [c.value, c.label]),
);

export interface FormExperienceLetter {
  name: string;
  type: string;
  fileUrl: string;
}

export interface FormExperience {
  id?: string;
  company: string;
  designation: string;
  fromDate: string;
  toDate: string;
  isCurrent: boolean;
  description: string;
  companyLogo: string;
  companyCategory: string;
  companyLevel: string;
  // Task 138 — domains worked (multi-select) + proof letters from this company.
  domains?: string[];
  letters?: FormExperienceLetter[];
  letterType?: string; // transient pick for the next attach (not persisted as-is)
}

export interface FormAchievement {
  id?: string;
  title: string;
  category: string;
  issuer: string;
  achievedOn: string;
  description: string;
}

export interface FormSkill {
  id?: string;
  skill: string;
  level: string;
  yearsOfExp: string;
}

export interface FormDependent {
  id?: string;
  name: string;
  relation: string;
  dateOfBirth: string;
  gender?: string;
}

export const emptyExperience = (): FormExperience => ({
  company: '', designation: '', fromDate: '', toDate: '', isCurrent: false,
  description: '', companyLogo: '', companyCategory: '', companyLevel: '',
  domains: [], letters: [], letterType: 'offer_letter',
});
export const emptyAchievement = (): FormAchievement => ({
  title: '', category: 'previous_company', issuer: '', achievedOn: '', description: '',
});
export const emptySkill = (): FormSkill => ({ skill: '', level: 'intermediate', yearsOfExp: '' });
export const emptyDependent = (): FormDependent => ({ name: '', relation: '', dateOfBirth: '', gender: '' });

/** Best-effort domain guess from a company name (used for the logo lookup). */
export function guessCompanyDomain(name: string): string {
  const cleaned = name.toLowerCase().replace(/[^a-z0-9.\s-]/g, ' ').trim();
  const compact = cleaned.replace(/\s+/g, '');
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(compact)) return compact; // already a domain
  const slug = compact.replace(/\./g, '');
  return slug ? `${slug}.com` : '';
}

/**
 * Auto-pick a company logo from the web.
 *
 * REQ 3 enhancement: tries our own /api/company-logo proxy FIRST (which has
 * a 3-provider fallback chain — Clearbit → DuckDuckGo → Google S2 — and
 * proxies bytes through our origin to avoid CORS issues). Falls back to
 * direct client-side Clearbit/Google if the proxy is unreachable.
 */
export async function fetchCompanyLogoFromWeb(companyName: string): Promise<string> {
  if (!companyName || companyName.trim().length < 2) return '';
  const trimmed = companyName.trim();

  // Primary: our server-side proxy. Returns image bytes directly when found.
  try {
    const proxyUrl = `/api/company-logo?name=${encodeURIComponent(trimmed)}&provider=0`;
    const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(4500) });
    if (res.ok) {
      const ct = res.headers.get('content-type') || '';
      if (ct.startsWith('image/')) {
        // Return the proxy URL (without provider idx) so re-renders re-resolve.
        return `/api/company-logo?name=${encodeURIComponent(trimmed)}`;
      }
    }
  } catch { /* fall through to direct client-side fetch */ }

  // Fallback: direct client-side Clearbit + Google (legacy path).
  const domain = guessCompanyDomain(trimmed);
  if (!domain) return '';
  const tryLoad = (url: string) => new Promise<boolean>((resolve) => {
    try {
      const img = new Image();
      let settled = false;
      const done = (ok: boolean) => { if (!settled) { settled = true; resolve(ok); } };
      img.onload = () => done(img.naturalWidth >= 8); // reject 8x8 default favicons
      img.onerror = () => done(false);
      img.src = url;
      setTimeout(() => done(false), 5000);
    } catch { resolve(false); }
  });
  const clearbit = `https://logo.clearbit.com/${domain}?size=128`;
  if (await tryLoad(clearbit)) return clearbit;
  const google = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
  if (await tryLoad(google)) return google;
  return '';
}

/** Human duration between two dates, e.g. "2 yrs 3 mos". */
export function experienceDuration(from: string | Date, to?: string | Date | null): string {
  try {
    const start = new Date(from);
    const end = to ? new Date(to) : new Date();
    if (isNaN(start.getTime())) return '';
    let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
    if (end.getDate() < start.getDate()) months -= 1;
    if (months < 0) return '';
    const years = Math.floor(months / 12);
    const mos = months % 12;
    if (years && mos) return `${years} yr${years > 1 ? 's' : ''} ${mos} mo${mos > 1 ? 's' : ''}`;
    if (years) return `${years} yr${years > 1 ? 's' : ''}`;
    if (months) return `${months} mo${months > 1 ? 's' : ''}`;
    return 'Just joined';
  } catch { return ''; }
}

/** Total years of experience from a list of experience entries (decimal, 1dp). */
export function totalExperienceYears(entries: Array<{ fromDate?: string | null; toDate?: string | null; isCurrent?: boolean }>): number {
  let months = 0;
  for (const e of entries || []) {
    if (!e?.fromDate) continue;
    try {
      const start = new Date(e.fromDate);
      if (isNaN(start.getTime())) continue;
      const end = e.isCurrent || !e.toDate ? new Date() : new Date(e.toDate);
      if (isNaN(end.getTime())) continue;
      let m = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
      if (end.getDate() < start.getDate()) m -= 1;
      if (m > 0) months += m;
    } catch { /* skip bad row */ }
  }
  return Math.round((months / 12) * 10) / 10;
}

/** Format an experience total for display: 3.5 → "3.5 yrs"; 0 → "—". */
export function formatExperienceYears(years: number | null | undefined, fallback?: string | null): string {
  if (years && years > 0) return `${years} yr${years === 1 ? '' : 's'}`;
  if (fallback && String(fallback).trim()) return String(fallback).trim();
  return '—';
}

/**
 * Task 137 — the single source of truth for "which fields are mandatory".
 * Drives the stepper validation AND the red-asterisk rendering AND the
 * per-tab Mandatory/Optional chips, so the three can never drift apart.
 */
export const SECTION_REQUIRED_FIELDS: Record<string, { field: string; label: string }[]> = {
  personal: [
    { field: 'firstName', label: 'First Name' },
    { field: 'lastName', label: 'Last Name' },
    { field: 'email', label: 'Official Email ID' },
    { field: 'employeeId', label: 'Employee ID' },
  ],
  address: [
    { field: 'address', label: 'Address Line 1' },
    { field: 'city', label: 'City' },
    { field: 'state', label: 'State' },
    { field: 'zipCode', label: 'ZIP Code' },
  ],
  employment: [
    { field: 'departmentId', label: 'Department' },
    { field: 'designationId', label: 'Designation' },
    { field: 'dateOfJoining', label: 'Date of Joining' },
  ],
  bank: [
    { field: 'bankName', label: 'Bank Name' },
    { field: 'bankAccountNo', label: 'Bank Account Number' },
    { field: 'bankIfscCode', label: 'IFSC Code' },
  ],
  statutory: [],
  emergency: [
    { field: 'emergencyContactName', label: 'Emergency Contact Name' },
    { field: 'emergencyContactPhone', label: 'Emergency Contact Phone' },
  ],
  health: [
    { field: 'bloodGroup', label: 'Blood Group' },
  ],
  overseas: [],
  experience: [],
  documents: [],
  policies: [],
};

/* ── Types ── */
interface Employee {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  avatar?: string | null;
  department?: { id: string; name: string };
  designation?: { id: string; title: string };
  branch?: { id: string; name: string } | null;
  dateOfJoining: string;
  status: string;
  employeeStatus?: string | null;
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
  bankName?: string | null;
  bankAccountNo?: string | null;
  bankIfscCode?: string | null;
  panNumber?: string | null;
  aadhaarNumber?: string | null;
  salary?: number | null;
  salaryCurrency?: string;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  companyId?: string | null;
  reportingManagerId?: string | null;
  reportingManager?: { id: string; firstName: string; lastName: string; employeeId: string } | null;
  experienceYears?: number | null;
  leavePolicyId?: string | null;
  attendancePolicyId?: string | null;
  travelPolicyId?: string | null;
  salaryStructureId?: string | null;
  bloodGroup?: string | null;
  user?: { id: string; email: string; role: string; avatar: string | null } | null;
}

interface Department { id: string; name: string; company?: { name: string } | null }
interface Designation { id: string; title: string; department?: { name: string } | null }
interface Branch { id: string; name: string }

/* ── Helpers ── */
function getAuthHeaders() {
  const token = getToken() || (typeof window !== 'undefined' ? useAuthStore.getState().token : null);
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

function getStatusBadge(status: string) {
  const map: Record<string, string> = {
    active: 'thb-badge thb-badge-success',
    on_leave: 'thb-badge thb-badge-warning',
    terminated: 'thb-badge thb-badge-error',
    resigned: 'bg-slate-100 text-slate-600 thb-badge',
  };
  const labels: Record<string, string> = { active: 'Active', on_leave: 'On Leave', terminated: 'Terminated', resigned: 'Resigned' };
  return { className: map[status] || 'thb-badge thb-badge-info', label: labels[status] || status };
}

function getStatusDotColor(status: string) {
  const map: Record<string, string> = {
    active: 'bg-emerald-500',
    on_leave: 'bg-amber-500',
    terminated: 'bg-red-500',
    resigned: 'bg-slate-400',
  };
  return map[status] || 'bg-green-500';
}

function formatDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function getAvatarColor(name: string) {
  const colors = [
    'from-green-500 to-cyan-500',
    'from-teal-500 to-teal-500',
    'from-emerald-500 to-teal-500',
    'from-orange-500 to-amber-500',
    'from-pink-500 to-rose-500',
    'from-emerald-500 to-green-500',
    'from-teal-500 to-green-500',
    'from-red-500 to-pink-500',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

/* Task 153 — Tiimi-style rotating colour palette for the employee card grid:
   every card gets a gradient top strip + matching ID-chip tint so the
   directory reads as a colourful wall of people cards. */
const GRID_CARD_TONES = [
  { strip: 'from-indigo-500 via-blue-500 to-cyan-400', chipBg: 'bg-blue-50', chipText: 'text-blue-600' },
  { strip: 'from-violet-500 via-purple-500 to-fuchsia-400', chipBg: 'bg-violet-50', chipText: 'text-violet-600' },
  { strip: 'from-emerald-500 via-teal-500 to-cyan-400', chipBg: 'bg-emerald-50', chipText: 'text-emerald-600' },
  { strip: 'from-amber-500 via-orange-500 to-yellow-400', chipBg: 'bg-amber-50', chipText: 'text-amber-600' },
  { strip: 'from-rose-500 via-pink-500 to-fuchsia-400', chipBg: 'bg-rose-50', chipText: 'text-rose-600' },
  { strip: 'from-cyan-500 via-sky-500 to-blue-400', chipBg: 'bg-sky-50', chipText: 'text-sky-600' },
];

/* ── Employee Documents tab (Add/Edit Employee form) ── */
interface FormDocEntry {
  id: string;
  name: string;
  category: string;
  type: string;
  fileUrl: string;
  fileName: string;
  expiryDate: string;
  description: string;
}

const FORM_DOC_CATEGORIES = [
  { value: 'identification', label: 'Identification & Legal', icon: '🪪' },
  { value: 'onboarding', label: 'Onboarding & Employment', icon: '📋' },
  { value: 'qualifications', label: 'Qualifications', icon: '🎓' },
  { value: 'financial', label: 'Financial & Statutory', icon: '💰' },
  { value: 'lifecycle', label: 'Lifecycle & Performance', icon: '📈' },
  { value: 'other', label: 'Other', icon: '📎' },
];

const FORM_DOC_TYPES = ['offer_letter','id_proof','contract','certificate','policy','aadhaar','pan_card','bank_proof','passport','visa','education','experience','resume','medical','other'];
const DOC_TYPES_BY_CATEGORY: Record<string, string[]> = {
  identification: ['id_proof', 'aadhaar', 'pan_card', 'passport', 'visa'],
  onboarding: ['offer_letter', 'contract', 'policy'],
  qualifications: ['certificate', 'education', 'experience', 'resume'],
  financial: ['pan_card', 'bank_proof'],
  lifecycle: ['policy', 'medical', 'other'],
  other: ['other'],
};

const emptyDocDraft = () => ({
  name: '',
  category: 'onboarding',
  type: 'offer_letter',
  fileUrl: '',
  fileName: '',
  expiryDate: '',
  description: '',
});

/* ── Initial Form State ── */
const initialForm = {
  employeeId: '',
  firstName: '',
  lastName: '',
  email: '',           // Official Email ID (required, official email only)
  personalEmail: '',   // Personal Email ID (optional, gmail/yahoo/etc.)
  phone: '',
  dateOfBirth: '',
  originalBirthday: '',
  gender: '',
  maritalStatus: '',
  nationality: '',
  address: '',
  city: '',
  state: '',
  zipCode: '',
  country: '',
  currentAddress: '',
  currentCity: '',
  currentState: '',
  currentZipCode: '',
  currentCountry: '',
  companyId: '',
  departmentId: '',
  designationId: '',
  branchId: '',
  reportingManagerId: '',   // drives leave approvals, module notifications & the org chart
  role: '',
  dateOfJoining: '',
  employeeStatus: 'confirmed', // confirmed, probation, contract, internship, consultant
  employeeType: 'full_time',   // full_time, part_time, contract, temporary, consultant
  isManagement: false,         // Task 76: "Designate as Management" — shows employee in Management List
  probationEndDate: '',        // editable probation end date (when status=probation)
  bankName: '',
  bankAccountNo: '',
  bankIfscCode: '',
  panNumber: '',
  aadhaarNumber: '',
  salary: '',
  salaryCurrency: 'INR',
  emergencyContactName: '',
  emergencyContactPhone: '',
  emergencyContactRelation: '',
  // Statutory Details
  pfNumber: '',
  pfUAN: '',
  pfNomineeName: '',
  pfNomineeRelation: '',
  pfNomineePercentage: '',
  esiNumber: '',
  esiDispensary: '',
  esiNomineeName: '',
  esiNomineeRelation: '',
  professionalTaxNumber: '',
  lwfNumber: '',
  // Overseas Details
  hasForeignCitizenship: '',
  foreignCitizenshipCountry: '',
  foreignPassportNumber: '',
  foreignPassportExpiry: '',
  hasForeignSojourn: '',
  foreignSojournCountry: '',
  foreignSojournPurpose: '',
  foreignSojournDuration: '',
  hasVisa: '',
  visaType: '',
  visaCountry: '',
  visaExpiry: '',
  hasIntlDrivingLicense: '',
  intlDrivingLicenseCountry: '',
  intlDrivingLicenseExpiry: '',
  // Previous Experience (legacy 3-slot fields — superseded by the dynamic
  // `experiences` array above, kept for backward-compat with older records)
  previousEmployer1: '',
  previousEmployer1Logo: '',
  previousDesignation1: '',
  previousDuration1: '',
  previousReason1: '',
  previousEmployer2: '',
  previousEmployer2Logo: '',
  previousDesignation2: '',
  previousDuration2: '',
  previousReason2: '',
  previousEmployer3: '',
  previousEmployer3Logo: '',
  previousDesignation3: '',
  previousDuration3: '',
  previousReason3: '',
  totalExperience: '',
  // Health History Questionnaire
  bloodGroup: '',
  hasChronicIllness: '',
  chronicIllnessDetails: '',
  hasAllergies: '',
  allergyDetails: '',
  hasDisability: '',
  disabilityDetails: '',
  isOnMedication: '',
  medicationDetails: '',
  hasHadSurgery: '',
  surgeryDetails: '',
  emergencyMedicalCondition: '',
  primaryPhysicianName: '',
  primaryPhysicianPhone: '',
  healthInsuranceProvider: '',
  healthInsurancePolicyNo: '',
  // Policy Mappings
  leavePolicyId: '',
  attendancePolicyId: '',
  travelPolicyId: '',
  salaryStructureId: '',
  avatar: '',
  // Task 137 — interests + structured experience/skills/family rows
  interests: '',
  experiences: [] as FormExperience[],
  skills: [] as FormSkill[],
  dependents: [] as FormDependent[],
  achievements: [] as FormAchievement[],
};

/* ── Component ── */
export function EmployeesPageContent({ formOnly = false }: { formOnly?: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editIdFromUrl = searchParams.get('editId');
  const { user, fetchUser } = useAuthStore();
  const isAdmin = canEditEmployeeRecords(user?.role);
  const canOpenEmployeeSettings = canAccessEmployeeSettings(user?.role);
  const { effectiveCompanyId, selectedTenantId, availableCompanies, scopeQuery } = useCompanyContextStore();
  const persistHydrated = useCompanyContextPersistHydrated();
  const scopeCompanyId = effectiveCompanyId();
  const scopeTenantId = user?.role === 'super_admin' ? selectedTenantId : undefined;

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [listStats, setListStats] = useState({ total: 0, active: 0, inactive: 0, newJoiners: 0 });
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [filterDesignation, setFilterDesignation] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  // Task 81: management-list members are hidden from the Employee List by
  // default (their directory is the Management List module). Toggle to show.
  // Show the complete employee directory by default. Some tenants classify
  // every employee as management-linked; hiding those records by default
  // makes the directory appear empty even though employees exist.
  const [includeManagement, setIncludeManagement] = useState(true);


  const [showForm, setShowForm] = useState(formOnly);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  // Documents tab state — staging mode (Add) vs live mode (Edit)
  const [stagedDocs, setStagedDocs] = useState<FormDocEntry[]>([]);
  const [docDraft, setDocDraft] = useState(emptyDocDraft());
  const [docUploading, setDocUploading] = useState(false);
  const [editDocs, setEditDocs] = useState<Array<{ id: string; name: string; category?: string; type: string; fileUrl?: string | null; expiryDate?: string | null; description?: string | null; uploadedAt?: string }>>([]);
  const [editDocsLoading, setEditDocsLoading] = useState(false);

  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);

  const [leavePolicies, setLeavePolicies] = useState<Array<{ id: string; title: string; version: string }>>([]);
  const [attendancePolicies, setAttendancePolicies] = useState<Array<{ id: string; title: string; version: string }>>([]);
  const [travelPolicies, setTravelPolicies] = useState<Array<{ id: string; title: string; version: string }>>([]);
  const [salaryStructures, setSalaryStructures] = useState<Array<{ id: string; name: string }>>([]);

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid');
  const [activeMainTab, setActiveMainTab] = useState<'list' | 'import'>('list');

  // Row selection for bulk actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  /* Task 153 — row actions are now always-visible icon buttons (view /
     edit / terminate); the old ⋮ dropdown menu and its outside-click
     handler were removed with it. */

  // Horizontal form tab state
  const [formTab, setFormTab] = useState('personal');
  const [stepErrors, setStepErrors] = useState<Record<string, string>>({});
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  // Task 137 — per-tab requirement chips (derived from the stepper validation)
  const formTabs = (
    [
      { key: 'personal', label: 'Personal', icon: '👤' },
      { key: 'address', label: 'Address', icon: '📍' },
      { key: 'employment', label: 'Employment', icon: '💼' },
      { key: 'bank', label: 'Bank & Finance', icon: '🏦' },
      { key: 'statutory', label: 'Statutory', icon: '📋' },
      { key: 'emergency', label: 'Emergency', icon: '🚨' },
      { key: 'health', label: 'Health', icon: '❤️' },
      { key: 'overseas', label: 'Overseas', icon: '🌍' },
      { key: 'experience', label: 'Experience', icon: '📄' },
      { key: 'documents', label: 'Documents', icon: '📎' },
      { key: 'policies', label: 'Policies', icon: '🛡️' },
    ] as const
  ).map((t) => ({ ...t, required: (SECTION_REQUIRED_FIELDS[t.key] || []).length > 0 }));
  // Task 137 — auto-fetched company logos + assigned-policy grid state
  const [logoFetching, setLogoFetching] = useState<Set<number>>(new Set());
  const [companyPolicies, setCompanyPolicies] = useState<Array<Record<string, unknown>>>([]);

  // Per-step required field definitions for stepper validation
  // (Task 137: now derived from the shared SECTION_REQUIRED_FIELDS map so the
  // validation, the red asterisks and the Mandatory/Optional chips agree.)
  const stepRequiredFields: Record<string, { field: string; label: string }[]> = SECTION_REQUIRED_FIELDS;

  // Per-step format validation (runs on Next, not just on final submit)
  const stepFormatValidators: Record<string, { field: string; label: string; validate: (v: string) => { valid: boolean; error?: string } }[]> = {
    personal: [
      { field: 'firstName', label: 'First Name', validate: (v) => validateName(v, 'First name') },
      { field: 'lastName', label: 'Last Name', validate: (v) => validateName(v, 'Last name') },
      { field: 'email', label: 'Official Email ID', validate: validateEmailFormat },
      { field: 'phone', label: 'Phone', validate: validatePhone },
      { field: 'nationality', label: 'Nationality', validate: validateNationality },
    ],
    address: [
      { field: 'zipCode', label: 'ZIP Code', validate: validateZipCode },
    ],
    bank: [
      { field: 'bankIfscCode', label: 'IFSC', validate: validateIFSC },
      { field: 'bankAccountNo', label: 'Bank Account', validate: validateBankAccount },
      { field: 'panNumber', label: 'PAN', validate: validatePAN },
      { field: 'aadhaarNumber', label: 'Aadhaar', validate: validateAadhaar },
    ],
    statutory: [
      { field: 'pfUAN', label: 'UAN', validate: validateUAN },
      { field: 'pfNumber', label: 'PF Number', validate: validatePFNumber },
      { field: 'pfNomineeName', label: 'PF Nominee Name', validate: validateNomineeName },
      { field: 'esiNumber', label: 'ESI Number', validate: validateESINumber },
      { field: 'panNumber', label: 'PAN', validate: validatePAN },
      { field: 'lwfNumber', label: 'LWF Number', validate: validateLWFNumber },
    ],
    emergency: [
      { field: 'emergencyContactName', label: 'Emergency Contact Name', validate: (v) => validateName(v, 'Emergency Contact Name') },
      { field: 'emergencyContactPhone', label: 'Emergency Contact Phone', validate: validatePhone },
    ],
    health: [],
    overseas: [],
    experience: [],
    documents: [],
    policies: [],
  };

  /** Validate current step and advance to next if valid */
  const handleNextStep = async () => {
    if (submitting) return; // Prevent double-click
    setStepErrors({});
    const errors: Record<string, string> = {};

    // 1. Required field check for this step
    const required = stepRequiredFields[formTab] || [];
    for (const { field, label } of required) {
      const value = (form as any)[field];
      if (!value || !String(value).trim()) {
        errors[field] = `${label} is required`;
      }
    }

    // 2. Format validation for this step (only if field has a value)
    const validators = stepFormatValidators[formTab] || [];
    for (const { field, label, validate } of validators) {
      const value = (form as any)[field];
      if (value && String(value).trim()) {
        const result = validate(String(value));
        if (!result.valid) {
          errors[field] = result.error!;
        }
      }
    }

    if (Object.keys(errors).length > 0) {
      setStepErrors(errors);
      toast.error(`Please fix: ${Object.values(errors).join(', ')}`, { duration: 4000 });
      return; // BLOCK navigation
    }

    // Check phone uniqueness before allowing Personal → Address navigation.
    if (formTab === 'personal' && form.phone && !editingId) {
      try {
        const sq = scopeQuery();
        const response = await fetch(`/api/employees?limit=500${sq ? `&${sq}` : ''}`, { headers: getAuthHeaders() });
        if (response.ok) {
          const data = await response.json();
          const normalized = form.phone.replace(/\D/g, '').slice(-10);
          const duplicate = (data.employees || []).some((employee: { phone?: string | null }) => (employee.phone || '').replace(/\D/g, '').slice(-10) === normalized);
          if (duplicate) {
            setStepErrors({ phone: 'This phone number is already registered.' });
            toast.error('This phone number is already registered.');
            return;
          }
        }
      } catch { /* server validates again on submit */ }
    }

    // Mark current step as completed
    setCompletedSteps(prev => new Set([...prev, formTab]));

    // Advance to next tab
    const idx = formTabs.findIndex((t) => t.key === formTab);
    if (idx < formTabs.length - 1) setFormTab(formTabs[idx + 1].key);
  };

  // Stats calculations
  const stats = {
    total: listStats.total || pagination.total,
    active: listStats.active,
    inactive: listStats.inactive,
    newJoiners: listStats.newJoiners,
  };

  /* Export CSV */
  const handleExportCSV = async () => {
    try {
      // Task 140: when the user has ticked employee checkboxes, export ONLY
      // those employees — previously the Export button ignored the selection
      // and always downloaded the whole (filtered) list, so exporting a
      // single selected employee produced every employee in the sheet.
      // With no selection the export keeps honouring the ACTIVE list filters
      // (search / department / designation / status incl. Inactive), exactly
      // as the on-screen list shows them.
      const hasSelection = selectedIds.size > 0;
      const params = new URLSearchParams({ limit: '500', export: '1' });
      if (hasSelection) {
        params.set('ids', Array.from(selectedIds).join(','));
      } else {
        if (search) params.set('search', search);
        if (filterDept) params.set('departmentId', filterDept);
        if (filterDesignation) params.set('designationId', filterDesignation);
        if (filterStatus) params.set('status', filterStatus);
        // The export mirrors the on-screen list — management hidden there is
        // hidden here too (unless the Show Management toggle is on).
        if (!includeManagement) params.set('excludeManagement', '1');
      }
      const sq = scopeQuery();
      const res = await fetch(`/api/employees?${params.toString()}${sq ? `&${sq}` : ''}`, { headers: getAuthHeaders() });
      if (!res.ok) {
        // Fail LOUDLY instead of silently exporting the wrong rows (the old
        // fallback exported the active-only stats list, which looked like the
        // filter was ignored).
        toast.error('Export failed — could not fetch the filtered employee list');
        return;
      }
      const data = await res.json();
      const exportRows = data.employees || [];
      const rows = exportRows.map((emp: Employee) => ({
      'Employee ID': emp.employeeId || '',
      'First Name': emp.firstName || '',
      'Last Name': emp.lastName || '',
      'Email': emp.email || '',
      'Personal Email': (emp as Record<string, unknown>).personalEmail as string || '',
      'Phone': emp.phone || '',
      'Department': emp.department?.name || '',
      'Designation': emp.designation?.title || '',
      'Reporting Manager': emp.reportingManager ? `${emp.reportingManager.firstName} ${emp.reportingManager.lastName}` : '',
      'Branch': emp.branch?.name || '',
      'Status': emp.status || '',
      'Joining Date': emp.dateOfJoining ? new Date(emp.dateOfJoining).toLocaleDateString() : '',
    }));
    if (rows.length === 0) {
      toast.error(hasSelection
        ? 'The selected employees could not be exported — refresh the list and try again'
        : 'No data to export');
      return;
    }
    const headers = Object.keys(rows[0]);
    const csvContent = [
      headers.join(','),
      ...rows.map(row => headers.map(h => {
        const val = row[h as keyof typeof row];
        return `"${String(val ?? '').replace(/"/g, '""')}"`;
      }).join(',')),
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = hasSelection
      ? `employees-selected-${new Date().toISOString().slice(0, 10)}.csv`
      : `employees-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success(hasSelection
      ? `CSV exported — ${rows.length} selected employee${rows.length === 1 ? '' : 's'}`
      : 'CSV exported successfully');
    } catch {
      toast.error('Export failed');
    }
  };

  /* Fetch employees */
  const fetchEmployees = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page: String(page), limit: '10', includeStats: '1' });
      if (search) params.set('search', search);
      if (filterDept) params.set('departmentId', filterDept);
      if (filterDesignation) params.set('designationId', filterDesignation);
      if (filterStatus) params.set('status', filterStatus);
      if (!includeManagement) params.set('excludeManagement', '1');
      const sq = scopeQuery();

      const res = await fetch(`/api/employees?${params.toString()}${sq ? `&${sq}` : ''}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      const fetched = data.employees || [];
      if (data.stats) setListStats(data.stats);
      if (fetched.length === 0) {
        setEmployees([]);
        setPagination(data.pagination || { page: 1, limit: 10, total: 0, totalPages: 0 });
      } else {
        setEmployees(fetched);
        setPagination(data.pagination || { page: 1, limit: 10, total: 0, totalPages: 0 });
      }
    } catch (err) {
      console.error('Failed to load employees from API:', err);
      setEmployees([]);
      setPagination({ page: 1, limit: 10, total: 0, totalPages: 0 });
    } finally {
      setLoading(false);
    }
  }, [search, filterDept, filterDesignation, filterStatus, includeManagement, scopeCompanyId, scopeTenantId, scopeQuery]);

  /* Fetch all employees for stats */
  const fetchAllEmployees = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: '100', status: 'active' });
      const sq = scopeQuery();
      const res = await fetch(`/api/employees?${params.toString()}${sq ? `&${sq}` : ''}`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        const fetched = data.employees || [];
        if (fetched.length === 0) {
          setAllEmployees([]);
        } else {
          setAllEmployees(fetched);
        }
      } else {
        setAllEmployees([]);
      }
    } catch {
      setAllEmployees([]);
    }
  }, [scopeCompanyId, scopeTenantId, scopeQuery]);

  /* Fetch dropdown data */
  const fetchDropdowns = useCallback(async (companyId?: string) => {
    try {
      const headers = getAuthHeaders();
      const sq = scopeQuery();
      // If a specific companyId is passed (e.g. from form), use it AND tenantId from scopeQuery
      const sqParams = new URLSearchParams(sq);
      if (companyId) sqParams.set('companyId', companyId);
      const companyParam = sqParams.toString() ? `&${sqParams.toString()}` : '';

      // Fetch departments, designations, and branches from their own APIs
      const [deptRes, desigRes, branchRes] = await Promise.allSettled([
        fetch(`/api/departments?limit=100${companyParam}`, { headers }),
        fetch(`/api/designations?limit=100${companyParam}`, { headers }),
        fetch(`/api/branches?limit=100${companyParam}`, { headers }),
      ]);
      if (deptRes.status === 'fulfilled' && deptRes.value.ok) {
        const d = await deptRes.value.json();
        setDepartments(d.data || []);
      }
      if (desigRes.status === 'fulfilled' && desigRes.value.ok) {
        const d = await desigRes.value.json();
        setDesignations(d.data || []);
      }
      if (branchRes.status === 'fulfilled' && branchRes.value.ok) {
        const d = await branchRes.value.json();
        setBranches(d.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch dropdown data', err);
    }
  }, [scopeQuery]);

  const fetchPolicyDropdowns = useCallback(async () => {
    try {
      const headers = getAuthHeaders();
      const [lpRes, apRes, tpRes, ssRes, cpRes] = await Promise.allSettled([
        fetch('/api/policies?category=leave&usable=1', { headers }),
        fetch('/api/policies?category=attendance&usable=1', { headers }),
        fetch('/api/policies?category=travel&usable=1', { headers }),
        fetch('/api/salary-structures', { headers }),
        // Task 137 — the Policies tab also shows every ACTIVE company policy
        // document assigned to this employee's audience (view + download)
        fetch('/api/policies?status=active&includeFile=1&limit=100', { headers }),
      ]);
      if (lpRes.status === 'fulfilled' && lpRes.value.ok) { const d = await lpRes.value.json(); setLeavePolicies(d.policies || d.data || []); }
      if (apRes.status === 'fulfilled' && apRes.value.ok) { const d = await apRes.value.json(); setAttendancePolicies(d.policies || d.data || []); }
      if (tpRes.status === 'fulfilled' && tpRes.value.ok) { const d = await tpRes.value.json(); setTravelPolicies(d.policies || d.data || []); }
      if (ssRes.status === 'fulfilled' && ssRes.value.ok) { const d = await ssRes.value.json(); setSalaryStructures(d.salaryStructures || d.data || []); }
      if (cpRes.status === 'fulfilled' && cpRes.value.ok) {
        const d = await cpRes.value.json();
        const list = d.policies || d.data || [];
        setCompanyPolicies(Array.isArray(list) ? list.filter((p: Record<string, unknown>) => p.status !== 'inactive') : []);
      }
    } catch (err) {
      console.error('Failed to fetch policy dropdowns', err);
    }
  }, []);

  useEffect(() => {
    if (!persistHydrated) return;
    queueMicrotask(() => fetchEmployees(1));
  }, [fetchEmployees, persistHydrated]);

  useEffect(() => {
    if (!persistHydrated) return;
    queueMicrotask(() => fetchDropdowns(scopeCompanyId || undefined));
  }, [fetchDropdowns, scopeCompanyId, persistHydrated]);

  useEffect(() => {
    if (showForm) queueMicrotask(() => fetchPolicyDropdowns());
  }, [showForm, fetchPolicyDropdowns]);

  /* Re-fetch dropdowns when form.companyId changes */
  useEffect(() => {
    if (form.companyId) {
      queueMicrotask(() => fetchDropdowns(form.companyId));
    }
  }, [form.companyId, fetchDropdowns]);

  /* Handle editId from URL (navigated from employee view page Edit button) */
  useEffect(() => {
    if (!editIdFromUrl) return;
    if (!canEditEmployeeRecords(user?.role)) {
      toast.error('You can view this profile but cannot edit it');
      router.replace(`/employees/${editIdFromUrl}`);
      return;
    }
    const fetchAndOpenEdit = async () => {
      try {
        const res = await fetch(`/api/employees/${editIdFromUrl}`, { headers: getAuthHeaders() });
        if (!res.ok) return;
        const data = await res.json();
        const emp = data.employee;
        if (!emp) return;
        // Build form from fetched employee
        setEditingId(emp.id);
        setForm({
          ...initialForm,
          ...(mapEmployeeRows(emp as unknown as Record<string, unknown>) as Partial<typeof initialForm>),
          employeeId: emp.employeeId || '',
          firstName: emp.firstName || '',
          lastName: emp.lastName || '',
          email: emp.email || '',
          personalEmail: (emp as Record<string, unknown>).personalEmail as string || '',
          phone: emp.phone || '',
          dateOfBirth: emp.dateOfBirth ? emp.dateOfBirth.split('T')[0] : '',
          originalBirthday: (emp as Record<string, unknown>).originalBirthday ? String((emp as Record<string, unknown>).originalBirthday).split('T')[0] : '',
          gender: emp.gender || '',
          maritalStatus: emp.maritalStatus || '',
          nationality: emp.nationality || '',
          address: emp.address || '',
          city: emp.city || '',
          state: emp.state || '',
          zipCode: emp.zipCode || '',
          country: emp.country || '',
          currentAddress: (emp as Record<string, unknown>).currentAddress as string || '',
          currentCity: (emp as Record<string, unknown>).currentCity as string || '',
          currentState: (emp as Record<string, unknown>).currentState as string || '',
          currentZipCode: (emp as Record<string, unknown>).currentZipCode as string || '',
          currentCountry: (emp as Record<string, unknown>).currentCountry as string || '',
          companyId: emp.companyId || emp.company?.id || '',
          departmentId: emp.department?.id || '',
          designationId: emp.designation?.id || '',
          branchId: emp.branch?.id || '',
          // CRITICAL: pre-fill the current reporting manager. Without this the
          // dropdown shows "No Reporting Manager" on the View→Edit path and any
          // save silently CLEARS the assignment (PUT receives '').
          reportingManagerId: (emp as Record<string, unknown>).reportingManagerId as string || '',
          dateOfJoining: emp.dateOfJoining ? emp.dateOfJoining.split('T')[0] : '',
          employeeStatus: (emp as Record<string, unknown>).employeeStatus as string || 'confirmed',
          employeeType: (emp as Record<string, unknown>).employeeType as string || 'full_time',
          isManagement: (emp as Record<string, unknown>).isManagement === true,
          bankName: emp.bankName || '',
          bankAccountNo: emp.bankAccountNo || '',
          bankIfscCode: emp.bankIfscCode || '',
          panNumber: emp.panNumber || '',
          aadhaarNumber: emp.aadhaarNumber || '',
          salary: emp.salary?.toString() || '',
          salaryCurrency: emp.salaryCurrency || 'INR',
          emergencyContactName: emp.emergencyContactName || '',
          emergencyContactPhone: emp.emergencyContactPhone || '',
          emergencyContactRelation: (emp as Record<string, unknown>).emergencyContactRelation as string || '',
          bloodGroup: emp.bloodGroup || '',
          hasChronicIllness: (emp as Record<string, unknown>).hasChronicIllness as string || '',
          chronicIllnessDetails: (emp as Record<string, unknown>).chronicIllnessDetails as string || '',
          hasAllergies: (emp as Record<string, unknown>).hasAllergies as string || '',
          allergyDetails: (emp as Record<string, unknown>).allergyDetails as string || '',
          hasDisability: (emp as Record<string, unknown>).hasDisability as string || '',
          disabilityDetails: (emp as Record<string, unknown>).disabilityDetails as string || '',
          isOnMedication: (emp as Record<string, unknown>).isOnMedication as string || '',
          medicationDetails: (emp as Record<string, unknown>).medicationDetails as string || '',
          hasHadSurgery: (emp as Record<string, unknown>).hasHadSurgery as string || '',
          surgeryDetails: (emp as Record<string, unknown>).surgeryDetails as string || '',
          emergencyMedicalCondition: (emp as Record<string, unknown>).emergencyMedicalCondition as string || '',
          primaryPhysicianName: (emp as Record<string, unknown>).primaryPhysicianName as string || '',
          primaryPhysicianPhone: (emp as Record<string, unknown>).primaryPhysicianPhone as string || '',
          healthInsuranceProvider: (emp as Record<string, unknown>).healthInsuranceProvider as string || '',
          healthInsurancePolicyNo: (emp as Record<string, unknown>).healthInsurancePolicyNo as string || '',
          leavePolicyId: emp.leavePolicyId || '',
          attendancePolicyId: emp.attendancePolicyId || '',
          travelPolicyId: emp.travelPolicyId || '',
          salaryStructureId: emp.salaryStructureId || '',
          // Statutory
          pfNumber: (emp as Record<string, unknown>).pfNumber as string || '',
          pfUAN: (emp as Record<string, unknown>).pfUAN as string || '',
          pfNomineeName: (emp as Record<string, unknown>).pfNomineeName as string || '',
          pfNomineeRelation: (emp as Record<string, unknown>).pfNomineeRelation as string || '',
          pfNomineePercentage: (emp as Record<string, unknown>).pfNomineePercentage as string || '',
          esiNumber: (emp as Record<string, unknown>).esiNumber as string || '',
          esiDispensary: (emp as Record<string, unknown>).esiDispensary as string || '',
          esiNomineeName: (emp as Record<string, unknown>).esiNomineeName as string || '',
          esiNomineeRelation: (emp as Record<string, unknown>).esiNomineeRelation as string || '',
          professionalTaxNumber: (emp as Record<string, unknown>).professionalTaxNumber as string || '',
          lwfNumber: (emp as Record<string, unknown>).lwfNumber as string || '',
          // Overseas
          hasForeignCitizenship: (emp as Record<string, unknown>).hasForeignCitizenship as string || '',
          foreignCitizenshipCountry: (emp as Record<string, unknown>).foreignCitizenshipCountry as string || '',
          foreignPassportNumber: (emp as Record<string, unknown>).foreignPassportNumber as string || '',
          foreignPassportExpiry: (emp as Record<string, unknown>).foreignPassportExpiry as string || '',
          hasForeignSojourn: (emp as Record<string, unknown>).hasForeignSojourn as string || '',
          foreignSojournCountry: (emp as Record<string, unknown>).foreignSojournCountry as string || '',
          foreignSojournPurpose: (emp as Record<string, unknown>).foreignSojournPurpose as string || '',
          foreignSojournDuration: (emp as Record<string, unknown>).foreignSojournDuration as string || '',
          hasVisa: (emp as Record<string, unknown>).hasVisa as string || '',
          visaType: (emp as Record<string, unknown>).visaType as string || '',
          visaCountry: (emp as Record<string, unknown>).visaCountry as string || '',
          visaExpiry: (emp as Record<string, unknown>).visaExpiry as string || '',
          hasIntlDrivingLicense: (emp as Record<string, unknown>).hasIntlDrivingLicense as string || '',
          intlDrivingLicenseCountry: (emp as Record<string, unknown>).intlDrivingLicenseCountry as string || '',
          intlDrivingLicenseExpiry: (emp as Record<string, unknown>).intlDrivingLicenseExpiry as string || '',
          // Experience
          previousEmployer1: (emp as Record<string, unknown>).previousEmployer1 as string || '',
          previousEmployer1Logo: (emp as Record<string, unknown>).previousEmployer1Logo as string || '',
          previousDesignation1: (emp as Record<string, unknown>).previousDesignation1 as string || '',
          previousDuration1: (emp as Record<string, unknown>).previousDuration1 as string || '',
          previousReason1: (emp as Record<string, unknown>).previousReason1 as string || '',
          previousEmployer2: (emp as Record<string, unknown>).previousEmployer2 as string || '',
          previousEmployer2Logo: (emp as Record<string, unknown>).previousEmployer2Logo as string || '',
          previousDesignation2: (emp as Record<string, unknown>).previousDesignation2 as string || '',
          previousDuration2: (emp as Record<string, unknown>).previousDuration2 as string || '',
          previousReason2: (emp as Record<string, unknown>).previousReason2 as string || '',
          previousEmployer3: (emp as Record<string, unknown>).previousEmployer3 as string || '',
          previousEmployer3Logo: (emp as Record<string, unknown>).previousEmployer3Logo as string || '',
          previousDesignation3: (emp as Record<string, unknown>).previousDesignation3 as string || '',
          previousDuration3: (emp as Record<string, unknown>).previousDuration3 as string || '',
          previousReason3: (emp as Record<string, unknown>).previousReason3 as string || '',
          totalExperience: (emp as Record<string, unknown>).totalExperience as string || '',
          role: emp.user?.role || 'employee',
          avatar: emp.avatar || '',
        });
        setShowForm(true);
        setFormTab('personal'); setCompletedSteps(new Set());
        setPhotoPreview(emp.avatar || null);
        setTimeout(() => document.getElementById('crud-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
      } catch (err) {
        console.error('Failed to load employee for editing:', err);
      }
    };
    fetchAndOpenEdit();
  }, [editIdFromUrl, user?.role, router]);

  /* Handle showAddForm from URL (navigated from /employees/add redirect) */
  useEffect(() => {
    if (searchParams.get('showAddForm') === 'true') {
      queueMicrotask(() => setShowForm(true));
    }
  }, [searchParams]);

  /* Read employee code settings from localStorage */
  const getEmployeeCodeSettings = useCallback(() => {
    try {
      const stored = localStorage.getItem('3boxes_hrms_settings');
      if (stored) {
        const settings = JSON.parse(stored);
        return {
          autoGeneration: settings.employee_code_auto_generation !== false,
          prefix: settings.employee_code_prefix || 'EMP',
          sequence: settings.employee_code_sequence || 1001,
          dataLocked: settings.employee_data_locked === true,
        };
      }
    } catch { /* ignore */ }
    return { autoGeneration: true, prefix: 'EMP', sequence: 1001, dataLocked: false };
  }, []);

  /* Read the probation period (months) from employee settings (localStorage).
     Default is 6 months. Configurable via Employee Settings → Probation & Notice. */
  const getProbationPeriod = useCallback((): number => {
    try {
      const stored = localStorage.getItem('3boxes_hrms_settings');
      if (stored) {
        const settings = JSON.parse(stored);
        const val = Number(settings.employee_probation_period);
        if (val > 0 && val <= 24) return val;
      }
    } catch { /* ignore */ }
    return 6; // default
  }, []);

  /* Calculate the probation end date = joiningDate + probationPeriod months.
     Returns a formatted date string (e.g., "Jul 15, 2026"). */
  const formatProbationEndDate = useCallback((joiningDate: string, months: number): string => {
    try {
      const start = new Date(joiningDate);
      const end = new Date(start);
      end.setMonth(end.getMonth() + months);
      return end.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return '—';
    }
  }, []);

  /* Generate the next employee code based on settings.
   *  - When autoGeneration is OFF → return '' (user must enter manually)
   *  - When autoGeneration is ON  → use prefix + sequence + random suffix
   *    (we append a short random suffix to guarantee uniqueness even if the
   *     sequence counter in localStorage isn't perfectly in sync with the DB)
   */
  const generateNextEmployeeCode = useCallback(() => {
    const settings = getEmployeeCodeSettings();
    if (!settings.autoGeneration) return ''; // Manual mode — leave empty for user to fill
    // Use prefix + sequence + short random suffix for uniqueness
    const seq = String(settings.sequence || 1001).padStart(4, '0');
    const rand = Math.random().toString(36).slice(2, 5).toUpperCase();
    return `${settings.prefix}${seq}${rand}`;
  }, [getEmployeeCodeSettings]);

  /* Auto-initialize form when in formOnly (Add Employee) mode */
  useEffect(() => {
    if (formOnly && !editingId) {
      const settings = getEmployeeCodeSettings();
      queueMicrotask(() => setForm(prev => ({
        ...prev,
        employeeId: prev.employeeId || (settings.autoGeneration ? generateNextEmployeeCode() : ''),
        companyId: prev.companyId || scopeCompanyId || '',
      })));
    }
  }, [formOnly, scopeCompanyId, getEmployeeCodeSettings, generateNextEmployeeCode, editingId]);

  /* Task 137 — map the GET /api/employees/[id] row collections into form rows.
     undefined (not []) when the source row lacks the collection — that way a
     failed/legacy fetch can never wipe existing rows on save. */
  const mapEmployeeRows = useCallback((emp: Record<string, unknown>) => ({
    interests: (emp.interests as string) || '',
    experiences: Array.isArray(emp.experiences)
      ? (emp.experiences as Array<Record<string, unknown>>).map((x) => ({
          id: String(x.id || ''),
          company: String(x.company || ''),
          designation: String(x.designation || ''),
          fromDate: x.startDate ? String(x.startDate).slice(0, 10) : '',
          toDate: x.endDate ? String(x.endDate).slice(0, 10) : '',
          isCurrent: Boolean(x.isCurrent),
          description: String(x.description || ''),
          companyLogo: String(x.companyLogo || ''),
          companyCategory: String(x.companyCategory || ''),
          companyLevel: String(x.companyLevel || ''),
          domains: Array.isArray(x.domains)
            ? (x.domains as unknown[]).map((d) => String(d)).filter(Boolean)
            : (() => { try { const v = typeof x.domains === 'string' ? JSON.parse(x.domains) : null; return Array.isArray(v) ? v.map((d) => String(d)).filter(Boolean) : []; } catch { return []; } })(),
          letters: Array.isArray(x.letters)
            ? (x.letters as Array<Record<string, unknown>>).map((l) => ({
                name: String(l.name || 'Letter'),
                type: String(l.type || 'other'),
                fileUrl: String(l.fileUrl || ''),
              })).filter((l) => l.fileUrl)
            : (() => { try { const v = typeof x.letters === 'string' ? JSON.parse(x.letters) : null; return Array.isArray(v) ? v.map((l) => ({ name: String(l?.name || 'Letter'), type: String(l?.type || 'other'), fileUrl: String(l?.fileUrl || '') })).filter((l) => l.fileUrl) : []; } catch { return []; } })(),
        }))
      : undefined,
    achievements: Array.isArray(emp.achievements)
      ? (emp.achievements as Array<Record<string, unknown>>).map((a) => ({
          id: String(a.id || ''),
          title: String(a.title || ''),
          category: String(a.category || 'other'),
          issuer: String(a.issuer || ''),
          achievedOn: a.achievedOn ? String(a.achievedOn).slice(0, 10) : '',
          description: String(a.description || ''),
        }))
      : undefined,
    skills: Array.isArray(emp.skills)
      ? (emp.skills as Array<Record<string, unknown>>).map((s) => ({
          id: String(s.id || ''),
          skill: String(s.skill || ''),
          level: String(s.level || 'intermediate'),
          yearsOfExp: s.yearsOfExp !== null && s.yearsOfExp !== undefined ? String(s.yearsOfExp) : '',
        }))
      : undefined,
    dependents: Array.isArray(emp.dependents)
      ? (emp.dependents as Array<Record<string, unknown>>).map((d) => ({
          id: String(d.id || ''),
          name: String(d.name || ''),
          relation: String(d.relation || ''),
          dateOfBirth: d.dateOfBirth ? String(d.dateOfBirth).slice(0, 10) : '',
          gender: String(d.gender || ''),
        }))
      : undefined,
  }), []);

  /* Task 137 — auto-fetch a company logo for one experience row */
  const autoFetchExperienceLogo = useCallback(async (rowIndex: number, companyName: string) => {
    if (!companyName.trim()) return;
    setLogoFetching(prev => new Set(prev).add(rowIndex));
    try {
      const url = await fetchCompanyLogoFromWeb(companyName);
      setForm(prev => {
        const rows = [...(prev.experiences || [])];
        if (!rows[rowIndex]) return prev;
        rows[rowIndex] = { ...rows[rowIndex], companyLogo: url || rows[rowIndex].companyLogo };
        return { ...prev, experiences: rows };
      });
      if (url) toast.success('Company logo picked automatically');
      else toast.error('Logo not found — you can paste a logo URL manually', { duration: 4000 });
    } finally {
      setLogoFetching(prev => { const next = new Set(prev); next.delete(rowIndex); return next; });
    }
  }, []);

  /* Form handlers */
  const handleOpenAddForm = () => {
    setEditingId(null);
    const settings = getEmployeeCodeSettings();
    setForm({
      ...initialForm,
      employeeId: settings.autoGeneration ? generateNextEmployeeCode() : '',
      companyId: scopeCompanyId || '',
    });
    setShowForm(true);
    setFormTab('personal'); setCompletedSteps(new Set());
    setStagedDocs([]); setDocDraft(emptyDocDraft());
    setDeleteConfirmId(null);
    void fetchAllEmployees();
    setTimeout(() => document.getElementById('crud-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const handleOpenEditForm = async (emp: Employee) => {
    setEditingId(emp.id);
    setShowForm(true);
    setFormTab('personal'); setCompletedSteps(new Set());
    setStagedDocs([]); setDocDraft(emptyDocDraft()); setEditDocs([]);
    setDeleteConfirmId(null);
    void fetchAllEmployees();

    // Fetch FRESH employee data from the API to ensure we get the latest
    // employeeStatus, employeeType, personalEmail, etc.
    let freshEmp: any = emp;
    try {
      const res = await fetch(`/api/employees/${emp.id}`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        freshEmp = data.employee || data;
      }
    } catch {
      // Fall back to the list data
      freshEmp = emp;
    }

    setForm({
      ...initialForm,
      ...(mapEmployeeRows(freshEmp as unknown as Record<string, unknown>) as Partial<typeof initialForm>),
      employeeId: freshEmp.employeeId || '',
      firstName: freshEmp.firstName || '',
      lastName: freshEmp.lastName || '',
      email: freshEmp.email || '',
      personalEmail: freshEmp.personalEmail || '',
      phone: freshEmp.phone || '',
      dateOfBirth: freshEmp.dateOfBirth ? freshEmp.dateOfBirth.split('T')[0] : '',
      originalBirthday: freshEmp.originalBirthday ? String(freshEmp.originalBirthday).split('T')[0] : '',
      gender: freshEmp.gender || '',
      maritalStatus: freshEmp.maritalStatus || '',
      nationality: freshEmp.nationality || '',
      address: freshEmp.address || '',
      city: freshEmp.city || '',
      state: freshEmp.state || '',
      zipCode: freshEmp.zipCode || '',
      country: freshEmp.country || '',
      currentAddress: freshEmp.currentAddress || '',
      currentCity: freshEmp.currentCity || '',
      currentState: freshEmp.currentState || '',
      currentZipCode: freshEmp.currentZipCode || '',
      currentCountry: freshEmp.currentCountry || '',
      companyId: freshEmp.companyId || freshEmp.company?.id || '',
      departmentId: freshEmp.department?.id || '',
      designationId: freshEmp.designation?.id || '',
      branchId: freshEmp.branch?.id || '',
      reportingManagerId: freshEmp.reportingManagerId || '',
      role: freshEmp.role || '',
      dateOfJoining: freshEmp.dateOfJoining ? freshEmp.dateOfJoining.split('T')[0] : '',
      employeeStatus: freshEmp.employeeStatus || 'confirmed',
      employeeType: freshEmp.employeeType || 'full_time',
      isManagement: freshEmp.isManagement === true,
      probationEndDate: freshEmp.probationEndDate || '',
      bankName: freshEmp.bankName || '',
      bankAccountNo: freshEmp.bankAccountNo || '',
      bankIfscCode: freshEmp.bankIfscCode || '',
      panNumber: freshEmp.panNumber || '',
      aadhaarNumber: freshEmp.aadhaarNumber || '',
      salary: freshEmp.salary?.toString() || '',
      salaryCurrency: freshEmp.salaryCurrency || 'INR',
      emergencyContactName: freshEmp.emergencyContactName || '',
      emergencyContactPhone: freshEmp.emergencyContactPhone || '',
      emergencyContactRelation: freshEmp.emergencyContactRelation || '',
      bloodGroup: freshEmp.bloodGroup || '',
      avatar: freshEmp.avatar || '',
      hasChronicIllness: freshEmp.hasChronicIllness || '',
      chronicIllnessDetails: freshEmp.chronicIllnessDetails || '',
      hasAllergies: freshEmp.hasAllergies || '',
      allergyDetails: freshEmp.allergyDetails || '',
      hasDisability: freshEmp.hasDisability || '',
      disabilityDetails: freshEmp.disabilityDetails || '',
      isOnMedication: freshEmp.isOnMedication || '',
      medicationDetails: freshEmp.medicationDetails || '',
      hasHadSurgery: freshEmp.hasHadSurgery || '',
      surgeryDetails: freshEmp.surgeryDetails || '',
      emergencyMedicalCondition: freshEmp.emergencyMedicalCondition || '',
      primaryPhysicianName: freshEmp.primaryPhysicianName || '',
      primaryPhysicianPhone: freshEmp.primaryPhysicianPhone || '',
      healthInsuranceProvider: freshEmp.healthInsuranceProvider || '',
      healthInsurancePolicyNo: freshEmp.healthInsurancePolicyNo || '',
      leavePolicyId: freshEmp.leavePolicyId || '',
      attendancePolicyId: freshEmp.attendancePolicyId || '',
      travelPolicyId: freshEmp.travelPolicyId || '',
      salaryStructureId: freshEmp.salaryStructureId || '',
      role: freshEmp.user?.role || freshEmp.role || 'employee',
      avatar: freshEmp.avatar || '',
    });
    setPhotoPreview(freshEmp.avatar || null);
    setTimeout(() => document.getElementById('crud-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const handleCancelForm = () => {
    if (formOnly) {
      router.push('/employees');
      return;
    }
    setShowForm(false);
    setEditingId(null);
    setForm(initialForm);
    setFormTab('personal'); setCompletedSteps(new Set());
    setPhotoPreview(null);
    setStagedDocs([]); setDocDraft(emptyDocDraft()); setEditDocs([]);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    // Enhanced validation: show exactly which required fields are missing
    const missingFields: string[] = [];
    const settings = getEmployeeCodeSettings();
    if (settings.autoGeneration && !form.employeeId) missingFields.push('Employee ID');
    if (!settings.autoGeneration && !form.employeeId) missingFields.push('Employee ID');
    if (!form.firstName) missingFields.push('First Name');
    if (!form.lastName) missingFields.push('Last Name');
    if (!form.email) missingFields.push('Email');
    if (!form.departmentId) missingFields.push('Department');
    if (!form.designationId) missingFields.push('Designation');
    if (!form.dateOfJoining) missingFields.push('Date of Joining');
    if (missingFields.length > 0) {
      toast.error(`Missing required fields: ${missingFields.join(', ')}`, { duration: 5000 });
      // Auto-navigate to the tab that contains the first missing field
      const personalFields = ['Employee ID', 'First Name', 'Last Name', 'Email'];
      const employmentFields = ['Department', 'Designation', 'Date of Joining'];
      if (personalFields.includes(missingFields[0])) { setFormTab('personal'); setCompletedSteps(new Set()); }
      else if (employmentFields.includes(missingFields[0])) setFormTab('employment');
      return;
    }

    // Format validation using centralized validators
    const formatErrors: string[] = [];
    const emailFmt = validateEmailFormat(form.email);
    if (!emailFmt.valid) formatErrors.push(emailFmt.error!);

    if (form.phone) {
      const r = validatePhone(form.phone);
      if (!r.valid) formatErrors.push(r.error!);
    }
    if (form.aadhaarNumber) {
      const r = validateAadhaar(form.aadhaarNumber);
      if (!r.valid) formatErrors.push(r.error!);
    }
    if (form.panNumber) {
      const r = validatePAN(form.panNumber);
      if (!r.valid) formatErrors.push(r.error!);
    }
    if (form.bankIfscCode) {
      const r = validateIFSC(form.bankIfscCode);
      if (!r.valid) formatErrors.push(r.error!);
    }
    if (form.bankAccountNo) {
      const r = validateBankAccount(form.bankAccountNo);
      if (!r.valid) formatErrors.push(r.error!);
    }
    if (form.pfUAN) {
      const r = validateUAN(form.pfUAN);
      if (!r.valid) formatErrors.push(r.error!);
    }
    if (form.pfNumber) { const r = validatePFNumber(form.pfNumber); if (!r.valid) formatErrors.push(r.error!); }
    if (form.pfNomineeName) { const r = validateNomineeName(form.pfNomineeName); if (!r.valid) formatErrors.push(r.error!); }
    if (form.lwfNumber) { const r = validateLWFNumber(form.lwfNumber); if (!r.valid) formatErrors.push(r.error!); }
    if (form.emergencyContactPhone) {
      const r = validatePhone(form.emergencyContactPhone);
      if (!r.valid) formatErrors.push(`Emergency contact: ${r.error!}`);
    }
    if (formatErrors.length > 0) {
      toast.error(`Validation errors: ${formatErrors.join('; ')}`, { duration: 6000 });
      return;
    }

    // ─── Employee ID uniqueness check (manual mode only) ───
    // When auto-generation is ON, the system generates a unique ID, so we
    // skip the check. When auto-generation is OFF, the user has manually
    // entered an ID — we must verify it doesn't already exist.
    if (!editingId && !settings.autoGeneration && form.employeeId) {
      try {
        const sq = scopeQuery();
        const checkRes = await fetch(`/api/employees?limit=500${sq ? `&${sq}` : ''}`, { headers: getAuthHeaders() });
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          const allEmps = checkData.employees || [];
          const duplicate = allEmps.find((e: { employeeId: string }) => e.employeeId?.toLowerCase() === form.employeeId.toLowerCase());
          if (duplicate) {
            toast.error(`Employee ID "${form.employeeId}" already exists. Please use a different ID.`, { duration: 6000 });
            setFormTab('personal');
            return;
          }
        }
      } catch {
        // If the check fails, proceed — the API will catch duplicates anyway
      }
    }

    try {
      setSubmitting(true);
      // Task 137 — drop incomplete experience/skill/family rows so partial
      // typing doesn't create junk records server-side. Collections that were
      // never loaded (undefined) are OMITTED so a save can't wipe real rows.
      const cleanedExperiences = Array.isArray(form.experiences)
        ? form.experiences.filter(
            (x) => x.company.trim() && x.designation.trim() && x.fromDate && (x.isCurrent || x.toDate),
          )
        : undefined;
      const cleanedSkills = Array.isArray(form.skills)
        ? form.skills.filter((s) => s.skill.trim())
        : undefined;
      const cleanedDependents = Array.isArray(form.dependents)
        ? form.dependents.filter((d) => d.name.trim() && d.relation.trim())
        : undefined;
      const cleanedAchievements = Array.isArray(form.achievements)
        ? form.achievements.filter((a) => a.title.trim())
        : undefined;
      const payload = {
        ...form,
        ...(cleanedExperiences !== undefined ? { experiences: cleanedExperiences } : {}),
        ...(cleanedSkills !== undefined ? { skills: cleanedSkills } : {}),
        ...(cleanedDependents !== undefined ? { dependents: cleanedDependents } : {}),
        ...(cleanedAchievements !== undefined ? { achievements: cleanedAchievements } : {}),
        interests: (form.interests || '').trim(),
        salary: form.salary ? parseFloat(form.salary) : null,
        companyId: form.companyId || scopeCompanyId || null,
        // Send the probation end date (from the editable field) so the API
        // can auto-create the probation review with the correct end date
        probationEndDate: form.employeeStatus === 'probation' ? form.probationEndDate : undefined,
      };

      if (editingId) {
        const res = await fetch(`/api/employees/${editingId}`, {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({ error: 'Update failed' }));
          // Task 74: show the FULL error message including the data-lock message
          throw new Error(d.error || 'Update failed');
        }
        // Task 74: verify the save actually persisted by re-fetching the employee
        try {
          const verifyRes = await fetch(`/api/employees/${editingId}`, { headers: getAuthHeaders() });
          if (verifyRes.ok) {
            const verifyData = await verifyRes.json();
            const savedEmp = verifyData.employee || verifyData;
            if (savedEmp) {
              console.log('[Employee Form] Verified save: firstName=' + savedEmp.firstName + ', email=' + savedEmp.email);
              const linkedUserId = savedEmp.userId || savedEmp.user?.id;
              if (linkedUserId === user?.id || savedEmp.email === user?.email) {
                await fetchUser();
              }
            }
          }
        } catch { /* verification is best-effort */ }
        toast.success('Employee updated successfully');
      } else {
        const res = await fetch('/api/employees', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({ error: 'Create failed' }));
          // Show the FULL error message (includes Prisma code + details for debugging)
          const errorMsg = d.error || d.details || 'Create failed';
          throw new Error(errorMsg);
        }
        toast.success('Employee created successfully');

        // ─── Attach staged documents to the freshly created employee ───
        // Non-blocking: if a document upload fails, the employee is still
        // created and the user is told to attach the failed docs manually.
        const created = await res.json().catch(() => null);
        const newEmpId: string | undefined = created?.employee?.id;
        if (newEmpId && stagedDocs.length > 0) {
          let docsOk = 0;
          let docsFailed = 0;
          for (const doc of stagedDocs) {
            try {
              const dr = await fetch(`/api/employees/${newEmpId}/documents`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                  name: doc.name,
                  category: doc.category,
                  type: doc.type,
                  fileUrl: doc.fileUrl || undefined,
                  description: doc.description || undefined,
                  expiryDate: doc.expiryDate || undefined,
                }),
              });
              if (dr.ok) docsOk++; else docsFailed++;
            } catch {
              docsFailed++;
            }
          }
          if (docsOk > 0) toast.success(`${docsOk} document${docsOk > 1 ? 's' : ''} attached to employee`);
          if (docsFailed > 0) toast.error(`${docsFailed} document${docsFailed > 1 ? 's' : ''} could not be attached — add them from the employee profile`, { duration: 7000 });
          setStagedDocs([]);
        }
      }
      handleCancelForm();
      fetchEmployees(pagination.page);
      fetchDropdowns();
      fetchAllEmployees();
    } catch (err: unknown) {
      // Show error for 10 seconds so the user can read the full message
      const msg = err instanceof Error ? err.message : 'Operation failed';
      toast.error(msg, { duration: 10000 });
      console.error('[Employee Form] Submit error:', msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      setDeleting(true);
      const res = await fetch(`/api/employees/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Delete failed'); }
      toast.success('Employee terminated successfully');
      setDeleteConfirmId(null);
      fetchEmployees(pagination.page);
      fetchAllEmployees();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const updateForm = (field: string, value: string | boolean) => setForm(prev => ({ ...prev, [field]: value }));

  /* Photo upload handler */
  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const result = await fileToProfilePhotoDataUrl(file);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setPhotoPreview(result.dataUrl);
    updateForm('avatar', result.dataUrl);
  };

  /* ── Documents tab handlers ── */
  const handleDocFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      toast.error('File must be under 3MB. For larger files, paste a shareable link instead.', { duration: 6000 });
      e.target.value = '';
      return;
    }
    if (file.size === 0 || !['application/pdf', 'image/jpeg', 'image/png', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(file.type)) {
      toast.error('Invalid or corrupted file. Please upload a valid document.');
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setDocDraft(prev => ({ ...prev, fileUrl: reader.result as string, fileName: file.name }));
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  /* ── Task 138 — experience letters + domains handlers ── */
const handleExperienceLetterPick = (
  rowIndex: number,
  e: React.ChangeEvent<HTMLInputElement>
) => {
  const file = e.target.files?.[0];
  e.target.value = '';

  if (!file) return;

  // Maximum file size: 3 MB
  if (file.size > 3 * 1024 * 1024) {
    toast.error('PDF must be under 3MB.', { duration: 6000 });
    return;
  }

  // Accept PDF files only
  if (file.size === 0 || file.type !== 'application/pdf') {
    toast.error('Invalid file — please attach a PDF file only.');
    return;
  }

  const reader = new FileReader();

  reader.onloadend = () => {
    if (reader.error || typeof reader.result !== 'string') {
      toast.error('Failed to read the PDF file. Please try again.');
      return;
    }

    setForm(prev => {
      const rows = [...(prev.experiences || [])];

      if (!rows[rowIndex]) return prev;

      const row = rows[rowIndex];
      const type = row.letterType || 'offer_letter';

      const letters = [
        ...(row.letters || []),
        {
          name: file.name,
          type,
          fileUrl: reader.result as string,
        },
      ];

      rows[rowIndex] = { ...row, letters };

      return { ...prev, experiences: rows };
    });

    toast.success('PDF attached — remember to save the employee');
  };

  reader.onerror = () => {
    toast.error('Failed to read the PDF file. Please try again.');
  };

  reader.readAsDataURL(file);
};

  const removeExperienceLetter = (rowIndex: number, letterIndex: number) => {
    setForm(prev => {
      const rows = [...(prev.experiences || [])];
      if (!rows[rowIndex]) return prev;
      const row = rows[rowIndex];
      rows[rowIndex] = { ...row, letters: (row.letters || []).filter((_, j) => j !== letterIndex) };
      return { ...prev, experiences: rows };
    });
  };

  const toggleExperienceDomain = (rowIndex: number, domain: string) => {
    setForm(prev => {
      const rows = [...(prev.experiences || [])];
      if (!rows[rowIndex]) return prev;
      const row = rows[rowIndex];
      const cur = row.domains || [];
      const next = cur.includes(domain) ? cur.filter((d) => d !== domain) : [...cur, domain];
      rows[rowIndex] = { ...row, domains: next };
      return { ...prev, experiences: rows };
    });
  };

  const addStagedDoc = () => {
    // Auto-generate document name from category + type if not provided
    // (the Document Name field was removed from the form — name is auto-derived)
    const autoName = docDraft.name.trim() || `${docDraft.category}-${docDraft.type}`;
    if (!DOC_TYPES_BY_CATEGORY[docDraft.category]?.includes(docDraft.type)) { toast.error('The selected document type is not valid for this category.'); return; }
    if (stagedDocs.some(doc => doc.category === docDraft.category && doc.type === docDraft.type)) { toast.error('A document of this type is already in the upload list.'); return; }
    // QA fix — Document Link Security: reject unsafe URLs (javascript:, data:text/html, etc.)
    if (docDraft.fileUrl && !isSafeDocumentUrl(docDraft.fileUrl)) {
      toast.error('Unsafe document link blocked. Use a full http(s):// URL (e.g. https://drive.google.com/…)');
      return;
    }
    setStagedDocs(prev => [...prev, { id: `doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, ...docDraft, name: autoName }]);
    setDocDraft(emptyDocDraft());
    toast.success('Document added — it will be saved when you click "Add Employee"');
  };

  const removeStagedDoc = (id: string) => setStagedDocs(prev => prev.filter(d => d.id !== id));

  /* Edit mode: live document management against the real API */
  const fetchEditDocs = useCallback(async (employeeId: string) => {
    try {
      setEditDocsLoading(true);
      const r = await fetch(`/api/employees/${employeeId}/documents`, { headers: getAuthHeaders() });
      if (r.ok) {
        const d = await r.json();
        setEditDocs(d.documents || []);
      }
    } catch {
      // non-critical — leave list as-is
    } finally {
      setEditDocsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (formTab === 'documents' && editingId) fetchEditDocs(editingId);
  }, [formTab, editingId, fetchEditDocs]);

  const uploadLiveDoc = async () => {
    if (!editingId) return;
    // Auto-generate document name from category + type if not provided
    const autoName = docDraft.name.trim() || `${docDraft.category}-${docDraft.type}`;
    if (!DOC_TYPES_BY_CATEGORY[docDraft.category]?.includes(docDraft.type)) { toast.error('The selected document type is not valid for this category.'); return; }
    // QA fix — Document Link Security: reject unsafe URLs before they are persisted
    if (docDraft.fileUrl && !isSafeDocumentUrl(docDraft.fileUrl)) {
      toast.error('Unsafe document link blocked. Use a full http(s):// URL (e.g. https://drive.google.com/…)');
      return;
    }
    try {
      setDocUploading(true);
      const r = await fetch(`/api/employees/${editingId}/documents`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name: autoName,
          category: docDraft.category,
          type: docDraft.type,
          fileUrl: docDraft.fileUrl || undefined,
          description: docDraft.description || undefined,
          expiryDate: docDraft.expiryDate || undefined,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || 'Upload failed');
      }
      toast.success('Document saved to employee record');
      setDocDraft(emptyDocDraft());
      fetchEditDocs(editingId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setDocUploading(false);
    }
  };

  const deleteLiveDoc = async (docId: string) => {
    if (!editingId) return;
    try {
      const r = await fetch(`/api/employees/${editingId}/documents?docId=${docId}`, { method: 'DELETE', headers: getAuthHeaders() });
      if (!r.ok) throw new Error('Delete failed');
      toast.success('Document removed');
      fetchEditDocs(editingId);
    } catch {
      toast.error('Failed to delete document');
    }
  };

  /* Bulk selection */
  const toggleSelectAll = () => {
    if (selectedIds.size === employees.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(employees.map(e => e.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  /* ── Render ── */
  return (
    <div className="space-y-6">
      {/* When formOnly mode (Add Employee page), show ONLY the form */}
      {/* Breadcrumb - SmartHR style */}
      {!formOnly ? (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900 mb-1">Employees List</h2>
            <nav className="flex items-center gap-1.5 text-sm text-slate-500">
              <button onClick={() => router.push('/')} className="hover:text-green-600 transition-colors">Home</button>
              <span>/</span>
              <span className="text-slate-700 font-medium">Employees</span>
            </nav>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {/* View Toggle */}
            <div className="flex items-center border border-slate-200 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-md transition-colors ${viewMode === 'list' ? 'bg-green-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                title="List View"
              >
                <FiList className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-green-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                title="Grid View"
              >
                <FiGrid className="w-4 h-4" />
              </button>
            </div>
            {isAdmin && (
              <button onClick={handleOpenAddForm} className="inline-flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium text-sm shadow-sm transition-colors">
                <FiPlus className="w-4 h-4" />
                Add Employee
              </button>
            )}
            {isAdmin && (
              <button onClick={() => { setActiveMainTab('import'); setShowForm(false); }} className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm shadow-sm transition-colors ${activeMainTab === 'import' ? 'bg-emerald-600 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
                <FiDownload className="w-4 h-4" />
                Import from Excel
              </button>
            )}
            {activeMainTab === 'import' && (
              <button onClick={() => setActiveMainTab('list')} className="inline-flex items-center gap-2 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 font-medium text-sm transition-colors">
                <FiUsers className="w-4 h-4" />
                Back to List
              </button>
            )}
            {canOpenEmployeeSettings && (
            <button onClick={() => router.push('/employees/settings')} className="inline-flex items-center gap-2 px-4 py-2.5 border border-thb-border text-thb-text-secondary rounded-lg hover:bg-slate-50 font-medium text-sm transition-colors">
              <FiSettings className="w-4 h-4" />
              Settings
            </button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-thb-text-primary flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-green-500 to-cyan-500 flex items-center justify-center shadow-sm">
                <FiUserPlus className="w-5 h-5 text-white" />
              </div>
              Add Employee
            </h1>
            <p className="text-thb-text-secondary mt-1 ml-[46px]">Fill in the details below to create a new employee record</p>
          </div>
          <button onClick={handleCancelForm} className="inline-flex items-center gap-2 px-4 py-2.5 border border-thb-border text-thb-text-secondary rounded-xl hover:bg-slate-50 font-medium text-sm transition-all">
            <FiX className="w-4 h-4" />
            Back to Employees
          </button>
        </div>
      )}

      {/* ── Stats Row (SmartHR-style) ── */}
      {!formOnly && (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Employee */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between">
          <div className="flex items-center overflow-hidden">
            <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-white flex-shrink-0">
              <FiUsers className="w-5 h-5" />
            </div>
            <div className="ml-3 overflow-hidden">
              <p className="text-xs font-medium text-slate-500 truncate">Total Employee</p>
              <h4 className="text-2xl font-bold text-slate-900">{stats.total}</h4>
            </div>
          </div>
          <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-teal-50 text-teal-700">
            <FiUserPlus className="w-3 h-3" /> +{stats.newJoiners > 0 ? stats.newJoiners : 0}
          </span>
        </div>

        {/* Active */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between">
          <div className="flex items-center overflow-hidden">
            <div className="w-12 h-12 rounded-full bg-emerald-500 flex items-center justify-center text-white flex-shrink-0">
              <FiUserCheck className="w-5 h-5" />
            </div>
            <div className="ml-3 overflow-hidden">
              <p className="text-xs font-medium text-slate-500 truncate">Active</p>
              <h4 className="text-2xl font-bold text-emerald-600">{stats.active}</h4>
            </div>
          </div>
          <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-50 text-green-700">
            {stats.total > 0 ? Math.round((stats.active / stats.total) * 100) : 0}%
          </span>
        </div>

        {/* Inactive */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between">
          <div className="flex items-center overflow-hidden">
            <div className="w-12 h-12 rounded-full bg-red-500 flex items-center justify-center text-white flex-shrink-0">
              <FiUserX className="w-5 h-5" />
            </div>
            <div className="ml-3 overflow-hidden">
              <p className="text-xs font-medium text-slate-500 truncate">Inactive</p>
              <h4 className="text-2xl font-bold text-red-500">{stats.inactive}</h4>
            </div>
          </div>
          <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600">
            {stats.total > 0 ? Math.round((stats.inactive / stats.total) * 100) : 0}%
          </span>
        </div>

        {/* New Joiners */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between">
          <div className="flex items-center overflow-hidden">
            <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center text-white flex-shrink-0">
              <FiUserPlus className="w-5 h-5" />
            </div>
            <div className="ml-3 overflow-hidden">
              <p className="text-xs font-medium text-slate-500 truncate">New Joiners</p>
              <h4 className="text-2xl font-bold text-green-600">{stats.newJoiners}</h4>
            </div>
          </div>
          <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-teal-50 text-teal-700">
            This month
          </span>
        </div>
      </div>
      )}

      {/* Module Tips & Workflow (dashboard only - collapsible) */}
      {!formOnly && (
      <details className="group">
        <summary className="cursor-pointer flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors">
          <FiChevronRight className="w-4 h-4 transition-transform group-open:rotate-90" />
          Tips & Workflow Guide
        </summary>
        <div className="mt-3 space-y-4">
          <ModuleTips
            moduleKey="employees"
            title="Employee Tips"
            tips={employeeTips}
            userRole={user?.role}
          />
          <ModuleWorkflow
            moduleKey="employees"
            title="How to Manage Employees"
            subtitle="Follow this workflow to set up and manage your workforce"
            steps={employeeWorkflowSteps}
            accentColor="blue"
            userRole={user?.role}
          />
        </div>
      </details>
      )}

      {/* Main Tabs: List / Bulk Import + Action bar (SmartHR style - dashboard only) */}
      {!formOnly && (
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {/* Filter Bar — straight responsive grid so the filters never zigzag */}
        <div className="p-4 border-b border-slate-200">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-10 gap-3">
            {/* Search */}
            <div className="relative sm:col-span-2 lg:col-span-4">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search employees..."
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400"
              />
            </div>

            {/* Department Filter */}
            <div className="lg:col-span-2">
              <select
                value={filterDept}
                onChange={(e) => setFilterDept(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400 bg-white"
              >
                <option value="">All Departments</option>
                {(() => {
                  const seen = new Set<string>();
                  return departments.filter(d => {
                    const key = `${d.name}__${d.company?.name || ''}`;
                    if (seen.has(key)) return false;
                    seen.add(key);
                    return true;
                  }).map(d => <option key={d.id} value={d.id}>{d.name}{d.company ? ` (${d.company.name})` : ''}</option>);
                })()}
              </select>
            </div>

            {/* Designation Filter */}
            <div className="lg:col-span-2">
              <select
                value={filterDesignation}
                onChange={(e) => setFilterDesignation(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400 bg-white"
              >
                <option value="">Designation</option>
                {(() => {
                  const seen = new Set<string>();
                  return designations.filter(d => {
                    const key = `${d.title}__${d.department?.name || ''}`;
                    if (seen.has(key)) return false;
                    seen.add(key);
                    return true;
                  }).map(d => <option key={d.id} value={d.id}>{d.title}{d.department ? ` — ${d.department.name}` : ''}</option>);
                })()}
              </select>
            </div>

            {/* Status Filter */}
            <div className="lg:col-span-2">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400 bg-white"
              >
                <option value="">Select Status</option>
                <option value="active">Active</option>
                <option value="on_leave">On Leave</option>
                <option value="inactive">Inactive</option>
                <option value="terminated">Terminated</option>
                <option value="resigned">Resigned</option>
              </select>
            </div>
          </div>

          {/* Action row — Management toggle + Export, right-aligned under the filters */}
          <div className="flex items-center justify-end gap-2 mt-3">
            {/* Task 81: management members live in the Management List —
                hidden here by default, toggle to include them */}
            <button
              onClick={() => setIncludeManagement(v => !v)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border transition-colors ${
                includeManagement
                  ? 'bg-violet-50 border-violet-300 text-violet-700'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
              title="Management List members are hidden from this list by default"
            >
              <FiUserCheck className="w-3.5 h-3.5" /> {includeManagement ? 'Management shown' : 'Management hidden'}
            </button>
            {/* Export */}
            <button onClick={handleExportCSV} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors">
              <FiDownload className="w-3.5 h-3.5" /> Export
            </button>
          </div>

          {/* Active filter chips */}
          {(search || filterDept || filterDesignation || filterStatus) && (
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              {search && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-50 text-green-700 text-xs font-medium">
                  Search: &ldquo;{search}&rdquo;
                  <button onClick={() => setSearch('')} className="hover:text-green-900"><FiX className="w-3 h-3" /></button>
                </span>
              )}
              {filterDept && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-teal-50 text-teal-700 text-xs font-medium">
                  Dept: {departments.find(d => d.id === filterDept)?.name}
                  <button onClick={() => setFilterDept('')} className="hover:text-teal-900"><FiX className="w-3 h-3" /></button>
                </span>
              )}
              {filterDesignation && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-medium">
                  Role: {designations.find(d => d.id === filterDesignation)?.title}
                  <button onClick={() => setFilterDesignation('')} className="hover:text-amber-900"><FiX className="w-3 h-3" /></button>
                </span>
              )}
              {filterStatus && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium">
                  Status: {filterStatus.replace('_', ' ')}
                  <button onClick={() => setFilterStatus('')} className="hover:text-emerald-900"><FiX className="w-3 h-3" /></button>
                </span>
              )}
            </div>
          )}
        </div>
      </div>
      )}

      {/* ── Bulk Import Tab ── */}
      {!formOnly && activeMainTab === 'import' && (
        <div className="thb-card">
          <div className="p-6">
            <BulkImportTab module="employees" />
          </div>
        </div>
      )}

      {(formOnly || activeMainTab === 'list') && (<>
      {/* ── Add/Edit Employee Form ── */}
      {showForm && (
        <div id="crud-form" className="thb-card border-l-4 border-l-green-500 transition-all duration-300 ease-in-out">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-thb-text-primary">
                {editingId ? 'Edit Employee' : 'Add Employee'}
              </h2>
              <button onClick={handleCancelForm} className="p-2 rounded-lg text-thb-text-muted hover:text-thb-text-primary hover:bg-slate-100 transition-colors">
                <FiX className="w-5 h-5" />
              </button>
            </div>

            {/* Task 137 — mandatory/optional legend for the whole form */}
            <div className="flex items-center gap-4 mb-3 text-xs text-thb-text-secondary flex-wrap">
              <span className="inline-flex items-center gap-1">
                <span className="text-red-500 font-bold">*</span> Required field
              </span>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                Mandatory section
              </span>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                Optional section
              </span>
              <span className="text-thb-text-muted">Mandatory sections must be completed before the employee can be saved.</span>
            </div>

            {/* Horizontal Section Tabs */}
            <div className="flex items-center gap-1 border-b border-thb-border mb-6 overflow-x-auto pb-px -mx-1 px-1">
              {formTabs.map((tab, idx) => {
                const currentIdx = formTabs.findIndex(t => t.key === formTab);
                const isCompleted = completedSteps.has(tab.key);
                const isAccessible = idx <= currentIdx || isCompleted || idx === 0;
                return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => isAccessible && setFormTab(tab.key)}
                  disabled={!isAccessible}
                  title={tab.required ? 'Mandatory section — contains required fields' : 'Optional section'}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors shrink-0 ${
                    formTab === tab.key
                      ? 'border-green-500 text-green-600 bg-green-50'
                      : isCompleted
                        ? 'border-transparent text-green-600 hover:text-green-700 hover:border-green-300'
                        : isAccessible
                          ? 'border-transparent text-thb-text-muted hover:text-thb-text-primary hover:border-slate-300'
                          : 'border-transparent text-slate-300 cursor-not-allowed'
                  }`}
                >
                  <span className="text-base">{tab.icon}</span>
                  {tab.label}
                  {tab.required ? (
                    <span className="text-red-500 font-bold" aria-label="Mandatory section">*</span>
                  ) : (
                    <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide">Opt</span>
                  )}
                  {isCompleted && formTab !== tab.key && <span className="ml-1 text-[10px] text-green-500">✓</span>}
                </button>
                );
              })}
            </div>

            {/* Progress Bar */}
            <div className="flex items-center gap-1.5 mb-6">
              {formTabs.map((tab, idx) => (
                <div
                  key={tab.key}
                  className={`h-1 flex-1 rounded-full transition-colors ${
                    formTabs.findIndex(t => t.key === formTab) >= idx ? 'bg-green-500' : 'bg-slate-200'
                  }`}
                />
              ))}
              <span className="text-xs text-thb-text-muted ml-2 shrink-0">
                Step {formTabs.findIndex(t => t.key === formTab) + 1} of {formTabs.length}
              </span>
            </div>

            <form onSubmit={handleSubmit}>
              {/* Personal Information */}
              {formTab === 'personal' && (
                <div className="space-y-4">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="relative">
                      <div className="w-20 h-20 rounded-full border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center overflow-hidden bg-gray-50 dark:bg-gray-800">
                        {photoPreview ? (
                          <img src={photoPreview} alt="Employee" className="w-full h-full object-cover" />
                        ) : (
                          <FiUsers className="w-8 h-8 text-gray-400" />
                        )}
                      </div>
                      <label className="absolute -bottom-1 -right-1 w-7 h-7 bg-green-500 hover:bg-green-600 text-white rounded-full flex items-center justify-center cursor-pointer shadow-sm transition-colors">
                        <FiPlus className="w-3.5 h-3.5" />
                        <input type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
                      </label>
                      {photoPreview && (
                        <button type="button" onClick={() => { setPhotoPreview(null); updateForm('avatar', ''); toast.success('Image removed successfully.'); }} className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center">
                          <FiX className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Employee Photo</p>
                      <p className="text-xs text-gray-500">JPG, PNG or GIF. Max {MAX_PROFILE_PHOTO_LABEL}.</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">First Name <span className="text-red-500 font-bold">*</span></label>
                      <input type="text" value={form.firstName} onChange={e => updateForm('firstName', onlyLetters(e.target.value))} required className={`w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400 ${stepErrors.firstName ? 'border-red-400 bg-red-50' : 'border-thb-border'}`} />
                      {stepErrors.firstName && <p className="text-xs text-red-500 mt-1">{stepErrors.firstName}</p>}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Last Name <span className="text-red-500 font-bold">*</span></label>
                      <input type="text" value={form.lastName} onChange={e => updateForm('lastName', onlyLetters(e.target.value))} required className={`w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400 ${stepErrors.lastName ? 'border-red-400 bg-red-50' : 'border-thb-border'}`} />
                      {stepErrors.lastName && <p className="text-xs text-red-500 mt-1">{stepErrors.lastName}</p>}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">
                        Employee ID <span className="text-red-500 font-bold">*</span>
                        {getEmployeeCodeSettings().autoGeneration && !editingId && (
                          <span className="ml-1.5 text-[10px] font-normal text-green-500 bg-green-50 px-1.5 py-0.5 rounded">Auto-generated</span>
                        )}
                        {!getEmployeeCodeSettings().autoGeneration && !editingId && (
                          <span className="ml-1.5 text-[10px] font-normal text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">Manual</span>
                        )}
                        {editingId && !getEmployeeCodeSettings().autoGeneration && (
                          <span className="ml-1.5 text-[10px] font-normal text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">Editable</span>
                        )}
                      </label>
                      <input
                        type="text"
                        value={form.employeeId}
                        onChange={e => updateForm('employeeId', e.target.value)}
                        required
                        disabled={getEmployeeCodeSettings().autoGeneration || getEmployeeCodeSettings().dataLocked}
                        placeholder={getEmployeeCodeSettings().autoGeneration ? 'Auto-generated on save' : 'Enter employee ID'}
                        className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400 disabled:bg-slate-50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Official Email ID <span className="text-red-500 font-bold">*</span></label>
                      <input type="email" value={form.email} onChange={e => updateForm('email', e.target.value)} required disabled={getEmployeeCodeSettings().dataLocked} placeholder="e.g., yourname@company.com" className={`w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400 ${stepErrors.email ? 'border-red-400 bg-red-50' : 'border-thb-border'}`} />
                      <p className="text-[10px] text-thb-text-muted mt-0.5">Use company/official email only (no gmail, yahoo, etc.)</p>
                      {stepErrors.email && <p className="text-xs text-red-500 mt-1">{stepErrors.email}</p>}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Personal Email ID</label>
                      <input type="email" value={form.personalEmail} onChange={e => updateForm('personalEmail', e.target.value)} placeholder="e.g., yourname@gmail.com (optional)" className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
                      <p className="text-[10px] text-thb-text-muted mt-0.5">Personal email for backup contact (optional)</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Phone</label>
                      <input type="tel" value={form.phone} onChange={e => updateForm('phone', phoneInputFilter(e.target.value))} placeholder="10-digit mobile" className={`w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400 ${stepErrors.phone ? 'border-red-400 bg-red-50' : 'border-thb-border'}`} />
                      {stepErrors.phone && <p className="text-xs text-red-500 mt-1">{stepErrors.phone}</p>}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Date of Birth</label>
                      <input type="date" value={form.dateOfBirth} onChange={e => updateForm('dateOfBirth', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Original Birthday</label>
                      <input type="date" value={form.originalBirthday} onChange={e => updateForm('originalBirthday', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
                      <p className="text-[10px] text-thb-text-muted mt-0.5">Real birth date for birthday wishes — Date of Birth stays as per records</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Gender</label>
                      <select value={form.gender} onChange={e => updateForm('gender', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400">
                        <option value="">Select</option>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Marital Status</label>
                      <select value={form.maritalStatus} onChange={e => updateForm('maritalStatus', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400">
                        <option value="">Select</option>
                        <option value="single">Single</option>
                        <option value="married">Married</option>
                        <option value="divorced">Divorced</option>
                        <option value="widowed">Widowed</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Nationality</label>
                      <input type="text" value={form.nationality} onChange={e => updateForm('nationality', onlyLetters(e.target.value))} className={`w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400 ${stepErrors.nationality ? 'border-red-400 bg-red-50' : 'border-thb-border'}`} />
                      {stepErrors.nationality && <p className="text-xs text-red-500 mt-1">{stepErrors.nationality}</p>}
                    </div>
                  </div>
                  {/* Task 137 — Interests (personal) */}
                  <div className="pt-2">
                    <label className="block text-xs font-medium text-thb-text-secondary mb-1">Interests</label>
                    <input
                      type="text"
                      value={form.interests}
                      onChange={e => updateForm('interests', e.target.value)}
                      placeholder="e.g., Gardening, Music, Chess, Photography (comma-separated)"
                      className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400"
                    />
                    {(form.interests || '').trim() ? (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {form.interests.split(',').map(s => s.trim()).filter(Boolean).map((s, i) => (
                          <span key={`${s}-${i}`} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-violet-50 text-violet-700 text-xs font-medium border border-violet-200">
                            {s}
                            <button
                              type="button"
                              onClick={() => updateForm('interests', form.interests.split(',').map(x => x.trim()).filter(Boolean).filter(v => v !== s).join(', '))}
                              className="hover:text-violet-900"
                              title={`Remove ${s}`}
                            >
                              <FiX className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[10px] text-thb-text-muted mt-1">Hobbies and interests (optional) — shown on the employee profile.</p>
                    )}
                  </div>
                  <div className="flex justify-end pt-2">
                    <button type="button" onClick={handleNextStep} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-green-500 text-white text-sm font-medium hover:bg-green-600 shadow-sm transition-colors">
                      Next: Address <FiChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Address */}
              {formTab === 'address' && (
                <div className="space-y-6">
                  <div>
                    <p className="text-xs font-semibold text-thb-text-primary mb-3">Permanent Address</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="sm:col-span-2 lg:col-span-3">
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Street Address <span className="text-red-500 font-bold" title="Required">*</span></label>
                      <input type="text" value={form.address} onChange={e => updateForm('address', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">City <span className="text-red-500 font-bold" title="Required">*</span></label>
                      <input type="text" value={form.city} onChange={e => updateForm('city', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">State <span className="text-red-500 font-bold" title="Required">*</span></label>
                      <input type="text" value={form.state} onChange={e => updateForm('state', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">ZIP Code <span className="text-red-500 font-bold" title="Required">*</span></label>
                      <input type="text" value={form.zipCode} onChange={e => updateForm('zipCode', onlyDigits(e.target.value).slice(0, 6))} placeholder="6-digit PIN" className={`w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400 ${stepErrors.zipCode ? 'border-red-400 bg-red-50' : 'border-thb-border'}`} />
                      {stepErrors.zipCode && <p className="text-xs text-red-500 mt-1">{stepErrors.zipCode}</p>}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Country</label>
                      <input type="text" value={form.country} onChange={e => updateForm('country', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
                    </div>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-thb-text-primary mb-3">Current Address</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="sm:col-span-2 lg:col-span-3">
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Street Address</label>
                      <input type="text" value={form.currentAddress} onChange={e => updateForm('currentAddress', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">City</label>
                      <input type="text" value={form.currentCity} onChange={e => updateForm('currentCity', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">State</label>
                      <input type="text" value={form.currentState} onChange={e => updateForm('currentState', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">ZIP Code</label>
                      <input type="text" value={form.currentZipCode} onChange={e => updateForm('currentZipCode', onlyDigits(e.target.value).slice(0, 6))} placeholder="6-digit PIN" className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Country</label>
                      <input type="text" value={form.currentCountry} onChange={e => updateForm('currentCountry', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
                    </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <button type="button" onClick={() => setFormTab('personal')} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg border border-thb-border text-sm font-medium text-thb-text-secondary hover:bg-slate-50 transition-colors">
                      <FiChevronLeft className="w-4 h-4" /> Back
                    </button>
                    <button type="button" onClick={handleNextStep} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-green-500 text-white text-sm font-medium hover:bg-green-600 shadow-sm transition-colors">
                      Next: Employment <FiChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Employment Details */}
              {formTab === 'employment' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">
                        Company *
                        {availableCompanies.length > 1 && (
                          <span className="ml-1 text-[10px] font-normal text-thb-text-muted">({availableCompanies.length} companies)</span>
                        )}
                      </label>
                      <select
                        value={form.companyId}
                        onChange={e => {
                          updateForm('companyId', e.target.value);
                          updateForm('departmentId', '');
                          updateForm('designationId', '');
                          updateForm('branchId', '');
                          updateForm('reportingManagerId', '');
                        }}
                        className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400"
                      >
                        <option value="">Select Company</option>
                        {availableCompanies.map(c => <option key={c.id} value={c.id}>{c.name}{c.code ? ` (${c.code})` : ''}</option>)}
                      </select>
                      {availableCompanies.length <= 1 && form.companyId && (
                        <p className="text-[10px] text-thb-text-muted mt-1">Auto-assigned to your company</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Department <span className="text-red-500 font-bold">*</span></label>
                      <select value={form.departmentId} onChange={e => updateForm('departmentId', e.target.value)} required disabled={getEmployeeCodeSettings().dataLocked} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400">
                        <option value="">Select Department</option>
                        {departments.map(d => <option key={d.id} value={d.id}>{d.name}{d.company ? ` (${d.company.name})` : ''}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Designation <span className="text-red-500 font-bold">*</span></label>
                      <select value={form.designationId} onChange={e => updateForm('designationId', e.target.value)} required disabled={getEmployeeCodeSettings().dataLocked} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400">
                        <option value="">Select Designation</option>
                        {designations.map(d => <option key={d.id} value={d.id}>{d.title}{d.department ? ` — ${d.department.name}` : ''}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Branch</label>
                      <select value={form.branchId} onChange={e => updateForm('branchId', e.target.value)} disabled={getEmployeeCodeSettings().dataLocked} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400">
                        <option value="">Select Branch</option>
                        {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">
                        Reporting Manager
                        <span className="ml-1 text-[10px] font-normal text-thb-text-muted">(Approvals · notifications · org chart)</span>
                      </label>
                      <select
                        value={form.reportingManagerId}
                        onChange={e => updateForm('reportingManagerId', e.target.value)}
                        className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400"
                      >
                        <option value="">No Reporting Manager</option>
                        {allEmployees
                          .filter(e => e.status === 'active' && e.id !== editingId && (!form.companyId || !e.companyId || e.companyId === form.companyId))
                          .map(e => (
                            <option key={e.id} value={e.id}>
                              {e.firstName} {e.lastName}{e.employeeId ? ` · ${e.employeeId}` : ''}{e.designation?.title ? ` — ${e.designation.title}` : ''}
                            </option>
                          ))}
                      </select>
                      <p className="text-[10px] text-thb-text-muted mt-1">Leave approvals, workflow notifications and the org chart are routed through this person. Changing it later notifies both sides automatically.</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">
                        Role *
                        <span className="ml-1 text-[10px] font-normal text-thb-text-muted">(Determines module access & permissions)</span>
                      </label>
                      <select value={form.role} onChange={e => updateForm('role', e.target.value)} required className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400">
                        <option value="">Select Role</option>
                        <option value="ceo">CEO (Full Admin Access)</option>
                        <option value="hr_admin">HR Manager / HR Admin</option>
                        <option value="finance_admin">Finance Manager / Finance Admin</option>
                        <option value="it_admin">IT Admin</option>
                        <option value="manager">Manager</option>
                        <option value="travel_admin">Travel Admin</option>
                        <option value="crm_admin">CRM Admin</option>
                        <option value="employee">Employee (Self-Service)</option>
                      </select>
                      <p className="text-[10px] text-thb-text-muted mt-1">This role determines which menus and modules the employee can access after login</p>
                      {/* Dynamic role info box */}
                      {form.role && (
                        <div className={`mt-2 p-2.5 rounded-lg border text-xs leading-relaxed ${
                          form.role === 'hr_admin'
                            ? 'bg-green-50 border-green-200 text-green-800'
                            : form.role === 'ceo'
                            ? 'bg-violet-50 border-violet-200 text-violet-800'
                            : ['manager', 'travel_admin', 'crm_admin'].includes(form.role)
                            ? 'bg-amber-50 border-amber-200 text-amber-800'
                            : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        }`}>
                          <div className="flex items-start gap-1.5">
                            <FiShield className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${
                              ['hr_admin'].includes(form.role)
                                ? 'text-green-500'
                                : form.role === 'ceo'
                                ? 'text-violet-500'
                                : ['manager', 'travel_admin', 'crm_admin'].includes(form.role)
                                ? 'text-amber-500'
                                : 'text-emerald-500'
                            }`} />
                            <div>
                              <span className="font-semibold">
                                {form.role === 'ceo' && 'CEO Access'}
                                {form.role === 'hr_admin' && 'HR Admin Access'}
                                {form.role === 'finance_admin' && 'Finance Access'}
                                {form.role === 'it_admin' && 'IT Admin Access'}
                                {form.role === 'manager' && 'Manager Access'}
                                {form.role === 'travel_admin' && 'Travel Admin Access'}
                                {form.role === 'crm_admin' && 'CRM Admin Access'}
                                {form.role === 'employee' && 'Employee Access'}
                              </span>
                              <p className="mt-0.5 opacity-90">
                                {form.role === 'ceo' && 'Full access rights (same as Tenant Admin): every module, report, approval and setting across the tenant. The default role for people designated as Management.'}
                                {form.role === 'hr_admin' && 'Full access to HR modules: Employees, Recruitment, Onboarding, Leave, Attendance, Performance, Training, and HR policies.'}
                                {form.role === 'finance_admin' && 'Self-service access: My Profile, Leave Application, Attendance, Documents, and Helpdesk.'}
                                {form.role === 'it_admin' && 'Self-service access: My Profile, Leave Application, Attendance, Documents, and Helpdesk.'}
                                {form.role === 'manager' && 'Access to team operations: View employees, approve leaves/expenses/travel, manage performance reviews, and assign tasks.'}
                                {form.role === 'travel_admin' && 'Full access to Travel management: Travel requests, approvals, policies, and expense settlements.'}
                                {form.role === 'crm_admin' && 'Full access to CRM: Clients, vendors, CRM operations, and external relationship management.'}
                                {form.role === 'employee' && 'Self-service access: My Profile, Leave Application, Attendance, Documents, and Helpdesk.'}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Date of Joining <span className="text-red-500 font-bold">*</span></label>
                      <input type="date" value={form.dateOfJoining} onChange={e => updateForm('dateOfJoining', e.target.value)} required className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Employee Status <span className="text-red-500 font-bold">*</span></label>
                      <select value={form.employeeStatus} onChange={e => updateForm('employeeStatus', e.target.value)} disabled={getEmployeeCodeSettings().dataLocked} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400">
                        <option value="confirmed">Confirmed</option>
                        <option value="probation">Probation</option>
                        <option value="contract">Contract</option>
                        <option value="internship">Internship</option>
                        <option value="consultant">Consultant</option>
                      </select>
                      {form.employeeStatus === 'probation' && (
                        <div className="mt-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
                          <p className="text-[11px] font-medium text-amber-800">
                            <FiClock className="w-3 h-3 inline mr-1" />
                            Probation Period: 6 months (default)
                          </p>
                          {form.dateOfJoining ? (
                            <div>
                              <label className="block text-[10px] font-medium text-amber-700 mb-0.5">Probation End Date (editable)</label>
                              <input
                                type="date"
                                value={(() => {
                                  // Default = joining date + 6 months
                                  const start = new Date(form.dateOfJoining);
                                  const end = new Date(start);
                                  end.setMonth(end.getMonth() + 6);
                                  return end.toISOString().split('T')[0];
                                })()}
                                onChange={e => updateForm('probationEndDate', e.target.value)}
                                className="w-full px-2 py-1.5 rounded border border-amber-300 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                              />
                              <p className="text-[10px] text-amber-600 mt-1">
                                Start: {form.dateOfJoining} (Date of Joining). A probation review will be auto-created. HR/Admin will receive alerts 10 days before end date.
                              </p>
                            </div>
                          ) : (
                            <p className="text-[10px] text-amber-600">Select a Date of Joining to set the probation end date.</p>
                          )}
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Employee Type <span className="text-red-500 font-bold">*</span></label>
                      <select value={form.employeeType} onChange={e => updateForm('employeeType', e.target.value)} disabled={getEmployeeCodeSettings().dataLocked} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400">
                        <option value="full_time">Full Time</option>
                        <option value="part_time">Part Time</option>
                        <option value="contract">Contract</option>
                        <option value="temporary">Temporary</option>
                        <option value="consultant">Consultant</option>
                      </select>
                    </div>
                    {/* Task 76: Designate as Management — explicit selection from the employee list.
                        Flagged employees appear in Employee → Management List. */}
                    <div className="sm:col-span-2 lg:col-span-3">
                      <label className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                        getEmployeeCodeSettings().dataLocked
                          ? 'border-thb-border bg-slate-50 opacity-60 cursor-not-allowed'
                          : 'border-thb-border cursor-pointer hover:bg-emerald-50/40'
                      }`}>
                        <input
                          type="checkbox"
                          checked={form.isManagement}
                          onChange={e => {
                            const checked = e.target.checked;
                            // Task 129 — a person designated as Management without an
                            // explicit role defaults to the NEW CEO role (full tenant-admin
                            // access) instead of silently falling back to Employee.
                            if (checked && (!form.role || form.role === 'employee')) updateForm('role', 'ceo');
                            updateForm('isManagement', checked);
                          }}
                          disabled={getEmployeeCodeSettings().dataLocked}
                          className="mt-0.5 w-4 h-4 accent-emerald-600 flex-shrink-0"
                        />
                        <span>
                          <span className="flex items-center gap-1.5 text-sm font-medium text-thb-text-primary">
                            <FiUserCheck className="w-3.5 h-3.5 text-emerald-600" />
                            Designate as Management
                          </span>
                          <span className="block text-xs text-thb-text-muted mt-0.5">
                            Tick this box to designate this employee as management. Designated employees are listed separately under Employee → Management List. Use it for department heads, functional heads, and leadership staff. Without an explicit role, Management designees get the CEO role (full admin access).
                          </span>
                        </span>
                      </label>
                    </div>
                  </div>

                  {/* Task 137 — Technical Skills (feeds the admin/employee skill matrix) */}
                  <div className="pt-3 border-t border-thb-border">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <label className="block text-xs font-semibold text-thb-text-primary">Technical Skills</label>
                        <p className="text-[10px] text-thb-text-muted">Build the skill matrix — add every technology/skill with a proficiency level (optional).</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setForm(prev => ({ ...prev, skills: [...(prev.skills || []), emptySkill()] }))}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-50 text-teal-700 text-xs font-semibold border border-teal-200 hover:bg-teal-100 transition-colors"
                      >
                        <FiPlus className="w-3.5 h-3.5" /> Add Skill
                      </button>
                    </div>
                    {(form.skills || []).length === 0 ? (
                      <p className="text-xs text-thb-text-muted py-2">No skills added yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {(form.skills || []).map((sk, i) => (
                          <div key={sk.id || `skill-${i}`} className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                            <input
                              type="text"
                              value={sk.skill}
                              onChange={(e) => setForm(prev => { const rows = [...(prev.skills || [])]; rows[i] = { ...rows[i], skill: e.target.value }; return { ...prev, skills: rows }; })}
                              placeholder="e.g., React, SQL, Flutter"
                              className="flex-1 px-3 py-2 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400"
                            />
                            <select
                              value={sk.level}
                              onChange={(e) => setForm(prev => { const rows = [...(prev.skills || [])]; rows[i] = { ...rows[i], level: e.target.value }; return { ...prev, skills: rows }; })}
                              className="px-3 py-2 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400"
                            >
                              <option value="beginner">Beginner</option>
                              <option value="intermediate">Intermediate</option>
                              <option value="advanced">Advanced</option>
                              <option value="expert">Expert</option>
                            </select>
                            <input
                              type="number"
                              min="0"
                              max="50"
                              value={sk.yearsOfExp}
                              onChange={(e) => setForm(prev => { const rows = [...(prev.skills || [])]; rows[i] = { ...rows[i], yearsOfExp: e.target.value }; return { ...prev, skills: rows }; })}
                              placeholder="Years"
                              className="w-full sm:w-24 px-3 py-2 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400"
                            />
                            <button
                              type="button"
                              onClick={() => setForm(prev => ({ ...prev, skills: (prev.skills || []).filter((_, j) => j !== i) }))}
                              className="p-2 rounded-lg text-red-500 hover:bg-red-50 transition-colors self-start sm:self-auto"
                              title="Remove skill"
                            >
                              <FiTrash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <button type="button" onClick={() => setFormTab('address')} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg border border-thb-border text-sm font-medium text-thb-text-secondary hover:bg-slate-50 transition-colors">
                      <FiChevronLeft className="w-4 h-4" /> Back
                    </button>
                    <button type="button" onClick={handleNextStep} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-green-500 text-white text-sm font-medium hover:bg-green-600 shadow-sm transition-colors">
                      Next: Bank & Finance <FiChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Bank & Financial Details */}
              {formTab === 'bank' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Bank Name <span className="text-red-500 font-bold" title="Required">*</span></label>
                      <input type="text" value={form.bankName} onChange={e => updateForm('bankName', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Bank Account No <span className="text-red-500 font-bold" title="Required">*</span></label>
                      <input type="text" value={form.bankAccountNo} onChange={e => updateForm('bankAccountNo', onlyDigits(e.target.value).slice(0, 18))} placeholder="9-18 digits" className={`w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400 ${stepErrors.bankAccountNo ? 'border-red-400 bg-red-50' : 'border-thb-border'}`} />
                      {stepErrors.bankAccountNo && <p className="text-xs text-red-500 mt-1">{stepErrors.bankAccountNo}</p>}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">IFSC Code <span className="text-red-500 font-bold" title="Required">*</span></label>
                      <input type="text" value={form.bankIfscCode} onChange={e => updateForm('bankIfscCode', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11))} placeholder="e.g., SBIN0001234" className={`w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400 ${stepErrors.bankIfscCode ? 'border-red-400 bg-red-50' : 'border-thb-border'}`} />
                      {stepErrors.bankIfscCode && <p className="text-xs text-red-500 mt-1">{stepErrors.bankIfscCode}</p>}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">PAN Number</label>
                      <input type="text" value={form.panNumber} onChange={e => updateForm('panNumber', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))} placeholder="e.g., ABCDE1234F" className={`w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400 ${stepErrors.panNumber ? 'border-red-400 bg-red-50' : 'border-thb-border'}`} />
                      {stepErrors.panNumber && <p className="text-xs text-red-500 mt-1">{stepErrors.panNumber}</p>}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Aadhaar Number</label>
                      <input type="text" value={form.aadhaarNumber} onChange={e => updateForm('aadhaarNumber', onlyDigits(e.target.value).slice(0, 12))} placeholder="12-digit UID" className={`w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400 ${stepErrors.aadhaarNumber ? 'border-red-400 bg-red-50' : 'border-thb-border'}`} />
                      {stepErrors.aadhaarNumber && <p className="text-xs text-red-500 mt-1">{stepErrors.aadhaarNumber}</p>}
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <button type="button" onClick={() => setFormTab('employment')} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg border border-thb-border text-sm font-medium text-thb-text-secondary hover:bg-slate-50 transition-colors">
                      <FiChevronLeft className="w-4 h-4" /> Back
                    </button>
                    <button type="button" onClick={handleNextStep} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-green-500 text-white text-sm font-medium hover:bg-green-600 shadow-sm transition-colors">
                      Next: Statutory <FiChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Statutory Details */}
              {formTab === 'statutory' && (
                <div className="space-y-4">
                  {/* PF Details */}
                  <div>
                    <h4 className="text-xs font-semibold text-thb-text-muted uppercase tracking-wider mb-3">Provident Fund (PF)</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-thb-text-secondary mb-1">PF Number</label>
                        <input type="text" value={form.pfNumber} onChange={e => updateForm('pfNumber', e.target.value.replace(/[^A-Za-z0-9\/\-]/g, '').slice(0, 25))} placeholder="e.g., PF/MH/12345/678" className={`w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400 ${stepErrors.pfNumber ? 'border-red-400 bg-red-50' : 'border-thb-border'}`} />
                      {stepErrors.pfNumber && <p className="text-xs text-red-500 mt-1">{stepErrors.pfNumber}</p>}
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-thb-text-secondary mb-1">UAN Number</label>
                        <input type="text" value={form.pfUAN} onChange={e => updateForm('pfUAN', onlyDigits(e.target.value).slice(0, 12))} placeholder="12-digit UAN" className={`w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400 ${stepErrors.pfUAN ? 'border-red-400 bg-red-50' : 'border-thb-border'}`} />
                      {stepErrors.pfUAN && <p className="text-xs text-red-500 mt-1">{stepErrors.pfUAN}</p>}
                      </div>
                    </div>
                  </div>
                  {/* PF Nomination */}
                  <div className="pt-3 border-t border-thb-border/50">
                    <h4 className="text-xs font-semibold text-thb-text-muted uppercase tracking-wider mb-3">PF Nomination Details</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-thb-text-secondary mb-1">Nominee Name</label>
                        <input type="text" value={form.pfNomineeName} onChange={e => updateForm('pfNomineeName', e.target.value.replace(/[^A-Za-z\s.'-]/g, ''))} placeholder="Full name of nominee" className={`w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400 ${stepErrors.pfNomineeName ? 'border-red-400 bg-red-50' : 'border-thb-border'}`} />
                        {stepErrors.pfNomineeName && <p className="text-xs text-red-500 mt-1">{stepErrors.pfNomineeName}</p>}
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-thb-text-secondary mb-1">Nominee Relationship</label>
                        <select value={form.pfNomineeRelation} onChange={e => updateForm('pfNomineeRelation', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400">
                          <option value="">Select</option>
                          <option value="spouse">Spouse</option>
                          <option value="father">Father</option>
                          <option value="mother">Mother</option>
                          <option value="son">Son</option>
                          <option value="daughter">Daughter</option>
                          <option value="brother">Brother</option>
                          <option value="sister">Sister</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-thb-text-secondary mb-1">Nomination Percentage</label>
                        <input type="number" min="0" max="100" value={form.pfNomineePercentage} onChange={e => updateForm('pfNomineePercentage', e.target.value)} placeholder="e.g., 100" className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
                      </div>
                    </div>
                  </div>
                  {/* ESI Details */}
                  <div className="pt-3 border-t border-thb-border/50">
                    <h4 className="text-xs font-semibold text-thb-text-muted uppercase tracking-wider mb-3">Employee State Insurance (ESI)</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-thb-text-secondary mb-1">ESI Number</label>
                        <input type="text" value={form.esiNumber} onChange={e => updateForm('esiNumber', e.target.value.replace(/[^0-9\-]/g, '').slice(0, 25))} placeholder="e.g., 31-00-123456-000-0001" className={`w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400 ${stepErrors.esiNumber ? 'border-red-400 bg-red-50' : 'border-thb-border'}`} />
                      {stepErrors.esiNumber && <p className="text-xs text-red-500 mt-1">{stepErrors.esiNumber}</p>}
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-thb-text-secondary mb-1">ESI Dispensary</label>
                        <input type="text" value={form.esiDispensary} onChange={e => updateForm('esiDispensary', e.target.value)} placeholder="Assigned dispensary name" className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
                      </div>
                    </div>
                  </div>
                  {/* ESI Nomination */}
                  <div className="pt-3 border-t border-thb-border/50">
                    <h4 className="text-xs font-semibold text-thb-text-muted uppercase tracking-wider mb-3">ESI Nomination Details</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-thb-text-secondary mb-1">Nominee Name</label>
                        <input type="text" value={form.esiNomineeName} onChange={e => updateForm('esiNomineeName', e.target.value)} placeholder="Full name of nominee" className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-thb-text-secondary mb-1">Nominee Relationship</label>
                        <select value={form.esiNomineeRelation} onChange={e => updateForm('esiNomineeRelation', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400">
                          <option value="">Select</option>
                          <option value="spouse">Spouse</option>
                          <option value="father">Father</option>
                          <option value="mother">Mother</option>
                          <option value="son">Son</option>
                          <option value="daughter">Daughter</option>
                          <option value="brother">Brother</option>
                          <option value="sister">Sister</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                    </div>
                  </div>
                  {/* Other Statutory */}
                  <div className="pt-3 border-t border-thb-border/50">
                    <h4 className="text-xs font-semibold text-thb-text-muted uppercase tracking-wider mb-3">Other Statutory</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-thb-text-secondary mb-1">Professional Tax Number</label>
                        <input type="text" value={form.professionalTaxNumber} onChange={e => updateForm('professionalTaxNumber', e.target.value)} placeholder="PT registration number" className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-thb-text-secondary mb-1">LWF Number</label>
                        <input type="text" value={form.lwfNumber} onChange={e => updateForm('lwfNumber', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="State registration number" className={`w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400 ${stepErrors.lwfNumber ? 'border-red-400 bg-red-50' : 'border-thb-border'}`} />
                        {stepErrors.lwfNumber && <p className="text-xs text-red-500 mt-1">{stepErrors.lwfNumber}</p>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <button type="button" onClick={() => setFormTab('bank')} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg border border-thb-border text-sm font-medium text-thb-text-secondary hover:bg-slate-50 transition-colors">
                      <FiChevronLeft className="w-4 h-4" /> Back
                    </button>
                    <button type="button" onClick={handleNextStep} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-green-500 text-white text-sm font-medium hover:bg-green-600 shadow-sm transition-colors">
                      Next: Emergency <FiChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Emergency Contact */}
              {formTab === 'emergency' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Emergency Contact Name <span className="text-red-500 font-bold" title="Required">*</span></label>
                      <input type="text" value={form.emergencyContactName} onChange={e => updateForm('emergencyContactName', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Emergency Contact Phone <span className="text-red-500 font-bold" title="Required">*</span></label>
                      <input type="tel" value={form.emergencyContactPhone} onChange={e => updateForm('emergencyContactPhone', phoneInputFilter(e.target.value))} placeholder="10-digit mobile" className={`w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400 ${stepErrors.emergencyContactPhone ? 'border-red-400 bg-red-50' : 'border-thb-border'}`} />
                      {stepErrors.emergencyContactPhone && <p className="text-xs text-red-500 mt-1">{stepErrors.emergencyContactPhone}</p>}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Relationship</label>
                      <select value={form.emergencyContactRelation} onChange={e => updateForm('emergencyContactRelation', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400">
                        <option value="">Select</option>
                        <option value="spouse">Spouse</option>
                        <option value="father">Father</option>
                        <option value="mother">Mother</option>
                        <option value="son">Son</option>
                        <option value="daughter">Daughter</option>
                        <option value="brother">Brother</option>
                        <option value="sister">Sister</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <button type="button" onClick={() => setFormTab('statutory')} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg border border-thb-border text-sm font-medium text-thb-text-secondary hover:bg-slate-50 transition-colors">
                      <FiChevronLeft className="w-4 h-4" /> Back
                    </button>
                    <button type="button" onClick={handleNextStep} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-green-500 text-white text-sm font-medium hover:bg-green-600 shadow-sm transition-colors">
                      Next: Health <FiChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Health History Questionnaire */}
              {formTab === 'health' && (
                <div className="space-y-4">
                  <p className="text-xs text-thb-text-muted">Capture employee health information for workplace safety and emergency preparedness. All fields are optional and confidential.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Blood Group <span className="text-red-500 font-bold" title="Required">*</span></label>
                      <select value={form.bloodGroup} onChange={e => updateForm('bloodGroup', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400">
                        <option value="">Select</option>
                        <option value="A+">A+</option><option value="A-">A-</option>
                        <option value="B+">B+</option><option value="B-">B-</option>
                        <option value="AB+">AB+</option><option value="AB-">AB-</option>
                        <option value="O+">O+</option><option value="O-">O-</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Has Chronic Illness?</label>
                      <select value={form.hasChronicIllness} onChange={e => updateForm('hasChronicIllness', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400">
                        <option value="">Select</option>
                        <option value="no">No</option>
                        <option value="yes">Yes</option>
                      </select>
                    </div>
                    {form.hasChronicIllness === 'yes' && (
                      <div>
                        <label className="block text-xs font-medium text-thb-text-secondary mb-1">Chronic Illness Details</label>
                        <input type="text" value={form.chronicIllnessDetails} onChange={e => updateForm('chronicIllnessDetails', e.target.value)} placeholder="Describe the condition" className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Has Allergies?</label>
                      <select value={form.hasAllergies} onChange={e => updateForm('hasAllergies', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400">
                        <option value="">Select</option>
                        <option value="no">No</option>
                        <option value="yes">Yes</option>
                      </select>
                    </div>
                    {form.hasAllergies === 'yes' && (
                      <div>
                        <label className="block text-xs font-medium text-thb-text-secondary mb-1">Allergy Details</label>
                        <input type="text" value={form.allergyDetails} onChange={e => updateForm('allergyDetails', e.target.value)} placeholder="List allergies" className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Has Disability?</label>
                      <select value={form.hasDisability} onChange={e => updateForm('hasDisability', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400">
                        <option value="">Select</option>
                        <option value="no">No</option>
                        <option value="yes">Yes</option>
                      </select>
                    </div>
                    {form.hasDisability === 'yes' && (
                      <div>
                        <label className="block text-xs font-medium text-thb-text-secondary mb-1">Disability Details</label>
                        <input type="text" value={form.disabilityDetails} onChange={e => updateForm('disabilityDetails', e.target.value)} placeholder="Nature of disability" className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">On Medication?</label>
                      <select value={form.isOnMedication} onChange={e => updateForm('isOnMedication', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400">
                        <option value="">Select</option>
                        <option value="no">No</option>
                        <option value="yes">Yes</option>
                      </select>
                    </div>
                    {form.isOnMedication === 'yes' && (
                      <div>
                        <label className="block text-xs font-medium text-thb-text-secondary mb-1">Medication Details</label>
                        <input type="text" value={form.medicationDetails} onChange={e => updateForm('medicationDetails', e.target.value)} placeholder="Current medications" className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Has Had Surgery?</label>
                      <select value={form.hasHadSurgery} onChange={e => updateForm('hasHadSurgery', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400">
                        <option value="">Select</option>
                        <option value="no">No</option>
                        <option value="yes">Yes</option>
                      </select>
                    </div>
                    {form.hasHadSurgery === 'yes' && (
                      <div>
                        <label className="block text-xs font-medium text-thb-text-secondary mb-1">Surgery Details</label>
                        <input type="text" value={form.surgeryDetails} onChange={e => updateForm('surgeryDetails', e.target.value)} placeholder="Surgery details" className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
                      </div>
                    )}
                  </div>
                  <div className="pt-3 border-t border-thb-border/50">
                    <h4 className="text-xs font-semibold text-thb-text-muted uppercase tracking-wider mb-3">Insurance</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-thb-text-secondary mb-1">Emergency Medical Condition</label>
                        <input type="text" value={form.emergencyMedicalCondition} onChange={e => updateForm('emergencyMedicalCondition', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-thb-text-secondary mb-1">Primary Physician Name</label>
                        <input type="text" value={form.primaryPhysicianName} onChange={e => updateForm('primaryPhysicianName', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-thb-text-secondary mb-1">Primary Physician Phone</label>
                        <input type="tel" value={form.primaryPhysicianPhone} onChange={e => updateForm('primaryPhysicianPhone', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-thb-text-secondary mb-1">Insurance Provider</label>
                        <input type="text" value={form.healthInsuranceProvider} onChange={e => updateForm('healthInsuranceProvider', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-thb-text-secondary mb-1">Insurance Policy No</label>
                        <input type="text" value={form.healthInsurancePolicyNo} onChange={e => updateForm('healthInsurancePolicyNo', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
                      </div>
                    </div>

                    {/* Task 137 — Family Details for medical insurance cover */}
                    <div className="mt-5">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <h5 className="text-xs font-semibold text-thb-text-primary">Family Details (Medical Insurance)</h5>
                          <p className="text-[10px] text-thb-text-muted">Members to be covered under the medical insurance policy — spouse, children, parents, etc.</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setForm(prev => ({ ...prev, dependents: [...(prev.dependents || []), emptyDependent()] }))}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-50 text-rose-700 text-xs font-semibold border border-rose-200 hover:bg-rose-100 transition-colors"
                        >
                          <FiPlus className="w-3.5 h-3.5" /> Add Family Member
                        </button>
                      </div>
                      {(form.dependents || []).length === 0 ? (
                        <p className="text-xs text-thb-text-muted py-2">No family members added yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {(form.dependents || []).map((dep, i) => (
                            <div key={dep.id || `dep-${i}`} className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-center p-2.5 rounded-lg border border-thb-border bg-slate-50/60">
                              <input
                                type="text"
                                value={dep.name}
                                onChange={(e) => setForm(prev => { const rows = [...(prev.dependents || [])]; rows[i] = { ...rows[i], name: e.target.value }; return { ...prev, dependents: rows }; })}
                                placeholder="Full name"
                                className="px-3 py-2 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-400"
                              />
                              <select
                                value={dep.relation}
                                onChange={(e) => setForm(prev => { const rows = [...(prev.dependents || [])]; rows[i] = { ...rows[i], relation: e.target.value }; return { ...prev, dependents: rows }; })}
                                className="px-3 py-2 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-400"
                              >
                                <option value="">Relationship</option>
                                <option value="spouse">Spouse</option>
                                <option value="son">Son</option>
                                <option value="daughter">Daughter</option>
                                <option value="father">Father</option>
                                <option value="mother">Mother</option>
                                <option value="other">Other</option>
                              </select>
                              <input
                                type="date"
                                value={dep.dateOfBirth}
                                onChange={(e) => setForm(prev => { const rows = [...(prev.dependents || [])]; rows[i] = { ...rows[i], dateOfBirth: e.target.value }; return { ...prev, dependents: rows }; })}
                                className="px-3 py-2 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-400"
                                title="Date of birth (for insurance cover)"
                              />
                              <div className="flex items-center gap-2">
                                <select
                                  value={dep.gender || ''}
                                  onChange={(e) => setForm(prev => { const rows = [...(prev.dependents || [])]; rows[i] = { ...rows[i], gender: e.target.value }; return { ...prev, dependents: rows }; })}
                                  className="flex-1 px-3 py-2 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-400"
                                >
                                  <option value="">Gender</option>
                                  <option value="male">Male</option>
                                  <option value="female">Female</option>
                                  <option value="other">Other</option>
                                </select>
                                <button
                                  type="button"
                                  onClick={() => setForm(prev => ({ ...prev, dependents: (prev.dependents || []).filter((_, j) => j !== i) }))}
                                  className="p-2 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                                  title="Remove family member"
                                >
                                  <FiTrash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <button type="button" onClick={() => setFormTab('emergency')} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg border border-thb-border text-sm font-medium text-thb-text-secondary hover:bg-slate-50 transition-colors">
                      <FiChevronLeft className="w-4 h-4" /> Back
                    </button>
                    <button type="button" onClick={handleNextStep} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-green-500 text-white text-sm font-medium hover:bg-green-600 shadow-sm transition-colors">
                      Next: Overseas <FiChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Overseas Details */}
              {formTab === 'overseas' && (
                <div className="space-y-4">
                  <p className="text-xs text-thb-text-muted">Applicable for employees with foreign citizenship, travel history, or international work assignments.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Foreign Citizenship?</label>
                      <select value={form.hasForeignCitizenship} onChange={e => updateForm('hasForeignCitizenship', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400">
                        <option value="">Select</option>
                        <option value="no">No</option>
                        <option value="yes">Yes</option>
                      </select>
                    </div>
                    {form.hasForeignCitizenship === 'yes' && (
                      <div>
                        <label className="block text-xs font-medium text-thb-text-secondary mb-1">Citizenship Country</label>
                        <input type="text" value={form.foreignCitizenshipCountry} onChange={e => updateForm('foreignCitizenshipCountry', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Foreign Passport Number</label>
                      <input type="text" value={form.foreignPassportNumber} onChange={e => updateForm('foreignPassportNumber', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Foreign Passport Expiry</label>
                      <input type="date" value={form.foreignPassportExpiry} onChange={e => updateForm('foreignPassportExpiry', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Foreign Sojourn?</label>
                      <select value={form.hasForeignSojourn} onChange={e => updateForm('hasForeignSojourn', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400">
                        <option value="">Select</option>
                        <option value="no">No</option>
                        <option value="yes">Yes</option>
                      </select>
                    </div>
                    {form.hasForeignSojourn === 'yes' && (
                      <>
                        <div>
                          <label className="block text-xs font-medium text-thb-text-secondary mb-1">Sojourn Country</label>
                          <input type="text" value={form.foreignSojournCountry} onChange={e => updateForm('foreignSojournCountry', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-thb-text-secondary mb-1">Sojourn Purpose</label>
                          <input type="text" value={form.foreignSojournPurpose} onChange={e => updateForm('foreignSojournPurpose', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-thb-text-secondary mb-1">Sojourn Duration</label>
                          <input type="text" value={form.foreignSojournDuration} onChange={e => updateForm('foreignSojournDuration', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
                        </div>
                      </>
                    )}
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Has Visa?</label>
                      <select value={form.hasVisa} onChange={e => updateForm('hasVisa', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400">
                        <option value="">Select</option>
                        <option value="no">No</option>
                        <option value="yes">Yes</option>
                      </select>
                    </div>
                    {form.hasVisa === 'yes' && (
                      <>
                        <div>
                          <label className="block text-xs font-medium text-thb-text-secondary mb-1">Visa Type</label>
                          <input type="text" value={form.visaType} onChange={e => updateForm('visaType', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-thb-text-secondary mb-1">Visa Country</label>
                          <input type="text" value={form.visaCountry} onChange={e => updateForm('visaCountry', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-thb-text-secondary mb-1">Visa Expiry</label>
                          <input type="date" value={form.visaExpiry} onChange={e => updateForm('visaExpiry', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
                        </div>
                      </>
                    )}
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Intl Driving License?</label>
                      <select value={form.hasIntlDrivingLicense} onChange={e => updateForm('hasIntlDrivingLicense', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400">
                        <option value="">Select</option>
                        <option value="no">No</option>
                        <option value="yes">Yes</option>
                      </select>
                    </div>
                    {form.hasIntlDrivingLicense === 'yes' && (
                      <>
                        <div>
                          <label className="block text-xs font-medium text-thb-text-secondary mb-1">License Country</label>
                          <input type="text" value={form.intlDrivingLicenseCountry} onChange={e => updateForm('intlDrivingLicenseCountry', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-thb-text-secondary mb-1">License Expiry</label>
                          <input type="date" value={form.intlDrivingLicenseExpiry} onChange={e => updateForm('intlDrivingLicenseExpiry', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
                        </div>
                      </>
                    )}
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <button type="button" onClick={() => setFormTab('health')} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg border border-thb-border text-sm font-medium text-thb-text-secondary hover:bg-slate-50 transition-colors">
                      <FiChevronLeft className="w-4 h-4" /> Back
                    </button>
                    <button type="button" onClick={handleNextStep} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-green-500 text-white text-sm font-medium hover:bg-green-600 shadow-sm transition-colors">
                      Next: Experience <FiChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Task 137 — Experience: dynamic entries (was: static 3 slots) */}
              {formTab === 'experience' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-semibold text-thb-text-muted uppercase tracking-wider">Previous Experience</h4>
                      <p className="text-[10px] text-thb-text-muted mt-0.5">Add as many entries as the employee's real career history — no limit. Company logos are picked automatically from the web.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setForm(prev => ({ ...prev, experiences: [...(prev.experiences || []), emptyExperience()] }))}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 text-xs font-semibold border border-amber-200 hover:bg-amber-100 transition-colors"
                    >
                      <FiPlus className="w-3.5 h-3.5" /> Add Experience
                    </button>
                  </div>

                  {(form.experiences || []).length === 0 ? (
                    <p className="text-xs text-thb-text-muted py-3">No previous experience added. Click "Add Experience" for every prior employer.</p>
                  ) : (
                    <div className="space-y-3">
                      {(form.experiences || []).map((exp, i) => {
                        const dur = exp.fromDate ? experienceDuration(exp.fromDate, exp.isCurrent ? null : (exp.toDate || null)) : '';
                        return (
                        <div key={exp.id || `exp-${i}`} className="p-4 rounded-xl border border-thb-border bg-slate-50/60 space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-11 h-11 rounded-lg bg-white border border-thb-border flex items-center justify-center overflow-hidden flex-shrink-0">
                                {exp.companyLogo ? (
                                  <img src={exp.companyLogo} alt={exp.company || 'Company'} className="w-8 h-8 object-contain" />
                                ) : (
                                  <FiBriefcase className="w-5 h-5 text-slate-300" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-thb-text-primary truncate">{exp.company || `Experience ${i + 1}`}</p>
                                <p className="text-xs text-thb-text-muted truncate">
                                  {exp.designation || 'Designation'}
                                  {dur ? ` · ${dur}` : ''}
                                  {exp.isCurrent ? ' · Current' : ''}
                                </p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setForm(prev => ({ ...prev, experiences: (prev.experiences || []).filter((_, j) => j !== i) }))}
                              className="p-2 rounded-lg text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
                              title="Remove experience"
                            >
                              <FiTrash2 className="w-4 h-4" />
                            </button>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-thb-text-secondary mb-1">Previous Employer <span className="text-red-500 font-bold">*</span></label>
                              <div className="flex gap-1.5">
                                {/* Requirement: External Company Search and Logo Integration.
                                    CompanyNameAutocomplete fetches matching companies from
                                    an EXTERNAL directory (Wikipedia + Clearbit) via
                                    /api/company-search. When a company is selected:
                                    - The company name is auto-populated (onChange).
                                    - The logo URL is auto-populated (onSelectLogo).
                                    When "Other" is selected, the logo URL is cleared
                                    (onSelectLogo(null)) and no logo is fetched. */}
                                <CompanyNameAutocomplete
                                  value={exp.company}
                                  onChange={(val) => setForm(prev => { const rows = [...(prev.experiences || [])]; rows[i] = { ...rows[i], company: val }; return { ...prev, experiences: rows }; })}
                                  onSelectLogo={(logoUrl) => setForm(prev => { const rows = [...(prev.experiences || [])]; rows[i] = { ...rows[i], companyLogo: logoUrl || '' }; return { ...prev, experiences: rows }; })}
                                  onBlur={() => autoFetchExperienceLogo(i, exp.company)}
                                  placeholder="e.g., Infosys or Microsoft"
                                  required
                                  className="flex-1"
                                />
                                <button
                                  type="button"
                                  onClick={() => autoFetchExperienceLogo(i, exp.company)}
                                  disabled={logoFetching.has(i) || !exp.company.trim()}
                                  className="p-2 rounded-lg border border-thb-border text-thb-text-secondary hover:bg-white transition-colors disabled:opacity-40"
                                  title="Auto-pick company logo from the web"
                                >
                                  <FiRefreshCw className={`w-4 h-4 ${logoFetching.has(i) ? 'animate-spin' : ''}`} />
                                </button>
                              </div>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-thb-text-secondary mb-1">Designation <span className="text-red-500 font-bold">*</span></label>
                              <input
                                type="text"
                                value={exp.designation}
                                onChange={(e) => setForm(prev => { const rows = [...(prev.experiences || [])]; rows[i] = { ...rows[i], designation: e.target.value }; return { ...prev, experiences: rows }; })}
                                placeholder="e.g., Senior Software Engineer"
                                className="w-full px-3 py-2 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400"
                              />
                            </div>
                            {/* <div>
                              <label className="block text-xs font-medium text-thb-text-secondary mb-1">Company Logo URL</label>

                              <input
                                type="text"
                                value={exp.companyLogo}
                                onChange={(e) => setForm(prev => { const rows = [...(prev.experiences || [])]; rows[i] = { ...rows[i], companyLogo: e.target.value }; return { ...prev, experiences: rows }; })}
                                className="w-full px-3 py-2 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400"
                              />
                            </div> */}
                            <div>
                              <label className="block text-xs font-medium text-thb-text-secondary mb-1">From Date <span className="text-red-500 font-bold">*</span></label>
                              <input
                                type="date"
                                value={exp.fromDate}
                                onChange={(e) => setForm(prev => { const rows = [...(prev.experiences || [])]; rows[i] = { ...rows[i], fromDate: e.target.value }; return { ...prev, experiences: rows }; })}
                                className="w-full px-3 py-2 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-thb-text-secondary mb-1">To Date</label>
                              <input
                                type="date"
                                value={exp.toDate}
                                disabled={exp.isCurrent}
                                onChange={(e) => setForm(prev => { const rows = [...(prev.experiences || [])]; rows[i] = { ...rows[i], toDate: e.target.value }; return { ...prev, experiences: rows }; })}
                                className="w-full px-3 py-2 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 disabled:bg-slate-100"
                              />
                              <label className="flex items-center gap-1.5 mt-1.5 text-[11px] text-thb-text-secondary cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={exp.isCurrent}
                                  onChange={(e) => setForm(prev => { const rows = [...(prev.experiences || [])]; rows[i] = { ...rows[i], isCurrent: e.target.checked, toDate: e.target.checked ? '' : rows[i].toDate }; return { ...prev, experiences: rows }; })}
                                  className="w-3.5 h-3.5 accent-amber-600"
                                />
                                Currently working here
                              </label>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-thb-text-secondary mb-1">Company Category</label>
                              <select
                                value={exp.companyCategory}
                                onChange={(e) => setForm(prev => { const rows = [...(prev.experiences || [])]; rows[i] = { ...rows[i], companyCategory: e.target.value }; return { ...prev, experiences: rows }; })}
                                className="w-full px-3 py-2 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400"
                              >
                                {COMPANY_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-thb-text-secondary mb-1">Company Level</label>
                              <select
                                value={exp.companyLevel}
                                onChange={(e) => setForm(prev => { const rows = [...(prev.experiences || [])]; rows[i] = { ...rows[i], companyLevel: e.target.value }; return { ...prev, experiences: rows }; })}
                                className="w-full px-3 py-2 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400"
                              >
                                {COMPANY_LEVELS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                              </select>
                            </div>
                            <div className="sm:col-span-2">
                              <label className="block text-xs font-medium text-thb-text-secondary mb-1">Reason for Leaving</label>
                              <input
                                type="text"
                                value={exp.description}
                                onChange={(e) => setForm(prev => { const rows = [...(prev.experiences || [])]; rows[i] = { ...rows[i], description: e.target.value }; return { ...prev, experiences: rows }; })}
                                placeholder="Optional — why did you leave?"
                                className="w-full px-3 py-2 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400"
                              />
                            </div>
                          </div>

                          {/* Task 138 — domains worked (multi-select) */}
                          <div>
                            <p className="text-[10px] font-semibold text-thb-text-muted uppercase tracking-wider mb-1.5">Domains worked in <span className="normal-case font-normal">(select all that apply)</span></p>
                            <div className="flex flex-wrap gap-1.5">
                              {EXPERIENCE_DOMAINS.map((d) => {
                                const active = (exp.domains || []).includes(d);
                                return (
                                  <button
                                    key={d}
                                    type="button"
                                    onClick={() => toggleExperienceDomain(i, d)}
                                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${active ? 'bg-amber-100 border-amber-300 text-amber-800' : 'bg-white border-thb-border text-thb-text-muted hover:border-amber-200'}`}
                                  >
                                    {active ? '\u2713 ' : ''}{d}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* Task 138 — letters from this company (offer / relieving / …) */}
                          <div className="space-y-2">
                            <p className="text-[10px] font-semibold text-thb-text-muted uppercase tracking-wider">Letters from this company <span className="normal-case font-normal">(offer letter, relieving letter, appraisal…)</span></p>
                            {(exp.letters || []).length > 0 && (
                              <div className="space-y-1.5">
                                {(exp.letters || []).map((l, li) => (
                                  <div key={li} className="flex items-center gap-2 text-xs bg-white border border-thb-border rounded-lg px-2.5 py-1.5">
                                    <FiFileText className="w-3.5 h-3.5 text-teal-500 flex-shrink-0" />
                                    <span className="font-semibold text-thb-text-primary flex-shrink-0">{EXPERIENCE_LETTER_LABELS[l.type] || 'Letter'}</span>
                                    <span className="truncate text-thb-text-secondary flex-1">{l.name}</span>
                                    <button
                                      type="button"
                                      onClick={() => removeExperienceLetter(i, li)}
                                      className="p-1 rounded text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
                                      title="Remove letter"
                                    >
                                      <FiTrash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                            <div className="flex items-center gap-2 flex-wrap">
                              <select
                                value={exp.letterType || 'offer_letter'}
                                onChange={(e) => setForm(prev => { const rows = [...(prev.experiences || [])]; rows[i] = { ...rows[i], letterType: e.target.value }; return { ...prev, experiences: rows }; })}
                                className="px-2.5 py-1.5 rounded-lg border border-thb-border text-xs bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                              >
                                {EXPERIENCE_LETTER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                              </select>
                              <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-700 text-xs font-semibold hover:bg-amber-100 transition-colors">
                                <FiPaperclip className="w-3.5 h-3.5" /> Attach letter (PDF, max 3MB)
                                <input type="file" className="hidden" accept=".pdf,application/pdf" onChange={(e) => handleExperienceLetterPick(i, e)} />
                              </label>
                            </div>
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="pt-3 border-t border-thb-border/50 grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Total Experience</label>
                      <input type="text" value={form.totalExperience} onChange={e => updateForm('totalExperience', e.target.value)} placeholder="e.g., 5 years" className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
                      <p className="text-[10px] text-thb-text-muted mt-1">
                        {(() => {
                          const yrs = totalExperienceYears((form.experiences || []).filter(x => x.company.trim() && x.designation.trim() && x.fromDate && (x.isCurrent || x.toDate)));
                          return yrs > 0 ? `Computed from the entries above: ${yrs} yr${yrs === 1 ? '' : 's'} (overrides this field when shown)` : 'Leave blank to compute from the entries above';
                        })()}
                      </p>
                    </div>
                  </div>

                  {/* Task 138 — Achievements (previous company experience or any other) */}
                  <div className="pt-4 border-t border-thb-border/50 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-semibold text-thb-text-muted uppercase tracking-wider">Achievements</h4>
                        <p className="text-[10px] text-thb-text-muted mt-0.5">Awards, certifications and recognitions from the previous company experience or any other source.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setForm(prev => ({ ...prev, achievements: [...(prev.achievements || []), emptyAchievement()] }))}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-50 text-violet-700 text-xs font-semibold border border-violet-200 hover:bg-violet-100 transition-colors"
                      >
                        <FiPlus className="w-3.5 h-3.5" /> Add Achievement
                      </button>
                    </div>

                    {(form.achievements || []).length === 0 ? (
                      <p className="text-xs text-thb-text-muted py-2">No achievements added yet.</p>
                    ) : (
                      <div className="space-y-3">
                        {(form.achievements || []).map((a, ai) => (
                          <div key={a.id || `ach-${ai}`} className="p-4 rounded-xl border border-violet-100 bg-violet-50/40 space-y-3">
                            <div className="flex items-start justify-between gap-3">
                              <p className="text-sm font-semibold text-thb-text-primary truncate">{a.title || `Achievement ${ai + 1}`}</p>
                              <button
                                type="button"
                                onClick={() => setForm(prev => ({ ...prev, achievements: (prev.achievements || []).filter((_, j) => j !== ai) }))}
                                className="p-2 rounded-lg text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
                                title="Remove achievement"
                              >
                                <FiTrash2 className="w-4 h-4" />
                              </button>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                              <div>
                                <label className="block text-xs font-medium text-thb-text-secondary mb-1">Title <span className="text-red-500 font-bold">*</span></label>
                                <input
                                  type="text"
                                  value={a.title}
                                  onChange={(e) => setForm(prev => { const rows = [...(prev.achievements || [])]; rows[ai] = { ...rows[ai], title: e.target.value }; return { ...prev, achievements: rows }; })}
                                  placeholder="e.g., Star Performer of the Year"
                                  className="w-full px-3 py-2 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-thb-text-secondary mb-1">Category</label>
                                <select
                                  value={a.category}
                                  onChange={(e) => setForm(prev => { const rows = [...(prev.achievements || [])]; rows[ai] = { ...rows[ai], category: e.target.value }; return { ...prev, achievements: rows }; })}
                                  className="w-full px-3 py-2 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400"
                                >
                                  {ACHIEVEMENT_CATEGORY_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-thb-text-secondary mb-1">Issued by</label>
                                <input
                                  type="text"
                                  value={a.issuer}
                                  onChange={(e) => setForm(prev => { const rows = [...(prev.achievements || [])]; rows[ai] = { ...rows[ai], issuer: e.target.value }; return { ...prev, achievements: rows }; })}
                                  placeholder="e.g., Infosys Ltd / AWS"
                                  className="w-full px-3 py-2 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-thb-text-secondary mb-1">Date</label>
                                <input
                                  type="date"
                                  value={a.achievedOn}
                                  onChange={(e) => setForm(prev => { const rows = [...(prev.achievements || [])]; rows[ai] = { ...rows[ai], achievedOn: e.target.value }; return { ...prev, achievements: rows }; })}
                                  className="w-full px-3 py-2 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-thb-text-secondary mb-1">Description</label>
                              <input
                                type="text"
                                value={a.description}
                                onChange={(e) => setForm(prev => { const rows = [...(prev.achievements || [])]; rows[ai] = { ...rows[ai], description: e.target.value }; return { ...prev, achievements: rows }; })}
                                placeholder="Optional — what was it awarded for?"
                                className="w-full px-3 py-2 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <button type="button" onClick={() => setFormTab('overseas')} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg border border-thb-border text-sm font-medium text-thb-text-secondary hover:bg-slate-50 transition-colors">
                      <FiChevronLeft className="w-4 h-4" /> Back
                    </button>
                    <button type="button" onClick={handleNextStep} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-green-500 text-white text-sm font-medium hover:bg-green-600 shadow-sm transition-colors">
                      Next: Documents <FiChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
              {/* Documents */}
              {formTab === 'documents' && (
                <div className="space-y-4">
                  <div className="flex items-start gap-2.5 p-3.5 rounded-lg bg-teal-50 border border-teal-200">
                    <FiFileText className="w-4 h-4 text-teal-600 mt-0.5 shrink-0" />
                    <p className="text-xs text-teal-800 leading-relaxed">
                      {editingId
                        ? 'Add documents to this employee\'s record. Each document is saved immediately and visible on the employee profile under the Documents tab.'
                        : 'Attach onboarding documents (offer letter, ID proof, certificates, etc.). They will be saved to the employee\'s Documents tab automatically right after the employee is created. Files up to 3MB are stored directly — for larger files, paste a shareable link instead.'}
                    </p>
                  </div>

                  {/* Add document form */}
                  <div className="thb-card p-4">
                    <h4 className="text-xs font-semibold text-thb-text-muted uppercase tracking-wider mb-3">Add Document</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {/* <div>
                        <label className="block text-xs font-medium text-thb-text-secondary mb-1">Document Name <span className="text-red-500 font-bold">*</span></label>
                        <input type="text" value={docDraft.name} onChange={e => setDocDraft(prev => ({ ...prev, name: e.target.value }))} placeholder="e.g., Offer Letter — Signed" className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
                      </div> */}
                      <div>
                        <label className="block text-xs font-medium text-thb-text-secondary mb-1">Category</label>
                        <select value={docDraft.category} onChange={e => { const category = e.target.value; setDocDraft(prev => ({ ...prev, category, type: DOC_TYPES_BY_CATEGORY[category][0] })); }} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400">
                          {FORM_DOC_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.icon} {c.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-thb-text-secondary mb-1">Document Type</label>
                        <select value={docDraft.type} onChange={e => setDocDraft(prev => ({ ...prev, type: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400">
                          {(DOC_TYPES_BY_CATEGORY[docDraft.category] || FORM_DOC_TYPES).map(t => <option key={t} value={t}>{t.replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase())}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-thb-text-secondary mb-1">Upload File</label>
                        <div className="flex items-center gap-2">
                          <label className="flex-1 px-3 py-2.5 rounded-lg border border-dashed border-thb-border text-sm text-thb-text-muted cursor-pointer hover:bg-slate-50 truncate">
                            {docDraft.fileName || 'Choose file (PDF, max 3MB)'}
                            <input type="file" accept=".pdf" className="hidden" onChange={handleDocFilePick} />
                          </label>
                          {docDraft.fileName && (
                            <button type="button" onClick={() => setDocDraft(prev => ({ ...prev, fileUrl: '', fileName: '' }))} className="p-2 text-red-500 hover:bg-red-50 rounded-lg" title="Remove file">
                              <FiX className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                      {/* <div>
                        <label className="block text-xs font-medium text-thb-text-secondary mb-1">or File Link</label>
                        <input type="text" value={docDraft.fileName ? '' : docDraft.fileUrl} onChange={e => setDocDraft(prev => ({ ...prev, fileUrl: e.target.value, fileName: '' }))} placeholder="https://drive.google.com/..." className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-thb-text-secondary mb-1">Expiry Date</label>
                        <input type="date" value={docDraft.expiryDate} onChange={e => setDocDraft(prev => ({ ...prev, expiryDate: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
                      </div>
                      <div className="sm:col-span-2 lg:col-span-3">
                        <label className="block text-xs font-medium text-thb-text-secondary mb-1">Description</label>
                        <input type="text" value={docDraft.description} onChange={e => setDocDraft(prev => ({ ...prev, description: e.target.value }))} placeholder="Optional notes about this document" className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
                      </div> */}
                    </div>
                    <div className="flex justify-end mt-3">
                      <button type="button" onClick={editingId ? uploadLiveDoc : addStagedDoc} disabled={docUploading} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-green-500 text-white text-sm font-medium hover:bg-green-600 disabled:opacity-50 shadow-sm transition-colors">
                        <FiPlus className="w-4 h-4" /> {editingId ? (docUploading ? 'Saving...' : 'Save to Employee') : 'Add to List'}
                      </button>
                    </div>
                  </div>

                  {/* Document list */}
                  <div className="thb-card p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-semibold text-thb-text-muted uppercase tracking-wider">
                        {editingId ? `Documents on Record (${editDocs.length})` : `Documents to Attach (${stagedDocs.length})`}
                      </h4>
                      {editingId && editDocsLoading && <span className="text-xs text-thb-text-muted">Loading…</span>}
                    </div>
                    {!editingId && stagedDocs.length === 0 && (
                      <div className="text-center py-8">
                        <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-3"><FiFileText className="w-6 h-6 text-slate-300" /></div>
                        <p className="text-sm text-thb-text-muted">No documents added yet. This step is optional — you can also add documents later from the employee profile.</p>
                      </div>
                    )}
                    {editingId && !editDocsLoading && editDocs.length === 0 && (
                      <div className="text-center py-8">
                        <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-3"><FiFileText className="w-6 h-6 text-slate-300" /></div>
                        <p className="text-sm text-thb-text-muted">No documents on record yet. Use the form above to add the first one.</p>
                      </div>
                    )}
                    {editingId ? editDocs.map(doc => {
                      const cat = FORM_DOC_CATEGORIES.find(c => c.value === (doc.category || 'other'));
                      const isData = (doc.fileUrl || '').startsWith('data:');
                      const linkSafe = isSafeDocumentUrl(doc.fileUrl);
                      return (
                        <div key={doc.id} className="flex items-center gap-3 py-2.5 border-b border-thb-border/50 last:border-0">
                          <span className="text-lg shrink-0">{cat?.icon || '📎'}</span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-thb-text-primary truncate">{doc.name}</p>
                            <p className="text-[11px] text-thb-text-muted">{cat?.label || 'Other'}{doc.expiryDate ? ` · Expires ${formatDate(doc.expiryDate)}` : ''}</p>
                          </div>
                          {doc.fileUrl && linkSafe && <button type="button" onClick={() => { const ok = openDocumentInNewTab(doc.fileUrl as string, doc.name); if (!ok) toast.error('Could not open the document'); }} className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-violet-600 hover:bg-violet-50 rounded shrink-0"><FiEye className="w-3 h-3" /> View</button>}
                          {doc.fileUrl && linkSafe && <a href={doc.fileUrl} {...(isData ? { download: doc.name } : { target: '_blank', rel: 'noopener noreferrer' })} className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-teal-600 hover:bg-teal-50 rounded shrink-0"><FiDownload className="w-3 h-3" /> Download</a>}
                          {doc.fileUrl && !linkSafe && <span className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-red-500 bg-red-50 rounded shrink-0" title="This link was blocked for security reasons">Blocked link</span>}
                          <button type="button" onClick={() => deleteLiveDoc(doc.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded shrink-0" title="Delete document"><FiTrash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      );
                    }) : stagedDocs.map(doc => {
                      const cat = FORM_DOC_CATEGORIES.find(c => c.value === doc.category);
                      return (
                        <div key={doc.id} className="flex items-center gap-3 py-2.5 border-b border-thb-border/50 last:border-0">
                          <span className="text-lg shrink-0">{cat?.icon || '📎'}</span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-thb-text-primary truncate">{doc.name}</p>
                            <p className="text-[11px] text-thb-text-muted">{cat?.label || 'Other'}{doc.fileName ? ` · ${doc.fileName}` : ''}{doc.expiryDate ? ` · Expires ${formatDate(doc.expiryDate)}` : ''}</p>
                          </div>
                          {doc.fileUrl && <button type="button" onClick={() => { const ok = openDocumentInNewTab(doc.fileUrl as string, doc.fileName || doc.name); if (!ok) toast.error('Could not open the document'); }} className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-violet-600 hover:bg-violet-50 rounded shrink-0"><FiEye className="w-3 h-3" /> View</button>}
                          <button type="button" onClick={() => removeStagedDoc(doc.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded shrink-0" title="Remove"><FiX className="w-3.5 h-3.5" /></button>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <button type="button" onClick={() => setFormTab('experience')} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg border border-thb-border text-sm font-medium text-thb-text-secondary hover:bg-slate-50 transition-colors">
                      <FiChevronLeft className="w-4 h-4" /> Back
                    </button>
                    <button type="button" onClick={handleNextStep} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-green-500 text-white text-sm font-medium hover:bg-green-600 shadow-sm transition-colors">
                      Next: Policies <FiChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Policy Mappings */}
              {formTab === 'policies' && (
                <div className="space-y-4">
                  {/* Task 137 — Assigned Company Policies grid (view + download) */}
                  <div>
                    <h4 className="text-xs font-semibold text-thb-text-muted uppercase tracking-wider mb-1">Assigned Company Policies</h4>
                    <p className="text-[10px] text-thb-text-muted mb-3">Every policy document assigned to this employee — open or download it right here.</p>
                    {companyPolicies.length === 0 ? (
                      <p className="text-xs text-thb-text-muted py-2">No active company policies published yet.</p>
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
                                      // Task 139 — open the ORIGINAL document (native render via blob URL)
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
                  <div className="pt-3 border-t border-thb-border/50">
                  <p className="text-xs text-thb-text-muted">Assign organizational policies to this employee. These can be updated later from the employee profile.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Leave Policy</label>
                      <select value={form.leavePolicyId} onChange={e => updateForm('leavePolicyId', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400">
                        <option value="">Select Leave Policy</option>
                        {leavePolicies.map(p => <option key={p.id} value={p.id}>{p.title} {p.version ? `(v${p.version})` : ''}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Attendance Policy</label>
                      <select value={form.attendancePolicyId} onChange={e => updateForm('attendancePolicyId', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400">
                        <option value="">Select Attendance Policy</option>
                        {attendancePolicies.map(p => <option key={p.id} value={p.id}>{p.title} {p.version ? `(v${p.version})` : ''}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Travel Policy</label>
                      <select value={form.travelPolicyId} onChange={e => updateForm('travelPolicyId', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400">
                        <option value="">Select Travel Policy</option>
                        {travelPolicies.map(p => <option key={p.id} value={p.id}>{p.title} {p.version ? `(v${p.version})` : ''}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Salary Structure</label>
                      <select value={form.salaryStructureId} onChange={e => updateForm('salaryStructureId', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400">
                        <option value="">Select Salary Structure</option>
                        {salaryStructures.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                  </div>
                  </div>

                  {/* Form Actions */}
                  <div className="flex items-center justify-between pt-4 border-t border-thb-border mt-4">
                    <button type="button" onClick={() => setFormTab('documents')} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg border border-thb-border text-sm font-medium text-thb-text-secondary hover:bg-slate-50 transition-colors">
                      <FiChevronLeft className="w-4 h-4" /> Back
                    </button>
                    <div className="flex items-center gap-3">
                      <button type="button" onClick={handleCancelForm} className="px-4 py-2.5 rounded-lg border border-thb-border text-sm font-medium text-thb-text-secondary hover:bg-slate-50 transition-colors">
                        Cancel
                      </button>
                      <button type="submit" disabled={submitting} className="px-6 py-2.5 rounded-lg bg-green-500 text-white text-sm font-medium hover:bg-green-600 disabled:opacity-50 shadow-sm shadow-green-500/25 transition-colors">
                        {submitting ? 'Saving...' : editingId ? 'Update Employee' : 'Add Employee'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      {!formOnly && (
      <>
      {/* ── Bulk Actions & Count ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {selectedIds.size > 0 && (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-50 border border-green-200">
              <span className="text-sm font-medium text-green-700">{selectedIds.size} selected</span>
              <button onClick={() => setSelectedIds(new Set())} className="text-green-500 hover:text-green-700">
                <FiX className="w-4 h-4" />
              </button>
            </div>
          )}
          {pagination.total > 0 && (
            <span className="text-sm text-slate-500">
              Showing {Math.min((pagination.page - 1) * pagination.limit + 1, pagination.total)}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} employees
            </span>
          )}
        </div>
      </div>

      {/* ── Table (List View) ── */}
      {viewMode === 'list' ? (
      <div className="thb-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-thb-border bg-slate-50/80">
                <th className="text-left px-4 py-3 w-12">
                  <input
                    type="checkbox"
                    checked={employees.length > 0 && selectedIds.size === employees.length}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-slate-300 text-green-500 focus:ring-green-500/20 cursor-pointer"
                  />
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-muted uppercase tracking-wider">Emp ID</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-muted uppercase tracking-wider">Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-muted uppercase tracking-wider hidden md:table-cell">Email</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-muted uppercase tracking-wider hidden lg:table-cell">Phone</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-muted uppercase tracking-wider hidden sm:table-cell">Designation</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-muted uppercase tracking-wider hidden xl:table-cell" title="Total experience">Exp.</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-muted uppercase tracking-wider hidden lg:table-cell">Reporting Manager</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-muted uppercase tracking-wider hidden xl:table-cell">Joining Date</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-muted uppercase tracking-wider">Status</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-thb-text-muted uppercase tracking-wider w-36">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-thb-border/50 animate-pulse">
                    <td className="px-4 py-3"><div className="w-4 h-4 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded font-mono" /></td>
                    <td className="px-4 py-3"><div className="flex items-center gap-3"><div className="w-9 h-9 bg-slate-200 rounded-full" /><div className="space-y-1"><div className="h-3 w-28 bg-slate-200 rounded" /><div className="h-2 w-20 bg-slate-200 rounded" /></div></div></td>
                    <td className="px-4 py-3 hidden md:table-cell"><div className="h-3 w-32 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3 hidden lg:table-cell"><div className="h-3 w-24 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3 hidden sm:table-cell"><div className="h-3 w-24 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3 hidden lg:table-cell"><div className="h-3 w-24 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3 hidden xl:table-cell"><div className="h-3 w-24 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-5 w-16 bg-slate-200 rounded-full" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-6 bg-slate-200 rounded ml-auto" /></td>
                  </tr>
                ))
              ) : employees.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center">
                      <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                        <FiUsers className="w-8 h-8 text-thb-text-muted" />
                      </div>
                      <p className="text-thb-text-secondary font-medium text-base">No employees found</p>
                      <p className="text-sm text-thb-text-muted mt-1">Try adjusting your search or filters</p>
                    </div>
                  </td>
                </tr>
              ) : (
                employees.map(emp => {
                  const badge = getStatusBadge(emp.status);
                  const dotColor = getStatusDotColor(emp.status);
                  const initials = `${emp.firstName?.[0] || ''}${emp.lastName?.[0] || ''}`.toUpperCase();
                  const avatarGradient = getAvatarColor(`${emp.firstName} ${emp.lastName}`);
                  const isDeleting = deleteConfirmId === emp.id;
                  const isSelected = selectedIds.has(emp.id);
                  return (
                    <tr key={emp.id} className={`border-b border-thb-border/50 transition-colors ${isDeleting ? 'bg-red-50/80' : isSelected ? 'bg-green-50/50' : 'hover:bg-slate-50/50'}`}>
                      {isDeleting ? (
                        <td colSpan={10} className="px-4 py-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
                                <FiTrash2 className="w-4 h-4 text-red-500" />
                              </div>
                              <span className="text-sm text-red-700 font-medium">Are you sure you want to terminate {emp.firstName} {emp.lastName}? This action can be reversed by editing the employee.</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button onClick={() => handleDelete(emp.id)} disabled={deleting} className="px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors">
                                {deleting ? 'Terminating...' : 'Confirm Terminate'}
                              </button>
                              <button onClick={() => setDeleteConfirmId(null)} className="px-3 py-1.5 border border-thb-border text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors">
                                Cancel
                              </button>
                            </div>
                          </div>
                        </td>
                      ) : (
                        <>
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelect(emp.id)}
                              className="w-4 h-4 rounded border-slate-300 text-green-500 focus:ring-green-500/20 cursor-pointer"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs font-mono font-medium text-thb-text-secondary bg-slate-100 px-2 py-0.5 rounded">
                              {emp.employeeId}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              {emp.avatar ? (
                                <img src={emp.avatar} alt="" className="w-9 h-9 rounded-full object-cover ring-2 ring-white shadow-sm flex-shrink-0" />
                              ) : (
                                <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${avatarGradient} flex items-center justify-center text-white text-xs font-bold flex-shrink-0 shadow-sm`}>
                                  {initials}
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-thb-text-primary truncate">{emp.firstName} {emp.lastName}</p>
                                <p className="text-xs text-thb-text-muted truncate">{emp.department?.name || 'No Department'}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell">
                            <div className="flex items-center gap-1.5 text-sm text-thb-text-secondary truncate">
                              <FiMail className="w-3.5 h-3.5 text-thb-text-muted flex-shrink-0" />
                              <span className="truncate">{emp.email}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 hidden lg:table-cell">
                            <div className="flex items-center gap-1.5 text-sm text-thb-text-secondary">
                              <FiPhone className="w-3.5 h-3.5 text-thb-text-muted flex-shrink-0" />
                              <span>{emp.phone || '—'}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 hidden sm:table-cell">
                            <span className="text-sm text-thb-text-secondary">{emp.designation?.title || '—'}</span>
                          </td>
                          <td className="px-4 py-3 hidden xl:table-cell">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 text-xs font-semibold" title="Total experience">
                              <FiClock className="w-3 h-3" /> {formatExperienceYears(emp.experienceYears)}
                            </span>
                          </td>
                          <td className="px-4 py-3 hidden lg:table-cell">
                            {emp.reportingManager ? (
                              <button
                                onClick={() => emp.reportingManager && router.push(`/employees/${emp.reportingManager.id}`)}
                                className="text-sm text-thb-text-secondary hover:text-green-600 hover:underline truncate max-w-[150px]"
                                title="Open reporting manager profile"
                              >
                                {emp.reportingManager.firstName} {emp.reportingManager.lastName}
                              </button>
                            ) : (
                              <span className="text-sm text-thb-text-muted">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 hidden xl:table-cell">
                            <div className="flex items-center gap-1.5 text-sm text-thb-text-secondary">
                              <FiCalendar className="w-3.5 h-3.5 text-thb-text-muted flex-shrink-0" />
                              <span>{formatDate(emp.dateOfJoining)}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col items-start gap-1">
                              <span className={`inline-flex items-center gap-1.5 ${badge.className}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                                {badge.label}
                              </span>
                              {emp.employeeStatus && (
                                <span className="text-[10px] font-medium text-slate-500 capitalize">
                                  Employment: {emp.employeeStatus.replace(/_/g, ' ')}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {/* Task 153 — always-visible icon actions: view / edit / terminate */}
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => router.push(`/employees/${emp.id}`)}
                                className="p-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                                title="View details"
                              >
                                <FiEye className="w-4 h-4" />
                              </button>
                              {isAdmin && (
                                <>
                                  <button
                                    onClick={() => handleOpenEditForm(emp)}
                                    className="p-2 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100 transition-colors"
                                    title="Edit employee"
                                  >
                                    <FiEdit2 className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => router.push(`/employees/termination?empId=${emp.id}`)}
                                    className="p-2 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
                                    title="Terminate employee"
                                  >
                                    <FiTrash2 className="w-4 h-4" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-thb-border bg-slate-50/50">
            <p className="text-sm text-thb-text-muted">
              Showing {(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
            </p>
            <div className="flex items-center gap-1">
              <button onClick={() => fetchEmployees(pagination.page - 1)} disabled={pagination.page <= 1} className="p-2 rounded-lg border border-thb-border text-thb-text-secondary hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <FiChevronLeft className="w-4 h-4" />
              </button>
              {Array.from({ length: Math.min(pagination.totalPages, 5) }, (_, i) => {
                const p = i + 1;
                return (
                  <button key={p} onClick={() => fetchEmployees(p)} className={`min-w-[36px] h-9 rounded-lg text-sm font-medium transition-colors ${p === pagination.page ? 'bg-green-500 text-white shadow-sm' : 'text-thb-text-secondary hover:bg-white border border-thb-border'}`}>
                    {p}
                  </button>
                );
              })}
              <button onClick={() => fetchEmployees(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages} className="p-2 rounded-lg border border-thb-border text-thb-text-secondary hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <FiChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
      ) : (
      /* ── Grid View ── */
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {employees.length === 0 ? (
          <div className="col-span-full text-center py-16">
            <div className="flex flex-col items-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                <FiUsers className="w-8 h-8 text-thb-text-muted" />
              </div>
              <p className="text-thb-text-secondary font-medium">No employees found</p>
              <p className="text-sm text-thb-text-muted mt-1">Try adjusting your search or filters</p>
            </div>
          </div>
        ) : (
          employees.map((emp, empIdx) => {
            const statusBadge = getStatusBadge(emp.status);
            const dotColor = getStatusDotColor(emp.status);
            const initials = `${emp.firstName?.[0] || ''}${emp.lastName?.[0] || ''}`.toUpperCase();
            const avatarGradient = getAvatarColor(`${emp.firstName} ${emp.lastName}`);
            /* Task 153 — Tiimi-style rotating colour tone per card */
            const tone = GRID_CARD_TONES[empIdx % GRID_CARD_TONES.length];
            const isDeleting = deleteConfirmId === emp.id;
            return (
              <div key={emp.id} className={`thb-card overflow-hidden group transition-all duration-200 ${isDeleting ? 'ring-2 ring-red-300' : 'hover:shadow-xl hover:-translate-y-0.5'}`}>
                {/* colourful gradient strip — Tiimi reference look */}
                <div className={`h-1.5 bg-gradient-to-r ${tone.strip}`} />
                {isDeleting ? (
                  <div className="p-5 text-center space-y-3">
                    <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center mx-auto">
                      <FiTrash2 className="w-5 h-5 text-red-500" />
                    </div>
                    <p className="text-sm text-red-700 font-medium">Terminate {emp.firstName}?</p>
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={() => handleDelete(emp.id)} disabled={deleting} className="px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors">
                        {deleting ? 'Wait...' : 'Confirm'}
                      </button>
                      <button onClick={() => setDeleteConfirmId(null)} className="px-3 py-1.5 border border-thb-border text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Card Header with Avatar (Task 153 — bigger photo, role under name, tinted ID chip) */}
                    <div className="p-5 pb-3">
                      <div className="flex items-start gap-3.5">
                        {emp.avatar ? (
                          <img src={emp.avatar} alt={`${emp.firstName} ${emp.lastName}`} className="w-14 h-14 rounded-full object-cover ring-4 ring-white shadow-md flex-shrink-0" />
                        ) : (
                          <div className={`w-14 h-14 rounded-full bg-gradient-to-br ${avatarGradient} flex items-center justify-center text-white text-base font-bold flex-shrink-0 shadow-md`}>
                            {initials}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold text-thb-text-primary text-sm truncate">
                            {emp.firstName} {emp.lastName}
                          </h3>
                          {emp.designation && (
                            <p className="text-[11px] font-medium text-thb-text-secondary truncate mt-0.5" title={emp.designation.title}>
                              {emp.designation.title}
                            </p>
                          )}
                          <span className={`text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded mt-1 inline-block ${tone.chipBg} ${tone.chipText}`}>
                            {emp.employeeId}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Card Details */}
                    <div className="px-5 pb-4 space-y-2">
                      <div className="flex items-center gap-2 text-xs text-thb-text-secondary">
                        <FiMail className="w-3.5 h-3.5 text-thb-text-muted flex-shrink-0" />
                        <span className="truncate">{emp.email}</span>
                      </div>
                      {emp.phone && (
                        <div className="flex items-center gap-2 text-xs text-thb-text-secondary">
                          <FiPhone className="w-3.5 h-3.5 text-thb-text-muted flex-shrink-0" />
                          <span className="truncate">{emp.phone}</span>
                        </div>
                      )}
                      {emp.department && (
                        <div className="flex items-center gap-2 text-xs text-thb-text-secondary">
                          <FiActivity className="w-3.5 h-3.5 text-thb-text-muted flex-shrink-0" />
                          <span className="truncate">{emp.department.name}</span>
                        </div>
                      )}
                      {emp.dateOfJoining && (
                        <div className="flex items-center gap-2 text-xs text-thb-text-secondary">
                          <FiCalendar className="w-3.5 h-3.5 text-thb-text-muted flex-shrink-0" />
                          <span className="truncate">Joined {formatDate(emp.dateOfJoining)}</span>
                        </div>
                      )}
                      {emp.reportingManager && (
                        <div className="flex items-center gap-2 text-xs text-thb-text-secondary">
                          <FiUsers className="w-3.5 h-3.5 text-thb-text-muted flex-shrink-0" />
                          <button
                            onClick={() => emp.reportingManager && router.push(`/employees/${emp.reportingManager.id}`)}
                            className="truncate hover:text-green-600 hover:underline"
                            title="Open reporting manager profile"
                          >
                            Reports to {emp.reportingManager.firstName} {emp.reportingManager.lastName}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Card Footer — status + experience + Task 153 icon actions */}
                    <div className="px-5 py-3 border-t border-thb-border bg-slate-50/50 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-wrap">
                        <span className={`inline-flex items-center gap-1.5 ${statusBadge.className}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                          {statusBadge.label}
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 text-[11px] font-semibold" title="Total experience">
                          <FiClock className="w-3 h-3" /> {formatExperienceYears(emp.experienceYears)}
                        </span>
                      </div>
                      {/* always-visible icon actions: view / edit / terminate */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => router.push(`/employees/${emp.id}`)}
                          className="p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                          title="View details"
                        >
                          <FiEye className="w-3.5 h-3.5" />
                        </button>
                        {isAdmin && (
                          <>
                            <button
                              onClick={() => handleOpenEditForm(emp)}
                              className="p-1.5 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100 transition-colors"
                              title="Edit employee"
                            >
                              <FiEdit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => router.push(`/employees/termination?empId=${emp.id}`)}
                              className="p-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
                              title="Terminate employee"
                            >
                              <FiTrash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })
        )}
      </div>
      )}

      {/* Pagination for Grid View */}
      {viewMode === 'grid' && pagination.totalPages > 1 && (
        <div className="thb-card">
          <div className="flex items-center justify-between px-4 py-3">
            <p className="text-sm text-thb-text-muted">
              Showing {(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
            </p>
            <div className="flex items-center gap-1">
              <button onClick={() => fetchEmployees(pagination.page - 1)} disabled={pagination.page <= 1} className="p-2 rounded-lg border border-thb-border text-thb-text-secondary hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <FiChevronLeft className="w-4 h-4" />
              </button>
              {Array.from({ length: Math.min(pagination.totalPages, 5) }, (_, i) => {
                const p = i + 1;
                return (
                  <button key={p} onClick={() => fetchEmployees(p)} className={`min-w-[36px] h-9 rounded-lg text-sm font-medium transition-colors ${p === pagination.page ? 'bg-green-500 text-white shadow-sm' : 'text-thb-text-secondary hover:bg-slate-50 border border-thb-border'}`}>
                    {p}
                  </button>
                );
              })}
              <button onClick={() => fetchEmployees(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages} className="p-2 rounded-lg border border-thb-border text-thb-text-secondary hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <FiChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
      </>)}
      </>)}
    </div>
  );
}

export default function EmployeesPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500 mx-auto mb-4" />
          <p className="text-sm text-thb-text-secondary">Loading Employees...</p>
        </div>
      </div>
    }>
      <EmployeesPageContent />
    </Suspense>
  );
}
