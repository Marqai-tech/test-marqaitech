'use client';

/**
 * BRD 5.4 — Candidate Preboarding Portal (New Joiner View)
 * 9-step wizard: Welcome → Personal → Address → Family & Emergency →
 * Education & Experience → Bank & Statutory → Document Upload →
 * Review & Declaration → Submit to HR
 *
 * Wired to existing backend contracts:
 *  GET  /api/candidate-portal/onboarding          — wizard state + documents
 *  PUT  /api/candidate-portal/onboarding          — save one section (save & resume)
 *  POST /api/candidate-portal/onboarding/submit   — Review & Declaration → Submit to HR
 *  POST /api/onboarding/documents/upload          — document upload / re-upload
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  FiCheckCircle, FiClock, FiUpload, FiFileText, FiAlertCircle,
  FiLoader, FiEye, FiArrowLeft, FiArrowRight, FiLock,
  FiHelpCircle, FiUser, FiBriefcase, FiCalendar, FiMapPin, FiPhone,
  FiCreditCard, FiAward, FiEdit3, FiCheck, FiSend, FiAlertTriangle, FiHome,
  FiUsers, FiChevronRight, FiBookOpen,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import CandidatePortalNav, { fetchPortalState, type PortalState } from '@/components/candidate-portal/CandidatePortalNav';

function getPortalHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_candidate_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

// ─────────────────────────── Types ───────────────────────────
interface OnboardingDocument {
  id: string;
  documentType: string;
  documentLabel: string;
  fileUrl?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  status: string;
  reviewedAt?: string | null;
  reviewNotes?: string | null;
  uploadedAt?: string | null;
  documentNumber?: string | null;
  issueDate?: string | null;
  expiryDate?: string | null;
  version?: number | null;
  required?: boolean | null;
}

interface PersonalForm {
  firstName: string; middleName: string; lastName: string;
  dateOfBirth: string; gender: string; personalEmail: string;
  mobileNumber: string; alternateMobile: string; nationality: string; maritalStatus: string;
}
interface AddressForm {
  permanentAddressLine1: string; permanentAddressLine2: string;
  permanentCountry: string; permanentState: string; permanentCity: string; permanentPincode: string;
  currentSameAsPermanent: boolean;
  currentAddressLine1: string; currentAddressLine2: string;
  currentCountry: string; currentState: string; currentCity: string; currentPincode: string;
}
interface FamilyForm {
  emergencyContactName: string; emergencyContactRelation: string; emergencyContactMobile: string;
  emergencyContactAlternate: string; emergencyContactAddress: string;
  fatherName: string; motherName: string; spouseName: string;
}
interface EduRecord {
  qualification: string; specialization: string; institutionName: string;
  universityBoard: string; startYear: string; endYear: string; percentage: string;
}
interface PrevEmploymentRecord {
  companyName: string; designation: string; employmentType: string;
  dateOfJoining: string; lastWorkingDate: string; totalExperience: string; reasonForLeaving: string;
}
interface CurrentEmploymentForm {
  currentlyEmployed: string; currentCompany: string; currentDesignation: string;
  noticePeriod: string; lastWorkingDate: string; noticeBuyout: string;
}
interface BankForm {
  accountHolderName: string; bankName: string; accountNumber: string; confirmAccountNumber: string;
  ifscCode: string; branchName: string; accountType: string;
  panNumber: string; uanNumber: string; pfNumber: string; esiNumber: string;
}
interface PortalDetailsShape {
  personal?: Partial<PersonalForm>;
  address?: Partial<AddressForm>;
  family?: Partial<FamilyForm>;
  education?: { records?: EduRecord[]; noEducationRecords?: boolean };
  previousEmployment?: { records?: PrevEmploymentRecord[] };
  currentEmployment?: Partial<CurrentEmploymentForm>;
  bank?: Partial<BankForm>;
  [key: string]: unknown;
}

interface WizardData {
  preboardingCandidateId: string;
  candidateName: string;
  candidateEmail: string;
  candidatePhone?: string | null;
  jobTitle?: string | null;
  department?: string | null;
  designation?: string | null;
  employmentType?: string;
  ctc?: number | null;
  workLocation?: string | null;
  joiningDate?: string | null;
  companyEmail?: string | null;
  onboardingStatus: string;
  bgvStatus: string;
  employeeId?: string | null;
  portalDetails: PortalDetailsShape;
  portalSubmittedAt: string | null;
  declarationAcceptedAt: string | null;
  declarationName: string | null;
  correctionNote: string | null;
  correctionSetAt: string | null;
  documents: OnboardingDocument[];
  hrContact?: { name?: string | null; email?: string | null; phone?: string | null } | null;
  companyName?: string | null;
}

type StepStatus = 'not_started' | 'in_progress' | 'submitted' | 'approved' | 'rejected';

const STEPS = [
  { id: 'welcome', label: 'Welcome', short: 'Welcome' },
  { id: 'personal', label: 'Personal Information', short: 'Personal' },
  { id: 'address', label: 'Address Information', short: 'Address' },
  { id: 'family', label: 'Family & Emergency Contact', short: 'Family' },
  { id: 'education', label: 'Education & Experience', short: 'Education' },
  { id: 'bank', label: 'Bank & Statutory Details', short: 'Bank' },
  { id: 'documents', label: 'Document Upload', short: 'Documents' },
  { id: 'review', label: 'Review & Declaration', short: 'Review' },
  { id: 'submit', label: 'Submit to HR', short: 'Submit' },
] as const;

const DOC_STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: 'Not Uploaded', color: 'text-slate-600 bg-slate-50 border-slate-200' },
  submitted: { label: 'Submitted — Awaiting HR', color: 'text-blue-600 bg-blue-50 border-blue-200' },
  approved: { label: 'Approved', color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  rejected: { label: 'Rejected — Re-upload Required', color: 'text-red-600 bg-red-50 border-red-200' },
  resubmission_requested: { label: 'Correction Requested', color: 'text-amber-600 bg-amber-50 border-amber-200' },
};

// ─────────────────────── Validation helpers (BRD 5.5–5.7) ───────────────────────
const EMAIL_RE = /^\S+@\S+\.\S+$/;
const PHONE_RE = /^\+?[0-9][0-9\s-]{6,14}$/;
const PIN_RE = /^\d{4,10}$/;
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const UAN_RE = /^\d{12}$/;

function isNumericOnly(v: string) { return /^[0-9\s.+-]+$/.test(v.trim()) && /\d/.test(v.trim()); }
function isValidDob(v: string): boolean {
  if (!v) return false;
  const d = new Date(v);
  if (isNaN(d.getTime())) return false;
  const now = new Date();
  const age = (now.getFullYear() - d.getFullYear()) - (now < new Date(now.getFullYear(), d.getMonth(), d.getDate()) ? 1 : 0);
  return age >= 14 && age <= 80;
}
function personalDefaults(d: WizardData): PersonalForm {
  const name = d.candidateName || '';
  const first = name.split(' ')[0] || '';
  const last = name.split(' ').slice(1).join(' ');
  return {
    firstName: first, middleName: '', lastName: last,
    dateOfBirth: '', gender: '',
    personalEmail: d.candidateEmail || '', mobileNumber: d.candidatePhone || '',
    alternateMobile: '', nationality: '', maritalStatus: '',
  };
}
const EMPTY_ADDRESS: AddressForm = {
  permanentAddressLine1: '', permanentAddressLine2: '', permanentCountry: '', permanentState: '', permanentCity: '', permanentPincode: '',
  currentSameAsPermanent: false,
  currentAddressLine1: '', currentAddressLine2: '', currentCountry: '', currentState: '', currentCity: '', currentPincode: '',
};
const EMPTY_FAMILY: FamilyForm = {
  emergencyContactName: '', emergencyContactRelation: '', emergencyContactMobile: '',
  emergencyContactAlternate: '', emergencyContactAddress: '', fatherName: '', motherName: '', spouseName: '',
};
const EMPTY_CURRENT_EMPLOYMENT: CurrentEmploymentForm = {
  currentlyEmployed: '', currentCompany: '', currentDesignation: '', noticePeriod: '', lastWorkingDate: '', noticeBuyout: '',
};
const EMPTY_BANK: BankForm = {
  accountHolderName: '', bankName: '', accountNumber: '', confirmAccountNumber: '',
  ifscCode: '', branchName: '', accountType: '', panNumber: '', uanNumber: '', pfNumber: '', esiNumber: '',
};
const NEW_EDU_RECORD: EduRecord = { qualification: '', specialization: '', institutionName: '', universityBoard: '', startYear: '', endYear: '', percentage: '' };
const NEW_PREV_EMPLOYMENT: PrevEmploymentRecord = { companyName: '', designation: '', employmentType: 'Full-Time', dateOfJoining: '', lastWorkingDate: '', totalExperience: '', reasonForLeaving: '' };

const err = (errors: Record<string, string>, key: string) => errors[key];
function maskValue(v?: string | null, keep = 4): string {
  const s = String(v ?? '');
  if (!s) return '—';
  return s.length <= keep ? '•'.repeat(s.length) : `${'•'.repeat(6)}${s.slice(-keep)}`;
}

// ─────────────────────────── Page ───────────────────────────
export default function CandidatePreboardingWizardPage() {
  const router = useRouter();
  const [data, setData] = useState<WizardData | null>(null);
  const [nowMs, setNowMs] = useState(0);
  const [portalState, setPortalState] = useState<PortalState | null>(null);
  const [viewMode, setViewMode] = useState<'overview' | 'step'>('overview');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState(0);
  const [savingSection, setSavingSection] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingDocId, setUploadingDocId] = useState<string | null>(null);
  const [savingDocId, setSavingDocId] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  // Form state (steps 2–6)
  const [personal, setPersonal] = useState<PersonalForm>(personalDefaults({ preboardingCandidateId: '', candidateName: '', candidateEmail: '', onboardingStatus: 'pending', bgvStatus: 'pending', portalDetails: {}, portalSubmittedAt: null, declarationAcceptedAt: null, declarationName: null, correctionNote: null, correctionSetAt: null, documents: [] }));
  const [address, setAddress] = useState<AddressForm>(EMPTY_ADDRESS);
  const [family, setFamily] = useState<FamilyForm>(EMPTY_FAMILY);
  const [eduRecords, setEduRecords] = useState<EduRecord[]>([NEW_EDU_RECORD]);
  const [noEducationRecords, setNoEducationRecords] = useState(false);
  const [prevEmployments, setPrevEmployments] = useState<PrevEmploymentRecord[]>([]);
  const [currentEmployment, setCurrentEmployment] = useState<CurrentEmploymentForm>(EMPTY_CURRENT_EMPLOYMENT);
  const [bank, setBank] = useState<BankForm>(EMPTY_BANK);
  const [declarationAccepted, setDeclarationAccepted] = useState(false);
  const [declarationName, setDeclarationName] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const hydrateForms = useCallback((d: WizardData) => {
    const pd = d.portalDetails || {};
    setPersonal({ ...personalDefaults(d), ...(pd.personal || {}) });
    setAddress({ ...EMPTY_ADDRESS, ...(pd.address || {}) });
    setFamily({ ...EMPTY_FAMILY, ...(pd.family || {}) });
    const edu = pd.education || {};
    setEduRecords(Array.isArray(edu.records) && edu.records.length ? edu.records : [NEW_EDU_RECORD]);
    setNoEducationRecords(!!edu.noEducationRecords);
    setPrevEmployments(Array.isArray(pd.previousEmployment?.records) ? pd.previousEmployment.records : []);
    setCurrentEmployment({ ...EMPTY_CURRENT_EMPLOYMENT, ...(pd.currentEmployment || {}) });
    setBank({ ...EMPTY_BANK, ...(pd.bank || {}) });
    setDeclarationName(d.declarationName || d.candidateName || '');
    setDeclarationAccepted(!!d.declarationAcceptedAt);
  }, []);

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/candidate-portal/onboarding', { headers: getPortalHeaders() });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setLoadError(d.error || `Failed to load (${res.status})`);
        return;
      }
      const d: WizardData = await res.json();
      setData(d);
      // Captured at fetch time so expiry flags in the Documents step stay
      // pure during render (no Date.now() inside the component body).
      setNowMs(Date.now());
      hydrateForms(d);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load preboarding data');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [hydrateForms]);

  useEffect(() => {
    queueMicrotask(() => { void fetchData(); });
  }, [fetchData]);

  useEffect(() => { fetchPortalState().then(setPortalState); }, []);

  // ─────────────── Derived state ───────────────
  const locked = !!data?.portalSubmittedAt && !data?.correctionNote;
  const correctionMode = !!data?.correctionNote && !data?.portalSubmittedAt;

  const stepStatuses = useMemo<StepStatus[]>(() => {
    if (!data) return STEPS.map(() => 'not_started' as StepStatus);
    const pd = data.portalDetails || {};
    const docs = data.documents || [];
    const sec = (s: string, hasDefault?: boolean): StepStatus => {
      if (data.portalSubmittedAt) return 'submitted';
      if (data.correctionNote) return 'rejected';
      if (pd[s] && (hasDefault ? true : Object.keys(pd[s] as object).length > 0)) return 'in_progress';
      return 'not_started';
    };
    const docStatus: StepStatus = docs.length === 0 ? 'not_started'
      : docs.every(d => d.status === 'approved') ? 'approved'
      : docs.some(d => d.status === 'rejected' || d.status === 'resubmission_requested') ? 'rejected'
      : docs.every(d => !!d.fileUrl) ? 'submitted'
      : docs.some(d => !!d.fileUrl) ? 'in_progress' : 'not_started';
    return [
      'approved',
      sec('personal'),
      sec('address'),
      sec('family'),
      sec('education', Array.isArray(pd.education?.records) && (pd.education?.records?.length || 0) > 0 ? true : !!pd.education?.noEducationRecords),
      sec('bank'),
      docStatus,
      data.declarationAcceptedAt ? 'submitted' : 'not_started',
      data.portalSubmittedAt ? 'submitted' : 'not_started',
    ];
  }, [data]);

  const completedCount = stepStatuses.filter(s => s === 'submitted' || s === 'approved').length;
  const completionPct = Math.round((completedCount / STEPS.length) * 100);
  const remainingTasks = STEPS.length - completedCount;
  const approvedDocs = data?.documents.filter(d => d.status === 'approved').length ?? 0;

  // ─────────────── Save / Submit ───────────────
  async function saveSection(section: string, payload: Record<string, unknown>): Promise<boolean> {
    setSavingSection(section);
    try {
      const res = await fetch('/api/candidate-portal/onboarding', {
        method: 'PUT', headers: getPortalHeaders(),
        body: JSON.stringify({ section, data: payload }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(result.error || `Could not save ${section}`); return false; }
      toast.success(result.message || `${section} saved`);
      return true;
    } catch {
      toast.error('Network error — could not save');
      return false;
    } finally { setSavingSection(null); }
  }

  function validatePersonal(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!personal.firstName.trim()) e['personal.firstName'] = 'First name is required';
    else if (isNumericOnly(personal.firstName)) e['personal.firstName'] = 'Name cannot be only numbers';
    if (!personal.lastName.trim()) e['personal.lastName'] = 'Last name is required';
    else if (isNumericOnly(personal.lastName)) e['personal.lastName'] = 'Name cannot be only numbers';
    if (!personal.dateOfBirth) e['personal.dateOfBirth'] = 'Date of birth is required';
    else if (!isValidDob(personal.dateOfBirth)) e['personal.dateOfBirth'] = 'Enter a valid date of birth (employment eligibility age 14+)';
    if (!personal.gender) e['personal.gender'] = 'Gender is required';
    if (!personal.mobileNumber.trim()) e['personal.mobileNumber'] = 'Mobile number is required';
    else if (!PHONE_RE.test(personal.mobileNumber)) e['personal.mobileNumber'] = 'Enter a valid mobile number with country code (e.g. +91 98765 43210)';
    if (personal.personalEmail && !EMAIL_RE.test(personal.personalEmail)) e['personal.personalEmail'] = 'Enter a valid email address';
    if (personal.alternateMobile && !PHONE_RE.test(personal.alternateMobile)) e['personal.alternateMobile'] = 'Enter a valid alternate mobile number';
    return e;
  }

  function validateAddress(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!address.permanentAddressLine1.trim()) e['address.permanentAddressLine1'] = 'Address line 1 is required';
    if (!address.permanentCountry.trim()) e['address.permanentCountry'] = 'Country is required';
    if (!address.permanentState.trim()) e['address.permanentState'] = 'State is required';
    if (!address.permanentCity.trim()) e['address.permanentCity'] = 'City/District is required';
    if (!address.permanentPincode.trim()) e['address.permanentPincode'] = 'PIN/Postal code is required';
    else if (!PIN_RE.test(address.permanentPincode)) e['address.permanentPincode'] = 'Enter a valid PIN/postal code';
    if (!address.currentSameAsPermanent) {
      if (!address.currentAddressLine1.trim()) e['address.currentAddressLine1'] = 'Current address line 1 is required';
      if (!address.currentCountry.trim()) e['address.currentCountry'] = 'Country is required';
      if (!address.currentState.trim()) e['address.currentState'] = 'State is required';
      if (!address.currentCity.trim()) e['address.currentCity'] = 'City is required';
      if (!address.currentPincode.trim()) e['address.currentPincode'] = 'PIN/Postal code is required';
      else if (!PIN_RE.test(address.currentPincode)) e['address.currentPincode'] = 'Enter a valid PIN/postal code';
    }
    return e;
  }

  function validateFamily(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!family.emergencyContactName.trim()) e['family.emergencyContactName'] = 'Emergency contact name is required';
    else if (isNumericOnly(family.emergencyContactName)) e['family.emergencyContactName'] = 'Name cannot be only numbers';
    if (!family.emergencyContactRelation.trim()) e['family.emergencyContactRelation'] = 'Relationship is required';
    if (!family.emergencyContactMobile.trim()) e['family.emergencyContactMobile'] = 'Emergency contact mobile is required';
    else if (!PHONE_RE.test(family.emergencyContactMobile)) e['family.emergencyContactMobile'] = 'Enter a valid mobile number';
    return e;
  }

  function validateEducation(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!noEducationRecords) {
      const hasOne = eduRecords.some(r => r.qualification.trim() && r.institutionName.trim() && r.startYear && r.endYear);
      if (!hasOne) e['education.records'] = 'Add at least one education record (qualification, institution, years) or mark as fresher';
      eduRecords.forEach((r, i) => {
        if (r.startYear && r.endYear && Number(r.endYear) < Number(r.startYear)) e[`education.${i}.endYear`] = 'End year cannot be earlier than start year';
        if (r.endYear && Number(r.endYear) > new Date().getFullYear() + 5) e[`education.${i}.endYear`] = 'End year looks invalid';
      });
    }
    prevEmployments.forEach((r, i) => {
      if (r.dateOfJoining && r.lastWorkingDate && new Date(r.lastWorkingDate) < new Date(r.dateOfJoining))
        e[`employment.${i}.lastWorkingDate`] = 'Last working date cannot be earlier than joining date';
    });
    return e;
  }

  function validateBank(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!bank.accountHolderName.trim()) e['bank.accountHolderName'] = 'Account holder name is required';
    else if (isNumericOnly(bank.accountHolderName)) e['bank.accountHolderName'] = 'Name cannot be only numbers';
    if (!bank.bankName.trim()) e['bank.bankName'] = 'Bank name is required';
    if (!bank.accountNumber.trim()) e['bank.accountNumber'] = 'Account number is required';
    else if (!/^[0-9A-Z]{6,24}$/.test(bank.accountNumber)) e['bank.accountNumber'] = 'Enter a valid account number';
    if (!bank.confirmAccountNumber.trim()) e['bank.confirmAccountNumber'] = 'Please confirm the account number';
    else if (bank.accountNumber && bank.confirmAccountNumber !== bank.accountNumber) e['bank.confirmAccountNumber'] = 'Account numbers do not match';
    if (!bank.ifscCode.trim()) e['bank.ifscCode'] = 'IFSC code is required';
    else if (!IFSC_RE.test(bank.ifscCode.toUpperCase())) e['bank.ifscCode'] = 'Invalid IFSC format (e.g. HDFC0001234)';
    if (bank.panNumber && !PAN_RE.test(bank.panNumber.toUpperCase())) e['bank.panNumber'] = 'Invalid PAN format (e.g. ABCDE1234F)';
    if (bank.uanNumber && !UAN_RE.test(bank.uanNumber)) e['bank.uanNumber'] = 'UAN must be exactly 12 digits';
    return e;
  }

  function educationPayload(): Record<string, unknown> {
    return {
      records: noEducationRecords ? [] : eduRecords,
      noEducationRecords,
      previousEmployment: { records: prevEmployments },
      currentEmployment,
    };
  }

  async function handleSaveAndNext(section: string, validator?: () => Record<string, string>, payload?: Record<string, unknown>) {
    const e = validator ? validator() : {};
    setErrors(e);
    if (Object.keys(e).length > 0) { toast.error('Please fix the highlighted fields before continuing'); return; }
    const ok = await saveSection(section, payload || {});
    if (ok) { setErrors({}); setActiveStep(s => Math.min(s + 1, STEPS.length - 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); await fetchData(true); }
  }

  // ─────────────── Documents ───────────────
  const handleFileUpload = async (docId: string, file: File, meta?: { documentNumber?: string; issueDate?: string; expiryDate?: string }) => {
    const ALLOWED = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!ALLOWED.includes(file.type)) { toast.error('Only PDF, JPG or PNG files are allowed'); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error('File too large — maximum 10MB'); return; }
    setUploadingDocId(docId);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const res = await fetch('/api/onboarding/documents/upload', {
          method: 'POST', headers: getPortalHeaders(),
          body: JSON.stringify({
            documentId: docId, fileDataUrl: reader.result, fileName: file.name, fileSize: file.size, mimeType: file.type,
            documentNumber: meta?.documentNumber || undefined, issueDate: meta?.issueDate || undefined, expiryDate: meta?.expiryDate || undefined,
          }),
        });
        const result = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(result.error || 'Upload failed');
        toast.success(result.message || 'Document uploaded — submitted for HR review');
        await fetchData(true);
      };
      reader.onerror = () => toast.error('Could not read file');
      reader.readAsDataURL(file);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Upload failed'); }
    finally { setUploadingDocId(null); }
  };

  const saveDocDetails = async (docId: string, meta: { documentNumber?: string; issueDate?: string; expiryDate?: string }) => {
    setSavingDocId(docId);
    try {
      const res = await fetch('/api/onboarding/documents/upload', {
        method: 'PATCH', headers: getPortalHeaders(),
        body: JSON.stringify({ documentId: docId, ...meta }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error || 'Save failed');
      toast.success('Document details saved');
      await fetchData(true);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Save failed'); }
    finally { setSavingDocId(null); }
  };

  const viewDocument = (doc: OnboardingDocument) => {
    if (!doc.fileUrl) return;
    const win = window.open();
    if (win) win.document.write(`<iframe src="${doc.fileUrl}" style="width:100%;height:100vh;border:none;"></iframe>`);
  };

  async function handleSubmitToHr() {
    if (!declarationAccepted) { toast.error('Please accept the declaration first (Review & Declaration step)'); setActiveStep(7); return; }
    if (declarationName.trim().length < 3) { toast.error('Please type your full name to sign the declaration'); setActiveStep(7); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/candidate-portal/onboarding/submit', {
        method: 'POST', headers: getPortalHeaders(),
        body: JSON.stringify({ declarationAccepted: true, declarationName: declarationName.trim() }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (result.code === 'INCOMPLETE' && Array.isArray(result.missing)) {
          toast.error(`Incomplete: ${(result.missing as string[]).join(', ')}`);
        } else { toast.error(result.error || 'Submit failed'); }
        return;
      }
      toast.success('Submitted to HR successfully!');
      setActiveStep(8);
      await fetchData(true);
    } finally { setSubmitting(false); }
  }

  // ─────────────── Render guards ───────────────
  if (loading) {
    return (<div className="min-h-screen bg-slate-50 flex items-center justify-center"><FiLoader className="h-8 w-8 animate-spin text-emerald-500" /></div>);
  }
  if (loadError || !data) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-lg p-8 text-center">
          <FiAlertCircle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-800 mb-2">Preboarding Portal</h2>
          <p className="text-slate-600 mb-4">{loadError || 'Preboarding has not been initiated for your profile yet.'}</p>
          <button onClick={() => router.push('/candidate-portal/dashboard')} className="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600">Back to Dashboard</button>
        </div>
      </div>
    );
  }

  const hrEmail = data.hrContact?.email || '';
  const companyLabel = data.companyName || '3Boxes HRMS';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* ── Shared portal nav (mock 04: Preboarding tab active, state-driven) ── */}
      <CandidatePortalNav state={portalState} active="preboarding" />
      {showHelp && (
        <div className="bg-emerald-50 border-b border-emerald-100">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3">
            <div className="rounded-lg p-3 text-sm grid sm:grid-cols-2 gap-2">
              <div className="flex items-center gap-2"><FiUser className="h-4 w-4 shrink-0" /> HR Contact: <strong>{data.hrContact?.name || 'HR Team'}</strong></div>
              <div className="flex items-center gap-2"><FiPhone className="h-4 w-4 shrink-0" /> {hrEmail ? <a href={`mailto:${hrEmail}`} className="underline">{hrEmail}</a> : 'Contact via your recruiter'}</div>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* ── Dashboard strip (BRD 5.4: joining date, job title, %, remaining, doc status) ── */}
        <section className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-lg font-bold text-slate-800">Your preboarding journey</h1>
            <p className="text-xs text-slate-500">
              {companyLabel}{data.jobTitle ? ` · ${data.jobTitle}` : ''}
              {data.documents.length > 0 ? ` · ${approvedDocs}/${data.documents.length} documents approved` : ''}
            </p>
          </div>
          <button onClick={() => setShowHelp(v => !v)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-200 bg-white text-emerald-700 text-[13px] font-medium hover:bg-emerald-50" aria-label="Help / Contact HR">
            <FiHelpCircle className="h-4 w-4" /> Contact HR
          </button>
        </section>
        <section className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <InfoTile icon={<FiCalendar className="h-4 w-4" />} label="Joining Date" value={data.joiningDate ? new Date(data.joiningDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'To be confirmed'} />
          <InfoTile icon={<FiBriefcase className="h-4 w-4" />} label="Job Title" value={data.jobTitle || data.designation || '—'} />
          <InfoTile icon={<FiCheckCircle className="h-4 w-4" />} label="Preboarding" value={`${completionPct}% Complete`} accent />
          <InfoTile icon={<FiClock className="h-4 w-4" />} label="Remaining Tasks" value={`${remainingTasks}`} />
          <InfoTile icon={<FiFileText className="h-4 w-4" />} label="Documents" value={`${approvedDocs} / ${data.documents.length} Approved`} />
        </section>

        {/* Correction-required banner (BRD: read-only except fields returned for correction) */}
        {correctionMode && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 flex items-start gap-3">
            <FiAlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <div className="font-semibold text-amber-800">HR returned your details for correction</div>
              <div className="text-sm text-amber-700 mt-1">{data.correctionNote}</div>
              <div className="text-xs text-amber-600 mt-1">Please update the affected sections below and resubmit.</div>
            </div>
          </div>
        )}
        {locked && (
          <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 space-y-3">
            <div className="flex items-center gap-3">
              <FiLock className="h-5 w-5 text-emerald-600 shrink-0" />
              <div className="text-sm text-emerald-800">
                <strong>Submitted to HR.</strong> Your details are now read-only while HR verifies them.
                {data.portalSubmittedAt && <> Submitted on {new Date(data.portalSubmittedAt).toLocaleString('en-IN')}.</>}
<<<<<<< HEAD
                {data.documents.some((d: any) => d.status === 'rejected' || d.status === 'resubmission_requested') && (
                  <> <strong className="text-red-700">Action required:</strong> HR has returned one or more documents — open the <strong>Document Upload</strong> step to re-upload them.</>
                )}
=======
>>>>>>> e220f68 (Complete HRMS lifecycle workflow and UI audit fixes)
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { label: 'Submitted', done: true },
                { label: 'HR review', done: false },
                { label: 'Joining confirmation', done: data.onboardingStatus === 'provisional_employee' || data.onboardingStatus === 'active_employee' },
                { label: 'Employee activation', done: data.onboardingStatus === 'active_employee' },
              ].map((s) => (
                <div key={s.label} className={`rounded-lg px-3 py-2 flex items-center gap-2 ${s.done ? 'bg-emerald-100 text-emerald-800' : 'bg-white border border-emerald-100 text-slate-500'}`}>
                  {s.done ? <FiCheck className="w-3.5 h-3.5 shrink-0" /> : <span className="w-3.5 h-3.5 rounded-full border-2 border-slate-300 shrink-0" />}
                  <span className="text-[11px] font-medium">{s.label}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-emerald-700 flex items-center gap-1.5"><FiAlertCircle className="w-3.5 h-3.5" /> Submission does not activate employee access.</p>
          </div>
        )}

        {/* ── Journey overview (mock 04) — the default view; each step opens the wizard ── */}
        {viewMode === 'overview' && (
          <>
            <section className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 flex items-start gap-3">
              <span className="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0"><FiSend className="h-4 w-4" /></span>
              <div>
                <p className="text-sm font-bold text-emerald-900">HR has initiated your preboarding.</p>
                <p className="text-xs text-emerald-800 mt-0.5">Start your preboarding before your joining date to help us get everything ready for a smooth and hassle-free onboarding.</p>
              </div>
            </section>

            <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-center gap-4">
                <div className="relative w-16 h-16 shrink-0">
                  <svg viewBox="0 0 36 36" className="w-16 h-16 -rotate-90">
                    <circle cx="18" cy="18" r="15.5" fill="none" stroke="#e2e8f0" strokeWidth="4" />
                    <circle cx="18" cy="18" r="15.5" fill="none" stroke="#059669" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${Math.min(completionPct,100) * 0.972} 100`} />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-slate-700">{completedCount} of 9</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">Preboarding progress</p>
                  <p className="text-xs text-slate-500 mt-0.5">{completedCount} of 9 steps complete</p>
                </div>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-center gap-4">
                <span className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0"><FiFileText className="h-5 w-5" /></span>
                <div>
                  <p className="text-sm font-semibold text-slate-800">Documents</p>
                  <span className={`inline-block mt-1 text-[11px] px-2 py-0.5 rounded-full font-medium ${
                    data.documents.length === 0 ? 'bg-slate-100 text-slate-600'
                    : data.documents.every((d: any) => d.status === 'approved') ? 'bg-emerald-100 text-emerald-700'
                    : data.documents.some((d: any) => d.status === 'rejected' || d.status === 'resubmission_requested') ? 'bg-red-100 text-red-700'
                    : 'bg-amber-100 text-amber-800'
                  }`}>
                    {data.documents.length === 0 ? 'No documents assigned'
<<<<<<< HEAD
                      : data.documents.every((d: any) => d.status === 'approved') ? 'All approved'
                      : data.documents.some((d: any) => d.status === 'rejected' || d.status === 'resubmission_requested') ? 'Correction requested'
                      : `${data.documents.filter((d: any) => d.status !== 'pending').length} of ${data.documents.length} submitted`}
=======
                      : data.documents.every((d: any) => d.status === 'approved') ? `All ${data.documents.length} approved`
                      : data.documents.some((d: any) => d.status === 'rejected' || d.status === 'resubmission_requested') ? `${data.documents.filter((d: any) => d.status === 'approved').length} of ${data.documents.length} approved · Correction requested`
                      : `${data.documents.filter((d: any) => d.status === 'approved').length} of ${data.documents.length} approved`}
>>>>>>> e220f68 (Complete HRMS lifecycle workflow and UI audit fixes)
                  </span>
                </div>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0"><FiHelpCircle className="h-5 w-5" /></span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800">Need help?</p>
                    <p className="text-xs text-slate-500 mt-0.5">Contact HR for any questions about preboarding.</p>
                  </div>
                </div>
                <button onClick={() => setShowHelp(v => !v)} className="px-3.5 py-2 rounded-lg border border-emerald-300 text-emerald-700 text-xs font-semibold hover:bg-emerald-50 whitespace-nowrap">Contact HR</button>
              </div>
            </section>

            <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              {STEPS.map((s, i) => {
                const st = stepStatuses[i];
                const done = st === 'submitted' || st === 'approved';
                const isCurrent = !done && st !== 'rejected' && (i === 0 || stepStatuses.slice(0, i).some((x) => x === 'submitted' || x === 'approved'));
                const locked = i === STEPS.length - 1 && !(stepStatuses.slice(0, 8).every((x) => x === 'submitted' || x === 'approved'));
                const icons = [<FiCheckCircle key="a" />, <FiUser key="b" />, <FiMapPin key="c" />, <FiUsers key="d" />, <FiBookOpen key="e" />, <FiCreditCard key="f" />, <FiUpload key="g" />, <FiFileText key="h" />, <FiLock key="i" />];
                const descriptions = [
                  'A quick overview of what to expect in your preboarding journey.',
                  'Provide your basic personal details as per official records.',
                  'Add your current and permanent address details.',
                  'Share your family details and emergency contact information.',
                  'Provide your education qualifications and relevant work experience.',
                  'Add your bank account details and statutory information (e.g., PAN, Aadhaar, etc.).',
                  'Upload the required documents as per the checklist.',
                  'Review your provided information and agree to the declaration.',
                  'Submit your completed preboarding details to HR for verification.',
                ];
                return (
                  <button
                    key={s.id}
                    onClick={() => { if (locked) { toast.error('Complete the earlier steps first — the final submission unlocks when everything is ready.'); return; } setActiveStep(i); setViewMode('step'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                    className={`w-full text-left px-5 py-4 flex items-center gap-4 border-b border-slate-100 last:border-b-0 transition-colors ${isCurrent && !done ? 'bg-emerald-50/60' : 'hover:bg-slate-50'}`}
                  >
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-bold shrink-0 ${
                      done ? 'bg-emerald-500 text-white' : st === 'rejected' ? 'bg-red-500 text-white' : isCurrent ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500'
                    }`}>{done ? <FiCheck className="h-4 w-4" /> : i + 1}</span>
                    <span className="text-emerald-600 shrink-0 hidden sm:block">{icons[i]}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-slate-800">{s.label}</span>
                      <span className="block text-xs text-slate-500 mt-0.5">{descriptions[i]}</span>
                    </span>
                    {locked ? (
                      <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 font-medium shrink-0"><FiLock className="w-3 h-3" /> Locked</span>
                    ) : done ? (
                      <span className="text-[11px] px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 font-semibold shrink-0">{st === 'approved' ? 'Approved' : 'Complete'}</span>
                    ) : st === 'rejected' ? (
                      <span className="text-[11px] px-2.5 py-1 rounded-full bg-red-100 text-red-700 font-semibold shrink-0">Needs attention</span>
                    ) : isCurrent ? (
                      <span className="text-[11px] px-3 py-1.5 rounded-full bg-emerald-600 text-white font-semibold shrink-0">Start</span>
                    ) : st === 'in_progress' ? (
                      <span className="text-[11px] px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 font-semibold shrink-0">In progress</span>
                    ) : (
                      <span className="text-[11px] px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 font-medium shrink-0">Not started</span>
                    )}
                    <FiChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                  </button>
                );
              })}
            </section>

            <section className="flex items-center justify-between gap-3 flex-wrap">
              <button onClick={() => router.push('/candidate-portal/dashboard')} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-emerald-700 hover:text-emerald-800">
                <FiArrowLeft className="w-4 h-4" /> Back to applications
              </button>
              <button
                onClick={() => { const next = STEPS.findIndex((_, i) => { const st = stepStatuses[i]; return st !== 'submitted' && st !== 'approved'; }); setActiveStep(next === -1 ? 8 : next); setViewMode('step'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700"
              >
                Continue preboarding <FiArrowRight className="w-4 h-4" />
              </button>
            </section>
          </>
        )}

        {/* ── Stepper ── */}
        {viewMode === 'step' && (
        <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 overflow-x-auto">
          <div className="flex items-center gap-1 min-w-max">
            {STEPS.map((s, i) => {
              const st = stepStatuses[i];
              const isActive = i === activeStep;
              const done = st === 'submitted' || st === 'approved';
              return (
                <div key={s.id} className="flex items-center">
                  <button
                    onClick={() => { setActiveStep(i); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                    className={`flex flex-col items-center gap-1 px-2 py-1 rounded-lg transition-colors ${isActive ? 'bg-emerald-50 ring-1 ring-emerald-300' : 'hover:bg-slate-50'}`}
                    aria-current={isActive ? 'step' : undefined}
                  >
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold border-2 ${
                      done ? 'bg-emerald-500 border-emerald-500 text-white'
                        : st === 'rejected' ? 'bg-red-500 border-red-500 text-white'
                        : st === 'in_progress' ? 'bg-blue-500 border-blue-500 text-white'
                        : isActive ? 'border-emerald-500 text-emerald-600 bg-white' : 'border-slate-300 text-slate-400 bg-white'}`}>
                      {done ? <FiCheck className="h-4 w-4" /> : st === 'rejected' ? '!' : i + 1}
                    </span>
                    <span className={`text-[11px] leading-tight w-20 text-center ${isActive ? 'text-emerald-700 font-semibold' : 'text-slate-500'}`}>{s.short}</span>
                  </button>
                  {i < STEPS.length - 1 && <div className={`h-0.5 w-4 sm:w-6 ${done ? 'bg-emerald-400' : 'bg-slate-200'}`} />}
                </div>
              );
            })}
          </div>
          <div className="mt-3 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${completionPct}%` }} /></div>
        </section>
        )}

        {/* ── Step content ── */}
        <section className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="px-5 sm:px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <button onClick={() => setViewMode('overview')} className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 hover:text-emerald-800 mb-1">
                <FiArrowLeft className="w-3 h-3" /> Preboarding journey
              </button>
              <h2 className="font-bold text-slate-800 flex items-center gap-2 text-sm sm:text-base">
                <FiEdit3 className="h-5 w-5 text-emerald-600 shrink-0" /> Step {activeStep + 1}: {STEPS[activeStep].label}
              </h2>
            </div>
            <StepStatusChip status={stepStatuses[activeStep]} />
          </div>
          <div className="px-5 sm:px-6 py-5">
            {activeStep === 0 && <WelcomeStep data={data} onNext={() => setActiveStep(1)} />}
            {activeStep === 1 && (
              <PersonalStep personal={personal} setPersonal={setPersonal} errors={errors} locked={locked} />
            )}
            {activeStep === 2 && (
              <AddressStep address={address} setAddress={setAddress} errors={errors} locked={locked} />
            )}
            {activeStep === 3 && (
              <FamilyStep family={family} setFamily={setFamily} errors={errors} locked={locked} />
            )}
            {activeStep === 4 && (
              <EducationStep
                eduRecords={eduRecords} setEduRecords={setEduRecords}
                noEducationRecords={noEducationRecords} setNoEducationRecords={setNoEducationRecords}
                prevEmployments={prevEmployments} setPrevEmployments={setPrevEmployments}
                currentEmployment={currentEmployment} setCurrentEmployment={setCurrentEmployment}
                errors={errors} locked={locked} />
            )}
            {activeStep === 5 && (
              <BankStep bank={bank} setBank={setBank} errors={errors} locked={locked} />
            )}
            {activeStep === 6 && (
              <DocumentsStep docs={data.documents} uploadingDocId={uploadingDocId} savingDocId={savingDocId} nowMs={nowMs}
                onUpload={handleFileUpload} onSaveDetails={saveDocDetails} onView={viewDocument} locked={locked}
                onNext={() => setActiveStep(7)} />
            )}
            {activeStep === 7 && (
              <ReviewStep data={data} declarationAccepted={declarationAccepted}
                setDeclarationAccepted={setDeclarationAccepted}
                declarationName={declarationName} setDeclarationName={setDeclarationName}
                locked={locked}
                onSubmit={() => { handleSubmitToHr(); }} submitting={submitting} />
            )}
            {activeStep === 8 && (
              <SubmitStep data={data} completionPct={completionPct} onSubmit={handleSubmitToHr} submitting={submitting} locked={locked} />
            )}
          </div>
          {/* Bottom nav (BRD: Previous / Save Draft / Next) */}
          {activeStep >= 1 && activeStep <= 6 && (
            <div className="px-5 sm:px-6 py-4 border-t border-slate-200 flex items-center justify-between gap-3">
              <button onClick={() => { setActiveStep(s => s - 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 text-sm hover:bg-slate-50 inline-flex items-center gap-2">
                <FiArrowLeft className="h-4 w-4" /> Previous
              </button>
              {activeStep === 1 && <SaveNext locked={locked} saving={savingSection === 'personal'} onNext={() => handleSaveAndNext('personal', validatePersonal, { ...personal })} />}
              {activeStep === 2 && <SaveNext locked={locked} saving={savingSection === 'address'} onNext={() => handleSaveAndNext('address', validateAddress, { ...address })} />}
              {activeStep === 3 && <SaveNext locked={locked} saving={savingSection === 'family'} onNext={() => handleSaveAndNext('family', validateFamily, { ...family })} />}
              {activeStep === 4 && <SaveNext locked={locked} saving={savingSection === 'education'} onNext={() => handleSaveAndNext('education', validateEducation, educationPayload())} />}
              {activeStep === 5 && <SaveNext locked={locked} saving={savingSection === 'bank'} onNext={() => handleSaveAndNext('bank', validateBank, { ...bank })} />}
              {activeStep === 6 && (
                <button onClick={() => setActiveStep(7)} className="px-5 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 inline-flex items-center gap-2">
                  Next <FiArrowRight className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
        </section>
      </main>

      <footer className="bg-white border-t border-slate-200 mt-auto">
        <div className="max-w-5xl mx-auto px-6 py-3 text-center text-xs text-slate-400">
          {companyLabel} — Candidate Preboarding Portal. Complete all steps before your joining date. Your progress is saved automatically when you click Next.
        </div>
      </footer>
    </div>
  );
}

// ─────────────────────────── Small components ───────────────────────────
function InfoTile({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${accent ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
      <div className={`flex items-center gap-1.5 text-xs ${accent ? 'text-emerald-600' : 'text-slate-500'}`}>{icon} {label}</div>
      <div className={`font-semibold mt-1 text-sm ${accent ? 'text-emerald-700' : 'text-slate-800'}`}>{value}</div>
    </div>
  );
}

function StepStatusChip({ status }: { status: StepStatus }) {
  const map: Record<StepStatus, { label: string; cls: string }> = {
    not_started: { label: 'Not Started', cls: 'text-slate-500 bg-slate-50 border-slate-200' },
    in_progress: { label: 'In Progress', cls: 'text-blue-600 bg-blue-50 border-blue-200' },
    submitted: { label: 'Submitted', cls: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
    approved: { label: 'Approved', cls: 'text-emerald-700 bg-emerald-100 border-emerald-300' },
    rejected: { label: 'Correction Required', cls: 'text-red-600 bg-red-50 border-red-200' },
  };
  const c = map[status];
  return <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${c.cls} shrink-0`}>{c.label}</span>;
}

function SaveNext({ locked, saving, onNext }: { locked: boolean; saving: boolean; onNext: () => void }) {
  if (locked) {
    return <span className="text-xs text-slate-400 inline-flex items-center gap-1.5"><FiLock className="h-3.5 w-3.5" /> Read-only — submitted to HR</span>;
  }
  return (
    <button onClick={onNext} disabled={saving}
      className="px-5 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 disabled:opacity-60 inline-flex items-center gap-2">
      {saving ? <><FiLoader className="h-4 w-4 animate-spin" /> Saving...</> : <>Save & Next <FiArrowRight className="h-4 w-4" /></>}
    </button>
  );
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="text-xs text-red-600 mt-1" role="alert">{msg}</p>;
}

function TextField({ label, value, onChange, error, type = 'text', placeholder, required, disabled, hint, maxLength }:
  { label: string; value: string; onChange: (v: string) => void; error?: string; type?: string; placeholder?: string; required?: boolean; disabled?: boolean; hint?: string; maxLength?: number }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label} {required && <span className="text-red-500">*</span>}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} disabled={disabled} maxLength={maxLength}
        className={`w-full px-3 py-2 rounded-lg border text-sm disabled:bg-slate-100 disabled:text-slate-400 ${error ? 'border-red-400 focus:ring-red-200' : 'border-slate-300 focus:ring-emerald-200'} focus:outline-none focus:ring-2`} />
      {hint && !error && <p className="text-[11px] text-slate-400 mt-1">{hint}</p>}
      <FieldError msg={error} />
    </div>
  );
}

function SelectField({ label, value, onChange, options, error, required, disabled }:
  { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; error?: string; required?: boolean; disabled?: boolean }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label} {required && <span className="text-red-500">*</span>}</label>
      <select value={value} onChange={e => onChange(e.target.value)} disabled={disabled}
        className={`w-full px-3 py-2 rounded-lg border text-sm bg-white disabled:bg-slate-100 disabled:text-slate-400 ${error ? 'border-red-400 focus:ring-red-200' : 'border-slate-300 focus:ring-emerald-200'} focus:outline-none focus:ring-2`}>
        <option value="">Select…</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <FieldError msg={error} />
    </div>
  );
}

// ─────────────────────────── Step 1: Welcome ───────────────────────────
function WelcomeStep({ data, onNext }: { data: WizardData; onNext: () => void }) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 p-6 text-center">
        <div className="w-14 h-14 rounded-full bg-emerald-500 text-white flex items-center justify-center mx-auto mb-3"><FiCheckCircle className="h-7 w-7" /></div>
        <h3 className="text-lg font-bold text-slate-800">Welcome, {data.candidateName}!</h3>
        <p className="text-sm text-slate-600 mt-1">We&apos;re excited to have you join our team. Complete these steps before your joining date.</p>
      </div>
      <div className="grid sm:grid-cols-3 gap-3 text-sm">
        <div className="border border-slate-200 rounded-lg p-3"><div className="text-xs text-slate-500 flex items-center gap-1"><FiBriefcase className="h-3.5 w-3.5" /> Job Title</div><div className="font-medium text-slate-800 mt-0.5">{data.jobTitle || data.designation || '—'}</div></div>
        <div className="border border-slate-200 rounded-lg p-3"><div className="text-xs text-slate-500 flex items-center gap-1"><FiCalendar className="h-3.5 w-3.5" /> Joining Date</div><div className="font-medium text-slate-800 mt-0.5">{data.joiningDate ? new Date(data.joiningDate).toLocaleDateString('en-IN') : '—'}</div></div>
        <div className="border border-slate-200 rounded-lg p-3"><div className="text-xs text-slate-500 flex items-center gap-1"><FiMapPin className="h-3.5 w-3.5" /> Work Location</div><div className="font-medium text-slate-800 mt-0.5">{data.workLocation || '—'}</div></div>
      </div>
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
        <strong>Important Information</strong>
        <ul className="list-disc ml-5 mt-2 space-y-1 text-blue-700">
          <li>Complete all steps before your joining date.</li>
          <li>Upload clear and valid documents (PDF, JPG or PNG, max 10MB).</li>
          <li>Contact HR in case of any issues — use the Help button above.</li>
          <li>Your progress is saved at every step, so you can resume anytime.</li>
        </ul>
      </div>
      <div className="flex justify-end">
        <button onClick={onNext} className="px-5 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 inline-flex items-center gap-2">
          Let&apos;s Get Started <FiArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ─────────────────────── Step 2: Personal Information ───────────────────────
function PersonalStep({ personal, setPersonal, errors, locked }:
  { personal: PersonalForm; setPersonal: React.Dispatch<React.SetStateAction<PersonalForm>>; errors: Record<string, string>; locked: boolean }) {
  const set = (k: keyof PersonalForm) => (v: string) => setPersonal(p => ({ ...p, [k]: v }));
  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-500">Please provide your personal details as they will be used for employee creation.</p>
      <div className="grid sm:grid-cols-3 gap-4">
        <TextField label="First Name" required value={personal.firstName} onChange={set('firstName')} error={err(errors, 'personal.firstName')} disabled={locked} />
        <TextField label="Middle Name" value={personal.middleName} onChange={set('middleName')} disabled={locked} />
        <TextField label="Last Name" required value={personal.lastName} onChange={set('lastName')} error={err(errors, 'personal.lastName')} disabled={locked} />
      </div>
      <div className="grid sm:grid-cols-3 gap-4">
        <TextField label="Date of Birth" required type="date" value={personal.dateOfBirth} onChange={set('dateOfBirth')} error={err(errors, 'personal.dateOfBirth')} disabled={locked} />
        <SelectField label="Gender" required value={personal.gender} onChange={set('gender')} error={err(errors, 'personal.gender')} disabled={locked}
          options={[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }, { value: 'other', label: 'Other' }]} />
        <TextField label="Personal Email" type="email" value={personal.personalEmail} onChange={set('personalEmail')} error={err(errors, 'personal.personalEmail')} disabled={locked} />
      </div>
      <div className="grid sm:grid-cols-3 gap-4">
        <TextField label="Mobile Number" required value={personal.mobileNumber} onChange={set('mobileNumber')} error={err(errors, 'personal.mobileNumber')} placeholder="+91 98765 43210" disabled={locked} />
        <TextField label="Alternate Mobile" value={personal.alternateMobile} onChange={set('alternateMobile')} error={err(errors, 'personal.alternateMobile')} disabled={locked} />
        <TextField label="Nationality" value={personal.nationality} onChange={set('nationality')} placeholder="e.g. Indian" disabled={locked} />
      </div>
      <div className="grid sm:grid-cols-3 gap-4">
        <SelectField label="Marital Status" value={personal.maritalStatus} onChange={set('maritalStatus')} disabled={locked}
          options={[{ value: 'single', label: 'Single' }, { value: 'married', label: 'Married' }, { value: 'other', label: 'Other' }]} />
      </div>
    </div>
  );
}

// ─────────────────────── Step 3: Address Information ───────────────────────
function AddressStep({ address, setAddress, errors, locked }:
  { address: AddressForm; setAddress: React.Dispatch<React.SetStateAction<AddressForm>>; errors: Record<string, string>; locked: boolean }) {
  const set = (k: keyof AddressForm) => (v: string) => setAddress(a => ({ ...a, [k]: v }));
  const same = address.currentSameAsPermanent;
  function toggleSame(v: boolean) {
    setAddress(a => {
      if (v) return { ...a, currentSameAsPermanent: true, currentAddressLine1: a.permanentAddressLine1, currentAddressLine2: a.permanentAddressLine2, currentCountry: a.permanentCountry, currentState: a.permanentState, currentCity: a.permanentCity, currentPincode: a.permanentPincode };
      return { ...a, currentSameAsPermanent: false };
    });
  }
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2"><FiHome className="h-4 w-4 text-emerald-600" /> Permanent Address</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <TextField label="Address Line 1" required value={address.permanentAddressLine1} onChange={set('permanentAddressLine1')} error={err(errors, 'address.permanentAddressLine1')} disabled={locked} />
          <TextField label="Address Line 2" value={address.permanentAddressLine2} onChange={set('permanentAddressLine2')} disabled={locked} />
          <TextField label="Country" required value={address.permanentCountry} onChange={set('permanentCountry')} error={err(errors, 'address.permanentCountry')} placeholder="e.g. India" disabled={locked} />
          <TextField label="State" required value={address.permanentState} onChange={set('permanentState')} error={err(errors, 'address.permanentState')} disabled={locked} />
          <TextField label="District / City" required value={address.permanentCity} onChange={set('permanentCity')} error={err(errors, 'address.permanentCity')} disabled={locked} />
          <TextField label="PIN / Postal Code" required value={address.permanentPincode} onChange={set('permanentPincode')} error={err(errors, 'address.permanentPincode')} disabled={locked} />
        </div>
      </div>
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2"><FiMapPin className="h-4 w-4 text-emerald-600" /> Current Address</h3>
        <label className="flex items-center gap-2 text-sm text-slate-600 mb-3 cursor-pointer">
          <input type="checkbox" checked={same} disabled={locked} onChange={e => toggleSame(e.target.checked)} className="w-4 h-4 accent-emerald-500" />
          Same as Permanent Address
        </label>
        {!same && (
          <div className="grid sm:grid-cols-2 gap-4">
            <TextField label="Address Line 1" required value={address.currentAddressLine1} onChange={set('currentAddressLine1')} error={err(errors, 'address.currentAddressLine1')} disabled={locked} />
            <TextField label="Address Line 2" value={address.currentAddressLine2} onChange={set('currentAddressLine2')} disabled={locked} />
            <TextField label="Country" required value={address.currentCountry} onChange={set('currentCountry')} error={err(errors, 'address.currentCountry')} disabled={locked} />
            <TextField label="State" required value={address.currentState} onChange={set('currentState')} error={err(errors, 'address.currentState')} disabled={locked} />
            <TextField label="City" required value={address.currentCity} onChange={set('currentCity')} error={err(errors, 'address.currentCity')} disabled={locked} />
            <TextField label="PIN / Postal Code" required value={address.currentPincode} onChange={set('currentPincode')} error={err(errors, 'address.currentPincode')} disabled={locked} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────── Step 4: Family & Emergency Contact ───────────────────
function FamilyStep({ family, setFamily, errors, locked }:
  { family: FamilyForm; setFamily: React.Dispatch<React.SetStateAction<FamilyForm>>; errors: Record<string, string>; locked: boolean }) {
  const set = (k: keyof FamilyForm) => (v: string) => setFamily(f => ({ ...f, [k]: v }));
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2"><FiPhone className="h-4 w-4 text-emerald-600" /> Emergency Contact</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <TextField label="Contact Person Name" required value={family.emergencyContactName} onChange={set('emergencyContactName')} error={err(errors, 'family.emergencyContactName')} disabled={locked} />
          <TextField label="Relationship" required value={family.emergencyContactRelation} onChange={set('emergencyContactRelation')} error={err(errors, 'family.emergencyContactRelation')} placeholder="e.g. Father / Spouse / Sibling" disabled={locked} />
          <TextField label="Mobile Number" required value={family.emergencyContactMobile} onChange={set('emergencyContactMobile')} error={err(errors, 'family.emergencyContactMobile')} disabled={locked} />
          <TextField label="Alternate Number" value={family.emergencyContactAlternate} onChange={set('emergencyContactAlternate')} disabled={locked} />
          <TextField label="Address (optional)" value={family.emergencyContactAddress} onChange={set('emergencyContactAddress')} disabled={locked} />
        </div>
      </div>
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-1 flex items-center gap-2"><FiUser className="h-4 w-4 text-emerald-600" /> Family Information</h3>
        <p className="text-xs text-slate-400 mb-3">Collected as required by company HR policies and benefits.</p>
        <div className="grid sm:grid-cols-3 gap-4">
          <TextField label="Father's Name" value={family.fatherName} onChange={set('fatherName')} disabled={locked} />
          <TextField label="Mother's Name" value={family.motherName} onChange={set('motherName')} disabled={locked} />
          <TextField label="Spouse's Name (if married)" value={family.spouseName} onChange={set('spouseName')} disabled={locked} />
        </div>
      </div>
    </div>
  );
}

// ─────────────────── Step 5: Education & Experience ───────────────────
function EducationStep({ eduRecords, setEduRecords, noEducationRecords, setNoEducationRecords,
  prevEmployments, setPrevEmployments, currentEmployment, setCurrentEmployment, errors, locked }:
  {
    eduRecords: EduRecord[]; setEduRecords: React.Dispatch<React.SetStateAction<EduRecord[]>>;
    noEducationRecords: boolean; setNoEducationRecords: (v: boolean) => void;
    prevEmployments: PrevEmploymentRecord[]; setPrevEmployments: React.Dispatch<React.SetStateAction<PrevEmploymentRecord[]>>;
    currentEmployment: CurrentEmploymentForm; setCurrentEmployment: React.Dispatch<React.SetStateAction<CurrentEmploymentForm>>;
    errors: Record<string, string>; locked: boolean;
  }) {
  return (
    <div className="space-y-6">
      {/* A. Education */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2"><FiAward className="h-4 w-4 text-emerald-600" /> Education Details</h3>
          {!locked && !noEducationRecords && (
            <button onClick={() => setEduRecords(r => [...r, { ...NEW_EDU_RECORD }])}
              className="text-xs px-3 py-1.5 rounded-lg border border-emerald-300 text-emerald-600 hover:bg-emerald-50">+ Add Education Record</button>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600 mb-3 cursor-pointer">
          <input type="checkbox" checked={noEducationRecords} disabled={locked} onChange={e => setNoEducationRecords(e.target.checked)} className="w-4 h-4 accent-emerald-500" />
          I am a fresher / have no formal education records to declare
        </label>
        {!noEducationRecords && (
          <div className="space-y-4">
            {eduRecords.map((r, i) => (
              <div key={i} className="border border-slate-200 rounded-lg p-4 relative">
                {!locked && eduRecords.length > 1 && (
                  <button onClick={() => setEduRecords(rec => rec.filter((_, j) => j !== i))} className="absolute top-3 right-3 text-red-400 hover:text-red-600 text-xs" aria-label="Remove record">Remove</button>
                )}
                <div className="grid sm:grid-cols-3 gap-4">
                  <TextField label="Qualification" required value={r.qualification} onChange={v => setEduRecords(rec => rec.map((x, j) => j === i ? { ...x, qualification: v } : x))} error={err(errors, `education.${i}.qualification`)} placeholder="e.g. B.Tech" disabled={locked} />
                  <TextField label="Specialization" value={r.specialization} onChange={v => setEduRecords(rec => rec.map((x, j) => j === i ? { ...x, specialization: v } : x))} placeholder="e.g. Computer Science" disabled={locked} />
                  <TextField label="Institution Name" required value={r.institutionName} onChange={v => setEduRecords(rec => rec.map((x, j) => j === i ? { ...x, institutionName: v } : x))} error={err(errors, `education.${i}.institutionName`)} disabled={locked} />
                  <TextField label="University / Board" value={r.universityBoard} onChange={v => setEduRecords(rec => rec.map((x, j) => j === i ? { ...x, universityBoard: v } : x))} disabled={locked} />
                  <TextField label="Start Year" required type="number" value={r.startYear} onChange={v => setEduRecords(rec => rec.map((x, j) => j === i ? { ...x, startYear: v } : x))} error={err(errors, `education.${i}.startYear`)} disabled={locked} />
                  <TextField label="End Year" required type="number" value={r.endYear} onChange={v => setEduRecords(rec => rec.map((x, j) => j === i ? { ...x, endYear: v } : x))} error={err(errors, `education.${i}.endYear`)} disabled={locked} />
                  <TextField label="Percentage / CGPA" value={r.percentage} onChange={v => setEduRecords(rec => rec.map((x, j) => j === i ? { ...x, percentage: v } : x))} disabled={locked} />
                </div>
              </div>
            ))}
            {err(errors, 'education.records') && <FieldError msg={err(errors, 'education.records')} />}
          </div>
        )}
      </div>

      {/* B. Previous Employment */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2"><FiBriefcase className="h-4 w-4 text-emerald-600" /> Previous Employment Details</h3>
          {!locked && (
            <button onClick={() => setPrevEmployments(r => [...r, { ...NEW_PREV_EMPLOYMENT }])}
              className="text-xs px-3 py-1.5 rounded-lg border border-emerald-300 text-emerald-600 hover:bg-emerald-50">+ Add Employment Record</button>
          )}
        </div>
        {prevEmployments.length === 0 && <p className="text-xs text-slate-400">No previous employment added. Add records if you have prior work experience.</p>}
        <div className="space-y-4">
          {prevEmployments.map((r, i) => (
            <div key={i} className="border border-slate-200 rounded-lg p-4 relative">
              {!locked && (
                <button onClick={() => setPrevEmployments(rec => rec.filter((_, j) => j !== i))} className="absolute top-3 right-3 text-red-400 hover:text-red-600 text-xs" aria-label="Remove record">Remove</button>
              )}
              <div className="grid sm:grid-cols-3 gap-4">
                <TextField label="Company Name" required value={r.companyName} onChange={v => setPrevEmployments(rec => rec.map((x, j) => j === i ? { ...x, companyName: v } : x))} disabled={locked} />
                <TextField label="Designation" required value={r.designation} onChange={v => setPrevEmployments(rec => rec.map((x, j) => j === i ? { ...x, designation: v } : x))} disabled={locked} />
                <SelectField label="Employment Type" value={r.employmentType} onChange={v => setPrevEmployments(rec => rec.map((x, j) => j === i ? { ...x, employmentType: v } : x))} disabled={locked}
                  options={[{ value: 'Full-Time', label: 'Full-Time' }, { value: 'Part-Time', label: 'Part-Time' }, { value: 'Internship', label: 'Internship' }, { value: 'Contract', label: 'Contract' }]} />
                <TextField label="Date of Joining" type="date" value={r.dateOfJoining} onChange={v => setPrevEmployments(rec => rec.map((x, j) => j === i ? { ...x, dateOfJoining: v } : x))} disabled={locked} />
                <TextField label="Last Working Date" type="date" value={r.lastWorkingDate} onChange={v => setPrevEmployments(rec => rec.map((x, j) => j === i ? { ...x, lastWorkingDate: v } : x))} error={err(errors, `employment.${i}.lastWorkingDate`)} disabled={locked} />
                <TextField label="Total Experience" value={r.totalExperience} onChange={v => setPrevEmployments(rec => rec.map((x, j) => j === i ? { ...x, totalExperience: v } : x))} placeholder="e.g. 2 years 3 months" disabled={locked} />
                <TextField label="Reason for Leaving" value={r.reasonForLeaving} onChange={v => setPrevEmployments(rec => rec.map((x, j) => j === i ? { ...x, reasonForLeaving: v } : x))} disabled={locked} />
              </div>
              <p className="text-[11px] text-slate-400 mt-2">Experience letter, relieving letter and payslips can be uploaded in the Document Upload step.</p>
            </div>
          ))}
        </div>
      </div>

      {/* C. Current Employment */}
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2"><FiBriefcase className="h-4 w-4 text-emerald-600" /> Current Employment Details</h3>
        <div className="grid sm:grid-cols-3 gap-4">
          <SelectField label="Currently Employed?" value={currentEmployment.currentlyEmployed} onChange={v => setCurrentEmployment(c => ({ ...c, currentlyEmployed: v }))} disabled={locked}
            options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} />
          <TextField label="Current Company" value={currentEmployment.currentCompany} onChange={v => setCurrentEmployment(c => ({ ...c, currentCompany: v }))} disabled={locked} />
          <TextField label="Current Designation" value={currentEmployment.currentDesignation} onChange={v => setCurrentEmployment(c => ({ ...c, currentDesignation: v }))} disabled={locked} />
          <TextField label="Notice Period" value={currentEmployment.noticePeriod} onChange={v => setCurrentEmployment(c => ({ ...c, noticePeriod: v }))} placeholder="e.g. 60 days" disabled={locked} />
          <TextField label="Last Working Date" type="date" value={currentEmployment.lastWorkingDate} onChange={v => setCurrentEmployment(c => ({ ...c, lastWorkingDate: v }))} disabled={locked} />
          <TextField label="Notice Period Buyout" value={currentEmployment.noticeBuyout} onChange={v => setCurrentEmployment(c => ({ ...c, noticeBuyout: v }))} placeholder="if applicable" disabled={locked} />
        </div>
      </div>
    </div>
  );
}

// ─────────────────── Step 6: Bank & Statutory Details ───────────────────
function BankStep({ bank, setBank, errors, locked }:
  { bank: BankForm; setBank: React.Dispatch<React.SetStateAction<BankForm>>; errors: Record<string, string>; locked: boolean }) {
  const set = (k: keyof BankForm) => (v: string) => setBank(b => ({ ...b, [k]: v }));
  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700 flex items-start gap-2">
        <FiLock className="h-4 w-4 mt-0.5 shrink-0" />
        <span>Your bank and statutory details are confidential. They are visible only to authorised HR Payroll and Finance users and are stored securely. Cancelled cheque / bank proof can be uploaded in the Document Upload step.</span>
      </div>
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2"><FiCreditCard className="h-4 w-4 text-emerald-600" /> Bank Details (for payroll)</h3>
        <div className="grid sm:grid-cols-3 gap-4">
          <TextField label="Account Holder Name" required value={bank.accountHolderName} onChange={set('accountHolderName')} error={err(errors, 'bank.accountHolderName')} disabled={locked} />
          <TextField label="Bank Name" required value={bank.bankName} onChange={set('bankName')} error={err(errors, 'bank.bankName')} disabled={locked} />
          <TextField label="Account Number" required value={bank.accountNumber} onChange={set('accountNumber')} error={err(errors, 'bank.accountNumber')} disabled={locked} />
          <TextField label="Confirm Account Number" required value={bank.confirmAccountNumber} onChange={set('confirmAccountNumber')} error={err(errors, 'bank.confirmAccountNumber')} disabled={locked} />
          <TextField label="IFSC Code" required value={bank.ifscCode} onChange={v => set('ifscCode')(v.toUpperCase())} error={err(errors, 'bank.ifscCode')} placeholder="HDFC0001234" disabled={locked} maxLength={11} />
          <TextField label="Branch Name" value={bank.branchName} onChange={set('branchName')} disabled={locked} />
          <SelectField label="Account Type" value={bank.accountType} onChange={set('accountType')} disabled={locked}
            options={[{ value: 'savings', label: 'Savings' }, { value: 'current', label: 'Current' }]} />
        </div>
      </div>
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2"><FiFileText className="h-4 w-4 text-emerald-600" /> Statutory Details (India)</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <TextField label="PAN Number" value={bank.panNumber} onChange={v => set('panNumber')(v.toUpperCase())} error={err(errors, 'bank.panNumber')} placeholder="ABCDE1234F" maxLength={10} disabled={locked} />
          <TextField label="UAN Number" value={bank.uanNumber} onChange={v => set('uanNumber')(v.replace(/\D/g, ''))} error={err(errors, 'bank.uanNumber')} placeholder="12-digit Universal Account Number" maxLength={12} disabled={locked} />
          <TextField label="PF Membership Number" value={bank.pfNumber} onChange={set('pfNumber')} disabled={locked} />
          <TextField label="ESI Number (if applicable)" value={bank.esiNumber} onChange={set('esiNumber')} disabled={locked} />
        </div>
        <p className="text-[11px] text-slate-400 mt-3">Aadhaar is collected only where there is a valid legal basis, via the Aadhaar document in the Document Upload step — never as a universal mandatory field.</p>
      </div>
    </div>
  );
}

// ─────────────────── Step 7: Document Upload ───────────────────
function DocumentsStep({ docs, uploadingDocId, savingDocId, nowMs, onUpload, onSaveDetails, onView, locked, onNext }:
  { docs: OnboardingDocument[]; uploadingDocId: string | null; savingDocId: string | null; nowMs: number; onUpload: (id: string, f: File, meta?: { documentNumber?: string; issueDate?: string; expiryDate?: string }) => void; onSaveDetails: (id: string, meta: { documentNumber?: string; issueDate?: string; expiryDate?: string }) => void; onView: (d: OnboardingDocument) => void; locked: boolean; onNext: () => void }) {
  const ref = nowMs || 0; // 0 → expiry flags hidden until the first fetch completes
  const needsAction = docs.filter((d) => d.status === 'rejected' || d.status === 'resubmission_requested');
  const expiredDocs = docs.filter((d) => d.expiryDate && ref > 0 && new Date(d.expiryDate).getTime() < ref);
  // Per-doc detail inputs (document number / issue / expiry) — keyed by doc id.
  const [details, setDetails] = useState<Record<string, { documentNumber: string; issueDate: string; expiryDate: string }>>({});
  const [openDetails, setOpenDetails] = useState<string | null>(null);
  const metaOf = (d: OnboardingDocument) => details[d.id] || {
    documentNumber: d.documentNumber || '',
    issueDate: d.issueDate ? new Date(d.issueDate).toISOString().slice(0, 10) : '',
    expiryDate: d.expiryDate ? new Date(d.expiryDate).toISOString().slice(0, 10) : '',
  };
  const setMeta = (id: string, patch: Partial<{ documentNumber: string; issueDate: string; expiryDate: string }>, base: { documentNumber: string; issueDate: string; expiryDate: string }) =>
    setDetails(prev => ({ ...prev, [id]: { ...base, ...patch } }));
  const hasUnsaved = (d: OnboardingDocument) => {
    const m = details[d.id];
    return Boolean(m && (m.documentNumber !== (d.documentNumber || '')
      || m.issueDate !== (d.issueDate ? new Date(d.issueDate).toISOString().slice(0, 10) : '')
      || m.expiryDate !== (d.expiryDate ? new Date(d.expiryDate).toISOString().slice(0, 10) : '')));
  };
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">Upload the required joining documents. Allowed formats: PDF, JPG, PNG — maximum 10MB each. Uploads are reviewed individually by HR. Re-uploading replaces the file and keeps previous versions in history — HR can still view them.</p>
      {needsAction.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
          <p className="text-sm font-bold text-amber-900 flex items-center gap-2">
            <FiAlertTriangle className="w-4 h-4" /> Action required: replace {needsAction.length === 1 ? `"${needsAction[0].documentLabel}"` : `${needsAction.length} documents`}
          </p>
          <ul className="mt-2 space-y-1.5">
            {needsAction.map((d) => (
              <li key={d.id} className="text-xs text-amber-800">
                <span className="font-semibold">{d.documentLabel}:</span> {d.reviewNotes || 'HR requested a replacement. Please upload a clear, complete copy.'}
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-amber-700 mt-2">Only the requested documents will return to HR review. Approved documents remain unchanged.</p>
        </div>
      )}
      {expiredDocs.length > 0 && (
        <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3">
          <p className="text-sm font-bold text-red-900 flex items-center gap-2">
            <FiAlertTriangle className="w-4 h-4" /> {expiredDocs.length === 1 ? `"${expiredDocs[0].documentLabel}" has expired` : `${expiredDocs.length} documents have expired`}
          </p>
          <p className="text-xs text-red-700 mt-1">Expired documents may delay your joining formalities. Please upload a renewed copy{expiredDocs.length > 1 ? ' for each' : ''}.</p>
        </div>
      )}
      {docs.map(doc => {
        const cfg = DOC_STATUS[doc.status] || DOC_STATUS.pending;
<<<<<<< HEAD
        // BRD 5.8/5.9: a rejected / resubmission-requested / expired document
        // must stay re-uploadable even after the wizard was submitted to HR —
        // HR's rejection reopens exactly that document (the whole-wizard lock
        // only protects the profile sections and approved documents).
        const isExpired = Boolean(doc.expiryDate && ref > 0 && new Date(doc.expiryDate).getTime() < ref);
        const needsFix = doc.status === 'rejected' || doc.status === 'resubmission_requested' || (isExpired && doc.status !== 'approved' && !!doc.fileUrl);
        const canUpload = doc.status !== 'approved' && (!locked ? (doc.status === 'pending' || needsFix) : needsFix);
        const canEditDetails = !locked
          ? (doc.status !== 'approved' && doc.status !== 'pending')
          : needsFix;
=======
        const canUpload = !locked && (doc.status === 'pending' || doc.status === 'rejected' || doc.status === 'resubmission_requested');
        const canEditDetails = !locked && doc.status !== 'approved' && doc.status !== 'pending';
        const isExpired = Boolean(doc.expiryDate && ref > 0 && new Date(doc.expiryDate).getTime() < ref);
>>>>>>> e220f68 (Complete HRMS lifecycle workflow and UI audit fixes)
        const base = metaOf(doc);
        return (
          <div key={doc.id} className={`p-3 rounded-lg border ${doc.status === 'rejected' || doc.status === 'resubmission_requested' ? 'border-amber-300 bg-amber-50/40 border-l-4 border-l-amber-400' : 'border-slate-200'}`}>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${doc.status === 'approved' ? 'bg-emerald-100 text-emerald-600' : doc.status === 'rejected' || doc.status === 'resubmission_requested' ? 'bg-red-100 text-red-600' : doc.status === 'submitted' ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>
                <FiFileText className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-slate-800 text-sm flex items-center gap-1.5 flex-wrap">
                  {doc.documentLabel}
                  {doc.required === false ? <span className="text-[10px] font-medium text-slate-500 bg-slate-100 border border-slate-200 rounded-full px-1.5">Optional</span> : null}
                  {doc.version ? <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1" title="Current version — previous versions are preserved for HR">v{doc.version}</span> : null}
                  {isExpired ? <span className="text-[10px] font-semibold text-red-700 bg-red-50 border border-red-200 rounded px-1">EXPIRED</span> : null}
                </div>
                <div className="text-xs text-slate-500 flex flex-wrap items-center gap-x-2">
                  {doc.fileName && <span className="truncate">{doc.fileName}</span>}
                  {doc.fileSize ? <span>({(doc.fileSize / 1024 / 1024).toFixed(2)} MB)</span> : null}
                  {doc.uploadedAt && <span>· {new Date(doc.uploadedAt).toLocaleDateString('en-IN')}</span>}
                  {doc.documentNumber && <span>· No. {doc.documentNumber}</span>}
                  {doc.expiryDate && <span className={isExpired ? 'text-red-600 font-medium' : ''}>· expires {new Date(doc.expiryDate).toLocaleDateString('en-IN')}</span>}
                </div>
                {doc.reviewNotes && <div className="text-xs text-red-600 mt-1">HR Remarks: {doc.reviewNotes}</div>}
              </div>
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${cfg.color} shrink-0 w-max`}>{cfg.label}</span>
              {doc.fileUrl && doc.status !== 'pending' && (
                <button onClick={() => onView(doc)} className="p-2 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors shrink-0" title="View uploaded document" aria-label={`View ${doc.documentLabel}`}>
                  <FiEye className="h-4 w-4" />
                </button>
              )}
              {canEditDetails && (
                <button onClick={() => setOpenDetails(openDetails === doc.id ? null : doc.id)}
                  className={`text-xs font-medium px-2.5 py-1.5 rounded-lg border shrink-0 transition-colors ${openDetails === doc.id ? 'bg-slate-700 border-slate-700 text-white' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}
                  title="Document number, issue date and expiry date">
                  Details{hasUnsaved(doc) ? ' •' : ''}
                </button>
              )}
              {canUpload && (
                <label className="cursor-pointer shrink-0">
                  <span className={`inline-flex items-center px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${uploadingDocId === doc.id ? 'bg-slate-200 text-slate-400' : 'bg-emerald-500 text-white hover:bg-emerald-600'}`}>
                    {uploadingDocId === doc.id ? <><FiLoader className="h-3 w-3 mr-1 animate-spin" /> Uploading…</> : <><FiUpload className="h-3 w-3 mr-1" /> {doc.status === 'pending' ? 'Upload' : 'Re-upload'}</>}
                  </span>
                  <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" disabled={uploadingDocId === doc.id}
                    onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(doc.id, f, base); e.target.value = ''; }} />
                </label>
              )}
            </div>
            {(openDetails === doc.id && canEditDetails) && (
              <div className="mt-3 pt-3 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">Document number</label>
                  <input type="text" value={base.documentNumber} placeholder="e.g. X1234567" onChange={e => setMeta(doc.id, { documentNumber: e.target.value }, base)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-none focus:border-emerald-400" />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">Issue date</label>
                  <input type="date" value={base.issueDate} onChange={e => setMeta(doc.id, { issueDate: e.target.value }, base)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-none focus:border-emerald-400" />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">Expiry date</label>
                  <input type="date" value={base.expiryDate} onChange={e => setMeta(doc.id, { expiryDate: e.target.value }, base)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-none focus:border-emerald-400" />
                </div>
                <button onClick={() => onSaveDetails(doc.id, base)} disabled={savingDocId === doc.id}
                  className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-800 text-white text-xs font-medium disabled:opacity-50 inline-flex items-center justify-center gap-1.5">
                  {savingDocId === doc.id ? <><FiLoader className="h-3 w-3 animate-spin" /> Saving…</> : 'Save details'}
                </button>
              </div>
            )}
          </div>
        );
      })}
      {docs.length === 0 && <div className="text-center py-6 text-slate-500 text-sm">No documents have been assigned yet. HR will configure them shortly.</div>}
      <div className="flex justify-end pt-2">
        <button onClick={onNext} className="px-5 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 inline-flex items-center gap-2">Next <FiArrowRight className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

// ─────────────────── Review helpers (module scope — not created during render) ───────────────────
function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 py-1.5 border-b border-slate-100 text-sm">
      <span className="text-slate-500 shrink-0">{label}</span>
      <span className="text-slate-800 font-medium text-right break-all">{value.trim() ? value : '—'}</span>
    </div>
  );
}

// ─────────────────── Step 8: Review & Declaration ───────────────────
function ReviewStep({ data, declarationAccepted, setDeclarationAccepted, declarationName, setDeclarationName, locked, onSubmit, submitting }:
  { data: WizardData; declarationAccepted: boolean; setDeclarationAccepted: (v: boolean) => void; declarationName: string; setDeclarationName: (v: string) => void; locked: boolean; onSubmit: () => void; submitting: boolean }) {
  const pd = data.portalDetails || {};
  const p = pd.personal || {}, a = pd.address || {}, f = pd.family || {}, b = pd.bank || {};
  const edu = pd.education || {};
  const eduRecs = Array.isArray(edu.records) ? edu.records : [];
  const prevRecs = pd.previousEmployment?.records || [];
  const fullName = [p.firstName, p.middleName, p.lastName].filter(Boolean).join(' ');
  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-500">Review all information before submitting to HR. Use the stepper above to go back and edit any section.</p>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="border border-slate-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-slate-700 mb-2">Personal Information</h4>
          <ReviewRow label="Full Name" value={fullName} />
          <ReviewRow label="Date of Birth" value={p.dateOfBirth ? new Date(p.dateOfBirth).toLocaleDateString('en-IN') : ''} />
          <ReviewRow label="Gender" value={p.gender || ''} />
          <ReviewRow label="Mobile" value={p.mobileNumber || ''} />
        </div>
        <div className="border border-slate-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-slate-700 mb-2">Address</h4>
          <ReviewRow label="Permanent" value={[a.permanentAddressLine1, a.permanentCity, a.permanentState, a.permanentPincode].filter(Boolean).join(', ')} />
          <ReviewRow label="Current" value={a.currentSameAsPermanent ? 'Same as permanent' : [a.currentAddressLine1, a.currentCity, a.currentState, a.currentPincode].filter(Boolean).join(', ')} />
          <ReviewRow label="Emergency Contact" value={f.emergencyContactName ? `${f.emergencyContactName} (${f.emergencyContactRelation || '—'})` : ''} />
        </div>
        <div className="border border-slate-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-slate-700 mb-2">Education & Experience</h4>
          <ReviewRow label="Education Records" value={edu.noEducationRecords ? 'Fresher (none declared)' : eduRecs.length ? `${eduRecs.length} record(s)` : ''} />
          <ReviewRow label="Previous Employers" value={prevRecs.length ? `${prevRecs.length} record(s)` : 'None'} />
          <ReviewRow label="Currently Employed" value={pd.currentEmployment?.currentlyEmployed === 'yes' ? 'Yes' : pd.currentEmployment?.currentlyEmployed === 'no' ? 'No' : ''} />
        </div>
        <div className="border border-slate-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-slate-700 mb-2">Bank & Statutory (masked)</h4>
          <ReviewRow label="Account Number" value={maskValue(b.accountNumber)} />
          <ReviewRow label="IFSC" value={b.ifscCode || ''} />
          <ReviewRow label="PAN" value={b.panNumber ? `${b.panNumber.slice(0, 3)}••••${b.panNumber.slice(-1)}` : ''} />
        </div>
      </div>

      <div className={`rounded-xl border p-4 ${declarationAccepted ? 'border-emerald-300 bg-emerald-50' : 'border-slate-300 bg-slate-50'}`}>
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" checked={declarationAccepted} disabled={locked} onChange={e => setDeclarationAccepted(e.target.checked)} className="w-4 h-4 mt-0.5 accent-emerald-500" />
          <span className="text-sm text-slate-700">
            I hereby declare that the information provided above is true, complete and correct to the best of my knowledge and belief.
            I understand that any false information may result in withdrawal of the offer or termination of employment.
          </span>
        </label>
        {!locked && (
          <div className="mt-3 sm:ml-7">
            <TextField label="Signature — type your full name" required value={declarationName} onChange={setDeclarationName} disabled={locked} />
          </div>
        )}
        {locked && data.declarationName && (
          <p className="text-xs text-emerald-700 mt-2 sm:ml-7">Signed by <strong>{data.declarationName}</strong> on {data.declarationAcceptedAt ? new Date(data.declarationAcceptedAt).toLocaleString('en-IN') : '—'}</p>
        )}
      </div>

      {!locked && (
        <div className="flex justify-end">
          <button onClick={onSubmit} disabled={submitting}
            className="px-6 py-2.5 rounded-lg bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 disabled:opacity-60 inline-flex items-center gap-2">
            {submitting ? <><FiLoader className="h-4 w-4 animate-spin" /> Submitting…</> : <>Save & Continue to Submit <FiArrowRight className="h-4 w-4" /></>}
          </button>
        </div>
      )}
      {locked && (
        <div className="flex justify-end">
          <span className="text-xs text-slate-400 inline-flex items-center gap-1.5"><FiLock className="h-3.5 w-3.5" /> Read-only — submitted to HR</span>
        </div>
      )}
    </div>
  );
}

// ─────────────────── Step 9: Submit to HR ───────────────────
function SubmitStep({ data, completionPct, onSubmit, submitting, locked }:
  { data: WizardData; completionPct: number; onSubmit: () => void; submitting: boolean; locked: boolean }) {
  const pd = data.portalDetails || {};
  const sectionsDone = ['personal', 'address', 'family', 'education', 'bank'].every(s => pd[s] && Object.keys(pd[s] as object).length > 0);
  const docsPending = data.documents.some(d => !d.fileUrl);
  const submitted = !!data.portalSubmittedAt;
  return (
    <div className="space-y-5">
      {submitted ? (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-6 text-center">
          <FiCheckCircle className="h-12 w-12 text-emerald-500 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-emerald-800">Submitted to HR!</h3>
          <p className="text-sm text-emerald-700 mt-1">Your preboarding details were submitted on {data.portalSubmittedAt ? new Date(data.portalSubmittedAt).toLocaleString('en-IN') : '—'}.
            HR will verify your details and documents; you will be notified if anything needs correction.</p>
          {data.correctionNote && <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 text-left"><strong>Returned for correction:</strong> {data.correctionNote}</div>}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
          <h3 className="font-semibold text-slate-800">Ready to submit?</h3>
          <ul className="text-sm space-y-2">
            <li className={`flex items-center gap-2 ${sectionsDone ? 'text-emerald-700' : 'text-amber-700'}`}>
              {sectionsDone ? <FiCheckCircle className="h-4 w-4 shrink-0" /> : <FiAlertCircle className="h-4 w-4 shrink-0" />}
              All five information sections completed
            </li>
            <li className={`flex items-center gap-2 ${!docsPending ? 'text-emerald-700' : 'text-amber-700'}`}>
              {!docsPending ? <FiCheckCircle className="h-4 w-4 shrink-0" /> : <FiAlertCircle className="h-4 w-4 shrink-0" />}
              {docsPending ? 'Some documents are not uploaded yet (you can still submit details; documents are reviewed separately)' : 'All documents uploaded'}
            </li>
            <li className={`flex items-center gap-2 ${data.declarationAcceptedAt ? 'text-emerald-700' : 'text-amber-700'}`}>
              {data.declarationAcceptedAt ? <FiCheckCircle className="h-4 w-4 shrink-0" /> : <FiAlertCircle className="h-4 w-4 shrink-0" />}
              Declaration signed (Review & Declaration step)
            </li>
          </ul>
          <p className="text-xs text-slate-400">After submitting, your details become read-only while HR verifies them. If HR finds an issue, they will return the details to you for correction.</p>
        </div>
      )}
      {!submitted && !locked && (
        <div className="flex justify-end">
          <button onClick={onSubmit} disabled={submitting}
            className="px-6 py-3 rounded-lg bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 disabled:opacity-60 inline-flex items-center gap-2 shadow-lg shadow-emerald-200">
            {submitting ? <><FiLoader className="h-4 w-4 animate-spin" /> Submitting…</> : <><FiSend className="h-4 w-4" /> Submit to HR</>}
          </button>
        </div>
      )}
      <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 text-sm text-slate-600">
        <div className="flex items-center justify-between mb-1"><span>Overall completion</span><span className="font-semibold text-emerald-600">{completionPct}%</span></div>
        <div className="h-2 bg-slate-200 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 transition-all" style={{ width: `${completionPct}%` }} /></div>
      </div>
    </div>
  );
}
