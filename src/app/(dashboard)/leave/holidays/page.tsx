'use client';

import { useState } from 'react';
import { FiCalendar, FiChevronDown } from 'react-icons/fi';
import { useAuthStore } from '@/store/authStore';

/* ── Data ── */
const holidays2026 = [
  { date: '2026-01-01', day: 'Thursday', name: 'New Year\'s Day', type: 'Public' },
  { date: '2026-01-14', day: 'Wednesday', name: 'Makar Sankranti', type: 'Restricted' },
  { date: '2026-01-26', day: 'Monday', name: 'Republic Day', type: 'Public' },
  { date: '2026-02-19', day: 'Thursday', name: 'Shivaji Jayanti', type: 'Restricted' },
  { date: '2026-03-10', day: 'Tuesday', name: 'Holi', type: 'Public' },
  { date: '2026-03-25', day: 'Wednesday', name: 'Good Friday', type: 'Public' },
  { date: '2026-04-02', day: 'Thursday', name: 'Ugadi / Gudi Padwa', type: 'Restricted' },
  { date: '2026-04-14', day: 'Tuesday', name: 'Ambedkar Jayanti', type: 'Public' },
  { date: '2026-05-01', day: 'Friday', name: 'May Day / Maharashtra Day', type: 'Public' },
  { date: '2026-05-25', day: 'Monday', name: 'Buddha Purnima', type: 'Restricted' },
  { date: '2026-06-21', day: 'Sunday', name: 'Id-ul-Fitr (Eid)', type: 'Public' },
  { date: '2026-07-06', day: 'Monday', name: 'Bakri Id (Eid ul-Adha)', type: 'Restricted' },
  { date: '2026-08-15', day: 'Saturday', name: 'Independence Day', type: 'Public' },
  { date: '2026-08-22', day: 'Saturday', name: 'Janmashtami', type: 'Restricted' },
  { date: '2026-09-10', day: 'Thursday', name: 'Muharram', type: 'Restricted' },
  { date: '2026-10-02', day: 'Friday', name: 'Gandhi Jayanti', type: 'Public' },
  { date: '2026-10-20', day: 'Tuesday', name: 'Dussehra (Vijay Dashami)', type: 'Public' },
  { date: '2026-11-08', day: 'Sunday', name: 'Diwali (Deepavali)', type: 'Public' },
  { date: '2026-12-25', day: 'Friday', name: 'Christmas', type: 'Public' },
];

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function HolidaysPage() {
  useAuthStore();
  const [selectedYear, setSelectedYear] = useState('2026');

  const holidays = holidays2026;
  const publicCount = holidays.filter(h => h.type === 'Public').length;
  const restrictedCount = holidays.filter(h => h.type === 'Restricted').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-green-50">
            <FiCalendar className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-thb-text-primary">Holiday Calendar</h1>
            <p className="text-sm text-thb-text-secondary">Company holidays for the year {selectedYear}</p>
          </div>
        </div>

        {/* Year Selector */}
        <div className="relative">
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            className="appearance-none bg-white border border-thb-border rounded-lg px-4 py-2 pr-8 text-sm font-medium text-thb-text-primary focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500"
          >
            <option value="2025">2025</option>
            <option value="2026">2026</option>
            <option value="2027">2027</option>
          </select>
          <FiChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-thb-text-muted pointer-events-none" />
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-green-500" />
          <span className="text-sm text-thb-text-secondary">Public Holiday ({publicCount})</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-amber-500" />
          <span className="text-sm text-thb-text-secondary">Restricted Holiday ({restrictedCount})</span>
        </div>
      </div>

      {/* Holiday Table */}
      <div className="thb-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-thb-border bg-slate-50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Date</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Day</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Holiday</th>
                <th className="text-center px-5 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Type</th>
              </tr>
            </thead>
            <tbody>
              {holidays.map((h, idx) => (
                <tr key={idx} className="border-b border-thb-border last:border-b-0 hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3 text-sm text-thb-text-primary font-medium">{formatDate(h.date)}</td>
                  <td className="px-5 py-3 text-sm text-thb-text-secondary">{h.day}</td>
                  <td className="px-5 py-3 text-sm text-thb-text-primary">{h.name}</td>
                  <td className="px-5 py-3 text-center">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${h.type === 'Public' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${h.type === 'Public' ? 'bg-green-500' : 'bg-amber-500'}`} />
                      {h.type}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 bg-slate-50 border-t border-thb-border">
          <p className="text-xs text-thb-text-muted">Total: {holidays.length} holidays — {publicCount} Public, {restrictedCount} Restricted</p>
        </div>
      </div>
    </div>
  );
}
