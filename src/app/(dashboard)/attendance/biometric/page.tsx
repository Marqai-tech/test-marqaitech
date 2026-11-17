'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  FiCpu,
  FiPlus,
  FiRefreshCw,
  FiTrash2,
  FiKey,
  FiActivity,
  FiAlertTriangle,
  FiCheckCircle,
  FiXCircle,
  FiShield,
  FiUserCheck,
  FiCopy,
  FiX,
  FiClock,
  FiList,
  FiCalendar,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import ModuleTips from '@/components/ModuleTips';
import ModuleWorkflow from '@/components/ModuleWorkflow';
import { useCompanyContextStore } from '@/store/companyContextStore';

/* ── Auth helpers ── */
function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

/* ── Types ── */
interface BiometricDevice {
  id: string;
  name: string;
  serialNumber: string;
  vendor: string;
  model: string | null;
  firmwareVersion: string | null;
  branchId: string | null;
  branch?: { id: string; name: string } | null;
  geofenceId: string | null;
  geofence?: { id: string; name: string } | null;
  ipAddress: string | null;
  lastHeartbeatAt: string | null;
  encryptionKeyId: string | null;
  isActive: boolean;
  createdAt: string;
  _count?: { enrollments: number; punches: number };
}

interface BiometricEnrollment {
  id: string;
  employeeId: string;
  deviceId: string;
  templateHash: string;
  modality: string;
  qualityScore: number | null;
  isActive: boolean;
  enrolledAt: string;
  employee: { id: string; firstName: string; lastName: string; employeeId: string; email: string };
  device: { id: string; name: string; serialNumber: string; vendor: string };
}

interface BiometricPunch {
  id: string;
  deviceId: string;
  employeeId: string | null;
  punchType: string;
  punchTime: string;
  spoofingRisk: number;
  buddyPunchRisk: number;
  flagged: boolean;
  flagReasons: string[] | null;
  attendanceId: string | null;
  createdAt: string;
  device: { id: string; name: string; serialNumber: string; vendor: string; branch?: { name: string } | null };
  employee: { id: string; firstName: string; lastName: string; employeeId: string; email: string; department?: { id: string; name: string } | null } | null;
}

/* Task 83: day summary row — first In / last Out per employee per day. */
interface PunchDaySummary {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  department: string;
  dateKey: string;
  firstIn: string | null;
  lastOut: string | null;
  firstBreakIn: string | null;
  lastBreakOut: string | null;
  punchCount: number;
  flaggedCount: number;
  devices: string[];
}

interface AiThresholds {
  id: string;
  spoofingRiskThreshold: number;
  buddyPunchRiskThreshold: number;
  impossibleTravelKm: number;
  impossibleTravelMinutes: number;
  offHoursStartMinutes: number;
  offHoursEndMinutes: number;
}

interface ETimeOfficeSyncStatus {
  configured: boolean;
  lastRecord: string;
  status: {
    state?: string;
    lastSyncAt?: string;
    imported?: number;
    unmatched?: number;
    message?: string;
  } | null;
  // Task 158 — device staleness surface (best-effort fields).
  lastPunchAt?: string | null;
  lastPunchAgeDays?: number | null;
}

interface Branch { id: string; name: string }
interface Geofence { id: string; name: string }
interface Employee { id: string; employeeId: string; firstName: string; lastName: string; email: string; department?: { id: string; name: string } | null }

/* ── Tips & Workflow ── */
const biometricTips = [
  { title: 'Token Rotation', description: 'Rotate the device API token immediately if you suspect it has been leaked. The old token stops working the moment you rotate.' },
  { title: 'Never Store Raw Templates', description: 'The system stores only SHA-256 hashes of encrypted biometric templates. Even a database leak cannot reconstruct fingerprints.' },
  { title: 'TLS 1.3 Only', description: 'Devices must push over HTTPS with TLS 1.3. The webhook rejects plain HTTP connections.' },
  { title: 'AI Flagging is Non-Blocking', description: 'Flagged punches still create an Attendance record (for audit) but are marked "flagged" for manager review.' },
  { title: 'Heartbeat Health', description: 'Devices should send a heartbeat every 1–5 minutes. Devices with no heartbeat in 15+ minutes are shown as offline.' },
];

const biometricWorkflowSteps = [
  { step: 1, title: 'Register Device', description: 'Add a new biometric terminal with vendor + serial number. Save the returned API token to the device config.' },
  { step: 2, title: 'Enroll Employees', description: 'For each employee, capture their fingerprint/face on each device. The hashed template is stored for audit + dedup.' },
  { step: 3, title: 'Configure AI Thresholds', description: 'Set spoofing/buddy-punch risk thresholds and impossible-travel distance/time.' },
  { step: 4, title: 'Team Office Sync Pulls Punches', description: 'Use Sync from Team Office to import new punches. Automatic syncing runs when the deployment schedule and its credentials are configured.' },
  { step: 5, title: 'Review Flagged Punches', description: 'Flagged punches appear in the Punches tab. Manager reviews and either approves or rejects.' },
  { step: 6, title: 'Audit Trail', description: 'Every punch — flagged or clean — is written to the Attendance Audit Log for compliance (REQ-SEC-ATT-04).' },
];

