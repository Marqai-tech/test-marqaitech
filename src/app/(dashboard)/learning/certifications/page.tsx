'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { FiAward, FiRefreshCw } from 'react-icons/fi';
import ModuleTips from '@/components/ModuleTips';
import { useAuthStore } from '@/store/authStore';

function getAuthHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface Cert {
  id: string; certificateNo: string; title: string; score?: number | null; issuedAt: string; validUntil?: string | null;
  status: string; daysToExpiry?: number | null; band?: string; skillAwarded?: string | null;
  employee: { id: string; employeeId: string; firstName: string; lastName: string; department?: { name: string } };
  course?: { id: string; title: string; category: string } | null;
}
interface Stats { total: number; active: number; expiring60: number; expiring30: number; expiring15: number; expired: number }

const BAND_BADGE: Record<string, string> = { valid: 'thb-badge-success', lifetime: 'thb-badge-info', upcoming: 'thb-badge-info', warning: 'thb-badge-warning', critical: 'thb-badge-error', expired: 'thb-badge-error' };
const BAND_LABEL: Record<string, string> = { valid: 'Valid', lifetime: 'No expiry', upcoming: 'Expiring < 60d', warning: 'Expiring < 30d', critical: 'Expiring < 15d', expired: 'Expired' };

export default function CertificationsPage() {
  const user = useAuthStore((s) => s.user);
  const isApprover = ['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_manager'].includes(user?.role || '');
  const [rows, setRows] = useState<Cert[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/learning/certificates', { headers: getAuthHeaders() });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      setRows(j.data || []); setStats(j.stats);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to load certificates'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { queueMicrotask(load); }, [load]);

  const renew = async (c: Cert) => {
    try {
      const res = await fetch('/api/learning/certificates', { method: 'PATCH', headers: getAuthHeaders(), body: JSON.stringify({ id: c.id, action: 'renew' }) });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success(`Renewed ${c.certificateNo}`); load();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Renewal failed'); }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold thb-text-primary flex items-center gap-2"><FiAward className="text-emerald-500" /> Certifications &amp; Renewals</h1>
        <p className="text-sm thb-text-secondary mt-1">Automated digital certificate issuance with validity tracking and 60/30/15-day renewal alerts (escalating to the manager).</p>
      </div>

      {stats ? (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {[['Total', stats.total, 'thb-text-primary'], ['Active', stats.active, 'text-emerald-600'], ['< 60 days', stats.expiring60, 'text-sky-600'], ['< 30 days', stats.expiring30, 'text-amber-600'], ['< 15 days', stats.expiring15, 'text-orange-600'], ['Expired', stats.expired, 'text-red-600']].map(([label, value, tone]) => (
            <div key={String(label)} className="thb-card p-3"><div className={`text-xl font-bold ${tone}`}>{value}</div><div className="text-[11px] thb-text-secondary">{label}</div></div>
          ))}
        </div>
      ) : null}

      {loading ? <div className="thb-card h-64 animate-pulse" /> : rows.length === 0 ? (
        <div className="thb-card p-10 text-center thb-text-muted text-sm">No certificates issued yet — complete a course assessment to earn one.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rows.map((c) => (
            <div key={c.id} className="thb-card p-5 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500" />
              <div className="flex items-start justify-between gap-2">
                <FiAward className="text-amber-500 text-xl" />
                <span className={`thb-badge ${BAND_BADGE[c.band || 'valid']}`}>{BAND_LABEL[c.band || 'valid']}</span>
              </div>
              <h3 className="font-semibold thb-text-primary mt-2 text-sm leading-snug">{c.title}</h3>
              <div className="text-[11px] thb-text-muted mt-1">{c.certificateNo}</div>
              <div className="text-xs thb-text-secondary mt-2">
                {c.employee?.firstName} {c.employee?.lastName} · {c.employee?.department?.name || '—'}
              </div>
              <div className="text-[11px] thb-text-muted mt-1">
                Issued {new Date(c.issuedAt).toLocaleDateString('en-IN')}
                {c.validUntil ? ` · valid until ${new Date(c.validUntil).toLocaleDateString('en-IN')}` : ' · lifetime'}
                {c.daysToExpiry !== null && c.daysToExpiry !== undefined && c.daysToExpiry > 0 ? ` (${c.daysToExpiry}d left)` : ''}
              </div>
              {c.score ? <div className="text-[11px] thb-text-secondary mt-1">Score: {c.score}%</div> : null}
              {isApprover && c.band !== 'lifetime' ? (
                <button onClick={() => renew(c)} className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-emerald-50 text-emerald-700 font-medium hover:bg-emerald-100"><FiRefreshCw size={11} /> Renew</button>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <ModuleTips moduleKey="learning" userRole={user?.role} />
    </div>
  );
}
