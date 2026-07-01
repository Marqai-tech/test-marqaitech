'use client';

import { useState, useMemo } from 'react';
import {
  FiMessageCircle, FiPlus, FiSend, FiUsers, FiLock, FiGlobe,
  FiCornerUpLeft, FiSearch, FiPhone, FiVideo, FiMapPin, FiPaperclip,
  FiSmile, FiMoreVertical, FiStar, FiTrash2, FiX, FiCheck, FiImage,
  FiHash, FiCircle, FiChevronDown, FiFilter, FiArchive, FiEdit3,
} from 'react-icons/fi';

/* ── Types ── */
interface Contact {
  id: string;
  name: string;
  role: string;
  avatar: string | null;
  online: boolean;
  lastSeen?: string;
}

interface ChatRoom {
  id: string;
  name: string;
  type: 'direct' | 'group' | 'channel';
  isE2EE: boolean;
  isPinned: boolean;
  members: number;
  unreadCount: number;
  lastMessage: string;
  lastMessageTime: string;
  lastMessageSender: string;
}

interface ChatMessage {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  senderAvatar: string | null;
  body: string;
  time: string;
  date: string;
  isOwn: boolean;
  reactions: Array<{ emoji: string; count: number; reacted: boolean }>;
  replyTo?: { senderName: string; body: string };
  hasAttachment?: boolean;
  attachmentName?: string;
}

/* ── Sample Data ── */
const CONTACTS: Contact[] = [
  { id: 'c1', name: 'Priya Sharma', role: 'HR Manager', avatar: null, online: true },
  { id: 'c2', name: 'Rahul Verma', role: 'Engineering Lead', avatar: null, online: true },
  { id: 'c3', name: 'Ananya Iyer', role: 'Recruiter', avatar: null, online: false, lastSeen: '2h ago' },
  { id: 'c4', name: 'Karthik Nair', role: 'Finance Manager', avatar: null, online: true },
  { id: 'c5', name: 'Deepa Patel', role: 'People Ops', avatar: null, online: false, lastSeen: '30m ago' },
  { id: 'c6', name: 'Vikram Singh', role: 'CTO', avatar: null, online: true },
  { id: 'c7', name: 'Meera Krishnan', role: 'Design Lead', avatar: null, online: false, lastSeen: '1d ago' },
  { id: 'c8', name: 'Arjun Reddy', role: 'DevOps Engineer', avatar: null, online: true },
  { id: 'c9', name: 'Sunita Joshi', role: 'Training Manager', avatar: null, online: false, lastSeen: '5h ago' },
  { id: 'c10', name: 'Ravi Kumar', role: 'Product Manager', avatar: null, online: true },
];

