'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  FiMessageCircle, FiPlus, FiSend, FiUsers, FiLock, FiGlobe,
  FiCornerUpLeft, FiClock, FiZap, FiRefreshCw, FiAlertTriangle,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface Room {
  id: string;
  name: string | null;
  roomType: string;
  isE2EE: boolean;
  isAnnouncement: boolean;
  members: Array<{ userId: string; role: string }>;
  messages: Array<{ id: string; body: string; createdAt: string; senderId: string }>;
  _count: { messages: number };
  unreadCount: number;
  lastMessageAt: string | null;
}

interface Message {
  id: string;
  body: string;
  createdAt: string;
  senderId: string;
  sender: { id: string; firstName: string; lastName: string; avatar: string | null; email: string };
  parentMessageId: string | null;
  translatedBody: string | null;
  detectedActions: string | null;
  dlpStatus: string;
  dlpReason: string | null;
  replies?: Message[];
}

export default function ChatPage() {
  const { user } = useAuthStore();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [showNewRoomModal, setShowNewRoomModal] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // New room form state
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomType, setNewRoomType] = useState('group');
  const [newRoomMembers, setNewRoomMembers] = useState('');
  const [employees, setEmployees] = useState<Array<{ id: string; firstName: string; lastName: string; email: string }>>([]);

  const fetchRooms = useCallback(async () => {
    try {
      setLoadingRooms(true);
      const res = await fetch('/api/collaboration/chat/rooms', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setRooms(data.rooms || []);
        if (data.rooms?.length > 0 && !activeRoom) {
          setActiveRoom(data.rooms[0]);
        }
      }
    } catch (err) {
      console.error('Failed to load rooms:', err);
    } finally {
      setLoadingRooms(false);
    }
  }, [activeRoom]);

  const fetchMessages = useCallback(async (roomId: string) => {
    try {
      setLoadingMessages(true);
      const res = await fetch(`/api/collaboration/chat/rooms/${roomId}/messages?limit=50`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      } else {
        setMessages([]);
      }
    } catch (err) {
      console.error('Failed to load messages:', err);
      setMessages([]);
    } finally {
      setLoadingMessages(false);
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
    fetchRooms();
    fetchEmployees();
  }, [fetchRooms, fetchEmployees]);

  useEffect(() => {
    if (activeRoom) fetchMessages(activeRoom.id);
  }, [activeRoom, fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !activeRoom) return;
    setSending(true);
    try {
      const res = await fetch(`/api/collaboration/chat/rooms/${activeRoom.id}/messages`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          body: newMessage,
          parentMessageId: replyingTo?.id || null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setMessages((prev) => [...prev, data.message]);
        setNewMessage('');
        setReplyingTo(null);
      } else if (res.status === 422) {
        const err = await res.json();
        toast.error(`Message blocked: ${err.reason || 'DLP policy violation'}`);
      } else {
        toast.error('Failed to send message');
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleTranslate = async (messageId: string) => {
    try {
      const res = await fetch('/api/collaboration/chat/translate', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ messageId, targetLanguage: 'en' }),
      });
      if (res.ok) {
        const data = await res.json();
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId ? { ...m, translatedBody: data.translated } : m
          )
        );
        toast.success(`Translated from ${data.from}`);
      } else {
        toast.error('Translation failed');
      }
    } catch (err) {
      console.error(err);
      toast.error('Translation failed');
    }
  };

  const handleSummarize = async () => {
    if (!activeRoom) return;
    try {
      toast.loading('Generating summary...', { id: 'summarize' });
      const res = await fetch('/api/collaboration/chat/summarize', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ roomId: activeRoom.id, summaryType: 'daily' }),
      });
      if (res.ok) {
        const data = await res.json();
        toast.dismiss('summarize');
        toast.success(`Summary generated (${data.messageCount} messages)`);
        // Show summary in an alert (could be a modal in production)
        alert(`Summary (last 24h):\n\n${data.summary}\n\nKey Points:\n${(data.keyPoints || []).map((p: string) => `• ${p}`).join('\n')}\n\nAction Items:\n${(data.actionItems || []).map((a: string) => `• ${a}`).join('\n')}`);
      } else {
        toast.dismiss('summarize');
        toast.error('Summarize failed');
      }
    } catch (err) {
      console.error(err);
      toast.dismiss('summarize');
      toast.error('Summarize failed');
    }
  };

  const handleCreateRoom = async () => {
    try {
      const memberIds = newRoomMembers.split(',').map((s) => s.trim()).filter(Boolean);
      const res = await fetch('/api/collaboration/chat/rooms', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name: newRoomName,
          roomType: newRoomType,
          memberIds,
        }),
      });
      if (res.ok) {
        toast.success('Room created');
        setShowNewRoomModal(false);
        setNewRoomName('');
        setNewRoomMembers('');
        setNewRoomType('group');
        fetchRooms();
      } else {
        toast.error('Failed to create room');
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to create room');
    }
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="space-y-4 h-[calc(100vh-12rem)]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-nexus-text-primary flex items-center gap-2">
            <FiMessageCircle className="w-6 h-6 text-blue-500" />
            Chat
          </h1>
          <p className="text-sm text-nexus-text-secondary mt-1">
            1:1 (E2EE) and group messaging with threading, AI translation, and DLP protection
          </p>
        </div>
        <button
          onClick={() => setShowNewRoomModal(true)}
          className="inline-flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <FiPlus className="w-4 h-4" />
          New Chat
        </button>
      </div>

      <div className="nexus-card overflow-hidden flex h-full">
        {/* Rooms sidebar */}
        <div className="w-72 border-r border-nexus-border flex flex-col">
          <div className="p-3 border-b border-nexus-border">
            <button
              onClick={fetchRooms}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-1.5 text-xs text-nexus-text-secondary hover:bg-slate-50 rounded-md transition-colors"
            >
              <FiRefreshCw className="w-3 h-3" />
              Refresh
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loadingRooms ? (
              <div className="p-4 text-center text-xs text-nexus-text-muted">Loading...</div>
            ) : rooms.length === 0 ? (
              <div className="p-4 text-center text-xs text-nexus-text-muted">
                No chats yet. Click &quot;New Chat&quot; to start.
              </div>
            ) : (
              rooms.map((room) => (
                <button
                  key={room.id}
                  onClick={() => setActiveRoom(room)}
                  className={`w-full text-left p-3 border-b border-nexus-border hover:bg-slate-50 transition-colors ${
                    activeRoom?.id === room.id ? 'bg-blue-50' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {room.roomType === 'direct' ? (
                          <FiLock className="w-3 h-3 text-emerald-500" />
                        ) : room.roomType === 'group' ? (
                          <FiUsers className="w-3 h-3 text-blue-500" />
                        ) : room.roomType === 'announcement' ? (
                          <FiZap className="w-3 h-3 text-amber-500" />
                        ) : null}
                        <h3 className="text-sm font-medium text-nexus-text-primary truncate">
                          {room.name || (room.roomType === 'direct' ? 'Direct Chat' : 'Group')}
                        </h3>
                      </div>
                      {room.messages[0] && (
                        <p className="text-xs text-nexus-text-muted mt-1 truncate">
                          {room.messages[0].body}
                        </p>
                      )}
                      <p className="text-[10px] text-nexus-text-muted mt-1">
                        {room.lastMessageAt ? formatTime(room.lastMessageAt) : 'No messages yet'}
                      </p>
                    </div>
                    {room.unreadCount > 0 && (
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-blue-600 text-white">
                        {room.unreadCount}
                      </span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Messages panel */}
        <div className="flex-1 flex flex-col">
          {activeRoom ? (
            <>
              {/* Header */}
              <div className="p-3 border-b border-nexus-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-nexus-text-primary">
                    {activeRoom.name || (activeRoom.roomType === 'direct' ? 'Direct Chat' : 'Group')}
                  </h2>
                  {activeRoom.isE2EE && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <FiLock className="w-2.5 h-2.5" />
                      E2EE
                    </span>
                  )}
                  {activeRoom.isAnnouncement && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded bg-amber-50 text-amber-700 border border-amber-200">
                      <FiZap className="w-2.5 h-2.5" />
                      Announcement
                    </span>
                  )}
                </div>
                <button
                  onClick={handleSummarize}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs text-nexus-text-secondary hover:bg-slate-50 rounded-md transition-colors"
                  title="AI summarize last 24h"
                >
                  <FiZap className="w-3 h-3" />
                  Summarize
                </button>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/30">
                {loadingMessages ? (
                  <div className="text-center text-xs text-nexus-text-muted py-4">Loading messages...</div>
                ) : messages.length === 0 ? (
                  <div className="text-center text-xs text-nexus-text-muted py-4">
                    No messages yet. Start the conversation!
                  </div>
                ) : (
                  messages.map((msg) => (
                    <MessageBubble
                      key={msg.id}
                      message={msg}
                      currentUserId={user?.id || ''}
                      onReply={() => setReplyingTo(msg)}
                      onTranslate={() => handleTranslate(msg.id)}
                    />
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Reply indicator */}
              {replyingTo && (
                <div className="px-4 py-2 bg-slate-100 border-t border-nexus-border flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-nexus-text-secondary">
                    <FiCornerUpLeft className="w-3 h-3" />
                    <span>Replying to: <strong>{replyingTo.body.substring(0, 60)}{replyingTo.body.length > 60 ? '...' : ''}</strong></span>
                  </div>
                  <button
                    onClick={() => setReplyingTo(null)}
                    className="text-xs text-red-500 hover:underline"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {/* Input */}
              <div className="p-3 border-t border-nexus-border bg-white">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                    placeholder="Type a message..."
                    className="flex-1 px-3 py-2 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    disabled={sending}
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={sending || !newMessage.trim()}
                    className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    <FiSend className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-[10px] text-nexus-text-muted mt-1.5">
                  Messages are scanned by DLP. Credit cards, SSNs, and Aadhaar numbers will be blocked.
                </p>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-nexus-text-muted">
              Select a chat to start messaging
            </div>
          )}
        </div>
      </div>

      {/* New Room Modal */}
      {showNewRoomModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="nexus-card p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-nexus-text-primary mb-4">New Chat</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-nexus-text-secondary">Chat Type</label>
                <select
                  value={newRoomType}
                  onChange={(e) => setNewRoomType(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="direct">Direct (1:1, E2EE)</option>
                  <option value="group">Group</option>
                  <option value="announcement">Announcement Channel (admin only)</option>
                </select>
              </div>
              {newRoomType !== 'direct' && (
                <div>
                  <label className="text-xs font-medium text-nexus-text-secondary">Chat Name</label>
                  <input
                    type="text"
                    value={newRoomName}
                    onChange={(e) => setNewRoomName(e.target.value)}
                    placeholder="e.g. Project Alpha Team"
                    className="w-full mt-1 px-3 py-2 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-nexus-text-secondary">
                  Member Employee IDs (comma-separated)
                </label>
                <input
                  type="text"
                  value={newRoomMembers}
                  onChange={(e) => setNewRoomMembers(e.target.value)}
                  placeholder="e.g. emp_id_1, emp_id_2"
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
                {employees.length > 0 && (
                  <p className="text-[10px] text-nexus-text-muted mt-1">
                    {employees.length} employees available. Copy their IDs from the Employees page.
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 mt-5">
              <button
                onClick={() => setShowNewRoomModal(false)}
                className="px-3 py-1.5 text-sm text-nexus-text-secondary hover:bg-slate-100 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateRoom}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MessageBubble({
  message, currentUserId, onReply, onTranslate,
}: {
  message: Message;
  currentUserId: string;
  onReply: () => void;
  onTranslate: () => void;
}) {
  const isOwn = message.senderId === currentUserId || message.sender.email === currentUserId;
  const detectedActions = message.detectedActions ? JSON.parse(message.detectedActions) : null;

  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[70%] ${isOwn ? 'items-end' : 'items-start'} flex flex-col`}>
        {!isOwn && (
          <div className="flex items-center gap-1.5 mb-0.5 ml-1">
            {message.sender.avatar ? (
              <img src={message.sender.avatar} alt="" className="w-5 h-5 rounded-full" />
            ) : (
              <div className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white text-[10px] font-bold">
                {message.sender.firstName[0]}{message.sender.lastName[0]}
              </div>
            )}
            <span className="text-[10px] font-medium text-nexus-text-secondary">
              {message.sender.firstName} {message.sender.lastName}
            </span>
          </div>
        )}
        <div
          className={`px-3 py-2 rounded-2xl text-sm ${
            isOwn
              ? 'bg-blue-600 text-white rounded-br-sm'
              : 'bg-white border border-nexus-border text-nexus-text-primary rounded-bl-sm'
          }`}
        >
          <p className="whitespace-pre-wrap">{message.body}</p>
          {message.translatedBody && message.translatedBody !== message.body && (
            <div className={`mt-2 pt-2 border-t ${isOwn ? 'border-white/20' : 'border-nexus-border'} text-xs italic`}>
              <FiGlobe className="inline w-3 h-3 mr-1" />
              {message.translatedBody}
            </div>
          )}
          {detectedActions && detectedActions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {detectedActions.map((a: { type: string; value: string; suggestion: string }, i: number) => (
                <span key={i} className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded ${isOwn ? 'bg-white/20' : 'bg-blue-50 text-blue-700'}`}>
                  <FiClock className="w-2.5 h-2.5" />
                  {a.suggestion}
                </span>
              ))}
            </div>
          )}
          {message.dlpStatus === 'flagged' && (
            <div className={`mt-2 pt-2 border-t ${isOwn ? 'border-white/20' : 'border-amber-200'} flex items-center gap-1 text-[10px] ${isOwn ? 'text-amber-200' : 'text-amber-700'}`}>
              <FiAlertTriangle className="w-2.5 h-2.5" />
              {message.dlpReason}
            </div>
          )}
        </div>
        <div className={`flex items-center gap-2 mt-0.5 ml-1 text-[10px] text-nexus-text-muted`}>
          <span>{formatTime(message.createdAt)}</span>
          {!isOwn && (
            <>
              <button onClick={onReply} className="hover:text-blue-500 inline-flex items-center gap-0.5">
                <FiCornerUpLeft className="w-2.5 h-2.5" /> Reply
              </button>
              <button onClick={onTranslate} className="hover:text-blue-500 inline-flex items-center gap-0.5">
                <FiGlobe className="w-2.5 h-2.5" /> Translate
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
