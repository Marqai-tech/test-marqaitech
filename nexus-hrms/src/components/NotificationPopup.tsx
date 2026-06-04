'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  FiInfo,
  FiCheckCircle,
  FiAlertTriangle,
  FiAlertCircle,
  FiX,
} from 'react-icons/fi';
import { HiShieldCheck } from 'react-icons/hi';
import { useNotificationStore } from '@/store/notificationStore';
import { useAuthStore } from '@/store/authStore';
import type { Notification } from '@/store/notificationStore';

interface PopupNotification {
  id: string;
  title: string;
  message: string;
  type: string;
  createdAt: string;
}

function getPopupIcon(type: string) {
  switch (type) {
    case 'success':
      return <FiCheckCircle className="w-5 h-5 text-emerald-500" />;
    case 'warning':
      return <FiAlertTriangle className="w-5 h-5 text-amber-500" />;
    case 'error':
      return <FiAlertCircle className="w-5 h-5 text-red-500" />;
    case 'login':
    case 'logout':
      return <HiShieldCheck className="w-5 h-5 text-violet-500" />;
    case 'workflow':
      return <FiInfo className="w-5 h-5 text-orange-500" />;
    default:
      return <FiInfo className="w-5 h-5 text-blue-500" />;
  }
}

function getPopupBorderColor(type: string) {
  switch (type) {
    case 'success':
      return 'border-l-emerald-500';
    case 'warning':
      return 'border-l-amber-500';
    case 'error':
      return 'border-l-red-500';
    case 'login':
    case 'logout':
      return 'border-l-violet-500';
    case 'workflow':
      return 'border-l-orange-500';
    default:
      return 'border-l-blue-500';
  }
}

function getPopupBgColor(type: string) {
  switch (type) {
    case 'success':
      return 'bg-emerald-50';
    case 'warning':
      return 'bg-amber-50';
    case 'error':
      return 'bg-red-50';
    case 'login':
    case 'logout':
      return 'bg-violet-50';
    case 'workflow':
      return 'bg-orange-50';
    default:
      return 'bg-blue-50';
  }
}

function NotificationPopupItem({
  notification,
  onDismiss,
}: {
  notification: PopupNotification;
  onDismiss: (id: string) => void;
}) {
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsExiting(true);
      setTimeout(() => onDismiss(notification.id), 300);
    }, 5000);

    return () => clearTimeout(timer);
  }, [notification.id, onDismiss]);

  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(() => onDismiss(notification.id), 300);
  };

  return (
    <div
      className={`w-80 nexus-card shadow-xl border-l-4 ${getPopupBorderColor(notification.type)} ${
        isExiting ? 'animate-slide-out-right' : 'animate-slide-in-right'
      }`}
    >
      <div className={`p-3 ${getPopupBgColor(notification.type)} rounded-r-[11px]`}>
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-0.5">
            {getPopupIcon(notification.type)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-nexus-text-primary truncate">
              {notification.title}
            </p>
            <p className="text-xs text-nexus-text-secondary mt-0.5 line-clamp-2">
              {notification.message}
            </p>
          </div>
          <button
            onClick={handleDismiss}
            className="flex-shrink-0 p-1 rounded-md text-nexus-text-muted hover:text-nexus-text-primary hover:bg-white/60 transition-colors"
          >
            <FiX className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function NotificationPopup() {
  const [popups, setPopups] = useState<PopupNotification[]>([]);
  const lastCheckedIds = useRef<Set<string>>(new Set());
  const { notifications } = useNotificationStore();
  const { isAuthenticated: isAuthed } = useAuthStore();
  const prevAuthState = useRef(isAuthed);

  const handleDismiss = useCallback((id: string) => {
    setPopups((prev) => prev.filter((p) => p.id !== id));
  }, []);

  // Track new notifications to display popups
  useEffect(() => {
    // Reset on auth change
    if (prevAuthState.current !== isAuthed) {
      lastCheckedIds.current = new Set();
      setPopups([]);
      prevAuthState.current = isAuthed;
      return;
    }

    if (!isAuthed) return;

    // Find new unread notifications that we haven't shown yet
    const newNotifs = notifications.filter(
      (n: Notification) => !n.isRead && !lastCheckedIds.current.has(n.id)
    );

    if (newNotifs.length > 0) {
      // Add to shown set
      newNotifs.forEach((n: Notification) => lastCheckedIds.current.add(n.id));

      // Add to popups using functional update (not direct setState in effect body)
      const newPopups: PopupNotification[] = newNotifs.map((n: Notification) => ({
        id: n.id,
        title: n.title,
        message: n.message,
        type: n.type,
        createdAt: n.createdAt,
      }));

      // Use queueMicrotask to avoid the synchronous setState-in-effect warning
      queueMicrotask(() => {
        setPopups((prev) => [...prev, ...newPopups]);
      });
    }
  }, [notifications, isAuthed]);

  if (popups.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {popups.map((popup) => (
        <div key={popup.id} className="pointer-events-auto">
          <NotificationPopupItem
            notification={popup}
            onDismiss={handleDismiss}
          />
        </div>
      ))}
    </div>
  );
}