const ROOMS: ChatRoom[] = [
  { id: 'r1', name: 'Priya Sharma', type: 'direct', isE2EE: true, isPinned: true, members: 2, unreadCount: 3, lastMessage: 'Please review the leave policy updates', lastMessageTime: '2m ago', lastMessageSender: 'Priya' },
  { id: 'r2', name: 'HR Team', type: 'group', isE2EE: false, isPinned: true, members: 8, unreadCount: 5, lastMessage: 'Team lunch scheduled for Friday!', lastMessageTime: '15m ago', lastMessageSender: 'Deepa' },
  { id: 'r3', name: '#announcements', type: 'channel', isE2EE: false, isPinned: false, members: 45, unreadCount: 2, lastMessage: 'New health insurance plan details', lastMessageTime: '1h ago', lastMessageSender: 'HR Admin' },
  { id: 'r4', name: 'Rahul Verma', type: 'direct', isE2EE: true, isPinned: false, members: 2, unreadCount: 0, lastMessage: 'Sprint demo at 3 PM today', lastMessageTime: '2h ago', lastMessageSender: 'Rahul' },
  { id: 'r5', name: 'Recruitment Pipeline', type: 'group', isE2EE: false, isPinned: false, members: 5, unreadCount: 8, lastMessage: '3 new candidates for Senior Dev role', lastMessageTime: '30m ago', lastMessageSender: 'Ananya' },
  { id: 'r6', name: '#general', type: 'channel', isE2EE: false, isPinned: false, members: 52, unreadCount: 0, lastMessage: 'Happy birthday Karthik!', lastMessageTime: '3h ago', lastMessageSender: 'Sunita' },
  { id: 'r7', name: 'Karthik Nair', type: 'direct', isE2EE: true, isPinned: false, members: 2, unreadCount: 1, lastMessage: 'Invoice #1042 approved', lastMessageTime: '4h ago', lastMessageSender: 'Karthik' },
  { id: 'r8', name: 'Product & Engineering', type: 'group', isE2EE: false, isPinned: false, members: 12, unreadCount: 0, lastMessage: 'Deploy v2.4 scheduled for tonight', lastMessageTime: '5h ago', lastMessageSender: 'Arjun' },
  { id: 'r9', name: '#payroll-updates', type: 'channel', isE2EE: false, isPinned: false, members: 30, unreadCount: 4, lastMessage: 'June payroll processing starts Monday', lastMessageTime: '6h ago', lastMessageSender: 'Finance' },
  { id: 'r10', name: 'Vikram Singh', type: 'direct', isE2EE: true, isPinned: false, members: 2, unreadCount: 0, lastMessage: 'Q3 budget meeting moved to Thursday', lastMessageTime: '1d ago', lastMessageSender: 'Vikram' },
  { id: 'r11', name: 'Onboarding Team', type: 'group', isE2EE: false, isPinned: false, members: 4, unreadCount: 2, lastMessage: 'New joiner kit checklist updated', lastMessageTime: '1d ago', lastMessageSender: 'Deepa' },
  { id: 'r12', name: '#random', type: 'channel', isE2EE: false, isPinned: false, members: 48, unreadCount: 0, lastMessage: 'Anyone up for cricket this weekend?', lastMessageTime: '2d ago', lastMessageSender: 'Ravi' },
];

