'use client';

import { useState, useMemo } from 'react';
import {
  FiVideo, FiPhone, FiPlus, FiClock, FiLock, FiExternalLink,
  FiMic, FiSearch, FiMoreVertical, FiCalendar, FiArrowUpRight,
  FiArrowDownLeft, FiMissedCall, FiPhoneCall, FiPhoneOff, FiTrash2,
  FiX, FiUser, FiCheck,
} from 'react-icons/fi';

/* ── Types ── */
interface CallRecord {
  id: string;
  callType: 'audio' | 'video';
  direction: 'incoming' | 'outgoing';
  status: 'completed' | 'missed' | 'declined';
  contactId: string;
  contactName: string;
  contactRole: string;
  duration: string;
  dateTime: string;
  isE2EE: boolean;
  isRecorded: boolean;
  provider: string;
}

interface FrequentContact {
  id: string;
  name: string;
  role: string;
  callCount: number;
  online: boolean;
}

/* ── Sample Data ── */
const FREQUENT_CONTACTS: FrequentContact[] = [
  { id: 'fc1', name: 'Priya Sharma', role: 'HR Manager', callCount: 24, online: true },
  { id: 'fc2', name: 'Rahul Verma', role: 'Engineering Lead', callCount: 18, online: true },
  { id: 'fc3', name: 'Karthik Nair', role: 'Finance Manager', callCount: 15, online: false },
  { id: 'fc4', name: 'Ananya Iyer', role: 'Recruiter', callCount: 12, online: true },
  { id: 'fc5', name: 'Vikram Singh', role: 'CTO', callCount: 10, online: true },
  { id: 'fc6', name: 'Deepa Patel', role: 'People Ops', callCount: 9, online: false },
  { id: 'fc7', name: 'Sunita Joshi', role: 'Training Manager', callCount: 8, online: true },
  { id: 'fc8', name: 'Ravi Kumar', role: 'Product Manager', callCount: 7, online: false },
];

