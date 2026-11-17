'use client';

/**
 * Task 158 — Profile Section Edit Request (self-service).
 *
 * Modal opened from the My Profile view (EmployeeDetailPage with
 * selfEmployeeId) on the Experience / Achievements / Documents / Verification
 * / Health tabs. Collects the proposed section details + a reason and submits
 * an EmployeeUpdateRequest (fieldName = section key, newValue = JSON payload)
 * via POST /api/employees/update-requests. The official record is NEVER
 * touched here — HR/Admin approval applies it (applyProfileSectionChange).
 */

import { useMemo, useState } from 'react';
import { FiX, FiPlus, FiTrash2, FiSend, FiShield } from 'react-icons/fi';

export type ProfileSection = 'experience' | 'achievements' | 'documents' | 'verification' | 'health';

const SECTION_TITLES: Record<ProfileSection, string> = {
  experience: 'Experience',
  achievements: 'Achievements',
  documents: 'Documents',
  verification: 'Verification',
  health: 'Health',
};

interface ExperienceEntry { company: string; designation: string; startDate: string; endDate: string; isCurrent: boolean; description: string; }
interface AchievementEntry { title: string; category: string; issuer: string; achievedOn: string; description: string; }
interface DocumentEntry { existingId: string | null; name: string; type: string; category: string; description: string; expiryDate: string; }

const DOC_TYPES = ['offer_letter', 'id_proof', 'contract', 'certificate', 'policy', 'other'];
const DOC_CATEGORIES = ['identification', 'onboarding', 'qualifications', 'financial', 'lifecycle', 'other'];
const ACHIEVEMENT_CATEGORIES = ['previous_company', 'certification', 'award', 'academic', 'community', 'other'];
const ID_TYPES = [
  { value: 'aadhaar', label: 'Aadhaar' },
  { value: 'pan', label: 'PAN' },
  { value: 'passport', label: 'Passport' },
  { value: 'voter_id', label: 'Voter ID' },
  { value: 'driving_license', label: 'Driving Licence' },
  { value: 'other', label: 'Other' },
];
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];
const YES_NO = [{ value: '', label: '—' }, { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }];

const inputCls = 'w-full px-3 py-2 border border-thb-border rounded-lg text-sm text-thb-text-primary bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400';
const labelCls = 'block text-[11px] font-semibold uppercase tracking-wider text-thb-text-muted mb-1';

