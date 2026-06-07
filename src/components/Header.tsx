'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import {
  FiMenu,
  FiSearch,
  FiBell,
  FiUser,
  FiSettings,
  FiLogOut,
  FiCheck,
  FiCheckCircle,
  FiInfo,
  FiAlertTriangle,
  FiAlertCircle,
} from 'react-icons/fi';
import { HiShieldCheck } from 'react-icons/hi';
import type { Notification } from '@/store/notificationStore';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { useNotificationStore } from '@/store/notificationStore';

function getNotificationIcon(type: string) {
  switch (type) {
    case 'success':
      return <FiCheckCircle className="w-4 h-4 text-emerald-500" />;
    case 'warning':
      return <FiAlertTriangle className="w-4 h-4 text-amber-500" />;
    case 'error':
      return <FiAlertCircle className="w-4 h-4 text-red-500" />;
    case 'login':
    case 'logout':
      return <HiShieldCheck className="w-4 h-4 text-violet-500" />;
    case 'workflow':
      return <FiInfo className="w-4 h-4 text-orange-500" />;
    default:
      return <FiInfo className="w-4 h-4 text-blue-500" />;
  }
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

interface HeaderProps {
  onSidebarToggle: () => void;
}

export default function Header({ onSidebarToggle }: HeaderProps) {
  const { user, logout } = useAuthStore();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotificationStore();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const notifRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await logout();
    window.location.href = '/login';
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <header className="h-16 bg-white border-b border-slate-200 shadow-sm flex items-center px-4 gap-4 sticky top-0 z-30">
      {/* Sidebar Toggle */}
      <button
        onClick={onSidebarToggle}
        className="p-2 rounded-lg text-nexus-text-secondary hover:text-nexus-text-primary hover:bg-slate-100 transition-colors"
        title="Toggle sidebar"
      >
        <FiMenu className="w-5 h-5" />
      </button>

      {/* Search Bar */}
      <div className="flex-1 max-w-xl relative">
        <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search employees, modules, actions..."
          className="w-full pl-10 pr-4 py-2 rounded-lg border border-blue-200 bg-blue-50/30 text-sm text-nexus-text-primary placeholder:text-blue-400/60 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 focus:bg-white transition-all"
        />
      </div>

      <div className="flex items-center gap-2">
        {/* Notification Bell */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2 rounded-lg text-nexus-text-secondary hover:text-nexus-text-primary hover:bg-slate-100 transition-colors"
          >
            <FiBell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          {/* Notification Dropdown */}
          {showNotifications && (
            <div className="absolute right-0 top-full mt-2 w-96 nexus-card shadow-xl animate-slide-in-down overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-nexus-border">
                <h3 className="font-semibold text-nexus-text-primary">Notifications</h3>
                {unreadCount > 0 && (
                  <button
                    onClick={async () => {
                      await markAllAsRead();
                      toast.success('All notifications marked as read');
                    }}
                    className="text-xs text-blue-500 hover:text-blue-700 font-medium flex items-center gap-1"
                  >
                    <FiCheck className="w-3 h-3" />
                    Mark all read
                  </button>
                )}
              </div>
              <div className="max-h-96 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="p-8 text-center">
                    <FiBell className="w-8 h-8 text-nexus-text-muted mx-auto mb-2" />
                    <p className="text-sm text-nexus-text-muted">No notifications yet</p>
                  </div>
                ) : (
                  notifications.slice(0, 10).map((notif: Notification) => (
                    <div
                      key={notif.id}
                      className={`flex items-start gap-3 p-4 border-b border-nexus-border/50 hover:bg-slate-50 transition-colors cursor-pointer ${
                        !notif.isRead ? 'bg-blue-50/30' : ''
                      }`}
                      onClick={async () => {
                        if (!notif.isRead) {
                          await markAsRead(notif.id);
                        }
                        if (notif.link) {
                          window.location.href = notif.link;
                        }
                      }}
                    >
                      <div className="flex-shrink-0 mt-0.5">
                        {getNotificationIcon(notif.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={`text-sm truncate ${!notif.isRead ? 'font-semibold text-nexus-text-primary' : 'font-medium text-nexus-text-secondary'}`}>
                            {notif.title}
                          </p>
                          {!notif.isRead && (
                            <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                          )}
                        </div>
                        <p className="text-xs text-nexus-text-muted mt-0.5 line-clamp-2">
                          {notif.message}
                        </p>
                        <p className="text-[10px] text-nexus-text-muted mt-1">
                          {formatTimeAgo(notif.createdAt)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <Link
                href="/notifications"
                onClick={() => setShowNotifications(false)}
                className="block text-center py-3 text-sm font-medium text-blue-500 hover:text-blue-700 hover:bg-slate-50 border-t border-nexus-border transition-colors"
              >
                View all notifications
              </Link>
            </div>
          )}
        </div>

        {/* User Menu */}
        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            {user?.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.avatar}
                alt={user.name}
                className="w-8 h-8 rounded-full object-cover ring-2 ring-white shadow-sm"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white text-xs font-bold shadow-sm">
                {user?.name ? getInitials(user.name) : '??'}
              </div>
            )}
            <div className="hidden sm:block text-left">
              <p className="text-sm font-medium text-nexus-text-primary leading-tight">{user?.name}</p>
              <p className="text-[10px] text-nexus-text-muted capitalize leading-tight">{user?.role?.replace('_', ' ')}</p>
            </div>
          </button>

          {/* User Dropdown */}
          {showUserMenu && (
            <div className="absolute right-0 top-full mt-2 w-56 nexus-card shadow-xl animate-slide-in-down overflow-hidden py-1">
              <div className="px-4 py-3 border-b border-nexus-border">
                <p className="text-sm font-semibold text-nexus-text-primary">{user?.name}</p>
                <p className="text-xs text-nexus-text-muted mt-0.5">{user?.email}</p>
              </div>
              <Link
                href="/settings?tab=profile"
                onClick={() => setShowUserMenu(false)}
                className="flex items-center gap-3 px-4 py-2.5 text-sm text-nexus-text-secondary hover:bg-slate-50 hover:text-nexus-text-primary transition-colors"
              >
                <FiUser className="w-4 h-4" />
                Profile
              </Link>
              <Link
                href="/settings"
                onClick={() => setShowUserMenu(false)}
                className="flex items-center gap-3 px-4 py-2.5 text-sm text-nexus-text-secondary hover:bg-slate-50 hover:text-nexus-text-primary transition-colors"
              >
                <FiSettings className="w-4 h-4" />
                Settings
              </Link>
              <div className="border-t border-nexus-border my-1" />
              <button
                onClick={handleLogout}
                className="flex items-center gap-3 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors w-full"
              >
                <FiLogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
