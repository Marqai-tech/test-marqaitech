#!/usr/bin/env python3
"""Task 139 — social-feed stage A2: pickFeedFile helper, refs, modal wiring,
create-post attachments, card attachment rendering, drop dead imageGradient."""
p = 'src/app/(dashboard)/social-feed/page.tsx'
src = open(p).read()
edits = 0

def rep(old, new, count=1):
    global src, edits
    n = src.count(old)
    assert n == count, f"anchor x{n} (wanted {count}): {old[:90]!r}"
    src = src.replace(old, new)
    edits += 1

# 1) refs + pickFeedFile helper (inside the component, after canCreate state)
rep("""  const [showEmoji, setShowEmoji] = useState<'composer' | 'modal' | null>(null);""",
"""  const [showEmoji, setShowEmoji] = useState<'composer' | 'modal' | null>(null);
  const composerImageRef = useRef<HTMLInputElement>(null);
  const composerFileRef = useRef<HTMLInputElement>(null);
  const modalImageRef = useRef<HTMLInputElement>(null);
  const modalFileRef = useRef<HTMLInputElement>(null);

  // Task 139 — read an image/file into a dataURL attachment (≤3MB)
  const pickFeedFile = (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'file', setter: React.Dispatch<React.SetStateAction<Array<{ type: string; url: string; name?: string }>>>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) { toast.error('Attachment must be under 3MB'); return; }
    const reader = new FileReader();
    reader.onloadend = () => setter((prev) => [...prev.slice(0, 3), { type, url: String(reader.result), name: file.name }]);
    reader.readAsDataURL(file);
  };""")

# 2) useRef import
import re
m = re.search(r"import \{([^}]*)\} from 'react';", src)
assert m
if 'useRef' not in m.group(1):
    src = src.replace(m.group(0), m.group(0).replace('{ ', '{ useRef, ', 1), 1)
    edits += 1

# 3) modal dead buttons → working
rep("""              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-thb-border">
                <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-thb-text-secondary hover:bg-green-50 hover:text-green-600 transition-all">
                  <FiImage className="w-3.5 h-3.5" /> Photo
                </button>
                <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-thb-text-secondary hover:bg-teal-50 hover:text-teal-600 transition-all">
                  <FiSmile className="w-3.5 h-3.5" /> Emoji
                </button>
                <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-thb-text-secondary hover:bg-emerald-50 hover:text-emerald-600 transition-all">
                  <FiPaperclip className="w-3.5 h-3.5" /> File
                </button>
                <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-thb-text-secondary hover:bg-orange-50 hover:text-orange-600 transition-all">
                  <FiBriefcase className="w-3.5 h-3.5" /> Tag
                </button>
              </div>""",
"""                {/* Task 139 — working Photo / Emoji / File buttons */}
                {modalAttachments.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {modalAttachments.map((a, ai) => (
                      <span key={ai} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-100 border border-slate-200 text-[11px] text-slate-600">
                        {a.type === 'image' ? <FiImage className="w-3 h-3" /> : <FiPaperclip className="w-3 h-3" />} {a.name || (a.type === 'image' ? 'Image' : 'File')}
                        <button onClick={() => setModalAttachments((prev) => prev.filter((_, i) => i !== ai))} className="text-red-400 hover:text-red-600"><FiX className="w-3 h-3" /></button>
                      </span>
                    ))}
                  </div>
                )}
                {showEmoji === 'modal' && (
                  <div className="p-2 rounded-xl border border-thb-border bg-white shadow-lg grid grid-cols-8 gap-1 w-64">
                    {FEED_EMOJIS.map((em) => (
                      <button key={em} onClick={() => { setComposerText((t) => t + em); setShowEmoji(null); }} className="p-1 text-lg hover:bg-slate-100 rounded">{em}</button>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  <button onClick={() => modalImageRef.current?.click()} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-thb-border text-xs text-thb-text-secondary hover:bg-slate-50 transition-all">
                    <FiImage className="w-3.5 h-3.5" /> Photo
                  </button>
                  <input ref={modalImageRef} type="file" accept="image/*" className="hidden" onChange={(e) => { pickFeedFile(e, 'image', setModalAttachments); }} />
                  <button onClick={() => setShowEmoji(showEmoji === 'modal' ? null : 'modal')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-thb-border text-xs text-thb-text-secondary hover:bg-slate-50 transition-all">
                    <FiSmile className="w-3.5 h-3.5" /> Emoji
                  </button>
                  <button onClick={() => modalFileRef.current?.click()} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-thb-border text-xs text-thb-text-secondary hover:bg-slate-50 transition-all">
                    <FiPaperclip className="w-3.5 h-3.5" /> File
                  </button>
                  <input ref={modalFileRef} type="file" accept=".pdf,image/jpeg,image/png,.doc,.docx" className="hidden" onChange={(e) => { pickFeedFile(e, 'file', setModalAttachments); }} />
                </div>""")

# 4) create-post: send attachments (composer + modal paths)
rep("""      body: JSON.stringify({
          content: newPost.content,
          postType: 'general',
          companyId: selectedCompanyId || undefined,
        }),""",
"""      body: JSON.stringify({
          content: newPost.content,
          postType: 'general',
          companyId: selectedCompanyId || undefined,
          attachments: (composerAttachments.length ? composerAttachments : modalAttachments) || undefined,
        }),""")

# 5) reset attachments after create + include in optimistic post
rep("""    setPosts(prev => [newPost, ...prev]);
    setComposerText('');
    setShowCreatePostModal(false);""",
"""    newPost.attachments = (composerAttachments.length ? composerAttachments : modalAttachments);
    setPosts(prev => [newPost, ...prev]);
    setComposerText('');
    setComposerAttachments([]);
    setModalAttachments([]);
    setShowEmoji(null);
    setShowCreatePostModal(false);""")

# 6) map attachments from API
rep("""    shares: sp.sharesCount || 0,""",
"""    shares: sp.sharesCount || 0,
    attachments: Array.isArray(sp.attachments) ? sp.attachments : [],""")

open(p, 'w').write(src)
print(f"stage A2 OK — {edits} edits")
