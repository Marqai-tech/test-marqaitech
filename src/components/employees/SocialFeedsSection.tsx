'use client';

/**
 * Task 138 — Social Feeds section for the Employee module Dashboard
 * (inserted right after Overview: the Dashboard tab renders it inline).
 *
 * - Employees see the feeds shared by HR / admins (and by employees that the
 *   admin enabled in Collaboration → Settings → Social Feed Governance).
 * - EVERY login can RESPOND (like / comment). Raising a feed is governed:
 *   admins always; employees only when the admin enables them — the server
 *   returns `canCreate` and the UI hides the composer accordingly.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { FiHeart, FiMessageSquare, FiSend, FiUsers, FiArrowRight, FiLock, FiLoader, FiBookmark, FiImage, FiPaperclip, FiX } from 'react-icons/fi';
import { openDocumentInNewTab } from '@/lib/document-viewer';
import toast from 'react-hot-toast';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface FeedComment {
  id: string;
  content: string;
  createdAt: string;
  author?: { firstName?: string; lastName?: string; avatar?: string | null };
}

interface FeedPost {
  id: string;
  content: string;
  postType: string;
  isPinned: boolean;
  likesCount: number;
  commentsCount: number;
  createdAt: string;
  isLikedByMe?: boolean;
  attachments?: Array<{ type: string; url: string; name?: string }>;
  author?: { firstName?: string; lastName?: string; avatar?: string | null; designation?: { name?: string } | null };
  comments?: FeedComment[];
}

function initialsOf(p?: FeedPost['author']): string {
  return `${p?.firstName?.[0] || ''}${p?.lastName?.[0] || ''}`.toUpperCase() || '?';
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

const TYPE_COLORS: Record<string, string> = {
  announcement: 'bg-rose-50 text-rose-600 border-rose-200',
  achievement: 'bg-amber-50 text-amber-600 border-amber-200',
  birthday: 'bg-fuchsia-50 text-fuchsia-600 border-fuchsia-200',
  welcome: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  policy: 'bg-sky-50 text-sky-600 border-sky-200',
  event: 'bg-violet-50 text-violet-600 border-violet-200',
  general: 'bg-slate-100 text-slate-600 border-slate-200',
};

export default function SocialFeedsSection({ variant = 'full', onViewAll }: { variant?: 'full' | 'compact'; onViewAll?: () => void }) {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [creationMode, setCreationMode] = useState<string>('admins');
  const [loading, setLoading] = useState(true);
  const [composer, setComposer] = useState('');
  const [posting, setPosting] = useState(false);
  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({});
  const [openComments, setOpenComments] = useState<Set<string>>(new Set());
  // Task 139 — composer attachments (working icons) + emoji
  const [feedAttachments, setFeedAttachments] = useState<Array<{ type: string; url: string; name?: string }>>([]);
  const [showEmoji, setShowEmoji] = useState(false);
  const feedImageRef = useRef<HTMLInputElement>(null);
  const feedFileRef = useRef<HTMLInputElement>(null);
  const FEED_EMOJIS = ['\u{1F600}', '\u{1F389}', '\u{1F44F}', '\u{1F64C}', '\u{1F525}', '\u2764\uFE0F', '\u{1F382}', '\u{1F3C6}', '\u2705', '\u{1F4A1}', '\u{1F680}', '\u{1F60A}', '\u{1F973}', '\u{1F4AA}', '\u2615', '\u2B50', '\u{1F4E2}', '\u{1F3AF}', '\u{1F64F}', '\u{1F60D}', '\u{1F91D}', '\u1F605'];

  const pickFeedAttachment = (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'file') => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) { toast.error('Attachment must be under 3MB'); return; }
    const reader = new FileReader();
    reader.onloadend = () => setFeedAttachments((prev) => [...prev.slice(0, 3), { type, url: String(reader.result), name: file.name }]);
    reader.readAsDataURL(file);
  };

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/social-feed?limit=${variant === 'compact' ? 10 : 50}`, { headers: getAuthHeaders() });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to load feeds');
      setPosts(d.posts || []);
      setCanCreate(Boolean(d.canCreate));
      setCreationMode(d.creationMode || 'admins');
    } catch {
      /* section stays empty on failure — non-critical */
    } finally {
      setLoading(false);
    }
  }, [variant]);

  useEffect(() => { load(); }, [load]);

  const createPost = async () => {
    const text = composer.trim();
    if (!text) return;
    setPosting(true);
    try {
      const res = await fetch('/api/social-feed', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ content: text, postType: 'general', attachments: feedAttachments.length ? feedAttachments : undefined }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Could not raise the feed');
      setComposer('');
      setFeedAttachments([]);
      setShowEmoji(false);
      toast.success('Feed shared');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not raise the feed');
    } finally {
      setPosting(false);
    }
  };

  const toggleLike = async (p: FeedPost) => {
    setPosts((prev) => prev.map((x) => (x.id === p.id
      ? { ...x, isLikedByMe: !x.isLikedByMe, likesCount: x.isLikedByMe ? Math.max(0, x.likesCount - 1) : x.likesCount + 1 }
      : x)));
    try {
      await fetch('/api/social-feed', {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ id: p.id, action: 'like' }),
      });
    } catch {
      setPosts((prev) => prev.map((x) => (x.id === p.id
        ? { ...x, isLikedByMe: !x.isLikedByMe, likesCount: x.isLikedByMe ? x.likesCount + 1 : Math.max(0, x.likesCount - 1) }
        : x)));
    }
  };

  const addComment = async (p: FeedPost) => {
    const text = (commentDraft[p.id] || '').trim();
    if (!text) return;
    try {
      const res = await fetch('/api/social-feed', {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ id: p.id, action: 'comment', commentContent: text }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Could not post the comment');
      setCommentDraft((m) => ({ ...m, [p.id]: '' }));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not post the comment');
    }
  };

  const shown = variant === 'compact' ? posts.slice(0, 3) : posts;
  const compact = variant === 'compact';

  return (
    <div className="thb-card p-5">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-thb-text-primary flex items-center gap-2">
          <FiUsers className="w-4 h-4 text-teal-500" />
          Social Feeds
          <span className="text-[10px] font-medium text-thb-text-muted normal-case">shared by HR / employees from their logins</span>
        </h3>
        {compact && onViewAll && (
          <button onClick={onViewAll} className="flex items-center gap-1 text-xs text-green-600 hover:text-green-700 font-medium transition-colors">
            View All <FiArrowRight className="w-3 h-3" />
          </button>
        )}
      </div>
      <p className="text-xs text-thb-text-muted mb-4">
        Respond with a like or a comment. {canCreate
          ? 'You can also raise feeds from your login.'
          : `Raising feeds is currently ${creationMode === 'selected' ? 'limited to HR/Admin and the employees they enabled' : 'reserved for HR / Admin'} — Collaboration → Settings → Social Feed controls it.`}
      </p>

      {/* Composer — only when the governance allows this login to RAISE feeds */}
      {!compact && canCreate && (
        <div className="mb-4 rounded-xl border border-thb-border bg-slate-50/50 p-3 space-y-2">
          <textarea
            value={composer}
            onChange={(e) => setComposer(e.target.value)}
            placeholder="Share something with your team…"
            className="w-full min-h-[64px] px-3 py-2 rounded-xl border border-thb-border bg-white text-sm resize-none focus:outline-none focus:ring-2 focus:ring-teal-500/25 focus:border-teal-300"
          />
          {feedAttachments.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {feedAttachments.map((a, ai) => (
                <span key={ai} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white border border-slate-200 text-[11px] text-slate-600">
                  {a.type === 'image' ? <FiImage className="w-3 h-3" /> : <FiPaperclip className="w-3 h-3" />} {a.name || (a.type === 'image' ? 'Image' : 'File')}
                  <button onClick={() => setFeedAttachments((prev) => prev.filter((_, i) => i !== ai))} className="text-red-400 hover:text-red-600"><FiX className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
          )}
          {showEmoji && (
            <div className="p-2 rounded-xl border border-thb-border bg-white shadow-lg grid grid-cols-8 gap-1 w-64">
              {FEED_EMOJIS.map((em) => (
                <button key={em} onClick={() => { setComposer((t) => t + em); setShowEmoji(false); }} className="p-1 text-lg hover:bg-slate-100 rounded">{em}</button>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <button onClick={() => feedImageRef.current?.click()} className="p-2 rounded-lg text-thb-text-muted hover:text-teal-600 hover:bg-teal-50 transition" title="Add image"><FiImage className="w-4 h-4" /></button>
              <input ref={feedImageRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickFeedAttachment(e, 'image')} />
              <button onClick={() => setShowEmoji((v) => !v)} className="p-2 rounded-lg text-thb-text-muted hover:text-teal-600 hover:bg-teal-50 transition" title="Add emoji"><FiMessageSquare className="w-4 h-4 rotate-90" /></button>
              <button onClick={() => feedFileRef.current?.click()} className="p-2 rounded-lg text-thb-text-muted hover:text-teal-600 hover:bg-teal-50 transition" title="Attach file"><FiPaperclip className="w-4 h-4" /></button>
              <input ref={feedFileRef} type="file" accept=".pdf,image/jpeg,image/png,.doc,.docx" className="hidden" onChange={(e) => pickFeedAttachment(e, 'file')} />
            </div>
            <button
              onClick={createPost}
              disabled={posting || !composer.trim()}
              className="px-3 py-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40 hover:opacity-90 transition"
            >
              {posting ? <FiLoader className="w-3.5 h-3.5 animate-spin" /> : <FiSend className="w-3.5 h-3.5" />} Post
            </button>
          </div>
        </div>
      )}
      {!compact && !canCreate && (
        <div className="flex items-center gap-2 mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-thb-text-secondary">
          <FiLock className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
          Respond-only mode — you can like and comment on the feeds below. HR/Admin can enable feed creation for specific employees in Collaboration → Settings.
        </div>
      )}

      {loading ? (
        <div className="py-6 text-center text-sm text-thb-text-muted flex items-center justify-center gap-2">
          <FiLoader className="w-4 h-4 animate-spin text-teal-500" /> Loading feeds…
        </div>
      ) : shown.length === 0 ? (
        <div className="py-6 text-center">
          <FiUsers className="w-8 h-8 mx-auto text-slate-200 mb-2" />
          <p className="text-sm text-thb-text-muted">No feeds yet — HR/Admin shares will appear here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map((p) => (
            <div key={p.id} className="rounded-xl border border-thb-border bg-white/80 p-3.5">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-teal-400 to-emerald-500 flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0 overflow-hidden">
                  {p.author?.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.author.avatar} alt="" className="w-full h-full object-cover" />
                  ) : (
                    initialsOf(p.author)
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-thb-text-primary flex items-center gap-1.5 flex-wrap">
                    {`${p.author?.firstName || ''} ${p.author?.lastName || ''}`.trim() || 'Team'}
                    {p.isPinned && <FiBookmark className="w-3 h-3 text-amber-500" title="Pinned" />}
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${TYPE_COLORS[p.postType] || TYPE_COLORS.general}`}>
                      {p.postType}
                    </span>
                  </p>
                  <p className="text-[11px] text-thb-text-muted">{p.author?.designation?.name || 'Team'} · {timeAgo(p.createdAt)}</p>
                </div>
              </div>
              <p className="text-sm text-thb-text-primary mt-2 whitespace-pre-wrap break-words">{p.content}</p>
              {(p.attachments || []).length > 0 && (
                <div className="mt-2 space-y-2">
                  {(p.attachments || []).filter((a) => a?.url).map((a, ai) => (
                    a.type === 'image' ? (
                      <button key={ai} type="button" onClick={() => openDocumentInNewTab(a.url, a.name)} className="block w-full">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={a.url} alt={a.name || 'attachment'} className="max-h-72 w-full object-cover rounded-xl border border-thb-border" />
                      </button>
                    ) : (
                      <button key={ai} type="button" onClick={() => openDocumentInNewTab(a.url, a.name)} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-thb-border bg-slate-50 text-xs font-medium text-thb-text-secondary hover:bg-slate-100">
                        <FiPaperclip className="w-3.5 h-3.5" /> {a.name || 'Attachment'} · open
                      </button>
                    )
                  ))}
                </div>
              )}

              <div className="flex items-center gap-4 mt-2.5">
                <button
                  onClick={() => toggleLike(p)}
                  className={`flex items-center gap-1.5 text-xs font-medium transition ${p.isLikedByMe ? 'text-rose-500' : 'text-thb-text-muted hover:text-rose-500'}`}
                >
                  <FiHeart className={`w-3.5 h-3.5 ${p.isLikedByMe ? 'fill-current' : ''}`} /> {p.likesCount || 0}
                </button>
                <button
                  onClick={() => setOpenComments((prev) => {
                    const next = new Set(prev);
                    if (next.has(p.id)) next.delete(p.id); else next.add(p.id);
                    return next;
                  })}
                  className="flex items-center gap-1.5 text-xs font-medium text-thb-text-muted hover:text-teal-600 transition"
                >
                  <FiMessageSquare className="w-3.5 h-3.5" /> {p.commentsCount || 0} comment{(p.commentsCount || 0) === 1 ? '' : 's'}
                </button>
              </div>

              {openComments.has(p.id) && (
                <div className="mt-2.5 pl-3 border-l-2 border-slate-100 space-y-2">
                {(p.comments || []).length === 0 && <p className="text-[11px] text-thb-text-muted">No responses yet — be the first to respond.</p>}
                  {(p.comments || []).map((c) => (
                    <div key={c.id} className="text-xs">
                      <p className="font-semibold text-thb-text-primary">
                        {`${c.author?.firstName || ''} ${c.author?.lastName || ''}`.trim() || 'Colleague'}
                        <span className="font-normal text-thb-text-muted"> · {timeAgo(c.createdAt)}</span>
                      </p>
                      <p className="text-thb-text-secondary">{c.content}</p>
                    </div>
                  ))}
                </div>
              )}
              {/* Task 139 — comment input ALWAYS visible so employees can respond */}
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="text"
                  value={commentDraft[p.id] || ''}
                  onChange={(e) => setCommentDraft((m) => ({ ...m, [p.id]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter') addComment(p); }}
                  placeholder="Write a response…"
                  className="flex-1 px-3 py-1.5 rounded-full border border-thb-border text-xs bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-500/25"
                />
                <button
                  onClick={() => addComment(p)}
                  disabled={!(commentDraft[p.id] || '').trim()}
                  className="p-2 rounded-full bg-teal-50 text-teal-600 disabled:opacity-40 hover:bg-teal-100 transition"
                  aria-label="Post comment"
                >
                  <FiSend className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
