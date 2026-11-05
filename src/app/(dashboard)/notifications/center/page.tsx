'use client';

/**
 * Notification Center — module-wise admin console (Task 36)
 *
 * Configure every notification event across all modules: channel toggles,
 * custom templates with {{placeholders}}, actionable approvals, the 48h
 * escalation matrix, Slack/Teams integrations and the delivery log.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FiBell, FiMail, FiMessageSquare, FiSmartphone, FiSlack, FiMonitor,
  FiEdit2, FiRefreshCw, FiPlus, FiTrash2, FiSend, FiFilter, FiZap, FiUsers,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ModuleTips from '@/components/ModuleTips';

/* ── Types ── */
interface EventRow {
  eventKey: string; name: string; description: string; recipients: string;
  placeholders: string[]; escalatable: boolean; overrideId: string | null;
  enabled: boolean; channels: string[]; actionable: boolean; expiresHours: number;
  subject: string; bodyEmail: string; bodySms: string; bodySlack: string; isOverridden: boolean;
}
interface ModuleRow {
  module: string; label: string; description: string; color: string;
  preference: { escalationEnabled: boolean; escalationHours: number; escalateToRole: string | null } | null;
  events: EventRow[];
}
interface Webhook { id: string; type: string; name: string; webhookUrl: string; enabled: boolean; defaultModule: string | null }
interface Delivery { id: string; module: string; eventKey: string; channel: string; recipientName: string | null; recipientAddress: string | null; subject: string | null; status: string; error: string | null; actionable: boolean; actionResult: string | null; createdAt: string }

const CHANNEL_META: Record<string, { label: string; icon: React.ReactNode }> = {
  in_app: { label: 'In-App', icon: <FiBell className="w-3.5 h-3.5" /> },
  email: { label: 'Email', icon: <FiMail className="w-3.5 h-3.5" /> },
  sms: { label: 'SMS', icon: <FiSmartphone className="w-3.5 h-3.5" /> },
  slack: { label: 'Slack', icon: <FiSlack className="w-3.5 h-3.5" /> },
  teams: { label: 'Teams', icon: <FiMonitor className="w-3.5 h-3.5" /> },
};
const ALL_CHANNEL_KEYS = Object.keys(CHANNEL_META);

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

const centerTips = [
  { title: 'Module-wise Catalog', description: 'Every notification across 9 modules is listed with its channels and recipients — toggle, edit, or reset to default.' },
  { title: 'Custom Placeholders', description: 'Templates support {{placeholders}} like {{Employee_Name}} and {{Effective_Date}}. Click a chip while editing to copy it.' },
  { title: 'Actionable Approvals', description: 'Approval events show Approve/Reject buttons in email, Slack and Teams — recipients act without opening the HRMS.' },
  { title: 'Escalation Matrix', description: 'Pending approvals escalate to the next level after the configured hours (default 48h) via the nightly escalation sweep.' },
];

