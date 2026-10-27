/**
 * Task 130 — Generate the embedded payslip assets module:
 *   src/lib/payslip-assets.ts
 *   - RUPEE_FONT_B64: 6 KB DejaVuSans subset carrying the ₹ glyph (U+20B9),
 *     which the PDF core fonts (WinAnsi Helvetica) cannot encode.
 *   - MARQAI_TECH_LOGO_B64: the tenant logo embedded so the payslip PDF
 *     renders the brand mark without any runtime file-system access
 *     (Vercel lambdas do not reliably contain public/ files).
 * Deterministic output — safe to commit.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const fontB64 = fs.readFileSync(path.join(__dirname, 'task130-assets', 'rupee-subset.ttf')).toString('base64');
// JPEG (alpha flattened onto white) — jsPDF embeds JPEG bytes as-is via
// DCTDecode. The RGBA PNG triggered a jsPDF path that inflates BOTH the
// image (raw 250 KB grayscale) AND any embedded TTF font (~750 KB padded).
const logoB64 = fs.readFileSync(path.join(__dirname, 'task130-assets', 'marq-ai-logo.jpg')).toString('base64');

// Sanity: the subset must still carry the rupee sign
const { execSync } = require('child_process');
const cmap = execSync(
  `python3 -c "from fontTools.ttLib import TTFont; f=TTFont('scripts/task130-assets/rupee-subset.ttf', lazy=True); print(0x20B9 in f.getBestCmap())"`,
  { cwd: ROOT },
).toString().trim();
if (cmap !== 'True') {
  console.error('[task130-assets] FATAL: subset font lost the ₹ glyph');
  process.exit(1);
}

const out = `/**
 * Task 130 — embedded payslip PDF assets (GENERATED — do not edit by hand).
 * Regenerate with: node scripts/task130-generate-assets.cjs
 *
 * - RUPEE_FONT_B64: DejaVuSans subset (~6 KB) with the ₹ glyph (U+20B9).
 *   jsPDF core fonts (Helvetica/WinAnsi) cannot encode ₹; the payslip PDF
 *   switches to this font for the rupee sign only.
 * - MARQAI_TECH_LOGO_B64: MarqAI Tech Pvt Ltd logo (public/logos/marq-ai-tech.png)
 *   embedded so the payslip PDF always renders the brand mark, even inside a
 *   Vercel lambda where public/ is not part of the bundle.
 */

export const RUPEE_FONT_B64 =
  '${fontB64}';

export const MARQAI_TECH_LOGO_B64 =
  '${logoB64}';

/** Companies whose payslips carry the MarqAI Tech logo. */
export function isMarqAITechCompany(name) {
  return !!name && /marq\\s*ai/i.test(name);
}
`;

fs.writeFileSync(path.join(ROOT, 'src', 'lib', 'payslip-assets.ts'), out);
console.log('[task130-assets] wrote src/lib/payslip-assets.ts');
console.log(`  font: ${fontB64.length} b64 chars | logo: ${logoB64.length} b64 chars | rupee glyph: OK`);
