'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { FiLayers, FiFileText, FiSliders, FiGrid, FiPlus, FiRefreshCw, FiArrowRight, FiCheckCircle } from 'react-icons/fi';
import { useAuthStore } from '@/store/authStore';
import { useCompanyContextStore } from '@/store/companyContextStore';

function getAuthHeaders() { const t = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null; return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }; }

export default function LeaveSetupPage() {
  const { user } = useAuthStore();
  const isAdmin = ['super_admin', 'tenant_admin', 'admin', 'hr_admin'].includes(user?.role || '');
  const scopeQuery = useCompanyContextStore(s => s.scopeQuery);
  const [counts, setCounts] = useState({ types: 0, rules: 0 });
  const [loading, setLoading] = useState(true);

  const fetchCounts = useCallback(async () => {
    try { setLoading(true); const h = getAuthHeaders(); const sq = scopeQuery(); const sep = sq ? `&${sq}` : '';
      const [t, r] = await Promise.all([fetch(`/api/leave-types?limit=1${sep}`, { headers: h }).catch(() => null), fetch(`/api/leave-policy-rules?limit=1${sep}`, { headers: h }).catch(() => null)]);
      let types = 0, rules = 0; if (t?.ok) { const d = await t.json(); types = d.data?.length || 0; } if (r?.ok) { const d = await r.json(); rules = d.data?.length || 0; }
      setCounts({ types, rules });
    } catch {} finally { setLoading(false); }
  }, [scopeQuery]);
  useEffect(() => { if (isAdmin) fetchCounts(); }, [fetchCounts, isAdmin]);

  if (!isAdmin) return <div className="flex items-center justify-center min-h-[40vh]"><div className="text-center"><FiSliders className="w-12 h-12 text-slate-300 mx-auto mb-3" /><p className="text-sm text-slate-500">Leave Setup is available to HR/Admin roles only.</p></div></div>;

  const steps = [
    { step: 1, title: 'Leave Types', desc: 'Create named categories of absence (CL, SL, EL…) with codes, categories and units.', href: '/leave/types', icon: <FiLayers className="w-6 h-6" />, count: counts.types, bg: 'bg-emerald-50', text: 'text-emerald-600' },
    { step: 2, title: 'Leave Policies', desc: 'Define who gets which leaves: employee status, department, location & crediting.', href: '/leave/leave-policy', icon: <FiFileText className="w-6 h-6" />, count: 0, bg: 'bg-blue-50', text: 'text-blue-600' },
    { step: 3, title: 'Leave Rules', desc: 'Set entitlement, limits, notice, carry-forward and encashment per leave type.', href: '/leave/leave-policy?tab=rules', icon: <FiSliders className="w-6 h-6" />, count: counts.rules, bg: 'bg-amber-50', text: 'text-amber-600' },
    { step: 4, title: 'Policy Mapping', desc: 'Connect policy → leave type → rule → employees. Matrix and list views.', href: '/leave/leave-policy?tab=mapping', icon: <FiGrid className="w-6 h-6" />, count: 0, bg: 'bg-violet-50', text: 'text-violet-600' },
  ];

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold text-thb-text-primary">Leave Setup</h1><p className="text-sm text-thb-text-secondary mt-0.5">Set up leave in four steps, in this order. Each step uses what the previous step created.</p></div>
        <button onClick={fetchCounts} className="inline-flex items-center gap-2 px-3 py-2 text-slate-600 rounded-lg text-sm"><FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</button>
      </div>
      <div className="bg-gradient-to-r from-emerald-50 via-blue-50 to-violet-50 rounded-xl border border-slate-200 p-4">
        <div className="flex items-center gap-2 text-sm text-slate-600"><FiCheckCircle className="w-4 h-4 text-emerald-500" /><span><b>Leave Type</b> → <b>Policy</b> → <b>Rule</b> → <b>Mapping</b> → reaches employees</span></div>
        <p className="text-xs text-slate-500 mt-1 ml-6">A leave type stays invisible to employees until a policy, rule and mapping connect it to a population of employees.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {steps.map(s => (
          <Link key={s.step} href={s.href} className="block thb-card p-5 hover:shadow-md transition-all group relative overflow-hidden">
            <div className="absolute top-0 right-0 px-3 py-1 bg-slate-100 text-slate-400 text-xs font-bold rounded-bl-lg">Step {s.step}</div>
            <div className="flex items-start gap-4">
              <div className={`w-12 h-12 rounded-xl ${s.bg} ${s.text} flex items-center justify-center flex-shrink-0`}>{s.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2"><h3 className="text-base font-bold text-thb-text-primary">{s.title}</h3><span className={`text-xs font-bold px-2 py-0.5 rounded-full ${s.bg} ${s.text}`}>{loading ? '…' : s.count}</span></div>
                <p className="text-xs text-thb-text-secondary mt-1 leading-relaxed">{s.desc}</p>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-1 text-xs font-semibold text-slate-400 group-hover:text-slate-600">Open <FiArrowRight className="w-3 h-3" /></div>
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 pt-2">
        <Link href="/leave/types" className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700"><FiPlus className="w-4 h-4" /> Create Leave Type</Link>
        <Link href="/leave/leave-policy" className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"><FiPlus className="w-4 h-4" /> Create Policy</Link>
      </div>
    </div>
  );
}
