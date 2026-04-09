/**
 * Empty States + Narratives Tests (Session 8: M3 + I3 + I4 + X5)
 *
 * Tests for:
 * - Spending narrative formatting
 * - No-Shame empty state wording
 * - Depletion badge logic
 */

import { describe, it, expect } from 'vitest';

// --- Spending narrative formatting ---

function formatSpendingNarrative(
  status: 'behind' | 'ahead' | 'on_track',
  paceRatio: number
): string {
  if (status === 'behind') {
    return `Spending ${Math.round((paceRatio - 1) * 100)}% faster than your 4-week average`;
  }
  if (status === 'ahead') {
    return `${Math.round((1 - paceRatio) * 100)}% below your 4-week average`;
  }
  return 'On track with your usual spending';
}

describe('spending narrative', () => {
  it('behind pace shows percentage over', () => {
    const msg = formatSpendingNarrative('behind', 1.3);
    expect(msg).toContain('30%');
    expect(msg).toContain('faster');
  });

  it('ahead pace shows percentage under', () => {
    const msg = formatSpendingNarrative('ahead', 0.7);
    expect(msg).toContain('30%');
    expect(msg).toContain('below');
  });

  it('on track shows neutral message', () => {
    const msg = formatSpendingNarrative('on_track', 1.0);
    expect(msg).toContain('On track');
  });
});

// --- No-Shame empty state wording ---

describe('contextual empty states', () => {
  const EMPTY_MESSAGES = {
    shopping: 'Your pantry is stocked! Generate a list from your meal plan or add items manually.',
    budget: 'Set up categories to see where your money goes. Every dollar gets a job.',
    debt: "No debt accounts — that's something to celebrate!",
    savings: 'Start with a small goal — even $50/month adds up over time',
    forecast: "Add your income and bills to see where your money's headed",
  };

  it('shopping uses positive framing', () => {
    expect(EMPTY_MESSAGES.shopping).toContain('stocked');
    expect(EMPTY_MESSAGES.shopping).not.toContain('empty');
    expect(EMPTY_MESSAGES.shopping).not.toContain('no items');
  });

  it('budget provides actionable guidance', () => {
    expect(EMPTY_MESSAGES.budget).toContain('categories');
    expect(EMPTY_MESSAGES.budget).toContain('Every dollar');
  });

  it('debt uses celebration framing (No-Shame)', () => {
    expect(EMPTY_MESSAGES.debt).toContain('celebrate');
    expect(EMPTY_MESSAGES.debt).not.toContain('failure');
  });

  it('savings uses encouraging framing', () => {
    expect(EMPTY_MESSAGES.savings).toContain('small goal');
    expect(EMPTY_MESSAGES.savings).toContain('adds up');
  });

  it('forecast provides clear next step', () => {
    expect(EMPTY_MESSAGES.forecast).toContain('income');
    expect(EMPTY_MESSAGES.forecast).toContain('bills');
  });
});

// --- Depletion countdown logic ---

function formatDepletionDays(daysLeft: number | null): string | null {
  if (daysLeft === null || daysLeft < 0) return null;
  if (daysLeft === 0) return 'Empty today';
  if (daysLeft <= 3) return `~${daysLeft}d left`;
  if (daysLeft <= 7) return `~${daysLeft}d left`;
  return null; // Don't show for >7 days
}

describe('depletion countdown', () => {
  it('shows "Empty today" when 0 days', () => {
    expect(formatDepletionDays(0)).toBe('Empty today');
  });

  it('shows days remaining for <=7', () => {
    expect(formatDepletionDays(3)).toBe('~3d left');
    expect(formatDepletionDays(7)).toBe('~7d left');
  });

  it('returns null for >7 days', () => {
    expect(formatDepletionDays(8)).toBeNull();
  });

  it('returns null for null input', () => {
    expect(formatDepletionDays(null)).toBeNull();
  });

  it('returns null for negative days', () => {
    expect(formatDepletionDays(-1)).toBeNull();
  });
});
