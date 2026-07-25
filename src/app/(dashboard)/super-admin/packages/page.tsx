'use client';

import { useState } from 'react';
import {
  FiPackage, FiPlus, FiEdit2, FiX, FiCheck, FiGrid,
  FiList, FiStar, FiUsers, FiHardDrive,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

// ─── Demo Data ───────────────────────────────────────────
interface Package {
  id: string;
  name: string;
  price: number;
  billingCycle: 'monthly' | 'annual';
  features: string[];
  maxEmployees: number;
  maxStorage: number;
  status: 'active' | 'archived';
  isDefault: boolean;
  description: string;
}

const demoPackages: Package[] = [
  {
    id: 'pkg-001', name: 'Free', price: 0, billingCycle: 'monthly', isDefault: true, status: 'active',
    description: 'Get started with basic HR management',
    features: ['Employee Management', 'Leave Tracking', 'Basic Reports', 'Email Support'],
    maxEmployees: 25, maxStorage: 500,
  },
  {
    id: 'pkg-002', name: 'Starter', price: 49, billingCycle: 'monthly', isDefault: false, status: 'active',
    description: 'Perfect for small growing teams',
    features: ['Employee Management', 'Leave & Attendance', 'Payroll (Single Country)', 'Basic Reports', 'Email Support', 'API Access'],
    maxEmployees: 50, maxStorage: 2000,
  },
  {
    id: 'pkg-003', name: 'Professional', price: 299, billingCycle: 'monthly', isDefault: false, status: 'active',
    description: 'Best for mid-sized companies',
    features: ['Employee Management', 'Leave & Attendance', 'Payroll (Multi-Country)', 'Advanced Reports', 'Recruitment', 'Performance Management', 'Priority Support', 'API Access', 'Mobile App'],
    maxEmployees: 500, maxStorage: 10000,
  },
  {
    id: 'pkg-004', name: 'Enterprise', price: 999, billingCycle: 'monthly', isDefault: false, status: 'active',
    description: 'For large organizations with complex needs',
    features: ['Unlimited Employees', 'Full Payroll Suite', 'AI Recruitment', 'Advanced Analytics', 'Custom Workflows', 'White Label', 'Dedicated Account Manager', '24/7 Phone Support', 'Custom API', 'SLA Guarantee'],
    maxEmployees: 9999, maxStorage: 50000,
  },
  {
    id: 'pkg-005', name: 'Legacy Pro', price: 199, billingCycle: 'monthly', isDefault: false, status: 'archived',
    description: 'Legacy package no longer available for new sign-ups',
    features: ['Employee Management', 'Leave & Attendance', 'Payroll', 'Reports'],
    maxEmployees: 200, maxStorage: 5000,
  },
];

const pkgGradients: Record<string, string> = {
  Free: 'from-slate-500 to-slate-600',
  Starter: 'from-emerald-500 to-emerald-600',
  Professional: 'from-green-500 to-green-600',
  Enterprise: 'from-teal-500 to-teal-600',
};

export default function PackagesPage() {
  const { user } = useAuthStore();
  const [packages, setPackages] = useState<Package[]>(demoPackages);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '', price: 0, billingCycle: 'monthly' as 'monthly' | 'annual',
    features: '', maxEmployees: 50, maxStorage: 1000,
    status: 'active' as 'active' | 'archived', isDefault: false, description: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) { toast.error('Package name is required'); return; }
    const featuresList = form.features.split(',').map((f) => f.trim()).filter(Boolean);
    if (editingId) {
      setPackages((prev) => prev.map((p) => p.id === editingId ? { ...p, name: form.name, price: form.price, billingCycle: form.billingCycle, features: featuresList, maxEmployees: form.maxEmployees, maxStorage: form.maxStorage, status: form.status, isDefault: form.isDefault, description: form.description } : p));
      toast.success('Package updated');
    } else {
      setPackages((prev) => [...prev, { id: `pkg-${Date.now()}`, name: form.name, price: form.price, billingCycle: form.billingCycle, features: featuresList, maxEmployees: form.maxEmployees, maxStorage: form.maxStorage, status: form.status, isDefault: form.isDefault, description: form.description }]);
      toast.success('Package created');
    }
    setShowForm(false);
    setEditingId(null);
  };

  const handleEdit = (pkg: Package) => {
    setEditingId(pkg.id);
    setForm({ name: pkg.name, price: pkg.price, billingCycle: pkg.billingCycle, features: pkg.features.join(', '), maxEmployees: pkg.maxEmployees, maxStorage: pkg.maxStorage, status: pkg.status, isDefault: pkg.isDefault, description: pkg.description });
    setShowForm(true);
  };

  const inputCls = 'w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400';

  return (
    <div className="space-y-6">
      {/* Hero Banner */}
      <div className="thb-card p-6 bg-gradient-to-r from-teal-600 via-teal-500 to-pink-500 border-0">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3"><FiPackage className="w-7 h-7" /> Package Management</h1>
            <p className="text-teal-100 mt-1 text-sm">Define and manage subscription packages for your platform</p>
          </div>
          <div className="flex gap-2">
            <div className="flex bg-white/20 backdrop-blur rounded-lg p-0.5">
              <button onClick={() => setViewMode('cards')} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${viewMode === 'cards' ? 'bg-white text-teal-700' : 'text-white hover:bg-white/10'}`}><FiGrid className="w-4 h-4" /></button>
              <button onClick={() => setViewMode('table')} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${viewMode === 'table' ? 'bg-white text-teal-700' : 'text-white hover:bg-white/10'}`}><FiList className="w-4 h-4" /></button>
            </div>
            <button onClick={() => { setShowForm(true); setEditingId(null); setForm({ name: '', price: 0, billingCycle: 'monthly', features: '', maxEmployees: 50, maxStorage: 1000, status: 'active', isDefault: false, description: '' }); }} className="inline-flex items-center gap-2 px-4 py-2.5 bg-white/20 backdrop-blur text-white rounded-lg font-medium text-sm hover:bg-white/30 transition-colors">
              <FiPlus className="w-4 h-4" /> Add Package
            </button>
          </div>
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <div className="thb-card border-l-4 border-l-teal-500 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-thb-text-primary">{editingId ? 'Edit Package' : 'Add Package'}</h3>
            <button onClick={() => { setShowForm(false); setEditingId(null); }} className="p-1.5 text-thb-text-muted hover:text-thb-text-primary hover:bg-slate-100 rounded-lg"><FiX className="w-4 h-4" /></button>
          </div>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div><label className="block text-xs font-medium text-thb-text-secondary mb-1">Package Name</label><input className={inputCls} value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Professional" /></div>
            <div><label className="block text-xs font-medium text-thb-text-secondary mb-1">Price ($)</label><input type="number" className={inputCls} value={form.price} onChange={(e) => setForm((p) => ({ ...p, price: Number(e.target.value) }))} /></div>
            <div><label className="block text-xs font-medium text-thb-text-secondary mb-1">Billing Cycle</label><select className={inputCls} value={form.billingCycle} onChange={(e) => setForm((p) => ({ ...p, billingCycle: e.target.value as 'monthly' | 'annual' }))}><option value="monthly">Monthly</option><option value="annual">Annual</option></select></div>
            <div><label className="block text-xs font-medium text-thb-text-secondary mb-1">Max Employees</label><input type="number" className={inputCls} value={form.maxEmployees} onChange={(e) => setForm((p) => ({ ...p, maxEmployees: Number(e.target.value) }))} /></div>
            <div><label className="block text-xs font-medium text-thb-text-secondary mb-1">Max Storage (MB)</label><input type="number" className={inputCls} value={form.maxStorage} onChange={(e) => setForm((p) => ({ ...p, maxStorage: Number(e.target.value) }))} /></div>
            <div><label className="block text-xs font-medium text-thb-text-secondary mb-1">Status</label><select className={inputCls} value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as 'active' | 'archived' }))}><option value="active">Active</option><option value="archived">Archived</option></select></div>
            <div className="sm:col-span-2 lg:col-span-3"><label className="block text-xs font-medium text-thb-text-secondary mb-1">Features (comma-separated)</label><input className={inputCls} value={form.features} onChange={(e) => setForm((p) => ({ ...p, features: e.target.value }))} placeholder="Feature 1, Feature 2, Feature 3" /></div>
            <div className="sm:col-span-2 lg:col-span-3"><label className="block text-xs font-medium text-thb-text-secondary mb-1">Description</label><input className={inputCls} value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} /></div>
            <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-3">
              <label className="flex items-center gap-2 text-sm text-thb-text-secondary"><input type="checkbox" checked={form.isDefault} onChange={(e) => setForm((p) => ({ ...p, isDefault: e.target.checked }))} className="rounded" /> Set as default package</label>
            </div>
            <div className="flex items-end gap-2"><button type="submit" className="inline-flex items-center gap-2 px-4 py-2.5 bg-green-500 text-white rounded-lg font-medium text-sm hover:bg-green-600 transition-colors"><FiCheck className="w-4 h-4" />{editingId ? 'Update' : 'Create'}</button></div>
          </form>
        </div>
      )}

      {/* Cards View */}
      {viewMode === 'cards' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
          {packages.map((pkg) => (
            <div key={pkg.id} className={`thb-card overflow-hidden ${pkg.status === 'archived' ? 'opacity-60' : ''}`}>
              <div className={`bg-gradient-to-r ${pkgGradients[pkg.name] || 'from-slate-500 to-slate-600'} p-4 text-white`}>
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold">{pkg.name}</h3>
                  {pkg.isDefault && <FiStar className="w-4 h-4 text-yellow-300" />}
                </div>
                <p className="text-2xl font-bold mt-2">${pkg.price}<span className="text-sm font-normal opacity-80">/{pkg.billingCycle === 'monthly' ? 'mo' : 'yr'}</span></p>
                <p className="text-xs opacity-80 mt-1">{pkg.description}</p>
              </div>
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1 text-thb-text-secondary"><FiUsers className="w-3.5 h-3.5" /> {pkg.maxEmployees >= 9999 ? 'Unlimited' : pkg.maxEmployees} employees</span>
                  <span className="flex items-center gap-1 text-thb-text-secondary"><FiHardDrive className="w-3.5 h-3.5" /> {(pkg.maxStorage / 1000).toFixed(1)} GB</span>
                </div>
                <div className="space-y-1.5">
                  {pkg.features.slice(0, 5).map((f) => (
                    <div key={f} className="flex items-center gap-2 text-xs text-thb-text-secondary">
                      <FiCheck className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" /> {f}
                    </div>
                  ))}
                  {pkg.features.length > 5 && <p className="text-[10px] text-thb-text-muted">+{pkg.features.length - 5} more features</p>}
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-thb-border">
                  <span className={`thb-badge ${pkg.status === 'active' ? 'thb-badge-success' : 'thb-badge-warning'}`}>{pkg.status}</span>
                  <button onClick={() => handleEdit(pkg)} className="inline-flex items-center gap-1 text-green-500 hover:text-green-700 text-xs font-medium"><FiEdit2 className="w-3.5 h-3.5" /> Edit</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Comparison Table */
        <div className="thb-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-thb-text-muted border-b border-thb-border bg-slate-50">
                <th className="px-4 py-3 font-medium">Feature</th>
                {packages.filter((p) => p.status === 'active').map((pkg) => (
                  <th key={pkg.id} className="px-4 py-3 font-medium text-center">{pkg.name}</th>
                ))}
              </tr></thead>
              <tbody>
                <tr className="border-b border-slate-50"><td className="px-4 py-3 text-thb-text-secondary font-medium">Price</td>{packages.filter((p) => p.status === 'active').map((pkg) => <td key={pkg.id} className="px-4 py-3 text-center font-bold text-thb-text-primary">${pkg.price}/{pkg.billingCycle === 'monthly' ? 'mo' : 'yr'}</td>)}</tr>
                <tr className="border-b border-slate-50"><td className="px-4 py-3 text-thb-text-secondary font-medium flex items-center gap-1"><FiUsers className="w-3.5 h-3.5" /> Max Employees</td>{packages.filter((p) => p.status === 'active').map((pkg) => <td key={pkg.id} className="px-4 py-3 text-center text-thb-text-primary">{pkg.maxEmployees >= 9999 ? 'Unlimited' : pkg.maxEmployees}</td>)}</tr>
                <tr className="border-b border-slate-50"><td className="px-4 py-3 text-thb-text-secondary font-medium flex items-center gap-1"><FiHardDrive className="w-3.5 h-3.5" /> Storage</td>{packages.filter((p) => p.status === 'active').map((pkg) => <td key={pkg.id} className="px-4 py-3 text-center text-thb-text-primary">{(pkg.maxStorage / 1000).toFixed(1)} GB</td>)}</tr>
                {[...new Set(packages.filter((p) => p.status === 'active').flatMap((p) => p.features))].map((feature) => (
                  <tr key={feature} className="border-b border-slate-50">
                    <td className="px-4 py-3 text-thb-text-secondary">{feature}</td>
                    {packages.filter((p) => p.status === 'active').map((pkg) => (
                      <td key={pkg.id} className="px-4 py-3 text-center">{pkg.features.includes(feature) ? <FiCheck className="w-4 h-4 text-emerald-500 mx-auto" /> : <span className="text-thb-text-muted">—</span>}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
