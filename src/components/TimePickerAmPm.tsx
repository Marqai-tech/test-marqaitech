'use client';

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

export default function TimePickerAmPm({ value, onChange, className = '', disabled = false, id }: TimePickerAmPmProps) {
  // Parse the 24h "HH:mm" value into 12h components
  const [h24Raw, mRaw] = (value || '').split(':');
  const h24 = parseInt(h24Raw || '', 10);
  const valid = !isNaN(h24) && h24 >= 0 && h24 <= 23 && /^\d{2}$/.test(mRaw || '');

  const hour12 = !valid ? '' : String(h24 % 12 === 0 ? 12 : h24 % 12);
  const minute = valid ? mRaw : '';
  const period: 'AM' | 'PM' | '' = !valid ? '' : h24 >= 12 ? 'PM' : 'AM';

  const commit = (h: string | null, m: string | null, p: 'AM' | 'PM' | null) => {
    const nextHour12 = h ?? hour12;
    const nextMinute = m ?? minute;
    const nextPeriod = p ?? period;
    if (!nextHour12 || !nextMinute || !nextPeriod) return; // incomplete — wait for all three
    let hh = parseInt(nextHour12, 10) % 12;
    if (nextPeriod === 'PM') hh += 12;
    onChange(`${String(hh).padStart(2, '0')}:${nextMinute}`);
  };

  const selectCls = `3boxes-input px-2 py-2 text-sm w-auto min-w-0`;
  const wrapCls = `inline-flex items-center gap-1.5 ${className}`;

  return (
    <div className={wrapCls} id={id}>
      <select
        aria-label="Hour"
        value={hour12}
        disabled={disabled}
        onChange={e => commit(e.target.value, null, null)}
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
        onChange={e => commit(null, e.target.value, null)}
        className={selectCls}
      >
        <option value="">MM</option>
        {MINUTES.map(m => <option key={m} value={m}>{m}</option>)}
      </select>
      <select
        aria-label="AM or PM"
        value={period}
        disabled={disabled}
        onChange={e => commit(null, null, e.target.value === 'PM' ? 'PM' : 'AM')}
        className={`${selectCls} font-semibold`}
      >
        <option value="">--</option>
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
}
