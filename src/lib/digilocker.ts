/**
 * Task 138 — DigiLocker integration scaffold (Aadhaar / PAN verification via
 * Meri Pehchaan / DigiLocker OAuth 2.0).
 *
 * DigiLocker requires REGISTERED PARTNER credentials (Client ID + Client
 * Secret issued by NIC after partner onboarding) — those are tenant/platform
 * secrets set as environment variables:
 *
 *   DIGILOCKER_CLIENT_ID       — issued by DigiLocker partner console
 *   DIGILOCKER_CLIENT_SECRET   — issued by DigiLocker partner console
 *   DIGILOCKER_REDIRECT_URI    — e.g. https://<host>/api/integrations/digilocker/callback
 *
 * Until those are configured this module reports `configured: false` and the
 * UI shows the setup hint instead of pretending to verify. The authorize-URL
 * builder follows the Meri Pehchaan (DigiLocker) OAuth2 spec so the moment
 * credentials exist the flow is live end-to-end (callback exchange lives in
 * the integrations route).
 */

export interface DigiLockerStatus {
  configured: boolean;
  missing: string[];
  authorizeUrl: string;
  docs: string;
}

const AUTHORIZE_BASE = 'https://digilocker.meripehchaan.gov.in/public/oauth2/1/authorize';
/** Requested artifacts: Aadhaar XML (with photo) + PAN via DigiLocker. */
const REQUESTED_DOCUMENTS = 'aadhaar,pan';

export function getDigiLockerConfig(): { clientId: string | null; clientSecret: string | null; redirectUri: string | null } {
  return {
    clientId: process.env.DIGILOCKER_CLIENT_ID || null,
    clientSecret: process.env.DIGILOCKER_CLIENT_SECRET || null,
    redirectUri: process.env.DIGILOCKER_REDIRECT_URI || null,
  };
}

export function getDigiLockerStatus(requestOrigin?: string): DigiLockerStatus {
  const { clientId, clientSecret, redirectUri } = getDigiLockerConfig();
  const missing: string[] = [];
  if (!clientId) missing.push('DIGILOCKER_CLIENT_ID');
  if (!clientSecret) missing.push('DIGILOCKER_CLIENT_SECRET');
  if (!redirectUri) missing.push('DIGILOCKER_REDIRECT_URI');
  return {
    configured: missing.length === 0,
    missing,
    authorizeUrl: AUTHORIZE_BASE,
    docs: 'Register as a DigiLocker partner (meripehchaan.gov.in) to obtain the Client ID / Secret, then set the three DIGILOCKER_* environment variables in the Vercel project.',
  };
}

/** Build the DigiLocker OAuth authorize URL once credentials exist. */
export function buildAuthorizeUrl(params: { state: string; redirectUri?: string }): { ok: boolean; url?: string; error?: string } {
  const { clientId, clientSecret, redirectUri } = getDigiLockerConfig();
  const uri = params.redirectUri || redirectUri;
  if (!clientId || !clientSecret || !uri) {
    return { ok: false, error: 'DigiLocker is not configured — set DIGILOCKER_CLIENT_ID, DIGILOCKER_CLIENT_SECRET and DIGILOCKER_REDIRECT_URI' };
  }
  const url = new URL(AUTHORIZE_BASE);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', uri);
  url.searchParams.set('state', params.state);
  url.searchParams.set('dl_flow', 'signup');
  url.searchParams.set('documents', REQUESTED_DOCUMENTS);
  return { ok: true, url: url.toString() };
}

/** Exchange an OAuth code for tokens + pull the Aadhaar XML (needs credentials). */
export async function exchangeCodeForAadhaarXml(code: string): Promise<{ ok: boolean; xml?: string; name?: string; dob?: string; gender?: string; address?: string; error?: string }> {
  const { clientId, clientSecret, redirectUri } = getDigiLockerConfig();
  if (!clientId || !clientSecret || !redirectUri) {
    return { ok: false, error: 'DigiLocker is not configured on this deployment' };
  }
  try {
    const tokenRes = await fetch('https://digilocker.meripehchaan.gov.in/public/oauth2/1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    const tokenJson = (await tokenRes.json()) as { access_token?: string; error_description?: string };
    if (!tokenRes.ok || !tokenJson.access_token) {
      return { ok: false, error: tokenJson.error_description || `Token exchange failed (${tokenRes.status})` };
    }
    const xmlRes = await fetch('https://digilocker.meripehchaan.gov.in/public/oauth2/1/xml/aadhaar', {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    if (!xmlRes.ok) return { ok: false, error: `Aadhaar XML fetch failed (${xmlRes.status})` };
    const xml = await xmlRes.text();
    return { ok: true, xml };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'DigiLocker exchange failed' };
  }
}
