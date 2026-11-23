/**
 * Client-safe BGV check-form definitions — proof requirements, structured
 * field forms and verification methods for every check type.
 *
 * This module is imported by BOTH server APIs (via lib/bgv.ts, which
 * re-exports it) and client components, so it must stay free of server-only
 * imports (no next/server, no node:crypto). The API routes enforce exactly
 * what the UI renders here — one source of truth.
 */

export const VERIFICATION_METHODS = [
  'Document Inspection',
  'Online Portal / Database',
  'Telephonic',
  'Email Confirmation',
  'Physical Visit',
] as const;

export interface EvidenceRequirement {
  key: string;
  label: string;
  required: boolean;
  hint?: string;
}

const EVIDENCE_REQUIREMENTS: Record<string, EvidenceRequirement[]> = {
  identity: [
    { key: 'id_document_copy', label: 'ID document copy', required: true, hint: 'Clear scan/photo of the Aadhaar / PAN / Passport used for the check' },
    { key: 'verification_proof', label: 'Verification proof', required: true, hint: 'Government portal result, confirmation email or SMS screenshot' },
    { key: 'other', label: 'Other supporting file (optional)', required: false },
  ],
  address: [
    { key: 'address_proof', label: 'Address proof', required: true, hint: 'Utility bill, rent agreement, bank passbook or similar' },
    { key: 'visit_proof', label: 'Visit / locality proof', required: false, hint: 'Geotagged visit photo, neighbour note or postal record' },
    { key: 'other', label: 'Other supporting file (optional)', required: false },
  ],
  education: [
    { key: 'degree_certificate', label: 'Degree / provisional certificate', required: true },
    { key: 'university_confirmation', label: 'University confirmation', required: true, hint: 'Registrar email, portal result or verification letter' },
    { key: 'marksheets', label: 'Marksheets (optional)', required: false },
    { key: 'other', label: 'Other supporting file (optional)', required: false },
  ],
  employment: [
    { key: 'relieving_letter', label: 'Relieving / experience letter', required: true },
    { key: 'employer_confirmation', label: 'Employer HR confirmation', required: true, hint: 'HR email, verification letter or call-note export' },
    { key: 'payslip', label: 'Last drawn payslip (optional)', required: false },
    { key: 'other', label: 'Other supporting file (optional)', required: false },
  ],
  criminal: [
    { key: 'police_clearance', label: 'Police Clearance Certificate (PCC)', required: true },
    { key: 'court_record', label: 'Court record search proof', required: false, hint: 'eCourts search result or police database screenshot' },
    { key: 'other', label: 'Other supporting file (optional)', required: false },
  ],
  reference: [
    { key: 'reference_confirmation', label: 'Reference confirmation', required: true, hint: 'Referee email reply, signed note or written response' },
    { key: 'other', label: 'Other supporting file (optional)', required: false },
  ],
};

/** Fallback for unknown/custom check types — one generic required document. */
const DEFAULT_EVIDENCE_REQUIREMENTS: EvidenceRequirement[] = [
  { key: 'supporting_document', label: 'Supporting document', required: true },
  { key: 'other', label: 'Other supporting file (optional)', required: false },
];

export function evidenceRequirementsFor(checkType?: string | null): EvidenceRequirement[] {
  return EVIDENCE_REQUIREMENTS[String(checkType || '').toLowerCase()] || DEFAULT_EVIDENCE_REQUIREMENTS;
}

export interface StructuredFieldDef {
  key: string;
  label: string;
  type: 'text' | 'date' | 'select' | 'textarea';
  options?: string[];
  required: boolean;
  placeholder?: string;
}

