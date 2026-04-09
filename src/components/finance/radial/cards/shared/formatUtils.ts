/**
 * Shim — re-exports from canonical locations.
 * Currency from src/utils/currencyFormat.ts, everything else from src/utils/formatters.ts.
 * Kept for backward compatibility with 18 consumers in radial cards + dashboard.
 */

export {
  fmtCurrencyAbbrev as fmtCurrency,
  fmtCurrencyFull as fmtDashboard,
  fmtCurrencyCents as fmtDashboardCents,
} from '@/utils/currencyFormat';

export { fmtPct, CATEGORY_COLORS, budgetBarColor, daysUntilDue } from '@/utils/formatters';
