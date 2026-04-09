/**
 * Cooking Confidence + Use It Up Tests (Session 4: M4/I2 + M1)
 *
 * Tests for:
 * - CookingConfidenceBadge: cook count -> confidence mapping
 * - Expiring-prioritized suggestions: sort by expiring ingredient overlap
 */

import { describe, it, expect } from 'vitest';

// --- Cook count to confidence mapping ---

function cookCountToConfidence(count: number): number {
  if (count === 0) return 0.3;
  if (count === 1) return 0.5;
  if (count === 2) return 0.65;
  return Math.min(1, 0.7 + count * 0.05);
}

describe('cookCountToConfidence', () => {
  it('returns low confidence for never-cooked (0x)', () => {
    expect(cookCountToConfidence(0)).toBe(0.3);
  });

  it('returns medium confidence for cooked once (1x)', () => {
    expect(cookCountToConfidence(1)).toBe(0.5);
  });

  it('returns moderate confidence for cooked twice (2x)', () => {
    expect(cookCountToConfidence(2)).toBe(0.65);
  });

  it('returns high confidence for 3+ cooks', () => {
    expect(cookCountToConfidence(3)).toBe(0.85);
    expect(cookCountToConfidence(5)).toBe(0.95);
  });

  it('caps at 1.0', () => {
    expect(cookCountToConfidence(10)).toBe(1);
    expect(cookCountToConfidence(100)).toBe(1);
  });

  it('confidence increases monotonically', () => {
    let prev = cookCountToConfidence(0);
    for (let i = 1; i <= 10; i++) {
      const curr = cookCountToConfidence(i);
      expect(curr).toBeGreaterThanOrEqual(prev);
      prev = curr;
    }
  });
});

// --- Expiring-prioritized suggestion sorting ---

interface MockSuggestion {
  recipe_name: string;
  match_pct: number;
  matches: { ingredient_name: string; in_stock: boolean }[];
}

interface MockExpiringItem {
  name: string;
}

function prioritizeSuggestions(
  suggestions: MockSuggestion[],
  expiringItems: MockExpiringItem[]
) {
  const expiringNames = new Set(expiringItems.map((i) => i.name.toLowerCase()));

  return suggestions
    .map((s) => {
      const expiringMatchCount = s.matches.filter(
        (m) => m.in_stock && expiringNames.has(m.ingredient_name.toLowerCase())
      ).length;
      return {
        ...s,
        expiringMatchCount,
        priority: expiringMatchCount > 0 ? ('use-soon' as const) : ('normal' as const),
      };
    })
    .sort((a, b) => {
      if (a.expiringMatchCount !== b.expiringMatchCount) {
        return b.expiringMatchCount - a.expiringMatchCount;
      }
      return b.match_pct - a.match_pct;
    });
}

describe('expiring-prioritized suggestions', () => {
  it('prioritizes recipes using expiring ingredients', () => {
    const suggestions: MockSuggestion[] = [
      {
        recipe_name: 'Pasta',
        match_pct: 90,
        matches: [{ ingredient_name: 'Tomato', in_stock: true }],
      },
      {
        recipe_name: 'Salad',
        match_pct: 60,
        matches: [{ ingredient_name: 'Lettuce', in_stock: true }],
      },
    ];
    const expiring: MockExpiringItem[] = [{ name: 'Lettuce' }];

    const result = prioritizeSuggestions(suggestions, expiring);
    expect(result[0].recipe_name).toBe('Salad');
    expect(result[0].priority).toBe('use-soon');
    expect(result[1].priority).toBe('normal');
  });

  it('falls back to match_pct when no expiring matches', () => {
    const suggestions: MockSuggestion[] = [
      { recipe_name: 'A', match_pct: 50, matches: [] },
      { recipe_name: 'B', match_pct: 80, matches: [] },
    ];
    const result = prioritizeSuggestions(suggestions, []);
    expect(result[0].recipe_name).toBe('B');
  });

  it('case-insensitive ingredient matching', () => {
    const suggestions: MockSuggestion[] = [
      {
        recipe_name: 'Stir Fry',
        match_pct: 70,
        matches: [{ ingredient_name: 'bell pepper', in_stock: true }],
      },
    ];
    const expiring: MockExpiringItem[] = [{ name: 'Bell Pepper' }];

    const result = prioritizeSuggestions(suggestions, expiring);
    expect(result[0].expiringMatchCount).toBe(1);
    expect(result[0].priority).toBe('use-soon');
  });

  it('ignores out-of-stock expiring matches', () => {
    const suggestions: MockSuggestion[] = [
      {
        recipe_name: 'Soup',
        match_pct: 80,
        matches: [{ ingredient_name: 'Carrot', in_stock: false }],
      },
    ];
    const expiring: MockExpiringItem[] = [{ name: 'Carrot' }];

    const result = prioritizeSuggestions(suggestions, expiring);
    expect(result[0].expiringMatchCount).toBe(0);
    expect(result[0].priority).toBe('normal');
  });

  it('handles empty suggestions', () => {
    expect(prioritizeSuggestions([], [{ name: 'X' }])).toEqual([]);
  });
});