const CALL_HISTORY: CallRecord[] = [
  { id: 'call1', callType: 'video', direction: 'outgoing', status: 'completed', contactId: 'fc1', contactName: 'Priya Sharma', contactRole: 'HR Manager', duration: '32m 15s', dateTime: 'Today, 10:00 AM', isE2EE: true, isRecorded: true, provider: 'Native WebRTC' },
  { id: 'call2', callType: 'audio', direction: 'incoming', status: 'completed', contactId: 'fc2', contactName: 'Rahul Verma', contactRole: 'Engineering Lead', duration: '18m 42s', dateTime: 'Today, 9:30 AM', isE2EE: true, isRecorded: false, provider: 'Native WebRTC' },
  { id: 'call3', callType: 'video', direction: 'incoming', status: 'missed', contactId: 'fc4', contactName: 'Ananya Iyer', contactRole: 'Recruiter', duration: '—', dateTime: 'Today, 9:15 AM', isE2EE: false, isRecorded: false, provider: 'Zoom' },
  { id: 'call4', callType: 'audio', direction: 'outgoing', status: 'completed', contactId: 'fc3', contactName: 'Karthik Nair', contactRole: 'Finance Manager', duration: '8m 55s', dateTime: 'Today, 8:45 AM', isE2EE: true, isRecorded: false, provider: 'Native WebRTC' },
  { id: 'call5', callType: 'video', direction: 'outgoing', status: 'completed', contactId: 'fc5', contactName: 'Vikram Singh', contactRole: 'CTO', duration: '45m 10s', dateTime: 'Yesterday, 4:00 PM', isE2EE: false, isRecorded: true, provider: 'Zoom' },
  { id: 'call6', callType: 'audio', direction: 'incoming', status: 'declined', contactId: 'fc6', contactName: 'Deepa Patel', contactRole: 'People Ops', duration: '—', dateTime: 'Yesterday, 3:30 PM', isE2EE: true, isRecorded: false, provider: 'Native WebRTC' },
  { id: 'call7', callType: 'video', direction: 'incoming', status: 'completed', contactId: 'fc1', contactName: 'Priya Sharma', contactRole: 'HR Manager', duration: '22m 30s', dateTime: 'Yesterday, 2:00 PM', isE2EE: true, isRecorded: true, provider: 'Native WebRTC' },
  { id: 'call8', callType: 'audio', direction: 'outgoing', status: 'completed', contactId: 'fc7', contactName: 'Sunita Joshi', contactRole: 'Training Manager', duration: '12m 18s', dateTime: 'Yesterday, 11:00 AM', isE2EE: true, isRecorded: false, provider: 'Native WebRTC' },
  { id: 'call9', callType: 'video', direction: 'outgoing', status: 'missed', contactId: 'fc2', contactName: 'Rahul Verma', contactRole: 'Engineering Lead', duration: '—', dateTime: 'Yesterday, 10:30 AM', isE2EE: false, isRecorded: false, provider: 'Teams' },
  { id: 'call10', callType: 'audio', direction: 'incoming', status: 'completed', contactId: 'fc8', contactName: 'Ravi Kumar', contactRole: 'Product Manager', duration: '5m 42s', dateTime: 'Jun 28, 5:00 PM', isE2EE: true, isRecorded: false, provider: 'Native WebRTC' },
  { id: 'call11', callType: 'video', direction: 'outgoing', status: 'completed', contactId: 'fc4', contactName: 'Ananya Iyer', contactRole: 'Recruiter', duration: '35m 20s', dateTime: 'Jun 28, 3:00 PM', isE2EE: false, isRecorded: true, provider: 'Zoom' },
  { id: 'call12', callType: 'audio', direction: 'incoming', status: 'completed', contactId: 'fc3', contactName: 'Karthik Nair', contactRole: 'Finance Manager', duration: '20m 15s', dateTime: 'Jun 28, 11:30 AM', isE2EE: true, isRecorded: false, provider: 'Native WebRTC' },
  { id: 'call13', callType: 'video', direction: 'incoming', status: 'missed', contactId: 'fc5', contactName: 'Vikram Singh', contactRole: 'CTO', duration: '—', dateTime: 'Jun 27, 4:30 PM', isE2EE: false, isRecorded: false, provider: 'Teams' },
  { id: 'call14', callType: 'audio', direction: 'outgoing', status: 'completed', contactId: 'fc1', contactName: 'Priya Sharma', contactRole: 'HR Manager', duration: '15m 30s', dateTime: 'Jun 27, 2:00 PM', isE2EE: true, isRecorded: false, provider: 'Native WebRTC' },
  { id: 'call15', callType: 'video', direction: 'outgoing', status: 'completed', contactId: 'fc7', contactName: 'Sunita Joshi', contactRole: 'Training Manager', duration: '28m 45s', dateTime: 'Jun 27, 10:00 AM', isE2EE: false, isRecorded: true, provider: 'Zoom' },
  { id: 'call16', callType: 'audio', direction: 'incoming', status: 'declined', contactId: 'fc6', contactName: 'Deepa Patel', contactRole: 'People Ops', duration: '—', dateTime: 'Jun 26, 3:15 PM', isE2EE: true, isRecorded: false, provider: 'Native WebRTC' },
  { id: 'call17', callType: 'video', direction: 'outgoing', status: 'completed', contactId: 'fc8', contactName: 'Ravi Kumar', contactRole: 'Product Manager', duration: '40m 10s', dateTime: 'Jun 26, 11:00 AM', isE2EE: false, isRecorded: true, provider: 'Zoom' },
  { id: 'call18', callType: 'audio', direction: 'incoming', status: 'completed', contactId: 'fc2', contactName: 'Rahul Verma', contactRole: 'Engineering Lead', duration: '7m 22s', dateTime: 'Jun 25, 4:00 PM', isE2EE: true, isRecorded: false, provider: 'Native WebRTC' },
  { id: 'call19', callType: 'video', direction: 'outgoing', status: 'missed', contactId: 'fc4', contactName: 'Ananya Iyer', contactRole: 'Recruiter', duration: '—', dateTime: 'Jun 25, 10:30 AM', isE2EE: false, isRecorded: false, provider: 'Teams' },
  { id: 'call20', callType: 'audio', direction: 'incoming', status: 'completed', contactId: 'fc5', contactName: 'Vikram Singh', contactRole: 'CTO', duration: '3m 55s', dateTime: 'Jun 24, 5:30 PM', isE2EE: true, isRecorded: false, provider: 'Native WebRTC' },
];

/* ── Helpers ── */
function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function getAvatarColor(id: string) {
  const colors = [
    'from-blue-500 to-indigo-600', 'from-violet-500 to-purple-600',
    'from-emerald-500 to-teal-600', 'from-amber-500 to-orange-600',
    'from-rose-500 to-pink-600', 'from-cyan-500 to-blue-600',
  ];
  const idx = Math.abs(id.charCodeAt(0) + (id.charCodeAt(1) || 0)) % colors.length;
  return colors[idx];
}

