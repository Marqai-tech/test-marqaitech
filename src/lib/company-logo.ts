/**
 * Company-logo retrieval utilities.
 *
 * Provides a server-side proxy at /api/company-logo that:
 *   1. Extracts a domain from a free-text company name (e.g. "Microsoft India"
 *      → "microsoft.com", "Tata Consultancy Services" → "tcs.com").
 *   2. Tries multiple keyless logo providers in order:
 *        - Clearbit Autologo:  https://logo.clearbit.com/{domain}
 *        - DuckDuckGo Icons:   https://icons.duckduckgo.com/ip3/{domain}.ico
 *        - Google S2 favicons: https://www.google.com/s2/favicons?domain={domain}&sz=128
 *   3. Returns the first 200 OK image as a redirect (with 1-day browser cache).
 *
 * Why a server-side proxy instead of client-side <img src="https://logo.clearbit.com/...">?
 *   - Privacy: hides the user's IP from third parties.
 *   - Reliability: can fallback across providers without re-rendering <img>.
 *   - Caching: HTTP cache + future Redis cache layer.
 *   - CORS-free: <img> works for any source.
 *
 * No API keys required — all three providers are keyless.
 */

/** Map of common company-name → domain hints for ambiguous cases. */
const DOMAIN_HINTS: Record<string, string> = {
  // IT services
  'tcs': 'tcs.com',
  'tata consultancy': 'tcs.com',
  'infosys': 'infosys.com',
  'wipro': 'wipro.com',
  'hcl': 'hcltech.com',
  'tech mahindra': 'techmahindra.com',
  'accenture': 'accenture.com',
  'cognizant': 'cognizant.com',
  'capgemini': 'capgemini.com',
  'ibm': 'ibm.com',
  // Product
  'microsoft': 'microsoft.com',
  'google': 'google.com',
  'alphabet': 'abc.xyz',
  'amazon': 'amazon.com',
  'aws': 'aws.amazon.com',
  'apple': 'apple.com',
  'meta': 'meta.com',
  'facebook': 'facebook.com',
  'netflix': 'netflix.com',
  'adobe': 'adobe.com',
  'oracle': 'oracle.com',
  'sap': 'sap.com',
  'salesforce': 'salesforce.com',
  'intel': 'intel.com',
  'cisco': 'cisco.com',
  'dell': 'dell.com',
  'hp': 'hp.com',
  'vmware': 'vmware.com',
  // Finance
  'jpmorgan': 'jpmorgan.com',
  'goldman sachs': 'gs.com',
  'morgan stanley': 'morganstanley.com',
  'hdfc': 'hdfcbank.com',
  'icici': 'icicibank.com',
  'sbi': 'sbi.co.in',
  'axis bank': 'axisbank.com',
  'kotak': 'kotak.com',
  // Consulting
  'deloitte': 'deloitte.com',
  'pwc': 'pwc.com',
  'pricewaterhouse': 'pwc.com',
  'ey': 'ey.com',
  'ernst young': 'ey.com',
  'kpmg': 'kpmg.com',
  'mckinsey': 'mckinsey.com',
  'bcg': 'bcg.com',
  'bain': 'bain.com',
  // Indian conglomerates
  'reliance': 'ril.com',
  'tata': 'tata.com',
  'aditya birla': 'adityabirla.com',
  'mahindra': 'mahindra.com',
  'l&t': 'larsentoubro.com',
  'larsen toubro': 'larsentoubro.com',
  'bharti airtel': 'airtel.in',
  'airtel': 'airtel.in',
};

/** Strip noise words from a company name before domain extraction. */
const NOISE_SUFFIXES = [
  ' pvt ltd', ' pvt. ltd.', ' private limited', ' pvt limited', ' pvt. limited',
  ' ltd', ' ltd.', ' limited', ' inc', ' inc.', ' llc', ' llp',
  ' corp', ' corp.', ' corporation', ' co', ' co.',
  ' india', ' india pvt', ' india ltd', ' pvt',
  ' technologies', ' technology', ' tech', ' solutions', ' software',
  ' systems', ' services', ' consulting', ' group', ' enterprises',
  ' global', ' international',
];

/**
 * Extract a likely domain from a free-text company name.
 *
 * Heuristic:
 *   1. Lowercase + trim.
 *   2. Check the DOMAIN_HINTS map (longest-key match wins).
 *   3. Otherwise, take the first word and assume `{word}.com`.
 *
 * Returns `null` if the input is empty or cannot be resolved.
 */
export function extractDomainFromCompanyName(rawName: string): string | null {
  if (!rawName) return null;
  let name = rawName.toLowerCase().trim();
  if (!name) return null;

  // Exact hint match
  if (DOMAIN_HINTS[name]) return DOMAIN_HINTS[name];

  // Prefix hint match (longest-key-wins)
  const hintKeys = Object.keys(DOMAIN_HINTS).sort((a, b) => b.length - a.length);
  for (const key of hintKeys) {
    if (name.startsWith(key + ' ') || name.startsWith(key + ',') || name === key) {
      return DOMAIN_HINTS[key];
    }
  }

  // Strip common corporate suffixes
  for (const suffix of NOISE_SUFFIXES) {
    if (name.endsWith(suffix)) {
      name = name.slice(0, -suffix.length).trim();
    }
  }

  // If a URL was pasted as the company name, extract its domain
  const urlMatch = name.match(/(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+\.[a-z.]{2,})/i);
  if (urlMatch) return urlMatch[1];

  // First token + .com fallback
  const firstToken = name.split(/[\s,.&|/]+/).find((t) => t.length >= 2 && /^[a-z0-9-]+$/.test(t));
  if (!firstToken) return null;
  return `${firstToken}.com`;
}

/** Logo providers in fallback order — all keyless. */
export const LOGO_PROVIDERS: Array<(domain: string) => string> = [
  (d) => `https://logo.clearbit.com/${d}`,
  (d) => `https://icons.duckduckgo.com/ip3/${d}.ico`,
  (d) => `https://www.google.com/s2/favicons?domain=${d}&sz=128`,
];

/** Get the i-th provider URL for a domain. */
export function getLogoProviderUrl(domain: string, index: number): string | null {
  const fn = LOGO_PROVIDERS[index];
  if (!fn) return null;
  return fn(domain);
}

/** Default placeholder avatar data URL — a single-color square with briefcase icon. */
export const DEFAULT_COMPANY_LOGO_DATA_URL =
  'data:image/svg+xml;base64,' +
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
      <rect width="64" height="64" fill="#e2e8f0"/>
      <g fill="none" stroke="#64748b" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <rect x="14" y="22" width="36" height="26" rx="3"/>
        <path d="M22 22 v-4 a3 3 0 0 1 3 -3 h14 a3 3 0 0 1 3 3 v4"/>
        <line x1="14" y1="34" x2="50" y2="34"/>
      </g>
    </svg>`,
  ).toString('base64');