const MESSAGES: ChatMessage[] = [
  { id: 'm1', roomId: 'r1', senderId: 'c1', senderName: 'Priya Sharma', senderAvatar: null, body: 'Hi! I\'ve updated the leave policy document with the new carry-forward rules. Can you review it before we send it company-wide?', time: '10:15 AM', date: 'Today', isOwn: false, reactions: [] },
  { id: 'm2', roomId: 'r1', senderId: 'me', senderName: 'You', senderAvatar: null, body: 'Sure, I\'ll take a look right away. Is there a specific section you want me to focus on?', time: '10:18 AM', date: 'Today', isOwn: true, reactions: [{ emoji: '👍', count: 1, reacted: false }] },
  { id: 'm3', roomId: 'r1', senderId: 'c1', senderName: 'Priya Sharma', senderAvatar: null, body: 'Mainly the encashment section and the new parental leave additions. Also check if the holiday list is updated for Q3.', time: '10:20 AM', date: 'Today', isOwn: false, reactions: [] },
  { id: 'm4', roomId: 'r1', senderId: 'me', senderName: 'You', senderAvatar: null, body: 'Got it. I noticed the encashment formula might need updating - the current one doesn\'t account for the basic+DA component.', time: '10:25 AM', date: 'Today', isOwn: true, reactions: [{ emoji: '💯', count: 1, reacted: true }] },
  { id: 'm5', roomId: 'r1', senderId: 'c1', senderName: 'Priya Sharma', senderAvatar: null, body: 'Good catch! Please update that section. Also, I\'ve attached the new parental leave policy comparison sheet.', time: '10:28 AM', date: 'Today', isOwn: false, reactions: [], hasAttachment: true, attachmentName: 'Parental_Leave_Comparison.xlsx' },
  { id: 'm6', roomId: 'r1', senderId: 'me', senderName: 'You', senderAvatar: null, body: 'Please review the leave policy updates', time: '10:32 AM', date: 'Today', isOwn: true, reactions: [], replyTo: { senderName: 'Priya Sharma', body: 'Mainly the encashment section and the new parental leave additions.' } },
  { id: 'm7', roomId: 'r2', senderId: 'c5', senderName: 'Deepa Patel', senderAvatar: null, body: 'Hey team! I\'ve scheduled a team lunch for this Friday at 12:30 PM. Venue: The Spice Kitchen. Please confirm your attendance!', time: '09:45 AM', date: 'Today', isOwn: false, reactions: [{ emoji: '🎉', count: 5, reacted: true }, { emoji: '🍕', count: 3, reacted: false }] },
  { id: 'm8', roomId: 'r2', senderId: 'c9', senderName: 'Sunita Joshi', senderAvatar: null, body: 'I\'m in! Also, can we discuss the Q3 training calendar during lunch?', time: '09:50 AM', date: 'Today', isOwn: false, reactions: [] },
  { id: 'm9', roomId: 'r2', senderId: 'me', senderName: 'You', senderAvatar: null, body: 'Count me in! And yes, Sunita - let\'s add the compliance training sessions too.', time: '10:00 AM', date: 'Today', isOwn: true, reactions: [{ emoji: '✅', count: 2, reacted: false }] },
  { id: 'm10', roomId: 'r2', senderId: 'c1', senderName: 'Priya Sharma', senderAvatar: null, body: 'Perfect! I\'ll book the private dining area so we can have our discussion. Also, Karthik confirmed - he\'ll join after his 12 PM call.', time: '10:30 AM', date: 'Today', isOwn: false, reactions: [] },
  { id: 'm11', roomId: 'r3', senderId: 'hr', senderName: 'HR Admin', senderAvatar: null, body: '📢 Company Announcement: We\'re thrilled to announce our new group health insurance partnership with Star Health. Key changes:\n\n1. Enhanced coverage up to ₹10 lakhs\n2. New maternity benefit add-on\n3. Parents coverage option\n4. Cashless facility at 8,000+ hospitals\n\nEnrollment window: July 1-15. Contact HR for details.', time: '09:00 AM', date: 'Today', isOwn: false, reactions: [{ emoji: '❤️', count: 28, reacted: true }, { emoji: '🎉', count: 15, reacted: false }] },
  { id: 'm12', roomId: 'r5', senderId: 'c3', senderName: 'Ananya Iyer', senderAvatar: null, body: '🔥 Hot leads update: 3 strong candidates for the Senior Developer position:\n\n1. Amit Gupta - 8yr exp, AWS certified\n2. Sneha Menon - 6yr exp, full-stack\n3. Rajesh Pillai - 10yr exp, team lead\n\nInterviews to be scheduled for next week. @Rahul can you confirm panel availability?', time: '09:30 AM', date: 'Today', isOwn: false, reactions: [{ emoji: '🎯', count: 3, reacted: false }], hasAttachment: true, attachmentName: 'Senior_Dev_Candidates.pdf' },
  { id: 'm13', roomId: 'r7', senderId: 'c4', senderName: 'Karthik Nair', senderAvatar: null, body: '✅ Invoice #1042 for TechCorp has been approved. Payment will be processed in the next batch (July 5). Total: ₹4,50,000 + GST.', time: '08:00 AM', date: 'Today', isOwn: false, reactions: [{ emoji: '👍', count: 2, reacted: false }] },
  { id: 'm14', roomId: 'r9', senderId: 'finance', senderName: 'Finance Team', senderAvatar: null, body: '📋 Reminder: June payroll processing starts Monday (July 3). Please ensure:\n- All attendance regularizations submitted\n- Leave encashment requests filed\n- Investment declaration updates\n- Overtime claims submitted\n\nDeadline: June 30 EOD', time: '08:30 AM', date: 'Today', isOwn: false, reactions: [{ emoji: '⚠️', count: 12, reacted: false }, { emoji: '✅', count: 8, reacted: true }] },
];

