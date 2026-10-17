'use client';

/**
 * Attendance Policy Rules — Task 84
 *
 * Owns everything that defines the ATTENDANCE POLICY itself:
 *   1. Work Hours & Thresholds, Shift & Weekend Rules, Geofencing & Grace
 *      Period (moved OUT of /attendance/settings per user request)
 *   2. Auto-Present for Management Employees toggle + run controls
 *      (moved OUT of /attendance/settings)
 *
 * Approval workflows live on their own page (/attendance/approval-workflows)
 * and policy documents stay on /attendance/settings — the two concerns are
 * now separate pages as requested.
 */

import { useEffect, useState, Suspense } from 'react';
import { FiSliders, FiClock, FiSave, FiRefreshCw } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { useCompanyContextStore } from '@/store/companyContextStore';
import { getAuthHeaders as getSessionAuthHeaders } from '@/lib/token-storage';
import ModuleSettingsPanel, { attendanceSections } from '@/components/ModuleSettingsPanel';
import { AttendanceMockSettingsPreview } from '../MarqaitechAttendancePolicyPreview';

function getAuthHeaders() {
  return getSessionAuthHeaders();
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${checked ? 'bg-teal-500' : 'bg-slate-200'}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}

/* ─── Auto-Present for Management (moved from Attendance Settings, Task 82/84) ───
 * Enable/disable + run controls. The flag lives on AttendancePolicyConfig
 * (server-side) so the attendance API and reports honour it everywhere. */
function apPad2(n: number) { return String(n).padStart(2, '0'); }

