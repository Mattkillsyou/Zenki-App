/**
 * formatCount — abbreviates large numbers for compact display.
 *
 *  < 1,000           → "999"              (raw, with commas for safety)
 *  1,000–9,999       → "1.2k" / "9.9k"    (one decimal, trimmed)
 *  10,000–999,999    → "12k" / "200k"     (whole number)
 *  1,000,000–999M    → "1.2M" / "45M"     (one decimal under 10M, whole over)
 *  1,000,000,000+    → "1.2B" / "45B"
 *
 * Negative numbers preserve their sign.
 * NaN / Infinity fall back to "0".
 */
export function formatCount(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const sign = value < 0 ? '-' : '';
  const n = Math.abs(value);

  if (n < 1_000) return sign + n.toLocaleString();

  const trim = (s: string) => s.replace(/\.0$/, '');

  if (n < 10_000) return sign + trim((n / 1_000).toFixed(1)) + 'k';
  if (n < 1_000_000) return sign + Math.floor(n / 1_000) + 'k';

  if (n < 10_000_000) return sign + trim((n / 1_000_000).toFixed(1)) + 'M';
  if (n < 1_000_000_000) return sign + Math.floor(n / 1_000_000) + 'M';

  if (n < 10_000_000_000) return sign + trim((n / 1_000_000_000).toFixed(1)) + 'B';
  return sign + Math.floor(n / 1_000_000_000) + 'B';
}