export default function NotificationCenterPage() {
  const [tab, setTab] = useState<'overview' | 'templates' | 'integrations' | 'log'>('overview');
  const [summary, setSummary] = useState<any>(null);
  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [activeModule, setActiveModule] = useState<string>('all');
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [logFilters, setLogFilters] = useState({ module: 'all', channel: 'all', status: 'all' });
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EventRow | null>(null);
  const [editingModule, setEditingModule] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [showAddHook, setShowAddHook] = useState(false);
  const [newHook, setNewHook] = useState({ type: 'slack', name: '', webhookUrl: '' });

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [s, t, w, l] = await Promise.all([
        fetch('/api/notifications/summary', { headers: getAuthHeaders() }).then((r) => r.json()).catch(() => null),
        fetch('/api/notifications/templates', { headers: getAuthHeaders() }).then((r) => r.json()).catch(() => null),
        fetch('/api/notifications/webhooks', { headers: getAuthHeaders() }).then((r) => r.json()).catch(() => null),
        fetch('/api/notifications/log?limit=25', { headers: getAuthHeaders() }).then((r) => r.json()).catch(() => null),
      ]);
      setSummary(s);
      setModules(t?.modules || []);
      setWebhooks(w?.webhooks || []);
      setDeliveries(l?.deliveries || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const reloadLog = async (filters = logFilters) => {
    const qs = new URLSearchParams();
    if (filters.module !== 'all') qs.set('module', filters.module);
    if (filters.channel !== 'all') qs.set('channel', filters.channel);
    if (filters.status !== 'all') qs.set('status', filters.status);
    qs.set('limit', '25');
    const res = await fetch(`/api/notifications/log?${qs.toString()}`, { headers: getAuthHeaders() }).then((r) => r.json()).catch(() => null);
    setDeliveries(res?.deliveries || []);
  };

  const visibleModules = useMemo(
    () => (activeModule === 'all' ? modules : modules.filter((m) => m.module === activeModule)),
    [modules, activeModule],
  );

  const saveTemplate = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const res = await fetch('/api/notifications/templates', {
        method: 'PUT', headers: getAuthHeaders(),
        body: JSON.stringify({
          module: editingModule, eventKey: editing.eventKey,
          enabled: editing.enabled, channels: editing.channels, actionable: editing.actionable,
          expiresHours: editing.expiresHours, subject: editing.subject,
          bodyEmail: editing.bodyEmail, bodySms: editing.bodySms, bodySlack: editing.bodySlack,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Save failed');
      toast.success('Template saved');
      setEditing(null);
      loadAll();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const resetTemplate = async (module: string, eventKey: string) => {
    try {
      const res = await fetch(`/api/notifications/templates?module=${module}&eventKey=${encodeURIComponent(eventKey)}`, {
        method: 'DELETE', headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('Reset failed');
      toast.success('Reset to default template');
      setEditing(null);
      loadAll();
    } catch (e) { toast.error((e as Error).message); }
  };

  const toggleEvent = async (module: string, ev: EventRow, enabled: boolean) => {
    try {
      await fetch('/api/notifications/templates', {
        method: 'PUT', headers: getAuthHeaders(),
        body: JSON.stringify({ module, eventKey: ev.eventKey, enabled, channels: ev.channels }),
      });
      setModules((prev) => prev.map((m) => m.module === module
        ? { ...m, events: m.events.map((e) => (e.eventKey === ev.eventKey ? { ...e, enabled } : e)) } : m));
      toast.success(enabled ? 'Event enabled' : 'Event disabled');
    } catch { toast.error('Failed to update'); }
  };

  const saveEscalation = async (module: string, pref: NonNullable<ModuleRow['preference']>) => {
    try {
      await fetch('/api/notifications/preferences', {
        method: 'PUT', headers: getAuthHeaders(),
        body: JSON.stringify({ module, ...pref }),
      });
      toast.success('Escalation matrix updated');
      loadAll();
    } catch { toast.error('Failed to update escalation'); }
  };

  const addWebhook = async () => {
    try {
      const res = await fetch('/api/notifications/webhooks', {
        method: 'POST', headers: getAuthHeaders(), body: JSON.stringify(newHook),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Failed to add');
      toast.success('Integration added');
      setShowAddHook(false);
      setNewHook({ type: 'slack', name: '', webhookUrl: '' });
      loadAll();
    } catch (e) { toast.error((e as Error).message); }
  };

  const testWebhook = async (id: string) => {
    toast.loading('Sending test message…', { id: `hook-${id}` });
    try {
      const res = await fetch('/api/notifications/webhooks', {
        method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ id, test: true }),
      });
      const body = await res.json().catch(() => ({}));
      if (body.success) toast.success('Test message delivered', { id: `hook-${id}` });
      else toast.error(body.error || 'Test failed', { id: `hook-${id}` });
    } catch { toast.error('Test failed', { id: `hook-${id}` }); }
  };

  const deleteWebhook = async (id: string) => {
    try {
      await fetch(`/api/notifications/webhooks?id=${id}`, { method: 'DELETE', headers: getAuthHeaders() });
      toast.success('Integration removed');
      loadAll();
    } catch { toast.error('Failed to remove'); }
  };

  const statusBadge = (s: string) => {
    const map: Record<string, string> = { sent: 'bg-emerald-100 text-emerald-700', failed: 'bg-red-100 text-red-700', skipped: 'bg-slate-100 text-slate-600', queued: 'bg-amber-100 text-amber-700' };
    return <Badge variant="outline" className={`${map[s] || ''} text-[10px]`}>{s}</Badge>;
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><FiRefreshCw className="w-8 h-8 animate-spin text-emerald-600" /></div>;
  }

  return (
    <div className="space-y-6 p-4 sm:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <span className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center"><FiBell className="w-5 h-5" /></span>
            Notification Center
          </h1>
          <p className="text-sm text-slate-500 mt-1">Multi-channel notifications for every module — email, SMS, in-app, Slack &amp; Teams</p>
        </div>
        <Button onClick={loadAll} variant="outline" size="sm" className="gap-2 shrink-0"><FiRefreshCw className="w-4 h-4" /> Refresh</Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {([['overview', 'Overview'], ['templates', 'Templates & Rules'], ['integrations', 'Integrations'], ['log', 'Delivery Log']] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${tab === k ? 'bg-emerald-600 text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Overview ── */}
      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'Notification Events', value: summary?.totalEvents ?? '—', icon: <FiZap className="w-5 h-5 text-emerald-600" /> },
              { label: 'Pending Approvals', value: summary?.pendingActions ?? 0, icon: <FiUsers className="w-5 h-5 text-amber-600" /> },
              { label: 'Chat Integrations', value: summary?.activeWebhooks?.length ?? 0, icon: <FiSlack className="w-5 h-5 text-purple-600" /> },
              { label: 'SMS Provider', value: summary?.smsConfigured ? 'Configured' : 'Not set', icon: <FiSmartphone className={`w-5 h-5 ${summary?.smsConfigured ? 'text-emerald-600' : 'text-slate-400'}`} /> },
            ].map((c) => (
              <Card key={c.label}><CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-slate-500 font-medium">{c.label}</div>
                  {c.icon}
                </div>
                <div className="text-2xl font-bold text-slate-900 mt-1">{c.value}</div>
              </CardContent></Card>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {(summary?.modules || []).map((m: any) => (
              <Card key={m.module} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => { setActiveModule(m.module); setTab('templates'); }}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-slate-800 text-sm">{m.label}</div>
                      <div className="text-xs text-slate-400 mt-0.5 line-clamp-1">{m.description}</div>
                    </div>
                    <span className="w-2.5 h-2.5 rounded-full mt-1 shrink-0" style={{ background: m.color }} />
                  </div>
                  <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
                    <span><b className="text-slate-800">{m.eventCount}</b> events</span>
                    <span><b className="text-slate-800">{m.escalatableCount}</b> escalatable</span>
                    <span><b className="text-slate-800">{m.deliveryCount}</b> sent</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ── Templates & Rules ── */}
      {tab === 'templates' && (
        <div className="space-y-4">
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            <button onClick={() => setActiveModule('all')} className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap ${activeModule === 'all' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>All modules</button>
            {modules.map((m) => (
              <button key={m.module} onClick={() => setActiveModule(m.module)} className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap ${activeModule === m.module ? 'text-white' : 'bg-white border border-slate-200 text-slate-600'}`} style={activeModule === m.module ? { background: m.color } : {}}>{m.label}</button>
            ))}
          </div>

          {visibleModules.map((mod) => (
            <Card key={mod.module}>
              <CardContent className="p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: mod.color }} />
                    <div>
                      <div className="font-bold text-slate-800">{mod.label}</div>
                      <div className="text-xs text-slate-400">{mod.description}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500 flex-wrap">
                    <Label className="text-[11px]">Escalate after</Label>
                    <Input
                      type="number" min={1} max={336} className="w-16 h-8 text-xs"
                      value={mod.preference?.escalationHours ?? 48}
                      onChange={(e) => setModules((prev) => prev.map((m) => m.module === mod.module
                        ? { ...m, preference: { escalationEnabled: m.preference?.escalationEnabled ?? true, escalationHours: parseInt(e.target.value) || 48, escalateToRole: m.preference?.escalateToRole ?? null } } : m))}
                    />
                    <Label className="text-[11px]">hours →</Label>
                    <Input
                      placeholder="hr_admin" className="w-28 h-8 text-xs"
                      value={mod.preference?.escalateToRole ?? 'hr_admin'}
                      onChange={(e) => setModules((prev) => prev.map((m) => m.module === mod.module
                        ? { ...m, preference: { escalationEnabled: m.preference?.escalationEnabled ?? true, escalationHours: m.preference?.escalationHours ?? 48, escalateToRole: e.target.value } } : m))}
                    />
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => saveEscalation(mod.module, mod.preference || { escalationEnabled: true, escalationHours: 48, escalateToRole: 'hr_admin' })}>Save</Button>
                  </div>
                </div>

                <div className="divide-y divide-slate-100 rounded-lg border border-slate-100">
                  {mod.events.map((ev) => (
                    <div key={ev.eventKey} className="flex flex-col lg:flex-row lg:items-center gap-2 p-3 hover:bg-slate-50/60">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <Switch checked={ev.enabled} onCheckedChange={(v) => toggleEvent(mod.module, ev, v)} className="mt-1" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm text-slate-800">{ev.name}</span>
                            {ev.actionable && <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-[10px]">Actionable</Badge>}
                            {ev.escalatable && <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-300">Escalates</Badge>}
                            {ev.isOverridden && <Badge variant="outline" className="text-[10px] text-purple-700 border-purple-300">Customized</Badge>}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">{ev.description}</div>
                          <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-2 flex-wrap">
                            <span className="inline-flex items-center gap-1"><FiUsers className="w-3 h-3" />{ev.recipients}</span>
                            <span className="flex items-center gap-1">
                              {ev.channels.map((c) => (
                                <span key={c} className="inline-flex items-center gap-0.5 bg-slate-100 rounded px-1.5 py-0.5">
                                  {CHANNEL_META[c]?.icon}{CHANNEL_META[c]?.label || c}
                                </span>
                              ))}
                            </span>
                          </div>
                        </div>
                      </div>
                      <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={() => { setEditing({ ...ev }); setEditingModule(mod.module); }}>
                        <FiEdit2 className="w-3.5 h-3.5" /> Edit
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Integrations ── */}
      {tab === 'integrations' && (
        <div className="space-y-4">
          <Card><CardContent className="p-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <div className="font-bold text-slate-800">Workspace Channels</div>
                <div className="text-xs text-slate-500">Connect Slack or Microsoft Teams incoming webhooks. Notifications (with Approve/Reject buttons) are posted to your workspace.</div>
              </div>
              <Button onClick={() => setShowAddHook(true)} className="bg-emerald-600 hover:bg-emerald-700 gap-2"><FiPlus className="w-4 h-4" /> Add Integration</Button>
            </div>
          </CardContent></Card>

          {webhooks.length === 0 ? (
            <div className="text-center py-10 text-sm text-slate-400">No integrations yet — add a Slack or Teams webhook to deliver chat notifications.</div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {webhooks.map((h) => (
                <Card key={h.id}><CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">{h.type === 'teams' ? <FiMonitor className="w-4 h-4 text-blue-600" /> : <FiSlack className="w-4 h-4 text-purple-600" />}</span>
                      <div className="min-w-0">
                        <div className="font-semibold text-sm text-slate-800 truncate">{h.name}</div>
                        <div className="text-xs text-slate-400 truncate">{h.webhookUrl}</div>
                      </div>
                    </div>
                    <Badge variant="outline" className={h.enabled ? 'text-emerald-700 border-emerald-300' : ''}>{h.enabled ? 'Active' : 'Paused'}</Badge>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => testWebhook(h.id)}><FiSend className="w-3.5 h-3.5" /> Test</Button>
                    <Button size="sm" variant="outline" onClick={async () => { await fetch(`/api/notifications/webhooks?id=${h.id}`, { method: 'PUT', headers: getAuthHeaders(), body: JSON.stringify({ enabled: !h.enabled }) }); loadAll(); }}>
                      {h.enabled ? 'Pause' : 'Resume'}
                    </Button>
                    <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700 ml-auto" onClick={() => deleteWebhook(h.id)}><FiTrash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </CardContent></Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Delivery Log ── */}
      {tab === 'log' && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <FiFilter className="w-4 h-4 text-slate-400" />
              <Select value={logFilters.module} onValueChange={(v) => { const f = { ...logFilters, module: v }; setLogFilters(f); reloadLog(f); }}>
                <SelectTrigger className="w-40 h-8 text-xs"><SelectValue placeholder="Module" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All modules</SelectItem>
                  {modules.map((m) => <SelectItem key={m.module} value={m.module}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={logFilters.channel} onValueChange={(v) => { const f = { ...logFilters, channel: v }; setLogFilters(f); reloadLog(f); }}>
                <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="Channel" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All channels</SelectItem>
                  {ALL_CHANNEL_KEYS.map((c) => <SelectItem key={c} value={c}>{CHANNEL_META[c].label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={logFilters.status} onValueChange={(v) => { const f = { ...logFilters, status: v }; setLogFilters(f); reloadLog(f); }}>
                <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  {['all', 'sent', 'failed', 'skipped', 'queued'].map((s) => <SelectItem key={s} value={s}>{s === 'all' ? 'All statuses' : s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {deliveries.length === 0 ? (
              <div className="text-center py-10 text-sm text-slate-400">No deliveries yet. Notifications will appear here as workflows run.</div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-100">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                    <tr>
                      <th className="text-left px-3 py-2.5">Time</th>
                      <th className="text-left px-3 py-2.5">Event</th>
                      <th className="text-left px-3 py-2.5">Channel</th>
                      <th className="text-left px-3 py-2.5">Recipient</th>
                      <th className="text-left px-3 py-2.5">Status</th>
                      <th className="text-left px-3 py-2.5">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {deliveries.map((d) => (
                      <tr key={d.id} className="hover:bg-slate-50/60">
                        <td className="px-3 py-2.5 text-xs text-slate-500 whitespace-nowrap">{new Date(d.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                        <td className="px-3 py-2.5">
                          <div className="text-xs font-semibold text-slate-700 max-w-[260px] truncate">{d.subject || d.eventKey}</div>
                          <div className="text-[11px] text-slate-400">{d.module} · {d.eventKey}</div>
                        </td>
                        <td className="px-3 py-2.5"><span className="inline-flex items-center gap-1 text-xs text-slate-600">{CHANNEL_META[d.channel]?.icon}{CHANNEL_META[d.channel]?.label || d.channel}</span></td>
                        <td className="px-3 py-2.5 text-xs text-slate-600 max-w-[160px] truncate">{d.recipientName || d.recipientAddress || '—'}</td>
                        <td className="px-3 py-2.5">{statusBadge(d.status)}{d.error ? <div className="text-[10px] text-red-500 max-w-[160px] truncate mt-0.5" title={d.error}>{d.error}</div> : null}</td>
                        <td className="px-3 py-2.5">{d.actionable ? (d.actionResult ? <Badge variant="outline" className={`text-[10px] ${d.actionResult === 'approved' ? 'text-emerald-700 border-emerald-300' : 'text-red-700 border-red-300'}`}>{d.actionResult}</Badge> : <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-300">Pending</Badge>) : <span className="text-xs text-slate-300">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Template editor dialog ── */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="pr-8">Edit template — {editing?.name}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4 mt-1">
              <div className="text-xs text-slate-500 bg-slate-50 rounded-lg p-3">
                <b>Recipients:</b> {editing.recipients} · <b>Event:</b> <code className="text-[10px]">{editing.eventKey}</code>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <Switch checked={editing.enabled} onCheckedChange={(v) => setEditing({ ...editing, enabled: v })} id="tpl-enabled" />
                  <Label htmlFor="tpl-enabled" className="text-sm">Enabled</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={editing.actionable} onCheckedChange={(v) => setEditing({ ...editing, actionable: v })} id="tpl-actionable" />
                  <Label htmlFor="tpl-actionable" className="text-sm">Actionable (Approve / Reject buttons)</Label>
                </div>
                {editing.actionable && (
                  <div className="flex items-center gap-2">
                    <Label className="text-sm">Link valid for</Label>
                    <Input type="number" className="w-20 h-8 text-xs" value={editing.expiresHours} onChange={(e) => setEditing({ ...editing, expiresHours: parseInt(e.target.value) || 168 })} />
                    <Label className="text-sm">hours</Label>
                  </div>
                )}
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-500 uppercase">Channels</Label>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {ALL_CHANNEL_KEYS.map((c) => {
                    const on = editing.channels.includes(c);
                    return (
                      <button
                        key={c}
                        onClick={() => setEditing({ ...editing, channels: on ? editing.channels.filter((x) => x !== c) : [...editing.channels, c] })}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${on ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                      >
                        {CHANNEL_META[c].icon}{CHANNEL_META[c].label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-500 uppercase">Placeholders used in defaults — click to copy</Label>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {editing.placeholders.map((p) => (
                    <button key={p} onClick={() => { navigator.clipboard?.writeText(`{{${p}}}`); toast.success(`Copied {{${p}}}`); }} className="text-[11px] font-mono bg-slate-100 hover:bg-emerald-100 rounded px-2 py-1">{`{{${p}}}`}</button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <Label className="text-xs font-semibold text-slate-500 uppercase">Subject (email)</Label>
                  <Input className="mt-1" value={editing.subject} onChange={(e) => setEditing({ ...editing, subject: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-slate-500 uppercase">Body (email + in-app)</Label>
                  <Textarea className="mt-1 min-h-[120px] font-mono text-xs" value={editing.bodyEmail} onChange={(e) => setEditing({ ...editing, bodyEmail: e.target.value })} />
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-semibold text-slate-500 uppercase">SMS text</Label>
                    <Textarea className="mt-1 min-h-[64px] font-mono text-xs" value={editing.bodySms} onChange={(e) => setEditing({ ...editing, bodySms: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-slate-500 uppercase">Slack / Teams text</Label>
                    <Textarea className="mt-1 min-h-[64px] font-mono text-xs" value={editing.bodySlack} onChange={(e) => setEditing({ ...editing, bodySlack: e.target.value })} />
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <Button onClick={saveTemplate} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 flex-1">{saving ? 'Saving…' : 'Save template'}</Button>
                <Button variant="outline" onClick={() => resetTemplate(editingModule, editing.eventKey)} className="gap-1.5"><FiRefreshCw className="w-3.5 h-3.5" /> Reset to default</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Add webhook dialog ── */}
      <Dialog open={showAddHook} onOpenChange={setShowAddHook}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add workspace integration</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-1">
            <div>
              <Label className="text-xs font-semibold text-slate-500 uppercase">Type</Label>
              <Select value={newHook.type} onValueChange={(v) => setNewHook({ ...newHook, type: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="slack">Slack (Incoming Webhook)</SelectItem>
                  <SelectItem value="teams">Microsoft Teams (Incoming Webhook)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-500 uppercase">Name</Label>
              <Input className="mt-1" placeholder="e.g. HR approvals channel" value={newHook.name} onChange={(e) => setNewHook({ ...newHook, name: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-500 uppercase">Webhook URL</Label>
              <Input className="mt-1" placeholder="https://hooks.slack.com/services/…" value={newHook.webhookUrl} onChange={(e) => setNewHook({ ...newHook, webhookUrl: e.target.value })} />
            </div>
            <Button onClick={addWebhook} disabled={!newHook.name || !newHook.webhookUrl} className="w-full bg-emerald-600 hover:bg-emerald-700">Add integration</Button>
          </div>
        </DialogContent>
      </Dialog>

      <ModuleTips tips={centerTips} />
    </div>
  );
}
