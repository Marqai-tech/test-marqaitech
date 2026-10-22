'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  FiMessageCircle, FiPlus, FiSend, FiUsers, FiLock, FiGlobe,
  FiCornerUpLeft, FiSearch, FiPhone, FiVideo, FiPaperclip,
  FiMoreVertical, FiStar, FiTrash2, FiX, FiCheck, FiHash,
  FiRefreshCw, FiUserPlus, FiAlertCircle, FiFileText, FiEdit2,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { useCompanyContextStore } from '@/store/companyContextStore';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

/* ── Types ── */
interface Employee {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  email: string;
  avatar?: string | null;
  department?: { name: string } | null;
  designation?: { name: string } | null;
  status?: string;
}

interface ChatRoom {
  id: string;
  name: string | null;
  roomType: string;
  isE2EE: boolean;
  isAnnouncement: boolean;
  avatarUrl?: string | null;
  members: Array<{ userId: string; role: string }>;
  messages: Array<{ id: string; body: string; createdAt: string; senderId: string }>;
  lastMessageAt: string | null;
  unreadCount: number;
  _count?: { messages: number };
}

interface ChatMessage {
  id: string;
  roomId: string;
  senderId: string;
  body: string;
  createdAt: string;
  isDeleted: boolean;
  dlpStatus?: string;
  detectedActions?: string | null;
  attachments?: string | null;
  sender: { id: string; firstName: string; lastName: string; avatar?: string | null; email: string };
}

// Task 121 — attachment metadata (base64 data URL carried in ChatMessage.attachments JSON)
interface MessageAttachment {
  name: string;
  mimeType?: string;
  sizeBytes?: number;
  dataUrl?: string;
}

function parseAttachments(raw?: string | null): MessageAttachment[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((a): a is MessageAttachment => !!a && typeof a === 'object' && typeof (a as MessageAttachment).name === 'string');
  } catch {
    return [];
  }
}

