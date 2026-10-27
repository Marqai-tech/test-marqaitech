/**
 * Task 139 — open an uploaded document (policy file, employee document, feed
 * attachment) as the ORIGINAL document, not a text dump.
 *
 * data: URLs are decoded to Blobs and opened via an object URL so the browser
 * renders PDFs/images natively (the old `res.text()` + document.write reader
 * printed binary garbage for PDFs — the "dummy data" complaint). http(s)
 * links open directly. Word documents can't be rendered by browsers, so they
 * download instead. data:text/html is blocked (same policy as isSafeDocumentUrl).
 */
export function decodeDataUrlToBlobUrl(fileUrl: string): string | null {
  const m = /^data:([^;,]+)(;base64)?,(.*)$/i.exec(fileUrl);
  if (!m) return null;
  const mime = m[1].toLowerCase();
  const isBase64 = Boolean(m[2]);
  const raw = m[3];
  if (mime === 'text/html' || mime === 'application/xhtml+xml') return null; // security
  try {
    let bytes: Uint8Array;
    if (isBase64) {
      const bin = atob(raw);
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } else {
      bytes = new TextEncoder().encode(decodeURIComponent(raw));
    }
    const blob = new Blob([bytes as BlobPart], { type: mime });
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

export function isRenderableInBrowser(fileUrl: string): boolean {
  const m = /^data:([^;,]+)/i.exec(fileUrl);
  const mime = m?.[1]?.toLowerCase() || '';
  if (mime.startsWith('application/pdf') || mime.startsWith('image/')) return true;
  if (!fileUrl.startsWith('data:')) return true; // http(s) links — browser decides
  return false; // msword/other binary types → download instead
}

/**
 * Open the document in a new tab (natively rendered). Returns false when the
 * payload is blocked or the popup was rejected — callers then fall back to a
 * download (or show the description for policies without files).
 */
export function openDocumentInNewTab(fileUrl: string, fileName?: string): boolean {
  if (!fileUrl) return false;
  try {
    if (fileUrl.startsWith('data:')) {
      const blobUrl = decodeDataUrlToBlobUrl(fileUrl);
      if (!blobUrl) {
        // Not renderable (e.g. Word) — trigger a download instead.
        const a = document.createElement('a');
        a.href = fileUrl;
        a.download = fileName || 'document';
        document.body.appendChild(a);
        a.click();
        a.remove();
        return true;
      }
      const w = window.open(blobUrl, '_blank');
      if (!w) {
        window.location.href = blobUrl; // popup blocked — same-tab render
      }
      // Revoke later so the tab has time to load.
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
      return true;
    }
    if (/^https?:\/\//i.test(fileUrl)) {
      const w = window.open(fileUrl, '_blank', 'noopener,noreferrer');
      if (!w) window.location.href = fileUrl;
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
