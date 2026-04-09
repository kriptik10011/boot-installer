/**
 * Quantity formatting utilities for cooking and display.
 * Pure functions with no React dependencies.
 */

/**
 * Convert a decimal to a simple fraction string.
 */
function toFraction(decimal: number): string {
  const tolerance = 0.01;

  const fractions = [
    { value: 0.25, display: '\u00BC' },
    { value: 0.33, display: '\u2153' },
    { value: 0.5, display: '\u00BD' },
    { value: 0.67, display: '\u2154' },
    { value: 0.75, display: '\u00BE' },
  ];

  for (const frac of fractions) {
    if (Math.abs(decimal - frac.value) < tolerance) {
      return frac.display;
    }
  }

  return decimal.toFixed(2);
}

/**
 * Scale an ingredient quantity by a factor.
 * Returns a display-friendly string.
 * Handles null, NaN, and Infinity gracefully.
 */
export function scaleIngredientQuantity(
  quantity: number | null,
  unit: string | null,
  scaleFactor: number
): string {
  if (quantity === null) return unit || '';

  if (!Number.isFinite(quantity) || !Number.isFinite(scaleFactor) || scaleFactor <= 0) {
    return unit || '';
  }

  const scaled = quantity * scaleFactor;

  if (!Number.isFinite(scaled)) {
    return unit || '';
  }

  let display: string;
  if (Number.isInteger(scaled)) {
    display = String(scaled);
  } else if (scaled < 1) {
    display = toFraction(scaled);
  } else {
    display = scaled.toFixed(1).replace(/\.0$/, '');
  }

  return unit ? `${display} ${unit}` : display;
}

/**
 * Format minutes as a human-readable duration.
 */
export function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${mins}m`;
}
