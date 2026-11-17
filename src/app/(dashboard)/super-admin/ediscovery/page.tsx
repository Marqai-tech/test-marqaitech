'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  FiShield, FiLock, FiUnlock, FiPlus, FiAlertCircle, FiArchive, FiRefreshCw, FiSearch, FiFileText,
} from 'react-icons/fi';
import toast from 'react-hot-toast';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface LegalHold {
  id: string;
  tenantId: string;
  initiatedBy: string;
  targetUserId: string | null;
  targetRoomId: string | null;
  targetFileId: string | null;
  caseReference: string | null;
  reason: string;
  startDate: string;
  endDate: string | null;
  status: string;
  releasedBy: string | null;
  releasedAt: string | null;
  releaseReason: string | null;
}

// ─── Task 121: super-admin retention view over deleted chat history ──
interface ArchiveRow {
  messageId: string;
  tenantId: string | null;
  tenantName: string;
  roomId: string;
  roomName: string | null;
  roomType: string | null;
  projectName: string | null;
  roomActive: boolean | null;
  senderName: string;
  senderEmail: string | null;
  body: string;
  attachments: string | null;
  createdAt: string;
  deletedAt: string;
  source: string;
}
interface ArchiveRoom {
  roomId: string;
  tenantName: string;
  name: string | null;
  roomType: string | null;
  projectName: string | null;
  updatedAt: string;
}
interface ArchiveResponse {
  rows: ArchiveRow[];
  rooms: ArchiveRoom[];
  tenants: Array<{ id: string; name: string; slug: string }>;
  truncated: boolean;
}

