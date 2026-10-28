'use client';

/**
 * Policies & Handbook — employee self-service page.
 *
 * Lists every active company policy with the employee's own acknowledgment
 * status (per the current policy version) and links to the viewer where the
 * policy can be read and accepted/rejected.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  FiFileText, FiSearch, FiClock, FiCheckCircle, FiAlertTriangle,
  FiArrowRight, FiEye, FiSettings, FiChevronRight, FiHome,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

interface MyStatus {
  status: 'pending' | 'acknowledged';
  rejected: boolean;
  action: string | null;
  rejectionReason: string | null;
  rejectedAt: string | null;
  acknowledgedAt: string | null;
}

interface HandbookPolicy {
  id: string;
  title: string;
  category: string;
  description: string;
  version: string;
  effectiveDate: string | null;
  expiryDate: string | null;
  fileName: string | null;
  fileSize: number | null;
  fileMimeType: string | null;
  my: MyStatus;
}

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export default function PoliciesHandbookPage() {
  const token = useAuthStore((s) => s.token);
  const [loading, setLoading] = useState(true);
  const [policies, setPolicies] = useState<HandbookPolicy[]>([]);
  const [summary, setSummary] = useState({ total: 0, pending: 0, acknowledged: 0 });
  const [tab, setTab] = useState<'all' | 'pending' | 'acknowledged'>('all');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/policies/handbook', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load policies');
      setPolicies(data.policies || []);
      setSummary(data.summary || { total: 0, pending: 0, acknowledged: 0 });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load policies');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return policies.filter((p) => {
      if (tab === 'pending' && p.my.status !== 'pending') return false;
      if (tab === 'acknowledged' && p.my.status !== 'acknowledged') return false;
      if (q && !(`${p.title} ${p.category}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [policies, tab, search]);

  const tabs = [
    { key: 'all' as const, label: 'All Policies', count: summary.total },
    { key: 'pending' as const, label: 'Pending Acknowledgement', count: summary.pending },
    { key: 'acknowledged' as const, label: 'Acknowledged', count: summary.acknowledged },
  ];

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-thb-text-muted">
        <Link href="/home" className="flex items-center gap-1 hover:text-teal-600 transition-colors"><FiHome className="w-3.5 h-3.5" /> Home</Link>
        <FiChevronRight className="w-3.5 h-3.5" />
        <span className="text-thb-text-primary font-medium">Policies &amp; Handbook</span>
      </nav>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md">
            <FiFileText className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-thb-text-primary">Policies &amp; Handbook</h1>
            <p className="text-sm text-thb-text-secondary">View company policies and acknowledge required ones</p>
          </div>
        </div>
        {summary.pending > 0 && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-200 text-xs font-semibold self-start sm:self-auto">
            <FiClock className="w-3.5 h-3.5" /> {summary.pending} Pending Acknowledgement{summary.pending > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Tabs + search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex gap-2 flex-wrap">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t.key ? 'bg-teal-500 text-white shadow-sm shadow-teal-500/25' : 'bg-white text-thb-text-secondary border border-thb-border hover:bg-slate-50'
              }`}
            >
              {t.label} <span className={tab === t.key ? 'text-white/70' : 'text-thb-text-muted'}>({t.count})</span>
            </button>
          ))}
        </div>
        <div className="relative sm:w-64">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-thb-text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search policies..."
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-thb-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400"
          />
        </div>
      </div>

      {/* Table */}
      <div className="thb-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                {['Policy', 'Version', 'Effective Date', 'Status', 'Action'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider border-b border-thb-border bg-slate-50/50">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-12 text-center"><FiSettings className="w-8 h-8 animate-spin text-teal-400 mx-auto" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center">
                    <FiFileText className="w-10 h-10 text-thb-text-muted mx-auto mb-3" />
                    <p className="text-thb-text-secondary font-medium">
                      {search ? 'No policies match your search' : tab === 'pending' ? 'Nothing pending — all policies acknowledged 🎉' : tab === 'acknowledged' ? 'No acknowledged policies yet' : 'No policies published yet'}
                    </p>
                  </td>
                </tr>
              ) : (
                filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 border-b border-thb-border/50">
                      <p className="text-sm font-medium text-thb-text-primary">{p.title}</p>
                      {p.description && <p className="text-xs text-thb-text-muted mt-0.5 line-clamp-1">{p.description}</p>}
                    </td>
                    <td className="px-4 py-3 text-sm text-thb-text-secondary border-b border-thb-border/50">v{p.version}</td>
                    <td className="px-4 py-3 text-sm text-thb-text-secondary border-b border-thb-border/50">{fmtDate(p.effectiveDate)}</td>
                    <td className="px-4 py-3 border-b border-thb-border/50">
                      {p.my.status === 'acknowledged' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                          <FiCheckCircle className="w-3 h-3" /> Acknowledged
                        </span>
                      ) : (
                        <span className="inline-flex flex-col gap-1">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 text-amber-700 ring-1 ring-amber-200 w-fit">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Pending
                          </span>
                          {p.my.rejected && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-rose-50 text-rose-600 ring-1 ring-rose-200 w-fit"
                              title={p.my.rejectionReason ? `Your reason: ${p.my.rejectionReason}` : undefined}>
                              <FiAlertTriangle className="w-2.5 h-2.5" /> Rejected
                            </span>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 border-b border-thb-border/50">
                      <Link
                        href={`/policies-handbook/${p.id}`}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          p.my.status === 'pending'
                            ? 'bg-teal-500 text-white hover:bg-teal-600 shadow-sm shadow-teal-500/25'
                            : 'border border-thb-border text-thb-text-secondary hover:bg-slate-50'
                        }`}
                      >
                        {p.my.status === 'pending' ? <>View &amp; Acknowledge <FiArrowRight className="w-3 h-3" /></> : <>View <FiEye className="w-3 h-3" /></>}
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
