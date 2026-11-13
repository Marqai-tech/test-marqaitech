'use client';

/**
 * ConvertCandidateButton — enhanced with full onboarding form.
 *
 * Opens a modal with ALL required fields:
 * - Joining date, Department, Designation, Reporting manager
 * - Employment type, Salary/CTC, Work location, Start date
 * - Company email (auto-suggested from candidate name)
 *
 * Calls POST /api/onboarding/convert-to-draft which:
 * - Creates PreboardingCandidate (draft, NO Employee ID)
 * - Creates User account with companyEmail + Welcome@123
 * - Seeds 6 default OnboardingDocument rows
 * - Status → bgv_pending
 * - NO credentials email sent yet
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { FiUserPlus, FiX, FiLoader } from 'react-icons/fi';
import toast from 'react-hot-toast';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

export default function ConvertCandidateButton({
  offerId, applicationId, candidateId, candidateName, candidateEmail,
  defaultJoiningDate, defaultProbationDays, label, className,
}: {
  offerId?: string | null;
  applicationId?: string | null;
  candidateId?: string | null;
  candidateName?: string | null;
  candidateEmail?: string | null;
  defaultJoiningDate?: string | null;
  defaultProbationDays?: number | null;
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [converting, setConverting] = useState(false);
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);
  const [designations, setDesignations] = useState<Array<{ id: string; title: string }>>([]);
  const [managers, setManagers] = useState<Array<{ id: string; name: string }>>([]);

  const [form, setForm] = useState({
    joiningDate: '',
    departmentId: '',
    designationId: '',
    reportingManagerId: '',
    employmentType: 'full-time',
    ctc: '',
    workLocation: '',
    startDate: '',
    companyEmail: '',
  });

  // Auto-suggest company email from candidate name
  useEffect(() => {
    if (candidateName && !form.companyEmail) {
      const firstName = candidateName.split(' ')[0].toLowerCase();
      setForm(f => ({ ...f, companyEmail: `${firstName}@marqaitech.com` }));
    }
  }, [candidateName]);

  // Set default joining date
  useEffect(() => {
    if (defaultJoiningDate) {
      setForm(f => ({ ...f, joiningDate: new Date(defaultJoiningDate).toISOString().slice(0, 10), startDate: new Date(defaultJoiningDate).toISOString().slice(0, 10) }));
    } else {
      const today = new Date().toISOString().slice(0, 10);
      setForm(f => ({ ...f, joiningDate: today, startDate: today }));
    }
  }, [defaultJoiningDate]);

  // Fetch departments, designations, managers when modal opens
  useEffect(() => {
    if (!open) return;
    // Fetch departments
    fetch('/api/departments', { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : { departments: [] })
      .then(d => setDepartments(d.departments || d.data || d || []))
      .catch(() => {});
    // Fetch designations
    fetch('/api/designations', { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : { designations: [] })
      .then(d => setDesignations(d.designations || d.data || d || []))
      .catch(() => {});
    // Fetch employees for manager selection
    fetch('/api/employees?limit=50', { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : { employees: [] })
      .then(d => {
        const emps = d.employees || d.data || d || [];
        setManagers(emps.map((e: any) => ({ id: e.id, name: `${e.firstName || ''} ${e.lastName || ''}`.trim() || e.employeeId })));
      })
      .catch(() => {});
  }, [open]);

  const convert = async () => {
    if (!form.joiningDate || !form.departmentId || !form.ctc) {
      toast.error('Joining date, department, and CTC are required');
      return;
    }
    setConverting(true);
    try {
      const res = await fetch('/api/onboarding/convert-to-draft', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          offerId: offerId || undefined,
          applicationId: applicationId || undefined,
          candidateEmail: candidateEmail || undefined,
          candidateName: candidateName || undefined,
          joiningDate: form.joiningDate,
          departmentId: form.departmentId || undefined,
          designationId: form.designationId || undefined,
          reportingManagerId: form.reportingManagerId || undefined,
          employmentType: form.employmentType,
          ctc: Number(form.ctc) || undefined,
          workLocation: form.workLocation || undefined,
          startDate: form.startDate || form.joiningDate,
          companyEmail: form.companyEmail || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Conversion failed');
      toast.success(`Candidate converted! Company email: ${data.companyEmail}. Status: BGV Pending.`, { duration: 8000 });
      setOpen(false);
      // Reload page to show updated state
      if (typeof window !== 'undefined') window.location.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Conversion failed', { duration: 6000 });
    } finally { setConverting(false); }
  };

  const inputCls = 'w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400';
  const labelCls = 'block text-xs font-medium text-slate-600 mb-1';

  return (
    <>
      <button
        type="button"
        onClick={() => offerId ? router.push(`/preboarding/initiation?offerId=${encodeURIComponent(offerId)}`) : setOpen(true)}
        title={offerId ? 'Start the canonical preboarding workflow' : 'Convert to Draft Employee (start onboarding)'}
        className={className || 'inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-teal-600 text-white hover:bg-teal-700'}
      >
        <FiUserPlus className="w-3.5 h-3.5" /> {offerId ? 'Start preboarding' : (label || 'Convert to Employee')}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !converting && setOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 sticky top-0 bg-white z-10">
              <h3 className="font-semibold text-sm">Convert to Draft Employee — Onboarding</h3>
              <button onClick={() => setOpen(false)} disabled={converting}><FiX className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                This creates a <strong>Draft Employee</strong> (PreboardingCandidate). No Employee ID is generated yet.
                A company email will be created. The candidate&apos;s existing portal login stays active.
                Status changes to <strong>BGV Pending</strong>. Credentials are NOT sent to the candidate yet.
              </div>

              {candidateName && (
                <div className="bg-slate-50 rounded-lg p-3 text-sm">
                  <strong>Candidate:</strong> {candidateName} {candidateEmail && `(${candidateEmail})`}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Joining Date <span className="text-red-500">*</span></label>
                  <input type="date" value={form.joiningDate} onChange={(e) => setForm({ ...form, joiningDate: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Start Date</label>
                  <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Department <span className="text-red-500">*</span></label>
                  <select value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })} className={inputCls}>
                    <option value="">Select department</option>
                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Designation</label>
                  <select value={form.designationId} onChange={(e) => setForm({ ...form, designationId: e.target.value })} className={inputCls}>
                    <option value="">Select designation</option>
                    {designations.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Reporting Manager</label>
                  <select value={form.reportingManagerId} onChange={(e) => setForm({ ...form, reportingManagerId: e.target.value })} className={inputCls}>
                    <option value="">Select manager</option>
                    {managers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Employment Type</label>
                  <select value={form.employmentType} onChange={(e) => setForm({ ...form, employmentType: e.target.value })} className={inputCls}>
                    <option value="full-time">Full-time</option>
                    <option value="contract">Contract</option>
                    <option value="intern">Intern</option>
                    <option value="part-time">Part-time</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Annual CTC (INR) <span className="text-red-500">*</span></label>
                  <input type="number" value={form.ctc} onChange={(e) => setForm({ ...form, ctc: e.target.value })} placeholder="1200000" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Work Location</label>
                  <input type="text" value={form.workLocation} onChange={(e) => setForm({ ...form, workLocation: e.target.value })} placeholder="Hyderabad" className={inputCls} />
                </div>
                <div className="col-span-2">
                  <label className={labelCls}>Company Email <span className="text-red-500">*</span></label>
                  <input type="email" value={form.companyEmail} onChange={(e) => setForm({ ...form, companyEmail: e.target.value })} placeholder="thummala@marqaitech.com" className={inputCls} />
                  <p className="text-xs text-slate-500 mt-1">This email will be used for the employee&apos;s HRMS login. Password: Welcome@123</p>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-5 py-4 border-t sticky bottom-0 bg-white">
              <button onClick={() => setOpen(false)} disabled={converting} className="px-4 py-2 text-sm text-slate-600">Cancel</button>
              <button onClick={convert} disabled={converting} className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-2">
                {converting ? <><FiLoader className="w-4 h-4 animate-spin" /> Converting…</> : <><FiUserPlus className="w-4 h-4" /> Convert & Start Onboarding</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
