'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiPlus, FiX, FiTrash2, FiDollarSign, FiEye, FiEdit2,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import ModuleTips from '@/components/ModuleTips';
import ModuleWorkflow from '@/components/ModuleWorkflow';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface SalaryComponent {
  name: string; type: string; category: string; calculationType: string; value: number; percentageOf: string; formula: string; isTaxable: boolean; isStatutory: boolean;
}

interface SalaryStructure {
  id: string; name: string; country: string | null; currency: string; description: string | null; status: string;
  components: SalaryComponent[];
}

function getStatusBadge(status: string) {
  const map: Record<string, string> = {
    active: 'nexus-badge nexus-badge-success',
    inactive: 'nexus-badge bg-slate-100 text-slate-600',
    draft: 'nexus-badge nexus-badge-warning',
  };
  return map[status] || 'nexus-badge nexus-badge-info';
}

const salaryStructuresTips = [
  { title: 'CTC Templates', description: 'Create reusable CTC templates with pre-defined salary components to standardize compensation across the organization.' },
  { title: 'Component Mapping', description: 'Map each salary component to the correct category — earnings, deductions, allowances, or statutory contributions.' },
  { title: 'Tax Implications', description: 'Mark taxable and non-taxable components correctly to ensure accurate tax calculations for employees.' },
  { title: 'Variable Pay', description: 'Configure performance-based components like bonuses and incentives as percentage or formula-based calculations.' },
  { title: 'Review Cycles', description: 'Schedule periodic reviews of salary structures to keep them aligned with market trends and compliance changes.' },
];

const salaryStructuresWorkflowSteps = [
  { step: 1, title: 'Define Components', description: 'Create individual salary components' },
  { step: 2, title: 'Create CTC Template', description: 'Build the overall CTC structure' },
  { step: 3, title: 'Map Components', description: 'Assign components to the structure' },
  { step: 4, title: 'Configure Tax Rules', description: 'Set taxable and statutory flags' },
  { step: 5, title: 'Assign to Employees', description: 'Link structures to employee profiles' },
  { step: 6, title: 'Test Calculations', description: 'Verify salary breakdown accuracy' },
  { step: 7, title: 'Activate Structure', description: 'Enable the structure for payroll' },
];

const initialForm = { name: '', country: '', currency: 'USD', description: '' };
const initialComponents: SalaryComponent[] = [
  { name: 'Basic', type: 'earning', category: 'basic', calculationType: 'fixed', value: 0, percentageOf: '', formula: '', isTaxable: true, isStatutory: false },
];

