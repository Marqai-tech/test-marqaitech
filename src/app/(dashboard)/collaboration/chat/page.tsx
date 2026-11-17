'use client';

import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  TbMessageCircle, TbPlus, TbSend, TbUsers, TbLock, TbGlobe,
  TbCornerUpLeft, TbSearch, TbDotsVertical, TbTrash, TbX, TbCheck, TbHash,
  TbRefresh, TbUserPlus, TbAlertCircle, TbFileText, TbEdit,
  TbChevronDown, TbChevronRight, TbHome, TbChecks, TbArrowLeft,
  TbPin, TbArchive, TbMailForward, TbVolumeOff, TbUser, TbEraser,
  TbMicrophone, TbMoodSmile, TbPaperclip,
} from 'react-icons/tb';
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

/* ── SmartHR chat skin helpers (Task 147) ── */
type ChatFilter = 'all' | 'groups' | 'direct';
const CHAT_FILTERS: Array<{ value: ChatFilter; label: string }> = [
  { value: 'all', label: 'All Chats' },
  { value: 'groups', label: 'Groups' },
  { value: 'direct', label: 'Direct' },
];

const AVATAR_GRADIENTS = [
  'from-[#3A57C4] to-[#6C4FD6]',
  'from-[#6C4FD6] to-[#8A5CF6]',
  'from-[#FF9B44] to-[#FF7A3D]',
  'from-[#009EFB] to-[#3A57C4]',
  'from-[#10B981] to-[#009EFB]',
  'from-[#F43F5E] to-[#FF9B44]',
];

function pickGrad(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 997;
  return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length];
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  const ini = parts.map(w => w[0] || '').join('').toUpperCase();
  return ini || '?';
}

// Compact sidebar time label: "02:40 PM" today, "Yesterday", else "Feb 12"
function formatListTime(dateStr?: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }
  if (d.toDateString() === new Date(now.getTime() - 86400000).toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Date-separator chip label inside the message stream
function dayLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';
  if (d.toDateString() === new Date(now.getTime() - 86400000).toDateString()) return 'Yesterday';
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString('en-US', opts);
}

const EMOJI_PICKS = ['😀', '😂', '🥰', '😊', '😎', '🤝', '👍', '👏', '🙏', '🔥', '🎉', '❤️', '✅', '⚡', '🚀', '💡', '📌', '😅', '😮', '😢', '🤔', '☕', '🕐', '📞'];

// Slim custom scrollbar (arbitrary Tailwind variants, self-contained in this page)
const SLIM_SCROLLBAR = '[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-200 hover:[&::-webkit-scrollbar-thumb]:bg-slate-300';

