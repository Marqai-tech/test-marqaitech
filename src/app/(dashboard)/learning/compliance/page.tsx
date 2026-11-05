'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { FiShield, FiPlus, FiX, FiDownload, FiFileText, FiPenTool, FiBell } from 'react-icons/fi';
import ModuleTips from '@/components/ModuleTips';
import { useAuthStore } from '@/store/authStore';

function getAuthHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface Requirement { id: string; name: string; category: string; frequency: string; isActive: boolean; lastAssignedAt?: string | null; course?: { id: string; title: string } | null }
interface MatrixRow { employee: { id: string; employeeId: string; firstName: string; lastName: string; department?: { name: string } }; compliancePct: number; items: { requirementId: string; status: string }[] }
interface SignOff { id: string; title: string; policyVersion?: string; status: string; dueDate?: string | null; totalTargets: number; signedCount: number; pendingCount: number; signPct: number; acks?: { employee: { id: string }; status: string }[] }

const FREQ = ['one_time', 'annual', 'biannual', 'quarterly'];
const CATS = ['POSH', 'CYBERSECURITY', 'SAFETY', 'DATA_PRIVACY', 'HEALTHCARE', 'OTHER'];

export default function CompliancePage() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = ['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_manager'].includes(user?.role || '');
  const [reqs, setReqs] = useState<Requirement[]>([]);
  const [matrix, setMatrix] = useState<MatrixRow[]>([]);
  const [departments, setDepartments] = useState<{ name: string; compliancePct: number; employees: number }[]>([]);
  const [overall, setOverall] = useState(0);
  const [signoffs, setSignoffs] = useState<SignOff[]>([]);
  const [myPendingIds, setMyPendingIds] = useState<string[]>([]);
  const [courses, setCourses] = useState<{ id: string; title: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'requirements' | 'signoffs'>('requirements');
  const [showReqForm, setShowReqForm] = useState(false);
  const [showSignForm, setShowSignForm] = useState(false);
  const [reqForm, setReqForm] = useState<Record<string, unknown>>({ category: 'POSH', frequency: 'annual' });
  const [signForm, setSignForm] = useState<Record<string, unknown>>({ requiresSignature: true });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, s, co] = await Promise.all([
        fetch('/api/learning/compliance', { headers: getAuthHeaders() }).then((r) => r.json()),
        fetch('/api/learning/signoffs', { headers: getAuthHeaders() }).then((r) => r.json()),
        fetch('/api/learning/courses?compliance=true', { headers: getAuthHeaders() }).then((r) => r.json()).catch(() => ({ data: [] })),
      ]);
      if (c.error) throw new Error(c.error);
      setReqs(c.data.requirements); setMatrix(c.data.matrix); setDepartments(c.data.departments); setOverall(c.data.overall);
      setSignoffs(s.data || []); setMyPendingIds(s.myPendingIds || []);
      setCourses((co.data || []).map((x: { id: string; title: string }) => ({ id: x.id, title: x.title })));
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to load compliance data'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { queueMicrotask(load); }, [load]);

  const saveReq = async () => {
    try {
      const res = await fetch('/api/learning/compliance', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ action: 'create', ...reqForm }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      toast.success('Compliance requirement created'); setShowReqForm(false); load();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Save failed'); }
  };

  const assignNow = async (r: Requirement) => {
    try {
      const res = await fetch('/api/learning/compliance', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ action: 'assignNow', id: r.id }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      toast.success(`Auto-assigned: ${j.data.created} enrolments, ${j.data.notified} notified`); load();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Assignment failed'); }
  };

  const exportAudit = async () => {
    try {
      const res = await fetch('/api/learning/compliance', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ action: 'exportAudit' }) });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `compliance-audit-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
      URL.revokeObjectURL(url);
      toast.success('Audit report downloaded');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Export failed'); }
  };

  const pushSignoff = async () => {
    try {
      const res = await fetch('/api/learning/signoffs', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify(signForm) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      toast.success(`Sign-off campaign pushed to ${j.data.totalTargets} employees`); setShowSignForm(false); load();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Push failed'); }
  };

  const sign = async (s: SignOff) => {
    const name = prompt(`Type your full name to legally sign "${s.title}":`);
    if (!name) return;
    try {
      const res = await fetch('/api/learning/signoffs', { method: 'PATCH', headers: getAuthHeaders(), body: JSON.stringify({ signOffId: s.id, action: 'sign', signatureName: name }) });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success('Signed — acknowledgement recorded'); load();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Signing failed'); }
  };

  const remind = async (s: SignOff) => {
    try {
      const res = await fetch('/api/learning/signoffs', { method: 'PATCH', headers: getAuthHeaders(), body: JSON.stringify({ signOffId: s.id, action: 'remind' }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      toast.success(`Reminders sent to ${j.data.reminded} pending employees`);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Reminder failed'); }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold thb-text-primary flex items-center gap-2"><FiShield className="text-emerald-500" /> Compliance Tracking &amp; Audit Readiness</h1>
          <p className="text-sm thb-text-secondary mt-1">Mandatory certifications (POSH, cybersecurity, safety), recurring auto-assignment, bulk digital sign-offs and one-click audit export.</p>
        </div>
        {isAdmin && <button onClick={exportAudit} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-emerald-500 text-emerald-600 text-sm font-medium hover:bg-emerald-50"><FiDownload /> Export audit report</button>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="thb-card p-4"><div className="text-2xl font-bold text-emerald-600">{overall}%</div><div className="text-xs thb-text-secondary">Overall compliance (all departments)</div></div>
        {departments.slice(0, 3).map((d) => (
          <div key={d.name} className="thb-card p-4"><div className="text-2xl font-bold thb-text-primary">{d.compliancePct}%</div><div className="text-xs thb-text-secondary">{d.name} ({d.employees})</div>
            <div className="mt-1.5 h-1.5 rounded-full bg-gray-100 overflow-hidden"><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${d.compliancePct}%` }} /></div></div>
        ))}
      </div>

      <div className="flex gap-2">
        {([['requirements', 'Compliance tracks'], ['signoffs', 'Policy sign-offs']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-1.5 rounded-full text-xs font-medium transition ${tab === k ? 'bg-emerald-500 text-white' : 'bg-gray-100 thb-text-secondary'}`}>{label}</button>
        ))}
      </div>

      {loading ? <div className="thb-card h-64 animate-pulse" /> : tab === 'requirements' ? (
        <div className="space-y-4">
          {isAdmin ? <div className="flex justify-end"><button onClick={() => { setReqForm({ category: 'POSH', frequency: 'annual' }); setShowReqForm(true); }} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600"><FiPlus /> New requirement</button></div> : null}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {reqs.map((r) => (
              <div key={r.id} className="thb-card p-5">
                <div className="flex items-start justify-between"><FiShield className="text-emerald-500" /><span className="thb-badge thb-badge-info">{r.frequency.replace('_', ' ')}</span></div>
                <h3 className="font-semibold thb-text-primary mt-2 text-sm">{r.name}</h3>
                <p className="text-[11px] thb-text-muted mt-1">{r.category}{r.course ? ` · ${r.course.title}` : ' · no course linked'}</p>
                {isAdmin ? <button onClick={() => assignNow(r)} className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-emerald-50 text-emerald-700 font-medium hover:bg-emerald-100"><FiBell size={11} /> Auto-assign now</button> : null}
              </div>
            ))}
            {reqs.length === 0 ? <div className="thb-card p-8 text-center thb-text-muted text-sm col-span-full">No compliance requirements defined yet.</div> : null}
          </div>

          {matrix.length > 0 ? (
            <div className="thb-card overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b thb-border text-left thb-text-secondary text-xs uppercase tracking-wide">
                  <th className="px-4 py-3">Employee</th><th className="px-4 py-3">Department</th>
                  {reqs.map((r) => <th key={r.id} className="px-3 py-3 text-center" title={r.name}>{r.category.slice(0, 6)}</th>)}
                  <th className="px-4 py-3 text-center">Compliance</th>
                </tr></thead>
                <tbody>
                  {matrix.slice(0, 60).map((m) => (
                    <tr key={m.employee.id} className="border-b thb-border last:border-0 hover:bg-gray-50/60">
                      <td className="px-4 py-2.5"><span className="font-medium thb-text-primary">{m.employee.firstName} {m.employee.lastName}</span> <span className="text-[11px] thb-text-muted">{m.employee.employeeId}</span></td>
                      <td className="px-4 py-2.5 text-xs thb-text-secondary">{m.employee.department?.name || '—'}</td>
                      {m.items.map((it, i) => <td key={i} className="px-3 py-2.5 text-center">{it.status === 'complete' ? <span className="text-emerald-500 font-bold">✓</span> : it.status === 'overdue' ? <span className="text-red-400 font-bold">✗</span> : <span className="thb-text-muted">—</span>}</td>)}
                      <td className="px-4 py-2.5 text-center"><span className={`text-xs font-bold ${m.compliancePct >= 100 ? 'text-emerald-600' : m.compliancePct >= 50 ? 'text-amber-600' : 'text-red-500'}`}>{m.compliancePct}%</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-4">
          {isAdmin ? <div className="flex justify-end"><button onClick={() => setShowSignForm(true)} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600"><FiPlus /> Push policy for signature</button></div> : null}
          {signoffs.length === 0 ? <div className="thb-card p-8 text-center thb-text-muted text-sm">No sign-off campaigns yet.</div> : signoffs.map((s) => {
            const myPending = myPendingIds.includes(s.id);
            return (
              <div key={s.id} className="thb-card p-5">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap"><h3 className="font-semibold thb-text-primary text-sm inline-flex items-center gap-1.5"><FiFileText /> {s.title}</h3>
                      {s.policyVersion ? <span className="thb-badge">v{s.policyVersion}</span> : null}
                      <span className={`thb-badge ${s.status === 'closed' ? 'thb-badge-info' : 'thb-badge-success'}`}>{s.status}</span>
                      {myPending ? <span className="thb-badge thb-badge-error">Your signature pending</span> : null}
                    </div>
                    <div className="text-xs thb-text-secondary mt-1">{s.signedCount}/{s.totalTargets} signed ({s.signPct}%){s.dueDate ? ` · due ${new Date(s.dueDate).toLocaleDateString('en-IN')}` : ''}</div>
                    <div className="mt-2 h-1.5 w-full max-w-sm rounded-full bg-gray-100 overflow-hidden"><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${s.signPct}%` }} /></div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {myPending ? <button onClick={() => sign(s)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-emerald-500 text-white font-medium"><FiPenTool size={11} /> Sign now</button> : null}
                    {isAdmin && s.status !== 'closed' ? (
                      <>
                        <button onClick={() => remind(s)} className="px-3 py-1.5 text-xs rounded-md bg-amber-50 text-amber-700 font-medium hover:bg-amber-100">Remind pending</button>
                        <button onClick={async () => { await fetch('/api/learning/signoffs', { method: 'PATCH', headers: getAuthHeaders(), body: JSON.stringify({ signOffId: s.id, action: 'close' }) }); load(); }} className="px-3 py-1.5 text-xs rounded-md border thb-border thb-text-secondary">Close</button>
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Requirement form */}
      {showReqForm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setShowReqForm(false)}>
          <div className="bg-white rounded-xl w-full max-w-lg p-6 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold thb-text-primary">New compliance requirement</h2>
            <input className="w-full px-3 py-2 rounded-lg border thb-border text-sm" placeholder="Requirement name (e.g. POSH Act Training 2026) *" onChange={(e) => setReqForm({ ...reqForm, name: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <select className="px-3 py-2 rounded-lg border thb-border text-sm" onChange={(e) => setReqForm({ ...reqForm, category: e.target.value })}>{CATS.map((c) => <option key={c}>{c}</option>)}</select>
              <select className="px-3 py-2 rounded-lg border thb-border text-sm" onChange={(e) => setReqForm({ ...reqForm, frequency: e.target.value })}>{FREQ.map((f) => <option key={f}>{f}</option>)}</select>
            </div>
            <select className="w-full px-3 py-2 rounded-lg border thb-border text-sm" onChange={(e) => setReqForm({ ...reqForm, courseId: e.target.value })}>
              <option value="">Link compliance course…</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setShowReqForm(false)} className="px-4 py-2 rounded-lg border thb-border text-sm thb-text-secondary"><FiX /> Cancel</button>
              <button onClick={saveReq} className="px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium">Create</button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Sign-off form */}
      {showSignForm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setShowSignForm(false)}>
          <div className="bg-white rounded-xl w-full max-w-lg p-6 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold thb-text-primary">Push policy for bulk digital sign-off</h2>
            <input className="w-full px-3 py-2 rounded-lg border thb-border text-sm" placeholder="Policy title (e.g. Code of Conduct v3) *" onChange={(e) => setSignForm({ ...signForm, title: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <input className="px-3 py-2 rounded-lg border thb-border text-sm" placeholder="Version" onChange={(e) => setSignForm({ ...signForm, policyVersion: e.target.value })} />
              <input type="date" className="px-3 py-2 rounded-lg border thb-border text-sm" onChange={(e) => setSignForm({ ...signForm, dueDate: e.target.value })} />
            </div>
            <textarea className="w-full px-3 py-2 rounded-lg border thb-border text-sm" rows={3} placeholder="Summary shown to employees" onChange={(e) => setSignForm({ ...signForm, description: e.target.value })} />
            <p className="text-[11px] thb-text-muted">All active employees will receive a pending acknowledgement. Their e-signature is timestamped and legally binding.</p>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setShowSignForm(false)} className="px-4 py-2 rounded-lg border thb-border text-sm thb-text-secondary"><FiX /> Cancel</button>
              <button onClick={pushSignoff} className="px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium">Push to all employees</button>
            </div>
          </div>
        </div>
      ) : null}

      <ModuleTips moduleKey="learning" userRole={user?.role} />
    </div>
  );
}
