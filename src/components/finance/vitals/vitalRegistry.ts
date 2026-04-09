/**
 * Vital Registry — Central registry of all 9 vital types with metadata.
 *
 * Smart defaults detect which financial data exists and populate
 * the initial vital set. Safe-to-Spend (hero) is always present.
 */

import type { VitalType, VitalMetadata, DataAvailability } from '@/types/vitals';

// =============================================================================
// Registry
// =============================================================================

export const VITAL_REGISTRY: Record<VitalType, VitalMetadata> = {
  safe_to_spend: {
    type: 'safe_to_spend',
    label: 'Safe to Spend',
    description: 'Your spending headroom with pace narrative',
    icon: '\u{1F6E1}\uFE0F',
    removable: false,
    defaultSize: 'standard',
    dataKey: null, // Always shown
  },
  budget_pulse: {
    type: 'budget_pulse',
    label: 'Budget Pulse',
    description: 'Per-category velocity and budget status',
    icon: '\u{1F4CA}',
    removable: true,
    defaultSize: 'standard',
    dataKey: 'hasBudget',
  },
  bills_radar: {
    type: 'bills_radar',
    label: 'Bills Radar',
    description: 'Upcoming and predicted bills with due dates',
    icon: '\u{1F4C5}',
    removable: true,
    defaultSize: 'standard',
    dataKey: 'hasBills',
  },
  savings_sprint: {
    type: 'savings_sprint',
    label: 'Savings Sprint',
    description: 'Goal progress and projected completion',
    icon: '\u{1F3AF}',
    removable: true,
    defaultSize: 'standard',
    dataKey: 'hasSavings',
  },
  spending_lens: {
    type: 'spending_lens',
    label: 'Spending Lens',
    description: 'Category breakdown with anomaly detection',
    icon: '\u{1F50D}',
    removable: true,
    defaultSize: 'standard',
    dataKey: 'hasBudget',
  },
  debt_journey: {
    type: 'debt_journey',
    label: 'Debt Journey',
    description: 'Payoff progress and freedom date projection',
    icon: '\u{1F6A3}',
    removable: true,
    defaultSize: 'standard',
    dataKey: 'hasDebt',
  },
  net_worth: {
    type: 'net_worth',
    label: 'Net Worth',
    description: 'Total net worth with trend sparkline',
    icon: '\u{1F4C8}',
    removable: true,
    defaultSize: 'standard',
    dataKey: 'hasNetWorth',
  },
  cash_flow: {
    type: 'cash_flow',
    label: 'Cash Flow',
    description: '30-day income vs expense projection',
    icon: '\u{1F4B0}',
    removable: true,
    defaultSize: 'standard',
    dataKey: null, // Requires multiple data sources; not auto-added
  },
  investment_pulse: {
    type: 'investment_pulse',
    label: 'Investment Pulse',
    description: 'Portfolio value and allocation balance',
    icon: '\u{1F4B9}',
    removable: true,
    defaultSize: 'standard',
    dataKey: 'hasInvestments',
  },
};

/** All vital types in their default display order */
export const ALL_VITAL_TYPES: VitalType[] = [
  'safe_to_spend',
  'budget_pulse',
  'bills_radar',
  'savings_sprint',
  'spending_lens',
  'debt_journey',
  'net_worth',
  'cash_flow',
  'investment_pulse',
];

/**
 * Determine which vitals should be shown by default based on available data.
 * Safe-to-Spend is always included. Others are added when their data exists.
 */
export function getDefaultVitals(data: DataAvailability): VitalType[] {
  const defaults: VitalType[] = ['safe_to_spend'];

  for (const type of ALL_VITAL_TYPES) {
    if (type === 'safe_to_spend') continue;
    const meta = VITAL_REGISTRY[type];
    if (meta.dataKey && data[meta.dataKey]) {
      defaults.push(type);
    }
  }

  return defaults;
}

/**
 * Get metadata for a vital type.
 */
export function getVitalMetadata(type: VitalType): VitalMetadata {
  return VITAL_REGISTRY[type];
}