function AutoPresentCard() {
  const [enabled, setEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState<'today' | 'backfill' | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/attendance/auto-present', { headers: getAuthHeaders() });
        if (res.ok) {
          const d = await res.json();
          setEnabled(!!d?.enabled);
        }
      } catch { /* keep off */ } finally { setLoaded(true); }
    })();
  }, []);

  const save = async (next: boolean) => {
    setSaving(true);
    try {
      const res = await fetch('/api/attendance-policy-config', {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ autoPresentManagementEnabled: next }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || 'Save failed');
      setEnabled(next);
      toast.success(next
        ? 'Auto-present for management ENABLED — punches will be auto-filled per rules/roster'
        : 'Auto-present for management disabled');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally { setSaving(false); }
  };

  const run = async (backfillDays: number) => {
    setRunning(backfillDays > 0 ? 'backfill' : 'today');
    try {
      const now = new Date();
      const todayKey = `${now.getFullYear()}-${apPad2(now.getMonth() + 1)}-${apPad2(now.getDate())}`;
      const res = await fetch('/api/attendance/auto-present', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ backfillDays, tzOffset: now.getTimezoneOffset(), todayKey }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) throw new Error(d?.error || 'Run failed');
      toast.success(d?.message || 'Auto-present run complete');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Run failed');
    } finally { setRunning(null); }
  };

  return (
    <div className="thb-card p-5 border-l-4 border-l-teal-500">
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        <div className="p-2.5 rounded-xl bg-teal-50 text-teal-600 flex-shrink-0">
          <FiClock className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-thb-text-primary">Auto-Present for Management Employees</h3>
            {loaded && (
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${enabled ? 'bg-teal-100 text-teal-700' : 'bg-slate-100 text-slate-500'}`}>
                {enabled ? 'Enabled' : 'Disabled'}
              </span>
            )}
          </div>
          <p className="text-xs text-thb-text-secondary mt-1 leading-relaxed">
            When enabled, management employees are automatically marked <b>Present</b> with in/out punches taken from the
            attendance rules / roster set (or the default shift below) for every working day — even if they do not punch.
            Real punches always win: existing records are never overwritten, only missing check-in/check-out halves are
            filled. Approved leave, weekends and holidays are respected.
          </p>
          <div className="flex items-center gap-3 mt-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Toggle checked={enabled} onChange={() => save(!enabled)} />
              <span className="text-xs font-medium text-thb-text-secondary">{enabled ? 'On' : 'Off'}</span>
            </div>
            <button
              onClick={() => save(!enabled)}
              disabled={saving || !loaded}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 text-white text-xs font-medium hover:bg-teal-700 disabled:opacity-50 transition-colors"
            >
              <FiSave className="w-3.5 h-3.5" /> {saving ? 'Saving…' : `Save & ${enabled ? 'Disable' : 'Enable'}`}
            </button>
            <span className="hidden sm:inline text-thb-border">|</span>
            <button
              onClick={() => run(0)}
              disabled={running !== null}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-teal-300 text-teal-700 text-xs font-medium hover:bg-teal-50 disabled:opacity-50 transition-colors"
              title="Apply auto-present for today's working day now"
            >
              <FiRefreshCw className={`w-3.5 h-3.5 ${running === 'today' ? 'animate-spin' : ''}`} /> {running === 'today' ? 'Applying…' : 'Apply for today'}
            </button>
            <button
              onClick={() => run(7)}
              disabled={running !== null}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 text-xs font-medium hover:bg-slate-50 disabled:opacity-50 transition-colors"
              title="Fill the last 7 working days (today + 6 days back) for management employees"
            >
              <FiRefreshCw className={`w-3.5 h-3.5 ${running === 'backfill' ? 'animate-spin' : ''}`} /> {running === 'backfill' ? 'Backfilling…' : 'Backfill last 7 days'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PolicyRulesContent() {
  const { user } = useAuthStore();
  const selectedTenant = useCompanyContextStore((state) => state.selectedTenant());
  const selectedTenantId = useCompanyContextStore((state) => state.selectedTenantId);
  const contextHydrated = useCompanyContextStore((state) => state.hydrated);
  const role = (user?.role || '').toLowerCase();
  const isAdmin = ['super_admin', 'tenant_admin', 'admin'].includes(role);
  const selectedId = role === 'super_admin' ? (selectedTenant?.id || selectedTenantId || '') : '';
  const lookupKey = `${role}:${selectedId}`;
  const [tenantVariantLookup, setTenantVariantLookup] = useState<{
    key: string;
    result: { isMarqaitechGroup: boolean; reason: string; tenantSlug?: string | null };
  } | null>(null);
  const lookupResult = tenantVariantLookup?.key === lookupKey
    ? tenantVariantLookup.result
    : role === 'super_admin' && contextHydrated && !selectedId
      ? { isMarqaitechGroup: false, reason: 'tenant_not_selected' }
      : null;

  useEffect(() => {
    let cancelled = false;
    if (role === 'super_admin' && !contextHydrated) return () => { cancelled = true; };
    if (role === 'super_admin' && !selectedId) return () => { cancelled = true; };
    const query = selectedId
      ? `?tenantId=${encodeURIComponent(selectedId)}`
      : '';
    fetch(`/api/attendance/policy-rules/tenant-variant${query}`, { headers: getAuthHeaders(), cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok || !data) throw new Error('Tenant scope lookup failed');
        return data;
      })
      .then((data) => {
        if (!cancelled) {
          setTenantVariantLookup({
            key: lookupKey,
            result: {
              isMarqaitechGroup: data.isMarqaitechGroup === true,
              reason: typeof data.reason === 'string' ? data.reason : 'scope_resolved',
              tenantSlug: typeof data.tenantSlug === 'string' ? data.tenantSlug : null,
            },
          });
        }
      })
      .catch(() => {
        if (!cancelled) setTenantVariantLookup({ key: lookupKey, result: { isMarqaitechGroup: false, reason: 'lookup_failed' } });
      });

    return () => { cancelled = true; };
  }, [role, lookupKey, selectedId, contextHydrated]);

  if (!isAdmin) {
    return (
      <div className="text-center py-12">
        <FiSliders className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-500">Attendance policy rules are restricted to HR admins.</p>
      </div>
    );
  }

  // Marqaitech Group gets the proposed editable preview on this same policy
  // route. Other tenants retain the existing policy UI and live settings.
  if (lookupResult?.isMarqaitechGroup === true) {
    return <AttendanceMockSettingsPreview />;
  }

  // Wait for tenant context/verified lookup before choosing between tenant UIs.
  if (lookupResult === null) {
    return <div className="flex items-center justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full" /></div>;
  }

  return (
    <div className="space-y-6">
      {process.env.NODE_ENV === 'development' && (
        <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {lookupResult.isMarqaitechGroup
            ? 'Marqaitech attendance policy is active.'
            : `Marqaitech attendance policy is not active (${lookupResult.reason}${lookupResult.tenantSlug ? `; tenant slug: ${lookupResult.tenantSlug}` : ''}). The default policy screen is shown.`}
        </div>
      )}
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-teal-50">
          <FiSliders className="w-5 h-5 text-teal-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-thb-text-primary">Attendance Policy Rules</h1>
          <p className="text-sm text-thb-text-secondary">
            Work hours, thresholds, shift &amp; weekend rules, geofencing &amp; grace periods, and management auto-present —
            the rules that decide how attendance is marked. Approval workflows are configured separately under
            Attendance → Approval Workflows.
          </p>
        </div>
      </div>

      {/* Policy rule sections (moved from Attendance Settings) */}
      <ModuleSettingsPanel sections={attendanceSections} />

      {/* Auto-Present for Management Employees (moved from Attendance Settings) */}
      <AutoPresentCard />
    </div>
  );
}

export default function AttendancePolicyRulesPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full" /></div>}>
      <PolicyRulesContent />
    </Suspense>
  );
}
