'use client';

/* ─────────────────────────────────────────────────────────────────────────────
 * Joining Confirmation & Formalities (BRD 5.11)
 * Joining-day operations: confirm joined, did-not-join (no-show workflow),
 * postpone and cancel — each with server-enforced mandatory reasons.
 * APIs: GET/POST /api/preboarding/brd/joining-formalities
 * ──────────────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  FiRefreshCw,
  FiAlertTriangle,
  FiCheckCircle,
  FiClock,
  FiCalendar,
  FiXCircle,
  FiX,
  FiArrowRight,
  FiUserX,
  FiUserCheck,
  FiInfo,
  FiSend,
} from 'react-icons/fi';

/* ── Auth helper ── */
function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

/* ── Types ── */
interface FormalityRow {
  id: string;
  preboardingId: string | null;
  candidateName: string;
  candidateEmail: string;
  jobTitle: string | null;
  joiningDate: string | null;
  startDate: string | null;
  joiningConfirmed: boolean | null;
  joiningConfirmedAt: string | null;
  actualJoiningDate: string | null;
  reportingTime: string | null;
  reportingLocation: string | null;
  didNotJoinAt: string | null;
  noShowReason: string | null;
  postponedJoiningDate: string | null;
  postponementReason: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  employeeId: string | null;
  preboardingStage: string | null;
  readyToJoinAt: string | null;
  workLocation: string | null;
  employmentType: string | null;
}

interface FormalitiesData {
  reportingToday: FormalityRow[];
  reportingThisWeek: FormalityRow[];
  overdue: FormalityRow[];
  awaitingFormalities: FormalityRow[];
  joined: FormalityRow[];
  didNotJoin: FormalityRow[];
  counts: {
    reportingToday: number;
    reportingThisWeek: number;
    overdue: number;
    awaitingFormalities: number;
    joined: number;
    didNotJoin: number;
  };
}

type SectionKey = keyof Pick<FormalitiesData, 'reportingToday' | 'reportingThisWeek' | 'overdue' | 'awaitingFormalities' | 'joined' | 'didNotJoin'>;

type ModalAction = 'confirm' | 'dnj' | 'postpone' | 'cancel';

/* UI action → API action (server contract: confirm-joined | did-not-join | postpone | cancel | send-confirmation) */
const API_ACTION: Record<ModalAction, string> = {
  confirm: 'confirm-joined',
  dnj: 'did-not-join',
  postpone: 'postpone',
  cancel: 'cancel',
};

interface ModalState {
  action: ModalAction;
  row: FormalityRow;
}

interface ConfirmSuccess {
  row: FormalityRow;
  message: string;
}

/* ── Section meta ── */
const SECTIONS: { key: SectionKey; label: string; icon: ReactNode; chipCls: string }[] = [
  { key: 'reportingToday', label: 'Reporting Today', icon: <FiCalendar className="h-4 w-4" />, chipCls: 'bg-teal-50 text-teal-700' },
  { key: 'reportingThisWeek', label: 'This Week', icon: <FiClock className="h-4 w-4" />, chipCls: 'bg-violet-50 text-violet-700' },
  { key: 'overdue', label: 'Overdue', icon: <FiAlertTriangle className="h-4 w-4" />, chipCls: 'bg-red-50 text-red-700' },
  { key: 'awaitingFormalities', label: 'Awaiting Formalities', icon: <FiInfo className="h-4 w-4" />, chipCls: 'bg-amber-50 text-amber-700' },
  { key: 'joined', label: 'Joined', icon: <FiUserCheck className="h-4 w-4" />, chipCls: 'bg-emerald-50 text-emerald-700' },
  { key: 'didNotJoin', label: 'Did Not Join', icon: <FiUserX className="h-4 w-4" />, chipCls: 'bg-slate-100 text-slate-600' },
];

