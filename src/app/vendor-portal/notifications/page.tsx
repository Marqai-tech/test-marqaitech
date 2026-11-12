'use client';

/**
 * Vendor Portal — Notification Center — /vendor-portal/notifications
 *
 * In-app feed for the signed-in vendor user: BGV case events addressed to
 * them (assignment, reassignment, rework, decisions, report mirrors,
 * activation confirmations) plus invitation delivery records. Reading the
 * page marks the feed seen (unread badge resets). The API is scoped to the
 * caller's own work email — no other member's events are readable.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  FiBell, FiArrowLeft, FiLoader, FiCheckCircle, FiXCircle, FiClock,
  FiAlertCircle, FiUserCheck, FiSend, FiRotateCcw, FiInfo, FiFileText, FiUsers,
} from 'react-icons/fi';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface NotificationItem {
  id: string;
  event: string;
  channel: string;
  status: string;
  error?: string | null;
  createdAt: string;
  providerMessageId?: string | null;
  bgvRequestId?: string | null;
  caseNumber?: string | null;
  candidateName?: string | null;
  candidateEmail?: string | null;
}

const EVENT_META: Record<string, { label: string; icon: ReactNode }> = {
  bgv_initiated: { label: 'New BGV case assigned to your company', icon: <FiFileText className="text-teal-600" /> },
  assigned: { label: 'A case was assigned to you', icon: <FiUserCheck className="text-blue-600" /> },
  reassigned: { label: 'A case was reassigned to you', icon: <FiRotateCcw className="text-blue-600" /> },
  reassigned_previous: { label: 'A case previously assigned to you was moved', icon: <FiRotateCcw className="text-slate-500" /> },
  rework_required: { label: 'HR requested rework on a case', icon: <FiAlertCircle className="text-orange-600" /> },
  awaiting_information: { label: 'HR requested more information', icon: <FiInfo className="text-amber-600" /> },
  report_submitted: { label: 'A report was submitted to HR', icon: <FiSend className="text-violet-600" /> },
  report_submitted_admin_mirror: { label: 'Your company submitted a report', icon: <FiSend className="text-violet-500" /> },
  approved: { label: 'BGV approved by HR', icon: <FiCheckCircle className="text-emerald-600" /> },
  rejected: { label: 'BGV rejected by HR', icon: <FiXCircle className="text-red-600" /> },
  employee_activated: { label: 'A team member activated their account', icon: <FiUserCheck className="text-emerald-600" /> },
  invite_admin: { label: 'Vendor admin invitation sent', icon: <FiUsers className="text-teal-600" /> },
  invite_admin_resent: { label: 'Vendor admin invitation re-sent', icon: <FiUsers className="text-teal-500" /> },
  invite_employee: { label: 'Team invitation sent', icon: <FiUsers className="text-teal-600" /> },
  invite_employee_resent: { label: 'Team invitation re-sent', icon: <FiUsers className="text-teal-500" /> },
  invite_resent: { label: 'Invitation re-sent', icon: <FiUsers className="text-teal-500" /> },
  invite_reactivated: { label: 'Account reactivated — new invite sent', icon: <FiUsers className="text-emerald-600" /> },
};

const STATUS_CHIP: Record<string, string> = {
  sent: 'bg-emerald-100 text-emerald-700',
  queued: 'bg-amber-100 text-amber-800',
  failed: 'bg-red-100 text-red-700',
  in_app: 'bg-slate-100 text-slate-600',
};

export default function VendorNotificationsPage() {
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const markedSeen = useRef(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/vendor/notifications', { headers: getAuthHeaders() });
      if (res.status === 401 || res.status === 403) { router.push('/login'); return; }
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d?.error || 'Could not load notifications.'); setItems([]); return; }
      setItems(d.items || []);
      if (!markedSeen.current) {
        markedSeen.current = true;
        fetch('/api/vendor/notifications', { method: 'POST', headers: getAuthHeaders() }).catch(() => null);
      }
    } catch {
      setError('Network error while loading notifications.');
      setItems([]);
    } finally { setLoading(false); }
  }, [router]);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-[#0B2447] text-white px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-bold">3Boxes HRMS</span>
          <span className="text-slate-300 text-sm">| Vendor BGV Portal</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="inline-flex items-center gap-1.5"><FiBell /> Notifications</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-lg font-bold text-slate-900">Notification Center</h1>
            <p className="text-xs text-slate-500">Updates about your cases, invitations and team — newest first.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => void load()} disabled={loading}
              className="inline-flex items-center gap-1.5 text-xs font-medium border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 px-3 py-1.5 rounded-lg">
              {loading ? <FiLoader className="animate-spin" /> : <FiRotateCcw />} Refresh
            </button>
            <Link href="/vendor-portal/dashboard" className="inline-flex items-center gap-1.5 text-xs font-medium border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 px-3 py-1.5 rounded-lg">
              <FiArrowLeft /> Dashboard
            </Link>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 flex items-center gap-2">
            <FiAlertCircle /> {error}
          </div>
        )}

        {loading && !items ? (
          <div className="bg-white border rounded-xl p-10 flex flex-col items-center gap-2 text-slate-500">
            <FiLoader className="h-6 w-6 animate-spin text-teal-600" />
            <p className="text-sm">Loading notifications…</p>
          </div>
        ) : (items || []).length === 0 && !error ? (
          <div className="bg-white border rounded-xl p-10 text-center text-slate-500">
            <FiBell className="h-8 w-8 mx-auto mb-2 text-slate-300" />
            <p className="text-sm font-medium text-slate-700">No notifications yet</p>
            <p className="text-xs mt-1">Updates about your BGV cases and invitations will appear here.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {(items || []).map((n) => {
              const meta = EVENT_META[n.event] || { label: n.event, icon: <FiInfo className="text-slate-500" /> };
              return (
                <li key={n.id} className="bg-white border border-slate-200 rounded-xl p-3.5 flex items-start gap-3">
                  <span className="mt-0.5">{meta.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800">{meta.label}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {new Date(n.createdAt).toLocaleString('en-GB')}
                      {n.caseNumber && (
                        n.bgvRequestId
                          ? <> · <Link href={`/vendor-portal/requests/${n.bgvRequestId}`} className="text-teal-700 hover:underline font-medium">{n.caseNumber}</Link></>
                          : <> · {n.caseNumber}</>
                      )}
                      {n.candidateName && <> · {n.candidateName}</>}
                    </p>
                    {n.status === 'failed' && n.error && (
                      <p className="text-[11px] text-red-600 mt-1">Email delivery failed: {String(n.error).slice(0, 140)}</p>
                    )}
                    {n.status === 'failed' && !n.error && (
                      <p className="text-[11px] text-red-600 mt-1">Email delivery failed — use the resend actions where available.</p>
                    )}
                  </div>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_CHIP[n.status] || 'bg-slate-100 text-slate-600'}`}>
                    {n.status === 'sent' ? 'email sent' : n.status === 'failed' ? 'email failed' : n.status === 'queued' ? 'email queued' : n.status}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-4 text-[11px] text-slate-400 flex items-center gap-1.5">
          <FiClock /> Records show email queue state for transparency. For anything marked failed, ask your admin or HR to use the resend action.
        </p>
      </main>
    </div>
  );
}
