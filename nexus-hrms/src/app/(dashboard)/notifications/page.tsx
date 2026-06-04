'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiBell,
  FiSearch,
  FiFilter,
  FiInfo,
  FiAlertTriangle,
  FiCheckCircle,
  FiXCircle,
  FiClock,
  FiCheck,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

/* ── Types ── */
interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  link?: string | null;
  createdAt: string;
}

/* ── Helpers ── */
function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('nexus_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

function formatDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatTimeAgo(d: string | null | undefined) {
  if (!d) return '';
  const now = new Date();
  const date = new Date(d);
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return formatDate(d);
}

function getTypeConfig(type: string) {
  const configs: Record<string, { icon: typeof FiInfo; borderColor: string; bgColor: string; iconColor: string }> = {
    info: { icon: FiInfo, borderColor: 'border-l-blue-500', bgColor: 'bg-blue-50', iconColor: 'text-blue-500' },
    warning: { icon: FiAlertTriangle, borderColor: 'border-l-amber-500', bgColor: 'bg-amber-50', iconColor: 'text-amber-500' },
    success: { icon: FiCheckCircle, borderColor: 'border-l-emerald-500', bgColor: 'bg-emerald-50', iconColor: 'text-emerald-500' },
    error: { icon: FiXCircle, borderColor: 'border-l-red-500', bgColor: 'bg-red-50', iconColor: 'text-red-500' },
    reminder: { icon: FiClock, borderColor: 'border-l-purple-500', bgColor: 'bg-purple-50', iconColor: 'text-purple-500' },
    login: { icon: FiInfo, borderColor: 'border-l-blue-500', bgColor: 'bg-blue-50', iconColor: 'text-blue-500' },
    logout: { icon: FiInfo, borderColor: 'border-l-slate-500', bgColor: 'bg-slate-50', iconColor: 'text-slate-500' },
    workflow: { icon: FiInfo, borderColor: 'border-l-blue-500', bgColor: 'bg-blue-50', iconColor: 'text-blue-500' },
  };
  return configs[type] || configs.info;
}

function getTypeBadge(type: string) {
  const map: Record<string, string> = {
    info: 'nexus-badge nexus-badge-info',
    warning: 'nexus-badge nexus-badge-warning',
    success: 'nexus-badge nexus-badge-success',
    error: 'nexus-badge nexus-badge-error',
    reminder: 'nexus-badge nexus-badge-purple',
    login: 'nexus-badge nexus-badge-info',
    logout: 'bg-slate-100 text-slate-600 nexus-badge',
    workflow: 'nexus-badge nexus-badge-info',
  };
  return map[type] || 'nexus-badge nexus-badge-info';
}

/* ── Component ── */
export default function NotificationsPage() {
  const { user } = useAuthStore();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);

  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterRead, setFilterRead] = useState('');

  /* Fetch data */
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const headers = getAuthHeaders();
      const params = new URLSearchParams();
      if (filterRead === 'unread') params.set('unread', 'true');
      params.set('limit', '50');

      const res = await fetch(`/api/notifications?${params.toString()}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }, [filterRead]);

  useEffect(() => { queueMicrotask(() => fetchData()); }, [fetchData]);

  /* Mark single as read */
  const handleMarkAsRead = async (id: string) => {
    try {
      const res = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ id }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to mark as read');
    }
  };

  /* Mark all as read */
  const handleMarkAllAsRead = async () => {
    try {
      setMarkingAll(true);
      const res = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ markAll: true }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('All notifications marked as read');
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to mark all as read');
    } finally {
      setMarkingAll(false);
    }
  };

  /* Filter notifications */
  const filteredNotifications = notifications.filter(n => {
    if (filterType && n.type !== filterType) return false;
    if (filterRead === 'unread' && n.isRead) return false;
    if (filterRead === 'read' && !n.isRead) return false;
    if (!search) return true;
    return n.title.toLowerCase().includes(search.toLowerCase()) ||
      n.message.toLowerCase().includes(search.toLowerCase());
  });

  /* Counts */
  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-nexus-text-primary flex items-center gap-2">
            <FiBell className="w-6 h-6 text-blue-500" />
            Notifications
            {unreadCount > 0 && (
              <span className="ml-1 px-2 py-0.5 text-xs font-bold bg-blue-500 text-white rounded-full">{unreadCount}</span>
            )}
          </h1>
          <p className="text-nexus-text-secondary mt-1">Stay updated with your latest notifications</p>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllAsRead}
            disabled={markingAll}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium text-sm shadow-sm shadow-blue-500/25 transition-colors disabled:opacity-50"
          >
            <FiCheck className="w-4 h-4" />
            {markingAll ? 'Marking...' : 'Mark All as Read'}
          </button>
        )}
      </div>

      {/* Search & Filters */}
      <div className="nexus-card p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-nexus-text-muted" />
            <input
              type="text"
              placeholder="Search notifications..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>
          <div className="flex items-center gap-2">
            <FiFilter className="w-4 h-4 text-nexus-text-muted flex-shrink-0" />
            <select value={filterType} onChange={e => setFilterType(e.target.value)} className="px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
              <option value="">All Types</option>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="success">Success</option>
              <option value="error">Error</option>
              <option value="reminder">Reminder</option>
            </select>
            <select value={filterRead} onChange={e => setFilterRead(e.target.value)} className="px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
              <option value="">All</option>
              <option value="unread">Unread</option>
              <option value="read">Read</option>
            </select>
          </div>
        </div>
      </div>

      {/* Notifications List */}
      <div className="space-y-3">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="nexus-card p-5 animate-pulse border-l-4 border-l-slate-200">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-slate-200 flex-shrink-0" />
                <div className="flex-1">
                  <div className="h-4 w-48 bg-slate-200 rounded mb-2" />
                  <div className="h-3 w-full bg-slate-100 rounded mb-1" />
                  <div className="h-3 w-32 bg-slate-100 rounded" />
                </div>
              </div>
            </div>
          ))
        ) : filteredNotifications.length === 0 ? (
          <div className="nexus-card p-12 text-center">
            <FiBell className="w-12 h-12 text-nexus-text-muted mx-auto mb-4" />
            <p className="text-nexus-text-secondary font-medium text-lg">No notifications</p>
            <p className="text-sm text-nexus-text-muted mt-1">You&apos;re all caught up!</p>
          </div>
        ) : (
          filteredNotifications.map(n => {
            const config = getTypeConfig(n.type);
            const Icon = config.icon;
            return (
              <div
                key={n.id}
                onClick={() => { if (!n.isRead) handleMarkAsRead(n.id); }}
                className={`nexus-card border-l-4 ${config.borderColor} transition-all duration-200 cursor-pointer hover:shadow-md ${!n.isRead ? 'bg-blue-50/30' : ''}`}
              >
                <div className="p-5">
                  <div className="flex items-start gap-4">
                    <div className={`w-10 h-10 rounded-xl ${config.bgColor} flex items-center justify-center flex-shrink-0`}>
                      <Icon className={`w-5 h-5 ${config.iconColor}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className={`text-sm font-semibold ${!n.isRead ? 'text-nexus-text-primary' : 'text-nexus-text-secondary'}`}>{n.title}</h3>
                            {!n.isRead && (
                              <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                            )}
                          </div>
                          <p className="text-sm text-nexus-text-secondary leading-relaxed">{n.message}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className={getTypeBadge(n.type)}>{n.type}</span>
                          <span className="text-xs text-nexus-text-muted whitespace-nowrap">{formatTimeAgo(n.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
