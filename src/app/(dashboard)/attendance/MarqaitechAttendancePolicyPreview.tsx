'use client';

import { useEffect, useState } from 'react';
import {
  FiAlertCircle,
  FiCheckCircle,
  FiClock,
  FiCoffee,
  FiLogIn,
  FiLogOut,
  FiSettings,
  FiTrendingUp,
  FiEdit2,
  FiSave,
  FiX,
} from 'react-icons/fi';
import { getAuthHeaders } from '@/lib/token-storage';

type MockPolicy = {
  shiftStart: string;
  shiftEnd: string;
  graceMinutes: number;
  lateLimit: number;
  breakStart: string;
  breakAllowance: number;
  mandatoryBreak: boolean;
  productionHours: number;
  evaluateAt: string;
  manualPunchByHr: boolean;
  saturdayWeekend: boolean;
  sundayWeekend: boolean;
  autoPresentManagement: boolean;
};

const DEFAULT_POLICY: MockPolicy = {
  shiftStart: '09:30', shiftEnd: '18:30', graceMinutes: 30, lateLimit: 4,
  breakStart: '13:30', breakAllowance: 60, mandatoryBreak: true,
  productionHours: 8, evaluateAt: '18:30', manualPunchByHr: false,
  saturdayWeekend: false, sundayWeekend: true,
  autoPresentManagement: false,
};

const MOCK_KEY = 'attendance_mock_policy_preview';

function displayTime(value: string) {
  const [hours, minutes] = value.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${period}`;
}

function ordinal(value: number) {
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`;
  return `${value}${value % 10 === 1 ? 'st' : value % 10 === 2 ? 'nd' : value % 10 === 3 ? 'rd' : 'th'}`;
}

function lateThresholdTime(start: string, graceMinutes: number) {
  const [hours, minutes] = start.split(':').map(Number);
  const total = (hours * 60 + minutes + graceMinutes) % (24 * 60);
  return displayTime(`${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`);
}

const Field = ({ label, value, hint }: { label: string; value: string; hint?: string }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-4">
    <div className="text-xs font-medium text-slate-500">{label}</div>
    <div className="mt-2 text-lg font-semibold text-slate-900">{value}</div>
    {hint && <div className="mt-1 text-xs leading-5 text-slate-500">{hint}</div>}
  </div>
);

