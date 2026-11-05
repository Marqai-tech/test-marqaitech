'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  FiMessageCircle, FiVideo, FiCalendar, FiMail, FiCheckSquare,
  FiEdit3, FiUsers, FiFolder, FiLayers, FiDollarSign,
  FiShield, FiLock, FiCpu, FiActivity,
  FiPhone, FiHardDrive, FiArrowRight,
} from 'react-icons/fi';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, CartesianGrid } from 'recharts';
import ModuleDashboardShell, { DashboardTabConfig } from '@/components/ModuleDashboardShell';
import { StatCard, Panel, EmptyState } from '@/components/dashboard/smarthr-widgets';
import { useAuthStore } from '@/store/authStore';
import { getToken } from '@/lib/token-storage';
import { useAutoSeedDemo } from '@/hooks/useAutoSeedDemo';

/* ── App registry (kept for the compact quick-link row at the bottom —
 *    the big tile "options view" sections were replaced by live charts) ── */
interface ModuleTile {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  route: string;
  bg: string;
  shadow: string;
}

const ALL_APPS: ModuleTile[] = [
  { title: 'Chat', icon: FiMessageCircle, route: '/collaboration/chat', bg: 'bg-emerald-50 text-emerald-500', shadow: 'shadow-emerald-500/20' },
  { title: 'Calls', icon: FiVideo, route: '/collaboration/calls', bg: 'bg-teal-50 text-teal-500', shadow: 'shadow-teal-500/20' },
  { title: 'Email', icon: FiMail, route: '/email', bg: 'bg-cyan-50 text-cyan-500', shadow: 'shadow-cyan-500/20' },
  { title: 'Calendar', icon: FiCalendar, route: '/calendar', bg: 'bg-amber-50 text-amber-500', shadow: 'shadow-amber-500/20' },
  { title: 'To Do', icon: FiCheckSquare, route: '/todo', bg: 'bg-emerald-50 text-emerald-500', shadow: 'shadow-emerald-500/20' },
  { title: 'Notes', icon: FiEdit3, route: '/notes', bg: 'bg-orange-50 text-orange-500', shadow: 'shadow-orange-500/20' },
  { title: 'Kanban', icon: FiLayers, route: '/kanban', bg: 'bg-violet-50 text-violet-500', shadow: 'shadow-violet-500/20' },
  { title: 'Social Feed', icon: FiUsers, route: '/social-feed', bg: 'bg-pink-50 text-pink-500', shadow: 'shadow-pink-500/20' },
  { title: 'Files', icon: FiFolder, route: '/file-manager', bg: 'bg-blue-50 text-blue-500', shadow: 'shadow-blue-500/20' },
  { title: 'Invoices', icon: FiDollarSign, route: '/invoices', bg: 'bg-rose-50 text-rose-500', shadow: 'shadow-rose-500/20' },
];

/* ── Data shapes (subset of fields returned by the collaboration APIs) ── */
interface ChatRoomLite {
  id: string;
  name?: string | null;
  roomType?: string;
  lastMessageAt?: string | null;
  unreadCount?: number;
  _count?: { messages: number };
  members?: Array<{ user?: { firstName?: string; lastName?: string; avatar?: string | null } }>;
  messages?: Array<{ id: string; body: string; createdAt: string; senderId: string }>;
}
interface CallLite {
  id: string;
  callType: string;
  status: string;
  startedAt: string;
  durationSec?: number | null;
  initiator?: { firstName?: string; lastName?: string } | null;
}
interface StorageLite {
  usedBytes?: number;
  usagePercent?: number;
  breakdown?: {
    personal?: Array<{ bytes: number; count: number }>;
    project?: Array<{ bytes: number; count: number }>;
    company?: Array<{ bytes: number; count: number }>;
  };
  cleanupCandidates?: number;
}

function getAuthHeaders() {
  const token = getToken() || (typeof window !== 'undefined' ? useAuthStore.getState().token : null);
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

function fmtBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 MB';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(0)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function fmtDuration(sec?: number | null): string {
  if (!sec || sec <= 0) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function timeAgo(iso?: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function roomLabel(room: ChatRoomLite): string {
  if (room.name) return room.name;
  const other = room.members?.find(m => m.user)?.user;
  return other ? `${other.firstName || ''} ${other.lastName || ''}`.trim() || 'Direct message' : 'Direct message';
}

const collaborationTabs: DashboardTabConfig[] = [
  { label: 'Overview', key: 'overview', icon: <FiActivity className="w-4 h-4" /> },
];

function CollaborationPageContent() {
  return (
    <ModuleDashboardShell
      moduleKey="collaboration"
      moduleLabel="Collaboration"
      moduleIcon={<FiMessageCircle className="w-5 h-5 text-white" />}
      gradientColor="from-teal-500 to-emerald-600"
      tabs={collaborationTabs}
      overviewContent={<CollaborationContent />}
      children={{}}
    />
  );
}

export default function CollaborationHubPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full" /></div>}>
      <CollaborationPageContent />
    </Suspense>
  );
}

