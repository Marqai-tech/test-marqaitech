/**
 * Task 130 — Indian-format amount in words for payslips.
 *
 * Matches the released payslip format, e.g.
 *   75000    → "Seventy Five Thousand Rupees Only"
 *   100200.5 → "One Lakh Two Hundred Rupees and Fifty Paise Only"
 *   0        → "Zero Rupees Only"
 *
 * Uses the Indian numbering system (crore / lakh / thousand / hundred) —
 * amounts are grouped the same way the payslip figures are printed
 * (1,00,200.00 → "One Lakh Two Hundred Rupees Only").
 */

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
];

const TENS = [
  '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety',
];

/** 0..999 → words (no trailing spaces). */
function threeDigitsToWords(n: number): string {
  const parts: string[] = [];
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds > 0) parts.push(`${ONES[hundreds]} Hundred`);
  if (rest > 0) {
    if (rest < 20) parts.push(ONES[rest]);
    else {
      const t = Math.floor(rest / 10);
      const o = rest % 10;
      parts.push(o > 0 ? `${TENS[t]} ${ONES[o]}` : TENS[t]);
    }
  }
  return parts.join(' ');
}

/** 0..99,99,999+ Indian groups → words. Handles up to crores (covers payroll). */
function integerToIndianWords(n: number): string {
  if (n === 0) return 'Zero';
  const parts: string[] = [];

  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const rest = n % 1000;

  if (crore > 0) parts.push(`${integerToIndianWords(crore)} Crore`);
  if (lakh > 0) parts.push(`${threeDigitsToWords(lakh)} Lakh`);
  if (thousand > 0) parts.push(`${threeDigitsToWords(thousand)} Thousand`);
  if (rest > 0) parts.push(threeDigitsToWords(rest));

  return parts.filter(Boolean).join(' ');
}

/**
 * Convert an INR amount to payslip words.
 * Returns e.g. "Seventy Five Thousand Rupees Only".
 */
export function amountInWordsINR(amount: number): string {
  const safe = Number.isFinite(amount) ? Math.max(0, amount) : 0;
  const rupees = Math.floor(safe);
  const paise = Math.round((safe - rupees) * 100);

  let words = `${integerToIndianWords(rupees)} ${rupees === 1 ? 'Rupee' : 'Rupees'}`;
  if (paise > 0) words += ` and ${integerToIndianWords(paise)} Paise`;
  return `${words} Only`;
}
