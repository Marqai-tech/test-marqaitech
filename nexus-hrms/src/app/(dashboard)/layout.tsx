'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { useNotificationStore } from '@/store/notificationStore';
import { useModuleStore, modules } from '@/store/moduleStore';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import NotificationPopup from '@/components/NotificationPopup';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isLoading, fetchUser, token } = useAuthStore();
  const { fetchNotifications } = useNotificationStore();
  const { activeModule, setActiveModule } = useModuleStore();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Check mobile viewport
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) {
        setSidebarCollapsed(true);
      }
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Sync pathname to module store - detect which module we're in
  useEffect(() => {
    if (!pathname) return;

    // If we're on the dashboard landing page, clear active module
    if (pathname === '/dashboard') {
      // Only clear if user explicitly navigated here (not via module click)
      // We don't auto-clear because the dashboard page itself may have set it
      return;
    }

    // Try to auto-detect module from pathname
    if (!activeModule) {
      const matchedModule = modules.find(
        (m) => m.route !== '/dashboard' && pathname.startsWith(m.route)
      );
      if (matchedModule) {
        setActiveModule(matchedModule.id);
      }
    }
  }, [pathname, activeModule, setActiveModule]);

  // Auth check
  useEffect(() => {
    if (!token && !isLoading) {
      router.push('/login');
      return;
    }
    if (token && !isAuthenticated && isLoading) {
      fetchUser();
    }
  }, [token, isAuthenticated, isLoading, router, fetchUser]);

  // Fetch notifications when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      fetchNotifications();
      // Poll for new notifications every 30 seconds
      const interval = setInterval(fetchNotifications, 30000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, fetchNotifications]);

  const handleSidebarToggle = useCallback(() => {
    if (isMobile) {
      setMobileSidebarOpen((prev) => !prev);
    } else {
      setSidebarCollapsed((prev) => !prev);
    }
  }, [isMobile]);

  // Show loading while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-nexus-background">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 mb-4 shadow-lg shadow-blue-500/25 animate-pulse-subtle">
            <svg className="animate-spin h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
          <p className="text-sm text-nexus-text-secondary font-medium">Loading NEXUS HRMS...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-nexus-background">
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#fff',
            color: '#0F172A',
            borderRadius: '12px',
            border: '1px solid #E2E8F0',
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
            padding: '12px 16px',
            fontSize: '14px',
          },
          success: {
            iconTheme: {
              primary: '#10B981',
              secondary: '#fff',
            },
          },
          error: {
            iconTheme: {
              primary: '#EF4444',
              secondary: '#fff',
            },
          },
        }}
      />
      <NotificationPopup />

      {/* Mobile Sidebar Overlay */}
      {isMobile && mobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 animate-fade-in"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`${
          isMobile
            ? `fixed z-40 transition-transform duration-300 ${
                mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
              }`
            : ''
        }`}
      >
        <Sidebar
          collapsed={isMobile ? false : sidebarCollapsed}
          onToggle={handleSidebarToggle}
        />
      </div>

      {/* Main Content */}
      <div
        className={`transition-all duration-300 ${
          isMobile ? '' : sidebarCollapsed ? 'ml-[68px]' : 'ml-[260px]'
        }`}
      >
        <Header onSidebarToggle={handleSidebarToggle} />
        <main className="p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
