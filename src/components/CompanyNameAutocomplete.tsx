'use client';

/**
 * CompanyNameAutocomplete — text input with a dropdown of matching companies
 * fetched from an EXTERNAL company directory (Wikipedia OpenSearch + Clearbit
 * Logo API via /api/company-search). The user can either pick a company
 * from the dropdown OR select "Other" to type a custom name.
 *
 * Behavior:
 *   1. User types → after 300ms debounce, fetch companies from the external
 *      directory (NOT the internal HRMS DB).
 *   2. Dropdown shows up to 10 matches + an "Other" option at the bottom.
 *   3. Clicking a company → calls onChange with the company name, calls
 *      onSelectLogo with the logo URL (or null), closes the dropdown.
 *   4. Clicking "Other" → switches to free-text mode (keeps the typed value),
 *      closes the dropdown, calls onSelectLogo(null) so the parent clears
 *      the logo URL field. NO logo is fetched for manual entries.
 *   5. Esc / blur / click-outside → close dropdown.
 *   6. Loading indicator while searching.
 *   7. "No matches" message when the external API returns 0 results.
 *   8. API failures are handled gracefully — the "Other" option always
 *      lets the user enter a company manually.
 *
 * The component is uncontrolled-input-style — parent owns the value via
 * `value` + `onChange` props. The parent also receives the logo URL via
 * `onSelectLogo` so it can populate the "Company Logo URL" field.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { FiChevronDown, FiX, FiLoader } from 'react-icons/fi';

interface CompanyNameAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  /** Called with the logo URL (or null) when a company is selected from the
   *  dropdown. Pass null when the user selects "Other" so the parent can
   *  clear the logo URL field. */
  onSelectLogo?: (logoUrl: string | null) => void;
  onBlur?: () => void;
  placeholder?: string;
  className?: string;
  /** When true, shows a red asterisk next to the label. */
  required?: boolean;
  disabled?: boolean;
}

interface CompanyOption {
  id: string;
  name: string;
  domain?: string | null;
  logo?: string | null;
  description?: string | null;
  wikipediaUrl?: string | null;
}

const DEBOUNCE_MS = 300;
const MAX_RESULTS = 10;
const MIN_QUERY_LENGTH = 2;

