'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiPackage,
  FiPlus,
  FiX,
  FiMonitor,
  FiSmartphone,
  FiArrowRight,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

/* ── Types ── */
interface Asset {
  id: string;
  name: string;
  assetTag: string;
  category: string;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  purchaseDate: string | null;
  purchaseCost: number | null;
  status: string;
  condition: string;
  assignments: AssetAssignment[];
}

interface AssetAssignment {
  id: string;
  assetId: string;
  employeeId: string;
  assignedDate: string;
  returnDate: string | null;
  condition: string;
  notes: string | null;
  status: string;
  asset?: { id: string; name: string; assetTag: string };
  employee?: { id: string; firstName: string; lastName: string; employeeId: string };
}

interface Employee {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
}

/* ── Helpers ── */
function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('nexus_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

function formatDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function getAssetStatusBadge(status: string) {
  const map: Record<string, string> = {
    available: 'nexus-badge nexus-badge-success',
    assigned: 'nexus-badge nexus-badge-info',
    maintenance: 'nexus-badge nexus-badge-warning',
    retired: 'nexus-badge nexus-badge-error',
  };
  return map[status] || 'nexus-badge nexus-badge-info';
}

function getConditionBadge(condition: string) {
  const map: Record<string, string> = {
    new: 'nexus-badge nexus-badge-success',
    good: 'nexus-badge nexus-badge-info',
    fair: 'nexus-badge nexus-badge-warning',
    poor: 'nexus-badge nexus-badge-error',
  };
  return map[condition] || 'nexus-badge nexus-badge-info';
}

function getCategoryIcon(category: string) {
  if (['laptop', 'desktop', 'monitor'].includes(category)) return <FiMonitor className="w-4 h-4" />;
  if (['phone', 'tablet'].includes(category)) return <FiSmartphone className="w-4 h-4" />;
  return <FiPackage className="w-4 h-4" />;
}

/* ── Component ── */
export default function AssetsPage() {
  const { user } = useAuthStore();
  const isAdmin = ['super_admin', 'tenant_admin', 'hr_admin', 'manager'].includes(user?.role || '');

  const [activeTab, setActiveTab] = useState<'assets' | 'assignments'>('assets');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assignments, setAssignments] = useState<AssetAssignment[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  const [showAssetModal, setShowAssetModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [assetForm, setAssetForm] = useState({ name: '', assetTag: '', category: 'laptop', brand: '', model: '', serialNumber: '', purchaseDate: '', purchaseCost: '', condition: 'new' });

  const [assignModal, setAssignModal] = useState<string | null>(null);
  const [assignEmpId, setAssignEmpId] = useState('');
  const [assigning, setAssigning] = useState(false);

  /* Fetch */
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const headers = getAuthHeaders();
      const [assetRes, empRes] = await Promise.all([
        fetch('/api/assets?limit=100', { headers }),
        fetch('/api/employees?limit=500', { headers }),
      ]);
      if (assetRes.ok) {
        const d = await assetRes.json();
        setAssets(d.assets || []);
        // Extract assignments from assets
        const allAssignments: AssetAssignment[] = [];
        (d.assets || []).forEach((a: Asset) => {
          (a.assignments || []).forEach((asgn: AssetAssignment) => {
            allAssignments.push({ ...asgn, asset: { id: a.id, name: a.name, assetTag: a.assetTag } });
          });
        });
        setAssignments(allAssignments);
      }
      if (empRes.ok) { const d = await empRes.json(); setEmployees(d.employees || []); }
    } catch {
      toast.error('Failed to load asset data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { queueMicrotask(() => fetchData()); }, [fetchData]);

  /* Add Asset */
  const handleAddAsset = async () => {
    if (!assetForm.name || !assetForm.assetTag) { toast.error('Name and Asset Tag are required'); return; }
    try {
      setSubmitting(true);
      const res = await fetch('/api/assets', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          ...assetForm,
          purchaseCost: assetForm.purchaseCost ? parseFloat(assetForm.purchaseCost) : null,
          purchaseDate: assetForm.purchaseDate || null,
          status: 'available',
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('Asset added successfully');
      setShowAssetModal(false);
      setAssetForm({ name: '', assetTag: '', category: 'laptop', brand: '', model: '', serialNumber: '', purchaseDate: '', purchaseCost: '', condition: 'new' });
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to add asset');
    } finally {
      setSubmitting(false);
    }
  };

  /* Assign Asset */
  const handleAssign = async () => {
    if (!assignModal || !assignEmpId) { toast.error('Select an employee'); return; }
    try {
      setAssigning(true);
      const res = await fetch(`/api/assets/${assignModal}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ action: 'assign', employeeId: assignEmpId }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('Asset assigned successfully');
      setAssignModal(null);
      setAssignEmpId('');
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to assign asset');
    } finally {
      setAssigning(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold gradient-text flex items-center gap-2">
            <FiPackage className="w-6 h-6" />
            Asset Management
          </h1>
          <p className="text-nexus-text-secondary mt-1">Track and manage company assets</p>
        </div>
        {isAdmin && (
          <button onClick={() => setShowAssetModal(true)} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium text-sm shadow-sm shadow-blue-500/25 transition-colors">
            <FiPlus className="w-4 h-4" /> Add Asset
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-lg w-fit">
        <button onClick={() => setActiveTab('assets')} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'assets' ? 'bg-white text-nexus-text-primary shadow-sm' : 'text-nexus-text-secondary hover:text-nexus-text-primary'}`}>Assets</button>
        <button onClick={() => setActiveTab('assignments')} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'assignments' ? 'bg-white text-nexus-text-primary shadow-sm' : 'text-nexus-text-secondary hover:text-nexus-text-primary'}`}>Assignments</button>
      </div>

      {/* Assets Tab */}
      {activeTab === 'assets' && (
        <div className="nexus-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-nexus-border bg-slate-50/50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Asset Tag</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Category</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Condition</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i} className="border-b border-nexus-border/50 animate-pulse">
                      {Array.from({ length: 6 }).map((_, j) => (
                        <td key={j} className="px-4 py-3"><div className="h-3 bg-slate-200 rounded" style={{ width: j === 0 ? '80px' : '60px' }} /></td>
                      ))}
                    </tr>
                  ))
                ) : assets.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center">
                      <FiPackage className="w-10 h-10 text-nexus-text-muted mx-auto mb-3" />
                      <p className="text-nexus-text-secondary font-medium">No assets found</p>
                    </td>
                  </tr>
                ) : (
                  assets.map(a => (
                    <tr key={a.id} className="border-b border-nexus-border/50 hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-500">{getCategoryIcon(a.category)}</span>
                          <span className="text-sm font-mono font-medium text-nexus-text-primary">{a.assetTag}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-nexus-text-primary">{a.name}</td>
                      <td className="px-4 py-3 text-sm text-nexus-text-secondary capitalize">{a.category}</td>
                      <td className="px-4 py-3"><span className={getAssetStatusBadge(a.status)}>{a.status}</span></td>
                      <td className="px-4 py-3"><span className={getConditionBadge(a.condition)}>{a.condition}</span></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {isAdmin && a.status === 'available' && (
                            <button onClick={() => setAssignModal(a.id)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-violet-600 hover:bg-violet-50 transition-colors">
                              <FiArrowRight className="w-3 h-3" /> Assign
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Assignments Tab */}
      {activeTab === 'assignments' && (
        <div className="nexus-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-nexus-border bg-slate-50/50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Asset</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Employee</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Assigned Date</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} className="border-b border-nexus-border/50 animate-pulse">
                      <td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded" /></td>
                      <td className="px-4 py-3"><div className="h-3 w-24 bg-slate-200 rounded" /></td>
                      <td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded" /></td>
                      <td className="px-4 py-3"><div className="h-5 w-16 bg-slate-200 rounded-full" /></td>
                    </tr>
                  ))
                ) : assignments.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-12 text-center">
                      <FiArrowRight className="w-10 h-10 text-nexus-text-muted mx-auto mb-3" />
                      <p className="text-nexus-text-secondary font-medium">No assignments found</p>
                    </td>
                  </tr>
                ) : (
                  assignments.map(a => (
                    <tr key={a.id} className="border-b border-nexus-border/50 hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-nexus-text-primary">{a.asset?.name || '—'}<p className="text-xs text-nexus-text-muted">{a.asset?.assetTag}</p></td>
                      <td className="px-4 py-3 text-sm text-nexus-text-secondary">{a.employee ? `${a.employee.firstName} ${a.employee.lastName}` : '—'}</td>
                      <td className="px-4 py-3 text-sm text-nexus-text-secondary">{formatDate(a.assignedDate)}</td>
                      <td className="px-4 py-3"><span className={a.status === 'assigned' ? 'nexus-badge nexus-badge-info' : a.status === 'returned' ? 'nexus-badge nexus-badge-success' : 'nexus-badge nexus-badge-error'}>{a.status}</span></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Asset Modal */}
      {showAssetModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setShowAssetModal(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full animate-slide-in-down max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-nexus-border">
              <h2 className="text-lg font-semibold text-nexus-text-primary">Add Asset</h2>
              <button onClick={() => setShowAssetModal(false)} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors"><FiX className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Name *</label>
                  <input type="text" value={assetForm.name} onChange={e => setAssetForm(p => ({ ...p, name: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Asset name" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Asset Tag *</label>
                  <input type="text" value={assetForm.assetTag} onChange={e => setAssetForm(p => ({ ...p, assetTag: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="e.g. LAP-001" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Category</label>
                  <select value={assetForm.category} onChange={e => setAssetForm(p => ({ ...p, category: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                    {['laptop', 'desktop', 'phone', 'tablet', 'monitor', 'other'].map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Condition</label>
                  <select value={assetForm.condition} onChange={e => setAssetForm(p => ({ ...p, condition: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                    {['new', 'good', 'fair', 'poor'].map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Brand</label>
                  <input type="text" value={assetForm.brand} onChange={e => setAssetForm(p => ({ ...p, brand: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Brand" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Model</label>
                  <input type="text" value={assetForm.model} onChange={e => setAssetForm(p => ({ ...p, model: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Model" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Serial Number</label>
                <input type="text" value={assetForm.serialNumber} onChange={e => setAssetForm(p => ({ ...p, serialNumber: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Serial number" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Purchase Date</label>
                  <input type="date" value={assetForm.purchaseDate} onChange={e => setAssetForm(p => ({ ...p, purchaseDate: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Purchase Cost</label>
                  <input type="number" value={assetForm.purchaseCost} onChange={e => setAssetForm(p => ({ ...p, purchaseCost: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="0" />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-6 border-t border-nexus-border">
              <button onClick={() => setShowAssetModal(false)} className="px-4 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors">Cancel</button>
              <button onClick={handleAddAsset} disabled={submitting} className="px-6 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 shadow-sm shadow-blue-500/25 transition-colors">
                {submitting ? 'Adding...' : 'Add Asset'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Modal */}
      {assignModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setAssignModal(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full animate-slide-in-down" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-nexus-border">
              <h2 className="text-lg font-semibold text-nexus-text-primary">Assign Asset</h2>
              <button onClick={() => setAssignModal(null)} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors"><FiX className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="p-3 rounded-lg bg-blue-50 border border-blue-100">
                <p className="text-sm text-blue-700 font-medium">Asset: {assets.find(a => a.id === assignModal)?.name} ({assets.find(a => a.id === assignModal)?.assetTag})</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Assign to Employee</label>
                <select value={assignEmpId} onChange={e => setAssignEmpId(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                  <option value="">Select Employee</option>
                  {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName}</option>)}
                </select>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-6 border-t border-nexus-border">
              <button onClick={() => setAssignModal(null)} className="px-4 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors">Cancel</button>
              <button onClick={handleAssign} disabled={assigning} className="px-6 py-2.5 rounded-lg bg-violet-500 text-white text-sm font-medium hover:bg-violet-600 disabled:opacity-50 shadow-sm shadow-violet-500/25 transition-colors">
                {assigning ? 'Assigning...' : 'Assign'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
