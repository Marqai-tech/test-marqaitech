'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiPlus, FiX, FiTrash2, FiDollarSign,
} from 'react-icons/fi';
import toast from 'react-hot-toast';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('nexus_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface SalaryComponent {
  name: string; type: string; category: string; calculationType: string; value: number; percentageOf: string; formula: string; isTaxable: boolean; isStatutory: boolean;
}

interface SalaryStructure {
  id: string; name: string; country: string | null; currency: string; description: string | null; status: string;
  components: SalaryComponent[];
}

export default function SalaryStructuresPage() {
  const [structures, setStructures] = useState<SalaryStructure[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedStructure, setSelectedStructure] = useState<SalaryStructure | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ name: '', country: '', currency: 'USD', description: '' });
  const [components, setComponents] = useState<SalaryComponent[]>([
    { name: 'Basic', type: 'earning', category: 'basic', calculationType: 'fixed', value: 0, percentageOf: '', formula: '', isTaxable: true, isStatutory: false },
  ]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/salary-structures', { headers: getAuthHeaders() });
      if (res.ok) { const data = await res.json(); setStructures(Array.isArray(data) ? data : data.structures || []); }
    } catch { toast.error('Failed to load salary structures'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) { toast.error('Name is required'); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/salary-structures', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ ...form, components }) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('Salary structure created');
      setShowCreateModal(false);
      setForm({ name: '', country: '', currency: 'USD', description: '' });
      setComponents([{ name: 'Basic', type: 'earning', category: 'basic', calculationType: 'fixed', value: 0, percentageOf: '', formula: '', isTaxable: true, isStatutory: false }]);
      fetchData();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Failed'); }
    finally { setSubmitting(false); }
  };

  const addComponent = () => {
    setComponents([...components, { name: '', type: 'earning', category: 'allowance', calculationType: 'fixed', value: 0, percentageOf: '', formula: '', isTaxable: true, isStatutory: false }]);
  };

  const removeComponent = (index: number) => {
    setComponents(components.filter((_, i) => i !== index));
  };

  const updateComponent = (index: number, field: string, value: string | number | boolean) => {
    const updated = [...components];
    updated[index] = { ...updated[index], [field]: value };
    setComponents(updated);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div><h1 className="text-2xl font-bold text-slate-900">Salary Structures</h1><p className="text-slate-500 mt-1">Define salary components and structures</p></div>
        <button onClick={() => setShowCreateModal(true)} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm"><FiPlus className="w-4 h-4" /> Create Structure</button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{Array.from({ length: 3 }).map((_, i) => (<div key={i} className="bg-white rounded-xl border border-slate-200 p-5 animate-pulse"><div className="h-5 w-3/4 bg-slate-200 rounded mb-2" /><div className="h-3 w-1/2 bg-slate-100 rounded" /></div>))}</div>
      ) : structures.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center"><FiDollarSign className="w-12 h-12 text-slate-300 mx-auto mb-3" /><p className="text-slate-500">No salary structures found</p></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {structures.map((s) => (
            <div key={s.id} onClick={async () => { try { const res = await fetch(`/api/salary-structures/${s.id}`, { headers: getAuthHeaders() }); if (res.ok) setSelectedStructure(await res.json()); } catch {} }} className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow cursor-pointer">
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-semibold text-slate-900">{s.name}</h3>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{s.status}</span>
              </div>
              <p className="text-sm text-slate-500">{s.country || 'Global'} · {s.currency}</p>
              <p className="text-xs text-slate-400 mt-2">{(s.components || []).length} components</p>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowCreateModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-slate-200"><h2 className="text-lg font-semibold text-slate-900">Create Salary Structure</h2><button onClick={() => setShowCreateModal(false)} className="p-1 hover:bg-slate-100 rounded-lg"><FiX className="w-5 h-5 text-slate-500" /></button></div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Name *</label><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Country</label><input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Currency</label><select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"><option value="USD">USD</option><option value="EUR">EUR</option><option value="INR">INR</option></select></div>
              </div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Description</label><textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none" /></div>

              {/* Components */}
              <div>
                <div className="flex items-center justify-between mb-3"><h3 className="text-sm font-semibold text-slate-900">Components</h3><button type="button" onClick={addComponent} className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1"><FiPlus className="w-3 h-3" /> Add</button></div>
                <div className="space-y-3 max-h-80 overflow-y-auto">
                  {components.map((comp, idx) => (
                    <div key={idx} className="p-3 border border-slate-200 rounded-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <input value={comp.name} onChange={(e) => updateComponent(idx, 'name', e.target.value)} placeholder="Component name" className="flex-1 px-2 py-1 border border-slate-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500/20" />
                        <button type="button" onClick={() => removeComponent(idx)} className="ml-2 p-1 text-red-400 hover:text-red-600"><FiTrash2 className="w-3.5 h-3.5" /></button>
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        <select value={comp.type} onChange={(e) => updateComponent(idx, 'type', e.target.value)} className="px-2 py-1 border border-slate-200 rounded text-xs focus:outline-none"><option value="earning">Earning</option><option value="deduction">Deduction</option></select>
                        <select value={comp.category} onChange={(e) => updateComponent(idx, 'category', e.target.value)} className="px-2 py-1 border border-slate-200 rounded text-xs focus:outline-none"><option value="basic">Basic</option><option value="hra">HRA</option><option value="allowance">Allowance</option><option value="pf">PF</option><option value="esi">ESI</option><option value="tax">Tax</option><option value="bonus">Bonus</option><option value="reimbursement">Reimbursement</option><option value="other">Other</option></select>
                        <select value={comp.calculationType} onChange={(e) => updateComponent(idx, 'calculationType', e.target.value)} className="px-2 py-1 border border-slate-200 rounded text-xs focus:outline-none"><option value="fixed">Fixed</option><option value="percentage">Percentage</option><option value="formula">Formula</option></select>
                        <input type="number" value={comp.value} onChange={(e) => updateComponent(idx, 'value', parseFloat(e.target.value) || 0)} placeholder="Value" className="px-2 py-1 border border-slate-200 rounded text-xs focus:outline-none" />
                      </div>
                      {comp.calculationType === 'percentage' && <input value={comp.percentageOf} onChange={(e) => updateComponent(idx, 'percentageOf', e.target.value)} placeholder="% of component" className="w-full px-2 py-1 border border-slate-200 rounded text-xs focus:outline-none" />}
                      <div className="flex items-center gap-4">
                        <label className="flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" checked={comp.isTaxable} onChange={(e) => updateComponent(idx, 'isTaxable', e.target.checked)} className="rounded" /> Taxable</label>
                        <label className="flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" checked={comp.isStatutory} onChange={(e) => updateComponent(idx, 'isStatutory', e.target.checked)} className="rounded" /> Statutory</label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4"><button type="button" onClick={() => setShowCreateModal(false)} className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200">Cancel</button><button type="submit" disabled={submitting} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">{submitting ? 'Creating...' : 'Create'}</button></div>
            </form>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedStructure && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedStructure(null)}>
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <div><h2 className="text-lg font-semibold text-slate-900">{selectedStructure.name}</h2><p className="text-sm text-slate-500">{selectedStructure.country || 'Global'} · {selectedStructure.currency}</p></div>
              <button onClick={() => setSelectedStructure(null)} className="p-1 hover:bg-slate-100 rounded-lg"><FiX className="w-5 h-5 text-slate-500" /></button>
            </div>
            <div className="p-6">
              {(selectedStructure.components || []).length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-8">No components defined</p>
              ) : (
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>{['Component', 'Type', 'Category', 'Calc', 'Value', 'Taxable', 'Statutory'].map((h) => (<th key={h} className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>))}</tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(selectedStructure.components || []).map((c, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2 text-sm font-medium text-slate-900">{c.name}</td>
                        <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${c.type === 'earning' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{c.type}</span></td>
                        <td className="px-3 py-2 text-sm text-slate-600">{c.category}</td>
                        <td className="px-3 py-2 text-sm text-slate-600">{c.calculationType}</td>
                        <td className="px-3 py-2 text-sm font-medium text-slate-900">{c.calculationType === 'percentage' ? `${c.value}%` : c.value}</td>
                        <td className="px-3 py-2 text-sm">{c.isTaxable ? '✓' : '—'}</td>
                        <td className="px-3 py-2 text-sm">{c.isStatutory ? '✓' : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
