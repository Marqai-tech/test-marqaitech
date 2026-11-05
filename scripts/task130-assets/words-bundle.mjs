// src/lib/amount-in-words.ts
var ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen"
];
var TENS = [
  "",
  "",
  "Twenty",
  "Thirty",
  "Forty",
  "Fifty",
  "Sixty",
  "Seventy",
  "Eighty",
  "Ninety"
];
function threeDigitsToWords(n) {
  const parts = [];
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
  return parts.join(" ");
}
function integerToIndianWords(n) {
  if (n === 0) return "Zero";
  const parts = [];
  const crore = Math.floor(n / 1e7);
  const lakh = Math.floor(n % 1e7 / 1e5);
  const thousand = Math.floor(n % 1e5 / 1e3);
  const rest = n % 1e3;
  if (crore > 0) parts.push(`${integerToIndianWords(crore)} Crore`);
  if (lakh > 0) parts.push(`${threeDigitsToWords(lakh)} Lakh`);
  if (thousand > 0) parts.push(`${threeDigitsToWords(thousand)} Thousand`);
  if (rest > 0) parts.push(threeDigitsToWords(rest));
  return parts.filter(Boolean).join(" ");
}
function amountInWordsINR(amount) {
  const safe = Number.isFinite(amount) ? Math.max(0, amount) : 0;
  const rupees = Math.floor(safe);
  const paise = Math.round((safe - rupees) * 100);
  let words = `${integerToIndianWords(rupees)} ${rupees === 1 ? "Rupee" : "Rupees"}`;
  if (paise > 0) words += ` and ${integerToIndianWords(paise)} Paise`;
  return `${words} Only`;
}
export {
  amountInWordsINR
};
