'use client';

/**
 * Task 145 — Social Feeds section for the EMPLOYEE dashboard, following the
 * SmartHR social-feed pattern (smarthr.co.in/demo/html/social-feed.html):
 *
 *   • Create Post composer — avatar + "What's on your mind?" textarea +
 *     media/link/attach icon chips + orange gradient "Share Post" button
 *     (shown only when feed governance allows the user to create posts).
 *   • Post cards — author avatar + name + designation + time-ago, content
 *     with #hashtags highlighted, pinned badge, like (heart) toggle,
 *     comment thread expander with inline reply box.
 *   • "View all" jumps to the full Collaboration → Social Feed page.
 *
 * Backed by the existing governed /api/social-feed API (GET/POST/PATCH).
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  FiHeart, FiMessageSquare, FiShare2, FiSend, FiPlus,
  FiChevronDown, FiChevronUp, FiImage, FiLink2, FiPaperclip, FiSmile,
} from 'react-icons/fi';
import { SkeletonBlock } from '@/components/dashboard/smarthr-widgets';
import { useAuthStore } from '@/store/authStore';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

interface FeedAuthor {
  firstName?: string;
  lastName?: string;
  avatar?: string | null;
  designation?: { title?: string } | null;
}

interface FeedComment {
  id: string;
  content: string;
  createdAt: string;
  author?: FeedAuthor | null;
}

export interface FeedPost {
  id: string;
  content: string;
  postType: string;
  isPinned?: boolean;
  likesCount?: number;
  commentsCount?: number;
  isLikedByMe?: boolean;
  attachments?: unknown[];
  hashtags?: string[] | null;
  createdAt: string;
  author?: FeedAuthor | null;
  comments?: FeedComment[];
}

function timeAgo(iso: string) {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'Just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

const AVATAR_TONES = [
  'bg-[#3A57C4]', 'bg-[#6C4FD6]', 'bg-[#FF9B44]', 'bg-[#009EFB]', 'bg-[#10B981]', 'bg-[#EC4899]', 'bg-[#14B8A6]',
];
function toneFor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length];
}

function Avatar({ name, avatar, size = 'w-10 h-10 text-sm' }: { name: string; avatar?: string | null; size?: string }) {
  const initial = (name || '?').trim()[0]?.toUpperCase() || '?';
  if (avatar) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatar} alt={name} className={`${size} rounded-full object-cover ring-2 ring-white shadow-sm flex-shrink-0`} />;
  }
  return (
    <div className={`${size} ${toneFor(name || '?')} rounded-full flex items-center justify-center text-white font-bold ring-2 ring-white shadow-sm flex-shrink-0`}>
      {initial}
    </div>
  );
}

/** Renders post content with #hashtags highlighted in the 3Boxes royal blue. */
function PostContent({ content }: { content: string }) {
  const parts = content.split(/(#[\w-]+)/g);
  return (
    <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
      {parts.map((p, i) =>
        p.startsWith('#') ? (
          <span key={i} className="text-[#3A57C4] font-semibold">{p}</span>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </p>
  );
}

export default function SocialFeedSection({ limit = 8 }: { limit?: number }) {
  const router = useRouter();
  const { user } = useAuthStore();
  const myName = user?.name || 'You';

  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [openComments, setOpenComments] = useState<Set<string>>(new Set());
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});

  const fetchFeed = useCallback(async () => {
    try {
      const res = await fetch(`/api/social-feed?limit=${limit}`, { headers: getAuthHeaders(), cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setPosts(Array.isArray(data.posts) ? data.posts : []);
        setCanCreate(Boolean(data.canCreate));
      }
    } catch { /* silent — the section simply stays empty */ }
    setLoading(false);
  }, [limit]);

  useEffect(() => { fetchFeed(); }, [fetchFeed]);

  const handleShare = useCallback(async () => {
    const content = draft.trim();
    if (!content || posting) return;
    setPosting(true);
    try {
      const res = await fetch('/api/social-feed', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      if (res.ok && data.post) {
        setPosts((prev) => [{ ...data.post, isLikedByMe: false, comments: data.post.comments || [] }, ...prev]);
        setDraft('');
      } else {
        // Governance message (403) surfaces inline so the employee knows why.
        alert(data?.error || 'Could not share the post right now.');
      }
    } catch { /* ignore */ }
    setPosting(false);
  }, [draft, posting]);

  const toggleLike = useCallback(async (postId: string) => {
    // optimistic
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? { ...p, isLikedByMe: !p.isLikedByMe, likesCount: (p.likesCount || 0) + (p.isLikedByMe ? -1 : 1) }
          : p
      )
    );
    try {
      const res = await fetch('/api/social-feed', {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ id: postId, action: 'like' }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.post) {
          // isLikedByMe was already flipped optimistically — only reconcile the
          // count against the server's authoritative value.
          setPosts((prev) =>
            prev.map((p) => (p.id === postId ? { ...p, likesCount: data.post.likesCount ?? p.likesCount } : p))
          );
        }
      }
    } catch { /* keep optimistic state */ }
  }, []);

  const toggleCommentBox = useCallback((postId: string) => {
    setOpenComments((prev) => {
      const next = new Set(prev);
      if (next.has(postId)) next.delete(postId);
      else next.add(postId);
      return next;
    });
  }, []);

  const handleAddComment = useCallback(async (postId: string) => {
    const text = (commentDrafts[postId] || '').trim();
    if (!text) return;
    setCommentDrafts((prev) => ({ ...prev, [postId]: '' }));
    // optimistic comment
    const temp: FeedComment = { id: `temp-${Date.now()}`, content: text, createdAt: new Date().toISOString(), author: { firstName: myName.split(' ')[0], lastName: myName.split(' ').slice(1).join(' ') } };
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? { ...p, comments: [...(p.comments || []), temp], commentsCount: (p.commentsCount || 0) + 1 }
          : p
      )
    );
    try {
      const res = await fetch('/api/social-feed', {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ id: postId, action: 'comment', commentContent: text }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.comment) {
          setPosts((prev) =>
            prev.map((p) =>
              p.id === postId
                ? { ...p, comments: (p.comments || []).map((c) => (c.id === temp.id ? data.comment : c)) }
                : p
            )
          );
        }
      }
    } catch { /* keep optimistic */ }
  }, [commentDrafts, myName]);

  return (
    <div className="space-y-4">
      {/* CREATE POST — SmartHR composer */}
      {canCreate && (
        <div className="rounded-2xl border border-slate-100 bg-gradient-to-br from-slate-50 to-white p-4">
          <div className="flex items-start gap-3">
            <Avatar name={myName} size="w-10 h-10 text-sm" />
            <div className="flex-1">
              <textarea
                rows={2}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="What's on your mind?"
                className="w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#6C4FD6]/30 focus:border-[#6C4FD6]/40 transition-all"
              />
              <div className="mt-2.5 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-1 text-slate-400">
                  {[<FiImage key="i" />, <FiLink2 key="l" />, <FiPaperclip key="p" />, <FiSmile key="s" />].map((ic, i) => (
                    <span key={i} className="w-8 h-8 rounded-full hover:bg-slate-100 hover:text-[#6C4FD6] flex items-center justify-center cursor-pointer transition-colors" title="Attach with the full composer">
                      {ic}
                    </span>
                  ))}
                </div>
                <button
                  onClick={handleShare}
                  disabled={!draft.trim() || posting}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[#FF9B44] to-[#FF7A3D] text-white text-sm font-semibold shadow-md shadow-orange-500/25 hover:shadow-orange-500/45 disabled:opacity-50 disabled:shadow-none transition-all"
                >
                  <FiSend className="w-4 h-4" /> {posting ? 'Sharing…' : 'Share Post'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* POSTS */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-slate-100 bg-white p-5">
              <div className="flex items-center gap-3">
                <SkeletonBlock className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <SkeletonBlock className="h-3 w-32" />
                  <SkeletonBlock className="h-2.5 w-20" />
                </div>
              </div>
              <SkeletonBlock className="h-3 w-full mt-4" />
              <SkeletonBlock className="h-3 w-2/3 mt-2" />
            </div>
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-10 flex flex-col items-center justify-center text-slate-400">
          <FiPlus className="w-8 h-8 mb-2" />
          <p className="text-sm">No feeds yet — be the first to share something!</p>
          <button onClick={() => router.push('/social-feed')} className="mt-2 text-xs font-semibold text-[#3A57C4] hover:text-[#2C43A3]">
            Open Social Feed
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((p) => {
            const authorName = [p.author?.firstName, p.author?.lastName].filter(Boolean).join(' ') || 'Colleague';
            const designation = p.author?.designation?.title || '';
            const liked = Boolean(p.isLikedByMe);
            const expanded = openComments.has(p.id);
            const comments = p.comments || [];
            return (
              <article key={p.id} className="rounded-2xl border border-slate-100 bg-white p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar name={authorName} avatar={p.author?.avatar} />
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900 truncate flex items-center gap-2">
                        {authorName}
                        {p.isPinned && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[#FFC107]/20 text-amber-600 text-[10px] font-bold uppercase tracking-wide ring-1 ring-amber-300/40">
                            Pinned
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-slate-400 truncate">
                        {designation ? `${designation} · ` : ''}{timeAgo(p.createdAt)}
                      </p>
                    </div>
                  </div>
                  {p.postType && p.postType !== 'general' && (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-[#6C4FD6]/10 text-[#6C4FD6] text-[10px] font-bold uppercase tracking-wide flex-shrink-0">
                      {p.postType}
                    </span>
                  )}
                </div>

                <div className="mt-3">
                  <PostContent content={p.content} />
                </div>

                {/* actions — SmartHR like / comment / share row */}
                <div className="mt-3 pt-3 border-t border-slate-50 flex items-center gap-1">
                  <button
                    onClick={() => toggleLike(p.id)}
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${liked ? 'text-rose-600 bg-rose-50' : 'text-slate-500 hover:bg-slate-50 hover:text-rose-500'}`}
                  >
                    <FiHeart className={`w-4 h-4 ${liked ? 'fill-rose-500 text-rose-500' : ''}`} />
                    {p.likesCount || 0} {p.likesCount === 1 ? 'Like' : 'Likes'}
                  </button>
                  <button
                    onClick={() => toggleCommentBox(p.id)}
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${expanded ? 'text-[#3A57C4] bg-[#3A57C4]/10' : 'text-slate-500 hover:bg-slate-50 hover:text-[#3A57C4]'}`}
                  >
                    <FiMessageSquare className="w-4 h-4" />
                    {p.commentsCount || 0} {(p.commentsCount || 0) === 1 ? 'Comment' : 'Comments'}
                  </button>
                  <span className="ml-auto inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-400">
                    <FiShare2 className="w-4 h-4" /> Share
                  </span>
                </div>

                {/* comments thread */}
                {expanded && (
                  <div className="mt-3 space-y-3 bg-slate-50/70 rounded-xl p-3.5">
                    {comments.length === 0 ? (
                      <p className="text-xs text-slate-400">No comments yet — start the conversation.</p>
                    ) : (
                      comments.map((c) => {
                        const cName = [c.author?.firstName, c.author?.lastName].filter(Boolean).join(' ') || 'Colleague';
                        return (
                          <div key={c.id} className="flex items-start gap-2.5">
                            <Avatar name={cName} avatar={c.author?.avatar} size="w-7 h-7 text-[10px]" />
                            <div className="min-w-0 flex-1 bg-white rounded-xl rounded-tl-sm px-3 py-2 border border-slate-100">
                              <p className="text-xs font-bold text-slate-800">{cName}</p>
                              <p className="text-xs text-slate-600 mt-0.5 whitespace-pre-wrap break-words">{c.content}</p>
                              <p className="text-[10px] text-slate-400 mt-1">{timeAgo(c.createdAt)}</p>
                            </div>
                          </div>
                        );
                      })
                    )}
                    <div className="flex items-center gap-2.5 pt-1">
                      <Avatar name={myName} size="w-7 h-7 text-[10px]" />
                      <input
                        value={commentDrafts[p.id] || ''}
                        onChange={(e) => setCommentDrafts((prev) => ({ ...prev, [p.id]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleAddComment(p.id); }}
                        placeholder="Write a comment…"
                        className="flex-1 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#3A57C4]/25 focus:border-[#3A57C4]/40"
                      />
                      <button
                        onClick={() => handleAddComment(p.id)}
                        disabled={!(commentDrafts[p.id] || '').trim()}
                        className="w-8 h-8 rounded-full bg-[#3A57C4] text-white flex items-center justify-center disabled:opacity-40 hover:bg-[#2C43A3] transition-colors flex-shrink-0"
                        title="Post comment"
                      >
                        <FiSend className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
                {!expanded && (p.commentsCount || 0) > 0 && (
                  <button
                    onClick={() => toggleCommentBox(p.id)}
                    className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-[#3A57C4] transition-colors"
                  >
                    View {Math.min(p.commentsCount || 0, comments.length || p.commentsCount || 0)} earlier {(p.commentsCount || 0) === 1 ? 'comment' : 'comments'}
                    <FiChevronDown className="w-3 h-3" />
                  </button>
                )}
                {expanded && comments.length > 0 && (
                  <button
                    onClick={() => toggleCommentBox(p.id)}
                    className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-[#3A57C4] transition-colors"
                  >
                    Hide comments <FiChevronUp className="w-3 h-3" />
                  </button>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
