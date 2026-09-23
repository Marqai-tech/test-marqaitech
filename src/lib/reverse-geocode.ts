'use client';

/**
 * Reverse-geocode lat/lng to a human-readable area name.
 *
 * Strategy:
 *   1. PRIMARY: BigDataCloud's free client-side reverse-geocoding endpoint
 *      (no API key, designed for browser use, no rate limits). Works only
 *      when called from the browser (it returns 402 for server-side calls).
 *   2. FALLBACK: OpenStreetMap Nominatim (also free, no key, but rate-
 *      limited to 1 req/sec). Used when BigDataCloud returns 402 (server
 *      side) or any other failure. Nominatim is the only one that works
 *      when the request comes from a non-browser user-agent.
 *
 * The helper:
 *   - Builds a compact label like "Koramangala, Bengaluru, IN" or just
 *     "Bengaluru, IN" depending on what's available.
 *   - Caches results in an in-memory Map keyed by `${lat.toFixed(3)},${lng.toFixed(3)}`
 *     so repeated calls for the same coordinates (e.g. multiple punches from
 *     the same office) don't trigger a new network request.
 *
 * Used by:
 *   - captureGps() in /attendance/page.tsx — at punch-capture time so the
 *     label is stored on the Attendance + PunchEvent rows.
 *   - /attendance/punch-log page — on render, for historical events that
 *     have GPS but no stored label (captured before this fix landed).
 */

const cache = new Map<string, string>();

interface BdcResponse {
  city?: string;
  locality?: string;
  principalLocality?: string;
  localityInfo?: { administrative?: Array<{ name?: string }> };
  suburb?: string;
  district?: string;
  name?: string;
  countryName?: string;
  countryCode?: string;
}

interface NominatimResponse {
  address?: {
    suburb?: string;
    neighbourhood?: string;
    city?: string;
    town?: string;
    village?: string;
    county?: string;
    state_district?: string;
    state?: string;
    country?: string;
    country_code?: string;
    road?: string;
  };
  display_name?: string;
}

async function fetchFromBdc(lat: number, lng: number): Promise<string | null> {
  try {
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`;
    const res = await fetch(url, { cache: 'force-cache' });
    if (!res.ok) return null;
    const j: BdcResponse = await res.json();
    const area =
      j.locality ||
      j.suburb ||
      j.district ||
      j.principalLocality ||
      j.city ||
      j.name ||
      j.localityInfo?.administrative?.[0]?.name ||
      '';
    const country = j.countryName || j.countryCode || '';
    if (area && country) return `${area}, ${country}`;
    if (area) return area;
    if (country) return country;
    return null;
  } catch {
    return null;
  }
}

async function fetchFromNominatim(lat: number, lng: number): Promise<string | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
    const res = await fetch(url, {
      cache: 'force-cache',
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) return null;
    const j: NominatimResponse = await res.json();
    const a = j.address || {};
    const area =
      a.suburb ||
      a.neighbourhood ||
      a.city ||
      a.town ||
      a.village ||
      a.county ||
      a.state_district ||
      '';
    const city = a.city || a.town || a.village || a.county;
    const country = a.country || a.country_code?.toUpperCase() || '';
    // Prefer a 3-part label "suburb, city, country" for the most context,
    // fall back to 2-part "area, country" if no city, then just country.
    if (area && city && country && area !== city) return `${area}, ${city}, ${country}`;
    if (area && city && area === city) return `${area}, ${country}`;
    if (area && country) return `${area}, ${country}`;
    if (city && country) return `${city}, ${country}`;
    if (area) return area;
    if (country) return country;
    if (j.display_name) {
      // Fallback: take the first 2 segments of display_name
      const parts = j.display_name.split(',').slice(0, 2).map(s => s.trim());
      return parts.join(', ') || null;
    }
    return null;
  } catch {
    return null;
  }
}

export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  // Round to ~100m precision for cache keying — saves duplicate API calls
  // for nearby punches from the same office.
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  // Try BigDataCloud first (designed for browser, no rate limit). In a
  // browser context this will succeed. In a server-side context (curl,
  // server-side fetch), it returns 402 — fall back to Nominatim.
  let label = await fetchFromBdc(lat, lng);
  if (!label) {
    label = await fetchFromNominatim(lat, lng);
  }
  cache.set(key, label || '');
  return label;
}

/** Synchronous accessor — returns the cached label if already fetched, else null. */
export function getCachedLabel(lat: number, lng: number): string | null {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  const v = cache.get(key);
  return v || null;
}