/* ── Component ── */
export default function BiometricPage() {
  const { user } = useAuthStore();
  const effectiveCompanyId = useCompanyContextStore(s => s.effectiveCompanyId);
  const isAdmin = ['super_admin', 'tenant_admin', 'ceo', 'admin'].includes(user?.role || '');

  const [tab, setTab] = useState<'devices' | 'enrollments' | 'punches' | 'thresholds'>('devices');
  const [devices, setDevices] = useState<BiometricDevice[]>([]);
  const [enrollments, setEnrollments] = useState<BiometricEnrollment[]>([]);
  const [punches, setPunches] = useState<BiometricPunch[]>([]);
  const [thresholds, setThresholds] = useState<AiThresholds | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [geofences, setGeofences] = useState<Geofence[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDeviceForm, setShowDeviceForm] = useState(false);
  const [showEnrollForm, setShowEnrollForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [newToken, setNewToken] = useState<{ device: string; token: string } | null>(null);
  const [punchesSummary, setPunchesSummary] = useState<{ todayTotal: number; todayFlagged: number; last7Flagged: number } | null>(null);
  const [teamOfficeSync, setTeamOfficeSync] = useState<ETimeOfficeSyncStatus | null>(null);
  const [syncingTeamOffice, setSyncingTeamOffice] = useState(false);
  const [resyncing, setResyncing] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const cid = effectiveCompanyId();
  const scopeQuery = cid ? `companyId=${cid}&` : '';

  /* ── Task 83: Punches-tab filters + day-summary view ── */
  const [punchView, setPunchView] = useState<'summary' | 'events'>('summary');
  const [fEmployeeId, setFEmployeeId] = useState('');
  const [fDepartment, setFDepartment] = useState('');
  const [fPunchType, setFPunchType] = useState('');
  const [fFlagged, setFFlagged] = useState(false);
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const thirtyAgoStr = new Date(Date.now() - 30 * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const [fFrom, setFFrom] = useState(thirtyAgoStr);
  const [fTo, setFTo] = useState(todayStr);

  const punchFiltersActive = !!(fEmployeeId || fDepartment || fPunchType || fFlagged);
  const clearPunchFilters = () => {
    setFEmployeeId(''); setFDepartment(''); setFPunchType(''); setFFlagged(false);
  };

  /* Departments available for the filter (from the employee roster). */
  const punchDepartments = useMemo(() => {
    const map = new Map<string, string>(); // name -> id
    employees.forEach(e => {
      if (e.department?.id && e.department?.name) map.set(e.department.name, e.department.id);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [employees]);


  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const [deviceForm, setDeviceForm] = useState({
    name: '',
    serialNumber: '',
    vendor: 'zkteco',
    model: '',
    firmwareVersion: '',
    branchId: '',
    geofenceId: '',
    encryptionKeyId: '',
  });

  const [enrollForm, setEnrollForm] = useState({
    employeeId: '',
    deviceId: '',
    templateHash: '',
    modality: 'fingerprint',
    qualityScore: '',
  });

  /* ── Fetchers ── */
  const fetchDevices = useCallback(async () => {
    try {
      const r = await fetch(`/api/attendance/biometric/devices?${scopeQuery}` , { headers: getAuthHeaders() });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setDevices(d.devices || []);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load devices');
    }
  }, [scopeQuery]);

  const fetchEnrollments = useCallback(async () => {
    try {
      const r = await fetch(`/api/attendance/biometric/enroll?${scopeQuery}limit=200`, { headers: getAuthHeaders() });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setEnrollments(d.enrollments || []);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load enrollments');
    }
  }, [scopeQuery]);

  const fetchPunches = useCallback(async () => {
    try {
      // Task 83: server-side filters — employee, department, punch type,
      // flagged, date window (full IST business days).
      const params = new URLSearchParams({ limit: '200' });
      if (fEmployeeId) params.set('employeeId', fEmployeeId);
      if (fDepartment) {
        const deptId = punchDepartments.find(([name]) => name === fDepartment)?.[1];
        if (deptId) params.set('departmentId', deptId);
      }
      if (fPunchType) params.set('punchType', fPunchType);
      if (fFlagged) params.set('flagged', 'true');
      if (fFrom) params.set('from', fFrom);
      if (fTo) params.set('to', fTo);
      const r = await fetch(`/api/attendance/biometric/punch-log?${scopeQuery}${params.toString()}`, { headers: getAuthHeaders() });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setPunches(d.punches || []);
      if (d.summary) setPunchesSummary(d.summary);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load punches');
    }
  }, [scopeQuery, fEmployeeId, fDepartment, fPunchType, fFlagged, fFrom, fTo, punchDepartments]);

  const fetchThresholds = useCallback(async () => {
    try {
      const r = await fetch(`/api/attendance/biometric/thresholds?${scopeQuery}` , { headers: getAuthHeaders() });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setThresholds(d.thresholds);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load thresholds');
    }
  }, [scopeQuery]);

  const fetchTeamOfficeSyncStatus = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const r = await fetch('/api/attendance/biometric/sync', { headers: getAuthHeaders(), cache: 'no-store' });
      const d = await r.json();
      if (r.ok) setTeamOfficeSync(d);
    } catch { /* The integration status is optional until configured. */ }
  }, [isAdmin]);

  const fetchAux = useCallback(async () => {
    try {
      const [br, gf, em] = await Promise.all([
        fetch(`/api/branches?${scopeQuery}limit=200`, { headers: getAuthHeaders() }).then((r) => r.json()).catch(() => ({ branches: [] })),
        fetch(`/api/attendance/geofence?${scopeQuery}limit=200`, { headers: getAuthHeaders() }).then((r) => r.json()).catch(() => ({ geofences: [] })),
        fetch(`/api/employees?${scopeQuery}limit=500`, { headers: getAuthHeaders() }).then((r) => r.json()).catch(() => ({ employees: [] })),
      ]);
      setBranches(br.branches || []);
      setGeofences(gf.geofences || []);
      setEmployees(em.employees || []);
    } catch { /* ignore */ }
  }, [scopeQuery]);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchDevices(), fetchEnrollments(), fetchPunches(), fetchThresholds(), fetchAux(), fetchTeamOfficeSyncStatus()]);
    setLoading(false);
  }, [fetchDevices, fetchEnrollments, fetchPunches, fetchThresholds, fetchAux, fetchTeamOfficeSyncStatus]);

  useEffect(() => { queueMicrotask(() => { refreshAll(); }); }, [refreshAll]);

  /* Task 159: self-healing resync — re-matches orphaned punches against the
   * current roster and rewinds the Team Office checkpoint ~7 days so any
   * days the incremental download missed are re-pulled (deduped on insert). */
  const handleTeamOfficeResync = async () => {
    setResyncing(true);
    try {
      const r = await fetch('/api/attendance/biometric/sync', {
        method: 'POST',
        headers: getAuthHeaders(),
        // Task 161: full-window resync — replay the last 90 days (route max)
        // so every missed day is re-pulled, re-matched and the attendance
        // report is rebuilt from ALL punches, not just the last week.
        body: JSON.stringify({ rematch: true, rewindDays: 90 }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Team Office resync failed');
      if (d.skipped) {
        toast.success(`Resync skipped: ${d.skipped}`);
      } else {
        toast.success(`Resync complete: ${d.imported || 0} imported, ${d.rematched || 0} re-matched, ${d.unmatched || 0} still unmatched.`);
      }
      await Promise.all([fetchTeamOfficeSyncStatus(), fetchDevices(), fetchPunches()]);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Team Office resync failed');
      await fetchTeamOfficeSyncStatus();
    } finally {
      setResyncing(false);
    }
  };

  const handleTeamOfficeSync = async () => {
    setSyncingTeamOffice(true);
    try {
      const r = await fetch('/api/attendance/biometric/sync', {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Team Office sync failed');
      if (d.skipped) {
        toast.success(`Sync skipped: ${d.skipped}`);
      } else {
        toast.success(`Team Office sync complete: ${d.imported || 0} new punch(es), ${d.unmatched || 0} unmatched.`);
      }
      await Promise.all([fetchTeamOfficeSyncStatus(), fetchDevices(), fetchPunches()]);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Team Office sync failed');
      await fetchTeamOfficeSyncStatus();
    } finally {
      setSyncingTeamOffice(false);
    }
  };

  // Task 158 — full re-sync: rewind the Team Office cursor to the start of
  // the current month's record table and re-download everything (stored
  // record keys make this idempotent), then recompute attendance for every
  // biometric-punch day of the last 31 days (corrects late/half-day/work
  // hours and replaces auto-present placeholders where real punches exist).
  // (Distinct from Task 161's Resync & Rematch, which replays 90 days.)
  const handleTeamOfficeRecalculate = async () => {
    setSyncingTeamOffice(true);
    try {
      const monthTable = (teamOfficeSync?.lastRecord || '').split('$')[0];
      const rewindToRecord = /^\d{6}$/.test(monthTable) ? `${monthTable}$1` : undefined;
      const r = await fetch('/api/attendance/biometric/sync', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ rewindToRecord, reclassifyDays: 31 }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Team Office re-sync failed');
      if (d.skipped) {
        toast.success(`Re-sync skipped: ${d.skipped}`);
      } else {
        toast.success(`Re-sync complete: ${d.imported || 0} new punch(es) imported, ${d.duplicatesSkipped || 0} duplicate(s) skipped, ${d.lastRecord ? `checkpoint ${d.lastRecord}` : 'checkpoint unchanged'}. Attendance recalculated for the last 31 days.`);
      }
      await Promise.all([fetchTeamOfficeSyncStatus(), fetchDevices(), fetchPunches()]);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Team Office re-sync failed');
      await fetchTeamOfficeSyncStatus();
    } finally {
      setSyncingTeamOffice(false);
    }
  };

  /* ── Device form submit ── */
  const handleDeviceSubmit = async () => {
    if (!deviceForm.name || !deviceForm.serialNumber || !deviceForm.vendor) {
      toast.error('Name, serial number and vendor are required');
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch(`/api/attendance/biometric/devices?${scopeQuery}` , {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(deviceForm),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      toast.success('Device registered — copy the API token now!');
      setNewToken({ device: d.device.name, token: d.apiToken });
      setShowDeviceForm(false);
      setDeviceForm({ name: '', serialNumber: '', vendor: 'zkteco', model: '', firmwareVersion: '', branchId: '', geofenceId: '', encryptionKeyId: '' });
      fetchDevices();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to register device');
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Enrollment submit ── */
  const handleEnrollSubmit = async () => {
    if (!enrollForm.employeeId || !enrollForm.deviceId || !enrollForm.templateHash) {
      toast.error('Employee, device and template hash are required');
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch(`/api/attendance/biometric/enroll?${scopeQuery}` , {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          ...enrollForm,
          qualityScore: enrollForm.qualityScore ? Number(enrollForm.qualityScore) : undefined,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      toast.success('Enrollment saved');
      setShowEnrollForm(false);
      setEnrollForm({ employeeId: '', deviceId: '', templateHash: '', modality: 'fingerprint', qualityScore: '' });
      fetchEnrollments();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to enroll');
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Rotate token ── */
  const handleRotate = async (deviceId: string, deviceName: string) => {
    if (!confirm(`Rotate API token for "${deviceName}"? The old token stops working immediately.`)) return;
    try {
      const r = await fetch(`/api/attendance/biometric/devices/${deviceId}/rotate-token?${scopeQuery}` , {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setNewToken({ device: deviceName, token: d.apiToken });
      toast.success('New token generated — copy it now!');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to rotate token');
    }
  };

  /* ── Toggle active ── */
  const handleToggleActive = async (device: BiometricDevice) => {
    try {
      const r = await fetch(`/api/attendance/biometric/devices/${device.id}?${scopeQuery}` , {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ isActive: !device.isActive }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      toast.success(device.isActive ? 'Device deactivated' : 'Device activated');
      fetchDevices();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to toggle');
    }
  };

  /* ── Revoke enrollment ── */
  const handleRevokeEnrollment = async (enrollment: BiometricEnrollment) => {
    if (!confirm(`Revoke biometric enrollment for ${enrollment.employee.firstName} ${enrollment.employee.lastName} on ${enrollment.device.name}?`)) return;
    try {
      const r = await fetch(`/api/attendance/biometric/enrollments/${enrollment.id}?${scopeQuery}` , {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      toast.success('Enrollment revoked');
      fetchEnrollments();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to revoke');
    }
  };

  /* ── Save thresholds ── */
  const handleSaveThresholds = async () => {
    if (!thresholds) return;
    setSubmitting(true);
    try {
      const r = await fetch(`/api/attendance/biometric/thresholds?${scopeQuery}` , {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify(thresholds),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      toast.success('Thresholds saved');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to save thresholds');
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Helpers ── */
  const vendorLabel: Record<string, string> = {
    zkteco: 'ZKTeco',
    mantra: 'Mantra',
    secugen: 'SecuGen',
    suprema: 'Suprema',
    custom: 'Custom',
  };

  const isOnline = (last: string | null, now: number) => {
    if (!last) return false;
    return now - new Date(last).getTime() < 15 * 60 * 1000;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard?.writeText(text);
    toast.success('Copied to clipboard');
  };

  /* ── Task 83: Day-summary derivation (first In / last Out per employee per
   * IST calendar day). Built from the filtered punch events. ── */
  const punchDays = useMemo<PunchDaySummary[]>(() => {
    const map = new Map<string, PunchDaySummary & { deviceSet: Set<string> }>();
    punches.forEach(p => {
      if (!p.employee) return; // unmatched punches have no day summary row
      const dateKey = new Date(p.punchTime).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      const key = `${p.employee.id}|${dateKey}`;
      let row = map.get(key);
      if (!row) {
        row = {
          employeeId: p.employee.id,
          employeeName: `${p.employee.firstName} ${p.employee.lastName}`.trim(),
          employeeCode: p.employee.employeeId,
          department: p.employee.department?.name || '—',
          dateKey,
          firstIn: null, lastOut: null, firstBreakIn: null, lastBreakOut: null,
          punchCount: 0, flaggedCount: 0,
          devices: [],
          deviceSet: new Set<string>(),
        };
        map.set(key, row);
      }
      row.punchCount++;
      if (p.flagged) row.flaggedCount++;
      if (p.device?.name && !row.deviceSet.has(p.device.name)) { row.deviceSet.add(p.device.name); row.devices.push(p.device.name); }
      if (p.punchType === 'check_in' && (!row.firstIn || new Date(p.punchTime) < new Date(row.firstIn))) row.firstIn = p.punchTime;
      if (p.punchType === 'check_out' && (!row.lastOut || new Date(p.punchTime) > new Date(row.lastOut))) row.lastOut = p.punchTime;
      if (p.punchType === 'break_in' && (!row.firstBreakIn || new Date(p.punchTime) < new Date(row.firstBreakIn))) row.firstBreakIn = p.punchTime;
      if (p.punchType === 'break_out' && (!row.lastBreakOut || new Date(p.punchTime) > new Date(row.lastBreakOut))) row.lastBreakOut = p.punchTime;
    });
    return Array.from(map.values())
      .map(({ deviceSet: _ds, ...rest }) => rest)
      .sort((a, b) => b.dateKey.localeCompare(a.dateKey) || a.employeeName.localeCompare(b.employeeName));
  }, [punches]);

  const fmtDayTime = (iso: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  };
  const fmtDayDate = (dateKey: string) => {
    const d = new Date(`${dateKey}T00:00:00Z`);
    if (isNaN(d.getTime())) return dateKey;
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
  };

  /* ── Render ── */
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-thb-text-primary flex items-center gap-2">
            <FiCpu className="w-6 h-6 text-teal-500" />
            Biometric Devices
          </h1>
          <p className="text-thb-text-secondary mt-1">
            Register biometric terminals, enroll employees, review AI-flagged punches
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refreshAll}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-thb-border text-thb-text-secondary hover:bg-slate-50 text-sm"
          >
            <FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          {isAdmin && tab === 'devices' && (
            <button
              onClick={() => setShowDeviceForm(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 text-white hover:bg-teal-700 text-sm font-medium shadow-sm shadow-teal-500/25"
            >
              <FiPlus className="w-4 h-4" />
              Register Device
            </button>
          )}
          {isAdmin && tab === 'enrollments' && (
            <button
              onClick={() => setShowEnrollForm(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 text-white hover:bg-teal-700 text-sm font-medium shadow-sm shadow-teal-500/25"
            >
              <FiPlus className="w-4 h-4" />
              Enroll Employee
            </button>
          )}
        </div>
      </div>

      <ModuleTips
        moduleKey="attendance_biometric"
        title="Biometric Integration Tips"
        tips={biometricTips}
        userRole={user?.role}
      />

      <ModuleWorkflow
        moduleKey="attendance_biometric"
        title="Biometric Punch Flow"
        subtitle="From device registration to AI-flagged punch review"
        steps={biometricWorkflowSteps}
        accentColor="violet"
        userRole={user?.role}
      />

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-thb-border overflow-x-auto">
        {([
          { key: 'devices', label: 'Devices', icon: FiCpu, count: devices.length },
          { key: 'enrollments', label: 'Enrollments', icon: FiUserCheck, count: enrollments.length },
          { key: 'punches', label: 'Punches', icon: FiActivity, count: punches.length },
          ...(isAdmin ? [{ key: 'thresholds' as const, label: 'AI Thresholds', icon: FiShield, count: undefined as number | undefined }] : []),
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              tab === t.key
                ? 'border-teal-500 text-teal-600'
                : 'border-transparent text-thb-text-secondary hover:text-thb-text-primary'
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
            {typeof t.count === 'number' && (
              <span className={`px-1.5 py-0.5 rounded text-xs ${tab === t.key ? 'bg-teal-100 text-teal-700' : 'bg-slate-100 text-slate-600'}`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Devices Tab */}
      {tab === 'devices' && (
        <div className="space-y-4">
          {isAdmin && (
            <div className="thb-card p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h2 className="font-semibold text-thb-text-primary">Team Office face attendance</h2>
                <p className="text-sm text-thb-text-secondary mt-1">
                  {teamOfficeSync?.configured ? 'API credentials are configured.' : 'API credentials are missing in this deployment.'}
                  {teamOfficeSync?.status?.lastSyncAt ? ` Last sync: ${new Date(teamOfficeSync.status.lastSyncAt).toLocaleString()}.` : ''}
                  {teamOfficeSync?.status?.state === 'error' ? ` Last error: ${teamOfficeSync.status.message || 'Sync failed.'}` : ''}
                </p>
                {/* Task 158 — device staleness: the sync job can be green while
                    the terminal itself stopped uploading; surface the age of
                    the newest punch actually received. */}
                {teamOfficeSync?.lastPunchAt ? (
                  <p className={`text-xs mt-1 ${(teamOfficeSync.lastPunchAgeDays || 0) >= 2 ? 'text-amber-700 font-medium' : 'text-thb-text-secondary'}`}>
                    Newest punch received: {new Date(teamOfficeSync.lastPunchAt).toLocaleString()}
                    ({teamOfficeSync.lastPunchAgeDays === 1 ? '1 day ago' : `${teamOfficeSync.lastPunchAgeDays || 0} days ago`}).
                    {(teamOfficeSync.lastPunchAgeDays || 0) >= 2 ? ' If employees are still punching, the terminal may be offline from the cloud — check the device network.' : ''}
                  </p>
                ) : null}
                {teamOfficeSync?.status?.unmatched ? (
                  <p className="text-xs text-amber-700 mt-1">{teamOfficeSync.status.unmatched} punch(es) need an HRMS employee-code match.</p>
                ) : null}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={handleTeamOfficeSync}
                  disabled={resyncing || syncingTeamOffice || !teamOfficeSync?.configured}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 text-sm font-medium"
                >
                  <FiRefreshCw className={`w-4 h-4 ${syncingTeamOffice ? 'animate-spin' : ''}`} />
                  {syncingTeamOffice ? 'Syncing…' : 'Sync from Team Office'}
                </button>
                <button
                  onClick={handleTeamOfficeResync}
                  disabled={resyncing || syncingTeamOffice || !teamOfficeSync?.configured}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-teal-600 text-teal-700 hover:bg-teal-50 disabled:opacity-50 text-sm font-medium transition-colors"
                  title="Re-match orphaned punches and re-pull the last 7 days from Team Office"
                >
                  <FiRefreshCw className={`w-4 h-4 ${resyncing ? 'animate-spin' : ''}`} />
                  {resyncing ? 'Resyncing…' : 'Resync & Rematch'}
                </button>
                <button
                  onClick={handleTeamOfficeRecalculate}
                  disabled={resyncing || syncingTeamOffice || !teamOfficeSync?.configured}
                  title="Re-download the whole month from Team Office (idempotent) and recompute attendance from all stored punches"
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-teal-600 text-teal-700 hover:bg-teal-50 disabled:opacity-50 text-sm font-medium transition-colors"
                >
                  <FiRefreshCw className={`w-4 h-4 ${syncingTeamOffice ? 'animate-spin' : ''}`} />
                  {syncingTeamOffice ? 'Recalculating…' : 'Re-sync & recalculate'}
                </button>
              </div>
            </div>
          )}
          {devices.length === 0 && !loading ? (
            <div className="thb-card p-12 text-center">
              <FiCpu className="w-10 h-10 text-thb-text-muted mx-auto mb-3" />
              <p className="text-thb-text-secondary font-medium">No biometric devices registered</p>
              <p className="text-sm text-thb-text-muted mt-1">
                {isAdmin ? 'Click "Register Device" to add your first terminal.' : 'Ask an admin to register a device.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {devices.map((device) => {
                const online = isOnline(device.lastHeartbeatAt, nowTick);
                return (
                  <div key={device.id} className="thb-card p-5 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-thb-text-primary">{device.name}</h3>
                          <span className={`w-2 h-2 rounded-full ${online ? 'bg-emerald-500' : 'bg-slate-300'}`} title={online ? 'Online' : 'Offline'} />
                        </div>
                        <p className="text-xs text-thb-text-muted mt-0.5">
                          {vendorLabel[device.vendor] || device.vendor}
                          {device.model ? ` · ${device.model}` : ''}
                        </p>
                      </div>
                      <span className={`thb-badge ${device.isActive ? 'thb-badge-success' : 'bg-slate-100 text-slate-500'}`}>
                        {device.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>

                    <div className="space-y-1.5 text-sm">
                      <div className="flex justify-between">
                        <span className="text-thb-text-muted">Serial</span>
                        <span className="font-mono text-xs text-thb-text-primary">{device.serialNumber}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-thb-text-muted">Branch</span>
                        <span className="text-thb-text-primary">{device.branch?.name || '—'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-thb-text-muted">Geofence</span>
                        <span className="text-thb-text-primary">{device.geofence?.name || '—'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-thb-text-muted">Last heartbeat</span>
                        <span className="text-thb-text-primary text-xs">
                          {device.lastHeartbeatAt ? new Date(device.lastHeartbeatAt).toLocaleString() : 'Never'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-thb-text-muted">Enrollments</span>
                        <span className="text-thb-text-primary">{device._count?.enrollments ?? 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-thb-text-muted">Total punches</span>
                        <span className="text-thb-text-primary">{device._count?.punches ?? 0}</span>
                      </div>
                    </div>

                    {isAdmin && (
                      <div className="flex items-center gap-2 pt-2 border-t border-thb-border">
                        <button
                          onClick={() => handleRotate(device.id, device.name)}
                          className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-thb-border text-thb-text-secondary hover:bg-slate-50"
                        >
                          <FiKey className="w-3 h-3" />
                          Rotate token
                        </button>
                        <button
                          onClick={() => handleToggleActive(device)}
                          className={`flex items-center gap-1 px-2 py-1 text-xs rounded border border-thb-border ${
                            device.isActive ? 'text-red-600 hover:bg-red-50' : 'text-emerald-600 hover:bg-emerald-50'
                          }`}
                        >
                          {device.isActive ? <FiXCircle className="w-3 h-3" /> : <FiCheckCircle className="w-3 h-3" />}
                          {device.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Enrollments Tab */}
      {tab === 'enrollments' && (
        <div className="thb-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-thb-border bg-slate-50/50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Employee</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Device</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Modality</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Quality</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Template Hash</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Enrolled</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Status</th>
                  {isAdmin && <th className="text-right px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {enrollments.length === 0 ? (
                  <tr>
                    <td colSpan={isAdmin ? 8 : 7} className="px-4 py-12 text-center text-thb-text-muted">
                      No enrollments yet. {isAdmin && 'Click "Enroll Employee" to add the first one.'}
                    </td>
                  </tr>
                ) : (
                  enrollments.map((e) => (
                    <tr key={e.id} className="border-b border-thb-border/50 hover:bg-slate-50/50">
                      <td className="px-4 py-3 text-sm">
                        <div className="font-medium text-thb-text-primary">{e.employee.firstName} {e.employee.lastName}</div>
                        <div className="text-xs text-thb-text-muted">{e.employee.employeeId} · {e.employee.email}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-thb-text-secondary">
                        <div>{e.device.name}</div>
                        <div className="text-xs text-thb-text-muted">{e.device.serialNumber}</div>
                      </td>
                      <td className="px-4 py-3 text-sm capitalize text-thb-text-secondary">{e.modality}</td>
                      <td className="px-4 py-3 text-sm text-thb-text-secondary">
                        {e.qualityScore != null ? `${e.qualityScore.toFixed(0)}%` : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-thb-text-muted">
                        {e.templateHash.substring(0, 12)}…
                      </td>
                      <td className="px-4 py-3 text-xs text-thb-text-secondary">
                        {new Date(e.enrolledAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`thb-badge ${e.isActive ? 'thb-badge-success' : 'bg-slate-100 text-slate-500'}`}>
                          {e.isActive ? 'Active' : 'Revoked'}
                        </span>
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3 text-right">
                          {e.isActive && (
                            <button
                              onClick={() => handleRevokeEnrollment(e)}
                              className="text-red-600 hover:bg-red-50 p-1.5 rounded"
                              title="Revoke enrollment"
                            >
                              <FiTrash2 className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Punches Tab */}
      {tab === 'punches' && (
        <div className="space-y-4">
          {/* Task 83: filter bar — employee, department, type, date range, flagged */}
          <div className="thb-card p-4 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <FiUserCheck className="w-4 h-4 text-thb-text-muted" />
              <select
                value={fEmployeeId}
                onChange={(e) => setFEmployeeId(e.target.value)}
                className="px-2.5 py-1.5 border border-thb-border rounded-lg text-sm bg-white max-w-[190px]"
              >
                <option value="">All Employees</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>{e.firstName} {e.lastName} ({e.employeeId})</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <FiShield className="w-4 h-4 text-thb-text-muted" />
              <select
                value={fDepartment}
                onChange={(e) => setFDepartment(e.target.value)}
                className="px-2.5 py-1.5 border border-thb-border rounded-lg text-sm bg-white max-w-[170px]"
              >
                <option value="">All Departments</option>
                {punchDepartments.map(([name]) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <FiActivity className="w-4 h-4 text-thb-text-muted" />
              <select
                value={fPunchType}
                onChange={(e) => setFPunchType(e.target.value)}
                className="px-2.5 py-1.5 border border-thb-border rounded-lg text-sm bg-white"
              >
                <option value="">All Types</option>
                <option value="check_in">In</option>
                <option value="check_out">Out</option>
                <option value="break_in">Break In</option>
                <option value="break_out">Break Out</option>
                <option value="duplicate">Duplicate</option>
                <option value="unmatched">Unmatched</option>
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <FiCalendar className="w-4 h-4 text-thb-text-muted" />
              <label className="text-xs font-medium text-thb-text-secondary">From</label>
              <input type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} className="px-2 py-1.5 border border-thb-border rounded-lg text-sm bg-white" />
              <label className="text-xs font-medium text-thb-text-secondary ml-1">To</label>
              <input type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} className="px-2 py-1.5 border border-thb-border rounded-lg text-sm bg-white" />
            </div>
            <label className="inline-flex items-center gap-1.5 text-xs font-medium text-thb-text-secondary">
              <input type="checkbox" checked={fFlagged} onChange={(e) => setFFlagged(e.target.checked)} />
              Flagged only
            </label>
            {punchFiltersActive && (
              <button onClick={clearPunchFilters} className="text-xs font-medium text-cyan-600 hover:text-cyan-700 underline">
                Clear filters
              </button>
            )}
            <div className="ml-auto flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              <button onClick={() => setPunchView('summary')} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${punchView === 'summary' ? 'bg-white text-thb-text-primary shadow-sm' : 'text-thb-text-secondary hover:text-thb-text-primary'}`}>
                <FiClock className="w-3.5 h-3.5 inline mr-1" />In / Out Summary
              </button>
              <button onClick={() => setPunchView('events')} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${punchView === 'events' ? 'bg-white text-thb-text-primary shadow-sm' : 'text-thb-text-secondary hover:text-thb-text-primary'}`}>
                <FiList className="w-3.5 h-3.5 inline mr-1" />All Punch Events
              </button>
            </div>
          </div>

          {punchesSummary && (
            <div className="grid grid-cols-3 gap-4">
              <div className="thb-card p-4">
                <p className="text-xs font-medium text-thb-text-muted">Today&apos;s punches</p>
                <p className="text-2xl font-bold text-thb-text-primary mt-1">{punchesSummary.todayTotal}</p>
              </div>
              <div className="thb-card p-4">
                <p className="text-xs font-medium text-thb-text-muted">Today&apos;s flagged</p>
                <p className="text-2xl font-bold text-amber-600 mt-1">{punchesSummary.todayFlagged}</p>
              </div>
              <div className="thb-card p-4">
                <p className="text-xs font-medium text-thb-text-muted">Flagged (last 7 days)</p>
                <p className="text-2xl font-bold text-red-600 mt-1">{punchesSummary.last7Flagged}</p>
              </div>
            </div>
          )}

          {/* ── Day summary view: first In / last Out per employee per day ── */}
          {punchView === 'summary' ? (
            <div className="thb-card overflow-hidden">
              <div className="px-4 py-3 border-b border-thb-border">
                <h3 className="text-sm font-semibold text-thb-text-primary">In / Out Summary ({punchDays.length} employee-days)</h3>
                <p className="text-xs text-thb-text-muted mt-0.5">First In and last Out per employee per day, from biometric punches (IST dates).</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-thb-border bg-slate-50/50">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Employee</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Date</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">In Time</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Out Time</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Break In</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Break Out</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Punches</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Device</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Flags</th>
                    </tr>
                  </thead>
                  <tbody>
                    {punchDays.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-12 text-center text-thb-text-muted">
                          No biometric punches in the selected filters. Adjust the employee / department / type / date filters above.
                        </td>
                      </tr>
                    ) : (
                      punchDays.map((d) => (
                        <tr key={d.employeeId + d.dateKey} className="border-b border-thb-border/50 hover:bg-slate-50/60">
                          <td className="px-4 py-3 text-sm">
                            <div className="font-medium text-thb-text-primary">{d.employeeName}</div>
                            <div className="text-xs text-thb-text-muted">{d.employeeCode} · {d.department}</div>
                          </td>
                          <td className="px-4 py-3 text-sm text-thb-text-secondary whitespace-nowrap">{fmtDayDate(d.dateKey)}</td>
                          <td className="px-4 py-3 text-sm font-medium text-emerald-700 whitespace-nowrap">{fmtDayTime(d.firstIn)}</td>
                          <td className="px-4 py-3 text-sm font-medium text-red-700 whitespace-nowrap">{fmtDayTime(d.lastOut)}</td>
                          <td className="px-4 py-3 text-sm text-amber-700 whitespace-nowrap">{fmtDayTime(d.firstBreakIn)}</td>
                          <td className="px-4 py-3 text-sm text-teal-700 whitespace-nowrap">{fmtDayTime(d.lastBreakOut)}</td>
                          <td className="px-4 py-3 text-sm text-center text-thb-text-secondary">{d.punchCount}</td>
                          <td className="px-4 py-3 text-xs text-thb-text-muted">{d.devices.join(', ') || '—'}</td>
                          <td className="px-4 py-3 text-center">
                            {d.flaggedCount > 0 ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[11px] font-medium">
                                <FiAlertTriangle className="w-3 h-3" /> {d.flaggedCount}
                              </span>
                            ) : (
                              <FiCheckCircle className="w-4 h-4 text-emerald-500 inline" />
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="thb-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-thb-border bg-slate-50/50">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Time</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Employee</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Device</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Type</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Spoofing</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Buddy</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Flag reasons</th>
                    </tr>
                  </thead>
                  <tbody>
                    {punches.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-12 text-center text-thb-text-muted">
                          No biometric punches in the selected filters. Once devices start pushing, you&apos;ll see them here.
                        </td>
                      </tr>
                    ) : (
                      punches.map((p) => (
                        <tr key={p.id} className={`border-b border-thb-border/50 ${p.flagged ? 'bg-amber-50/40' : ''}`}>
                          <td className="px-4 py-3 text-sm text-thb-text-secondary">
                            {new Date(p.punchTime).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {p.employee ? (
                              <>
                                <div className="font-medium text-thb-text-primary">{p.employee.firstName} {p.employee.lastName}</div>
                                <div className="text-xs text-thb-text-muted">{p.employee.employeeId}{p.employee.department?.name ? ` · ${p.employee.department.name}` : ''}</div>
                              </>
                            ) : <span className="text-thb-text-muted">Unmatched</span>}
                          </td>
                          <td className="px-4 py-3 text-sm text-thb-text-secondary">
                            <div>{p.device.name}</div>
                            <div className="text-xs text-thb-text-muted">{p.device.vendor}{p.device.branch?.name ? ` · ${p.device.branch.name}` : ''}</div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`thb-badge ${p.punchType === 'check_in' ? 'bg-emerald-50 text-emerald-700' : p.punchType === 'check_out' ? 'bg-red-50 text-red-700' : 'bg-slate-50 text-slate-700'}`}>
                              {p.punchType === 'check_in' ? 'In'
                                : p.punchType === 'check_out' ? 'Out'
                                  : p.punchType === 'break_in' ? 'Break In'
                                    : p.punchType === 'break_out' ? 'Break Out'
                                      : p.punchType === 'duplicate' ? 'Duplicate'
                                        : p.punchType === 'unmatched' ? 'Unmatched' : 'Punch'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <RiskBadge value={p.spoofingRisk} />
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <RiskBadge value={p.buddyPunchRisk} />
                          </td>
                          <td className="px-4 py-3 text-xs">
                            {p.flagged ? (
                              <div className="flex flex-wrap gap-1">
                                <FiAlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                                {(p.flagReasons || []).map((r) => (
                                  <span key={r} className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px]">{r}</span>
                                ))}
                              </div>
                            ) : (
                              <FiCheckCircle className="w-4 h-4 text-emerald-500" />
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Thresholds Tab */}
      {tab === 'thresholds' && isAdmin && thresholds && (
        <div className="thb-card p-6 max-w-2xl space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-thb-text-primary">AI Risk Thresholds</h3>
            <p className="text-xs text-thb-text-muted mt-1">
              Punches with risk scores above these thresholds are flagged for review. Flagged punches still create an Attendance record (for audit) but are marked &quot;flagged&quot; until a manager reviews them.
            </p>
          </div>

          <ThresholdSlider
            label="Spoofing risk threshold"
            description="Punches with spoofingRisk > this value are flagged. Liveness-failed biometrics score high here."
            value={thresholds.spoofingRiskThreshold}
            onChange={(v) => setThresholds({ ...thresholds, spoofingRiskThreshold: v })}
          />
          <ThresholdSlider
            label="Buddy-punch risk threshold"
            description="Punches with buddyPunchRisk > this value are flagged. Impossible-travel and branch-mismatch trigger this."
            value={thresholds.buddyPunchRiskThreshold}
            onChange={(v) => setThresholds({ ...thresholds, buddyPunchRiskThreshold: v })}
          />

          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-thb-border">
            <div>
              <label className="text-xs font-medium text-thb-text-secondary">Impossible-travel distance (km)</label>
              <input
                type="number"
                step="1"
                value={thresholds.impossibleTravelKm}
                onChange={(e) => setThresholds({ ...thresholds, impossibleTravelKm: Number(e.target.value) })}
                className="mt-1 w-full px-3 py-2 rounded border border-thb-border text-sm"
              />
              <p className="text-[10px] text-thb-text-muted mt-1">If the same employee punches from two devices &gt;X km apart within the window below, buddy risk = 1.0</p>
            </div>
            <div>
              <label className="text-xs font-medium text-thb-text-secondary">Impossible-travel window (min)</label>
              <input
                type="number"
                step="1"
                value={thresholds.impossibleTravelMinutes}
                onChange={(e) => setThresholds({ ...thresholds, impossibleTravelMinutes: Number(e.target.value) })}
                className="mt-1 w-full px-3 py-2 rounded border border-thb-border text-sm"
              />
              <p className="text-[10px] text-thb-text-muted mt-1">Time window for the impossible-travel check</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-thb-text-secondary">Off-hours start (min from midnight)</label>
              <input
                type="number"
                step="15"
                min="0"
                max="1440"
                value={thresholds.offHoursStartMinutes}
                onChange={(e) => setThresholds({ ...thresholds, offHoursStartMinutes: Number(e.target.value) })}
                className="mt-1 w-full px-3 py-2 rounded border border-thb-border text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-thb-text-secondary">Off-hours end (min from midnight)</label>
              <input
                type="number"
                step="15"
                min="0"
                max="1440"
                value={thresholds.offHoursEndMinutes}
                onChange={(e) => setThresholds({ ...thresholds, offHoursEndMinutes: Number(e.target.value) })}
                className="mt-1 w-full px-3 py-2 rounded border border-thb-border text-sm"
              />
              <p className="text-[10px] text-thb-text-muted mt-1">Set both to 0 to disable off-hours flagging</p>
            </div>
          </div>

          <button
            onClick={handleSaveThresholds}
            disabled={submitting}
            className="px-4 py-2 rounded bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 disabled:opacity-50"
          >
            {submitting ? 'Saving…' : 'Save thresholds'}
          </button>
        </div>
      )}

      {/* Register Device Modal */}
      {showDeviceForm && (
        <Modal title="Register Biometric Device" onClose={() => setShowDeviceForm(false)}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Name *" value={deviceForm.name} onChange={(v) => setDeviceForm({ ...deviceForm, name: v })} placeholder="Office-1 Main Door" />
              <Field label="Serial number *" value={deviceForm.serialNumber} onChange={(v) => setDeviceForm({ ...deviceForm, serialNumber: v })} placeholder="ZK-2024-001" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-thb-text-secondary">Vendor <span className="text-red-500 font-bold">*</span></label>
                <select
                  value={deviceForm.vendor}
                  onChange={(e) => setDeviceForm({ ...deviceForm, vendor: e.target.value })}
                  className="mt-1 w-full px-3 py-2 rounded border border-thb-border text-sm"
                >
                  <option value="zkteco">ZKTeco</option>
                  <option value="mantra">Mantra</option>
                  <option value="secugen">SecuGen</option>
                  <option value="suprema">Suprema</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <Field label="Model" value={deviceForm.model} onChange={(v) => setDeviceForm({ ...deviceForm, model: v })} placeholder="SpeedFace V5L" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Firmware version" value={deviceForm.firmwareVersion} onChange={(v) => setDeviceForm({ ...deviceForm, firmwareVersion: v })} placeholder="v3.2.1" />
              <Field label="Encryption key ID" value={deviceForm.encryptionKeyId} onChange={(v) => setDeviceForm({ ...deviceForm, encryptionKeyId: v })} placeholder="aes-key-fingerprint" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-thb-text-secondary">Branch</label>
                <select
                  value={deviceForm.branchId}
                  onChange={(e) => setDeviceForm({ ...deviceForm, branchId: e.target.value })}
                  className="mt-1 w-full px-3 py-2 rounded border border-thb-border text-sm"
                >
                  <option value="">—</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-thb-text-secondary">Geofence (optional cross-check)</label>
                <select
                  value={deviceForm.geofenceId}
                  onChange={(e) => setDeviceForm({ ...deviceForm, geofenceId: e.target.value })}
                  className="mt-1 w-full px-3 py-2 rounded border border-thb-border text-sm"
                >
                  <option value="">—</option>
                  {geofences.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
            </div>
            <div className="text-xs bg-teal-50 border border-teal-100 rounded p-3 text-teal-900">
              <strong>REQ-SEC-ATT-02:</strong> Device-to-server traffic MUST use TLS 1.3. The API token is shown ONCE after registration — save it to the device config immediately.
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowDeviceForm(false)} className="px-3 py-2 text-sm rounded border border-thb-border">Cancel</button>
              <button
                onClick={handleDeviceSubmit}
                disabled={submitting}
                className="px-4 py-2 text-sm rounded bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
              >
                {submitting ? 'Registering…' : 'Register & generate token'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Enroll Employee Modal */}
      {showEnrollForm && (
        <Modal title="Enroll Employee Biometric" onClose={() => setShowEnrollForm(false)}>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-thb-text-secondary">Employee <span className="text-red-500 font-bold">*</span></label>
              <select
                value={enrollForm.employeeId}
                onChange={(e) => setEnrollForm({ ...enrollForm, employeeId: e.target.value })}
                className="mt-1 w-full px-3 py-2 rounded border border-thb-border text-sm"
              >
                <option value="">Select employee…</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>{e.firstName} {e.lastName} · {e.employeeId}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-thb-text-secondary">Device <span className="text-red-500 font-bold">*</span></label>
              <select
                value={enrollForm.deviceId}
                onChange={(e) => setEnrollForm({ ...enrollForm, deviceId: e.target.value })}
                className="mt-1 w-full px-3 py-2 rounded border border-thb-border text-sm"
              >
                <option value="">Select device…</option>
                {devices.filter((d) => d.isActive).map((d) => (
                  <option key={d.id} value={d.id}>{d.name} · {d.serialNumber}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-thb-text-secondary">Modality <span className="text-red-500 font-bold">*</span></label>
                <select
                  value={enrollForm.modality}
                  onChange={(e) => setEnrollForm({ ...enrollForm, modality: e.target.value })}
                  className="mt-1 w-full px-3 py-2 rounded border border-thb-border text-sm"
                >
                  <option value="fingerprint">Fingerprint</option>
                  <option value="face">Face</option>
                  <option value="palm">Palm</option>
                  <option value="iris">Iris</option>
                </select>
              </div>
              <Field
                label="Quality score (0-100)"
                value={enrollForm.qualityScore}
                onChange={(v) => setEnrollForm({ ...enrollForm, qualityScore: v })}
                placeholder="92"
                type="number"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-thb-text-secondary">Template hash (SHA-256 of encrypted template) <span className="text-red-500 font-bold">*</span></label>
              <textarea
                value={enrollForm.templateHash}
                onChange={(e) => setEnrollForm({ ...enrollForm, templateHash: e.target.value })}
                rows={3}
                placeholder="e.g. a3f5... (64 hex chars)"
                className="mt-1 w-full px-3 py-2 rounded border border-thb-border text-sm font-mono"
              />
              <p className="text-[10px] text-thb-text-muted mt-1">
                Hash only — never paste the raw biometric template. The device should compute the hash locally and push only the hash.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowEnrollForm(false)} className="px-3 py-2 text-sm rounded border border-thb-border">Cancel</button>
              <button
                onClick={handleEnrollSubmit}
                disabled={submitting}
                className="px-4 py-2 text-sm rounded bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
              >
                {submitting ? 'Saving…' : 'Save enrollment'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* New Token Modal */}
      {newToken && (
        <Modal title="API Token Generated" onClose={() => setNewToken(null)}>
          <div className="space-y-3">
            <div className="bg-amber-50 border border-amber-200 rounded p-3 text-amber-900 text-sm flex gap-2">
              <FiAlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                <strong>Save this token now.</strong> It will not be shown again. Configure it on the device&apos;s HTTP push settings immediately.
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-thb-text-secondary">Device</label>
              <p className="text-sm font-medium text-thb-text-primary mt-0.5">{newToken.device}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-thb-text-secondary">API token (X-Biometric-Token header)</label>
              <div className="flex items-center gap-2 mt-1">
                <input
                  readOnly
                  value={newToken.token}
                  className="flex-1 px-3 py-2 rounded border border-thb-border text-xs font-mono bg-slate-50"
                />
                <button
                  onClick={() => copyToClipboard(newToken.token)}
                  className="p-2 rounded border border-thb-border hover:bg-slate-50"
                  title="Copy"
                >
                  <FiCopy className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="text-xs text-thb-text-muted bg-slate-50 rounded p-3">
              <strong>Webhook URL:</strong> <code className="font-mono">POST /api/attendance/biometric/punch</code><br />
              <strong>Heartbeat URL:</strong> <code className="font-mono">POST /api/attendance/biometric/heartbeat</code><br />
              <strong>Required headers:</strong> <code className="font-mono">X-Biometric-Token: &lt;token&gt;</code>
            </div>
            <div className="flex justify-end pt-2">
              <button
                onClick={() => setNewToken(null)}
                className="px-4 py-2 text-sm rounded bg-teal-600 text-white hover:bg-teal-700"
              >
                I&apos;ve saved it — close
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ── Small subcomponents ── */
function RiskBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const cls = value > 0.6 ? 'bg-red-100 text-red-700' : value > 0.3 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700';
  return <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${cls}`}>{pct}%</span>;
}

function Field({ label, value, onChange, placeholder, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-thb-text-secondary">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full px-3 py-2 rounded border border-thb-border text-sm"
      />
    </div>
  );
}

function ThresholdSlider({ label, description, value, onChange }: {
  label: string; description: string; value: number; onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-thb-text-primary">{label}</label>
        <span className="text-sm font-bold text-teal-600">{Math.round(value * 100)}%</span>
      </div>
      <p className="text-xs text-thb-text-muted mt-0.5">{description}</p>
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full mt-2 accent-teal-600"
      />
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-thb-border px-5 py-3 flex items-center justify-between rounded-t-xl z-10">
          <h2 className="text-sm font-semibold text-thb-text-primary">{title}</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded">
            <FiX className="w-4 h-4 text-thb-text-muted" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
