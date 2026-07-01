'use client';

import { useState, useMemo } from 'react';
import {
  FiCalendar,
  FiChevronLeft,
  FiChevronRight,
  FiPlus,
  FiClock,
  FiUsers,
  FiMapPin,
  FiX,
  FiSun,
  FiCoffee,
  FiGift,
  FiBookOpen,
  FiStar,
} from 'react-icons/fi';

/* ─────────── Types ─────────── */

type ViewMode = 'month' | 'week' | 'day';
type EventType = 'meeting' | 'leave' | 'holiday' | 'birthday' | 'training' | 'anniversary';

interface CalendarEvent {
  id: string;
  title: string;
  date: number; // day of month
  time: string;
  endTime: string;
  type: EventType;
  description?: string;
  location?: string;
  attendees?: string[];
}

/* ─────────── Sample Data ─────────── */

const EVENT_COLORS: Record<EventType, { bg: string; text: string; dot: string; bar: string; icon: typeof FiCalendar }> = {
  meeting:   { bg: 'bg-blue-50',    text: 'text-blue-700',    dot: 'bg-blue-500',    bar: 'bg-blue-500',    icon: FiUsers },
  leave:     { bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-500',   bar: 'bg-amber-500',   icon: FiCoffee },
  holiday:   { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', bar: 'bg-emerald-500', icon: FiSun },
  birthday:  { bg: 'bg-pink-50',    text: 'text-pink-700',    dot: 'bg-pink-500',    bar: 'bg-pink-500',    icon: FiGift },
  training:  { bg: 'bg-violet-50',  text: 'text-violet-700',  dot: 'bg-violet-500',  bar: 'bg-violet-500',  icon: FiBookOpen },
  anniversary: { bg: 'bg-rose-50',  text: 'text-rose-700',    dot: 'bg-rose-400',    bar: 'bg-rose-400',    icon: FiStar },
};

const today = new Date();
const currentYear = today.getFullYear();
const currentMonth = today.getMonth();
const currentDay = today.getDate();

const sampleEvents: CalendarEvent[] = [
  // Meetings
  { id: 'e1',  title: 'Daily Standup',              date: 1,  time: '09:00', endTime: '09:15', type: 'meeting',   description: 'Team sync-up',          location: 'Zoom',          attendees: ['Engineering Team'] },
  { id: 'e2',  title: 'Sprint Planning',            date: 3,  time: '10:00', endTime: '12:00', type: 'meeting',   description: 'Sprint 24 planning',    location: 'Conf Room A',   attendees: ['Product', 'Engineering'] },
  { id: 'e3',  title: '1:1 with Manager',           date: 5,  time: '14:00', endTime: '14:30', type: 'meeting',   description: 'Bi-weekly 1:1',         location: 'Manager Office',attendees: ['Rajesh Kumar'] },
  { id: 'e4',  title: 'Client Call - Acme Corp',    date: 7,  time: '11:00', endTime: '12:00', type: 'meeting',   description: 'Project status update', location: 'Google Meet',   attendees: ['Acme Team', 'PM Team'] },
  { id: 'e5',  title: 'Sprint Review',              date: 14, time: '16:00', endTime: '17:00', type: 'meeting',   description: 'Sprint 23 demo',        location: 'Conf Room B',   attendees: ['All Hands'] },
  { id: 'e6',  title: 'Design Review',              date: 10, time: '15:00', endTime: '16:00', type: 'meeting',   description: 'UI/UX review session',  location: 'Design Lab',    attendees: ['Design Team'] },
  { id: 'e7',  title: 'Retrospective',              date: 15, time: '15:00', endTime: '16:30', type: 'meeting',   description: 'Sprint 23 retro',       location: 'Conf Room A',   attendees: ['Engineering'] },
  { id: 'e8',  title: 'All Hands Meeting',          date: 20, time: '10:00', endTime: '11:00', type: 'meeting',   description: 'Monthly company update', location: 'Auditorium',    attendees: ['Everyone'] },
  { id: 'e9',  title: '1:1 with Report',            date: 22, time: '11:00', endTime: '11:30', type: 'meeting',   description: 'Weekly 1:1',            location: 'Zoom',          attendees: ['Priya Sharma'] },
  { id: 'e10', title: 'Team Lunch',                 date: 25, time: '12:30', endTime: '13:30', type: 'meeting',   description: 'Monthly team bonding',   location: 'The Pavilion',  attendees: ['Engineering Team'] },

  // Leaves
  { id: 'e11', title: 'Sick Leave - Ankit',         date: 4,  time: 'All Day', endTime: '',       type: 'leave',     description: 'Feeling unwell' },
  { id: 'e12', title: 'PTO - Sarah',                date: 8,  time: 'All Day', endTime: '',       type: 'leave',     description: 'Family vacation' },
  { id: 'e13', title: 'PTO - Sarah',                date: 9,  time: 'All Day', endTime: '',       type: 'leave',     description: 'Family vacation' },
  { id: 'e14', title: 'Casual Leave - Mike',        date: 18, time: 'All Day', endTime: '',       type: 'leave',     description: 'Personal work' },
  { id: 'e15', title: 'Half Day - Priya',           date: 26, time: '14:00',   endTime: '18:00',  type: 'leave',     description: 'Doctor appointment' },

  // Holidays
  { id: 'e16', title: 'Republic Day',               date: 26, time: 'All Day', endTime: '',       type: 'holiday',   description: 'National holiday' },
  { id: 'e17', title: 'Company Foundation Day',     date: 12, time: 'All Day', endTime: '',       type: 'holiday',   description: '3Boxes anniversary celebration' },

  // Birthdays
  { id: 'e18', title: "Birthday - Arjun Mehta",     date: 6,  time: 'All Day', endTime: '',       type: 'birthday',  description: '🎂 Happy Birthday!' },
  { id: 'e19', title: "Birthday - Lisa Chen",       date: 19, time: 'All Day', endTime: '',       type: 'birthday',  description: '🎂 Happy Birthday!' },
  { id: 'e20', title: "Birthday - David Park",      date: 28, time: 'All Day', endTime: '',       type: 'birthday',  description: '🎂 Happy Birthday!' },

  // Training
  { id: 'e21', title: 'AWS Certification Training', date: 11, time: '10:00', endTime: '13:00', type: 'training',  description: 'Cloud fundamentals',    location: 'Training Room 1', attendees: ['DevOps Team'] },
  { id: 'e22', title: 'Leadership Workshop',        date: 17, time: '09:00', endTime: '12:00', type: 'training',  description: 'Senior leadership',     location: 'Off-site',       attendees: ['Team Leads'] },
  { id: 'e23', title: 'Security Awareness',         date: 23, time: '14:00', endTime: '15:30', type: 'training',  description: 'Annual security training',location: 'Online',        attendees: ['Everyone'] },

  // Anniversaries
  { id: 'e24', title: 'Work Anniversary - Neha',    date: 13, time: 'All Day', endTime: '',       type: 'anniversary', description: '5 years at 3Boxes!' },
  { id: 'e25', title: 'Work Anniversary - Rohan',   date: 27, time: 'All Day', endTime: '',       type: 'anniversary', description: '3 years at 3Boxes!' },
];

/* ─────────── Helpers ─────────── */

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NAMES_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function isToday(year: number, month: number, day: number): boolean {
  return year === currentYear && month === currentMonth && day === currentDay;
}

/* ─────────── Component ─────────── */

export default function CalendarPage() {
  const [viewMonth, setViewMonth] = useState(currentMonth);
  const [viewYear, setViewYear] = useState(currentYear);
  const [selectedDate, setSelectedDate] = useState<number | null>(currentDay);
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [showNewEventModal, setShowNewEventModal] = useState(false);
  const [newEvent, setNewEvent] = useState({
    title: '',
    date: '',
    time: '09:00',
    endTime: '10:00',
    type: 'meeting' as EventType,
    description: '',
    location: '',
  });

  /* Derived data */
  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth);
  const prevMonthDays = getDaysInMonth(viewYear, viewMonth - 1);

  const eventsForMonth = useMemo(() => {
    return sampleEvents.filter((e) => e.date <= daysInMonth);
  }, [daysInMonth]);

  const eventsForSelectedDate = useMemo(() => {
    if (selectedDate === null) return [];
    return sampleEvents.filter((e) => e.date === selectedDate);
  }, [selectedDate]);

  const eventsMap = useMemo(() => {
    const map: Record<number, CalendarEvent[]> = {};
    eventsForMonth.forEach((e) => {
      if (!map[e.date]) map[e.date] = [];
      map[e.date].push(e);
    });
    return map;
  }, [eventsForMonth]);

  /* Stats */
  const upcomingEvents = sampleEvents.filter((e) => e.date >= currentDay && e.type !== 'leave').length;
  const meetingsToday = sampleEvents.filter((e) => e.date === currentDay && e.type === 'meeting').length;
  const leavesToday = sampleEvents.filter((e) => e.date === currentDay && e.type === 'leave').length;
  const holidaysThisMonth = sampleEvents.filter((e) => e.type === 'holiday').length;

  /* Navigation */
  const goToPrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
    setSelectedDate(null);
  };

  const goToNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
    setSelectedDate(null);
  };

  const goToToday = () => {
    setViewMonth(currentMonth);
    setViewYear(currentYear);
    setSelectedDate(currentDay);
  };

  /* Calendar grid cells */
  const calendarCells: { day: number; isCurrentMonth: boolean; monthOffset: number }[] = [];
  // Previous month trailing days
  for (let i = firstDay - 1; i >= 0; i--) {
    calendarCells.push({ day: prevMonthDays - i, isCurrentMonth: false, monthOffset: -1 });
  }
  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    calendarCells.push({ day: d, isCurrentMonth: true, monthOffset: 0 });
  }
  // Next month leading days
  const remaining = 42 - calendarCells.length;
  for (let d = 1; d <= remaining; d++) {
    calendarCells.push({ day: d, isCurrentMonth: false, monthOffset: 1 });
  }

  /* Week view data */
  const weekDays = useMemo(() => {
    const startOfWeek = new Date(viewYear, viewMonth, selectedDate || currentDay);
    const day = startOfWeek.getDay();
    const diff = startOfWeek.getDate() - day;
    const monday = new Date(startOfWeek.setDate(diff));
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return { date: d.getDate(), dayName: DAY_NAMES[i], fullDate: d };
    });
  }, [viewYear, viewMonth, selectedDate]);

  /* Day view hours */
  const hours = Array.from({ length: 12 }, (_, i) => i + 7); // 7 AM to 6 PM

  const selectedDateFormatted = selectedDate
    ? `${DAY_NAMES_FULL[new Date(viewYear, viewMonth, selectedDate).getDay()]}, ${MONTH_NAMES[viewMonth]} ${selectedDate}, ${viewYear}`
    : '';

  /* ──── Render ──── */

  return (
    <div className="space-y-6">
      {/* ═══════ Header ═══════ */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-sm">
              <FiCalendar className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-thb-text-primary">Calendar</h1>
              <p className="text-sm text-thb-text-secondary mt-0.5">
                Manage events, meetings & schedules
              </p>
            </div>
          </div>
        </div>
        <button
          onClick={() => setShowNewEventModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
        >
          <FiPlus className="w-4 h-4" />
          New Event
        </button>
      </div>

      {/* ═══════ Stats Row ═══════ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={<FiCalendar className="w-5 h-5" />} label="Upcoming Events" value={upcomingEvents} color="blue" />
        <StatCard icon={<FiUsers className="w-5 h-5" />} label="Meetings Today" value={meetingsToday} color="violet" />
        <StatCard icon={<FiCoffee className="w-5 h-5" />} label="Leaves Today" value={leavesToday} color="amber" />
        <StatCard icon={<FiSun className="w-5 h-5" />} label="Holidays This Month" value={holidaysThisMonth} color="emerald" />
      </div>

      {/* ═══════ Main Content ═══════ */}
      <div className="flex flex-col xl:flex-row gap-6">
        {/* ──── Calendar Section ──── */}
        <div className="flex-1 thb-card p-0 overflow-hidden">
          {/* Calendar Header Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 border-b border-thb-border">
            {/* Navigation */}
            <div className="flex items-center gap-2">
              <button
                onClick={goToPrevMonth}
                className="p-2 rounded-lg hover:bg-slate-100 text-thb-text-secondary hover:text-thb-text-primary transition-colors"
                aria-label="Previous month"
              >
                <FiChevronLeft className="w-5 h-5" />
              </button>
              <h2 className="text-base font-bold text-thb-text-primary min-w-[180px] text-center">
                {MONTH_NAMES[viewMonth]} {viewYear}
              </h2>
              <button
                onClick={goToNextMonth}
                className="p-2 rounded-lg hover:bg-slate-100 text-thb-text-secondary hover:text-thb-text-primary transition-colors"
                aria-label="Next month"
              >
                <FiChevronRight className="w-5 h-5" />
              </button>
              <button
                onClick={goToToday}
                className="ml-2 px-3 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
              >
                Today
              </button>
            </div>

            {/* View Toggle */}
            <div className="inline-flex rounded-lg border border-thb-border p-0.5 bg-slate-50 self-start sm:self-auto">
              {(['month', 'week', 'day'] as ViewMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`px-4 py-1.5 text-xs font-semibold rounded-md capitalize transition-all ${
                    viewMode === mode
                      ? 'bg-white text-thb-text-primary shadow-sm border border-slate-200'
                      : 'text-thb-text-muted hover:text-thb-text-secondary'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          {/* ── Month View ── */}
          {viewMode === 'month' && (
            <div>
              {/* Day Headers */}
              <div className="grid grid-cols-7 border-b border-thb-border">
                {DAY_NAMES.map((name) => (
                  <div
                    key={name}
                    className="py-2.5 text-center text-xs font-semibold text-thb-text-muted uppercase tracking-wider"
                  >
                    {name}
                  </div>
                ))}
              </div>

              {/* Calendar Grid */}
              <div className="grid grid-cols-7">
                {calendarCells.map((cell, idx) => {
                  const cellEvents = cell.isCurrentMonth ? (eventsMap[cell.day] || []) : [];
                  const isTodayCell = cell.isCurrentMonth && isToday(viewYear, viewMonth, cell.day);
                  const isSelected = cell.isCurrentMonth && cell.day === selectedDate;

                  return (
                    <button
                      key={idx}
                      onClick={() => cell.isCurrentMonth && setSelectedDate(cell.day)}
                      className={`relative min-h-[80px] lg:min-h-[100px] p-1.5 lg:p-2 border-b border-r border-thb-border text-left transition-colors ${
                        cell.isCurrentMonth
                          ? 'bg-white hover:bg-slate-50 cursor-pointer'
                          : 'bg-slate-50/50 cursor-default'
                      } ${isSelected ? 'ring-2 ring-inset ring-blue-500 bg-blue-50/30' : ''}`}
                    >
                      <span
                        className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-medium ${
                          isTodayCell
                            ? 'bg-blue-600 text-white font-bold'
                            : cell.isCurrentMonth
                            ? 'text-thb-text-primary'
                            : 'text-thb-text-muted'
                        } ${isSelected && !isTodayCell ? 'bg-blue-100 text-blue-700' : ''}`}
                      >
                        {cell.day}
                      </span>

                      {/* Event indicators */}
                      {cellEvents.length > 0 && (
                        <div className="mt-1 space-y-0.5">
                          {cellEvents.slice(0, 3).map((ev) => (
                            <div
                              key={ev.id}
                              className={`hidden lg:flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium truncate ${EVENT_COLORS[ev.type].bg} ${EVENT_COLORS[ev.type].text}`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${EVENT_COLORS[ev.type].dot}`} />
                              <span className="truncate">{ev.title}</span>
                            </div>
                          ))}
                          {/* Mobile: show dots only */}
                          <div className="flex lg:hidden gap-0.5 mt-1">
                            {cellEvents.slice(0, 4).map((ev) => (
                              <span
                                key={ev.id}
                                className={`w-1.5 h-1.5 rounded-full ${EVENT_COLORS[ev.type].dot}`}
                              />
                            ))}
                            {cellEvents.length > 4 && (
                              <span className="text-[8px] text-thb-text-muted font-semibold">
                                +{cellEvents.length - 4}
                              </span>
                            )}
                          </div>
                          {cellEvents.length > 3 && (
                            <span className="hidden lg:block text-[10px] text-thb-text-muted font-medium pl-1.5">
                              +{cellEvents.length - 3} more
                            </span>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Week View ── */}
          {viewMode === 'week' && (
            <div>
              <div className="grid grid-cols-7 border-b border-thb-border">
                {weekDays.map((wd) => {
                  const wdEvents = eventsMap[wd.date] || [];
                  const isTodayCell = isToday(viewYear, viewMonth, wd.date);
                  return (
                    <div
                      key={wd.dayName}
                      className={`py-3 text-center border-r border-thb-border last:border-r-0 ${
                        isTodayCell ? 'bg-blue-50/50' : ''
                      }`}
                    >
                      <div className="text-xs font-semibold text-thb-text-muted uppercase">{wd.dayName}</div>
                      <div
                        className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold mt-1 ${
                          isTodayCell ? 'bg-blue-600 text-white' : 'text-thb-text-primary'
                        }`}
                      >
                        {wd.date}
                      </div>
                      {wdEvents.length > 0 && (
                        <div className="flex justify-center gap-0.5 mt-1.5">
                          {wdEvents.slice(0, 4).map((ev) => (
                            <span key={ev.id} className={`w-1.5 h-1.5 rounded-full ${EVENT_COLORS[ev.type].dot}`} />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {/* Week timeline */}
              <div className="max-h-[400px] overflow-y-auto">
                {hours.map((hour) => (
                  <div key={hour} className="flex border-b border-thb-border">
                    <div className="w-16 flex-shrink-0 py-2 text-right pr-3 text-xs text-thb-text-muted font-medium">
                      {hour > 12 ? hour - 12 : hour}:00 {hour >= 12 ? 'PM' : 'AM'}
                    </div>
                    <div className="flex-1 grid grid-cols-7 border-l border-thb-border">
                      {weekDays.map((wd) => {
                        const hourEvents = (eventsMap[wd.date] || []).filter((ev) => {
                          if (ev.time === 'All Day') return hour === 7;
                          const h = parseInt(ev.time.split(':')[0], 10);
                          return h === hour;
                        });
                        return (
                          <div
                            key={wd.dayName}
                            className="min-h-[40px] border-r border-thb-border last:border-r-0 py-1 px-1 relative"
                          >
                            {hourEvents.map((ev) => (
                              <div
                                key={ev.id}
                                className={`text-[9px] font-medium px-1 py-0.5 rounded truncate ${EVENT_COLORS[ev.type].bg} ${EVENT_COLORS[ev.type].text}`}
                              >
                                {ev.title}
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Day View ── */}
          {viewMode === 'day' && selectedDate !== null && (
            <div>
              <div className="px-4 py-3 bg-slate-50 border-b border-thb-border">
                <h3 className="text-sm font-bold text-thb-text-primary">{selectedDateFormatted}</h3>
              </div>
              <div className="max-h-[440px] overflow-y-auto">
                {/* All day events */}
                {eventsForSelectedDate.filter((e) => e.time === 'All Day').length > 0 && (
                  <div className="flex border-b border-thb-border">
                    <div className="w-20 flex-shrink-0 py-2 text-right pr-3 text-xs text-thb-text-muted font-medium">
                      All Day
                    </div>
                    <div className="flex-1 py-2 px-3 border-l border-thb-border space-y-1">
                      {eventsForSelectedDate
                        .filter((e) => e.time === 'All Day')
                        .map((ev) => (
                          <div
                            key={ev.id}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg ${EVENT_COLORS[ev.type].bg}`}
                          >
                            <span className={`w-2 h-2 rounded-full ${EVENT_COLORS[ev.type].dot}`} />
                            <span className={`text-sm font-medium ${EVENT_COLORS[ev.type].text}`}>
                              {ev.title}
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
                {/* Hourly slots */}
                {hours.map((hour) => {
                  const hourEvents = eventsForSelectedDate.filter((ev) => {
                    if (ev.time === 'All Day') return false;
                    const h = parseInt(ev.time.split(':')[0], 10);
                    return h === hour;
                  });
                  return (
                    <div key={hour} className="flex border-b border-thb-border hover:bg-slate-50/50 transition-colors">
                      <div className="w-20 flex-shrink-0 py-3 text-right pr-3 text-xs text-thb-text-muted font-medium">
                        {hour > 12 ? hour - 12 : hour}:00 {hour >= 12 ? 'PM' : 'AM'}
                      </div>
                      <div className="flex-1 py-2 px-3 border-l border-thb-border space-y-1 min-h-[48px]">
                        {hourEvents.map((ev) => (
                          <div
                            key={ev.id}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg border-l-3 ${EVENT_COLORS[ev.type].bg}`}
                            style={{ borderLeftWidth: 3, borderLeftColor: EVENT_COLORS[ev.type].dot.replace('bg-', '') }}
                          >
                            <div>
                              <div className={`text-sm font-semibold ${EVENT_COLORS[ev.type].text}`}>
                                {ev.title}
                              </div>
                              <div className="text-[11px] text-thb-text-secondary mt-0.5">
                                {ev.time} – {ev.endTime} {ev.location && `· ${ev.location}`}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Day view with no date selected */}
          {viewMode === 'day' && selectedDate === null && (
            <div className="py-20 text-center">
              <FiCalendar className="w-10 h-10 text-thb-text-muted mx-auto mb-3" />
              <p className="text-sm text-thb-text-secondary">Select a date to view day schedule</p>
            </div>
          )}
        </div>

        {/* ──── Side Panel ──── */}
        <div className="w-full xl:w-[340px] flex-shrink-0 space-y-4">
          {/* Selected Date Info */}
          <div className="thb-card p-4">
            {selectedDate !== null ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-thb-text-primary">
                    {DAY_NAMES_FULL[new Date(viewYear, viewMonth, selectedDate).getDay()]}
                  </h3>
                  <span className="text-xs font-semibold text-thb-text-muted">
                    {MONTH_NAMES[viewMonth]} {selectedDate}, {viewYear}
                  </span>
                </div>

                {eventsForSelectedDate.length === 0 ? (
                  <div className="py-8 text-center">
                    <FiCalendar className="w-8 h-8 text-thb-text-muted mx-auto mb-2" />
                    <p className="text-sm text-thb-text-secondary">No events scheduled</p>
                    <button
                      onClick={() => setShowNewEventModal(true)}
                      className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                    >
                      <FiPlus className="w-3 h-3" />
                      Add Event
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                    {eventsForSelectedDate.map((ev) => {
                      const colors = EVENT_COLORS[ev.type];
                      const Icon = colors.icon;
                      return (
                        <div
                          key={ev.id}
                          className={`rounded-xl p-3.5 border ${colors.bg} border-opacity-50`}
                          style={{ borderColor: 'var(--thb-border)' }}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${colors.dot} bg-opacity-15`}>
                              <Icon className={`w-4 h-4 text-white`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="text-sm font-semibold text-thb-text-primary truncate">
                                {ev.title}
                              </h4>
                              <div className="flex items-center gap-1.5 mt-1">
                                <FiClock className="w-3 h-3 text-thb-text-muted flex-shrink-0" />
                                <span className="text-xs text-thb-text-secondary">
                                  {ev.time === 'All Day' ? 'All Day' : `${ev.time} – ${ev.endTime}`}
                                </span>
                              </div>
                              {ev.location && (
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <FiMapPin className="w-3 h-3 text-thb-text-muted flex-shrink-0" />
                                  <span className="text-xs text-thb-text-secondary">{ev.location}</span>
                                </div>
                              )}
                              {ev.description && (
                                <p className="text-xs text-thb-text-muted mt-1.5 line-clamp-2">
                                  {ev.description}
                                </p>
                              )}
                              {ev.attendees && ev.attendees.length > 0 && (
                                <div className="flex items-center gap-1.5 mt-1.5">
                                  <FiUsers className="w-3 h-3 text-thb-text-muted flex-shrink-0" />
                                  <span className="text-xs text-thb-text-secondary truncate">
                                    {ev.attendees.join(', ')}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="mt-2 ml-12">
                            <span className={`inline-flex items-center gap-1 thb-badge ${colors.bg} ${colors.text}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
                              {ev.type.charAt(0).toUpperCase() + ev.type.slice(1)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <div className="py-8 text-center">
                <FiCalendar className="w-8 h-8 text-thb-text-muted mx-auto mb-2" />
                <p className="text-sm text-thb-text-secondary">Select a date to view events</p>
              </div>
            )}
          </div>

          {/* Event Type Legend */}
          <div className="thb-card p-4">
            <h3 className="text-sm font-bold text-thb-text-primary mb-3">Event Types</h3>
            <div className="space-y-2.5">
              {(Object.entries(EVENT_COLORS) as [EventType, typeof EVENT_COLORS[EventType]][]).map(([type, colors]) => {
                const Icon = colors.icon;
                return (
                  <div key={type} className="flex items-center gap-2.5">
                    <span className={`w-3 h-3 rounded-full ${colors.dot}`} />
                    <Icon className="w-3.5 h-3.5 text-thb-text-muted" />
                    <span className="text-xs font-medium text-thb-text-secondary capitalize">{type}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick Stats */}
          <div className="thb-card p-4">
            <h3 className="text-sm font-bold text-thb-text-primary mb-3">This Month</h3>
            <div className="space-y-3">
              {([
                { label: 'Meetings', count: eventsForMonth.filter((e) => e.type === 'meeting').length, color: 'bg-blue-500' },
                { label: 'Leaves', count: eventsForMonth.filter((e) => e.type === 'leave').length, color: 'bg-amber-500' },
                { label: 'Holidays', count: eventsForMonth.filter((e) => e.type === 'holiday').length, color: 'bg-emerald-500' },
                { label: 'Birthdays', count: eventsForMonth.filter((e) => e.type === 'birthday').length, color: 'bg-pink-500' },
                { label: 'Training', count: eventsForMonth.filter((e) => e.type === 'training').length, color: 'bg-violet-500' },
                { label: 'Anniversaries', count: eventsForMonth.filter((e) => e.type === 'anniversary').length, color: 'bg-rose-400' },
              ]).map((item) => (
                <div key={item.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${item.color}`} />
                    <span className="text-xs font-medium text-thb-text-secondary">{item.label}</span>
                  </div>
                  <span className="text-xs font-bold text-thb-text-primary">{item.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ═══════ New Event Modal ═══════ */}
      {showNewEventModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowNewEventModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg animate-slide-in-up overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-thb-border">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center">
                  <FiPlus className="w-4 h-4 text-white" />
                </div>
                <h2 className="text-base font-bold text-thb-text-primary">Create New Event</h2>
              </div>
              <button
                onClick={() => setShowNewEventModal(false)}
                className="p-2 rounded-lg hover:bg-slate-100 text-thb-text-muted transition-colors"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Title */}
              <div>
                <label className="block text-xs font-semibold text-thb-text-secondary mb-1.5">
                  Event Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newEvent.title}
                  onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                  placeholder="Enter event title"
                  className="w-full px-3 py-2.5 border border-thb-border rounded-lg text-sm text-thb-text-primary placeholder:text-thb-text-muted focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
                />
              </div>

              {/* Date */}
              <div>
                <label className="block text-xs font-semibold text-thb-text-secondary mb-1.5">
                  Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={newEvent.date}
                  onChange={(e) => setNewEvent({ ...newEvent, date: e.target.value })}
                  className="w-full px-3 py-2.5 border border-thb-border rounded-lg text-sm text-thb-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
                />
              </div>

              {/* Time Row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-thb-text-secondary mb-1.5">Start Time</label>
                  <input
                    type="time"
                    value={newEvent.time}
                    onChange={(e) => setNewEvent({ ...newEvent, time: e.target.value })}
                    className="w-full px-3 py-2.5 border border-thb-border rounded-lg text-sm text-thb-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-thb-text-secondary mb-1.5">End Time</label>
                  <input
                    type="time"
                    value={newEvent.endTime}
                    onChange={(e) => setNewEvent({ ...newEvent, endTime: e.target.value })}
                    className="w-full px-3 py-2.5 border border-thb-border rounded-lg text-sm text-thb-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
                  />
                </div>
              </div>

              {/* Event Type */}
              <div>
                <label className="block text-xs font-semibold text-thb-text-secondary mb-1.5">Event Type</label>
                <div className="flex flex-wrap gap-2">
                  {(['meeting', 'leave', 'holiday', 'birthday', 'training', 'anniversary'] as EventType[]).map((type) => {
                    const colors = EVENT_COLORS[type];
                    const isSelected = newEvent.type === type;
                    return (
                      <button
                        key={type}
                        onClick={() => setNewEvent({ ...newEvent, type })}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${
                          isSelected
                            ? `${colors.bg} ${colors.text} ring-2 ring-offset-1 ${colors.dot.replace('bg-', 'ring-')}`
                            : 'bg-slate-50 text-thb-text-muted hover:bg-slate-100'
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full ${colors.dot}`} />
                        {type}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Location */}
              <div>
                <label className="block text-xs font-semibold text-thb-text-secondary mb-1.5">Location</label>
                <div className="relative">
                  <FiMapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-thb-text-muted" />
                  <input
                    type="text"
                    value={newEvent.location}
                    onChange={(e) => setNewEvent({ ...newEvent, location: e.target.value })}
                    placeholder="Add location"
                    className="w-full pl-10 pr-3 py-2.5 border border-thb-border rounded-lg text-sm text-thb-text-primary placeholder:text-thb-text-muted focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-thb-text-secondary mb-1.5">Description</label>
                <textarea
                  value={newEvent.description}
                  onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                  placeholder="Add event description..."
                  rows={3}
                  className="w-full px-3 py-2.5 border border-thb-border rounded-lg text-sm text-thb-text-primary placeholder:text-thb-text-muted focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors resize-none"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-thb-border bg-slate-50/50">
              <button
                onClick={() => setShowNewEventModal(false)}
                className="px-4 py-2.5 text-sm font-semibold text-thb-text-secondary hover:text-thb-text-primary hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  // In real app, this would save the event
                  setShowNewEventModal(false);
                  setNewEvent({ title: '', date: '', time: '09:00', endTime: '10:00', type: 'meeting', description: '', location: '' });
                }}
                className="px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
              >
                Create Event
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────── Stat Card ─────────── */

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: 'blue' | 'violet' | 'amber' | 'emerald';
}) {
  const colorMap = {
    blue:    { bg: 'bg-blue-50',    iconBg: 'bg-blue-100',    iconText: 'text-blue-600',    valueText: 'text-blue-700' },
    violet:  { bg: 'bg-violet-50',  iconBg: 'bg-violet-100',  iconText: 'text-violet-600',  valueText: 'text-violet-700' },
    amber:   { bg: 'bg-amber-50',   iconBg: 'bg-amber-100',   iconText: 'text-amber-600',   valueText: 'text-amber-700' },
    emerald: { bg: 'bg-emerald-50', iconBg: 'bg-emerald-100', iconText: 'text-emerald-600', valueText: 'text-emerald-700' },
  };

  const c = colorMap[color];

  return (
    <div className={`thb-card thb-card-hover p-4 ${c.bg}`}>
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl ${c.iconBg} flex items-center justify-center`}>
          <span className={c.iconText}>{icon}</span>
        </div>
        <div>
          <div className={`text-2xl font-bold ${c.valueText}`}>{value}</div>
          <div className="text-xs font-medium text-thb-text-secondary mt-0.5">{label}</div>
        </div>
      </div>
    </div>
  );
}
