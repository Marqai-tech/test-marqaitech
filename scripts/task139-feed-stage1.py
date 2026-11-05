#!/usr/bin/env python3
"""Task 139 — social-feed page: working image/file/emoji icons, attachment
rendering on cards, attachments sent on create."""
p = 'src/app/(dashboard)/social-feed/page.tsx'
src = open(p, encoding='utf-8').read()
edits = 0

def rep(old, new, count=1):
    global src, edits
    n = src.count(old)
    assert n == count, f"anchor x{n} (wanted {count}): {old[:90]!r}"
    src = src.replace(old, new)
    edits += 1

# 0) import openDocumentInNewTab
if "from '@/lib/document-viewer'" not in src:
    lines = src.split('\n')
    idx = next(i for i, l in enumerate(lines) if l.startswith('import ')) + 1
    lines.insert(idx, "import { openDocumentInNewTab } from '@/lib/document-viewer';")
    src = '\n'.join(lines)
    edits += 1

# 1) Post interface: attachments
rep("""  shares: number;""",
"""    shares: number;
    attachments?: Array<{ type: string; url: string; name?: string }>;""")

# 2) state for composer attachments + emoji popover
rep("""  // Task 138 — feed governance: only HR/Admin (or enabled employees) may RAISE feeds
  const [canCreate, setCanCreate] = useState(false);""",
"""  // Task 138 — feed governance: only HR/Admin (or enabled employees) may RAISE feeds
  const [canCreate, setCanCreate] = useState(false);
  // Task 139 — composer attachments + emoji popover
  const [composerAttachments, setComposerAttachments] = useState<Array<{ type: string; url: string; name?: string }>>([]);
  const [modalAttachments, setModalAttachments] = useState<Array<{ type: string; url: string; name?: string }>>([]);
  const [showEmoji, setShowEmoji] = useState<'composer' | 'modal' | null>(null);""")

# 3) shared helpers (module level, after getAuthHeaders)
rep("""/* ── Auth headers helper ── */""",
"""// Task 139 — attachment pick helpers (image/file → dataURL ≤3MB)
const FEED_EMOJIS = ['😀', '🎉', '👏', '🙌', '🔥', '❤️', '🎂', '🏆', '✅', '💡', '🚀', '😊', '🥳', '💪', '☕', '🌟', '📢', '🎯', '🙏', '😍', '🤝', '😅', '😎', '🔔'];

/* ── Auth headers helper ── */""")

# 4) composer icon buttons → working handlers
rep("""                <div className="flex items-center justify-between mt-3">
                  <div className="flex items-center gap-1">
                    <button className="p-2 rounded-lg text-thb-text-muted hover:text-green-600 hover:bg-green-50 transition-all" title="Add image">
                      <FiImage className="w-4 h-4" />
                    </button>
                    <button className="p-2 rounded-lg text-thb-text-muted hover:text-teal-600 hover:bg-teal-50 transition-all" title="Add emoji">
                      <FiSmile className="w-4 h-4" />
                    </button>
                    <button className="p-2 rounded-lg text-thb-text-muted hover:text-emerald-600 hover:bg-emerald-50 transition-all" title="Attach file">
                      <FiPaperclip className="w-4 h-4" />
                    </button>
                  </div>""",
"""                {/* Task 139 — attached previews */}
                {composerAttachments.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {composerAttachments.map((a, ai) => (
                      <span key={ai} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-100 border border-slate-200 text-[11px] text-slate-600">
                        {a.type === 'image' ? <FiImage className="w-3 h-3" /> : <FiPaperclip className="w-3 h-3" />} {a.name || (a.type === 'image' ? 'Image' : 'File')}
                        <button onClick={() => setComposerAttachments((prev) => prev.filter((_, i) => i !== ai))} className="text-red-400 hover:text-red-600"><FiX className="w-3 h-3" /></button>
                      </span>
                    ))}
                  </div>
                )}
                {showEmoji === 'composer' && (
                  <div className="absolute z-20 mt-2 p-2 rounded-xl border border-thb-border bg-white shadow-lg grid grid-cols-8 gap-1 w-64">
                    {FEED_EMOJIS.map((em) => (
                      <button key={em} onClick={() => { setComposerText((t) => t + em); setShowEmoji(null); }} className="p-1 text-lg hover:bg-slate-100 rounded">{em}</button>
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-between mt-3">
                  <div className="flex items-center gap-1 relative">
                    <button onClick={() => composerImageRef.current?.click()} className="p-2 rounded-lg text-thb-text-muted hover:text-green-600 hover:bg-green-50 transition-all" title="Add image">
                      <FiImage className="w-4 h-4" />
                    </button>
                    <input ref={composerImageRef} type="file" accept="image/*" className="hidden" onChange={(e) => { pickFeedFile(e, 'image', setComposerAttachments); }} />
                    <button onClick={() => setShowEmoji(showEmoji === 'composer' ? null : 'composer')} className="p-2 rounded-lg text-thb-text-muted hover:text-teal-600 hover:bg-teal-50 transition-all" title="Add emoji">
                      <FiSmile className="w-4 h-4" />
                    </button>
                    <button onClick={() => composerFileRef.current?.click()} className="p-2 rounded-lg text-thb-text-muted hover:text-emerald-600 hover:bg-emerald-50 transition-all" title="Attach file">
                      <FiPaperclip className="w-4 h-4" />
                    </button>
                    <input ref={composerFileRef} type="file" accept=".pdf,image/jpeg,image/png,.doc,.docx" className="hidden" onChange={(e) => { pickFeedFile(e, 'file', setComposerAttachments); }} />
                  </div>""")

open(p, 'w').write(src)
print(f"stage A1 OK — {edits} edits")
