'use client';

/**
 * Candidate Portal — Notification Center.
 * Lists the candidate's in-app messages (CandidateMessage feed) with
 * unread highlighting and a Mark-all-read action. Mock-screen visual
 * language (navy header via CandidatePortalNav, green accents).
 */

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  FiBell, FiCheck, FiInbox, FiRefreshCw, FiInfo,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import CandidatePortalNav, { fetchPortalHeadersSafe, type PortalState } from '@/components/candidate-portal/CandidatePortalNav';

interface PortalMessage {
  id: string;
  senderName: string;
  senderRole: string;
  message: string;
  createdAt: string;
  readAt: string | null;
}

export default function CandidateNotificationsPage() {
  const router = useRouter();
  const [state, setState] = useState<PortalState | null>(null);
  const [messages, setMessages] = useState<PortalMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const headers = fetchPortalHeadersSafe();
      const [stateRes, msgRes] = await Promise.all([
        fetch('/api/candidate-portal/portal-state', { headers }),
        fetch('/api/candidate-portal/messages', { headers }),
      ]);
      if (stateRes.status === 401 || msgRes.status === 401) {
        router.push('/candidate-portal/login');
        return;
      }
      if (stateRes.ok) setState(await stateRes.json());
      if (msgRes.ok) {
        const d = await msgRes.json();
        setMessages(Array.isArray(d.messages) ? d.messages : []);
      }
    } catch {
      toast.error('Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('tb_candidate_token') : null;
    if (!token) { router.push('/candidate-portal/login'); return; }
    queueMicrotask(() => { load(); });
  }, [load, router]);

  const markAllRead = async () => {
    setMarking(true);
    try {
      const r = await fetch('/api/candidate-portal/messages', {
        method: 'POST',
        headers: fetchPortalHeadersSafe(),
        body: JSON.stringify({ action: 'mark-all-read' }),
      });
      if (r.ok) {
        toast.success('All notifications marked as read');
        load();
      } else {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || 'Failed');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    } finally {
      setMarking(false);
    }
  };

  const unread = messages.filter((m) => !m.readAt).length;

  return (
    <div className="min-h-screen bg-slate-50">
      <CandidatePortalNav state={state} active="notifications" />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <FiBell className="w-5 h-5 text-emerald-600" /> Notifications
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {unread > 0 ? `${unread} unread notification${unread === 1 ? '' : 's'}` : 'You are all caught up'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} className="p-2.5 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-emerald-700 hover:border-emerald-200" title="Refresh">
              <FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                disabled={marking}
                className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg bg-emerald-600 text-white text-[13px] font-semibold hover:bg-emerald-700 disabled:opacity-50"
              >
                <FiCheck className="w-4 h-4" /> {marking ? 'Marking…' : 'Mark all read'}
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-400 text-sm">Loading notifications…</div>
        ) : messages.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
            <FiInbox className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500 font-medium">No notifications yet</p>
            <p className="text-xs text-slate-400 mt-1">Updates about your applications, interviews, offers and preboarding will appear here.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {messages.map((m) => (
              <li
                key={m.id}
                className={`bg-white rounded-xl border p-4 ${!m.readAt ? 'border-emerald-300 bg-emerald-50/40' : 'border-slate-200'}`}
              >
                <div className="flex items-start gap-3">
                  <span className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${!m.readAt ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                    <FiInfo className="w-4 h-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm leading-relaxed ${!m.readAt ? 'text-slate-800 font-medium' : 'text-slate-600'}`}>{m.message}</p>
                    <p className="text-[11px] text-slate-400 mt-1.5">
                      {new Date(m.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      {' · '}
                      {m.senderName || 'HR System'}
                      {m.senderRole && m.senderRole !== 'system' ? ` (${m.senderRole})` : ''}
                    </p>
                  </div>
                  {!m.readAt && <span className="w-2 h-2 rounded-full bg-emerald-500 mt-1.5 shrink-0" aria-label="Unread" />}
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