/* ── Helpers ── */
function fmtDay(d: string | null | undefined): string {
  if (!d) return '—';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function expectedJoiningOf(row: FormalityRow): string | null {
  return row.joiningDate || row.startDate || null;
}

function statusChipOf(row: FormalityRow, section: SectionKey): { label: string; cls: string } {
  if (section === 'joined' || row.employeeId) return { label: 'Joined', cls: 'bg-emerald-50 text-emerald-700' };
  if (section === 'didNotJoin') return { label: 'Did Not Join', cls: 'bg-red-50 text-red-700' };
  if (section === 'overdue') return { label: 'Overdue', cls: 'bg-red-50 text-red-700' };
  if (row.joiningConfirmed) return { label: 'Confirmed', cls: 'bg-emerald-50 text-emerald-700' };
  return { label: 'Awaiting', cls: 'bg-amber-50 text-amber-700' };
}

function notesOf(row: FormalityRow, section: SectionKey): string {
  if (section === 'didNotJoin') return row.noShowReason || '—';
  if (row.postponedJoiningDate) return `Postponed to ${fmtDay(row.postponedJoiningDate)}${row.postponementReason ? ` — ${row.postponementReason}` : ''}`;
  if (row.cancellationReason) return `Cancelled — ${row.cancellationReason}`;
  return '—';
}

const NO_SHOW_FLOW: string[] = [
  'HR marks the candidate Did Not Join — a reason is mandatory.',
  'HR Admin reviews the no-show record.',
  'Offer status is updated per the decision.',
  'Recruitment is notified via the audit history.',
  'Requisition is reopened per headcount plan.',
  'Preboarding is closed as No Show.',
  'No employee record is created.',
];

/* ════════════════════════════════════════════════════════════════════════════
 * Page component
 * ══════════════════════════════════════════════════════════════════════════ */
export default function JoiningFormalitiesPage() {
  const router = useRouter();

  const [data, setData] = useState<FormalitiesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  /* ── Modal state ── */
  const [modal, setModal] = useState<ModalState | null>(null);
  const [confirmSuccess, setConfirmSuccess] = useState<ConfirmSuccess | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sendingConfirmId, setSendingConfirmId] = useState<string | null>(null);
  const [formError, setFormError] = useState('');

  /* confirm-joined fields */
  const [fActualDate, setFActualDate] = useState('');
  const [fReportingTime, setFReportingTime] = useState('');
  const [fReportingLocation, setFReportingLocation] = useState('');
  const [fRemarks, setFRemarks] = useState('');
  /* shared fields */
  const [fReason, setFReason] = useState('');
  const [fNewDate, setFNewDate] = useState('');

  /* ── Fetch ── */
  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/preboarding/brd/joining-formalities', { headers: getAuthHeaders() });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load joining formalities');
      setData(json as FormalitiesData);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load joining formalities');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- kick off initial data load
  useEffect(() => { load(); }, [load]);

  const scrollToSection = (key: SectionKey) => {
    document.getElementById(`jf-section-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  /* ── Open modal helpers ── */
  const openModal = (action: ModalAction, row: FormalityRow) => {
    setModal({ action, row });
    setConfirmSuccess(null);
    setFormError('');
    setFReason('');
    setFNewDate('');
    setFRemarks('');
    setFReportingTime('');
    setFReportingLocation('');
    setFActualDate(action === 'confirm' ? (expectedJoiningOf(row) || '').slice(0, 10) : '');
    if (action === 'postpone') {
      const base = expectedJoiningOf(row);
      if (base) {
        const d = new Date(base);
        if (!Number.isNaN(d.getTime())) {
          d.setDate(d.getDate() + 7);
          setFNewDate(d.toISOString().slice(0, 10));
        }
      }
    }
  };

  const closeModal = () => {
    setModal(null);
    setConfirmSuccess(null);
    setFormError('');
  };

  /* ── Submit modal action (contract 4) ── */
  const submitAction = async () => {
    if (!modal) return;
    const { action, row } = modal;

    /* client-side validations mirror the server rules */
    if (action === 'confirm' && !fActualDate) {
      setFormError('Actual Joining Date cannot be blank when confirming joined (BRD 5.11).');
      return;
    }
    if (action === 'postpone' && !fNewDate) {
      setFormError('A revised joining date is required.');
      return;
    }
    if (action !== 'confirm' && !fReason.trim()) {
      setFormError('A reason is mandatory for this action.');
      return;
    }

    setSubmitting(true);
    setFormError('');
    try {
      const body: Record<string, unknown> = { candidateId: row.id, action: API_ACTION[action] };
      if (action === 'confirm') {
        body.actualJoiningDate = fActualDate;
        if (fReportingTime.trim()) body.reportingTime = fReportingTime.trim();
        if (fReportingLocation.trim()) body.reportingLocation = fReportingLocation.trim();
        if (fRemarks.trim()) body.hrRemarks = fRemarks.trim();
      }
      if (action === 'postpone') body.joiningDate = fNewDate;
      if (action !== 'confirm') body.reason = fReason.trim();

      const res = await fetch('/api/preboarding/brd/joining-formalities', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Action failed');

      if (action === 'confirm') {
        setConfirmSuccess({ row, message: json.message || 'Joining confirmed. Proceed to Employee Creation to generate the employee record.' });
      } else {
        toast.success(json.message || 'Action recorded.');
        closeModal();
      }
      await load(true);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setSubmitting(false);
    }
  };

  /* ── BRD 5.11 — Send Joining Confirmation (no modal, direct action) ── */
  const sendJoiningConfirmation = async (row: FormalityRow) => {
    setSendingConfirmId(row.id);
    try {
      const res = await fetch('/api/preboarding/brd/joining-formalities', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ candidateId: row.id, action: 'send-confirmation' }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Could not send joining confirmation');
      toast.success(json.message || 'Joining confirmation sent to the candidate.');
      await load(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not send joining confirmation');
    } finally {
      setSendingConfirmId(null);
    }
  };

  /* ── Render: one stacked section ── */
  const renderSection = (section: SectionKey) => {
    if (!data) return null;
    const meta = SECTIONS.find((s) => s.key === section);
    const rows: FormalityRow[] = data[section];

    return (
      <div key={section} id={`jf-section-${section}`} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-6 scroll-mt-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-900 flex items-center gap-2">
            {meta?.icon}
            {meta?.label}
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${meta?.chipCls}`}>{rows.length}</span>
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[800px] w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="text-left py-3 px-4 font-semibold">Candidate</th>
                <th className="text-left py-3 px-4 font-semibold">Job Title</th>
                <th className="text-left py-3 px-4 font-semibold">Expected Joining</th>
                <th className="text-left py-3 px-4 font-semibold">Status</th>
                <th className="text-left py-3 px-4 font-semibold">Reporting</th>
                <th className="text-left py-3 px-4 font-semibold">Notes</th>
                <th className="text-left py-3 px-4 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 px-4 text-center text-slate-400 text-sm">No candidates in this group.</td>
                </tr>
              ) : (
                rows.map((row) => {
                  const chip = statusChipOf(row, section);
                  const isActiveRow = section !== 'joined' && section !== 'didNotJoin' && !row.employeeId;
                  return (
                    <tr key={row.id} className="hover:bg-slate-50/60">
                      <td className="py-2.5 px-4">
                        <span className="block font-medium text-slate-800">{row.candidateName}</span>
                        {row.preboardingId ? <span className="block text-xs text-slate-400">{row.preboardingId}</span> : null}
                      </td>
                      <td className="py-2.5 px-4 text-slate-600">{row.jobTitle || '—'}</td>
                      <td className="py-2.5 px-4 text-slate-600">{fmtDay(expectedJoiningOf(row))}</td>
                      <td className="py-2.5 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${chip.cls}`}>{chip.label}</span>
                        {row.employeeId ? (
                          <span className="ml-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">{row.employeeId}</span>
                        ) : null}
                      </td>
                      <td className="py-2.5 px-4 text-slate-600 text-xs">
                        {row.reportingTime || row.reportingLocation
                          ? [row.reportingTime, row.reportingLocation].filter(Boolean).join(' · ')
                          : '—'}
                      </td>
                      <td className="py-2.5 px-4 text-slate-500 text-xs max-w-[220px] truncate" title={notesOf(row, section)}>
                        {notesOf(row, section)}
                      </td>
                      <td className="py-2.5 px-4">
                        {section === 'joined' || row.employeeId ? (
                          <button
                            onClick={() => router.push('/employees')}
                            className="border border-slate-300 text-slate-700 hover:bg-slate-50 px-2.5 py-1 rounded-md text-xs font-medium inline-flex items-center gap-1.5"
                          >
                            <FiUserCheck className="h-3.5 w-3.5" /> View Employee
                          </button>
                        ) : section === 'didNotJoin' ? (
                          <span className="text-xs text-slate-400 italic">Closed — no employee record created</span>
                        ) : isActiveRow ? (
                          <div className="flex flex-wrap gap-1.5">
                            <button
                              onClick={() => openModal('confirm', row)}
                              className="bg-teal-600 hover:bg-teal-700 text-white px-2.5 py-1 rounded-md text-xs font-medium inline-flex items-center gap-1.5"
                            >
                              <FiCheckCircle className="h-3.5 w-3.5" /> Confirm Joined
                            </button>
                            <button
                              onClick={() => openModal('dnj', row)}
                              className="border border-red-300 text-red-700 hover:bg-red-50 px-2.5 py-1 rounded-md text-xs font-medium inline-flex items-center gap-1.5"
                            >
                              <FiUserX className="h-3.5 w-3.5" /> Did Not Join
                            </button>
                            <button
                              onClick={() => openModal('postpone', row)}
                              className="border border-slate-300 text-slate-700 hover:bg-slate-50 px-2.5 py-1 rounded-md text-xs font-medium inline-flex items-center gap-1.5"
                            >
                              <FiCalendar className="h-3.5 w-3.5" /> Postpone
                            </button>
                            <button
                              onClick={() => openModal('cancel', row)}
                              className="bg-red-600 hover:bg-red-700 text-white px-2.5 py-1 rounded-md text-xs font-medium inline-flex items-center gap-1.5"
                            >
                              <FiXCircle className="h-3.5 w-3.5" /> Cancel
                            </button>
                            <button
                              onClick={() => void sendJoiningConfirmation(row)}
                              disabled={sendingConfirmId === row.id}
                              className="border border-teal-300 text-teal-700 hover:bg-teal-50 px-2.5 py-1 rounded-md text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-60"
                              title="Send the candidate a joining confirmation message (BRD 5.11)"
                            >
                              <FiSend className="h-3.5 w-3.5" /> {sendingConfirmId === row.id ? 'Sending…' : 'Send Confirmation'}
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const modalTitle: Record<ModalAction, string> = {
    confirm: 'Confirm Joined',
    dnj: 'Mark Did Not Join',
    postpone: 'Postpone Joining',
    cancel: 'Cancel Joining',
  };

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Joining Formalities</h1>
          <p className="text-sm text-slate-500 mt-0.5">Used on or immediately before the actual joining date</p>
        </div>
        <button
          onClick={() => load(true)}
          className="border border-slate-300 text-slate-700 hover:bg-slate-50 inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium"
        >
          <FiRefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* ── Counts chips row ── */}
      <div className="flex flex-wrap gap-2">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            onClick={() => scrollToSection(s.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium inline-flex items-center gap-1.5 hover:opacity-80 ${s.chipCls}`}
            title={`Jump to ${s.label}`}
          >
            {s.icon}
            {s.label}: {data?.counts[s.key] ?? 0}
          </button>
        ))}
      </div>

      {/* ── Loading skeleton ── */}
      {loading && (
        <div className="space-y-4" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-3">
              <div className="h-5 w-48 bg-slate-100 rounded animate-pulse" />
              {[0, 1, 2].map((j) => <div key={j} className="h-8 bg-slate-100 rounded animate-pulse" />)}
            </div>
          ))}
        </div>
      )}

      {/* ── Error state ── */}
      {!loading && error && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-10 text-center">
          <FiAlertTriangle className="h-10 w-10 text-red-400 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-slate-700">Failed to load joining formalities</h3>
          <p className="text-sm text-slate-500 mt-1">{error}</p>
          <button
            onClick={() => load()}
            className="mt-4 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-3.5 py-2 rounded-lg inline-flex items-center gap-2"
          >
            <FiRefreshCw className="h-4 w-4" /> Retry
          </button>
        </div>
      )}

      {/* ── Empty overall state ── */}
      {!loading && !error && data && data.counts && Object.values(data.counts).every((v) => v === 0) && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-10 text-center">
          <FiCalendar className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-slate-700">No joiners scheduled</h3>
          <p className="text-sm text-slate-500 mt-1">Candidates appear here once they have a confirmed joining date.</p>
        </div>
      )}

      {/* ── Stacked sections ── */}
      {!loading && !error && data && (
        <>
          {renderSection('reportingToday')}
          {renderSection('reportingThisWeek')}
          {renderSection('overdue')}
          {renderSection('awaitingFormalities')}
          {renderSection('joined')}
          {renderSection('didNotJoin')}

          {/* ── No-show workflow info card (BRD) ── */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-6">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2 mb-3">
              <FiUserX className="h-4 w-4 text-red-600" /> No-Show Workflow
            </h3>
            <ol className="space-y-2">
              {NO_SHOW_FLOW.map((step, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-slate-600">
                  <span className="h-5 w-5 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-xs text-slate-400">
              Did Not Join / Postpone / Cancel always require a reason — the reason is mandatory on the server as well (HTTP 400 otherwise).
            </p>
          </div>
        </>
      )}

      {/* ── Action modal ── */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={modalTitle[modal.action]}>
          <div className="bg-white rounded-xl p-6 max-w-md w-full space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">{modalTitle[modal.action]}</h3>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600" aria-label="Close">
                <FiX className="h-5 w-5" />
              </button>
            </div>

            {/* Candidate context */}
            <div className="bg-slate-50 rounded-lg px-3 py-2.5 text-xs text-slate-600">
              <span className="font-medium text-slate-800">{modal.row.candidateName}</span>
              {modal.row.preboardingId ? ` · ${modal.row.preboardingId}` : ''} · {modal.row.jobTitle || '—'}
              {' · '}expected {fmtDay(expectedJoiningOf(modal.row))}
            </div>

            {confirmSuccess ? (
              /* ── Success panel (confirm-joined) ── */
              <div className="space-y-4">
                <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                  <FiCheckCircle className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
                  <p className="text-sm text-emerald-800">{confirmSuccess.message}</p>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={closeModal}
                    className="border border-slate-300 text-slate-700 hover:bg-slate-50 px-3.5 py-2 rounded-lg text-sm font-medium"
                  >
                    Close
                  </button>
                  <button
                    onClick={() => router.push(`/preboarding/employee-creation?candidateId=${confirmSuccess.row.id}`)}
                    className="bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-3.5 py-2 rounded-lg inline-flex items-center gap-2"
                  >
                    Go to Employee Creation <FiArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : (
              /* ── Action forms ── */
              <div className="space-y-4">
                {modal.action === 'confirm' && (
                  <>
                    <div>
                      <label htmlFor="actual-joining-date" className="block text-sm font-medium text-slate-700 mb-1">
                        Actual Joining Date <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="actual-joining-date"
                        type="date"
                        value={fActualDate}
                        onChange={(e) => setFActualDate(e.target.value)}
                        className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
                      />
                    </div>
                    <div>
                      <label htmlFor="reporting-time" className="block text-sm font-medium text-slate-700 mb-1">Reporting Time</label>
                      <input
                        id="reporting-time"
                        type="time"
                        value={fReportingTime}
                        onChange={(e) => setFReportingTime(e.target.value)}
                        className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
                      />
                    </div>
                    <div>
                      <label htmlFor="reporting-location" className="block text-sm font-medium text-slate-700 mb-1">Reporting Location</label>
                      <input
                        id="reporting-location"
                        type="text"
                        value={fReportingLocation}
                        onChange={(e) => setFReportingLocation(e.target.value)}
                        placeholder="e.g. Marqai HQ — Whitefield, BLR"
                        className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
                      />
                    </div>
                    <div>
                      <label htmlFor="hr-remarks" className="block text-sm font-medium text-slate-700 mb-1">HR Remarks</label>
                      <textarea
                        id="hr-remarks"
                        rows={3}
                        value={fRemarks}
                        onChange={(e) => setFRemarks(e.target.value)}
                        placeholder="Optional notes recorded against the joining"
                        className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
                      />
                    </div>
                  </>
                )}

                {modal.action === 'postpone' && (
                  <div>
                    <label htmlFor="revised-joining-date" className="block text-sm font-medium text-slate-700 mb-1">
                      Revised Joining Date <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="revised-joining-date"
                      type="date"
                      value={fNewDate}
                      onChange={(e) => setFNewDate(e.target.value)}
                      className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
                    />
                  </div>
                )}

                {modal.action !== 'confirm' && (
                  <div>
                    <label htmlFor="action-reason" className="block text-sm font-medium text-slate-700 mb-1">
                      Reason <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      id="action-reason"
                      rows={3}
                      value={fReason}
                      onChange={(e) => setFReason(e.target.value)}
                      placeholder="Mandatory — recorded in the audit history"
                      className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
                    />
                    {modal.action === 'dnj' && (
                      <p className="mt-2 text-xs text-slate-500 flex items-start gap-1.5">
                        <FiInfo className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        No employee record will be created. Recruitment is notified via audit history (BRD No-show workflow).
                      </p>
                    )}
                  </div>
                )}

                {formError && (
                  <p className="text-xs text-red-600 flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    <FiAlertTriangle className="h-3.5 w-3.5 shrink-0" /> {formError}
                  </p>
                )}

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    onClick={closeModal}
                    className="border border-slate-300 text-slate-700 hover:bg-slate-50 px-3.5 py-2 rounded-lg text-sm font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={submitAction}
                    disabled={submitting}
                    className={
                      modal.action === 'confirm'
                        ? 'bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-3.5 py-2 rounded-lg inline-flex items-center gap-2 disabled:opacity-60'
                        : modal.action === 'cancel' || modal.action === 'dnj'
                          ? 'bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-3.5 py-2 rounded-lg inline-flex items-center gap-2 disabled:opacity-60'
                          : 'border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium px-3.5 py-2 rounded-lg inline-flex items-center gap-2 disabled:opacity-60'
                    }
                  >
                    {submitting ? 'Saving…' : modalTitle[modal.action]}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
