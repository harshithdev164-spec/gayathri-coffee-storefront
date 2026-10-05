const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n]!;
  return `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`;
}

function threeDigits(n: number): string {
  if (n < 100) return twoDigits(n);
  const rest = n % 100;
  return `${ONES[Math.floor(n / 100)]} Hundred${rest ? ` ${twoDigits(rest)}` : ""}`;
}

// Indian numbering (lakh/crore), matching how real Indian tax invoices spell amounts out.
export function rupeesInWords(amount: number): string {
  const whole = Math.round(amount);
  if (whole === 0) return "Zero Rupees Only";

  const crore = Math.floor(whole / 1_00_00_000);
  const lakh = Math.floor((whole % 1_00_00_000) / 1_00_000);
  const thousand = Math.floor((whole % 1_00_000) / 1_000);
  const hundred = whole % 1_000;

  const parts: string[] = [];
  if (crore) parts.push(`${threeDigits(crore)} Crore`);
  if (lakh) parts.push(`${threeDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${threeDigits(thousand)} Thousand`);
  if (hundred) parts.push(threeDigits(hundred));

  return `Indian Rupees ${parts.join(" ")} Only`;
}