export default function EdiscoveryPage() {
  const [holds, setHolds] = useState<LegalHold[]>([]);
  const [loading, setLoading] = useState(false);
  const [showNewHoldModal, setShowNewHoldModal] = useState(false);
  const [newHold, setNewHold] = useState({
    tenantId: '',
    targetUserId: '',
    targetRoomId: '',
    targetFileId: '',
    caseReference: '',
    reason: '',
  });

  // ─── Task 121: deleted chat history (safety measure) ────
  const [archiveRows, setArchiveRows] = useState<ArchiveRow[]>([]);
  const [archiveRooms, setArchiveRooms] = useState<ArchiveRoom[]>([]);
  const [archiveTenants, setArchiveTenants] = useState<Array<{ id: string; name: string; slug: string }>>([]);
  const [archiveTenantFilter, setArchiveTenantFilter] = useState('');
  const [archiveQuery, setArchiveQuery] = useState('');
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveLoaded, setArchiveLoaded] = useState(false);
  const [archiveTruncated, setArchiveTruncated] = useState(false);

  const fetchArchive = useCallback(async () => {
    setArchiveLoading(true);
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (archiveTenantFilter) params.set('tenantId', archiveTenantFilter);
      if (archiveQuery.trim()) params.set('q', archiveQuery.trim());
      const res = await fetch(`/api/super-admin/chat-archive?${params}`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data: ArchiveResponse = await res.json();
        setArchiveRows(data.rows || []);
        setArchiveRooms(data.rooms || []);
        setArchiveTenants(data.tenants || []);
        setArchiveTruncated(!!data.truncated);
        setArchiveLoaded(true);
      } else {
        toast.error('Failed to load deleted chat history');
      }
    } catch {
      toast.error('Failed to load deleted chat history');
    } finally {
      setArchiveLoading(false);
    }
  }, [archiveTenantFilter, archiveQuery]);

  const fetchHolds = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/collaboration/legal-holds', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setHolds(data.holds || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHolds();
  }, [fetchHolds]);

  const handleCreate = async () => {
    if (!newHold.tenantId || !newHold.reason) {
      toast.error('Tenant ID and Reason are required');
      return;
    }
    if (!newHold.targetUserId && !newHold.targetRoomId && !newHold.targetFileId) {
      toast.error('At least one target (user, room, or file) is required');
      return;
    }
    try {
      const res = await fetch('/api/collaboration/legal-holds', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          tenantId: newHold.tenantId,
          targetUserId: newHold.targetUserId || null,
          targetRoomId: newHold.targetRoomId || null,
          targetFileId: newHold.targetFileId || null,
          caseReference: newHold.caseReference || null,
          reason: newHold.reason,
        }),
      });
      if (res.ok) {
        toast.success('Legal hold placed');
        setShowNewHoldModal(false);
        setNewHold({ tenantId: '', targetUserId: '', targetRoomId: '', targetFileId: '', caseReference: '', reason: '' });
        fetchHolds();
      } else {
        toast.error('Failed to place hold');
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to place hold');
    }
  };

  const handleRelease = async (holdId: string) => {
    const reason = prompt('Reason for release:');
    if (!reason) return;
    try {
      const res = await fetch('/api/collaboration/legal-holds', {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ holdId, releaseReason: reason }),
      });
      if (res.ok) {
        toast.success('Legal hold released');
        fetchHolds();
      } else {
        toast.error('Failed to release hold');
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-thb-text-primary flex items-center gap-2">
            <FiShield className="w-6 h-6 text-red-500" />
            eDiscovery & Legal Holds
          </h1>
          <p className="text-sm text-thb-text-secondary mt-1">
            Place a &quot;Legal Hold&quot; on a specific user across any tenant, freezing their chats and files from deletion
          </p>
        </div>
        <button
          onClick={() => setShowNewHoldModal(true)}
          className="inline-flex items-center gap-2 px-3 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
        >
          <FiPlus className="w-4 h-4" />
          Place Hold
        </button>
      </div>

      <div className="p-4 rounded-lg bg-red-50 border border-red-100 flex items-start gap-2">
        <FiAlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
        <div className="text-xs text-red-800">
          <strong>Super Admin only.</strong> Legal holds freeze all chats and files associated with the target user/room/file,
          preventing deletion even by the Tenant Admin. Holds remain active until explicitly released with a documented reason.
          Use this capability only in response to a legal action (lawsuit, regulatory investigation, etc.).
        </div>
      </div>

      <div className="thb-card overflow-hidden">
        <div className="p-3 border-b border-thb-border">
          <h2 className="text-sm font-semibold text-thb-text-primary">Active Legal Holds ({holds.length})</h2>
        </div>
        {loading ? (
          <div className="p-8 text-center text-sm text-thb-text-muted">Loading...</div>
        ) : holds.length === 0 ? (
          <div className="p-8 text-center">
            <FiShield className="w-10 h-10 text-thb-text-muted mx-auto mb-2" />
            <p className="text-sm text-thb-text-muted">No active legal holds</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs text-thb-text-muted uppercase tracking-wider">
                <th className="px-4 py-2 font-medium">Case Ref</th>
                <th className="px-4 py-2 font-medium">Target</th>
                <th className="px-4 py-2 font-medium">Reason</th>
                <th className="px-4 py-2 font-medium">Started</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-thb-border">
              {holds.map((hold) => (
                <tr key={hold.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-xs font-mono text-thb-text-secondary">{hold.caseReference || '—'}</td>
                  <td className="px-4 py-3 text-xs text-thb-text-secondary">
                    {hold.targetUserId && <div>User: {hold.targetUserId.substring(0, 12)}...</div>}
                    {hold.targetRoomId && <div>Room: {hold.targetRoomId.substring(0, 12)}...</div>}
                    {hold.targetFileId && <div>File: {hold.targetFileId.substring(0, 12)}...</div>}
                  </td>
                  <td className="px-4 py-3 text-xs text-thb-text-secondary max-w-xs truncate">{hold.reason}</td>
                  <td className="px-4 py-3 text-xs text-thb-text-muted">{new Date(hold.startDate).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded bg-red-50 text-red-700 border border-red-200">
                      <FiLock className="w-2.5 h-2.5" />
                      {hold.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleRelease(hold.id)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50 rounded"
                    >
                      <FiUnlock className="w-3 h-3" />
                      Release
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ─── Task 121: Deleted Chat History (retention / safety measure) ─── */}
      <div className="thb-card overflow-hidden">
        <div className="p-3 border-b border-thb-border flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold text-thb-text-primary flex items-center gap-2">
            <FiArchive className="w-4 h-4 text-slate-500" />
            Deleted Chat History
          </h2>
          <span className="text-[11px] text-thb-text-muted">
            Messages deleted by users are retained here (projects &amp; individual chats) — visible only to Super Admin.
          </span>
          <div className="ml-auto flex items-center gap-2">
            <select
              value={archiveTenantFilter}
              onChange={(e) => setArchiveTenantFilter(e.target.value)}
              className="px-2 py-1.5 rounded-lg border border-thb-border text-xs"
            >
              <option value="">All tenants</option>
              {archiveTenants.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <div className="relative">
              <FiSearch className="absolute left-2 top-2.5 w-3.5 h-3.5 text-thb-text-muted" />
              <input
                value={archiveQuery}
                onChange={(e) => setArchiveQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') fetchArchive(); }}
                placeholder="Search deleted text..."
                className="pl-7 pr-2 py-1.5 rounded-lg border border-thb-border text-xs w-44"
              />
            </div>
            <button
              onClick={fetchArchive}
              disabled={archiveLoading}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-700 text-white text-xs hover:bg-slate-800 disabled:opacity-50"
            >
              {archiveLoading ? <FiRefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FiSearch className="w-3.5 h-3.5" />}
              {archiveLoaded ? 'Refresh' : 'Load'}
            </button>
          </div>
        </div>
        {archiveLoading ? (
          <div className="p-8 text-center text-sm text-thb-text-muted">Sweeping platform + tenant databases...</div>
        ) : !archiveLoaded ? (
          <div className="p-8 text-center">
            <FiArchive className="w-10 h-10 text-thb-text-muted mx-auto mb-2" />
            <p className="text-sm text-thb-text-muted">Press Load to sweep deleted messages across all tenants.</p>
          </div>
        ) : (
          <>
            {archiveTruncated && (
              <p className="px-4 py-2 text-[11px] text-amber-700 bg-amber-50">Result set truncated — narrow the filters to see more.</p>
            )}
            {archiveRows.length === 0 ? (
              <div className="p-8 text-center text-sm text-thb-text-muted">No deleted messages found.</div>
            ) : (
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr className="text-left text-xs text-thb-text-muted uppercase tracking-wider">
                    <th className="px-4 py-2 font-medium">Tenant</th>
                    <th className="px-4 py-2 font-medium">Chat</th>
                    <th className="px-4 py-2 font-medium">Sender</th>
                    <th className="px-4 py-2 font-medium">Message</th>
                    <th className="px-4 py-2 font-medium">Files</th>
                    <th className="px-4 py-2 font-medium">Deleted At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-thb-border">
                  {archiveRows.map((r) => (
                    <tr key={`${r.source}-${r.messageId}`} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-xs text-thb-text-secondary">{r.tenantName}</td>
                      <td className="px-4 py-3 text-xs text-thb-text-secondary">
                        <div className="font-medium">{r.roomName || 'Direct chat'}</div>
                        <div className="text-[10px] text-thb-text-muted">
                          {r.roomType || '—'}{r.projectName ? ` · ${r.projectName}` : ''}{r.roomActive === false ? ' · room deleted' : ''}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-thb-text-secondary">{r.senderName}</td>
                      <td className="px-4 py-3 text-xs text-thb-text-secondary max-w-sm">
                        <div className="whitespace-pre-wrap break-words line-clamp-3">{r.body}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-thb-text-secondary">
                        {r.attachments && r.attachments !== 'null' ? (
                          <span className="inline-flex items-center gap-1 text-sky-600"><FiFileText className="w-3 h-3" /> attached</span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-thb-text-muted whitespace-nowrap">
                        {new Date(r.deletedAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {archiveRooms.length > 0 && (
              <div className="p-3 border-t border-thb-border">
                <p className="text-xs font-semibold text-thb-text-primary mb-2">Deleted / archived conversations ({archiveRooms.length}) — history preserved</p>
                <div className="flex flex-wrap gap-1.5">
                  {archiveRooms.map((r) => (
                    <span key={`${r.source}-${r.roomId}`} className="inline-flex items-center gap-1 bg-slate-100 border border-thb-border rounded-full px-2.5 py-1 text-[11px] text-thb-text-secondary">
                      {r.name || 'Untitled'} · {r.roomType || '—'}{r.projectName ? ` · ${r.projectName}` : ''} · {r.tenantName}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {showNewHoldModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="thb-card p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-thb-text-primary mb-4">Place Legal Hold</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-thb-text-secondary">Tenant ID <span className="text-red-500 font-bold">*</span></label>
                <input
                  type="text"
                  value={newHold.tenantId}
                  onChange={(e) => setNewHold({ ...newHold, tenantId: e.target.value })}
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-thb-border text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-thb-text-secondary">Case Reference (optional)</label>
                <input
                  type="text"
                  value={newHold.caseReference}
                  onChange={(e) => setNewHold({ ...newHold, caseReference: e.target.value })}
                  placeholder="e.g. Case #2026-001"
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-thb-border text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-thb-text-secondary">Target User ID</label>
                <input
                  type="text"
                  value={newHold.targetUserId}
                  onChange={(e) => setNewHold({ ...newHold, targetUserId: e.target.value })}
                  placeholder="Employee ID"
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-thb-border text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-thb-text-secondary">Target Room ID (optional)</label>
                <input
                  type="text"
                  value={newHold.targetRoomId}
                  onChange={(e) => setNewHold({ ...newHold, targetRoomId: e.target.value })}
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-thb-border text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-thb-text-secondary">Target File ID (optional)</label>
                <input
                  type="text"
                  value={newHold.targetFileId}
                  onChange={(e) => setNewHold({ ...newHold, targetFileId: e.target.value })}
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-thb-border text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-thb-text-secondary">Reason <span className="text-red-500 font-bold">*</span></label>
                <textarea
                  value={newHold.reason}
                  onChange={(e) => setNewHold({ ...newHold, reason: e.target.value })}
                  rows={3}
                  placeholder="Document the legal basis for this hold..."
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-thb-border text-sm"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 mt-5">
              <button
                onClick={() => setShowNewHoldModal(false)}
                className="px-3 py-1.5 text-sm text-thb-text-secondary hover:bg-slate-100 rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                Place Hold
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
