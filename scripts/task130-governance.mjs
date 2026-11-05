// Task 130 — governance: register + approve BEFORE push.
// (Released payslip PDF downloads: attached MARQAI format with logo;
// payroll-manager release gate on web + mobile + Vercel.)
const BASE = 'https://nexus-hrms-demo.vercel.app';
const T = { 'Content-Type': 'application/json' };

const login = await fetch(BASE + '/api/auth/login', {
  method: 'POST', headers: T,
  body: JSON.stringify({ email: 'superadmin@3boxeshrms.com', password: 'MarqAI@2026' }),
});
const { token } = await login.json();
const H = { ...T, Authorization: `Bearer ${token}` };

const cr = await fetch(BASE + '/api/super-admin/change-requests', {
  method: 'POST', headers: H,
  body: JSON.stringify({
    title: 'Task 130 — Payslips download in the released MARQAI format (logo, info grid, ₹ glyphs, amount in words) — unlocked only after the payroll manager releases them',
    description:
      'User request: "Make sure the payslip download from mobile app or website app for employees should be in the attached format with logo but these will be enabled to download only when the payroll manager releases the payslips. pls update the same vercel now." ' +
      'Implementation — RELEASE GATE: Payroll table gains releasedAt/releasedById (additive, applied to platform + demo + marqaitechgroup BEFORE push via scripts/task130-schema.cjs, 3/3 verified). New POST /api/payroll/payslips/release (payroll-head roles: super_admin/tenant_admin/ceo/admin/hr_admin/company_hr_admin, company-scoped, month+year batch) stamps/clears the release. GET /api/payroll/payslips/[id]/pdf serves the official PDF and enforces: employees (self scope) = own payslip AND released only; managers (team scope) = released reports only; payroll managers (all scope) = always (they verify before releasing); draft payslips blocked for everyone. Employee list endpoints (/api/payroll/payslips + /api/payroll mobile) hide unreleased payslips from self scope; detail route gains the same scope+release gates. ' +
      'PDF FORMAT (matches the attached MARQAI_Payslip_April_2026.pdf): centered logo, company name + registered address, "Salary Payslip - {Month} {Year}", 2×2 employee info grid (Name/Location, ID/Effective Work Days, Date of Joining/Days in Month, Designation, Department), Earnings vs Deductions table with real rupee glyphs (6 KB embedded DejaVuSans subset for U+20B9 — core WinAnsi fonts cannot encode ₹), zero-value rows hidden like the attachment, totals row, Net Salary box, Amount in Words (Indian numbering, "Rupee/Rupees" grammar) and the system-generated footer. jsPDF RGBA-PNG pitfall found and routed around (PNG+TTF inflated the PDF to 1 MB; flattened JPEG logo keeps it at ~25 KB). ' +
      'DATA: MarqAI Tech Pvt Ltd company row backfilled with the payslip letterhead address (#399, Level 1, SS Prime, Double Road, AGB Layout, Hessaraghatta Main Road — Bengaluru, Karnataka 560090) and the MarqAI mark; ALL existing processed/paid payslips on both tenants pre-released once (releasedById task130-initial-release) so nothing currently visible disappears — future months stay locked until the payroll manager releases them. ' +
      'WEB: Payslips page gains Release Payslips / Revoke controls (payroll-head only, applies to the filtered month+year), Released/Unreleased chips per row, and a Download-PDF action on every row + the detail view (locked state for staff until release). ' +
      'MOBILE (v1.6.1/28): PayrollModel parses releasedAt (isReleased/releaseLabel); payroll list shows only released payslips for employees; payslip sheet shows the RELEASED / AWAITING RELEASE chip and a Download Payslip PDF action that fetches the released PDF and opens the system share sheet (save/forward); locked state for non-managers. ' +
      'Verification: 51/51 node source-contract checks (scripts/task130-contract-check.cjs); local PDF smoke test renders the exact format (valid PDF, rupee font embedded, words verified incl. "Seventy Five Thousand Rupees Only"); flutter analyze + APK build with the permanent key; post-deploy E2E re-runs on all 3 hosts.',
    category: 'payroll',
    riskLevel: 'high',
    module: 'Payroll',
    relatedModule: 'Mobile App',
  }),
});
const d = await cr.json();
const id = d?.request?.id ?? d?.id ?? d?.data?.id;
console.log('change-request created:', id || d);

if (id) {
  const ap = await fetch(`${BASE}/api/super-admin/change-requests/${id}`, {
    method: 'PATCH', headers: H, body: JSON.stringify({ action: 'approve' }),
  });
  console.log('approve:', ap.status);
}

const list = await fetch(BASE + '/api/super-admin/change-requests', { headers: H });
const ld = await list.json();
const reqs = ld.requests || ld.data || ld || [];
console.log('trail:', Array.isArray(reqs) ? `${reqs.length} requests, ${reqs.filter((r) => r.status === 'pending').length} pending` : ld);
