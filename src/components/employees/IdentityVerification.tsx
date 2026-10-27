'use client';

/**
 * Task 138 — Identity Verification panel (employee view page, Verification tab).
 *
 * HR/Admin can validate the employee's personal details (name, DOB, address…)
 * automatically:
 *  1. Aadhaar QR — upload the QR image (decoded in-browser with jsQR) or paste
 *     the numeric QR payload; the server parses it and auto-compares.
 *  2. Offline XML — paste the DigiLocker "Offline Aadhaar" paperless e-KYC XML.
 *  3. PAN — format validation + match against the PAN on record.
 *  4. DigiLocker — full OAuth integration; shows setup status honestly until
 *     the DIGILOCKER_* partner credentials are configured.
 *
 * Aadhaar numbers are never stored — only the masked last-4 reference.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { FiShield, FiCheckCircle, FiXCircle, FiAlertTriangle, FiUpload, FiLoader, FiRefreshCw, FiLock } from 'react-icons/fi';
import toast from 'react-hot-toast';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface VerificationRecord {
  method?: string;
  status?: string;
  summary?: string;
  extracted?: { name?: string | null; dob?: string | null; gender?: string | null; address?: string | null; aadhaarLast4?: string | null };
  matches?: { name?: boolean | null; dob?: boolean | null; gender?: boolean | null; address?: boolean | null; addressScore?: number };
  reference?: string | null;
  verifiedByName?: string;
  verifiedAt?: string;
  note?: string | null;
}

interface DigiLockerStatus {
  configured: boolean;
  missing: string[];
  docs?: string;
}

export default function IdentityVerification({ employeeId, canVerify }: { employeeId: string; canVerify: boolean }) {
  const [verification, setVerification] = useState<VerificationRecord | null>(null);
  const [verifiedAt, setVerifiedAt] = useState<string | null>(null);
  const [digilocker, setDigilocker] = useState<DigiLockerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [payload, setPayload] = useState('');
  const [apply, setApply] = useState(false);
  const [pan, setPan] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/employees/${employeeId}/verify-identity`, { headers: getAuthHeaders() });
      const d = await res.json();
      if (res.ok) {
        setVerification(d.verification || null);
        setVerifiedAt(d.verifiedAt || null);
        setDigilocker(d.digilocker || null);
      }
    } catch { /* panel stays empty */ } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => { load(); }, [load]);

  const submit = async (body: Record<string, unknown>, label: string) => {
    setBusy(label);
    try {
      const res = await fetch(`/api/employees/${employeeId}/verify-identity`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) {
        if (res.status === 501 && d.digilocker) throw new Error(d.error);
        throw new Error(d.error || 'Verification failed');
      }
      setVerification(d.verification);
      setVerifiedAt(new Date().toISOString());
      if (d.applied?.length) toast.success(`Verified — and applied: ${d.applied.join(', ')}`);
      else toast.success(`Verification saved — ${d.verification?.summary || d.verification?.status}`);
      setPayload('');
      setPan('');
      setApply(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Verification failed', { duration: 6000 });
    } finally {
      setBusy(null);
    }
  };

  /** Decode an uploaded QR image in-browser with jsQR, then hand the payload to the server. */
  const onQrImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy('qr-image');
    try {
      const jsQR = (await import('jsqr')).default;
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.src = url;
      await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; });
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas not supported in this browser');
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
      URL.revokeObjectURL(url);
      if (!code || !code.data) throw new Error('No QR code found in the image — try a clearer scan or paste the payload text');
      await submit({ method: 'aadhaar-qr', payload: code.data, apply }, 'qr-image');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not read the QR image', { duration: 6000 });
      setBusy(null);
    }
  };

  const statusBadge = (status?: string) => {
    if (status === 'verified') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-semibold"><FiCheckCircle className="w-3 h-3" /> Verified</span>;
    if (status === 'mismatch') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-700 text-[11px] font-semibold"><FiXCircle className="w-3 h-3" /> Mismatch</span>;
    if (status) return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-[11px] font-semibold"><FiAlertTriangle className="w-3 h-3" /> Partial</span>;
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-500 text-[11px] font-medium"><FiLock className="w-3 h-3" /> Not verified yet</span>;
  };

  const matchChip = (label: string, val?: boolean | null, extra?: string) => {
    if (val === null || val === undefined) return <span className="text-[11px] text-thb-text-muted">{label}: not comparable</span>;
    return (
      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${val ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
        {label} {val ? 'match' : 'MISMATCH'}{extra || ''}
      </span>
    );
  };

  return (
    <div className="space-y-5">
      {/* Current status */}
      <div className="thb-card p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-thb-text-primary flex items-center gap-2">
            <FiShield className="w-4 h-4 text-teal-500" /> Identity Verification
          </h3>
          <div className="flex items-center gap-2">
            {statusBadge(verification?.status)}
            <button onClick={load} className="text-xs text-thb-text-muted hover:text-teal-600 flex items-center gap-1"><FiRefreshCw className="w-3 h-3" /> Refresh</button>
          </div>
        </div>
        {loading ? (
          <p className="text-sm text-thb-text-muted py-2">Loading…</p>
        ) : verification ? (
          <div className="space-y-2">
            <p className="text-xs text-thb-text-secondary">
              Method: <span className="font-semibold">{verification.method === 'aadhaar-qr' ? 'Aadhaar QR' : verification.method === 'offline-xml' ? 'Offline Aadhaar XML' : 'PAN'}</span>
              {verification.reference ? <> · Reference: <span className="font-mono">{verification.reference}</span></> : null}
              {verifiedAt ? <> · {new Date(verifiedAt).toLocaleString('en-IN')}</> : null}
              {verification.verifiedByName ? <> · by {verification.verifiedByName}</> : null}
            </p>
            <p className="text-xs text-thb-text-secondary">{verification.summary}</p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {matchChip('Name', verification.matches?.name)}
              {matchChip('DOB', verification.matches?.dob)}
              {matchChip('Gender', verification.matches?.gender)}
              {matchChip('Address', verification.matches?.address, verification.matches?.addressScore !== undefined ? ` (${Math.round((verification.matches?.addressScore || 0) * 100)}%)` : '')}
            </div>
            {verification.note && <p className="text-[11px] text-thb-text-muted pt-1">Note: {verification.note}</p>}
          </div>
        ) : (
          <p className="text-xs text-thb-text-muted py-1">
            Not verified yet. Scan the employee&apos;s Aadhaar QR or paste the Offline XML below — the system
            automatically compares the extracted name / DOB / gender / address with this record and stores the verdict.
          </p>
        )}
        {!canVerify && (
          <p className="text-[11px] text-thb-text-muted mt-3 flex items-center gap-1.5">
            <FiLock className="w-3 h-3" /> Only HR / Admin can run identity verification.
          </p>
        )}
      </div>

      {canVerify && (
        <>
          {/* Aadhaar QR / Offline XML */}
          <div className="thb-card p-5 space-y-3">
            <h4 className="text-sm font-semibold text-thb-text-primary">Aadhaar — QR scan or Offline XML</h4>
            <p className="text-xs text-thb-text-muted">
              Upload a picture of the Aadhaar QR (decoded locally in your browser — the image never leaves the
              device) or paste the QR payload / DigiLocker Offline Aadhaar XML. The system reads Name, Date of
              Birth, Gender and Address, then validates them against this record automatically.
            </p>
            <textarea
              value={payload}
              onChange={(e) => setPayload(e.target.value)}
              placeholder="Paste the numeric QR payload or the <OfflinePaperlessKyc> XML here…"
              className="w-full min-h-[72px] px-3 py-2 rounded-lg border border-thb-border text-xs font-mono resize-none focus:outline-none focus:ring-2 focus:ring-teal-500/25"
            />
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => submit({ method: 'aadhaar-qr', payload, apply }, 'qr-paste')}
                disabled={busy !== null || !payload.trim()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-gradient-to-r from-teal-600 to-emerald-600 text-white text-xs font-semibold disabled:opacity-40 hover:opacity-90 transition"
              >
                {busy === 'qr-paste' ? <FiLoader className="w-3.5 h-3.5 animate-spin" /> : <FiShield className="w-3.5 h-3.5" />} Verify from payload
              </button>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={busy !== null}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-thb-border text-xs font-semibold text-thb-text-secondary hover:bg-slate-50 disabled:opacity-40 transition"
              >
                {busy === 'qr-image' ? <FiLoader className="w-3.5 h-3.5 animate-spin" /> : <FiUpload className="w-3.5 h-3.5" />} Upload QR image
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onQrImage} />
              <label className="flex items-center gap-1.5 text-[11px] text-thb-text-secondary cursor-pointer">
                <input type="checkbox" checked={apply} onChange={(e) => setApply(e.target.checked)} className="w-3.5 h-3.5 accent-teal-600" />
                Also apply mismatched details to the employee record
              </label>
            </div>
            <p className="text-[10px] text-thb-text-muted">
              Note: 2019+ secure QR codes are encrypted by UIDAI and cannot be decoded offline — for those, use the
              DigiLocker Offline XML export or the DigiLocker integration below. Aadhaar numbers are never stored;
              only a masked last-4 reference is kept with the verification verdict.
            </p>
          </div>

          {/* PAN */}
          <div className="thb-card p-5 space-y-3">
            <h4 className="text-sm font-semibold text-thb-text-primary">PAN verification</h4>
            <p className="text-xs text-thb-text-muted">Validates the PAN format and compares it with the PAN on this employee&apos;s record.</p>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="text"
                value={pan}
                onChange={(e) => setPan(e.target.value.toUpperCase())}
                placeholder="e.g., ABCDE1234F"
                maxLength={10}
                className="w-48 px-3 py-2 rounded-lg border border-thb-border text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-teal-500/25"
              />
              <button
                onClick={() => submit({ method: 'pan', payload: pan }, 'pan')}
                disabled={busy !== null || pan.trim().length < 10}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-gradient-to-r from-teal-600 to-emerald-600 text-white text-xs font-semibold disabled:opacity-40 hover:opacity-90 transition"
              >
                {busy === 'pan' ? <FiLoader className="w-3.5 h-3.5 animate-spin" /> : <FiShield className="w-3.5 h-3.5" />} Verify PAN
              </button>
            </div>
          </div>

          {/* DigiLocker */}
          <div className="thb-card p-5 space-y-2">
            <h4 className="text-sm font-semibold text-thb-text-primary">DigiLocker integration (Aadhaar / PAN)</h4>
            {digilocker?.configured ? (
              <div className="text-xs text-thb-text-secondary space-y-1">
                <p className="text-emerald-600 font-medium flex items-center gap-1"><FiCheckCircle className="w-3.5 h-3.5" /> DigiLocker partner credentials configured.</p>
                <p>Use the DigiLocker OAuth flow to pull the verified Aadhaar XML directly from the government repository — the verification verdict is recorded the same way as a QR verification.</p>
              </div>
            ) : (
              <div className="text-xs text-thb-text-secondary space-y-1">
                <p className="flex items-center gap-1.5"><FiAlertTriangle className="w-3.5 h-3.5 text-amber-500" /> DigiLocker is not configured on this deployment yet.</p>
                <p>Missing environment variables: <span className="font-mono">{(digilocker?.missing || ['DIGILOCKER_CLIENT_ID', 'DIGILOCKER_CLIENT_SECRET', 'DIGILOCKER_REDIRECT_URI']).join(', ')}</span></p>
                <p className="text-[11px] text-thb-text-muted">
                  Register as a DigiLocker / Meri Pehchaan partner to obtain the OAuth credentials, set the variables
                  in Vercel, and the in-app verification flow activates end-to-end. Until then, Aadhaar QR / Offline
                  XML verification above works fully offline.
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