/* ── Helper ── */
function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function getAvatarColor(id: string) {
  const colors = [
    'from-blue-500 to-indigo-600',
    'from-violet-500 to-purple-600',
    'from-emerald-500 to-teal-600',
    'from-amber-500 to-orange-600',
    'from-rose-500 to-pink-600',
    'from-cyan-500 to-blue-600',
  ];
  const idx = Math.abs(id.charCodeAt(0) + (id.charCodeAt(1) || 0)) % colors.length;
  return colors[idx];
}

export default function SmartChatPage() {
  const [activeRoom, setActiveRoom] = useState<ChatRoom>(ROOMS[0]);
  const [activeTab, setActiveTab] = useState<'all' | 'direct' | 'group' | 'channel'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [showRightPanel, setShowRightPanel] = useState(false);
  const [rightPanelTab, setRightPanelTab] = useState<'info' | 'pinned' | 'files' | 'members'>('info');
  const [showNewChatModal, setShowNewChatModal] = useState(false);

  const filteredRooms = useMemo(() => {
    let list = ROOMS;
    if (activeTab !== 'all') {
      list = list.filter(r => r.type === activeTab);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(r => r.name.toLowerCase().includes(q));
    }
    // Pinned first
    return [...list].sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0));
  }, [activeTab, searchQuery]);

  const roomMessages = useMemo(() => {
    return MESSAGES.filter(m => m.roomId === activeRoom.id);
  }, [activeRoom]);

  const onlineCount = CONTACTS.filter(c => c.online).length;

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <FiMessageCircle className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-thb-text-primary">Chat</h1>
            <p className="text-xs text-thb-text-secondary">{onlineCount} colleagues online &middot; E2EE for 1:1 chats</p>
          </div>
        </div>
        <button
          onClick={() => setShowNewChatModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm"
        >
          <FiPlus className="w-4 h-4" />
          New Chat
        </button>
      </div>

      {/* Main Chat Layout */}
      <div className="thb-card overflow-hidden flex flex-1 min-h-0">
        {/* ── Left Sidebar ── */}
        <div className="w-80 border-r border-thb-border flex flex-col bg-slate-50/50">
          {/* Search */}
          <div className="p-3 border-b border-thb-border">
            <div className="relative">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-thb-text-muted" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search conversations..."
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white"
              />
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-thb-border">
            {(['all', 'direct', 'group', 'channel'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-2 text-xs font-medium capitalize transition-colors ${
                  activeTab === tab
                    ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50'
                    : 'text-thb-text-muted hover:text-thb-text-secondary'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Room List */}
          <div className="flex-1 overflow-y-auto">
            {filteredRooms.map(room => (
              <button
                key={room.id}
                onClick={() => setActiveRoom(room)}
                className={`w-full text-left p-3 border-b border-thb-border/50 hover:bg-white transition-colors ${
                  activeRoom.id === room.id ? 'bg-white shadow-sm' : ''
                }`}
              >
                <div className="flex items-start gap-2.5">
                  {/* Room Avatar */}
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                    room.type === 'channel'
                      ? 'bg-slate-200 text-slate-600'
                      : `bg-gradient-to-br ${getAvatarColor(room.id)} text-white`
                  }`}>
                    {room.type === 'channel' ? (
                      <FiHash className="w-4 h-4" />
                    ) : room.type === 'group' ? (
                      <FiUsers className="w-4 h-4" />
                    ) : (
                      <span className="text-xs font-bold">{getInitials(room.name)}</span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {room.isPinned && <FiMapPin className="w-2.5 h-2.5 text-amber-500 flex-shrink-0" />}
                        {room.isE2EE && <FiLock className="w-2.5 h-2.5 text-emerald-500 flex-shrink-0" />}
                        <h3 className="text-sm font-medium text-thb-text-primary truncate">{room.name}</h3>
                      </div>
                      <span className="text-[10px] text-thb-text-muted flex-shrink-0 ml-2">{room.lastMessageTime}</span>
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <p className="text-xs text-thb-text-muted truncate pr-2">
                        <span className="font-medium text-thb-text-secondary">{room.lastMessageSender}: </span>
                        {room.lastMessage}
                      </p>
                      {room.unreadCount > 0 && (
                        <span className="flex-shrink-0 min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full bg-blue-600 text-white flex items-center justify-center">
                          {room.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Online Contacts */}
          <div className="p-3 border-t border-thb-border bg-white">
            <h4 className="text-[10px] font-semibold uppercase tracking-wider text-thb-text-muted mb-2">Online — {onlineCount}</h4>
            <div className="flex -space-x-1.5">
              {CONTACTS.filter(c => c.online).slice(0, 8).map(c => (
                <div
                  key={c.id}
                  className="relative w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center ring-2 ring-white"
                  title={c.name}
                >
                  <span className="text-[9px] font-bold text-white">{getInitials(c.name)}</span>
                  <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full ring-2 ring-white" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Center Chat Area ── */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Chat Header */}
          <div className="px-4 py-3 border-b border-thb-border flex items-center justify-between bg-white">
            <div className="flex items-center gap-2.5">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center ${
                activeRoom.type === 'channel'
                  ? 'bg-slate-200 text-slate-600'
                  : `bg-gradient-to-br ${getAvatarColor(activeRoom.id)} text-white`
              }`}>
                {activeRoom.type === 'channel' ? (
                  <FiHash className="w-4 h-4" />
                ) : activeRoom.type === 'group' ? (
                  <FiUsers className="w-4 h-4" />
                ) : (
                  <span className="text-xs font-bold">{getInitials(activeRoom.name)}</span>
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-thb-text-primary">{activeRoom.name}</h2>
                  {activeRoom.isE2EE && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-medium rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <FiLock className="w-2 h-2" /> E2EE
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-thb-text-muted">
                  {activeRoom.type === 'channel' ? `${activeRoom.members} members` : `${activeRoom.members} participants`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button className="p-2 text-thb-text-muted hover:bg-slate-100 hover:text-blue-600 rounded-lg transition-colors" title="Audio call">
                <FiPhone className="w-4 h-4" />
              </button>
              <button className="p-2 text-thb-text-muted hover:bg-slate-100 hover:text-violet-600 rounded-lg transition-colors" title="Video call">
                <FiVideo className="w-4 h-4" />
              </button>
              <button className="p-2 text-thb-text-muted hover:bg-slate-100 hover:text-amber-600 rounded-lg transition-colors" title="Search in chat">
                <FiSearch className="w-4 h-4" />
              </button>
              <button
                onClick={() => setShowRightPanel(!showRightPanel)}
                className={`p-2 rounded-lg transition-colors ${showRightPanel ? 'bg-blue-50 text-blue-600' : 'text-thb-text-muted hover:bg-slate-100 hover:text-blue-600'}`}
                title="Room info"
              >
                <FiMoreVertical className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/30">
            {/* Date separator */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-thb-border" />
              <span className="text-[10px] font-medium text-thb-text-muted px-2 py-0.5 bg-white rounded-full border border-thb-border">Today</span>
              <div className="flex-1 h-px bg-thb-border" />
            </div>

            {roomMessages.map(msg => (
              <MessageBubble key={msg.id} message={msg} />
            ))}

            {roomMessages.length === 0 && (
              <div className="flex-1 flex items-center justify-center text-sm text-thb-text-muted py-8">
                <div className="text-center">
                  <FiMessageCircle className="w-12 h-12 mx-auto mb-3 text-thb-text-muted/30" />
                  <p className="font-medium">No messages yet</p>
                  <p className="text-xs mt-1">Start the conversation!</p>
                </div>
              </div>
            )}

            {/* Typing indicator */}
            <div className="flex items-center gap-2 pl-2">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-thb-text-muted rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-thb-text-muted rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-thb-text-muted rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <span className="text-[10px] text-thb-text-muted">Priya is typing...</span>
            </div>
          </div>

          {/* Message Input */}
          <div className="p-3 border-t border-thb-border bg-white">
            <div className="flex items-end gap-2">
              <div className="flex items-center gap-1 flex-shrink-0 pb-2">
                <button className="p-1.5 text-thb-text-muted hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="Attach file">
                  <FiPaperclip className="w-4 h-4" />
                </button>
                <button className="p-1.5 text-thb-text-muted hover:text-amber-600 hover:bg-amber-50 rounded transition-colors" title="Emoji">
                  <FiSmile className="w-4 h-4" />
                </button>
                <button className="p-1.5 text-thb-text-muted hover:text-violet-600 hover:bg-violet-50 rounded transition-colors" title="Mention @">
                  <FiUsers className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); setNewMessage(''); } }}
                  placeholder={`Message ${activeRoom.name}...`}
                  className="w-full px-4 py-2.5 rounded-xl border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300"
                />
              </div>
              <button
                disabled={!newMessage.trim()}
                className="p-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
              >
                <FiSend className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[9px] text-thb-text-muted mt-1.5 pl-1">
              Messages protected by DLP. Press Enter to send.
            </p>
          </div>
        </div>

        {/* ── Right Panel ── */}
        {showRightPanel && (
          <div className="w-72 border-l border-thb-border flex flex-col bg-white">
            {/* Panel Tabs */}
            <div className="flex border-b border-thb-border">
              {(['info', 'pinned', 'files', 'members'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setRightPanelTab(tab)}
                  className={`flex-1 py-2.5 text-[10px] font-medium capitalize transition-colors ${
                    rightPanelTab === tab
                      ? 'text-blue-600 border-b-2 border-blue-600'
                      : 'text-thb-text-muted hover:text-thb-text-secondary'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {rightPanelTab === 'info' && (
                <div className="space-y-4">
                  <div className="text-center">
                    <div className={`w-16 h-16 rounded-full mx-auto mb-3 flex items-center justify-center ${
                      activeRoom.type === 'channel'
                        ? 'bg-slate-200 text-slate-600'
                        : `bg-gradient-to-br ${getAvatarColor(activeRoom.id)} text-white`
                    }`}>
                      {activeRoom.type === 'channel' ? (
                        <FiHash className="w-6 h-6" />
                      ) : activeRoom.type === 'group' ? (
                        <FiUsers className="w-6 h-6" />
                      ) : (
                        <span className="text-lg font-bold">{getInitials(activeRoom.name)}</span>
                      )}
                    </div>
                    <h3 className="text-sm font-semibold text-thb-text-primary">{activeRoom.name}</h3>
                    <p className="text-xs text-thb-text-muted mt-0.5">
                      {activeRoom.type === 'direct' ? 'Direct Message' : activeRoom.type === 'group' ? 'Group Chat' : 'Channel'}
                      {' '}&middot; {activeRoom.members} {activeRoom.type === 'channel' ? 'members' : 'participants'}
                    </p>
                  </div>

                  {activeRoom.isE2EE && (
                    <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                      <div className="flex items-center gap-2 mb-1">
                        <FiLock className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-xs font-medium text-emerald-700">End-to-End Encrypted</span>
                      </div>
                      <p className="text-[10px] text-emerald-600">Messages are encrypted. Only participants can read them.</p>
                    </div>
                  )}

                  <div>
                    <h4 className="text-[10px] font-semibold uppercase tracking-wider text-thb-text-muted mb-2">Created</h4>
                    <p className="text-xs text-thb-text-secondary">January 15, 2025</p>
                  </div>

                  <div>
                    <h4 className="text-[10px] font-semibold uppercase tracking-wider text-thb-text-muted mb-2">Shared Media</h4>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[1,2,3,4,5,6].map(i => (
                        <div key={i} className="aspect-square rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
                          <FiImage className="w-4 h-4 text-thb-text-muted" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {rightPanelTab === 'pinned' && (
                <div className="space-y-3">
                  <h4 className="text-[10px] font-semibold uppercase tracking-wider text-thb-text-muted">Pinned Messages</h4>
                  <div className="p-3 rounded-lg border border-thb-border bg-slate-50">
                    <p className="text-xs text-thb-text-primary">📢 Company Announcement: New health insurance partnership</p>
                    <p className="text-[10px] text-thb-text-muted mt-1">HR Admin &middot; Today 9:00 AM</p>
                  </div>
                  <div className="p-3 rounded-lg border border-thb-border bg-slate-50">
                    <p className="text-xs text-thb-text-primary">Team lunch Friday at Spice Kitchen 12:30 PM</p>
                    <p className="text-[10px] text-thb-text-muted mt-1">Deepa Patel &middot; Today 9:45 AM</p>
                  </div>
                </div>
              )}

              {rightPanelTab === 'files' && (
                <div className="space-y-3">
                  <h4 className="text-[10px] font-semibold uppercase tracking-wider text-thb-text-muted">Shared Files</h4>
                  <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer">
                    <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
                      <FiImage className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-thb-text-primary truncate">Parental_Leave_Comparison.xlsx</p>
                      <p className="text-[10px] text-thb-text-muted">245 KB &middot; Priya Sharma</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer">
                    <div className="w-9 h-9 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0">
                      <FiHash className="w-4 h-4 text-red-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-thb-text-primary truncate">Senior_Dev_Candidates.pdf</p>
                      <p className="text-[10px] text-thb-text-muted">1.2 MB &middot; Ananya Iyer</p>
                    </div>
                  </div>
                </div>
              )}

              {rightPanelTab === 'members' && (
                <div className="space-y-2">
                  <h4 className="text-[10px] font-semibold uppercase tracking-wider text-thb-text-muted mb-2">
                    Members ({activeRoom.members})
                  </h4>
                  {CONTACTS.slice(0, activeRoom.members).map(c => (
                    <div key={c.id} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-slate-50 transition-colors">
                      <div className="relative">
                        <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${getAvatarColor(c.id)} flex items-center justify-center`}>
                          <span className="text-[10px] font-bold text-white">{getInitials(c.name)}</span>
                        </div>
                        {c.online && (
                          <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full ring-2 ring-white" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-thb-text-primary truncate">{c.name}</p>
                        <p className="text-[10px] text-thb-text-muted">{c.role}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* New Chat Modal */}
      {showNewChatModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="thb-card p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-thb-text-primary">New Chat</h3>
              <button onClick={() => setShowNewChatModal(false)} className="text-thb-text-muted hover:text-thb-text-primary">
                <FiX className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-thb-text-secondary">Chat Type</label>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  {(['direct', 'group', 'channel'] as const).map(type => (
                    <button
                      key={type}
                      className="p-2.5 rounded-lg border border-thb-border text-center hover:bg-blue-50 hover:border-blue-200 transition-colors"
                    >
                      {type === 'direct' ? <FiLock className="w-4 h-4 mx-auto text-emerald-500" /> :
                       type === 'group' ? <FiUsers className="w-4 h-4 mx-auto text-blue-500" /> :
                       <FiHash className="w-4 h-4 mx-auto text-violet-500" />}
                      <p className="text-[10px] mt-1 text-thb-text-secondary capitalize">{type}</p>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-thb-text-secondary">Chat Name</label>
                <input
                  type="text"
                  placeholder="e.g. Project Alpha Team"
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-thb-text-secondary">Add Members</label>
                <div className="mt-1 max-h-40 overflow-y-auto border border-thb-border rounded-lg">
                  {CONTACTS.map(c => (
                    <label key={c.id} className="flex items-center gap-2 p-2 hover:bg-slate-50 cursor-pointer">
                      <input type="checkbox" className="rounded" />
                      <div className={`w-6 h-6 rounded-full bg-gradient-to-br ${getAvatarColor(c.id)} flex items-center justify-center`}>
                        <span className="text-[8px] font-bold text-white">{getInitials(c.name)}</span>
                      </div>
                      <span className="text-xs">{c.name}</span>
                      {c.online && <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 mt-5">
              <button
                onClick={() => setShowNewChatModal(false)}
                className="px-4 py-2 text-sm text-thb-text-secondary hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => setShowNewChatModal(false)}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Create Chat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Message Bubble Component ── */
function MessageBubble({ message }: { message: ChatMessage }) {
  return (
    <div className={`flex ${message.isOwn ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex gap-2 max-w-[75%] ${message.isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
        {!message.isOwn && (
          <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${getAvatarColor(message.senderId)} flex items-center justify-center flex-shrink-0 mt-1`}>
            <span className="text-[8px] font-bold text-white">{getInitials(message.senderName)}</span>
          </div>
        )}
        <div className={`${message.isOwn ? 'items-end' : 'items-start'} flex flex-col`}>
          {!message.isOwn && (
            <span className="text-[10px] font-medium text-thb-text-secondary mb-0.5 ml-1">{message.senderName}</span>
          )}

          {/* Reply indicator */}
          {message.replyTo && (
            <div className={`mb-1 px-3 py-1.5 rounded-lg text-[10px] border-l-2 ${
              message.isOwn ? 'border-blue-400 bg-blue-50' : 'border-slate-300 bg-slate-50'
            }`}>
              <span className="font-medium">{message.replyTo.senderName}: </span>
              <span className="text-thb-text-muted">{message.replyTo.body}</span>
            </div>
          )}

          <div className={`px-3.5 py-2.5 rounded-2xl text-sm ${
            message.isOwn
              ? 'bg-blue-600 text-white rounded-br-md'
              : 'bg-white border border-thb-border text-thb-text-primary rounded-bl-md shadow-sm'
          }`}>
            <p className="whitespace-pre-wrap leading-relaxed">{message.body}</p>
            {message.hasAttachment && (
              <div className={`mt-2 p-2 rounded-lg flex items-center gap-2 ${
                message.isOwn ? 'bg-white/10' : 'bg-slate-50 border border-thb-border'
              }`}>
                <FiPaperclip className={`w-3.5 h-3.5 ${message.isOwn ? 'text-blue-200' : 'text-thb-text-muted'}`} />
                <span className={`text-xs ${message.isOwn ? 'text-blue-100' : 'text-thb-text-secondary'}`}>{message.attachmentName}</span>
              </div>
            )}
          </div>

          {/* Reactions */}
          {message.reactions.length > 0 && (
            <div className={`flex gap-1 mt-1 ${message.isOwn ? 'justify-end' : 'justify-start'} ml-1`}>
              {message.reactions.map((r, i) => (
                <button
                  key={i}
                  className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] rounded-full border transition-colors ${
                    r.reacted
                      ? 'border-blue-300 bg-blue-50 text-blue-700'
                      : 'border-thb-border bg-white text-thb-text-secondary hover:border-slate-300'
                  }`}
                >
                  <span>{r.emoji}</span>
                  <span className="font-medium">{r.count}</span>
                </button>
              ))}
            </div>
          )}

          <span className="text-[9px] text-thb-text-muted mt-0.5 ml-1">{message.time}</span>
        </div>
      </div>
    </div>
  );
}
