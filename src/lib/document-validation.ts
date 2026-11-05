/**
 * Document upload validation utilities.
 *
 * Single source of truth for the "PDF only, max 3 MB" rule required by the
 * Document Management feature. Used by both frontend (file-picker handler)
 * and backend (POST / PATCH /api/documents routes) so the rule cannot drift
 * between client and server.
 *
 * Why a separate module?
 *   The 3 MB + mime check was previously inlined three times across the
 *   dashboard (employees/page.tsx, employees/[id]/page.tsx, my-profile/page.tsx).
 *   Each copy allowed a different mime set and none enforced PDF-only. This
 *   helper consolidates the rule and lets future call sites reuse it.
 */

/** Maximum allowed upload size for documents (3 MB). */
export const MAX_DOCUMENT_BYTES = 3 * 1024 * 1024;
/** Human-readable label for UI display. */
export const MAX_DOCUMENT_LABEL = '3MB';
/** Allowed MIME types for the documents module — PDF only. */
export const ALLOWED_DOCUMENT_MIME = ['application/pdf'] as const;
/** Allowed file extensions (used as a secondary check on the filename). */
export const ALLOWED_DOCUMENT_EXTENSIONS = ['.pdf'] as const;

/** Error messages — exported so callers can use the exact strings. */
export const DOC_VALIDATION_ERRORS = {
  INVALID_TYPE: 'Only PDF files are allowed.',
  TOO_LARGE: 'File size must not exceed 3 MB.',
  EMPTY: 'The selected file appears to be empty. Please choose a valid PDF.',
  CORRUPT: 'Invalid or corrupted file. Please upload a valid PDF.',
} as const;

/** Successful-upload toast — kept here so all doc-related strings live together. */
export const DOC_UPLOAD_SUCCESS = 'Document uploaded successfully.';

/**
 * Validate a browser File object against the PDF-only / 3 MB rule.
 *
 * @returns `null` if the file is acceptable, otherwise the user-facing error
 *   message (one of DOC_VALIDATION_ERRORS).
 *
 * Frontend usage:
 *   const err = validateDocumentFile(file);
 *   if (err) { toast.error(err); e.target.value = ''; return; }
 */
export function validateDocumentFile(file: File | undefined | null): string | null {
  if (!file) return DOC_VALIDATION_ERRORS.EMPTY;
  if (file.size === 0) return DOC_VALIDATION_ERRORS.EMPTY;
  if (file.size > MAX_DOCUMENT_BYTES) return DOC_VALIDATION_ERRORS.TOO_LARGE;
  // MIME check (primary). Some browsers / OSes report empty/unknown MIME for
  // .pdf files — fall through to the extension check before rejecting.
  const mime = (file.type || '').toLowerCase();
  const isAllowedMime = ALLOWED_DOCUMENT_MIME.includes(mime as typeof ALLOWED_DOCUMENT_MIME[number]);
  if (!isAllowedMime) {
    const name = (file.name || '').toLowerCase();
    const isAllowedExt = ALLOWED_DOCUMENT_EXTENSIONS.some((ext) => name.endsWith(ext));
    if (!isAllowedExt) return DOC_VALIDATION_ERRORS.INVALID_TYPE;
  }
  return null;
}

/**
 * Validate a `data:` URL payload (server-side). Mirrors the rule above but
 * works on the encoded string that arrives in the JSON body.
 *
 * Accepts:
 *   - `null` / `''` / `undefined` (no file selected — OK, fileUrl is optional)
 *   - `https?://...` URLs (external link — handled by isSafeDocumentUrl)
 *   - `data:application/pdf;base64,...` (PDF data URL)
 *
 * Rejects:
 *   - Any other data: MIME (image/jpeg, image/png, msword, etc.)
 *   - PDF data URLs whose decoded byte size exceeds 3 MB
 *   - Malformed data URLs (regex miss, empty payload)
 *
 * @returns `null` if acceptable, otherwise an error message.
 */
export function validateDocumentDataUrl(payload: string | null | undefined): string | null {
  if (!payload) return null; // fileUrl is optional
  if (!payload.startsWith('data:')) return null; // external URL — separate check
  // Match data:application/pdf;base64,XXXX
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/i.exec(payload);
  if (!match || !match[2] || match[2].length < 8) return DOC_VALIDATION_ERRORS.CORRUPT;
  const mime = match[1].toLowerCase();
  if (!ALLOWED_DOCUMENT_MIME.includes(mime as typeof ALLOWED_DOCUMENT_MIME[number])) {
    return DOC_VALIDATION_ERRORS.INVALID_TYPE;
  }
  // Base64 inflates by ~33%; 4 chars ≈ 3 bytes. Cap decoded size at 3 MB.
  const decodedBytes = Math.floor((match[2].length * 3) / 4);
  if (decodedBytes > MAX_DOCUMENT_BYTES) return DOC_VALIDATION_ERRORS.TOO_LARGE;
  return null;
}

/**
 * Result returned by pickDocumentFile — passes the validated File through
 * so the caller can read it via FileReader.readAsDataURL.
 */
export interface DocumentFilePickResult {
  error: string | null;
  dataUrl: string | null;
  fileName: string | null;
  file?: File;
}

/**
 * Synchronous handler for an `<input type="file">` onChange event.
 *
 * Validates the picked file against the PDF-only / 3 MB rule, clears the
 * input (so the same file can be re-selected after an error), and returns
 * either an error message OR the validated File for the caller to read
 * via FileReader.readAsDataURL.
 *
 * The caller is responsible for invoking toast.error on `result.error` —
 * keeps this util framework-agnostic (no react-hot-toast import here).
 *
 * Usage:
 *   <input type="file" accept="application/pdf,.pdf"
 *          onChange={(e) => {
 *            const result = pickDocumentFile(e);
 *            if (result.error) { toast.error(result.error); return; }
 *            if (result.file) {
 *              const reader = new FileReader();
 *              reader.onloadend = () => setForm(p => ({...p, fileUrl: reader.result}));
 *              reader.readAsDataURL(result.file);
 *            }
 *          }} />
 */
export function pickDocumentFile(
  e: React.ChangeEvent<HTMLInputElement>,
): DocumentFilePickResult {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return { error: null, dataUrl: null, fileName: null };
  const err = validateDocumentFile(file);
  if (err) return { error: err, dataUrl: null, fileName: null };
  return { error: null, dataUrl: null, fileName: file.name, file };
}
