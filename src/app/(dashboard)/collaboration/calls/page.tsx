'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  FiVideo, FiPhone, FiPlus, FiClock, FiLock, FiExternalLink,
  FiPlay, FiPause, FiMic, FiMicOff, FiVideoOff,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { useAutoSeedDemo } from '@/hooks/useAutoSeedDemo';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface CallLog {
  id: string;
  callType: string;
  provider: string;
  status: string;
  startedAt: string;
  endedAt: string | null;
  durationSec: number | null;
  isE2EE: boolean;
  consentForRecording: boolean;
  transcriptStatus: string;
  meetingUrl: string | null;
  initiator: { id: string; firstName: string; lastName: string; avatar: string | null };
  participants: Array<{ userId: string; user: { id: string; firstName: string; lastName: string; avatar: string | null }; joinedAt: string | null }>;
}

export default function CallsPage() {
  const { user } = useAuthStore();
  const [calls, setCalls] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [showNewCallModal, setShowNewCallModal] = useState(false);
  const [employees, setEmployees] = useState<Array<{ id: string; firstName: string; lastName: string; email: string }>>([]);

  // New call form
  const [callType, setCallType] = useState<'audio' | 'video'>('video');
  const [provider, setProvider] = useState('native_webrtc');
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [consentForRecording, setConsentForRecording] = useState(false);
  const [externalMeetingUrl, setExternalMeetingUrl] = useState('');

  const fetchCalls = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/collaboration/calls?limit=50', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setCalls(data.calls || []);
      } else {
        setCalls([]);
      }
    } catch (err) {
      console.error('Failed to load calls:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchEmployees = useCallback(async () => {
    try {
      const res = await fetch('/api/employees?limit=50', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setEmployees(data.employees || []);
      }
    } catch (err) {
      console.error('Failed to load employees:', err);
    }
  }, []);

  useEffect(() => {
    fetchCalls();
    fetchEmployees();
  }, [fetchCalls, fetchEmployees]);

  // Auto-seed collaboration demo data on first load, then re-fetch calls
  const { seeded: callsSeeded } = useAutoSeedDemo('collaboration', () => { fetchCalls(); });
  useEffect(() => {
    if (callsSeeded) fetchCalls();
  }, [callsSeeded, fetchCalls]);

  const handleStartCall = async () => {
    if (selectedParticipants.length === 0) {
      toast.error('Select at least one participant');
      return;
    }
    try {
      const res = await fetch('/api/collaboration/calls', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          callType,
          provider,
          participantIds: selectedParticipants,
          consentForRecording,
          meetingUrl: provider !== 'native_webrtc' ? externalMeetingUrl : null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(`${callType === 'video' ? 'Video' : 'Audio'} call started${data.call.isE2EE ? ' (E2EE)' : ''}`);
        setShowNewCallModal(false);
        setSelectedParticipants([]);
        setExternalMeetingUrl('');
        fetchCalls();
      } else {
        toast.error('Failed to start call');
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to start call');
    }
  };

  const handleEndCall = async (callId: string) => {
    try {
      const res = await fetch('/api/collaboration/calls', {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ callId, action: 'end', status: 'completed' }),
      });
      if (res.ok) {
        toast.success('Call ended');
        fetchCalls();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const formatDuration = (sec: number | null) => {
    if (!sec) return '—';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}m ${s}s`;
  };

  const formatDateTime = (iso: string) => {
    return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-thb-text-primary flex items-center gap-2">
            <FiVideo className="w-6 h-6 text-violet-500" />
            Calls
          </h1>
          <p className="text-sm text-thb-text-secondary mt-1">
            Native WebRTC 1:1 audio/video (E2EE) with optional Zoom/Teams deep-links and AI transcription
          </p>
        </div>
        <button
          onClick={() => setShowNewCallModal(true)}
          className="inline-flex items-center gap-2 px-3 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 transition-colors"
        >
          <FiPlus className="w-4 h-4" />
          Start Call
        </button>
      </div>

      {/* Capability highlights */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="thb-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <FiLock className="w-4 h-4 text-emerald-500" />
            <h3 className="text-sm font-semibold text-thb-text-primary">E2EE for 1:1</h3>
          </div>
          <p className="text-xs text-thb-text-muted leading-relaxed">
            Native WebRTC 1:1 calls are End-to-End Encrypted. Even Super Admins cannot listen in.
          </p>
        </div>
        <div className="thb-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <FiExternalLink className="w-4 h-4 text-blue-500" />
            <h3 className="text-sm font-semibold text-thb-text-primary">External Deep-Links</h3>
          </div>
          <p className="text-xs text-thb-text-muted leading-relaxed">
            For group meetings, configure Zoom/Teams/Webex deep-links. Native WebRTC for quick 1:1 HR check-ins.
          </p>
        </div>
        <div className="thb-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <FiMic className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-semibold text-thb-text-primary">AI Transcription</h3>
          </div>
          <p className="text-xs text-thb-text-muted leading-relaxed">
            Optional AI transcription (with consent) linked to the Employee or Project record for compliance.
          </p>
        </div>
      </div>

      {/* Call history */}
      <div className="thb-card overflow-hidden">
        <div className="p-3 border-b border-thb-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-thb-text-primary">Call History</h2>
          <span className="text-xs text-thb-text-muted">{calls.length} call{calls.length !== 1 ? 's' : ''}</span>
        </div>
        {loading ? (
          <div className="p-8 text-center text-sm text-thb-text-muted">Loading...</div>
        ) : calls.length === 0 ? (
          <div className="p-8 text-center">
            <FiPhone className="w-10 h-10 text-thb-text-muted mx-auto mb-2" />
            <p className="text-sm text-thb-text-muted">No call history yet</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs text-thb-text-muted uppercase tracking-wider">
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Provider</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Started</th>
                <th className="px-4 py-2 font-medium">Duration</th>
                <th className="px-4 py-2 font-medium">Participants</th>
                <th className="px-4 py-2 font-medium">Security</th>
                <th className="px-4 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-thb-border">
              {calls.map((call) => (
                <tr key={call.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {call.callType === 'video' ? (
                        <FiVideo className="w-3.5 h-3.5 text-violet-500" />
                      ) : (
                        <FiPhone className="w-3.5 h-3.5 text-blue-500" />
                      )}
                      <span className="text-xs capitalize">{call.callType}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-thb-text-secondary capitalize">{call.provider.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-3">
                    <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${
                      call.status === 'completed' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                      call.status === 'missed' ? 'bg-red-50 text-red-700 border border-red-200' :
                      call.status === 'initiated' || call.status === 'answered' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                      'bg-slate-50 text-slate-700 border border-slate-200'
                    }`}>
                      {call.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-thb-text-muted">{formatDateTime(call.startedAt)}</td>
                  <td className="px-4 py-3 text-xs text-thb-text-secondary">{formatDuration(call.durationSec)}</td>
                  <td className="px-4 py-3">
                    <div className="flex -space-x-1">
                      {call.participants.slice(0, 3).map((p) => (
                        p.user.avatar ? (
                          <img key={p.userId} src={p.user.avatar} alt="" className="w-6 h-6 rounded-full ring-2 ring-white" />
                        ) : (
                          <div key={p.userId} className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 ring-2 ring-white flex items-center justify-center text-white text-[10px] font-bold">
                            {p.user.firstName[0]}{p.user.lastName[0]}
                          </div>
                        )
                      ))}
                      {call.participants.length > 3 && (
                        <div className="w-6 h-6 rounded-full bg-slate-200 ring-2 ring-white flex items-center justify-center text-[10px] font-bold text-slate-600">
                          +{call.participants.length - 3}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {call.isE2EE ? (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <FiLock className="w-2.5 h-2.5" />
                        E2EE
                      </span>
                    ) : (
                      <span className="text-[10px] text-thb-text-muted">Standard</span>
                    )}
                    {call.consentForRecording && (
                      <span className="ml-1 inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium rounded bg-amber-50 text-amber-700 border border-amber-200">
                        <FiMic className="w-2.5 h-2.5" />
                        Rec
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {(call.status === 'initiated' || call.status === 'answered') && (
                        <button
                          onClick={() => handleEndCall(call.id)}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                          title="End call"
                        >
                          <FiPause className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {call.meetingUrl && (
                        <a
                          href={call.meetingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 text-thb-text-muted hover:bg-slate-100 hover:text-blue-600 rounded"
                          title="Join via external link"
                        >
                          <FiExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* New Call Modal */}
      {showNewCallModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="thb-card p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-thb-text-primary mb-4">Start a Call</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setCallType('audio')}
                  className={`p-3 rounded-lg border text-left ${callType === 'audio' ? 'border-blue-300 bg-blue-50' : 'border-thb-border'}`}
                >
                  <FiPhone className="w-4 h-4 text-blue-500 mb-1" />
                  <p className="text-sm font-medium">Audio</p>
                </button>
                <button
                  onClick={() => setCallType('video')}
                  className={`p-3 rounded-lg border text-left ${callType === 'video' ? 'border-violet-300 bg-violet-50' : 'border-thb-border'}`}
                >
                  <FiVideo className="w-4 h-4 text-violet-500 mb-1" />
                  <p className="text-sm font-medium">Video</p>
                </button>
              </div>
              <div>
                <label className="text-xs font-medium text-thb-text-secondary">Provider</label>
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-thb-border text-sm"
                >
                  <option value="native_webrtc">Native WebRTC (1:1, E2EE)</option>
                  <option value="zoom">Zoom (external deep-link)</option>
                  <option value="teams">Microsoft Teams</option>
                  <option value="webex">Cisco Webex</option>
                </select>
              </div>
              {provider !== 'native_webrtc' && (
                <div>
                  <label className="text-xs font-medium text-thb-text-secondary">External Meeting URL</label>
                  <input
                    type="url"
                    value={externalMeetingUrl}
                    onChange={(e) => setExternalMeetingUrl(e.target.value)}
                    placeholder="https://zoom.us/j/..."
                    className="w-full mt-1 px-3 py-2 rounded-lg border border-thb-border text-sm"
                  />
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-thb-text-secondary">Participants</label>
                <div className="mt-1 max-h-40 overflow-y-auto border border-thb-border rounded-lg">
                  {employees.map((emp) => (
                    <label key={emp.id} className="flex items-center gap-2 p-2 hover:bg-slate-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedParticipants.includes(emp.id)}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedParticipants((prev) => [...prev, emp.id]);
                          else setSelectedParticipants((prev) => prev.filter((id) => id !== emp.id));
                        }}
                        className="rounded"
                      />
                      <span className="text-sm">{emp.firstName} {emp.lastName}</span>
                      <span className="text-[10px] text-thb-text-muted">({emp.email})</span>
                    </label>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-thb-text-secondary">
                <input
                  type="checkbox"
                  checked={consentForRecording}
                  onChange={(e) => setConsentForRecording(e.target.checked)}
                  className="rounded"
                />
                Consent to AI transcription & recording
              </label>
              {provider === 'native_webrtc' && selectedParticipants.length === 1 && (
                <div className="p-2 rounded bg-emerald-50 border border-emerald-100 text-[10px] text-emerald-700">
                  <FiLock className="inline w-3 h-3 mr-1" />
                  This 1:1 WebRTC call will be End-to-End Encrypted.
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 mt-5">
              <button
                onClick={() => setShowNewCallModal(false)}
                className="px-3 py-1.5 text-sm text-thb-text-secondary hover:bg-slate-100 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleStartCall}
                className="px-3 py-1.5 text-sm bg-violet-600 text-white rounded-md hover:bg-violet-700 transition-colors"
              >
                Start Call
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