export default function SalaryStructuresPage() {
  const { user } = useAuthStore();
  const [structures, setStructures] = useState<SalaryStructure[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [viewingStructure, setViewingStructure] = useState<SalaryStructure | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [components, setComponents] = useState<SalaryComponent[]>([...initialComponents]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/salary-structures', { headers: getAuthHeaders() });
      if (res.ok) { const data = await res.json(); setStructures(Array.isArray(data) ? data : data.structures || []); }
    } catch { toast.error('Failed to load salary structures'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleAddNew = () => {
    setForm(initialForm);
    setComponents([...initialComponents]);
    setEditingId(null);
    setShowForm(true);
    setViewingId(null);
    setViewingStructure(null);
    setTimeout(() => document.getElementById('crud-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const handleEdit = (s: SalaryStructure) => {
    setForm({
      name: s.name,
      country: s.country || '',
      currency: s.currency,
      description: s.description || '',
    });
    setComponents((s.components && s.components.length > 0) ? [...s.components] : [...initialComponents]);
    setEditingId(s.id);
    setShowForm(true);
    setViewingId(null);
    setViewingStructure(null);
    setTimeout(() => document.getElementById('crud-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const handleCancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(initialForm);
    setComponents([...initialComponents]);
  };

  const handleView = async (s: SalaryStructure) => {
    setViewingId(s.id);
    setViewLoading(true);
    try {
      const res = await fetch(`/api/salary-structures/${s.id}`, { headers: getAuthHeaders() });
      if (res.ok) {
        setViewingStructure(await res.json());
      } else {
        setViewingStructure(s);
      }
    } catch {
      setViewingStructure(s);
    } finally {
      setViewLoading(false);
      setShowForm(false);
      setTimeout(() => document.getElementById('view-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    }
  };

  const handleSubmit = async () => {
    if (!form.name) { toast.error('Name is required'); return; }
    setSubmitting(true);
    try {
      if (editingId) {
        const res = await fetch(`/api/salary-structures/${editingId}`, {
          method: 'PATCH',
          headers: getAuthHeaders(),
          body: JSON.stringify({ ...form, components }),
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed to update'); }
        toast.success('Salary structure updated');
      } else {
        const res = await fetch('/api/salary-structures', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ ...form, components }),
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed to create'); }
        toast.success('Salary structure created');
      }
      handleCancelForm();
      fetchData();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Failed'); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (id: string) => {
    try {
      setDeleting(true);
      const res = await fetch(`/api/salary-structures/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed to delete'); }
      toast.success('Salary structure deleted');
      setDeleteConfirmId(null);
      if (viewingId === id) { setViewingId(null); setViewingStructure(null); }
      fetchData();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Failed to delete'); }
    finally { setDeleting(false); }
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-nexus-text-primary flex items-center gap-2">
            <FiDollarSign className="w-6 h-6 text-emerald-500" />
            Salary Structures
          </h1>
          <p className="text-nexus-text-secondary mt-1">Define salary components and structures</p>
        </div>
        <button onClick={handleAddNew} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium text-sm shadow-sm shadow-blue-500/25 transition-colors">
          <FiPlus className="w-4 h-4" /> Create Structure
        </button>
      </div>

      <ModuleTips moduleKey="salary_structures" title="Salary Structure Tips" tips={salaryStructuresTips} userRole={user?.role} />
      <ModuleWorkflow moduleKey="salary_structures" title="How to Create Salary Structures" subtitle="Follow this workflow to set up compensation templates" steps={salaryStructuresWorkflowSteps} accentColor="emerald" userRole={user?.role} />

      {/* View-only Panel */}
      {viewingId && (
        <div id="view-panel" className="nexus-card border-l-4 border-l-emerald-500">
          <div className="p-6">
            {viewLoading ? (
              <div className="flex items-center justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" /></div>
            ) : viewingStructure ? (
              <>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-lg font-semibold text-nexus-text-primary">{viewingStructure.name}</h2>
                    <p className="text-sm text-nexus-text-secondary mt-0.5">{viewingStructure.country || 'Global'} · {viewingStructure.currency}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleEdit(viewingStructure)} className="px-3 py-1.5 rounded-lg bg-blue-500 text-white text-xs font-medium hover:bg-blue-600 transition-colors flex items-center gap-1">
                      <FiEdit2 className="w-3.5 h-3.5" />Edit
                    </button>
                    <button onClick={() => { setViewingId(null); setViewingStructure(null); }} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors">
                      <FiX className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  <div>
                    <span className="text-xs font-medium text-nexus-text-secondary">Name</span>
                    <p className="text-sm font-medium text-nexus-text-primary mt-0.5">{viewingStructure.name}</p>
                  </div>
                  <div>
                    <span className="text-xs font-medium text-nexus-text-secondary">Country</span>
                    <p className="text-sm font-medium text-nexus-text-primary mt-0.5">{viewingStructure.country || 'Global'}</p>
                  </div>
                  <div>
                    <span className="text-xs font-medium text-nexus-text-secondary">Currency</span>
                    <p className="text-sm font-medium text-nexus-text-primary mt-0.5">{viewingStructure.currency}</p>
                  </div>
                  <div>
                    <span className="text-xs font-medium text-nexus-text-secondary">Status</span>
                    <p className="mt-0.5"><span className={getStatusBadge(viewingStructure.status)}>{viewingStructure.status}</span></p>
                  </div>
                </div>

                {viewingStructure.description && (
                  <div className="mb-6">
                    <span className="text-xs font-medium text-nexus-text-secondary">Description</span>
                    <p className="text-sm text-nexus-text-primary mt-0.5 bg-slate-50 p-3 rounded-lg">{viewingStructure.description}</p>
                  </div>
                )}

                {/* Components Table */}
                <div>
                  <h3 className="text-sm font-semibold text-nexus-text-primary mb-3">
                    Components ({(viewingStructure.components || []).length})
                  </h3>
                  {(viewingStructure.components || []).length === 0 ? (
                    <p className="text-sm text-nexus-text-secondary text-center py-6">No components defined</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-nexus-border bg-slate-50/50">
                            <th className="text-left px-3 py-2 text-xs font-semibold text-nexus-text-secondary uppercase">Component</th>
                            <th className="text-left px-3 py-2 text-xs font-semibold text-nexus-text-secondary uppercase">Type</th>
                            <th className="text-left px-3 py-2 text-xs font-semibold text-nexus-text-secondary uppercase">Category</th>
                            <th className="text-left px-3 py-2 text-xs font-semibold text-nexus-text-secondary uppercase">Calc</th>
                            <th className="text-left px-3 py-2 text-xs font-semibold text-nexus-text-secondary uppercase">Value</th>
                            <th className="text-left px-3 py-2 text-xs font-semibold text-nexus-text-secondary uppercase">Taxable</th>
                            <th className="text-left px-3 py-2 text-xs font-semibold text-nexus-text-secondary uppercase">Statutory</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-nexus-border/50">
                          {(viewingStructure.components || []).map((c, i) => (
                            <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-3 py-2 text-sm font-medium text-nexus-text-primary">{c.name}</td>
                              <td className="px-3 py-2"><span className={`nexus-badge ${c.type === 'earning' ? 'nexus-badge-success' : 'nexus-badge-error'}`}>{c.type}</span></td>
                              <td className="px-3 py-2 text-sm text-nexus-text-secondary">{c.category}</td>
                              <td className="px-3 py-2 text-sm text-nexus-text-secondary">{c.calculationType}</td>
                              <td className="px-3 py-2 text-sm font-medium text-nexus-text-primary">{c.calculationType === 'percentage' ? `${c.value}%` : c.value}</td>
                              <td className="px-3 py-2 text-sm text-nexus-text-secondary">{c.isTaxable ? 'Yes' : 'No'}</td>
                              <td className="px-3 py-2 text-sm text-nexus-text-secondary">{c.isStatutory ? 'Yes' : 'No'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-nexus-text-secondary text-center py-6">Structure not found</p>
            )}
          </div>
        </div>
      )}

      {/* Embedded Form */}
      {showForm && (
        <div id="crud-form" className="nexus-card border-l-4 border-l-blue-500">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-nexus-text-primary">
                {editingId ? 'Edit Salary Structure' : 'Create Salary Structure'}
              </h2>
              <button onClick={handleCancelForm} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors">
                <FiX className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Name *</label>
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Structure name" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Country</label>
                <input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="e.g. India" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Currency</label>
                <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="INR">INR</option>
                </select>
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Description</label>
              <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none" placeholder="Description..." />
            </div>

            {/* Components */}
            <div className="mt-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-nexus-text-primary">Components</h3>
                <button type="button" onClick={addComponent} className="text-xs font-medium text-blue-500 hover:text-blue-600 flex items-center gap-1">
                  <FiPlus className="w-3 h-3" /> Add Component
                </button>
              </div>
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {components.map((comp, idx) => (
                  <div key={idx} className="p-3 border border-nexus-border rounded-lg space-y-2 bg-slate-50/50">
                    <div className="flex items-center justify-between">
                      <input value={comp.name} onChange={(e) => updateComponent(idx, 'name', e.target.value)} placeholder="Component name" className="flex-1 px-2 py-1 border border-nexus-border rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500/20 bg-white" />
                      <button type="button" onClick={() => removeComponent(idx)} className="ml-2 p-1 text-red-400 hover:text-red-600"><FiTrash2 className="w-3.5 h-3.5" /></button>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      <select value={comp.type} onChange={(e) => updateComponent(idx, 'type', e.target.value)} className="px-2 py-1 border border-nexus-border rounded text-xs focus:outline-none bg-white">
                        <option value="earning">Earning</option>
                        <option value="deduction">Deduction</option>
                      </select>
                      <select value={comp.category} onChange={(e) => updateComponent(idx, 'category', e.target.value)} className="px-2 py-1 border border-nexus-border rounded text-xs focus:outline-none bg-white">
                        <option value="basic">Basic</option><option value="hra">HRA</option><option value="allowance">Allowance</option><option value="pf">PF</option><option value="esi">ESI</option><option value="tax">Tax</option><option value="bonus">Bonus</option><option value="reimbursement">Reimbursement</option><option value="other">Other</option>
                      </select>
                      <select value={comp.calculationType} onChange={(e) => updateComponent(idx, 'calculationType', e.target.value)} className="px-2 py-1 border border-nexus-border rounded text-xs focus:outline-none bg-white">
                        <option value="fixed">Fixed</option><option value="percentage">Percentage</option><option value="formula">Formula</option>
                      </select>
                      <input type="number" value={comp.value} onChange={(e) => updateComponent(idx, 'value', parseFloat(e.target.value) || 0)} placeholder="Value" className="px-2 py-1 border border-nexus-border rounded text-xs focus:outline-none bg-white" />
                    </div>
                    {comp.calculationType === 'percentage' && (
                      <input value={comp.percentageOf} onChange={(e) => updateComponent(idx, 'percentageOf', e.target.value)} placeholder="% of component" className="w-full px-2 py-1 border border-nexus-border rounded text-xs focus:outline-none bg-white" />
                    )}
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-1.5 text-xs text-nexus-text-secondary"><input type="checkbox" checked={comp.isTaxable} onChange={(e) => updateComponent(idx, 'isTaxable', e.target.checked)} className="rounded" /> Taxable</label>
                      <label className="flex items-center gap-1.5 text-xs text-nexus-text-secondary"><input type="checkbox" checked={comp.isStatutory} onChange={(e) => updateComponent(idx, 'isStatutory', e.target.checked)} className="rounded" /> Statutory</label>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-nexus-border">
              <button onClick={handleCancelForm} className="px-4 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors">Cancel</button>
              <button onClick={handleSubmit} disabled={submitting} className="px-6 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 shadow-sm shadow-blue-500/25 transition-colors">
                {submitting ? 'Saving...' : editingId ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Structure Cards */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="nexus-card p-5 animate-pulse">
              <div className="h-5 w-3/4 bg-slate-200 rounded mb-2" />
              <div className="h-3 w-1/2 bg-slate-100 rounded" />
            </div>
          ))}
        </div>
      ) : structures.length === 0 ? (
        <div className="nexus-card p-12 text-center">
          <FiDollarSign className="w-12 h-12 text-nexus-text-muted mx-auto mb-3" />
          <p className="text-nexus-text-secondary font-medium">No salary structures found</p>
          <p className="text-sm text-nexus-text-muted mt-1">Create your first salary structure to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {structures.map((s) => (
            <div key={s.id} className="nexus-card p-5 hover:shadow-md transition-shadow">
              {deleteConfirmId === s.id ? (
                <div className="bg-red-50 -m-5 p-5 rounded-xl">
                  <p className="text-sm text-red-700 font-medium mb-3">Are you sure you want to delete &quot;{s.name}&quot;?</p>
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleDelete(s.id)} disabled={deleting} className="px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors">
                      {deleting ? 'Deleting...' : 'Confirm'}
                    </button>
                    <button onClick={() => setDeleteConfirmId(null)} className="px-3 py-1.5 border border-nexus-border text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors">Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-semibold text-nexus-text-primary">{s.name}</h3>
                    <span className={getStatusBadge(s.status)}>{s.status}</span>
                  </div>
                  <p className="text-sm text-nexus-text-secondary">{s.country || 'Global'} · {s.currency}</p>
                  <p className="text-xs text-nexus-text-muted mt-2">{(s.components || []).length} components</p>
                  <div className="mt-3 pt-3 border-t border-nexus-border flex items-center justify-between">
                    <button onClick={() => handleView(s)} className="text-xs font-medium text-emerald-500 hover:text-emerald-600 flex items-center gap-1">
                      <FiEye className="w-3.5 h-3.5" />View
                    </button>
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleEdit(s)} className="p-1.5 rounded-lg text-nexus-text-muted hover:text-blue-500 hover:bg-blue-50 transition-colors" title="Edit">
                        <FiEdit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setDeleteConfirmId(s.id)} className="p-1.5 rounded-lg text-nexus-text-muted hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete">
                        <FiTrash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
