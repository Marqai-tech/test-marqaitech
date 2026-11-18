'use client';

/**
 * DateRangeSelector — dropdown for the Employee Dashboard header.
 *
 * Renders the SmartHR-style "Date Range" pill next to the existing DateChip
 * in the PageBreadcrumbs `right` slot. Presets:
 *   Last 7 Days · Last 30 Days (default) · Last 90 Days ·
 *   This Month · This Quarter · This Year · Custom Range
 *
 * When "Custom Range" is selected, two native date inputs appear inline so
 * the user can pick a from / to date pair. The selection resolves to
 * concrete `fromDate` / `toDate` (YYYY-MM-DD) values via resolveDateRange
 * and is surfaced to the parent via onChange(range).
 *
 * The currently-selected preset is shown prominently in the trigger so the
 * active filter is always visible at a glance.
 */

import * as React from 'react';
import { FiCalendar, FiChevronDown } from 'react-icons/fi';
import {
  DATE_RANGE_OPTIONS,
  DEFAULT_DATE_RANGE,
  resolveDateRange,
  type DateRangePreset,
  type ResolvedDateRange,
} from '@/lib/dateRange';

export interface DateRangeSelectorProps {
  /** Currently selected preset. Defaults to 'last_30'. */
  value?: DateRangePreset;
  /** Initial custom from date (YYYY-MM-DD) when value === 'custom'. */
  customFrom?: string;
  /** Initial custom to date (YYYY-MM-DD) when value === 'custom'. */
  customTo?: string;
  /** Fired with the fully-resolved range whenever the selection changes. */
  onChange: (range: ResolvedDateRange) => void;
}

export default function DateRangeSelector({
  value = DEFAULT_DATE_RANGE,
  customFrom,
  customTo,
  onChange,
}: DateRangeSelectorProps) {
  const [preset, setPreset] = React.useState<DateRangePreset>(value);
  const [from, setFrom] = React.useState<string>(customFrom || '');
  const [to, setTo] = React.useState<string>(customTo || '');
  const [open, setOpen] = React.useState(false);

  // Resolve + propagate the range whenever the preset or custom dates change.
  React.useEffect(() => {
    const range = resolveDateRange(preset, from, to);
    onChange(range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, from, to]);

  const activeOption = DATE_RANGE_OPTIONS.find((o) => o.value === preset) || DATE_RANGE_OPTIONS[1];
  const triggerLabel = preset === 'custom' && from && to
    ? `${from} → ${to}`
    : activeOption.label;

  // Close the dropdown on outside click / Escape.
  const rootRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 shadow-sm hover:border-slate-300 transition-all"
        title="Change dashboard date range"
      >
        <FiCalendar className="w-3.5 h-3.5 text-[#3A57C4]" />
        <span className="max-w-[180px] truncate">{triggerLabel}</span>
        <FiChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute top-full right-0 mt-1 z-50 min-w-[220px] bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden"
        >
          <div className="px-3 py-2 border-b border-slate-100">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Date Range</p>
          </div>
          <ul className="py-1 max-h-72 overflow-y-auto">
            {DATE_RANGE_OPTIONS.map((opt) => (
              <li key={opt.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={preset === opt.value}
                  onClick={() => { setPreset(opt.value); }}
                  className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 transition-colors ${
                    preset === opt.value
                      ? 'bg-[#3A57C4]/10 text-[#3A57C4] font-semibold'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span>{opt.label}</span>
                  {preset === opt.value && <span className="text-[10px] font-bold">✓</span>}
                </button>
              </li>
            ))}
          </ul>

          {preset === 'custom' && (
            <div className="px-3 py-3 border-t border-slate-100 bg-slate-50/50 space-y-2">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Custom Range</p>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] font-medium text-slate-500">From</span>
                  <input
                    type="date"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    max={to || undefined}
                    className="h-8 px-2 text-xs border border-slate-200 rounded-md bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#3A57C4]/20 focus:border-[#3A57C4]"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] font-medium text-slate-500">To</span>
                  <input
                    type="date"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    min={from || undefined}
                    className="h-8 px-2 text-xs border border-slate-200 rounded-md bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#3A57C4]/20 focus:border-[#3A57C4]"
                  />
                </label>
              </div>
              {!from || !to ? (
                <p className="text-[10px] text-amber-600">Pick both from and to dates.</p>
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
