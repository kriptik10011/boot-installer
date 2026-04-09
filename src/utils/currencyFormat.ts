/**
 * Canonical currency formatting functions.
 *
 * Single source of truth for all money display across views.
 * Consumed via re-export shims in:
 *   - radial/cards/shared/formatUtils.ts (fmtCurrency, fmtDashboard, fmtDashboardCents)
 *   - classic/FinanceHelpers.tsx (fmt)
 */

/** Abbreviated format for compact displays: $1.2M, $5.4K, $123 */
export function fmtCurrencyAbbrev(n: number): string {
  if (!isFinite(n)) return '$0';
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

/** Full locale-formatted, no decimals: $1,234,567 */
export function fmtCurrencyFull(n: number): string {
  if (!isFinite(n)) return '$0';
  return `$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

/** Full locale-formatted with cents: $1,234.56 */
export function fmtCurrencyCents(n: number): string {
  if (!isFinite(n)) return '$0.00';
  return `$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Rounded locale-formatted, no decimals, null-safe: $1,234 */
export function fmtCurrencyRound(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return '$0';
  return `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