function toDateInput(value: unknown): string {
  if (!value) return '';
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

export default function ProfileSectionEditRequest({
  section,
  employeeId,
  employee,
  onClose,
  onSubmitted,
}: {
  section: ProfileSection;
  employeeId: string;
  employee: Record<string, unknown> | null;
  onClose: () => void;
  onSubmitted: (message: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // ── prefilled state per section ──
  const initialExperiences = useMemo<ExperienceEntry[]>(() => {
    const rows = (employee?.experiences as Array<Record<string, unknown>>) || [];
    if (!rows.length) return [{ company: '', designation: '', startDate: '', endDate: '', isCurrent: false, description: '' }];
    return rows.map((r) => ({
      company: String(r.company || ''),
      designation: String(r.designation || ''),
      startDate: toDateInput(r.startDate),
      endDate: toDateInput(r.endDate),
      isCurrent: Boolean(r.isCurrent),
      description: String(r.description || ''),
    }));
  }, [employee]);
  const [experiences, setExperiences] = useState<ExperienceEntry[]>(initialExperiences);

  const initialAchievements = useMemo<AchievementEntry[]>(() => {
    const rows = (employee?.achievements as Array<Record<string, unknown>>) || [];
    if (!rows.length) return [{ title: '', category: 'previous_company', issuer: '', achievedOn: '', description: '' }];
    return rows.map((r) => ({
      title: String(r.title || ''),
      category: String(r.category || 'previous_company'),
      issuer: String(r.issuer || ''),
      achievedOn: toDateInput(r.achievedOn),
      description: String(r.description || ''),
    }));
  }, [employee]);
  const [achievements, setAchievements] = useState<AchievementEntry[]>(initialAchievements);

  const initialDocuments = useMemo<DocumentEntry[]>(() => {
    const rows = (employee?.documents as Array<Record<string, unknown>>) || [];
    if (!rows.length) return [{ existingId: null, name: '', type: 'other', category: 'other', description: '', expiryDate: '' }];
    return rows.map((r) => ({
      existingId: r.id ? String(r.id) : null,
      name: String(r.name || ''),
      type: String(r.type || 'other'),
      category: String(r.category || 'other'),
      description: String(r.description || ''),
      expiryDate: toDateInput(r.expiryDate),
    }));
  }, [employee]);
  const [documents, setDocuments] = useState<DocumentEntry[]>(initialDocuments);

  const kyc = useMemo<Record<string, unknown>>(() => {
    try {
      const raw = employee?.kycVerification as string | null | undefined;
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  }, [employee]);
  const [verification, setVerification] = useState({
    fullName: String(kyc.fullName || ''),
    idType: String(kyc.idType || 'aadhaar'),
    idNumber: String(kyc.idNumber || ''),
    address: String(kyc.address || ''),
    note: String(kyc.note || ''),
  });

  const healthRow = useMemo<Record<string, unknown>>(() => (employee || {}), [employee]);
  const [health, setHealth] = useState({
    bloodGroup: String(healthRow.bloodGroup || ''),
    hasChronicIllness: String(healthRow.hasChronicIllness || ''),
    chronicIllnessDetails: String(healthRow.chronicIllnessDetails || ''),
    hasAllergies: String(healthRow.hasAllergies || ''),
    allergyDetails: String(healthRow.allergyDetails || ''),
    hasDisability: String(healthRow.hasDisability || ''),
    disabilityDetails: String(healthRow.disabilityDetails || ''),
    isOnMedication: String(healthRow.isOnMedication || ''),
    medicationDetails: String(healthRow.medicationDetails || ''),
    hasHadSurgery: String(healthRow.hasHadSurgery || ''),
    surgeryDetails: String(healthRow.surgeryDetails || ''),
    emergencyMedicalCondition: String(healthRow.emergencyMedicalCondition || ''),
    primaryPhysicianName: String(healthRow.primaryPhysicianName || ''),
    primaryPhysicianPhone: String(healthRow.primaryPhysicianPhone || ''),
    healthInsuranceProvider: String(healthRow.healthInsuranceProvider || ''),
    healthInsurancePolicyNo: String(healthRow.healthInsurancePolicyNo || ''),
  });

  const buildPayload = (): Record<string, unknown> | null => {
    if (section === 'experience') {
      return {
        entries: experiences
          .filter((e) => e.company.trim() || e.designation.trim())
          .map((e) => ({ ...e, isCurrent: e.isCurrent || !e.endDate })),
      };
    }
    if (section === 'achievements') {
      return { entries: achievements.filter((a) => a.title.trim()) };
    }
    if (section === 'documents') {
      return { entries: documents.filter((d) => d.name.trim()) };
    }
    if (section === 'verification') return verification;
    return health;
  };

  const submit = async () => {
    setError('');
    const payload = buildPayload();
    if (!payload) return;
    setBusy(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
      const res = await fetch('/api/employees/update-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          employeeId,
          fieldName: section,
          newValue: JSON.stringify(payload),
          reason: reason.trim(),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Failed to submit the request');
      onSubmitted(d.message || `${SECTION_TITLES[section]} edit submitted for HR approval`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to submit the request');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm overflow-y-auto">
      <div className="thb-card w-full max-w-3xl my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-thb-border">
          <div>
            <h3 className="text-lg font-semibold text-thb-text-primary flex items-center gap-2">
              Request {SECTION_TITLES[section]} Edit
            </h3>
            <p className="text-xs text-thb-text-muted mt-0.5 flex items-center gap-1">
              <FiShield className="w-3 h-3 text-teal-500" />
              Your submission goes to HR for approval — the official record updates only after approval.
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-thb-text-muted" aria-label="Close">
            <FiX className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4 max-h-[62vh] overflow-y-auto">
          {section === 'experience' && (
            <div className="space-y-4">
              {experiences.map((entry, idx) => (
                <div key={idx} className="p-4 rounded-xl border border-thb-border bg-slate-50/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-thb-text-secondary">Employer {idx + 1}</p>
                    {experiences.length > 1 && (
                      <button onClick={() => setExperiences((prev) => prev.filter((_, i) => i !== idx))} className="text-red-500 hover:text-red-600" aria-label="Remove">
                        <FiTrash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div><label className={labelCls}>Company *</label><input className={inputCls} value={entry.company} onChange={(e) => setExperiences((p) => p.map((x, i) => i === idx ? { ...x, company: e.target.value } : x))} placeholder="Company name" /></div>
                    <div><label className={labelCls}>Designation *</label><input className={inputCls} value={entry.designation} onChange={(e) => setExperiences((p) => p.map((x, i) => i === idx ? { ...x, designation: e.target.value } : x))} placeholder="Job title" /></div>
                    <div><label className={labelCls}>Start Date *</label><input type="date" className={inputCls} value={entry.startDate} onChange={(e) => setExperiences((p) => p.map((x, i) => i === idx ? { ...x, startDate: e.target.value } : x))} /></div>
                    <div>
                      <label className={labelCls}>End Date {!entry.isCurrent ? '*' : '(current job)'}</label>
                      <input type="date" className={inputCls} value={entry.endDate} disabled={entry.isCurrent} onChange={(e) => setExperiences((p) => p.map((x, i) => i === idx ? { ...x, endDate: e.target.value } : x))} />
                    </div>
                  </div>
                  <label className="inline-flex items-center gap-2 text-xs font-medium text-thb-text-secondary">
                    <input type="checkbox" checked={entry.isCurrent} onChange={(e) => setExperiences((p) => p.map((x, i) => i === idx ? { ...x, isCurrent: e.target.checked, endDate: e.target.checked ? '' : x.endDate } : x))} className="rounded border-thb-border text-teal-600" />
                    I currently work here
                  </label>
                  <div><label className={labelCls}>Description</label><textarea rows={2} className={inputCls} value={entry.description} onChange={(e) => setExperiences((p) => p.map((x, i) => i === idx ? { ...x, description: e.target.value } : x))} placeholder="Role, responsibilities, key contributions…" /></div>
                </div>
              ))}
              <button onClick={() => setExperiences((p) => [...p, { company: '', designation: '', startDate: '', endDate: '', isCurrent: false, description: '' }])} className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-600 hover:text-teal-700">
                <FiPlus className="w-3.5 h-3.5" /> Add another employer
              </button>
            </div>
          )}

          {section === 'achievements' && (
            <div className="space-y-4">
              {achievements.map((entry, idx) => (
                <div key={idx} className="p-4 rounded-xl border border-thb-border bg-slate-50/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-thb-text-secondary">Achievement {idx + 1}</p>
                    {achievements.length > 1 && (
                      <button onClick={() => setAchievements((prev) => prev.filter((_, i) => i !== idx))} className="text-red-500 hover:text-red-600" aria-label="Remove">
                        <FiTrash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div><label className={labelCls}>Title *</label><input className={inputCls} value={entry.title} onChange={(e) => setAchievements((p) => p.map((x, i) => i === idx ? { ...x, title: e.target.value } : x))} placeholder="e.g. Best Performer 2025" /></div>
                    <div>
                      <label className={labelCls}>Category</label>
                      <select className={inputCls} value={entry.category} onChange={(e) => setAchievements((p) => p.map((x, i) => i === idx ? { ...x, category: e.target.value } : x))}>
                        {ACHIEVEMENT_CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
                      </select>
                    </div>
                    <div><label className={labelCls}>Issued By</label><input className={inputCls} value={entry.issuer} onChange={(e) => setAchievements((p) => p.map((x, i) => i === idx ? { ...x, issuer: e.target.value } : x))} placeholder="Company / organisation" /></div>
                    <div><label className={labelCls}>Achieved On</label><input type="date" className={inputCls} value={entry.achievedOn} onChange={(e) => setAchievements((p) => p.map((x, i) => i === idx ? { ...x, achievedOn: e.target.value } : x))} /></div>
                  </div>
                  <div><label className={labelCls}>Description</label><textarea rows={2} className={inputCls} value={entry.description} onChange={(e) => setAchievements((p) => p.map((x, i) => i === idx ? { ...x, description: e.target.value } : x))} /></div>
                </div>
              ))}
              <button onClick={() => setAchievements((p) => [...p, { title: '', category: 'previous_company', issuer: '', achievedOn: '', description: '' }])} className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-600 hover:text-teal-700">
                <FiPlus className="w-3.5 h-3.5" /> Add another achievement
              </button>
            </div>
          )}

          {section === 'documents' && (
            <div className="space-y-4">
              <p className="text-xs text-thb-text-muted bg-amber-50 border border-amber-100 rounded-lg p-3">
                File attachments are handled by HR — this request records/updates document details. Existing documents not listed here stay untouched.
              </p>
              {documents.map((entry, idx) => (
                <div key={idx} className="p-4 rounded-xl border border-thb-border bg-slate-50/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-thb-text-secondary">{entry.existingId ? 'Existing document' : 'New document'} {idx + 1}</p>
                    {documents.length > 1 && (
                      <button onClick={() => setDocuments((prev) => prev.filter((_, i) => i !== idx))} className="text-red-500 hover:text-red-600" aria-label="Remove">
                        <FiTrash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div><label className={labelCls}>Name *</label><input className={inputCls} value={entry.name} onChange={(e) => setDocuments((p) => p.map((x, i) => i === idx ? { ...x, name: e.target.value } : x))} placeholder="e.g. Relieving Letter - ABC Corp" /></div>
                    <div>
                      <label className={labelCls}>Type</label>
                      <select className={inputCls} value={entry.type} onChange={(e) => setDocuments((p) => p.map((x, i) => i === idx ? { ...x, type: e.target.value } : x))}>
                        {DOC_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Category</label>
                      <select className={inputCls} value={entry.category} onChange={(e) => setDocuments((p) => p.map((x, i) => i === idx ? { ...x, category: e.target.value } : x))}>
                        {DOC_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div><label className={labelCls}>Expiry Date</label><input type="date" className={inputCls} value={entry.expiryDate} onChange={(e) => setDocuments((p) => p.map((x, i) => i === idx ? { ...x, expiryDate: e.target.value } : x))} /></div>
                  </div>
                  <div><label className={labelCls}>Description</label><input className={inputCls} value={entry.description} onChange={(e) => setDocuments((p) => p.map((x, i) => i === idx ? { ...x, description: e.target.value } : x))} /></div>
                </div>
              ))}
              <button onClick={() => setDocuments((p) => [...p, { existingId: null, name: '', type: 'other', category: 'other', description: '', expiryDate: '' }])} className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-600 hover:text-teal-700">
                <FiPlus className="w-3.5 h-3.5" /> Add another document
              </button>
            </div>
          )}

          {section === 'verification' && (
            <div className="space-y-3">
              <p className="text-xs text-thb-text-muted bg-sky-50 border border-sky-100 rounded-lg p-3">
                Submit your identity details for verification. HR reviews and confirms them before your record is marked verified.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className={labelCls}>Full Name (as on ID) *</label><input className={inputCls} value={verification.fullName} onChange={(e) => setVerification((p) => ({ ...p, fullName: e.target.value }))} /></div>
                <div>
                  <label className={labelCls}>ID Type *</label>
                  <select className={inputCls} value={verification.idType} onChange={(e) => setVerification((p) => ({ ...p, idType: e.target.value }))}>
                    {ID_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div><label className={labelCls}>ID Number *</label><input className={inputCls} value={verification.idNumber} onChange={(e) => setVerification((p) => ({ ...p, idNumber: e.target.value }))} /></div>
                <div><label className={labelCls}>Address (as on ID)</label><input className={inputCls} value={verification.address} onChange={(e) => setVerification((p) => ({ ...p, address: e.target.value }))} /></div>
              </div>
              <div><label className={labelCls}>Note to HR</label><textarea rows={2} className={inputCls} value={verification.note} onChange={(e) => setVerification((p) => ({ ...p, note: e.target.value }))} /></div>
            </div>
          )}

          {section === 'health' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Blood Group</label>
                  <select className={inputCls} value={health.bloodGroup} onChange={(e) => setHealth((p) => ({ ...p, bloodGroup: e.target.value }))}>
                    <option value="">—</option>
                    {BLOOD_GROUPS.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div><label className={labelCls}>Emergency Medical Condition</label><input className={inputCls} value={health.emergencyMedicalCondition} onChange={(e) => setHealth((p) => ({ ...p, emergencyMedicalCondition: e.target.value }))} /></div>
              </div>
              {([
                ['hasChronicIllness', 'chronicIllnessDetails', 'Chronic Illness', 'Chronic Illness Details'],
                ['hasAllergies', 'allergyDetails', 'Allergies', 'Allergy Details'],
                ['hasDisability', 'disabilityDetails', 'Disability', 'Disability Details'],
                ['isOnMedication', 'medicationDetails', 'On Medication', 'Medication Details'],
                ['hasHadSurgery', 'surgeryDetails', 'Previous Surgery', 'Surgery Details'],
              ] as const).map(([flagKey, detailKey, flagLabel, detailLabel]) => (
                <div key={flagKey} className="grid grid-cols-1 sm:grid-cols-[10rem_1fr] gap-3 items-start p-3 rounded-lg border border-thb-border bg-slate-50/60">
                  <div>
                    <label className={labelCls}>{flagLabel}</label>
                    <select className={inputCls} value={String(health[flagKey] || '')} onChange={(e) => setHealth((p) => ({ ...p, [flagKey]: e.target.value }))}>
                      {YES_NO.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>{detailLabel}</label>
                    <input className={inputCls} value={String(health[detailKey] || '')} onChange={(e) => setHealth((p) => ({ ...p, [detailKey]: e.target.value }))} />
                  </div>
                </div>
              ))}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className={labelCls}>Primary Physician</label><input className={inputCls} value={health.primaryPhysicianName} onChange={(e) => setHealth((p) => ({ ...p, primaryPhysicianName: e.target.value }))} /></div>
                <div><label className={labelCls}>Physician Phone</label><input className={inputCls} value={health.primaryPhysicianPhone} onChange={(e) => setHealth((p) => ({ ...p, primaryPhysicianPhone: e.target.value }))} /></div>
                <div><label className={labelCls}>Insurance Provider</label><input className={inputCls} value={health.healthInsuranceProvider} onChange={(e) => setHealth((p) => ({ ...p, healthInsuranceProvider: e.target.value }))} /></div>
                <div><label className={labelCls}>Policy Number</label><input className={inputCls} value={health.healthInsurancePolicyNo} onChange={(e) => setHealth((p) => ({ ...p, healthInsurancePolicyNo: e.target.value }))} /></div>
              </div>
            </div>
          )}

          <div>
            <label className={labelCls}>Reason / note for HR</label>
            <textarea rows={2} className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this change needed?" />
          </div>

          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg p-3">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-thb-border">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-thb-border text-sm font-medium text-thb-text-secondary hover:bg-slate-50">Cancel</button>
          <button
            onClick={submit}
            disabled={busy}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 disabled:opacity-50 shadow-sm"
          >
            <FiSend className="w-3.5 h-3.5" />
            {busy ? 'Submitting…' : 'Submit for HR Approval'}
          </button>
        </div>
      </div>
    </div>
  );
}