function PolicyToggle({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${checked ? 'bg-teal-600' : 'bg-slate-300'}`}
    >
      <span className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}

const Rule = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="flex gap-3 rounded-xl bg-slate-50 p-4">
    <FiCheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" />
    <div>
      <div className="text-sm font-semibold text-slate-800">{title}</div>
      <div className="mt-1 text-sm leading-6 text-slate-600">{children}</div>
    </div>
  </div>
);

export function AttendanceMockSettingsPreview() {
  const [policy, setPolicy] = useState<MockPolicy>(DEFAULT_POLICY);
  const [draft, setDraft] = useState<MockPolicy>(DEFAULT_POLICY);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch('/api/attendance-policy-config', { headers: getAuthHeaders(), cache: 'no-store' });
        const data = await response.json().catch(() => null);
        const config = data?.config || {};
        const stored = localStorage.getItem(MOCK_KEY);
        const local = stored ? JSON.parse(stored) : {};
        const persisted = {
          shiftStart: config.shiftStartDefault ?? DEFAULT_POLICY.shiftStart,
          shiftEnd: config.shiftEndDefault ?? DEFAULT_POLICY.shiftEnd,
          graceMinutes: config.lateGraceMinutes ?? DEFAULT_POLICY.graceMinutes,
          lateLimit: config.lateMarkAllowancePerMonth ?? DEFAULT_POLICY.lateLimit,
          breakStart: config.breakStartTime ?? DEFAULT_POLICY.breakStart,
          breakAllowance: config.breakDurationMinutes ?? DEFAULT_POLICY.breakAllowance,
          mandatoryBreak: config.mandatoryBreakEnabled ?? DEFAULT_POLICY.mandatoryBreak,
          productionHours: config.overtimeThresholdMinutes == null ? DEFAULT_POLICY.productionHours : Number(config.overtimeThresholdMinutes) / 60,
          evaluateAt: config.shiftEndDefault ?? DEFAULT_POLICY.evaluateAt,
          autoPresentManagement: config.autoPresentManagementEnabled ?? DEFAULT_POLICY.autoPresentManagement,
          saturdayWeekend: Array.isArray(data?.weekendDays) ? data.weekendDays.includes(6) : undefined,
          sundayWeekend: Array.isArray(data?.weekendDays) ? data.weekendDays.includes(0) : undefined,
        };
        const parsed = { ...DEFAULT_POLICY, ...persisted, ...local } as MockPolicy;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- Reconcile browser preview after hydration.
        setPolicy(parsed);
        setDraft(parsed);
      } catch { /* keep preview defaults */ }
    })();
  }, []);

  const savePreview = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/attendance-policy-config', {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Marqaitech Group Attendance Policy',
          shiftStartDefault: draft.shiftStart,
          shiftEndDefault: draft.shiftEnd,
          lateGraceMinutes: draft.graceMinutes,
          lateMarkAllowancePerMonth: draft.lateLimit,
          lateMarkHalfDayOnExceed: true,
          breakStartTime: draft.breakStart,
          breakEndTime: '14:30',
          breakDurationMinutes: draft.breakAllowance,
          mandatoryBreakEnabled: draft.mandatoryBreak,
          overtimeThresholdMinutes: draft.productionHours * 60,
          autoPresentManagementEnabled: draft.autoPresentManagement,
          saturdayWeekend: draft.saturdayWeekend,
          sundayWeekend: draft.sundayWeekend,
          attendanceRuleScope: 'marqaitechgroup_only',
        }),
      });
      if (!response.ok) throw new Error('Policy save failed');
      setPolicy(draft);
      localStorage.setItem(MOCK_KEY, JSON.stringify(draft));
      setEditing(false);
    } catch (error) {
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    setDraft(policy);
    setEditing(false);
  };

  const togglePreview = (key: 'saturdayWeekend' | 'sundayWeekend' | 'autoPresentManagement') => {
    const next = { ...policy, [key]: !policy[key] };
    setPolicy(next);
    setDraft(next);
    localStorage.setItem(MOCK_KEY, JSON.stringify(next));
  };

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-teal-50 p-3 text-teal-700"><FiSettings className="h-5 w-5" /></div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">Attendance Policy Rules</h1>
              <span className="rounded-full bg-teal-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-teal-800">Marqaitech Group</span>
            </div>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">Marqaitech Group attendance rules. Saved values are used by live attendance processing for this tenant.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!editing ? (
            <button onClick={() => { setDraft(policy); setEditing(true); }} className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-800"><FiEdit2 /> Edit policy values</button>
          ) : (
            <><button onClick={savePreview} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-60"><FiSave /> {saving ? 'Saving…' : 'Save policy'}</button><button onClick={cancelEdit} disabled={saving} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600"><FiX /> Cancel</button></>
          )}
        </div>
      </header>

      {editing && (
        <section className="rounded-2xl border border-teal-200 bg-teal-50/60 p-5 shadow-sm">
              <h2 className="font-semibold text-slate-900">Edit Marqaitech attendance rules</h2>
              <p className="mt-1 text-xs text-slate-600">Saving updates the Marqaitech attendance policy used by attendance processing.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {([
              ['shiftStart', 'Shift starts', 'time'], ['shiftEnd', 'Shift ends', 'time'],
              ['graceMinutes', 'Late grace (minutes)', 'number'], ['lateLimit', 'Late marks before half-day', 'number'],
              ['breakStart', 'Break starts', 'time'], ['breakAllowance', 'Allowed break (minutes)', 'number'],
              ['productionHours', 'Required production (hours)', 'number'], ['evaluateAt', 'Evaluate production from', 'time'],
            ] as const).map(([key, label, type]) => (
              <label key={key} className="block text-xs font-medium text-slate-700">{label}
                <input type={type} min={type === 'number' ? 0 : undefined} step={type === 'number' ? 1 : undefined} value={draft[key]} onChange={(event) => setDraft({ ...draft, [key]: type === 'number' ? Number(event.target.value) : event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100" />
              </label>
            ))}
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-3 text-xs font-medium text-slate-700"><input type="checkbox" checked={draft.mandatoryBreak} onChange={(event) => setDraft({ ...draft, mandatoryBreak: event.target.checked })} className="accent-teal-700" />Require break regularization if a punch is missing</label>
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-3 text-xs font-medium text-slate-700"><input type="checkbox" checked={draft.manualPunchByHr} onChange={(event) => setDraft({ ...draft, manualPunchByHr: event.target.checked })} className="accent-teal-700" />Allow manual check-in/out when HR enables it</label>
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-3 text-xs font-medium text-slate-700"><input type="checkbox" checked={draft.saturdayWeekend} onChange={(event) => setDraft({ ...draft, saturdayWeekend: event.target.checked })} className="accent-teal-700" />Saturday is a weekend</label>
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-3 text-xs font-medium text-slate-700"><input type="checkbox" checked={draft.sundayWeekend} onChange={(event) => setDraft({ ...draft, sundayWeekend: event.target.checked })} className="accent-teal-700" />Sunday is a weekend</label>
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-3 text-xs font-medium text-slate-700"><input type="checkbox" checked={draft.autoPresentManagement} onChange={(event) => setDraft({ ...draft, autoPresentManagement: event.target.checked })} className="accent-teal-700" />Auto-present management employees</label>
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
        <div className="flex gap-3"><FiAlertCircle className="mt-1 h-4 w-4 shrink-0" /><p><b>Marqaitech policy.</b> Saving this screen updates the tenant Attendance Policy Config used by attendance processing. Other tenants are not changed.</p></div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2"><FiClock className="h-4 w-4 text-teal-700" /><h2 className="font-semibold text-slate-900">Shift &amp; Weekend Rules</h2></div>
        <p className="mb-4 text-sm text-slate-500">Weekend definitions and shift change policies</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4">
            <Field label="Saturday as Weekend" value={policy.saturdayWeekend ? 'Enabled' : 'Disabled'} />
            <PolicyToggle checked={policy.saturdayWeekend} onChange={() => togglePreview('saturdayWeekend')} label="Toggle Saturday as weekend" />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4">
            <Field label="Sunday as Weekend" value={policy.sundayWeekend ? 'Enabled' : 'Disabled'} />
            <PolicyToggle checked={policy.sundayWeekend} onChange={() => togglePreview('sundayWeekend')} label="Toggle Sunday as weekend" />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="rounded-xl bg-teal-50 p-2.5 text-teal-700"><FiCheckCircle className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold text-slate-900">Auto-Present for Management Employees</h2>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${policy.autoPresentManagement ? 'bg-teal-100 text-teal-800' : 'bg-slate-100 text-slate-600'}`}>
                {policy.autoPresentManagement ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              When enabled, management employees are automatically marked <b>Present</b> with in/out punches taken from the attendance rules / roster set (or the default shift) for every working day, even if they do not punch. Real punches always win: existing records are never overwritten; only missing check-in/check-out halves are filled. Approved leave, weekends, and holidays are respected.
            </p>
            <div className="mt-3 flex items-center gap-2 text-sm font-medium text-slate-700">
              <PolicyToggle checked={policy.autoPresentManagement} onChange={() => togglePreview('autoPresentManagement')} label="Toggle auto-present for management employees" />
              {policy.autoPresentManagement ? 'On' : 'Off'}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2"><FiClock className="h-4 w-4 text-teal-700" /><h2 className="font-semibold text-slate-900">Shift and late arrival</h2></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Shift starts" value={displayTime(policy.shiftStart)} />
          <Field label="Shift ends" value={displayTime(policy.shiftEnd)} />
          <Field label="Grace fallback" value={`${policy.graceMinutes} minutes`} hint="Late status is based on shift start plus the loaded grace period." />
          <Field label="Late limit fallback" value={`${policy.lateLimit} marks / month`} hint={`The ${ordinal(policy.lateLimit)} late can mark that day Half Day.`} />
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Rule title="Late arrival status">Show the late status on the attendance record when check-in is after shift start plus the configured grace period. With these values, that is after {lateThresholdTime(policy.shiftStart, policy.graceMinutes)}.</Rule>
          <Rule title={`${ordinal(policy.lateLimit)} late in the month`}>Show “{ordinal(policy.lateLimit)} late this month” and mark the day Half Day when the monthly limit and half-day-on-exceed rule are enabled.</Rule>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2"><FiLogIn className="h-4 w-4 text-teal-700" /><h2 className="font-semibold text-slate-900">Punch method and in-app actions</h2></div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Check-in" value="Face scan only" />
          <Field label="Check-out" value="Face scan only" />
          <Field label="Manual override" value={policy.manualPunchByHr ? 'Enabled by HR' : 'HR enabled only'} hint="Manual check-in/out remain unavailable until HR enables the override." />
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Rule title="Available in-app punch buttons">Show only Break In and Break Out. Do not show manual Check-in or Check-out buttons.</Rule>
          <Rule title="Face scan flow">The first face scan records check-in. A later face scan records check-out according to the punch sequence.</Rule>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2"><FiCoffee className="h-4 w-4 text-teal-700" /><h2 className="font-semibold text-slate-900">Break punches</h2></div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Break starts" value={displayTime(policy.breakStart)} hint="Break-out is recorded when the employee returns." />
          <Field label="Allowed break duration" value={`${policy.breakAllowance} minutes`} hint={`Only the time beyond ${policy.breakAllowance} minutes is deducted from production.`} />
          <Field label="Missing-break regularization" value={policy.mandatoryBreak ? 'Required' : 'Not required by fallback'} hint="Pending production remains uncalculated until approval when regularization is required." />
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Rule title={`Break exceeds ${policy.breakAllowance} minutes`}>Deduct only the excess from production. Example: if the break is 20 minutes over the allowance, deduct 20 minutes from production.</Rule>
          <Rule title="Break In or Break Out is missing">Show the missing-break status and require an employee regularization request. Keep production hours uncalculated until HR approves it.</Rule>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2"><FiTrendingUp className="h-4 w-4 text-teal-700" /><h2 className="font-semibold text-slate-900">Production and overtime</h2></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Production threshold fallback" value={`${policy.productionHours} net hours`} />
          <Field label="Calculation" value="Checkout − check-in − break" />
          <Field label="Evaluate production from" value={`${displayTime(policy.evaluateAt)} onward`} hint={`A checkout before ${displayTime(policy.evaluateAt)} does not trigger the low-production alert yet.`} />
          <Field label="Overtime" value="Net production above threshold" hint={`9 net hours = ${Math.max(0, 9 - policy.productionHours)} hour(s) OT at this threshold; shift-end time is not the OT trigger.`} />
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Rule title={`Before ${displayTime(policy.evaluateAt)}`}>Production-hours calculation and the low-production regularization alert begin only at or after {displayTime(policy.evaluateAt)}.</Rule>
          <Rule title={`After ${displayTime(policy.evaluateAt)}`}>Calculate net production when eligible. If it is below {policy.productionHours} hours, mark Half Day and show the production regularization action. Missing-break regularization must be approved first.</Rule>
          <Rule title="Overtime">Overtime = max(net production − {policy.productionHours} hours, 0). For example, 9 net production hours gives 1 hour overtime. It depends on production exceeding {policy.productionHours} hours—not on checkout being after {displayTime(policy.shiftEnd)}.</Rule>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-slate-900 p-5 text-white shadow-sm">
        <div className="flex items-center gap-2"><FiLogIn className="h-4 w-4 text-teal-300" /><FiLogOut className="h-4 w-4 text-teal-300" /><h2 className="font-semibold">Punch flow at a glance</h2></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          {[
            ['1', 'Face scan', 'Check-in; manual option off'],
            ['2', 'In-app action', 'Break In'],
            ['3', 'In-app action', 'Break Out'],
            ['4', 'Face scan', 'Check-out; manual option off'],
            ['5', 'At / after 6:30 PM', 'Evaluate production'],
            ['6', 'Break missing?', 'Regularize; HR approval first'],
          ].map(([number, title, caption]) => (
            <div key={number} className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs font-bold text-teal-300">STEP {number}</div>
              <div className="mt-2 text-sm font-semibold">{title}</div>
              <div className="mt-1 text-xs text-slate-300">{caption}</div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

export default function AttendanceMockSettingsPage() {
  return <AttendanceMockSettingsPreview />;
}