function formatBytes(n?: number): string {
  if (!n || n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// Task 122 — effective chat permissions returned by /api/collaboration/chat/settings
interface ChatPermissions {
  isChatAdmin: boolean;
  isChatManager: boolean;
  canCreateGroup: boolean;
  canEditGroup: boolean;
  canDeleteGroup: boolean;
  canDeleteDirect: boolean;
}

const PERM_UNKNOWN: ChatPermissions = {
  isChatAdmin: false,
  isChatManager: false,
  canCreateGroup: true, // optimistic until the settings endpoint answers
  canEditGroup: true,
  canDeleteGroup: true,
  canDeleteDirect: true,
};

export default function ChatPage() {
  const { user } = useAuthStore();
  const scopeQuery = useCompanyContextStore(s => s.scopeQuery);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<ChatRoom | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [roomSearch, setRoomSearch] = useState('');
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [newChatMembers, setNewChatMembers] = useState<string[]>([]);
  const [newChatName, setNewChatName] = useState('');
  const [newChatType, setNewChatType] = useState<'direct' | 'group'>('direct');
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  // Task 120 — add people to an EXISTING group chat.
  const [showAddMembersModal, setShowAddMembersModal] = useState(false);
  const [addMemberIds, setAddMemberIds] = useState<string[]>([]);
  const [addingMembers, setAddingMembers] = useState(false);
  // Task 121 — file attachments (base64 data URLs, ≤5 files × 4 MB, server-validated)
  const [pendingAttachments, setPendingAttachments] = useState<MessageAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Task 122 — chat governance + room actions
  const [perm, setPerm] = useState<ChatPermissions>(PERM_UNKNOWN);
  const [showRoomMenu, setShowRoomMenu] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [roomActionBusy, setRoomActionBusy] = useState(false);
  const isGroupish = (t: string) => t !== 'direct';

  // ─── Fetch Chat Rooms ──────────────────────────
  const fetchRooms = useCallback(async () => {
    setLoadingRooms(true);
    try {
      const r = await fetch('/api/collaboration/chat/rooms', { headers: getAuthHeaders() });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      setRooms(d.rooms || []);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load chat rooms');
    } finally {
      setLoadingRooms(false);
    }
  }, []);

  // ─── Fetch Employees for New Chat / Add Members ─
  // Task 120: excludeInactive=true keeps separated employees (terminated /
  // resigned / inactive) out of the Chat module's people lists.
  const fetchEmployees = useCallback(async (search = '') => {
    setLoadingEmployees(true);
    try {
      const sq = scopeQuery();
      const r = await fetch(`/api/employees?limit=50&excludeInactive=true&search=${encodeURIComponent(search)}${sq ? `&${sq}` : ''}`, { headers: getAuthHeaders() });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      setEmployees(d.employees || []);
    } catch {
      toast.error('Failed to load employees');
    } finally {
      setLoadingEmployees(false);
    }
  }, [scopeQuery]);

  useEffect(() => { fetchRooms(); }, [fetchRooms]);

  // ─── Task 122: Chat Governance permissions ─────
  const fetchPermissions = useCallback(async () => {
    try {
      const r = await fetch('/api/collaboration/chat/settings', { headers: getAuthHeaders() });
      if (!r.ok) return;
      const d = await r.json();
      if (d.permissions) setPerm(d.permissions as ChatPermissions);
    } catch {
      /* unknown → optimistic defaults; the server still enforces */
    }
  }, []);

  useEffect(() => { fetchPermissions(); }, [fetchPermissions]);

  // Non-managers never see the Group option in the new-chat modal.
  useEffect(() => {
    if (!perm.canCreateGroup && newChatType === 'group') setNewChatType('direct');
  }, [perm.canCreateGroup, newChatType]);

  // ─── Fetch Messages for Selected Room ──────────
  const fetchMessages = useCallback(async (roomId: string) => {
    setLoadingMessages(true);
    try {
      const r = await fetch(`/api/collaboration/chat/rooms/${roomId}/messages?limit=100`, { headers: getAuthHeaders() });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      setMessages(d.messages || []);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load messages');
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    if (selectedRoom) fetchMessages(selectedRoom.id);
  }, [selectedRoom, fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ─── Task 121: deep-link support — /collaboration/chat?room=<id> ────
  // Used by the Projects module's "Open Chat" button to jump straight into
  // the project workspace conversation.
  useEffect(() => {
    if (loadingRooms || selectedRoom) return;
    const roomId = new URLSearchParams(window.location.search).get('room');
    if (!roomId) return;
    const target = rooms.find(r => r.id === roomId);
    if (target) {
      setSelectedRoom(target);
      // Clean the URL so a refresh doesn't re-open it unexpectedly.
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [rooms, loadingRooms, selectedRoom]);

  // ─── Task 121: pick + read a file as a base64 data URL ──────────────
  const handleFilesPicked = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList).slice(0, 5);
    for (const f of files) {
      if (f.size > 4 * 1024 * 1024) {
        toast.error(`"${f.name}" exceeds the 4 MB attachment limit`);
        continue;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = typeof reader.result === 'string' ? reader.result : '';
        if (!dataUrl) return;
        setPendingAttachments(prev => [...prev, { name: f.name, mimeType: f.type || 'application/octet-stream', sizeBytes: f.size, dataUrl }].slice(0, 5));
      };
      reader.readAsDataURL(f);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ─── Send Message ──────────────────────────────
  const handleSendMessage = async () => {
    if (!selectedRoom) return;
    const text = newMessage.trim();
    if (!text && pendingAttachments.length === 0) return;
    setSendingMessage(true);
    try {
      const r = await fetch(`/api/collaboration/chat/rooms/${selectedRoom.id}/messages`, {
        method: 'POST',
        headers: getAuthHeaders(),
        // Server requires a non-empty body — auto-fill from attachment names.
        body: JSON.stringify({
          body: text || pendingAttachments.map(a => `📎 ${a.name}`).join('\n'),
          attachments: pendingAttachments.length > 0 ? pendingAttachments : undefined,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      setNewMessage('');
      setPendingAttachments([]);
      fetchMessages(selectedRoom.id);
      fetchRooms(); // Refresh unread counts
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to send');
    } finally {
      setSendingMessage(false);
    }
  };

  // ─── Create New Chat Room ──────────────────────
  const handleCreateRoom = async () => {
    if (newChatMembers.length === 0) {
      toast.error('Select at least one member');
      return;
    }
    try {
      const r = await fetch('/api/collaboration/chat/rooms', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name: newChatType === 'group' ? (newChatName || 'Group Chat') : undefined,
          roomType: newChatType,
          memberIds: newChatMembers,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');

      if (d.alreadyExisted) {
        toast.success('Direct chat already exists — opened existing room');
      } else {
        toast.success(`${newChatType === 'direct' ? 'Direct' : 'Group'} chat created`);
      }

      setShowNewChatModal(false);
      setNewChatMembers([]);
      setNewChatName('');
      setNewChatType('direct');
      fetchRooms();
      if (d.room) setSelectedRoom(d.room);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to create room');
    }
  };

  // ─── Add Members to an Existing Group Chat (Task 120) ──
  const handleAddMembers = async () => {
    if (!selectedRoom || addMemberIds.length === 0) {
      toast.error('Select at least one person to add');
      return;
    }
    setAddingMembers(true);
    try {
      const r = await fetch(`/api/collaboration/chat/rooms/${selectedRoom.id}/members`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ memberIds: addMemberIds }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      const skippedNote = d.skipped?.length ? ` · ${d.skipped.length} skipped` : '';
      toast.success(`${d.added ?? addMemberIds.length} member(s) added${skippedNote}`);
      setShowAddMembersModal(false);
      setAddMemberIds([]);
      await fetchRooms();
      // Re-select the room so the header member count reflects the addition.
      const refreshed = await fetch('/api/collaboration/chat/rooms', { headers: getAuthHeaders() });
      if (refreshed.ok) {
        const jd = await refreshed.json();
        const again = (jd.rooms || []).find((x: ChatRoom) => x.id === selectedRoom.id);
        if (again) setSelectedRoom(again);
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to add members');
    } finally {
      setAddingMembers(false);
    }
  };

  // ─── Task 122: Rename / Delete the selected chat ─
  const openRename = () => {
    if (!selectedRoom) return;
    setRenameValue(selectedRoom.name || '');
    setShowRoomMenu(false);
    setShowRenameModal(true);
  };

  const handleRenameRoom = async () => {
    if (!selectedRoom) return;
    const name = renameValue.trim();
    if (!name) {
      toast.error('Group name cannot be empty');
      return;
    }
    setRoomActionBusy(true);
    try {
      const r = await fetch(`/api/collaboration/chat/rooms/${selectedRoom.id}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ name }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      toast.success('Chat renamed');
      setShowRenameModal(false);
      await fetchRooms();
      setSelectedRoom(prev => (prev && prev.id === selectedRoom.id ? { ...prev, name } : prev));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to rename');
    } finally {
      setRoomActionBusy(false);
    }
  };

  const handleDeleteRoom = async () => {
    if (!selectedRoom) return;
    const direct = selectedRoom.roomType === 'direct';
    const ok = direct
      ? window.confirm('Delete this direct chat? It disappears from your chat list (the other participant keeps it, and the Super Admin retains the history for safety).')
      : window.confirm('Delete this chat for EVERYONE? Messages stay retained in the audit archive (Super Admin → Deleted Chat History), but members lose access to the conversation.');
    if (!ok) return;
    setRoomActionBusy(true);
    try {
      const r = await fetch(`/api/collaboration/chat/rooms/${selectedRoom.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      toast.success(d.scope === 'self' ? 'Direct chat deleted' : 'Group chat deleted — history retained for audit');
      setShowRoomMenu(false);
      setSelectedRoom(null);
      fetchRooms();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete chat');
    } finally {
      setRoomActionBusy(false);
    }
  };

  // ─── Get room display name ─────────────────────
  const getRoomName = (room: ChatRoom) => {
    if (room.name) return room.name;
    if (room.roomType === 'direct') {
      const otherMember = room.members.find(m => m.userId !== user?.id);
      if (otherMember) {
        const emp = employees.find(e => e.id === otherMember.userId);
        if (emp) return `${emp.firstName} ${emp.lastName}`;
      }
      return 'Direct Chat';
    }
    return 'Group Chat';
  };

  const getRoomIcon = (room: ChatRoom) => {
    if (room.roomType === 'direct') return <FiMessageCircle className="w-4 h-4" />;
    if (room.roomType === 'announcement') return <FiGlobe className="w-4 h-4" />;
    return <FiHash className="w-4 h-4" />;
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const filteredRooms = rooms.filter(r => {
    if (!roomSearch) return true;
    const name = getRoomName(r).toLowerCase();
    return name.includes(roomSearch.toLowerCase());
  });

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-0 thb-card overflow-hidden">
      {/* ─── Room List ─── */}
      <div className="w-80 border-r border-slate-200 flex flex-col flex-shrink-0">
        <div className="p-3 border-b border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-bold text-slate-800">Chats</h2>
            <button onClick={() => { setShowNewChatModal(true); fetchEmployees(); }} className="p-1.5 rounded-lg text-teal-500 hover:bg-teal-50 transition-colors" title="New Chat">
              <FiPlus className="w-4 h-4" />
            </button>
          </div>
          <div className="relative">
            <FiSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input type="text" value={roomSearch} onChange={e => setRoomSearch(e.target.value)} placeholder="Search chats..." className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-teal-500" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingRooms ? (
            <div className="p-6 text-center text-xs text-slate-400">Loading...</div>
          ) : filteredRooms.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">
              <FiMessageCircle className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              No chats yet. Start a new conversation!
            </div>
          ) : filteredRooms.map(room => (
            <button
              key={room.id}
              onClick={() => setSelectedRoom(room)}
              className={`w-full flex items-center gap-3 px-3 py-3 text-left transition-colors border-b border-slate-50 ${
                selectedRoom?.id === room.id ? 'bg-teal-50 border-l-2 border-l-teal-500' : 'hover:bg-slate-50'
              }`}
            >
              <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                room.roomType === 'direct' ? 'bg-teal-100 text-teal-600' :
                room.roomType === 'announcement' ? 'bg-amber-100 text-amber-600' :
                'bg-blue-100 text-blue-600'
              }`}>
                {getRoomIcon(room)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-800 truncate">{getRoomName(room)}</p>
                  {room.isE2EE && <FiLock className="w-3 h-3 text-teal-500 flex-shrink-0" />}
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <p className="text-[10px] text-slate-400 truncate max-w-[140px]">
                    {room.messages?.[0]?.body || 'No messages yet'}
                  </p>
                  {room.unreadCount > 0 && (
                    <span className="ml-1 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-teal-500 text-white text-[9px] font-bold px-1">
                      {room.unreadCount > 99 ? '99+' : room.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ─── Message Area ─── */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedRoom ? (
          <>
            {/* Room Header */}
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-white">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  selectedRoom.roomType === 'direct' ? 'bg-teal-100 text-teal-600' :
                  selectedRoom.roomType === 'announcement' ? 'bg-amber-100 text-amber-600' :
                  'bg-blue-100 text-blue-600'
                }`}>
                  {getRoomIcon(selectedRoom)}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">{getRoomName(selectedRoom)}</h3>
                  <p className="text-[10px] text-slate-400">
                    {selectedRoom.members.length} member{selectedRoom.members.length !== 1 ? 's' : ''}
                    {selectedRoom.roomType === 'project' ? ' · Project workspace' : ''}
                    {selectedRoom.isE2EE ? ' · E2EE' : ''}
                    {selectedRoom.isAnnouncement ? ' · Announcement' : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {selectedRoom.roomType !== 'direct' && perm.canEditGroup && (
                  <button
                    onClick={() => { setAddMemberIds([]); setShowAddMembersModal(true); fetchEmployees(); }}
                    className="p-2 rounded-lg text-slate-400 hover:text-teal-500 hover:bg-teal-50 transition-colors"
                    title="Add Members"
                  >
                    <FiUserPlus className="w-4 h-4" />
                  </button>
                )}
                <button className="p-2 rounded-lg text-slate-400 hover:text-teal-500 hover:bg-teal-50 transition-colors" title="Audio Call">
                  <FiPhone className="w-4 h-4" />
                </button>
                <button className="p-2 rounded-lg text-slate-400 hover:text-teal-500 hover:bg-teal-50 transition-colors" title="Video Call">
                  <FiVideo className="w-4 h-4" />
                </button>
                {/* Task 122 — chat actions (rename / delete) per governance */}
                {((selectedRoom.roomType === 'direct' && perm.canDeleteDirect) ||
                  (isGroupish(selectedRoom.roomType) && (perm.canEditGroup || perm.canDeleteGroup))) && (
                  <div className="relative">
                    <button
                      onClick={() => setShowRoomMenu(v => !v)}
                      className="p-2 rounded-lg text-slate-400 hover:text-teal-500 hover:bg-teal-50 transition-colors"
                      title="Chat actions"
                    >
                      <FiMoreVertical className="w-4 h-4" />
                    </button>
                    {showRoomMenu && (
                      <>
                        <div className="fixed inset-0 z-30" onClick={() => setShowRoomMenu(false)} />
                        <div className="absolute right-0 top-10 z-40 w-56 rounded-xl border border-slate-200 bg-white shadow-lg py-1">
                          {isGroupish(selectedRoom.roomType) && perm.canEditGroup && (
                            <button
                              onClick={openRename}
                              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 text-left"
                            >
                              <FiEdit2 className="w-3.5 h-3.5 text-teal-500" /> Rename chat
                            </button>
                          )}
                          {((selectedRoom.roomType === 'direct' && perm.canDeleteDirect) ||
                            (isGroupish(selectedRoom.roomType) && perm.canDeleteGroup)) && (
                            <button
                              onClick={handleDeleteRoom}
                              disabled={roomActionBusy}
                              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50 text-left disabled:opacity-50"
                            >
                              <FiTrash2 className="w-3.5 h-3.5" />
                              {selectedRoom.roomType === 'direct' ? 'Delete direct chat' : 'Delete for everyone'}
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50">
              {loadingMessages ? (
                <div className="flex items-center justify-center h-full">
                  <FiRefreshCw className="w-5 h-5 text-teal-500 animate-spin" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-400">
                  <FiMessageCircle className="w-10 h-10 mb-2" />
                  <p className="text-sm">No messages yet. Say hello!</p>
                </div>
              ) : messages.map(msg => {
                const isOwn = msg.senderId === user?.id;
                return (
                  <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[70%] ${isOwn ? 'order-2' : ''}`}>
                      {!isOwn && (
                        <p className="text-[10px] text-slate-500 mb-0.5 ml-1">{msg.sender.firstName} {msg.sender.lastName}</p>
                      )}
                      <div className={`px-3 py-2 rounded-xl text-sm ${
                        isOwn
                          ? 'bg-teal-500 text-white rounded-br-sm'
                          : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm shadow-sm'
                      }`}>
                        {parseAttachments(msg.attachments).length > 0 && (
                          <div className="mb-1.5 space-y-1">
                            {parseAttachments(msg.attachments).map((a, i) => (
                              <div key={`${msg.id}-att-${i}`} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs ${
                                isOwn ? 'bg-teal-600/60' : 'bg-slate-50 border border-slate-200'
                              }`}>
                                <FiFileText className="w-3.5 h-3.5 shrink-0" />
                                {a.dataUrl ? (
                                  <a href={a.dataUrl} download={a.name} className={`truncate underline ${isOwn ? 'text-white' : 'text-teal-600'}`} title="Download">
                                    {a.name}
                                  </a>
                                ) : (
                                  <span className="truncate">{a.name}</span>
                                )}
                                <span className={`ml-auto shrink-0 ${isOwn ? 'text-teal-100' : 'text-slate-400'}`}>{formatBytes(a.sizeBytes)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                      </div>
                      <div className={`flex items-center gap-1 mt-0.5 ${isOwn ? 'justify-end' : ''}`}>
                        <p className={`text-[9px] ${isOwn ? 'text-teal-400' : 'text-slate-400'} mx-1`}>
                          {formatTime(msg.createdAt)}
                        </p>
                        {msg.dlpStatus === 'flagged' && <FiAlertCircle className="w-3 h-3 text-amber-500" />}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            <div className="px-4 py-3 border-t border-slate-200 bg-white">
              {pendingAttachments.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {pendingAttachments.map((a, i) => (
                    <span key={`pending-${i}`} className="inline-flex items-center gap-1.5 bg-teal-50 border border-teal-200 text-teal-700 rounded-lg px-2 py-1 text-xs max-w-[240px]">
                      <FiFileText className="w-3 h-3 shrink-0" />
                      <span className="truncate">{a.name}</span>
                      <span className="text-teal-400 shrink-0">{formatBytes(a.sizeBytes)}</span>
                      <button onClick={() => setPendingAttachments(prev => prev.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-500" title="Remove">
                        <FiX className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2">
                <input ref={fileInputRef} type="file" multiple className="hidden" onChange={e => handleFilesPicked(e.target.files)} />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={sendingMessage}
                  className="p-2 rounded-lg text-slate-400 hover:text-teal-500 hover:bg-teal-50 transition-colors disabled:opacity-50"
                  title="Attach files (max 5 × 4 MB)"
                >
                  <FiPaperclip className="w-4 h-4" />
                </button>
                <input
                  type="text"
                  value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                  placeholder="Type a message..."
                  className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-400"
                />
                <button
                  onClick={handleSendMessage}
                  disabled={sendingMessage || (!newMessage.trim() && pendingAttachments.length === 0)}
                  className="p-2 rounded-lg bg-teal-500 text-white hover:bg-teal-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="Send"
                >
                  {sendingMessage ? <FiRefreshCw className="w-4 h-4 animate-spin" /> : <FiSend className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <FiMessageCircle className="w-12 h-12 mb-3" />
            <p className="text-sm font-medium">Select a chat to start messaging</p>
            <p className="text-xs mt-1">Or create a new conversation</p>
          </div>
        )}
      </div>

      {/* ─── New Chat Modal ─── */}
      {showNewChatModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-800">New Conversation</h3>
              <button onClick={() => setShowNewChatModal(false)} className="text-slate-400 hover:text-slate-700">
                <FiX className="w-5 h-5" />
              </button>
            </div>

            {/* Chat Type */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setNewChatType('direct')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                  newChatType === 'direct' ? 'bg-teal-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <FiMessageCircle className="w-4 h-4 inline mr-1" /> Direct
              </button>
              {/* Task 122 — group chats are manager-only; hidden otherwise */}
              {perm.canCreateGroup && (
                <button
                  onClick={() => setNewChatType('group')}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                    newChatType === 'group' ? 'bg-teal-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <FiUsers className="w-4 h-4 inline mr-1" /> Group
                </button>
              )}
            </div>

            {newChatType === 'group' && (
              <input
                type="text"
                value={newChatName}
                onChange={e => setNewChatName(e.target.value)}
                placeholder="Group name..."
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm mb-4 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            )}

            {/* Employee Search */}
            <div className="relative mb-3">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                value={employeeSearch}
                onChange={e => { setEmployeeSearch(e.target.value); if (e.target.value.length >= 2) fetchEmployees(e.target.value); }}
                placeholder="Search employees..."
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>

            {/* Selected Members */}
            {newChatMembers.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {newChatMembers.map(id => {
                  const emp = employees.find(e => e.id === id);
                  return emp ? (
                    <span key={id} className="px-2 py-1 bg-teal-50 text-teal-700 text-xs rounded-lg flex items-center gap-1">
                      {emp.firstName} {emp.lastName}
                      <button onClick={() => setNewChatMembers(prev => prev.filter(m => m !== id))} className="text-teal-500 hover:text-red-500">
                        <FiX className="w-3 h-3" />
                      </button>
                    </span>
                  ) : null;
                })}
              </div>
            )}

            {/* Employee List */}
            <div className="max-h-48 overflow-y-auto border border-slate-100 rounded-lg">
              {loadingEmployees ? (
                <div className="p-4 text-center text-xs text-slate-400">Loading...</div>
              ) : employees.filter(e => e.id !== user?.id).map(emp => (
                <button
                  key={emp.id}
                  onClick={() => {
                    if (newChatType === 'direct') {
                      setNewChatMembers([emp.id]);
                    } else {
                      setNewChatMembers(prev => prev.includes(emp.id) ? prev.filter(m => m !== emp.id) : [...prev, emp.id]);
                    }
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-slate-50 transition-colors ${
                    newChatMembers.includes(emp.id) ? 'bg-teal-50' : ''
                  }`}
                >
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-teal-400 to-cyan-500 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                    {emp.firstName[0]}{emp.lastName[0]}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800 truncate">{emp.firstName} {emp.lastName}</p>
                    <p className="text-[10px] text-slate-400">{emp.department?.name || 'No Dept'}</p>
                  </div>
                  {newChatMembers.includes(emp.id) && <FiCheck className="w-3.5 h-3.5 text-teal-500 ml-auto flex-shrink-0" />}
                </button>
              ))}
            </div>

            <button
              onClick={handleCreateRoom}
              disabled={newChatMembers.length === 0}
              className="mt-4 w-full 3boxes-btn-primary flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FiPlus className="w-4 h-4" />
              Create {newChatType === 'direct' ? 'Direct' : 'Group'} Chat
            </button>
          </div>
        </div>
      )}
      {/* ─── Add Members Modal (Task 120) ─── */}
      {showAddMembersModal && selectedRoom && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg font-semibold text-slate-800">Add Members</h3>
              <button onClick={() => setShowAddMembersModal(false)} className="text-slate-400 hover:text-slate-700">
                <FiX className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-400 mb-4">To “{getRoomName(selectedRoom)}” · {selectedRoom.members.length} already in</p>

            <div className="relative mb-3">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                value={employeeSearch}
                onChange={e => { setEmployeeSearch(e.target.value); if (e.target.value.length >= 2) fetchEmployees(e.target.value); }}
                placeholder="Search employees..."
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>

            {addMemberIds.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {addMemberIds.map(id => {
                  const emp = employees.find(e => e.id === id);
                  return emp ? (
                    <span key={id} className="px-2 py-1 bg-teal-50 text-teal-700 text-xs rounded-lg flex items-center gap-1">
                      {emp.firstName} {emp.lastName}
                      <button onClick={() => setAddMemberIds(prev => prev.filter(m => m !== id))} className="text-teal-500 hover:text-red-500">
                        <FiX className="w-3 h-3" />
                      </button>
                    </span>
                  ) : null;
                })}
              </div>
            )}

            <div className="max-h-48 overflow-y-auto border border-slate-100 rounded-lg">
              {loadingEmployees ? (
                <div className="p-4 text-center text-xs text-slate-400">Loading...</div>
              ) : employees.filter(e => e.id !== user?.id && !selectedRoom.members.some(m => m.userId === e.id)).length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400">Everyone here is already in this chat</div>
              ) : employees.filter(e => e.id !== user?.id && !selectedRoom.members.some(m => m.userId === e.id)).map(emp => (
                <button
                  key={emp.id}
                  onClick={() => setAddMemberIds(prev => prev.includes(emp.id) ? prev.filter(m => m !== emp.id) : [...prev, emp.id])}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-slate-50 transition-colors ${
                    addMemberIds.includes(emp.id) ? 'bg-teal-50' : ''
                  }`}
                >
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-teal-400 to-cyan-500 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                    {emp.firstName[0]}{emp.lastName[0]}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800 truncate">{emp.firstName} {emp.lastName}</p>
                    <p className="text-[10px] text-slate-400">{emp.department?.name || 'No Dept'}</p>
                  </div>
                  {addMemberIds.includes(emp.id) && <FiCheck className="w-3.5 h-3.5 text-teal-500 ml-auto flex-shrink-0" />}
                </button>
              ))}
            </div>

            <button
              onClick={handleAddMembers}
              disabled={addingMembers || addMemberIds.length === 0}
              className="mt-4 w-full 3boxes-btn-primary flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FiUserPlus className="w-4 h-4" />
              {addingMembers ? 'Adding…' : `Add ${addMemberIds.length || ''} to Chat`}
            </button>
          </div>
        </div>
      )}
      {/* ─── Rename Chat Modal (Task 122) ─── */}
      {showRenameModal && selectedRoom && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-800">Rename Chat</h3>
              <button onClick={() => setShowRenameModal(false)} className="text-slate-400 hover:text-slate-700">
                <FiX className="w-5 h-5" />
              </button>
            </div>
            <input
              type="text"
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              placeholder="New chat name..."
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') handleRenameRoom(); }}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm mb-4 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
            <button
              onClick={handleRenameRoom}
              disabled={roomActionBusy || !renameValue.trim()}
              className="w-full 3boxes-btn-primary flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FiCheck className="w-4 h-4" />
              {roomActionBusy ? 'Saving…' : 'Save Name'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