const STRUCTURED_FIELDS: Record<string, StructuredFieldDef[]> = {
  identity: [
    { key: 'idType', label: 'ID type', type: 'select', options: ['Aadhaar', 'PAN', 'Passport', 'Driving License', 'Voter ID'], required: true },
    { key: 'idNumber', label: 'ID number (masked)', type: 'text', required: true, placeholder: 'e.g. XXXX XXXX 1234' },
    { key: 'nameOnId', label: 'Name on ID', type: 'text', required: true },
    { key: 'idStatus', label: 'ID status', type: 'select', options: ['Valid', 'Invalid', 'Not Traceable'], required: true },
    { key: 'issuingAuthority', label: 'Issuing authority', type: 'text', required: false },
  ],
  address: [
    { key: 'addressType', label: 'Address type', type: 'select', options: ['Current', 'Permanent', 'Both'], required: true },
    { key: 'fullAddress', label: 'Address verified', type: 'textarea', required: true, placeholder: 'Full address as verified' },
    { key: 'stayingSince', label: 'Staying since', type: 'date', required: false },
    { key: 'stayConfirmed', label: 'Candidate stays at address', type: 'select', options: ['Yes', 'No', 'Could Not Confirm'], required: true },
    { key: 'verifiedVia', label: 'Verified via', type: 'select', options: ['Physical Visit', 'Neighbour / Landlord', 'Postal Record', 'Utility Bill'], required: true },
  ],
  education: [
    { key: 'institution', label: 'Institution / University', type: 'text', required: true },
    { key: 'qualification', label: 'Qualification', type: 'text', required: true },
    { key: 'rollNumber', label: 'Roll / registration no.', type: 'text', required: false },
    { key: 'yearOfPassing', label: 'Year of passing', type: 'text', required: true, placeholder: 'e.g. 2019' },
    { key: 'confirmedVia', label: 'Confirmed via', type: 'select', options: ['University Portal', 'Registrar Email', 'Telephonic', 'Physical Visit'], required: true },
    { key: 'recordsMatch', label: 'Records match claim', type: 'select', options: ['Yes', 'No', 'Partially'], required: true },
  ],
  employment: [
    { key: 'employerName', label: 'Employer name', type: 'text', required: true },
    { key: 'employerContact', label: 'HR / verifier contact', type: 'text', required: true, placeholder: 'Name, email and phone' },
    { key: 'designation', label: 'Designation held', type: 'text', required: true },
    { key: 'tenureFrom', label: 'Tenure from', type: 'date', required: true },
    { key: 'tenureTo', label: 'Tenure to', type: 'date', required: true },
    { key: 'reasonForLeaving', label: 'Reason for leaving', type: 'select', options: ['Resignation', 'Termination', 'Absconded', 'Company Closure', 'Not Stated'], required: true },
    { key: 'eligibleForRehire', label: 'Eligible for rehire', type: 'select', options: ['Yes', 'No', 'Not Stated'], required: true },
  ],
  criminal: [
    { key: 'searchScope', label: 'Search scope', type: 'select', options: ['District', 'State', 'National'], required: true },
    { key: 'searchedIn', label: 'Searched in', type: 'select', options: ['Court Records (eCourts)', 'Police Database', 'Both'], required: true },
    { key: 'certificateNumber', label: 'PCC / reference number', type: 'text', required: false },
    { key: 'issuingAgency', label: 'Issuing agency / station', type: 'text', required: false },
    { key: 'adverseFinding', label: 'Adverse finding', type: 'select', options: ['None Found', 'Record Found', 'Pending in Court'], required: true },
  ],
  reference: [
    { key: 'referenceName', label: 'Reference name', type: 'text', required: true },
    { key: 'referenceDesignation', label: 'Designation', type: 'text', required: true },
    { key: 'referenceCompany', label: 'Company', type: 'text', required: true },
    { key: 'relationship', label: 'Relationship to candidate', type: 'select', options: ['Manager', 'Colleague', 'HR', 'Client', 'Other'], required: true },
    { key: 'referenceContact', label: 'Contact (email / phone)', type: 'text', required: true },
    { key: 'recommends', label: 'Recommends candidate', type: 'select', options: ['Yes', 'No', 'Mixed'], required: true },
  ],
};

/** Fallback for unknown/custom check types — minimal generic form. */
const DEFAULT_STRUCTURED_FIELDS: StructuredFieldDef[] = [
  { key: 'subject', label: 'Subject verified', type: 'text', required: true },
  { key: 'source', label: 'Source / method detail', type: 'text', required: false },
];

export function structuredFieldsFor(checkType?: string | null): StructuredFieldDef[] {
  return STRUCTURED_FIELDS[String(checkType || '').toLowerCase()] || DEFAULT_STRUCTURED_FIELDS;
}

/** Results that always require written findings. */
const REASON_RESULTS = ['Discrepancy Found', 'Unable to Verify'];

/**
 * Validate + clean a structured-data payload against the check-type form.
 * Keeps only known keys, trims strings, enforces select options.
 */
export function validateStructuredData(
  checkType: string | null | undefined,
  data: unknown,
): { ok: boolean; errors: string[]; cleaned: Record<string, string> } {
  const fields = structuredFieldsFor(checkType);
  const input = (data && typeof data === 'object' && !Array.isArray(data)) ? { ...(data as Record<string, unknown>) } : {};
  const cleaned: Record<string, string> = {};
  const errors: string[] = [];
  for (const f of fields) {
    const raw = input[f.key];
    const val = raw === undefined || raw === null ? '' : String(raw).trim().slice(0, 500);
    if (val) cleaned[f.key] = val;
    else if (f.required) errors.push(`${f.label} is required`);
    if (f.type === 'select' && val && f.options && !f.options.includes(val)) {
      errors.push(`${f.label}: choose one of ${f.options.join(', ')}`);
    }
  }
  return { ok: errors.length === 0, errors, cleaned };
}

/**
 * Which REQUIRED proof types have no file yet (matched by evidenceType key,
 * case-insensitive). "Unable to Verify" is exempt — findings explain instead.
 */
export function missingEvidenceTypes(
  checkType: string | null | undefined,
  evidence: Array<{ evidenceType?: string | null }>,
  result?: string | null,
): EvidenceRequirement[] {
  if (String(result || '') === 'Unable to Verify') return [];
  const have = new Set(evidence.map((e) => String(e.evidenceType || '').toLowerCase()));
  return evidenceRequirementsFor(checkType).filter((r) => r.required && !have.has(r.key.toLowerCase()));
}

/**
 * Full completion gate for ONE check — combines structured form + evidence.
 * Returns human-readable gaps; empty list means the check may be completed.
 */
export function checkCompletionGaps(
  check: { checkType: string; result?: string | null; findings?: string | null; structuredData?: unknown },
  evidence: Array<{ evidenceType?: string | null }>,
): string[] {
  const gaps: string[] = [];
  const nextResult = String(check.result || '');
  const fields = structuredFieldsFor(check.checkType);
  const input = (check.structuredData && typeof check.structuredData === 'object' && !Array.isArray(check.structuredData))
    ? (check.structuredData as Record<string, unknown>) : {};
  for (const f of fields) {
    const val = String(input[f.key] ?? '').trim();
    if (f.required && !val) gaps.push(`${f.label} is required`);
  }
  if (REASON_RESULTS.includes(nextResult) && !String(check.findings || '').trim()) {
    gaps.push(`"${nextResult}" requires written findings`);
  }
  if (nextResult && nextResult !== 'Unable to Verify') {
    const missingEv = missingEvidenceTypes(check.checkType, evidence, nextResult);
    for (const m of missingEv) gaps.push(`Proof required: ${m.label}`);
  }
  return gaps;
}
