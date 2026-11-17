'use client';

/**
 * VendorPortalBell — header bell for the vendor portal pages.
 * Shows the unread count of the caller's in-app notification feed and links
 * to /vendor-portal/notifications. Hides itself entirely when the user is
 * not an authenticated vendor user (e.g. stale token) so legacy headers
 * never break.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FiBell } from 'react-icons/fi';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

export default function VendorPortalBell() {
  const [unread, setUnread] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch('/api/vendor/notifications', { headers: getAuthHeaders() });
        if (!res.ok) return;
        const d = await res.json().catch(() => ({}));
        if (alive && typeof d.unread === 'number') setUnread(d.unread);
      } catch { /* silent — the bell is cosmetic */ }
    };
    queueMicrotask(() => void load());
    const t = setInterval(load, 60000); // light refresh every minute
    return () => { alive = false; clearInterval(t); };
  }, []);

  return (
    <Link href="/vendor-portal/notifications" aria-label={`Notifications${unread ? ` — ${unread} unread` : ''}`}
      className="relative inline-flex items-center justify-center w-8 h-8 rounded-full hover:bg-white/10 transition-colors">
      <FiBell className="w-5 h-5" />
      {typeof unread === 'number' && unread > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </Link>
  );
}
