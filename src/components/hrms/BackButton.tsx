'use client';

/**
 * BackButton — the standard "Back" control required on every module screen.
 *
 * - Uses router.back() when there is browser history (normal navigation).
 * - Falls back to `fallbackHref` when history is empty (direct link / new tab)
 *   so the user is never stranded.
 * - Accepts an optional `onClick` override for screens where "back" must go to
 *   a specific in-module view (e.g. Requisition Form → Requisition List).
 *
 * Styling matches the Employee module: white card button, hairline border,
 * `text-sm font-medium`, green hover accent.
 */
import { useRouter } from 'next/navigation';
import { FiArrowLeft } from 'react-icons/fi';

interface BackButtonProps {
  /** Route to use when there is no browser history (direct load / new tab). */
  fallbackHref?: string;
  /** Optional click override (e.g. close the in-page form instead of history back). */
  onClick?: () => void;
  className?: string;
  label?: string;
}

export function BackButton({ fallbackHref = '/dashboard', onClick, className = '', label = 'Back' }: BackButtonProps) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        if (onClick) { onClick(); return; }
        if (typeof window !== 'undefined' && window.history.length > 1) router.back();
        else router.push(fallbackHref);
      }}
      className={`inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 shadow-sm transition hover:border-green-300 hover:bg-green-50 hover:text-green-700 ${className}`}
      aria-label="Go back"
      title="Go back"
    >
      <FiArrowLeft className="h-4 w-4" aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}
