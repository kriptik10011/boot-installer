/**
 * Constellation Star Position Calculator
 *
 * Deterministic layouts for 2-8 stars based on habit count.
 * Returns normalized (0-1) coordinates scaled to the canvas dimensions.
 * Hand-tuned for visual appeal with organic, non-grid spacing.
 */

interface StarPosition {
  x: number;
  y: number;
}

// Pre-defined patterns for each habit count (normalized 0-1 coordinates)
const LAYOUTS: Record<number, [number, number][]> = {
  1: [[0.5, 0.5]],
  2: [[0.3, 0.5], [0.7, 0.5]],
  3: [[0.5, 0.25], [0.25, 0.7], [0.75, 0.7]],
  4: [[0.5, 0.2], [0.2, 0.5], [0.8, 0.5], [0.5, 0.8]],
  5: [
    [0.5, 0.15],
    [0.18, 0.42],
    [0.82, 0.42],
    [0.28, 0.82],
    [0.72, 0.82],
  ],
  6: [
    [0.35, 0.15], [0.65, 0.15],
    [0.15, 0.5], [0.85, 0.5],
    [0.35, 0.85], [0.65, 0.85],
  ],
  7: [
    [0.5, 0.12],
    [0.2, 0.3], [0.8, 0.3],
    [0.12, 0.6], [0.88, 0.6],
    [0.3, 0.85], [0.7, 0.85],
  ],
  8: [
    [0.35, 0.1], [0.65, 0.1],
    [0.12, 0.35], [0.88, 0.35],
    [0.12, 0.65], [0.88, 0.65],
    [0.35, 0.9], [0.65, 0.9],
  ],
};

/**
 * Get star positions for a given number of habits.
 *
 * @param habitCount Number of habits (1-8 supported)
 * @param width Canvas width in pixels
 * @param height Canvas height in pixels
 * @param padding Inset from edges in pixels
 * @returns Array of {x, y} pixel positions
 */
export function getStarPositions(
  habitCount: number,
  width: number,
  height: number,
  padding = 30
): StarPosition[] {
  const count = Math.max(1, Math.min(8, habitCount));
  const layout = LAYOUTS[count];

  const usableWidth = width - padding * 2;
  const usableHeight = height - padding * 2;

  return layout.map(([nx, ny]) => ({
    x: padding + nx * usableWidth,
    y: padding + ny * usableHeight,
  }));
}

/**
 * Get constellation lines — connects adjacent stars that are both completed.
 * Returns pairs of indices.
 */
export function getConstellationLines(habitCount: number): [number, number][] {
  if (habitCount <= 1) return [];
  if (habitCount === 2) return [[0, 1]];
  if (habitCount === 3) return [[0, 1], [1, 2], [0, 2]];
  if (habitCount === 4) return [[0, 1], [1, 2], [2, 3], [3, 0]];
  if (habitCount === 5) return [[0, 1], [0, 2], [1, 3], [2, 4], [3, 4]];
  if (habitCount === 6) return [[0, 1], [0, 2], [1, 3], [2, 4], [3, 5], [4, 5]];
  if (habitCount === 7) return [[0, 1], [0, 2], [1, 3], [2, 4], [3, 5], [4, 6], [5, 6]];
  // 8 stars
  return [[0, 1], [0, 2], [1, 3], [2, 4], [3, 5], [4, 6], [5, 7], [6, 7]];
}
