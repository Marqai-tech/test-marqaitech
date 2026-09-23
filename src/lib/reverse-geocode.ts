'use client';

/**
 * Reverse-geocode lat/lng to a human-readable area name using BigDataCloud's
 * free client-side reverse-geocoding endpoint.
 *
 * Why BigDataCloud:
 *   - Free for client-side use (no API key required)
 *   - No rate limits for browser usage
 *   - Designed specifically for client-side reverse geocoding
 *   - Returns a structured response with city / locality / area / country
 *
 * The helper:
 *   1. Builds a compact label like "Koramangala, Bengaluru, IN" or just
 *      "Bengaluru, IN" depending on what's available.
 *   2. Caches results in an in-memory Map keyed by `${lat.toFixed(3)},${lng.toFixed(3)}`
 *      so repeated calls for the same coordinates (e.g. multiple punches from
 *      the same office) don't trigger a new network request.
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
  localityInfo?: {
    administrative?: Array<{ name?: string }>;
  };
  suburb?: string;
  district?: string;
  localityLanguage?: string;
  countryName?: string;
  countryCode?: string;
  name?: string;
}

async function fetchLabelFromBdc(lat: number, lng: number): Promise<string | null> {
  try {
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`;
    const res = await fetch(url, { cache: 'force-cache' });
    if (!res.ok) return null;
    const j: BdcResponse = await res.json();
    // Prefer the most specific locality, fall back to broader ones
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
    // Build a compact label
    if (area && country) return `${area}, ${country}`;
    if (area) return area;
    if (country) return country;
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
  const label = await fetchLabelFromBdc(lat, lng);
  cache.set(key, label || '');
  return label;
}

/** Synchronous accessor — returns the cached label if already fetched, else null. */
export function getCachedLabel(lat: number, lng: number): string | null {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  const v = cache.get(key);
  return v || null;
}
