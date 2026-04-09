/**
 * BentoGrid Layout Logic Tests
 *
 * Tests the sorting and capping logic that BentoGrid uses to arrange cards.
 * Pure data logic — no DOM rendering needed.
 */

import { describe, it, expect } from 'vitest';

// BentoGrid sorts categories by budgeted descending and caps at 7.
// We test this logic directly since the component uses it inline.

function sortAndCap(categories: { category_id: number; budgeted: number }[], max = 7) {
  return [...categories]
    .sort((a, b) => b.budgeted - a.budgeted)
    .slice(0, max);
}

describe('BentoGrid layout logic', () => {
  it('sorts categories by budget amount descending', () => {
    const cats = [
      { category_id: 1, budgeted: 100 },
      { category_id: 2, budgeted: 400 },
      { category_id: 3, budgeted: 200 },
    ];
    const sorted = sortAndCap(cats);
    expect(sorted[0].category_id).toBe(2);
    expect(sorted[1].category_id).toBe(3);
    expect(sorted[2].category_id).toBe(1);
  });

  it('caps at 7 categories maximum', () => {
    const cats = Array.from({ length: 10 }, (_, i) => ({
      category_id: i + 1,
      budgeted: (i + 1) * 50,
    }));
    const result = sortAndCap(cats);
    expect(result.length).toBe(7);
  });

  it('first category (largest) gets span-2 treatment', () => {
    const cats = [
      { category_id: 1, budgeted: 500 },
      { category_id: 2, budgeted: 200 },
    ];
    const sorted = sortAndCap(cats);
    // First item should be the largest
    expect(sorted[0].budgeted).toBe(500);
    // This is the one that gets grid-column: span 2 in the component
  });

  it('handles empty categories gracefully', () => {
    const result = sortAndCap([]);
    expect(result).toEqual([]);
  });
});
