/**
 * Task 138 — Aadhaar identity-data extraction + comparison.
 *
 * Supports the formats that can be decoded WITHOUT UIDAI partner credentials:
 *
 *  1. LEGACY NUMERIC QR  — the pre-2019 Aadhaar QR is a very long decimal
 *     number; converting it to raw bytes (base 256) yields an ISO-8859-1
 *     string whose fields are separated by the `"` character (name, DOB
 *     DD-MM-YYYY, gender, address chain, …).
 *  2. OFFLINE XML ("Offline Aadhaar" paperless e-KYC) — the <OfflinePaperlessKyc>
 *     / <UidData> XML with <Poi name=… dob=… gender=…/> and <Poa house=… …/> tags.
 *
 * The 2019+ SECURE QR is signed+encrypted (needs UIDAI's key material) — we
 * detect it and say so honestly instead of guessing. The DigiLocker route
 * (src/lib/digilocker.ts) covers credential-backed verification.
 *
 * Nothing here stores the Aadhaar number itself — callers persist only the
 * masked reference (last 4 digits) and the match verdict.
 */

export interface AadhaarExtracted {
  name?: string;
  dob?: string; // ISO yyyy-mm-dd when parseable
  dobRaw?: string; // as printed (DD-MM-YYYY / YYYY-MM-DD)
  gender?: string; // 'male' | 'female' | 'other'
  address?: string;
  pincode?: string;
  aadhaarLast4?: string;
}

export interface AadhaarParseResult {
  format: 'legacy-qr' | 'offline-xml' | 'secure-qr' | 'unknown';
  parseable: boolean;
  extracted: AadhaarExtracted;
  hint?: string;
}

const LAT1 = (b: number) => String.fromCharCode(b & 0xff);

/** Convert a very long decimal string to a byte string (ISO-8859-1). */
function decimalToBytes(decimalStr: string): string {
  let num = BigInt(decimalStr);
  if (num <= 0n) return '';
  const chunks: number[] = [];
  const BASE = 256n;
  while (num > 0n) {
    chunks.push(Number(num % BASE));
    num /= BASE;
  }
  return chunks.reverse().map(LAT1).join('');
}

function normalizeGender(raw?: string): string | undefined {
  if (!raw) return undefined;
  const v = raw.trim().toLowerCase();
  if (!v) return undefined;
  if (v.startsWith('m') || v === 'male') return 'male';
  if (v.startsWith('f') || v === 'female') return 'female';
  if (v.startsWith('t') || v === 'transgender' || v === 'other') return 'other';
  return undefined;
}

/** DD-MM-YYYY (the QR format) or YYYY-MM-DD / DD/MM/YYYY → ISO, else undefined. */
export function parseAadhaarDob(raw?: string): { iso?: string; raw?: string } {
  if (!raw) return {};
  const v = raw.trim();
  let m = /^(\d{2})[-/.](\d{2})[-/.](\d{4})$/.exec(v);
  if (m) {
    const [, d, mo, y] = m;
    const iso = `${y}-${mo}-${d}`;
    const dt = new Date(`${iso}T00:00:00Z`);
    if (!isNaN(dt.getTime())) return { iso, raw: v };
  }
  m = /^(\d{4})[-/.](\d{2})[-/.](\d{2})$/.exec(v);
  if (m) {
    const [, y, mo, d] = m;
    const iso = `${y}-${mo}-${d}`;
    const dt = new Date(`${iso}T00:00:00Z`);
    if (!isNaN(dt.getTime())) return { iso, raw: v };
  }
  return { raw: v || undefined };
}

const DOB_RE = /^\d{2}[-/.]\d{2}[-/.]\d{4}$/;
const PRINTABLE_RE = /^[\x20-\x7E\xA0-\xFF]*$/;

function looksLikeAddressPart(p: string): boolean {
  if (!p || p.length > 140) return false;
  return /[a-zA-Z0-9]/.test(p);
}

