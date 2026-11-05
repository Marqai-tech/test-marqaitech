'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * CompanyLogo — image-with-fallback component for displaying a company logo.
 *
 * Behavior:
 *   1. If a `src` URL is supplied (e.g. previously-fetched logo saved on the
 *      experience record), render that.
 *   2. Otherwise, if a `name` is supplied, hit /api/company-logo?name=... —
 *      the server-side route walks through 3 providers (Clearbit →
 *      DuckDuckGo → Google S2) and returns the first 200 image it finds,
 *      or a placeholder SVG if all fail.
 *   3. If neither `src` nor `name` is supplied, or all fetches fail, render
 *      a circular badge with the company's first 1-2 initials on a colored
 *      background — consistent with the rest of the app's avatar pattern.
 *
 * Props:
 *   - name: company name (used for fetch + initials fallback)
 *   - src:  optional explicit logo URL (overrides fetch)
 *   - size: pixel diameter (default 40)
 *   - className: extra classes for the wrapper
 */

const FALLBACK_GRADIENTS = [
  'from-green-500 to-teal-400',
  'from-blue-500 to-indigo-400',
  'from-amber-500 to-orange-400',
  'from-rose-500 to-pink-400',
  'from-violet-500 to-purple-400',
  'from-cyan-500 to-sky-400',
];

function initialsFromName(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function gradientForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash) + name.charCodeAt(i);
    hash |= 0;
  }
  return FALLBACK_GRADIENTS[Math.abs(hash) % FALLBACK_GRADIENTS.length];
}

interface CompanyLogoProps {
  name?: string | null;
  src?: string | null;
  size?: number;
  className?: string;
}

export default function CompanyLogo({ name, src, size = 40, className = '' }: CompanyLogoProps) {
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(src || null);
  const [imgError, setImgError] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // If `src` prop changes, reset to use it directly.
  useEffect(() => {
    setResolvedSrc(src || null);
    setImgError(false);
  }, [src]);

  // If no explicit src, fetch via /api/company-logo (server auto-falls-through providers).
  useEffect(() => {
    if (resolvedSrc || imgError) return;
    if (!name) return;
    let cancelled = false;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    fetch(`/api/company-logo?name=${encodeURIComponent(name)}`, { signal: ac.signal })
      .then((res) => {
        if (cancelled) return null;
        const ct = res.headers.get('content-type') || '';
        if (res.ok && ct.startsWith('image/')) return res.blob();
        return null;
      })
      .then((blob) => {
        if (cancelled || !blob) {
          setImgError(true);
          return;
        }
        const url = URL.createObjectURL(blob);
        setResolvedSrc(url);
      })
      .catch(() => {
        if (cancelled) return;
        setImgError(true);
      });

    return () => {
      cancelled = true;
      ac.abort();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, resolvedSrc, imgError]);

  const displayName = (name || '').trim();
  const sizeStyle = { width: `${size}px`, height: `${size}px` };

  if (resolvedSrc && !imgError) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={resolvedSrc}
        alt={displayName ? `${displayName} logo` : 'Company logo'}
        className={`rounded-lg object-contain bg-white border border-slate-200 ${className}`}
        style={sizeStyle}
        onError={() => setImgError(true)}
      />
    );
  }

  // Initials fallback
  return (
    <div
      className={`rounded-lg flex items-center justify-center text-white font-bold bg-gradient-to-br ${gradientForName(displayName || '?')} ${className}`}
      style={{ ...sizeStyle, fontSize: `${Math.max(11, Math.floor(size * 0.36))}px` }}
      aria-label={displayName ? `${displayName} (initials)` : 'No company'}
      title={displayName || 'No company'}
    >
      {initialsFromName(displayName)}
    </div>
  );
}