/* ── Collaboration Content — graphical / statistical (Task 157) ── */
function CollaborationContent() {
  const router = useRouter();
  // Silently trigger collaboration demo-data seed on first load so the
  // Vercel deployment shows chat rooms / files / call recordings.
  useAutoSeedDemo('collaboration');

  const [rooms, setRooms] = useState<ChatRoomLite[]>([]);
  const [calls, setCalls] = useState<CallLite[]>([]);
  const [storage, setStorage] = useState<StorageLite | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      const [roomsRes, callsRes, storageRes] = await Promise.all([
        fetch('/api/collaboration/chat/rooms', { headers: getAuthHeaders() }),
        fetch('/api/collaboration/calls?limit=100', { headers: getAuthHeaders() }),
        fetch('/api/collaboration/storage-analytics', { headers: getAuthHeaders() }),
      ]);
      if (roomsRes.ok) setRooms((await roomsRes.json()).rooms || []);
      if (callsRes.ok) setCalls((await callsRes.json()).calls || []);
      if (storageRes.ok) setStorage(await storageRes.json());
    } catch { /* non-fatal — cards just show zeros */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { queueMicrotask(() => fetchStats()); }, [fetchStats]);

  /* ── Derived statistics ── */
  const totalMessages = rooms.reduce((s, r) => s + (r._count?.messages || 0), 0);
  const totalUnread = rooms.reduce((s, r) => s + (r.unreadCount || 0), 0);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthCalls = calls.filter(c => new Date(c.startedAt) >= monthStart);
  const totalCallSecs = monthCalls.reduce((s, c) => s + (c.durationSec || 0), 0);

  // Calls per day — last 7 days
  const callDayData = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - i));
    const key = d.toDateString();
    const dayCalls = calls.filter(c => new Date(c.startedAt).toDateString() === key);
    return {
      day: d.toLocaleDateString('en-US', { weekday: 'short' }),
      calls: dayCalls.length,
      minutes: Math.round(dayCalls.reduce((s, c) => s + (c.durationSec || 0), 0) / 60),
    };
  });

  // Storage + file counts by drive type (from storage-analytics breakdown)
  const driveStats = (['personal', 'project', 'company'] as const).map(k => ({
    name: k.charAt(0).toUpperCase() + k.slice(1),
    bytes: (storage?.breakdown?.[k] || []).reduce((s, g) => s + (g.bytes || 0), 0),
    count: (storage?.breakdown?.[k] || []).reduce((s, g) => s + (g.count || 0), 0),
  }));
  const totalFiles = driveStats.reduce((s, d) => s + d.count, 0);
  const usedBytes = storage?.usedBytes || driveStats.reduce((s, d) => s + d.bytes, 0);
  const usagePercent = storage?.usagePercent ?? 0;

  // Top rooms by message volume
  const topRooms = rooms
    .filter(r => (r._count?.messages || 0) > 0)
    .sort((a, b) => (b._count?.messages || 0) - (a._count?.messages || 0))
    .slice(0, 6)
    .map(r => ({
      name: roomLabel(r).length > 14 ? `${roomLabel(r).slice(0, 13)}…` : roomLabel(r),
      messages: r._count?.messages || 0,
      unread: r.unreadCount || 0,
    }));

  const recentRooms = [...rooms]
    .sort((a, b) => new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime())
    .slice(0, 5);
  const recentCalls = calls.slice(0, 5);

  const driveColors: Record<string, string> = { Personal: '#3A57C4', Project: '#6C4FD6', Company: '#10B981' };

  return (
    <div className="space-y-6">
      {/* ── KPI row — shared SmartHR StatCard ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Chat Conversations"
          value={rooms.length}
          sub={`${totalMessages.toLocaleString()} messages · ${totalUnread} unread`}
          icon={<FiMessageCircle className="w-5 h-5" />}
          bg="bg-[#10B981]/10 text-[#10B981]"
          ring="ring-[#10B981]/20"
        />
        <StatCard
          label="Files Stored"
          value={loading ? '…' : totalFiles.toLocaleString()}
          sub="Personal · Project · Company drives"
          icon={<FiFolder className="w-5 h-5" />}
          bg="bg-[#3A57C4]/10 text-[#3A57C4]"
          ring="ring-[#3A57C4]/20"
        />
        <StatCard
          label="Storage Used"
          value={fmtBytes(usedBytes)}
          sub={`${usagePercent > 0 ? `${usagePercent.toFixed(1)}% of quota` : 'DLP-scanned & versioned'}`}
          icon={<FiHardDrive className="w-5 h-5" />}
          bg="bg-[#6C4FD6]/10 text-[#6C4FD6]"
          ring="ring-[#6C4FD6]/20"
        />
        <StatCard
          label="Calls This Month"
          value={monthCalls.length}
          sub={`${Math.round(totalCallSecs / 60)} min total talk time`}
          icon={<FiVideo className="w-5 h-5" />}
          bg="bg-[#FF9B44]/10 text-[#FF9B44]"
          ring="ring-[#FF9B44]/20"
        />
      </div>

      {/* ── Charts row 1 — messaging volume + storage donut ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <Panel
          title="Messaging Volume — Top Rooms"
          icon={<FiMessageCircle className="w-4 h-4" />}
          accent="text-[#3A57C4]"
          action={<span className="text-xs text-slate-500">{totalMessages.toLocaleString()} messages across {rooms.length} rooms</span>}
        >
          {topRooms.length === 0 ? (
            <EmptyState icon={<FiMessageCircle className="w-10 h-10 text-slate-300 mx-auto mb-2" />} message="No messages yet — start a conversation in Chat" />
          ) : (
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topRooms} layout="vertical" margin={{ top: 4, right: 24, bottom: 0, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#EEF2F7" />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11, fill: '#334155' }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: 'rgba(58,87,196,0.06)' }} contentStyle={{ borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 12 }} />
                  <Bar dataKey="messages" fill="#3A57C4" radius={[0, 8, 8, 0]} barSize={18} name="Messages" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel
          title="Storage by Drive"
          icon={<FiHardDrive className="w-4 h-4" />}
          accent="text-[#6C4FD6]"
          action={<span className="text-xs font-semibold text-violet-600">{usagePercent > 0 ? `${usagePercent.toFixed(1)}% used` : fmtBytes(usedBytes)}</span>}
        >
          {usedBytes <= 0 ? (
            <EmptyState icon={<FiHardDrive className="w-10 h-10 text-slate-300 mx-auto mb-2" />} message="No files stored yet — upload to the File Manager" />
          ) : (
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={driveStats.filter(d => d.bytes > 0)}
                    dataKey="bytes"
                    nameKey="name"
                    innerRadius="55%"
                    outerRadius="80%"
                    paddingAngle={3}
                    strokeWidth={0}
                  >
                    {driveStats.filter(d => d.bytes > 0).map((d) => (
                      <Cell key={d.name} fill={driveColors[d.name] || '#3A57C4'} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => [fmtBytes(Number(value)), 'Size']}
                    contentStyle={{ borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 12 }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="grid grid-cols-3 gap-2 mt-2">
            {driveStats.map(d => (
              <div key={d.name} className="rounded-xl bg-slate-50 p-2.5 text-center">
                <p className="text-sm font-bold text-slate-800">{d.count}</p>
                <p className="text-[10px] text-slate-500">{d.name} files</p>
                <p className="text-[10px] font-medium" style={{ color: driveColors[d.name] }}>{fmtBytes(d.bytes)}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* ── Charts row 2 — calls trend ── */}
      <Panel
        title="Calls — Last 7 Days"
        icon={<FiVideo className="w-4 h-4" />}
        accent="text-[#009EFB]"
        action={
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5 font-medium text-[#3A57C4]"><span className="w-2.5 h-2.5 rounded-sm bg-[#3A57C4]" /> calls</span>
            <span className="inline-flex items-center gap-1.5 font-medium text-[#10B981]"><span className="w-2.5 h-2.5 rounded-sm bg-[#10B981]" /> minutes</span>
          </div>
        }
      >
        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={callDayData} margin={{ top: 8, right: 12, bottom: 0, left: -14 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EEF2F7" />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip cursor={{ fill: 'rgba(58,87,196,0.06)' }} contentStyle={{ borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 12 }} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="calls" fill="#3A57C4" radius={[6, 6, 0, 0]} barSize={22} name="calls" />
              <Bar dataKey="minutes" fill="#10B981" radius={[6, 6, 0, 0]} barSize={22} name="minutes" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      {/* ── Recent activity ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel
          title="Recent Conversations"
          icon={<FiMessageCircle className="w-4 h-4" />}
          accent="text-[#10B981]"
          action={<button onClick={() => router.push('/collaboration/chat')} className="text-xs font-semibold text-[#3A57C4] hover:underline">Open Chat</button>}
        >
          {recentRooms.length === 0 ? (
            <EmptyState icon={<FiMessageCircle className="w-10 h-10 text-slate-300 mx-auto mb-2" />} message="No conversations yet" />
          ) : (
            <div className="divide-y divide-slate-50">
              {recentRooms.map(r => {
                const last = r.messages?.[0];
                return (
                  <button key={r.id} onClick={() => router.push('/collaboration/chat')} className="w-full flex items-center gap-3 py-3 text-left group hover:bg-slate-50/60 rounded-lg px-2 -mx-2 transition-colors">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                      {roomLabel(r).charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-800 truncate group-hover:text-emerald-600 transition-colors">{roomLabel(r)}</p>
                        <span className="text-[10px] text-slate-400 flex-shrink-0">{timeAgo(r.lastMessageAt || last?.createdAt)}</span>
                      </div>
                      <p className="text-xs text-slate-500 truncate">{last?.body || 'No messages yet'}</p>
                    </div>
                    {(r.unreadCount || 0) > 0 && (
                      <span className="w-5 h-5 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">{r.unreadCount}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel
          title="Recent Calls"
          icon={<FiPhone className="w-4 h-4" />}
          accent="text-[#F43F5E]"
          action={<button onClick={() => router.push('/collaboration/calls')} className="text-xs font-semibold text-[#3A57C4] hover:underline">Open Calls</button>}
        >
          {recentCalls.length === 0 ? (
            <EmptyState icon={<FiPhone className="w-10 h-10 text-slate-300 mx-auto mb-2" />} message="No calls yet" />
          ) : (
            <div className="divide-y divide-slate-50">
              {recentCalls.map(c => {
                const missed = c.status === 'missed' || c.status === 'failed';
                return (
                  <div key={c.id} className="flex items-center gap-3 py-3 px-2 -mx-2 rounded-lg hover:bg-slate-50/60 transition-colors">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${missed ? 'bg-rose-50 text-rose-500' : 'bg-teal-50 text-teal-500'}`}>
                      {c.callType === 'video' ? <FiVideo className="w-4 h-4" /> : <FiPhone className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">
                        {c.initiator ? `${c.initiator.firstName || ''} ${c.initiator.lastName || ''}`.trim() || 'Unknown' : 'Unknown'}
                        <span className="ml-2 text-[10px] font-medium text-slate-400 uppercase">{c.callType || 'audio'}</span>
                      </p>
                      <p className="text-xs text-slate-500">{timeAgo(c.startedAt)} · {fmtDuration(c.durationSec)}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold flex-shrink-0 ${
                      c.status === 'completed' ? 'bg-emerald-50 text-emerald-600'
                        : missed ? 'bg-rose-50 text-rose-600'
                          : 'bg-slate-100 text-slate-500'
                    }`}>
                      {c.status}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>

      {/* ── Compact quick links (navigation kept, options view replaced) ── */}
      <div className="thb-card p-4">
        <h3 className="text-xs font-semibold text-thb-text-secondary uppercase tracking-wider mb-3">Collaboration Apps</h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          {ALL_APPS.map(app => (
            <button
              key={app.title}
              onClick={() => router.push(app.route)}
              className="group flex items-center gap-2.5 p-2.5 rounded-xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50 transition-all text-left"
            >
              <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${app.bg} transition-transform duration-200 group-hover:scale-110`}>
                <app.icon className="w-4 h-4" />
              </span>
              <span className="text-xs font-semibold text-thb-text-primary truncate">{app.title}</span>
              <FiArrowRight className="w-3 h-3 text-slate-300 ml-auto opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
            </button>
          ))}
        </div>
      </div>

      {/* ── Architecture & compliance (kept compact) ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { icon: FiShield, title: 'Data Isolation', text: 'Sub-companies can never see each other\u2019s chats, files, or profiles — admins see aggregates only.', color: 'text-emerald-500' },
          { icon: FiLock, title: 'End-to-End Encryption', text: '1:1 WebRTC calls and direct chats are E2EE — even Super Admins cannot read them.', color: 'text-teal-500' },
          { icon: FiCpu, title: 'AI-Powered', text: 'Real-time translation, document intelligence, summarization, and sentiment analysis.', color: 'text-green-500' },
          { icon: FiActivity, title: 'DLP & Watermarking', text: 'AI scans block card/SSN uploads; sensitive docs carry viewer + timestamp watermarks.', color: 'text-amber-500' },
        ].map(item => (
          <div key={item.title} className="thb-card p-4">
            <div className="flex items-center gap-2 mb-1.5">
              <item.icon className={`w-4 h-4 ${item.color}`} />
              <h3 className="text-xs font-bold text-thb-text-primary">{item.title}</h3>
            </div>
            <p className="text-[11px] text-thb-text-secondary leading-relaxed">{item.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
