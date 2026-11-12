'use client';

/* DocumentPreview — universal in-app document viewer for the HR documents
 * workspace. Fetches the file bytes from
 *   /api/preboarding/brd/documents/<id>/file   (Authorization header auth)
 * and renders:
 *   • images (png/jpg/webp/gif)   → <img>
 *   • PDFs                        → <iframe> (native browser viewer: page nav, zoom)
 *   • Word .docx                  → mammoth HTML render
 *   • anything else / legacy .doc → download card
 * Always exposes a Download button and an "Open full preview" action.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FiAlertTriangle,
  FiDownload,
  FiExternalLink,
  FiFile,
  FiFileText,
  FiImage,
  FiLoader,
} from 'react-icons/fi';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

export type ViewerKind = 'image' | 'pdf' | 'word' | 'unsupported';

export function viewerKindFor(fileName?: string | null, mime?: string | null): ViewerKind {
  const m = String(mime || '').toLowerCase();
  const ext = String(fileName || '').split('.').pop()?.toLowerCase() || '';
  if (m.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext)) return 'image';
  if (m.includes('pdf') || ext === 'pdf') return 'pdf';
  if (
    m.includes('wordprocessingml') || m === 'application/msword' ||
    ext === 'docx' || ext === 'doc'
  ) return 'word';
  return 'unsupported';
}

function formatBytes(bytes?: number | null): string {
  if (bytes === null || bytes === undefined) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface Props {
  documentId: string;
  fileName?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  /** height class for the viewer box */
  className?: string;
}

export default function DocumentPreview({ documentId, fileName, fileSize, mimeType, className }: Props) {
  const kind = viewerKindFor(fileName, mimeType);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [wordHtml, setWordHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const releaseUrl = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      // state resets happen inside the microtask/async body (not synchronously
      // in the effect body) to avoid cascading-render lint violations
      setLoading(true);
      setError(null);
      setBlobUrl(null);
      setWordHtml(null);
      releaseUrl();
      try {
        const res = await fetch(`/api/preboarding/brd/documents/${documentId}/file`, { headers: getAuthHeaders() });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Could not load file (${res.status})`);
        }
        const blob = await res.blob();
        if (cancelled) return;

        if (kind === 'image' || kind === 'pdf') {
          const url = URL.createObjectURL(blob);
          objectUrlRef.current = url;
          setBlobUrl(url);
        } else if (kind === 'word') {
          const arrayBuffer = await blob.arrayBuffer();
          if (cancelled) return;
          // Legacy .doc (pre-2007) cannot be parsed by mammoth → graceful card
          const ext = String(fileName || '').split('.').pop()?.toLowerCase();
          if (ext === 'doc') {
            setWordHtml(null);
          } else {
            const mammoth = await import('mammoth');
            const result = await mammoth.convertToHtml({ arrayBuffer }, { styleMap: ["p[style-name='Title'] => h1:fresh"] });
            if (cancelled) return;
            setWordHtml(result.value || '');
          }
        }
        setLoading(false);
      } catch (e: unknown) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Could not load the file.');
        setLoading(false);
      }
    };
    queueMicrotask(() => void run());

    return () => {
      cancelled = true;
      releaseUrl();
    };
  }, [documentId, kind, fileName, releaseUrl]);

  const download = useCallback(async () => {
    try {
      const res = await fetch(`/api/preboarding/brd/documents/${documentId}/file?download=1`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName || 'document';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch {
      // last resort: tokenised direct URL
      const token = localStorage.getItem('tb_token');
      window.open(`/api/preboarding/brd/documents/${documentId}/file?download=1${token ? `&token=${encodeURIComponent(token)}` : ''}`, '_blank');
    }
  }, [documentId, fileName]);

  const openFull = useCallback(() => {
    const token = localStorage.getItem('tb_token');
    window.open(`/api/preboarding/brd/documents/${documentId}/file${token ? `?token=${encodeURIComponent(token)}` : ''}`, '_blank', 'noopener');
  }, [documentId]);

  return (
    <div className={`rounded-xl border border-slate-200 bg-white overflow-hidden ${className || ''}`}>
      {/* Viewer toolbar */}
      <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 border-b border-slate-100 bg-slate-50/70">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-500 shrink-0">
            {kind === 'image' ? <FiImage className="w-4 h-4" /> : kind === 'pdf' || kind === 'word' ? <FiFileText className="w-4 h-4" /> : <FiFile className="w-4 h-4" />}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-800 truncate max-w-[220px]" title={fileName || undefined}>{fileName || 'Document'}</p>
            <p className="text-[11px] text-slate-400">
              {kind === 'image' ? 'Image' : kind === 'pdf' ? 'PDF document' : kind === 'word' ? 'Word document' : 'File'}
              {fileSize ? ` · ${formatBytes(fileSize)}` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => void openFull()}
            className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-800 px-2 py-1.5 rounded-lg hover:bg-teal-50"
            title="Open full preview in a new tab"
          >
            <FiExternalLink className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Open full preview</span>
          </button>
          <button
            onClick={() => void download()}
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 border border-slate-300 bg-white hover:bg-slate-100 px-2 py-1.5 rounded-lg"
            title="Download"
          >
            <FiDownload className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Download</span>
          </button>
        </div>
      </div>

      {/* Viewer body */}
      <div className="bg-slate-100">
        {loading ? (
          <div className="h-72 flex flex-col items-center justify-center gap-2 text-slate-500" aria-label="Loading document preview">
            <FiLoader className="w-6 h-6 animate-spin text-teal-600" />
            <p className="text-xs">Loading preview…</p>
          </div>
        ) : error ? (
          <div className="h-72 flex flex-col items-center justify-center gap-2 px-6 text-center">
            <FiAlertTriangle className="w-8 h-8 text-amber-500" />
            <p className="text-sm font-medium text-slate-700">{error}</p>
            <button onClick={() => void download()} className="mt-1 inline-flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg">
              <FiDownload className="w-3.5 h-3.5" /> Download instead
            </button>
          </div>
        ) : kind === 'image' && blobUrl ? (
          <div className="h-72 sm:h-80 flex items-center justify-center overflow-auto p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={blobUrl} alt={`Preview of ${fileName || 'document'}`} className="max-h-full max-w-full object-contain rounded bg-white shadow-sm" />
          </div>
        ) : kind === 'pdf' && blobUrl ? (
          <iframe
            src={blobUrl}
            title={`PDF preview of ${fileName || 'document'}`}
            className="w-full h-72 sm:h-80 bg-white"
          />
        ) : kind === 'word' && wordHtml ? (
          <div className="h-72 sm:h-80 overflow-y-auto bg-white p-4 docx-preview" aria-label="Word document preview">
            <div className="prose prose-sm max-w-none [&_table]:border-collapse [&_td]:border [&_td]:border-slate-300 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-slate-300 [&_th]:px-2 [&_th]:py-1 [&_img]:max-w-full" dangerouslySetInnerHTML={{ __html: wordHtml }} />
          </div>
        ) : (
          /* Word legacy .doc, mammoth failure, or unsupported type */
          <div className="h-72 flex flex-col items-center justify-center gap-2 px-6 text-center">
            <span className="w-12 h-12 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-400">
              <FiFileText className="w-6 h-6" />
            </span>
            <p className="text-sm font-medium text-slate-700">In-app preview is not available for this file type</p>
            <p className="text-xs text-slate-400">Use the buttons above to open or download the original file.</p>
          </div>
        )}
      </div>
    </div>
  );
}