export default function ChatPage() {
  const { user } = useAuthStore();
  const router = useRouter();
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
  // Task 147 — SmartHR skin glue: sidebar filter (All/Groups/Direct), per-row kebab, emoji popover
  const [chatFilter, setChatFilter] = useState<ChatFilter>('all');
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [openListMenu, setOpenListMenu] = useState<string | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
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
      setShowEmoji(false);
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

  // Task 147: accepts an optional room so the sidebar row kebab can delete
  // without changing the selection first; header kebab passes nothing.
  const handleDeleteRoom = async (room?: ChatRoom) => {
    const target = room || selectedRoom;
    if (!target) return;
    const direct = target.roomType === 'direct';
    const ok = direct
      ? window.confirm('Delete this direct chat? It disappears from your chat list (the other participant keeps it, and the Super Admin retains the history for safety).')
      : window.confirm('Delete this chat for EVERYONE? Messages stay retained in the audit archive (Super Admin → Deleted Chat History), but members lose access to the conversation.');
    if (!ok) return;
    setRoomActionBusy(true);
    try {
      const r = await fetch(`/api/collaboration/chat/rooms/${target.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      toast.success(d.scope === 'self' ? 'Direct chat deleted' : 'Group chat deleted — history retained for audit');
      setShowRoomMenu(false);
      setOpenListMenu(null);
      if (!room || selectedRoom?.id === room.id) setSelectedRoom(null);
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
    if (room.roomType === 'direct') return <TbMessageCircle className="w-5 h-5" />;
    if (room.roomType === 'announcement') return <TbGlobe className="w-5 h-5" />;
    if (room.roomType === 'project') return <TbHash className="w-5 h-5" />;
    return <TbUsers className="w-5 h-5" />;
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const filteredRooms = rooms.filter(r => {
    if (chatFilter === 'groups' && !isGroupish(r.roomType)) return false;
    if (chatFilter === 'direct' && r.roomType !== 'direct') return false;
    if (!roomSearch) return true;
    const name = getRoomName(r).toLowerCase();
    return name.includes(roomSearch.toLowerCase());
  });

  // ─── Task 147: build the message stream with SmartHR date separators ──
  const messageRows: ReactNode[] = [];
  let prevDayKey = '';
  messages.forEach(msg => {
    const isOwn = msg.senderId === user?.id;
    const atts = parseAttachments(msg.attachments);
    const dayKey = new Date(msg.createdAt).toDateString();
    if (dayKey !== prevDayKey) {
      prevDayKey = dayKey;
      messageRows.push(
        <div key={`sep-${msg.id}`} className="mx-auto w-fit rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-500 shadow-sm">
          {dayLabel(msg.createdAt)}
        </div>,
      );
    }
    messageRows.push(
      <div key={msg.id} className={`group flex items-end gap-2 ${isOwn ? 'justify-end' : 'justify-start'}`}>
        {/* Received: small sender avatar; Sent: no avatar (template style) */}
        {!isOwn && (
          <div className={`w-8 h-8 shrink-0 rounded-full bg-gradient-to-br ${pickGrad(msg.senderId)} text-white flex items-center justify-center text-[10px] font-bold shadow-sm`} aria-hidden="true">
            {initialsOf(`${msg.sender.firstName} ${msg.sender.lastName}`)}
          </div>
        )}
        <div className={`relative flex max-w-[75%] flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
          {/* Hover actions — visual only */}
          <div className={`absolute -top-1 ${isOwn ? 'right-full mr-1' : 'left-full ml-1'} z-10 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100`}>
            <button type="button" title="Add reaction" aria-label="Add reaction" className="rounded-full bg-white/80 p-1.5 text-slate-400 shadow-sm hover:text-[#FF9B44]">
              <TbMoodSmile className="h-3.5 w-3.5" />
            </button>
            <button type="button" title="Reply" aria-label="Reply" className="rounded-full bg-white/80 p-1.5 text-slate-400 shadow-sm hover:text-[#3A57C4]">
              <TbCornerUpLeft className="h-3.5 w-3.5" />
            </button>
          </div>
          {/* Sender label — group rooms only */}
          {!isOwn && selectedRoom && isGroupish(selectedRoom.roomType) && (
            <p className="mb-1 ml-1 text-[11px] font-bold text-[#6C4FD6]">{msg.sender.firstName} {msg.sender.lastName}</p>
          )}
          <div className={
            isOwn
              ? 'rounded-2xl rounded-tr-md bg-gradient-to-r from-[#3A57C4] to-[#4C51D6] px-4 py-2.5 text-sm text-white shadow-sm'
              : 'rounded-2xl rounded-tl-md border border-slate-100 bg-white px-4 py-2.5 text-sm text-slate-800 shadow-sm'
          }>
            {atts.length > 0 && (
              <div className="mb-1.5 space-y-1">
                {atts.map((a, i) => (
                  <div key={`${msg.id}-att-${i}`} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs ${isOwn ? 'bg-white/15 text-white' : 'border border-slate-200 bg-slate-50 text-slate-700'}`}>
                    <TbFileText className="h-3.5 w-3.5 shrink-0" />
                    {a.dataUrl ? (
                      <a href={a.dataUrl} download={a.name} className={`truncate underline ${isOwn ? 'text-white' : 'text-[#3A57C4]'}`} title="Download">
                        {a.name}
                      </a>
                    ) : (
                      <span className="truncate">{a.name}</span>
                    )}
                    <span className={`ml-auto shrink-0 ${isOwn ? 'text-white/70' : 'text-slate-400'}`}>{formatBytes(a.sizeBytes)}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="whitespace-pre-wrap break-words">{msg.body}</p>
            {isOwn && (
              <span className="mt-1 flex items-center justify-end gap-1 text-[10px] text-white/70">
                {formatTime(msg.createdAt)}
                <TbChecks className="h-3.5 w-3.5" />
                {msg.dlpStatus === 'flagged' && <TbAlertCircle className="h-3 w-3 text-amber-300" title="Flagged by DLP policy" />}
              </span>
            )}
          </div>
          {!isOwn && (
            <span className="ml-1 mt-1 flex items-center gap-1 text-[10px] text-slate-400">
              {formatTime(msg.createdAt)}
              <TbChecks className="h-3 w-3 text-emerald-500" />
              {msg.dlpStatus === 'flagged' && <TbAlertCircle className="h-3 w-3 text-amber-500" title="Flagged by DLP policy" />}
            </span>
          )}
        </div>
      </div>,
    );
  });

  return (
    <div className="space-y-4">
      {/* ─── Breadcrumb Bar (SmartHR style) ─── */}
      <div>
        <h2 className="mb-1 text-xl font-bold text-slate-900">Chat</h2>
        <nav aria-label="breadcrumb" className="flex items-center gap-1.5 text-sm text-slate-500">
          <button onClick={() => router.push('/')} className="flex items-center gap-1 transition-colors hover:text-[#3A57C4]" aria-label="Home">
            <TbHome className="h-4 w-4" />
          </button>
          <TbChevronRight className="h-3.5 w-3.5 text-slate-400" />
          <span>Pages</span>
          <TbChevronRight className="h-3.5 w-3.5 text-slate-400" />
          <span className="font-medium text-slate-700">Chat</span>
        </nav>
      </div>

      {/* ─── Chat Wrapper Card ─── */}
      <div className="flex h-[calc(100vh-190px)] min-h-[560px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {/* ═══ LEFT SIDEBAR — room list ═══ */}
        <aside className={`${selectedRoom ? 'hidden lg:flex' : 'flex'} w-full shrink-0 flex-col border-r border-slate-200 bg-white lg:w-80 lg:max-w-[20rem] xl:w-96 xl:max-w-[24rem]`}>
          {/* Header: title + filter */}
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h5 className="text-base font-bold text-slate-800">Chats</h5>
            <div className="relative">
              <button
                onClick={() => { setShowFilterMenu(v => !v); setOpenListMenu(null); setShowRoomMenu(false); }}
                className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-100"
                aria-haspopup="listbox"
                aria-expanded={showFilterMenu}
              >
                {CHAT_FILTERS.find(f => f.value === chatFilter)?.label}
                <TbChevronDown className="h-3.5 w-3.5" />
              </button>
              {showFilterMenu && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setShowFilterMenu(false)} />
                  <div className="absolute right-0 top-9 z-40 w-36 rounded-xl border border-slate-200 bg-white py-1 shadow-lg" role="listbox">
                    {CHAT_FILTERS.map(f => (
                      <button
                        key={f.value}
                        role="option"
                        aria-selected={chatFilter === f.value}
                        onClick={() => { setChatFilter(f.value); setShowFilterMenu(false); }}
                        className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs transition-colors hover:bg-slate-50 ${chatFilter === f.value ? 'font-semibold text-[#3A57C4]' : 'text-slate-600'}`}
                      >
                        {f.label}
                        {chatFilter === f.value && <TbCheck className="h-3.5 w-3.5" />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Search */}
          <div className="px-4 pt-3 pb-2">
            <div className="relative">
              <TbSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={roomSearch}
                onChange={e => setRoomSearch(e.target.value)}
                placeholder="Search"
                className="w-full rounded-full border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs text-slate-700 placeholder:text-slate-400 focus:border-[#3A57C4] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#3A57C4]/20"
              />
            </div>
          </div>

          {/* Room list */}
          <div className={`flex-1 divide-y divide-slate-100 overflow-y-auto ${SLIM_SCROLLBAR}`}>
            {loadingRooms ? (
              <div className="space-y-3 p-4">
                {[0, 1, 2, 3].map(i => (
                  <div key={i} className="flex animate-pulse items-center gap-3">
                    <div className="h-11 w-11 shrink-0 rounded-full bg-slate-100" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-2/3 rounded bg-slate-100" />
                      <div className="h-2.5 w-4/5 rounded bg-slate-50" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredRooms.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                <TbMessageCircle className="mx-auto mb-2 h-9 w-9 text-slate-300" />
                No chats yet. Start a new conversation!
              </div>
            ) : filteredRooms.map(room => {
              const isSelected = selectedRoom?.id === room.id;
              const isDirect = room.roomType === 'direct';
              const isAnnouncement = room.roomType === 'announcement';
              const lastAt = room.messages?.[0]?.createdAt || room.lastMessageAt;
              return (
                <div
                  key={room.id}
                  role="button"
                  tabIndex={0}
                  aria-current={isSelected ? 'true' : undefined}
                  onClick={() => setSelectedRoom(room)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedRoom(room); } }}
                  className={`group relative flex cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors ${isSelected ? 'bg-[#3A57C4]/5' : 'hover:bg-slate-50'}`}
                >
                  {isSelected && <span className="absolute inset-y-0 left-0 w-[3px] rounded-r bg-[#3A57C4]" aria-hidden="true" />}
                  {/* Avatar */}
                  <div className="relative shrink-0">
                    {isDirect ? (
                      <>
                        <div className={`flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br ${pickGrad(room.id)} text-xs font-bold text-white shadow-sm`}>
                          {initialsOf(getRoomName(room))}
                        </div>
                        <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" title="Online" aria-hidden="true" />
                      </>
                    ) : (
                      <div className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm ${isAnnouncement ? 'from-[#FF9B44] to-[#FF7A3D]' : 'from-[#6C4FD6] to-[#3A57C4]'}`}>
                        {getRoomIcon(room)}
                      </div>
                    )}
                  </div>
                  {/* Name + preview */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <p className="truncate text-sm font-semibold text-slate-800">{getRoomName(room)}</p>
                      {room.isE2EE && <TbLock className="h-3 w-3 shrink-0 text-[#6C4FD6]" title="End-to-end encrypted" />}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-slate-500">{room.messages?.[0]?.body || 'No messages yet'}</p>
                  </div>
                  {/* Time + unread + kebab */}
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {lastAt && <span className="text-[10px] text-slate-400">{formatListTime(lastAt)}</span>}
                    {room.unreadCount > 0 && (
                      <span className="min-w-[18px] rounded-full bg-red-500 px-1.5 text-center text-[10px] font-bold leading-4 text-white">
                        {room.unreadCount > 99 ? '99+' : room.unreadCount}
                      </span>
                    )}
                    <div className="relative">
                      <button
                        onClick={e => { e.stopPropagation(); setOpenListMenu(openListMenu === room.id ? null : room.id); setShowFilterMenu(false); setShowRoomMenu(false); }}
                        className="rounded-md p-0.5 text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-600"
                        title="Chat options"
                        aria-haspopup="menu"
                        aria-expanded={openListMenu === room.id}
                      >
                        <TbDotsVertical className="h-4 w-4" />
                      </button>
                      {openListMenu === room.id && (
                        <>
                          <div className="fixed inset-0 z-30" onClick={e => { e.stopPropagation(); setOpenListMenu(null); }} />
                          <div className="absolute right-0 top-6 z-40 w-44 rounded-xl border border-slate-200 bg-white py-1 shadow-lg" role="menu">
                            <button type="button" role="menuitem" className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50" onClick={e => { e.stopPropagation(); setOpenListMenu(null); }}>
                              <TbPin className="h-3.5 w-3.5 text-slate-400" /> Pin Chats
                            </button>
                            <button type="button" role="menuitem" className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50" onClick={e => { e.stopPropagation(); setOpenListMenu(null); }}>
                              <TbMailForward className="h-3.5 w-3.5 text-slate-400" /> Mark as Unread
                            </button>
                            <button type="button" role="menuitem" className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50" onClick={e => { e.stopPropagation(); setOpenListMenu(null); }}>
                              <TbArchive className="h-3.5 w-3.5 text-slate-400" /> Archive Chat
                            </button>
                            {isGroupish(room.roomType) && perm.canEditGroup && (
                              <button
                                type="button"
                                role="menuitem"
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"
                                onClick={e => {
                                  e.stopPropagation();
                                  setOpenListMenu(null);
                                  setSelectedRoom(room);
                                  setRenameValue(room.name || '');
                                  setShowRenameModal(true);
                                }}
                              >
                                <TbEdit className="h-3.5 w-3.5 text-[#3A57C4]" /> Rename Chat
                              </button>
                            )}
                            {((isDirect && perm.canDeleteDirect) || (isGroupish(room.roomType) && perm.canDeleteGroup)) && (
                              <button
                                type="button"
                                role="menuitem"
                                disabled={roomActionBusy}
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                                onClick={e => { e.stopPropagation(); setOpenListMenu(null); handleDeleteRoom(room); }}
                              >
                                <TbTrash className="h-3.5 w-3.5" /> Delete
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* New Chat button */}
          <div className="border-t border-slate-100 bg-white p-3">
            <button
              onClick={() => { setShowNewChatModal(true); fetchEmployees(); }}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#6C4FD6] to-[#3A57C4] py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:brightness-105 hover:shadow-md"
            >
              <TbPlus className="h-4 w-4" />
              New Chat
            </button>
          </div>
        </aside>

        {/* ═══ RIGHT CHAT PANEL ═══ */}
        <section className={`${selectedRoom ? 'flex' : 'hidden lg:flex'} min-w-0 flex-1 flex-col bg-white`}>
          {!selectedRoom ? (
            /* Empty state */
            <div className="flex h-full flex-col items-center justify-center p-6 text-slate-400">
              <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-[#6C4FD6]/10">
                <TbMessageCircle className="h-10 w-10 text-[#6C4FD6]" />
              </div>
              <p className="text-sm font-semibold text-slate-600">Select a chat to start messaging</p>
              <p className="mt-1 text-xs">Pick a conversation from the list</p>
            </div>
          ) : (
            <>
              {/* Chat header */}
              <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
                <button
                  onClick={() => setSelectedRoom(null)}
                  className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 lg:hidden"
                  title="Back to chats"
                  aria-label="Back to chats"
                >
                  <TbArrowLeft className="h-5 w-5" />
                </button>
                {selectedRoom.roomType === 'direct' ? (
                  <div className="relative shrink-0">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br ${pickGrad(selectedRoom.id)} text-xs font-bold text-white shadow-sm`}>
                      {initialsOf(getRoomName(selectedRoom))}
                    </div>
                    <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" aria-hidden="true" />
                  </div>
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm from-[#6C4FD6] to-[#3A57C4]">
                    {getRoomIcon(selectedRoom)}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h3 className="truncate font-bold text-slate-800">{getRoomName(selectedRoom)}</h3>
                    {selectedRoom.isE2EE && <TbLock className="h-3.5 w-3.5 shrink-0 text-[#6C4FD6]" title="End-to-end encrypted" />}
                  </div>
                  {selectedRoom.roomType === 'direct' ? (
                    <p className="flex items-center gap-1.5 text-xs text-emerald-500">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                      Online
                    </p>
                  ) : (
                    perm.canEditGroup ? (
                      <button
                        onClick={() => { setAddMemberIds([]); setShowAddMembersModal(true); fetchEmployees(); }}
                        className="text-left text-xs text-slate-400 transition-colors hover:text-[#3A57C4]"
                        title="Add members"
                      >
                        {selectedRoom.members.length} member{selectedRoom.members.length !== 1 ? 's' : ''}
                        {selectedRoom.roomType === 'project' ? ' · Project workspace' : ''}
                        {selectedRoom.isAnnouncement ? ' · Announcement' : ''} · Add members
                      </button>
                    ) : (
                      <p className="text-xs text-slate-400">
                        {selectedRoom.members.length} member{selectedRoom.members.length !== 1 ? 's' : ''}
                        {selectedRoom.roomType === 'project' ? ' · Project workspace' : ''}
                        {selectedRoom.isAnnouncement ? ' · Announcement' : ''}
                      </p>
                    )
                  )}
                </div>
                <div className="ml-auto flex items-center gap-1">
                  <button type="button" className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-[#3A57C4]" title="Search in conversation">
                    <TbSearch className="h-4 w-4" />
                  </button>
                  <div className="relative">
                    <button
                      onClick={() => { setShowRoomMenu(v => !v); setOpenListMenu(null); }}
                      className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-[#3A57C4]"
                      title="Chat actions"
                      aria-haspopup="menu"
                      aria-expanded={showRoomMenu}
                    >
                      <TbDotsVertical className="h-4 w-4" />
                    </button>
                    {showRoomMenu && (
                      <>
                        <div className="fixed inset-0 z-30" onClick={() => setShowRoomMenu(false)} />
                        <div className="absolute right-0 top-10 z-40 w-56 rounded-xl border border-slate-200 bg-white py-1 shadow-lg" role="menu">
                          <button type="button" role="menuitem" className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50" onClick={() => setShowRoomMenu(false)}>
                            <TbVolumeOff className="h-3.5 w-3.5 text-slate-400" /> Mute Notification
                          </button>
                          <button type="button" role="menuitem" className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50" onClick={() => setShowRoomMenu(false)}>
                            <TbUser className="h-3.5 w-3.5 text-slate-400" /> View Profile
                          </button>
                          {isGroupish(selectedRoom.roomType) && perm.canEditGroup && (
                            <button
                              type="button"
                              role="menuitem"
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"
                              onClick={() => { setShowRoomMenu(false); setAddMemberIds([]); setShowAddMembersModal(true); fetchEmployees(); }}
                            >
                              <TbUserPlus className="h-3.5 w-3.5 text-[#3A57C4]" /> Add Members
                            </button>
                          )}
                          {isGroupish(selectedRoom.roomType) && perm.canEditGroup && (
                            <button type="button" role="menuitem" className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50" onClick={openRename}>
                              <TbEdit className="h-3.5 w-3.5 text-[#3A57C4]" /> Rename Chat
                            </button>
                          )}
                          <button type="button" role="menuitem" className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50" onClick={() => setShowRoomMenu(false)}>
                            <TbEraser className="h-3.5 w-3.5 text-slate-400" /> Clear Messages
                          </button>
                          {((selectedRoom.roomType === 'direct' && perm.canDeleteDirect) ||
                            (isGroupish(selectedRoom.roomType) && perm.canDeleteGroup)) && (
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => handleDeleteRoom()}
                              disabled={roomActionBusy}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                            >
                              <TbTrash className="h-3.5 w-3.5" />
                              {selectedRoom.roomType === 'direct' ? 'Delete direct chat' : 'Delete for everyone'}
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </header>

              {/* Messages */}
              <div className={`flex-1 space-y-3 overflow-y-auto bg-slate-50/60 px-4 py-4 ${SLIM_SCROLLBAR}`}>
                {loadingMessages ? (
                  <div className="flex h-full items-center justify-center">
                    <TbRefresh className="h-5 w-5 animate-spin text-[#3A57C4]" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center text-slate-400">
                    <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-sm">
                      <TbMessageCircle className="h-8 w-8 text-[#6C4FD6]" />
                    </div>
                    <p className="text-sm font-medium">No messages yet. Say hello!</p>
                  </div>
                ) : (
                  messageRows
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Composer */}
              <footer className="border-t border-slate-200 bg-white p-3">
                {pendingAttachments.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {pendingAttachments.map((a, i) => (
                      <span key={`pending-${i}`} className="inline-flex max-w-[240px] items-center gap-1.5 rounded-lg border border-[#6C4FD6]/20 bg-[#6C4FD6]/5 px-2 py-1 text-xs text-[#6C4FD6]">
                        <TbFileText className="h-3 w-3 shrink-0" />
                        <span className="truncate">{a.name}</span>
                        <span className="shrink-0 text-slate-400">{formatBytes(a.sizeBytes)}</span>
                        <button onClick={() => setPendingAttachments(prev => prev.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-500" title="Remove">
                          <TbX className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="shrink-0 rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-[#3A57C4]"
                    title="Voice message"
                    aria-label="Voice message"
                  >
                    <TbMicrophone className="h-5 w-5" />
                  </button>
                  <div className="relative min-w-0 flex-1">
                    <input
                      type="text"
                      value={newMessage}
                      onChange={e => setNewMessage(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                      placeholder="Type Your Message"
                      className="w-full rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#3A57C4] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#3A57C4]/20"
                      aria-label="Message"
                    />
                    {showEmoji && (
                      <>
                        <div className="fixed inset-0 z-30" onClick={() => setShowEmoji(false)} />
                        <div className="absolute bottom-full left-0 z-40 mb-2 w-64 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg">
                          <div className="grid grid-cols-8 gap-1">
                            {EMOJI_PICKS.map(em => (
                              <button
                                key={em}
                                type="button"
                                onClick={() => { setNewMessage(prev => prev + em); setShowEmoji(false); }}
                                className="rounded-lg p-1 text-lg transition-colors hover:bg-slate-100"
                                title={`Insert ${em}`}
                              >
                                {em}
                              </button>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowEmoji(v => !v)}
                    className={`shrink-0 rounded-full p-2 transition-colors hover:bg-slate-100 ${showEmoji ? 'text-[#FF9B44]' : 'text-slate-400 hover:text-[#FF9B44]'}`}
                    title="Emoji"
                    aria-label="Insert emoji"
                    aria-expanded={showEmoji}
                  >
                    <TbMoodSmile className="h-5 w-5" />
                  </button>
                  <input ref={fileInputRef} type="file" multiple className="hidden" onChange={e => handleFilesPicked(e.target.files)} />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={sendingMessage}
                    className="shrink-0 rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-[#3A57C4] disabled:opacity-50"
                    title="Attach files (max 5 × 4 MB)"
                    aria-label="Attach files"
                  >
                    <TbPaperclip className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={handleSendMessage}
                    disabled={sendingMessage || (!newMessage.trim() && pendingAttachments.length === 0)}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-[#FF9B44] to-[#FF7A3D] text-white shadow-lg shadow-orange-500/30 transition-all hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                    title="Send"
                    aria-label="Send message"
                  >
                    {sendingMessage ? <TbRefresh className="h-4 w-4 animate-spin" /> : <TbSend className="h-4 w-4" />}
                  </button>
                </div>
              </footer>
            </>
          )}
        </section>
      </div>

      {/* ─── New Chat Modal ─── */}
      {showNewChatModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-800">New Conversation</h3>
              <button onClick={() => setShowNewChatModal(false)} className="text-slate-400 hover:text-slate-700" aria-label="Close">
                <TbX className="h-5 w-5" />
              </button>
            </div>

            {/* Chat Type */}
            <div className="mb-4 flex gap-2">
              <button
                onClick={() => setNewChatType('direct')}
                className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                  newChatType === 'direct'
                    ? 'bg-gradient-to-r from-[#3A57C4] to-[#6C4FD6] text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <TbMessageCircle className="mr-1 inline h-4 w-4" /> Direct
              </button>
              {/* Task 122 — group chats are manager-only; hidden otherwise */}
              {perm.canCreateGroup && (
                <button
                  onClick={() => setNewChatType('group')}
                  className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                    newChatType === 'group'
                      ? 'bg-gradient-to-r from-[#3A57C4] to-[#6C4FD6] text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <TbUsers className="mr-1 inline h-4 w-4" /> Group
                </button>
              )}
            </div>

            {newChatType === 'group' && (
              <input
                type="text"
                value={newChatName}
                onChange={e => setNewChatName(e.target.value)}
                placeholder="Group name..."
                className="mb-4 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#3A57C4] focus:outline-none focus:ring-2 focus:ring-[#3A57C4]/20"
              />
            )}

            {/* Employee Search */}
            <div className="relative mb-3">
              <TbSearch className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={employeeSearch}
                onChange={e => { setEmployeeSearch(e.target.value); if (e.target.value.length >= 2) fetchEmployees(e.target.value); }}
                placeholder="Search employees..."
                className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm focus:border-[#3A57C4] focus:outline-none focus:ring-2 focus:ring-[#3A57C4]/20"
              />
            </div>

            {/* Selected Members */}
            {newChatMembers.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {newChatMembers.map(id => {
                  const emp = employees.find(e => e.id === id);
                  return emp ? (
                    <span key={id} className="flex items-center gap-1 rounded-lg bg-[#6C4FD6]/10 px-2 py-1 text-xs text-[#6C4FD6]">
                      {emp.firstName} {emp.lastName}
                      <button onClick={() => setNewChatMembers(prev => prev.filter(m => m !== id))} className="hover:text-red-500" title="Remove">
                        <TbX className="h-3 w-3" />
                      </button>
                    </span>
                  ) : null;
                })}
              </div>
            )}

            {/* Employee List */}
            <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-100">
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
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-slate-50 ${
                    newChatMembers.includes(emp.id) ? 'bg-[#3A57C4]/5' : ''
                  }`}
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#6C4FD6] to-[#3A57C4] text-[10px] font-bold text-white">
                    {emp.firstName[0]}{emp.lastName[0]}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-800">{emp.firstName} {emp.lastName}</p>
                    <p className="text-[10px] text-slate-400">{emp.department?.name || 'No Dept'}</p>
                  </div>
                  {newChatMembers.includes(emp.id) && <TbCheck className="ml-auto h-3.5 w-3.5 shrink-0 text-[#3A57C4]" />}
                </button>
              ))}
            </div>

            <button
              onClick={handleCreateRoom}
              disabled={newChatMembers.length === 0}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#6C4FD6] to-[#3A57C4] py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <TbPlus className="h-4 w-4" />
              Create {newChatType === 'direct' ? 'Direct' : 'Group'} Chat
            </button>
          </div>
        </div>
      )}

      {/* ─── Add Members Modal (Task 120) ─── */}
      {showAddMembersModal && selectedRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-800">Add Members</h3>
              <button onClick={() => setShowAddMembersModal(false)} className="text-slate-400 hover:text-slate-700" aria-label="Close">
                <TbX className="h-5 w-5" />
              </button>
            </div>
            <p className="mb-4 text-xs text-slate-400">To “{getRoomName(selectedRoom)}” · {selectedRoom.members.length} already in</p>

            <div className="relative mb-3">
              <TbSearch className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={employeeSearch}
                onChange={e => { setEmployeeSearch(e.target.value); if (e.target.value.length >= 2) fetchEmployees(e.target.value); }}
                placeholder="Search employees..."
                className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm focus:border-[#3A57C4] focus:outline-none focus:ring-2 focus:ring-[#3A57C4]/20"
              />
            </div>

            {addMemberIds.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {addMemberIds.map(id => {
                  const emp = employees.find(e => e.id === id);
                  return emp ? (
                    <span key={id} className="flex items-center gap-1 rounded-lg bg-[#6C4FD6]/10 px-2 py-1 text-xs text-[#6C4FD6]">
                      {emp.firstName} {emp.lastName}
                      <button onClick={() => setAddMemberIds(prev => prev.filter(m => m !== id))} className="hover:text-red-500" title="Remove">
                        <TbX className="h-3 w-3" />
                      </button>
                    </span>
                  ) : null;
                })}
              </div>
            )}

            <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-100">
              {loadingEmployees ? (
                <div className="p-4 text-center text-xs text-slate-400">Loading...</div>
              ) : employees.filter(e => e.id !== user?.id && !selectedRoom.members.some(m => m.userId === e.id)).length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400">Everyone here is already in this chat</div>
              ) : employees.filter(e => e.id !== user?.id && !selectedRoom.members.some(m => m.userId === e.id)).map(emp => (
                <button
                  key={emp.id}
                  onClick={() => setAddMemberIds(prev => prev.includes(emp.id) ? prev.filter(m => m !== emp.id) : [...prev, emp.id])}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-slate-50 ${
                    addMemberIds.includes(emp.id) ? 'bg-[#3A57C4]/5' : ''
                  }`}
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#6C4FD6] to-[#3A57C4] text-[10px] font-bold text-white">
                    {emp.firstName[0]}{emp.lastName[0]}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-800">{emp.firstName} {emp.lastName}</p>
                    <p className="text-[10px] text-slate-400">{emp.department?.name || 'No Dept'}</p>
                  </div>
                  {addMemberIds.includes(emp.id) && <TbCheck className="ml-auto h-3.5 w-3.5 shrink-0 text-[#3A57C4]" />}
                </button>
              ))}
            </div>

            <button
              onClick={handleAddMembers}
              disabled={addingMembers || addMemberIds.length === 0}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#6C4FD6] to-[#3A57C4] py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <TbUserPlus className="h-4 w-4" />
              {addingMembers ? 'Adding…' : `Add ${addMemberIds.length || ''} to Chat`}
            </button>
          </div>
        </div>
      )}

      {/* ─── Rename Chat Modal (Task 122) ─── */}
      {showRenameModal && selectedRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-800">Rename Chat</h3>
              <button onClick={() => setShowRenameModal(false)} className="text-slate-400 hover:text-slate-700" aria-label="Close">
                <TbX className="h-5 w-5" />
              </button>
            </div>
            <input
              type="text"
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              placeholder="New chat name..."
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') handleRenameRoom(); }}
              className="mb-4 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#3A57C4] focus:outline-none focus:ring-2 focus:ring-[#3A57C4]/20"
            />
            <button
              onClick={handleRenameRoom}
              disabled={roomActionBusy || !renameValue.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#6C4FD6] to-[#3A57C4] py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <TbCheck className="h-4 w-4" />
              {roomActionBusy ? 'Saving…' : 'Save Name'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
