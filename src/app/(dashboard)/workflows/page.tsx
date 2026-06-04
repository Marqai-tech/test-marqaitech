'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiPlus, FiX, FiCheck, FiXCircle, FiGitBranch,
  FiPlay,
} from 'react-icons/fi';
import toast from 'react-hot-toast';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('nexus_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface WorkflowDefinition {
  id: string; name: string; module: string; description: string | null; steps: string; isActive: boolean; version: number;
  instances?: WorkflowInstance[];
}

interface WorkflowInstance {
  id: string; entityType: string; entityId: string; currentStep: number; status: string;
  workflowDefinition?: { name: string };
  approvals?: WorkflowApproval[];
}

interface WorkflowApproval {
  id: string; stepNumber: number; approverName: string; approverRole: string; action: string | null; comments: string | null; actedAt: string | null;
}

export default function WorkflowsPage() {
  const [definitions, setDefinitions] = useState<WorkflowDefinition[]>([]);
  const [instances, setInstances] = useState<WorkflowInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'definitions' | 'instances'>('definitions');
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ name: '', module: 'leave', description: '', steps: '[{"stepNumber":1,"approverRole":"manager","isRequired":true},{"stepNumber":2,"approverRole":"hr_admin","isRequired":true}]' });

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const headers = getAuthHeaders();
      const [defRes, instRes] = await Promise.allSettled([
        fetch('/api/workflows', { headers }),
        fetch('/api/workflows/instances', { headers }),
      ]);
      if (defRes.status === 'fulfilled' && defRes.value.ok) { const data = await defRes.value.json(); setDefinitions(Array.isArray(data) ? data : data.workflows || []); }
      if (instRes.status === 'fulfilled' && instRes.value.ok) { const data = await instRes.value.json(); setInstances(Array.isArray(data) ? data : data.instances || []); }
    } catch { toast.error('Failed to load workflows'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) { toast.error('Name is required'); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/workflows', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify(form) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('Workflow created');
      setShowCreateModal(false);
      setForm({ name: '', module: 'leave', description: '', steps: '[{"stepNumber":1,"approverRole":"manager","isRequired":true},{"stepNumber":2,"approverRole":"hr_admin","isRequired":true}]' });
      fetchData();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Failed'); }
    finally { setSubmitting(false); }
  };

  const handleApproval = async (instanceId: string, approvalId: string, action: string) => {
    try {
      const res = await fetch(`/api/workflows/instances/${instanceId}`, { method: 'PATCH', headers: getAuthHeaders(), body: JSON.stringify({ approvalId, action }) });
      if (!res.ok) throw new Error('Failed');
      toast.success(`Workflow step ${action}`);
      fetchData();
    } catch { toast.error('Action failed'); }
  };

  const getStepCount = (stepsStr: string) => {
    try { return JSON.parse(stepsStr).length; } catch { return 0; }
  };

  const moduleBadge: Record<string, string> = {
    leave: 'bg-amber-100 text-amber-700', attendance: 'bg-blue-100 text-blue-700', payroll: 'bg-emerald-100 text-emerald-700', recruitment: 'bg-purple-100 text-purple-700', timesheet: 'bg-cyan-100 text-cyan-700',
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div><h1 className="text-2xl font-bold text-slate-900">Workflow Builder</h1><p className="text-slate-500 mt-1">Design and manage approval workflows</p></div>
        <button onClick={() => setShowCreateModal(true)} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm"><FiPlus className="w-4 h-4" /> Create Workflow</button>
      </div>

      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
        {(['definitions', 'instances'] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-2 rounded-md text-sm font-medium capitalize transition-colors ${activeTab === tab ? 'bg-white shadow-sm text-slate-900' : 'text-slate-600 hover:text-slate-900'}`}>{tab}</button>
        ))}
      </div>

      {activeTab === 'definitions' && (
        loading ? (
          <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => (<div key={i} className="bg-white rounded-xl border border-slate-200 p-5 animate-pulse"><div className="h-5 w-3/4 bg-slate-200 rounded mb-2" /><div className="h-3 w-1/2 bg-slate-100 rounded" /></div>))}</div>
        ) : definitions.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center"><FiGitBranch className="w-12 h-12 text-slate-300 mx-auto mb-3" /><p className="text-slate-500">No workflows defined</p></div>
        ) : (
          <div className="space-y-3">
            {definitions.map((wf) => (
              <div key={wf.id} className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white"><FiGitBranch className="w-5 h-5" /></div>
                    <div>
                      <h3 className="font-semibold text-slate-900">{wf.name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${moduleBadge[wf.module] || 'bg-slate-100 text-slate-600'}`}>{wf.module}</span>
                        <span className="text-xs text-slate-400">{getStepCount(wf.steps)} steps</span>
                        <span className="text-xs text-slate-400">v{wf.version}</span>
                      </div>
                    </div>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${wf.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{wf.isActive ? 'Active' : 'Inactive'}</span>
                </div>
                {wf.description && <p className="text-sm text-slate-500 mt-2">{wf.description}</p>}
              </div>
            ))}
          </div>
        )
      )}

      {activeTab === 'instances' && (
        loading ? (
          <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => (<div key={i} className="bg-white rounded-xl border border-slate-200 p-5 animate-pulse"><div className="h-5 w-3/4 bg-slate-200 rounded" /></div>))}</div>
        ) : instances.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center"><FiPlay className="w-12 h-12 text-slate-300 mx-auto mb-3" /><p className="text-slate-500">No workflow instances</p></div>
        ) : (
          <div className="space-y-3">
            {instances.map((inst) => (
              <div key={inst.id} className="bg-white rounded-xl border border-slate-200 p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">{inst.workflowDefinition?.name || 'Unknown'}</h3>
                    <p className="text-xs text-slate-500">{inst.entityType} · {inst.entityId.slice(0, 8)}</p>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${inst.status === 'pending' ? 'bg-amber-100 text-amber-700' : inst.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{inst.status}</span>
                </div>
                {/* Approval steps */}
                <div className="flex items-center gap-2">
                  {(inst.approvals || []).map((a) => (
                    <div key={a.id} className="flex items-center gap-1">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${a.action === 'approved' ? 'bg-emerald-100 text-emerald-700' : a.action === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
                        {a.action === 'approved' ? '✓' : a.action === 'rejected' ? '✗' : a.stepNumber}
                      </div>
                      <div className="text-xs">
                        <p className="font-medium text-slate-700">{a.approverName || a.approverRole}</p>
                        {!a.action && (
                          <div className="flex gap-1 mt-0.5">
                            <button onClick={() => handleApproval(inst.id, a.id, 'approved')} className="px-1.5 py-0.5 text-xs text-emerald-700 bg-emerald-50 rounded hover:bg-emerald-100"><FiCheck className="w-3 h-3" /></button>
                            <button onClick={() => handleApproval(inst.id, a.id, 'rejected')} className="px-1.5 py-0.5 text-xs text-red-700 bg-red-50 rounded hover:bg-red-100"><FiXCircle className="w-3 h-3" /></button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowCreateModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-slate-200"><h2 className="text-lg font-semibold text-slate-900">Create Workflow</h2><button onClick={() => setShowCreateModal(false)} className="p-1 hover:bg-slate-100 rounded-lg"><FiX className="w-5 h-5 text-slate-500" /></button></div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Name *</label><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Module</label><select value={form.module} onChange={(e) => setForm({ ...form, module: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"><option value="leave">Leave</option><option value="attendance">Attendance</option><option value="payroll">Payroll</option><option value="recruitment">Recruitment</option><option value="timesheet">Timesheet</option></select></div>
              </div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Description</label><textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none" /></div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Steps (JSON Array)</label>
                <textarea rows={6} value={form.steps} onChange={(e) => setForm({ ...form, steps: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none" />
                <p className="text-xs text-slate-400 mt-1">Each step: {`{"stepNumber":1,"approverRole":"manager","isRequired":true}`}</p>
              </div>
              <div className="flex justify-end gap-3 pt-4"><button type="button" onClick={() => setShowCreateModal(false)} className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200">Cancel</button><button type="submit" disabled={submitting} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">{submitting ? 'Creating...' : 'Create'}</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