export default function SmartCallsPage() {
  const [activeTab, setActiveTab] = useState<'all' | 'missed' | 'incoming' | 'outgoing'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showStartCallModal, setShowStartCallModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [callType, setCallType] = useState<'audio' | 'video'>('video');

  const filteredCalls = useMemo(() => {
    let list = CALL_HISTORY;
    if (activeTab !== 'all') {
      list = list.filter(c => {
        if (activeTab === 'missed') return c.status === 'missed';
        return c.direction === activeTab;
      });
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(c => c.contactName.toLowerCase().includes(q));
    }
    return list;
  }, [activeTab, searchQuery]);

  const totalCalls = CALL_HISTORY.length;
  const audioCalls = CALL_HISTORY.filter(c => c.callType === 'audio').length;
  const videoCalls = CALL_HISTORY.filter(c => c.callType === 'video').length;
  const missedCalls = CALL_HISTORY.filter(c => c.status === 'missed').length;
  const activeCalls = 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
            <FiVideo className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-thb-text-primary">Calls</h1>
            <p className="text-xs text-thb-text-secondary">Audio & video calls with E2EE encryption and AI transcription</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowScheduleModal(true)}
            className="inline-flex items-center gap-2 px-3 py-2 border border-thb-border text-thb-text-secondary rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
          >
            <FiCalendar className="w-4 h-4" />
            Schedule
          </button>
          <button
            onClick={() => setShowStartCallModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 transition-colors shadow-sm"
          >
            <FiPlus className="w-4 h-4" />
            Start Call
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="thb-card p-3">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center">
              <FiPhoneCall className="w-3.5 h-3.5 text-slate-600" />
            </div>
            <span className="text-xs text-thb-text-muted">Total Calls</span>
          </div>
          <p className="text-xl font-bold text-thb-text-primary">{totalCalls}</p>
        </div>
        <div className="thb-card p-3">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
              <FiPhone className="w-3.5 h-3.5 text-blue-600" />
            </div>
            <span className="text-xs text-thb-text-muted">Audio</span>
          </div>
          <p className="text-xl font-bold text-blue-600">{audioCalls}</p>
        </div>
        <div className="thb-card p-3">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg bg-violet-50 flex items-center justify-center">
              <FiVideo className="w-3.5 h-3.5 text-violet-600" />
            </div>
            <span className="text-xs text-thb-text-muted">Video</span>
          </div>
          <p className="text-xl font-bold text-violet-600">{videoCalls}</p>
        </div>
        <div className="thb-card p-3">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center">
              <FiPhoneOff className="w-3.5 h-3.5 text-red-600" />
            </div>
            <span className="text-xs text-thb-text-muted">Missed</span>
          </div>
          <p className="text-xl font-bold text-red-600">{missedCalls}</p>
        </div>
        <div className="thb-card p-3">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center">
              <FiClock className="w-3.5 h-3.5 text-emerald-600" />
            </div>
            <span className="text-xs text-thb-text-muted">Avg Duration</span>
          </div>
          <p className="text-xl font-bold text-emerald-600">18m</p>
        </div>
      </div>

      {/* Quick Dial */}
      <div className="thb-card p-4">
        <h3 className="text-sm font-semibold text-thb-text-primary mb-3">Quick Dial</h3>
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
          {FREQUENT_CONTACTS.map(contact => (
            <div key={contact.id} className="flex flex-col items-center gap-1.5 group cursor-pointer">
              <div className="relative">
                <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${getAvatarColor(contact.id)} flex items-center justify-center group-hover:scale-105 transition-transform`}>
                  <span className="text-sm font-bold text-white">{getInitials(contact.name)}</span>
                </div>
                {contact.online && (
                  <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 rounded-full ring-2 ring-white" />
                )}
              </div>
              <p className="text-[10px] font-medium text-thb-text-primary text-center truncate w-full">{contact.name.split(' ')[0]}</p>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button className="p-1 text-blue-600 hover:bg-blue-50 rounded" title="Audio call">
                  <FiPhone className="w-3 h-3" />
                </button>
                <button className="p-1 text-violet-600 hover:bg-violet-50 rounded" title="Video call">
                  <FiVideo className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Call History */}
      <div className="thb-card overflow-hidden">
        <div className="p-4 border-b border-thb-border">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-thb-text-primary">Call History</h2>
            <div className="relative">
              <FiSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-thb-text-muted" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search calls..."
                className="pl-8 pr-3 py-1.5 rounded-lg border border-thb-border text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 w-48"
              />
            </div>
          </div>
          {/* Tabs */}
          <div className="flex gap-1">
            {(['all', 'missed', 'incoming', 'outgoing'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg capitalize transition-colors ${
                  activeTab === tab
                    ? 'bg-blue-600 text-white'
                    : 'text-thb-text-secondary hover:bg-slate-100'
                }`}
              >
                {tab}
                {tab === 'missed' && missedCalls > 0 && (
                  <span className={`ml-1.5 px-1.5 py-0.5 text-[9px] font-bold rounded-full ${
                    activeTab === tab ? 'bg-white/20' : 'bg-red-100 text-red-700'
                  }`}>
                    {missedCalls}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {filteredCalls.length === 0 ? (
          <div className="p-8 text-center">
            <FiPhone className="w-10 h-10 text-thb-text-muted mx-auto mb-2" />
            <p className="text-sm text-thb-text-muted">No calls found</p>
          </div>
        ) : (
          <div className="divide-y divide-thb-border">
            {filteredCalls.map(call => (
              <div key={call.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors">
                {/* Direction & Type Icon */}
                <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                  call.status === 'missed' ? 'bg-red-50' :
                  call.status === 'declined' ? 'bg-amber-50' :
                  call.callType === 'video' ? 'bg-violet-50' : 'bg-blue-50'
                }`}>
                  {call.status === 'missed' ? (
                    <FiPhoneOff className={`w-4 h-4 ${call.direction === 'incoming' ? 'text-red-500' : 'text-red-400'}`} />
                  ) : call.status === 'declined' ? (
                    <FiPhoneOff className="w-4 h-4 text-amber-500" />
                  ) : call.callType === 'video' ? (
                    <FiVideo className="w-4 h-4 text-violet-500" />
                  ) : (
                    <FiPhone className="w-4 h-4 text-blue-500" />
                  )}
                </div>

                {/* Direction arrow + Contact */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    {call.direction === 'incoming' ? (
                      <FiArrowDownLeft className={`w-3 h-3 ${call.status === 'missed' ? 'text-red-500' : 'text-emerald-500'}`} />
                    ) : (
                      <FiArrowUpRight className={`w-3 h-3 ${call.status === 'missed' ? 'text-red-500' : 'text-blue-500'}`} />
                    )}
                    <span className={`text-sm font-medium truncate ${
                      call.status === 'missed' ? 'text-red-600' : 'text-thb-text-primary'
                    }`}>
                      {call.contactName}
                    </span>
                    {call.isE2EE && (
                      <FiLock className="w-2.5 h-2.5 text-emerald-500 flex-shrink-0" title="E2EE" />
                    )}
                    {call.isRecorded && (
                      <FiMic className="w-2.5 h-2.5 text-amber-500 flex-shrink-0" title="Recorded" />
                    )}
                  </div>
                  <p className="text-[10px] text-thb-text-muted mt-0.5">
                    {call.contactRole} &middot; {call.provider}
                    {call.direction === 'incoming' ? ' (Incoming)' : ' (Outgoing)'}
                  </p>
                </div>

                {/* Duration & Time */}
                <div className="text-right flex-shrink-0">
                  <div className="flex items-center gap-1.5 justify-end">
                    <FiClock className="w-3 h-3 text-thb-text-muted" />
                    <span className={`text-xs ${call.status === 'missed' || call.status === 'declined' ? 'text-thb-text-muted' : 'text-thb-text-secondary'}`}>
                      {call.duration}
                    </span>
                  </div>
                  <p className="text-[10px] text-thb-text-muted mt-0.5">{call.dateTime}</p>
                </div>

                {/* Status Badge */}
                <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full flex-shrink-0 ${
                  call.status === 'completed' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                  call.status === 'missed' ? 'bg-red-50 text-red-700 border border-red-200' :
                  'bg-amber-50 text-amber-700 border border-amber-200'
                }`}>
                  {call.status}
                </span>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button className="p-1.5 text-thb-text-muted hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Call back">
                    {call.callType === 'video' ? <FiVideo className="w-3.5 h-3.5" /> : <FiPhone className="w-3.5 h-3.5" />}
                  </button>
                  <button className="p-1.5 text-thb-text-muted hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                    <FiTrash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Start Call Modal */}
      {showStartCallModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="thb-card p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-thb-text-primary">Start a Call</h3>
              <button onClick={() => setShowStartCallModal(false)} className="text-thb-text-muted hover:text-thb-text-primary">
                <FiX className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Call Type Selection */}
              <div>
                <label className="text-xs font-medium text-thb-text-secondary">Call Type</label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <button
                    onClick={() => setCallType('audio')}
                    className={`p-3 rounded-xl border-2 text-center transition-colors ${
                      callType === 'audio' ? 'border-blue-400 bg-blue-50' : 'border-thb-border hover:border-slate-300'
                    }`}
                  >
                    <FiPhone className={`w-6 h-6 mx-auto mb-1 ${callType === 'audio' ? 'text-blue-600' : 'text-thb-text-muted'}`} />
                    <p className={`text-sm font-medium ${callType === 'audio' ? 'text-blue-600' : 'text-thb-text-secondary'}`}>Audio</p>
                  </button>
                  <button
                    onClick={() => setCallType('video')}
                    className={`p-3 rounded-xl border-2 text-center transition-colors ${
                      callType === 'video' ? 'border-violet-400 bg-violet-50' : 'border-thb-border hover:border-slate-300'
                    }`}
                  >
                    <FiVideo className={`w-6 h-6 mx-auto mb-1 ${callType === 'video' ? 'text-violet-600' : 'text-thb-text-muted'}`} />
                    <p className={`text-sm font-medium ${callType === 'video' ? 'text-violet-600' : 'text-thb-text-secondary'}`}>Video</p>
                  </button>
                </div>
              </div>

              {/* Select Participant */}
              <div>
                <label className="text-xs font-medium text-thb-text-secondary">Select Participant</label>
                <div className="mt-1 max-h-48 overflow-y-auto border border-thb-border rounded-xl divide-y divide-thb-border">
                  {FREQUENT_CONTACTS.map(c => (
                    <label key={c.id} className="flex items-center gap-2.5 p-2.5 hover:bg-slate-50 cursor-pointer">
                      <input type="radio" name="participant" className="text-blue-600" />
                      <div className="relative">
                        <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${getAvatarColor(c.id)} flex items-center justify-center`}>
                          <span className="text-[10px] font-bold text-white">{getInitials(c.name)}</span>
                        </div>
                        {c.online && <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-emerald-500 rounded-full ring-2 ring-white" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-thb-text-primary">{c.name}</p>
                        <p className="text-[10px] text-thb-text-muted">{c.role}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* E2EE Notice */}
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                <div className="flex items-center gap-2">
                  <FiLock className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-xs font-medium text-emerald-700">1:1 calls are End-to-End Encrypted</span>
                </div>
                <p className="text-[10px] text-emerald-600 mt-1">Only you and the participant can access the call.</p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 mt-5">
              <button
                onClick={() => setShowStartCallModal(false)}
                className="px-4 py-2 text-sm text-thb-text-secondary hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => setShowStartCallModal(false)}
                className={`px-4 py-2 text-sm text-white rounded-lg transition-colors shadow-sm ${
                  callType === 'video' ? 'bg-violet-600 hover:bg-violet-700' : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                Start {callType === 'video' ? 'Video' : 'Audio'} Call
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Call Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="thb-card p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-thb-text-primary">Schedule a Call</h3>
              <button onClick={() => setShowScheduleModal(false)} className="text-thb-text-muted hover:text-thb-text-primary">
                <FiX className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-thb-text-secondary">Call Title</label>
                <input type="text" placeholder="e.g. Sprint Review" className="w-full mt-1 px-3 py-2 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium text-thb-text-secondary">Date</label>
                  <input type="date" className="w-full mt-1 px-3 py-2 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                </div>
                <div>
                  <label className="text-xs font-medium text-thb-text-secondary">Time</label>
                  <input type="time" className="w-full mt-1 px-3 py-2 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-thb-text-secondary">Call Type</label>
                <select className="w-full mt-1 px-3 py-2 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                  <option>Audio Call (Native WebRTC)</option>
                  <option>Video Call (Native WebRTC)</option>
                  <option>Zoom Meeting</option>
                  <option>Microsoft Teams</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-thb-text-secondary">Agenda (optional)</label>
                <textarea rows={2} placeholder="Meeting agenda..." className="w-full mt-1 px-3 py-2 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
              </div>
              <label className="flex items-center gap-2 text-sm text-thb-text-secondary">
                <input type="checkbox" className="rounded" />
                Recurring (weekly)
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 mt-5">
              <button onClick={() => setShowScheduleModal(false)} className="px-4 py-2 text-sm text-thb-text-secondary hover:bg-slate-100 rounded-lg transition-colors">
                Cancel
              </button>
              <button onClick={() => setShowScheduleModal(false)} className="px-4 py-2 text-sm bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors shadow-sm">
                Schedule Call
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