export default function CompanyNameAutocomplete({
  value,
  onChange,
  onSelectLogo,
  onBlur,
  placeholder = 'Start typing a company name…',
  className = '',
  required = false,
  disabled = false,
}: CompanyNameAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<CompanyOption[]>([]);
  const [isOtherMode, setIsOtherMode] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchSeqRef = useRef(0);

  // Fetch matching companies from the EXTERNAL directory (Wikipedia + Clearbit)
  const fetchCompanies = useCallback(async (q: string) => {
    if (!q || q.trim().length < MIN_QUERY_LENGTH) {
      setOptions([]);
      setLoading(false);
      setErrorMsg(null);
      return;
    }
    // Increment sequence so stale fetches don't overwrite newer results
    const seq = ++fetchSeqRef.current;
    try {
      const url = `/api/company-search?q=${encodeURIComponent(q.trim())}&limit=${MAX_RESULTS}`;
      const res = await fetch(url, {
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        if (seq !== fetchSeqRef.current) return; // stale
        setOptions([]);
        setErrorMsg(`Search unavailable (HTTP ${res.status})`);
        return;
      }
      const data = await res.json();
      if (seq !== fetchSeqRef.current) return; // stale
      const list: CompanyOption[] = Array.isArray(data?.companies) ? data.companies : [];
      setOptions(list.slice(0, MAX_RESULTS));
      setErrorMsg(data?.error || null);
    } catch {
      if (seq !== fetchSeqRef.current) return; // stale
      setOptions([]);
      setErrorMsg('Network error — you can still use "Other" to enter manually');
    } finally {
      if (seq === fetchSeqRef.current) setLoading(false);
    }
  }, []);

  // Debounced fetch on value change (only when dropdown is open)
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const t = setTimeout(() => { void fetchCompanies(value); }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [value, open, fetchCompanies]);

  // Click-outside → close dropdown
  useEffect(() => {
    function handleDocClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleDocClick);
    return () => document.removeEventListener('mousedown', handleDocClick);
  }, []);

  // Esc key → close dropdown
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  function handleSelect(opt: CompanyOption) {
    onChange(opt.name);
    // Pass the logo URL back to the parent so it can populate the
    // "Company Logo URL" field automatically.
    onSelectLogo?.(opt.logo || null);
    setIsOtherMode(false);
    setOpen(false);
    onBlur?.();
  }

  function handleSelectOther() {
    // Keep the currently-typed value — let the user continue editing it as
    // free text. Clear the logo URL since manual entries don't get a logo.
    setIsOtherMode(true);
    onSelectLogo?.(null);
    setOpen(false);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    onChange(e.target.value);
    // If the user starts editing again after picking "Other", reset to
    // dropdown mode so they get suggestions if the new text matches a
    // known company.
    if (isOtherMode) {
      setIsOtherMode(false);
      // Don't auto-clear the logo here — let the parent decide. The parent
      // typically clears the logo when the user picks "Other" (above) or
      // when the user manually edits the logo URL field.
    }
    if (!open) setOpen(true);
  }

  function handleInputFocus() {
    if (blurTimerRef.current) {
      clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
    if (!isOtherMode && value.trim().length >= MIN_QUERY_LENGTH) {
      setOpen(true);
    }
  }

  function handleInputBlur() {
    // Defer the blur callback so a click on a dropdown option can register
    // first. If the user clicks an option, handleSelect fires onChange and
    // the timer is cancelled by handleInputFocus's ref-clear. Otherwise
    // the timer fires after 200ms and we propagate the blur.
    blurTimerRef.current = setTimeout(() => {
      setOpen(false);
      onBlur?.();
    }, 200);
  }

  function handleClearOther() {
    setIsOtherMode(false);
    onChange('');
    onSelectLogo?.(null);
  }

  const showDropdown = open && !isOtherMode && (loading || options.length > 0 || !!errorMsg || (value.trim().length >= MIN_QUERY_LENGTH && !loading));

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="flex gap-1.5">
        <input
          type="text"
          value={value}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          placeholder={isOtherMode ? 'Type the company name manually' : placeholder}
          required={required}
          disabled={disabled}
          className="flex-1 px-3 py-2 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400"
        />
        {/* Loading spinner OR dropdown-toggle chevron */}
        {loading ? (
          <div className="p-2 rounded-lg border border-thb-border text-thb-text-muted flex items-center" title="Searching…">
            <FiLoader className="w-4 h-4 animate-spin" />
          </div>
        ) : (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setOpen(o => !o)}
            disabled={disabled}
            className="p-2 rounded-lg border border-thb-border text-thb-text-secondary hover:bg-slate-50 transition-colors"
            title="Show company suggestions"
            aria-label="Show company suggestions"
          >
            <FiChevronDown className="w-4 h-4" />
          </button>
        )}
        {isOtherMode && (
          <button
            type="button"
            tabIndex={-1}
            onClick={handleClearOther}
            disabled={disabled}
            className="p-2 rounded-lg border border-thb-border text-red-500 hover:bg-red-50 transition-colors"
            title="Switch back to company suggestions"
            aria-label="Switch back to company suggestions"
          >
            <FiX className="w-4 h-4" />
          </button>
        )}
      </div>

      {isOtherMode && (
        <p className="mt-1 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
          Custom company — no logo will be fetched. You can paste a logo URL manually if needed.
        </p>
      )}

      {showDropdown && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-thb-border rounded-lg shadow-lg max-h-64 overflow-y-auto">
          {loading && (
            <div className="px-3 py-2 text-xs text-thb-text-muted flex items-center gap-2">
              <FiLoader className="w-3 h-3 animate-spin" />
              Searching external company directory…
            </div>
          )}
          {!loading && errorMsg && options.length === 0 && (
            <div className="px-3 py-2 text-xs text-amber-700 bg-amber-50 border-b border-amber-200">
              {errorMsg}. Use &ldquo;Other&rdquo; to enter manually.
            </div>
          )}
          {!loading && !errorMsg && options.length === 0 && value.trim().length >= MIN_QUERY_LENGTH && (
            <div className="px-3 py-2 text-xs text-thb-text-muted">
              No matching companies found. Use &ldquo;Other&rdquo; to enter manually.
            </div>
          )}
          {!loading && options.map((opt) => (
            <button
              key={opt.id}
              type="button"
              tabIndex={-1}
              onMouseDown={(e) => { e.preventDefault(); handleSelect(opt); }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-amber-50 border-b border-thb-border/50 last:border-b-0 flex items-center gap-2"
            >
              {opt.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={opt.logo}
                  alt=""
                  className="w-5 h-5 rounded object-contain bg-white border border-slate-100"
                  onError={(e) => {
                    // Hide broken logo images — show initials fallback instead
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                    const fallback = (e.currentTarget.nextElementSibling as HTMLElement) || null;
                    if (fallback) fallback.style.display = 'flex';
                  }}
                />
              ) : null}
              {!opt.logo && (
                <div className="w-5 h-5 rounded bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500">
                  {(opt.name || '?').slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="font-medium text-thb-text-primary truncate">{opt.name}</div>
                {opt.description && (
                  <div className="text-[10px] text-thb-text-muted truncate">{opt.description}</div>
                )}
                {opt.domain && (
                  <div className="text-[10px] text-thb-text-muted truncate">🌐 {opt.domain}</div>
                )}
              </div>
            </button>
          ))}
          {/* "Other" option — always visible at the bottom of the dropdown so
              the user can switch to manual entry even when there are matches. */}
          {!loading && (
            <button
              type="button"
              tabIndex={-1}
              onMouseDown={(e) => { e.preventDefault(); handleSelectOther(); }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-violet-50 border-t-2 border-violet-100 flex items-center gap-2 text-violet-700 font-medium"
            >
              <div className="w-5 h-5 rounded bg-violet-100 flex items-center justify-center text-[10px] font-bold text-violet-700">+</div>
              <div className="flex-1">
                <div>Other — enter manually</div>
                <div className="text-[10px] text-violet-500 font-normal">Use this if the company isn&apos;t listed above (no logo fetched)</div>
              </div>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
