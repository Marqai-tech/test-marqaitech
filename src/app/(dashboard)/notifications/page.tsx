'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiBell,
  FiCheck,
  FiCheckCircle,
  FiInfo,
  FiAlertTriangle,
  FiShield,
  FiCalendar,
  FiDollarSign,
  FiBriefcase,
  FiClock,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

/* ── Types ── */
interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  category: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

/* ── Helpers ── */
function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('nexus_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

function formatTimeAgo(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function getTypeIcon(type: string) {
  switch (type) {
    case 'success': return <FiCheckCircle className="w-4 h-4 text-emerald-500" />;
    case 'warning': return <FiAlertTriangle className="w-4 h-4 text-amber-500" />;
    case 'error': return <FiAlertTriangle className="w-4 h-4 text-red-500" />;
    case 'login': case 'logout': return <FiShield className="w-4 h-4 text-blue-500" />;
    default: return <FiInfo className="w-4 h-4 text-blue-500" />;
  }
}

function getCategoryIcon(category: string) {
  switch (category) {
    case 'auth': return <FiShield className="w-4 h-4" />;
    case 'leave': return <FiCalendar className="w-4 h-4" />;
    case 'payroll': return <FiDollarSign className="w-4 h-4" />;
    case 'recruitment': return <FiBriefcase className="w-4 h-4" />;
    case 'workflow': return <FiClock className="w-4 h-4" />;
    default: return <FiBell className="w-4 h-4" />;
  }
}

function getCategoryColor(category: string) {
  const map: Record<string, string> = {
    auth: 'bg-blue-50 text-blue-600',
    leave: 'bg-amber-50 text-amber-600',
    payroll: 'bg-emerald-50 text-emerald-600',
    recruitment: 'bg-violet-50 text-violet-600',
    workflow: 'bg-cyan-50 text-cyan-600',
    system: 'bg-slate-50 text-slate-600',
    performance: 'bg-rose-50 text-rose-600',
    alert: 'bg-red-50 text-red-600',
  };
  return map[category] || 'bg-slate-50 text-slate-600';
}

/* ── Component ── */
export default function NotificationsPage() {
  const _user = useAuthStore();
  void _user;

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('all');
  const [markingRead, setMarkingRead] = useState<string | null>(null);

  const filterTabs = [
    { key: 'all', label: 'All' },
    { key: 'unread', label: 'Unread' },
    { key: 'auth', label: 'Auth' },
    { key: 'leave', label: 'Leave' },
    { key: 'payroll', label: 'Payroll' },
    { key: 'recruitment', label: 'Recruitment' },
    { key: 'workflow', label: 'Workflow' },
  ];

  /* Fetch */
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const headers = getAuthHeaders();
      const res = await fetch('/api/notifications?limit=100', { headers });
      if (res.ok) { const d = await res.json(); setNotifications(d.notifications || []); }
    } catch {
      toast.error('Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { queueMicrotask(() => fetchData()); }, [fetchData]);

  /* Mark as Read */
  const handleMarkRead = async (id: string) => {
    try {
      setMarkingRead(id);
      const res = await fetch(`/api/notifications/${id}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ isRead: true }),
      });
      if (!res.ok) throw new Error('Failed');
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    } catch {
      toast.error('Failed to mark as read');
    } finally {
      setMarkingRead(null);
    }
  };

  /* Mark All Read */
  const handleMarkAllRead = async () => {
    try {
      const unreadIds = notifications.filter(n => !n.isRead).map(n => n.id);
      await Promise.all(unreadIds.map(id =>
        fetch(`/api/notifications/${id}`, {
          method: 'PATCH',
          headers: getAuthHeaders(),
          body: JSON.stringify({ isRead: true }),
        })
      ));
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      toast.success('All notifications marked as read');
    } catch {
      toast.error('Failed to mark all as read');
    }
  };

  /* Filter */
  const filteredNotifications = notifications.filter(n => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'unread') return !n.isRead;
    return n.category === activeFilter;
  });

  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold gradient-text flex items-center gap-2">
            <FiBell className="w-6 h-6" />
            Notifications
          </h1>
          <p className="text-nexus-text-secondary mt-1">{unreadCount} unread notification{unreadCount !== 1 ? 's' : ''}</p>
        </div>
        {unreadCount > 0 && (
          <button onClick={handleMarkAllRead} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium text-sm shadow-sm shadow-blue-500/25 transition-colors">
            <FiCheck className="w-4 h-4" /> Mark All Read
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-lg w-fit overflow-x-auto">
        {filterTabs.map(tab => (
          <button key={tab.key} onClick={() => setActiveFilter(tab.key)} className={`px-3 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${activeFilter === tab.key ? 'bg-white text-nexus-text-primary shadow-sm' : 'text-nexus-text-secondary hover:text-nexus-text-primary'}`}>
            {tab.label}
            {tab.key === 'unread' && unreadCount > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold bg-blue-500 text-white rounded-full">{unreadCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* Notifications List */}
      <div className="nexus-card overflow-hidden">
        <div className="max-h-[calc(100vh-300px)] overflow-y-auto">
          {loading ? (
            <div className="divide-y divide-nexus-border/50">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 p-4 animate-pulse">
                  <div className="w-10 h-10 bg-slate-200 rounded-full flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-48 bg-slate-200 rounded" />
                    <div className="h-2.5 w-64 bg-slate-200 rounded" />
                  </div>
                  <div className="h-3 w-12 bg-slate-200 rounded" />
                </div>
              ))}
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="py-12 text-center">
              <FiBell className="w-10 h-10 text-nexus-text-muted mx-auto mb-3" />
              <p className="text-nexus-text-secondary font-medium">No notifications found</p>
              <p className="text-sm text-nexus-text-muted mt-1">You&apos;re all caught up!</p>
            </div>
          ) : (
            <div className="divide-y divide-nexus-border/50">
              {filteredNotifications.map(n => (
                <div
                  key={n.id}
                  onClick={() => !n.isRead && handleMarkRead(n.id)}
                  className={`flex items-start gap-4 p-4 transition-colors cursor-pointer ${!n.isRead ? 'bg-blue-50/50 hover:bg-blue-50/80' : 'hover:bg-slate-50'}`}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${getCategoryColor(n.category)}`}>
                    {getCategoryIcon(n.category)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-sm font-medium ${!n.isRead ? 'text-nexus-text-primary' : 'text-nexus-text-secondary'}`}>{n.title}</p>
                      {!n.isRead && <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0" />}
                    </div>
                    <p className="text-xs text-nexus-text-muted mt-0.5 line-clamp-2">{n.message}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-nexus-text-muted">{formatTimeAgo(n.createdAt)}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${getCategoryColor(n.category)}`}>{n.category}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {getTypeIcon(n.type)}
                    {!n.isRead && (
                      <button onClick={(e) => { e.stopPropagation(); handleMarkRead(n.id); }} disabled={markingRead === n.id} className="p-1.5 rounded-lg text-nexus-text-muted hover:text-blue-500 hover:bg-blue-50 transition-colors" title="Mark as read">
                        <FiCheck className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
