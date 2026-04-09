/**
 * Shared inventory display/logic helpers.
 *
 * Unified tracking — uses unit_type (discrete/continuous) instead of
 * tracking_mode (count/percentage). Legacy items with quantity_unit=null display
 * as percentages on a 0-100 pseudo-scale.
 */

import type { InventoryItem } from '@/api/client';

// Step size defaults by canonical unit (matches backend STEP_SIZE_DEFAULTS)
const STEP_SIZE_DEFAULTS: Record<string, number> = {
  // Discrete
  count: 1, dozen: 1, pair: 1,
  // Volume
  teaspoon: 0.25, tablespoon: 0.5, cup: 0.25, fluid_ounce: 1.0,
  pint: 0.5, quart: 0.5, gallon: 0.25, milliliter: 25, liter: 0.25,
  // Weight
  gram: 5, kilogram: 0.1, ounce: 1.0, pound: 0.25,
};

// Container units — items stored as package counts (1 jar, 1 bag, etc.)
const CONTAINER_UNITS = new Set([
  'bottle', 'jar', 'can', 'bag', 'box', 'carton',
  'container', 'stick', 'block', 'loaf', 'tube',
  'pack', 'bunch', 'head', 'wedge', 'canister',
]);

/** Get effective unit type for an item. */
export function getUnitType(item: InventoryItem): 'discrete' | 'continuous' {
  return item.unit_type === 'continuous' ? 'continuous' : 'discrete';
}

/** Whether item is on the legacy 0-100 pseudo-scale (quantity_unit === 'percent'). */
export function isLegacyScale(item: InventoryItem): boolean {
  return item.quantity_unit === 'percent';
}

/**
 * Get step size for +/- buttons.
 *
 * Priority: (1) per-item override, (2) STEP_SIZE_DEFAULTS[quantity_unit], (3) 10 for legacy %, (4) 1
 */
export function getStepSize(item: InventoryItem): number {
  if (item.adjustment_step != null && item.adjustment_step > 0) {
    return item.adjustment_step;
  }
  if (item.quantity_unit) {
    // Container units (jar, bag, pack): whole package increments
    if (CONTAINER_UNITS.has(item.quantity_unit)) return 1;
    return STEP_SIZE_DEFAULTS[item.quantity_unit] ?? 1;
  }
  // Legacy 0-100 pseudo-scale
  if (isLegacyScale(item)) return 10;
  return 1;
}

/**
 * Format a percentage value for display.
 * Max 2 decimal places, trailing zeros trimmed.
 */
export function formatPercent(value: number): string {
  if (Number.isInteger(value)) return `${value}%`;
  return `${parseFloat(value.toFixed(2))}%`;
}

const UNIT_ABBREVIATIONS: Record<string, string> = {
  teaspoon: 'tsp', tablespoon: 'tbsp', fluid_ounce: 'fl oz',
  milliliter: 'mL', liter: 'L', gram: 'g', kilogram: 'kg',
  ounce: 'oz', pound: 'lb', gallon: 'gal', quart: 'qt',
  pint: 'pt', cup: 'c', pair: 'pr',
  container: 'ctnr', count: '',
};

export function abbreviateUnit(unit: string): string {
  return UNIT_ABBREVIATIONS[unit] ?? unit;
}

/** Round to 2 decimal places, strip trailing zeros. */
function roundDisplay(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  if (Number.isInteger(rounded)) return `${rounded}`;
  return `${parseFloat(rounded.toFixed(2))}`;
}

/** Format quantity display string for an item. */
export function formatQuantity(item: InventoryItem): string {
  // Legacy 0-100 pseudo-scale: show as percentage
  if (isLegacyScale(item)) {
    const pct = item.quantity ?? 0;
    const backups = item.packages_backup ?? 0;
    if (backups > 0) return `${formatPercent(pct)} (+${backups} backup)`;
    return formatPercent(pct);
  }

  const backups = item.packages_backup ?? 0;
  const qty = item.quantity ?? 0;
  const rawUnit = item.quantity_unit ?? item.unit;
  const isContainer = rawUnit ? CONTAINER_UNITS.has(rawUnit) : false;

  // Package-tracked container items: show "1 jar" with remaining %
  if (isContainer && item.package_size && item.package_size > 0) {
    const pct = getPackagePercent(item);
    const displayUnit = abbreviateUnit(rawUnit ?? '');
    const qtyStr = `${roundDisplay(qty)}${displayUnit ? ` ${displayUnit}` : ''}`;
    if (pct !== null && pct < 100) {
      const parts = [qtyStr, `(${pct}% left)`];
      if (backups > 0) parts.push(`+${backups} backup`);
      return parts.join(' ');
    }
    if (backups > 0) return `${qtyStr} (+${backups} backup)`;
    return qtyStr;
  }

  // Regular items with real units
  const displayUnit = rawUnit ? abbreviateUnit(rawUnit) : '';
  const qtyStr = roundDisplay(qty);
  if (backups > 0) {
    return `${qtyStr}${displayUnit ? ` ${displayUnit}` : ''} (+${backups} backup)`;
  }
  return `${qtyStr}${displayUnit ? ` ${displayUnit}` : ''}`;
}

/** Get remaining percentage for a package-tracked item. null if not package-tracked. */
export function getPackagePercent(item: InventoryItem): number | null {
  if (!item.package_size || item.package_size <= 0) return null;
  const remaining = item.quantity ?? 0;
  return Math.max(0, Math.min(100, Math.round((remaining / item.package_size) * 100)));
}

