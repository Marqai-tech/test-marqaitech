'use client';

import { useEffect, useState } from 'react';

/**
 * TimePickerAmPm — locale-proof time picker with explicit AM/PM selection.
 *
 * BUG FIX (user report): the native <input type="time"> renders in the
 * browser locale — in many locales (en-GB, 24-hour locales) no AM/PM
 * selector is shown, which made it impossible to unambiguously pick a
 * time. This component always renders three dropdowns:
 *   Hour (1–12) · Minute (00–59) · AM/PM
 *
 * The external contract matches <input type="time">: the value is a
 * 24-hour "HH:mm" string, so existing form state and submit handlers
 * (e.g. `new Date(`${date}T${time}`)`) keep working unchanged.
 *
 * Selections accumulate across the three dropdowns via an internal draft
 * (a fully-controlled derivation would discard the hour the moment it is
 * picked, because the incomplete time can't be committed to `value`).
 */

interface TimePickerAmPmProps {
  /** 24-hour "HH:mm" string, '' for no selection */
  value: string;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
  id?: string;
}

const HOURS_12 = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

interface Draft { h: string; m: string; p: string }

export default function TimePickerAmPm({ value, onChange, className = '', disabled = false, id }: TimePickerAmPmProps) {
  // Parse the 24h "HH:mm" value into 12h components
  const [h24Raw, mRaw] = (value || '').split(':');
  const h24 = parseInt(h24Raw || '', 10);
  const valid = !isNaN(h24) && h24 >= 0 && h24 <= 23 && /^\d{2}$/.test(mRaw || '');

  const parsedHour = valid ? String(h24 % 12 === 0 ? 12 : h24 % 12) : '';
  const parsedMinute = valid ? mRaw : '';
  const parsedPeriod = valid ? (h24 >= 12 ? 'PM' : 'AM') : '';

  // Draft holds partially-made selections until all three parts are chosen
  const [draft, setDraft] = useState<Draft | null>(null);
  // External value changes (form reset) drop any pending draft
  useEffect(() => { setDraft(null); }, [value]);

  const hour12 = draft ? draft.h : parsedHour;
  const minute = draft ? draft.m : parsedMinute;
  const period = draft ? draft.p : parsedPeriod;

  const update = (part: Partial<Draft>) => {
    const next: Draft = { h: hour12, m: minute, p: period, ...part };
    if (!next.h || !next.m || !next.p) {
      setDraft(next); // incomplete — keep the draft so selections accumulate
      return;
    }
    let hh = parseInt(next.h, 10) % 12;
    if (next.p === 'PM') hh += 12;
    setDraft(null);
    onChange(`${String(hh).padStart(2, '0')}:${next.m}`);
  };

  const selectCls = `3boxes-input px-2 py-2 text-sm w-auto min-w-0`;
  const wrapCls = `inline-flex items-center gap-1.5 ${className}`;

  return (
    <div className={wrapCls} id={id}>
      <select
        aria-label="Hour"
        value={hour12}
        disabled={disabled}
        onChange={e => update({ h: e.target.value })}
        className={selectCls}
      >
        <option value="">HH</option>
        {HOURS_12.map(h => <option key={h} value={h}>{h}</option>)}
      </select>
      <span className="text-sm font-medium text-slate-400">:</span>
      <select
        aria-label="Minute"
        value={minute}
        disabled={disabled}
        onChange={e => update({ m: e.target.value })}
        className={selectCls}
      >
        <option value="">MM</option>
        {MINUTES.map(m => <option key={m} value={m}>{m}</option>)}
      </select>
      <select
        aria-label="AM or PM"
        value={period}
        disabled={disabled}
        onChange={e => update({ p: e.target.value })}
        className={`${selectCls} font-semibold`}
      >
        <option value="">--</option>
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
}