/** Parse the legacy numeric QR (decimal payload or its decoded byte string). */
function parseLegacyQr(bytes: string): AadhaarParseResult {
  const parts = bytes.split('"').map((p) => p.trim()).filter((p) => p.length > 0);
  const extracted: AadhaarExtracted = {};

  // Locate the DOB part — it anchors everything else.
  const dobIdx = parts.findIndex((p) => DOB_RE.test(p));
  if (dobIdx < 0) return { format: 'legacy-qr', parseable: false, extracted, hint: 'No DD-MM-YYYY date found in the decoded payload' };

  const dobParsed = parseAadhaarDob(parts[dobIdx]);
  extracted.dob = dobParsed.iso;
  extracted.dobRaw = dobParsed.raw;

  // Name: nearest alphabetic part before the DOB (skip empty / numeric-only).
  for (let i = dobIdx - 1; i >= 0 && i >= dobIdx - 4; i--) {
    const p = parts[i];
    if (p && /^[A-Za-z][A-Za-z\s.'-]{1,80}$/.test(p) && !DOB_RE.test(p)) {
      extracted.name = p;
      break;
    }
  }
  if (!extracted.name) {
    const candidate = parts.slice(0, dobIdx).find((p) => /^[A-Za-z]/.test(p) && p.split(/\s+/).length <= 5 && p.length <= 80);
    extracted.name = candidate;
  }

  // Gender right after DOB.
  for (let i = dobIdx + 1; i < Math.min(dobIdx + 3, parts.length); i++) {
    const g = normalizeGender(parts[i]);
    if (g && parts[i].length <= 12) {
      extracted.gender = g;
      break;
    }
  }

  // Address: printable chain after gender until a non-address-looking blob
  // (the tail of the legacy payload embeds the photo bytes / base64).
  const startIdx = dobIdx + (extracted.gender ? 2 : 1);
  const addrParts: string[] = [];
  for (let i = startIdx; i < parts.length; i++) {
    const p = parts[i];
    if (DOB_RE.test(p)) continue;
    if (p.length > 140 || !PRINTABLE_RE.test(p)) break;
    if (!looksLikeAddressPart(p)) break;
    addrParts.push(p);
    if (addrParts.length >= 14) break;
  }
  if (addrParts.length) {
    extracted.address = addrParts.join(', ');
    const pin = addrParts.find((p) => /^\d{6}$/.test(p));
    if (pin) extracted.pincode = pin;
  }

  // Some variants embed the 12-digit Aadhaar (or its masked form) early.
  const uid = parts.find((p) => /^\d{12}$/.test(p) || /^X{8}\d{4}$/.test(p) || /^\*{8}\d{4}$/.test(p) || /^\d{4}\s?\d{4}\s?\d{4}$/.test(p));
  if (uid) extracted.aadhaarLast4 = uid.replace(/\D/g, '').slice(-4);

  const ok = Boolean(extracted.name || extracted.dob);
  return {
    format: 'legacy-qr',
    parseable: ok,
    extracted,
    hint: ok ? undefined : 'Legacy QR decoded but no usable identity fields found',
  };
}

/** Parse the Offline Aadhaar paperless e-KYC XML. */
function parseOfflineXml(xml: string): AadhaarParseResult {
  const extracted: AadhaarExtracted = {};
  const attr = (tag: string, name: string): string | undefined => {
    const re = new RegExp(`<${tag}\\b[^>]*\\b${name}\\s*=\\s*"([^"]*)"`, 'i');
    const m = re.exec(xml);
    return m && m[1] ? m[1].trim() : undefined;
  };
  const poiName = attr('Poi', 'name') || attr('UidData', 'name');
  const poiDob = attr('Poi', 'dob');
  const poiGender = attr('Poi', 'gender');
  const addressKeys = ['careof', 'house', 'street', 'landmark', 'locality', 'vtc', 'subdist', 'dist', 'state'];
  const addrBits: string[] = [];
  for (const k of addressKeys) {
    const v = attr('Poa', k);
    if (v) addrBits.push(v);
  }
  const pc = attr('Poa', 'pc');
  if (poiName) extracted.name = poiName;
  const dobParsed = parseAadhaarDob(poiDob);
  extracted.dob = dobParsed.iso;
  extracted.dobRaw = dobParsed.raw;
  extracted.gender = normalizeGender(poiGender);
  if (addrBits.length) extracted.address = addrBits.join(', ');
  if (pc && /^\d{6}$/.test(pc)) {
    extracted.pincode = pc;
    if (extracted.address) extracted.address += `, ${pc}`;
  }
  const hash = attr('UidData', 'hash');
  if (hash) extracted.aadhaarLast4 = undefined; // hashed — never recoverable, keep clean

  const ok = Boolean(extracted.name || extracted.dob);
  return {
    format: 'offline-xml',
    parseable: ok,
    extracted,
    hint: ok ? undefined : 'XML found but no name/DOB could be read from it',
  };
}

/**
 * Main entry: parse an Aadhaar QR payload (paste or decoded from an image).
 * Accepts the raw decimal string, its pre-decoded byte form, or the offline XML.
 */
export function parseAadhaarPayload(payload: string): AadhaarParseResult {
  const trimmed = (payload || '').trim();
  if (!trimmed) return { format: 'unknown', parseable: false, extracted: {}, hint: 'Empty payload' };

  // Offline XML first (it can also be embedded in a QR).
  if (/<\s*(OfflinePaperlessKyc|UidData)\b/i.test(trimmed)) return parseOfflineXml(trimmed);

  // Decimal QR payload (the classic huge number).
  if (/^\d{40,}$/.test(trimmed)) {
    const bytes = decimalToBytes(trimmed);
    if (!PRINTABLE_RE.test(bytes)) {
      return {
        format: 'secure-qr',
        parseable: false,
        extracted: {},
        hint: 'This is a SECURE Aadhaar QR (2019+) — its contents are encrypted by UIDAI. Use the Offline XML (DigiLocker export) or DigiLocker verification instead.',
      };
    }
    return parseLegacyQr(bytes);
  }

  // Already-decoded byte string pasted by another tool.
  if (trimmed.includes('"') && PRINTABLE_RE.test(trimmed)) {
    const res = parseLegacyQr(trimmed);
    if (res.parseable) return res;
  }

  return {
    format: 'unknown',
    parseable: false,
    extracted: {},
    hint: 'Unrecognised payload — paste the numeric QR contents or the Offline Aadhaar XML',
  };
}

/* ── Comparison against the employee's own details ──────────────────────── */

export interface AadhaarMatches {
  name: boolean | null;
  dob: boolean | null;
  gender: boolean | null;
  address: boolean | null;
  addressScore: number; // 0..1 token overlap
}

export interface AadhaarComparison {
  status: 'verified' | 'partial' | 'mismatch';
  matches: AadhaarMatches;
  summary: string;
}

const normName = (s?: string | null): string =>
  (s || '').toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();

const normGender = (s?: string | null): string | undefined => normalizeGender(s || undefined);

function tokenSet(s?: string | null): Set<string> {
  return new Set((s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((t) => t.length > 1));
}

export function compareAadhaarWithEmployee(
  extracted: AadhaarExtracted,
  employee: { firstName?: string | null; lastName?: string | null; dateOfBirth?: string | Date | null; gender?: string | null; address?: string | null; city?: string | null; state?: string | null; zipCode?: string | null },
): AadhaarComparison {
  const matches: AadhaarMatches = { name: null, dob: null, gender: null, address: null, addressScore: 0 };

  const empName = normName(`${employee.firstName || ''} ${employee.lastName || ''}`) || null;
  const qrName = normName(extracted.name);
  if (empName && qrName) {
    matches.name = empName === qrName || empName.includes(qrName) || qrName.includes(empName);
  }

  if (extracted.dob && employee.dateOfBirth) {
    const d = typeof employee.dateOfBirth === 'string' ? employee.dateOfBirth.slice(0, 10) : employee.dateOfBirth.toISOString().slice(0, 10);
    matches.dob = d === extracted.dob;
  }

  const eg = normGender(employee.gender);
  if (extracted.gender && eg) matches.gender = extracted.gender === eg;

  const empAddress = [employee.address, employee.city, employee.state, employee.zipCode].filter(Boolean).join(', ');
  const qrTokens = tokenSet(extracted.address);
  const empTokens = tokenSet(empAddress);
  if (qrTokens.size && empTokens.size) {
    let hit = 0;
    for (const t of qrTokens) if (empTokens.has(t)) hit++;
    const score = hit / Math.max(qrTokens.size, 1);
    matches.addressScore = Math.round(score * 100) / 100;
    matches.address = score >= 0.5;
  }

  const core = [matches.name, matches.dob].filter((v) => v !== null) as boolean[];
  const all = [matches.name, matches.dob, matches.gender, matches.address].filter((v) => v !== null) as boolean[];
  const mismatchCount = all.filter((v) => v === false).length;
  let status: AadhaarComparison['status'] = 'partial';
  if (core.length > 0 && core.every(Boolean) && mismatchCount === 0) status = 'verified';
  else if (mismatchCount > 0) status = 'mismatch';

  const bits: string[] = [];
  if (matches.name !== null) bits.push(`name ${matches.name ? 'match' : 'MISMATCH'}`);
  if (matches.dob !== null) bits.push(`DOB ${matches.dob ? 'match' : 'MISMATCH'}`);
  if (matches.gender !== null) bits.push(`gender ${matches.gender ? 'match' : 'MISMATCH'}`);
  if (matches.address !== null) bits.push(`address ${matches.address ? 'match' : 'MISMATCH'} (${Math.round(matches.addressScore * 100)}%)`);

  const summary = bits.length ? bits.join(' · ') : 'Nothing comparable was extracted from the payload';
  return { status, matches, summary };
}
