'use client';

/**
 * Task 129 — Task attachment editor (screenshots, docs, etc.).
 * Used inside the task edit modals on the PM tasks page and the project
 * workspace delivery board. Files are stored as base64 data URLs in the
 * tenant DB via GET/POST /api/projects/[id]/attachments?taskId=…
 * (≤3 MB per file, server-enforced), downloaded/streamed via the same API.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { FiFile, FiFileText, FiImage, FiPaperclip, FiTrash2, FiUpload } from 'react-icons/fi';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface TaskAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
  uploaderName?: string | null;
}

function fmtSize(n: number) {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

export default function TaskAttachments({ projectId, taskId }: { projectId: string; taskId: string }) {
  const [items, setItems] = useState<TaskAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/attachments?taskId=${encodeURIComponent(taskId)}`, { headers: getAuthHeaders() });
      const j = res.ok ? await res.json() : null;
      setItems(j?.attachments || []);
    } catch {
      /* non-fatal */
    } finally {
      setLoading(false);
    }
  }, [projectId, taskId]);

  useEffect(() => { load(); }, [load]);

  const upload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    try {
      let ok = 0;
      for (const f of Array.from(fileList).slice(0, 5)) {
        if (f.size > 3 * 1024 * 1024) {
          toast.error(`"${f.name}" exceeds the 3 MB limit`);
          continue;
        }
        const dataUrl = await new Promise<string>((resolve) => {
          const r = new FileReader();
          r.onload = () => resolve(typeof r.result === 'string' ? r.result : '');
          r.onerror = () => resolve('');
          r.readAsDataURL(f);
        });
        if (!dataUrl) continue;
        const res = await fetch(`/api/projects/${projectId}/attachments`, {
          method: 'POST', headers: getAuthHeaders(),
          body: JSON.stringify({ fileName: f.name, mimeType: f.type || 'application/octet-stream', size: f.size, dataUrl, taskId, category: 'task' }),
        });
        if (res.ok) ok += 1;
        else {
          const j = await res.json().catch(() => ({}));
          toast.error(j.error || `Failed to upload ${f.name}`);
        }
      }
      if (ok > 0) { toast.success(`${ok} attachment${ok > 1 ? 's' : ''} added`); await load(); }
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const remove = async (a: TaskAttachment) => {
    if (!confirm(`Remove attachment "${a.fileName}"?`)) return;
    const res = await fetch(`/api/projects/${projectId}/attachments/${a.id}`, { method: 'DELETE', headers: getAuthHeaders() });
    if (res.ok) { toast.success('Attachment removed'); await load(); }
    else toast.error('Failed to remove attachment');
  };

  return (
    <div className="rounded-lg border border-slate-200 p-2.5">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1"><FiPaperclip size={11} /> Attachments</span>
        <label className={`inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg ${uploading ? 'bg-slate-100 text-slate-400' : 'bg-slate-800 text-white cursor-pointer hover:bg-slate-900'}`}>
          <FiUpload size={11} /> {uploading ? 'Uploading…' : 'Attach file'}
          <input ref={inputRef} type="file" multiple className="hidden" disabled={uploading} onChange={(e) => upload(e.target.files)} />
        </label>
      </div>
      <p className="text-[10px] text-slate-400 mb-1.5">Screenshots, PDFs, docs — up to 3 MB per file.</p>
      {loading ? (
        <p className="text-[11px] text-slate-400 animate-pulse">Loading attachments…</p>
      ) : items.length === 0 ? (
        <p className="text-[11px] text-slate-400">No attachments yet.</p>
      ) : (
        <div className="space-y-1">
          {items.map((a) => (
            <div key={a.id} className="flex items-center gap-2 bg-slate-50 rounded-lg px-2 py-1.5">
              {a.mimeType.startsWith('image/') ? <FiImage className="text-sky-500 shrink-0" size={13} /> : a.mimeType.includes('pdf') || a.mimeType.includes('word') || a.mimeType.includes('text') ? <FiFileText className="text-violet-500 shrink-0" size={13} /> : <FiFile className="text-slate-400 shrink-0" size={13} />}
              <a href={`/api/projects/${projectId}/attachments/${a.id}`} target="_blank" rel="noreferrer" className="text-[11px] text-slate-700 hover:text-sky-600 hover:underline truncate flex-1" title={a.fileName}>{a.fileName}</a>
              <span className="text-[9.5px] text-slate-400 shrink-0">{fmtSize(a.fileSize)}</span>
              <button onClick={() => remove(a)} className="text-slate-300 hover:text-red-500 p-0.5 shrink-0" title="Remove"><FiTrash2 size={11} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
