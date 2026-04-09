/**
 * Command Palette + Ambient Indicators Tests (Session 6: X4 + F2 + X1)
 *
 * Tests for:
 * - New command keywords match correctly
 * - Ambient load score calculation
 * - Load-to-tint mapping
 */

import { describe, it, expect } from 'vitest';

// --- Command filtering (from commandRegistry.ts pattern) ---

interface MockCommand {
  id: string;
  label: string;
  keywords: string[];
}

function filterCommands(commands: MockCommand[], search: string): MockCommand[] {
  if (!search.trim()) return commands;
  const query = search.toLowerCase();
  return commands.filter((cmd) => {
    if (cmd.label.toLowerCase().includes(query)) return true;
    if (cmd.keywords.some((kw) => kw.includes(query))) return true;
    return false;
  });
}

const NEW_COMMANDS: MockCommand[] = [
  { id: 'action-what-can-i-cook', label: 'What Can I Cook?', keywords: ['cook', 'pantry', 'ingredients', 'recipe', 'suggest'] },
  { id: 'action-add-transaction', label: 'Add Transaction', keywords: ['spend', 'expense', 'bought', 'transaction', 'purchase'] },
  { id: 'action-add-bill', label: 'Add Bill', keywords: ['bill', 'due', 'pay', 'payment'] },
  { id: 'action-check-budget', label: 'Check Budget', keywords: ['budget', 'remaining', 'safe to spend', 'money left'] },
];

describe('new command keywords', () => {
  it('"cook" matches What Can I Cook', () => {
    const results = filterCommands(NEW_COMMANDS, 'cook');
    expect(results.some((c) => c.id === 'action-what-can-i-cook')).toBe(true);
  });

  it('"pantry" matches What Can I Cook', () => {
    const results = filterCommands(NEW_COMMANDS, 'pantry');
    expect(results.some((c) => c.id === 'action-what-can-i-cook')).toBe(true);
  });

  it('"spend" matches Add Transaction', () => {
    const results = filterCommands(NEW_COMMANDS, 'spend');
    expect(results.some((c) => c.id === 'action-add-transaction')).toBe(true);
  });

  it('"budget" matches Check Budget', () => {
    const results = filterCommands(NEW_COMMANDS, 'budget');
    expect(results.some((c) => c.id === 'action-check-budget')).toBe(true);
  });

  it('"safe to spend" matches Check Budget', () => {
    const results = filterCommands(NEW_COMMANDS, 'safe to spend');
    expect(results.some((c) => c.id === 'action-check-budget')).toBe(true);
  });

  it('"bill" matches Add Bill', () => {
    const results = filterCommands(NEW_COMMANDS, 'bill');
    expect(results.some((c) => c.id === 'action-add-bill')).toBe(true);
  });

  it('empty search returns all', () => {
    expect(filterCommands(NEW_COMMANDS, '')).toHaveLength(4);
  });
});

// --- Ambient load score ---

interface MockDay {
  events: unknown[];
  bills: unknown[];
  meals: { breakfast: unknown | null; lunch: unknown | null; dinner: unknown | null };
}

function calculateLoadScore(day: MockDay): number {
  const eventLoad = day.events.length * 2;
  const billLoad = day.bills.length;
  const mealGaps = (['breakfast', 'lunch', 'dinner'] as const).filter(
    (t) => !day.meals[t]
  ).length * 0.5;
  return eventLoad + billLoad + mealGaps;
}

function loadToTintClass(score: number): string {
  if (score >= 8) return 'ring-1 ring-amber-500/10';
  if (score >= 5) return 'ring-1 ring-slate-500/10';
  return '';
}

describe('ambient load score', () => {
  it('empty day has low load (meal gaps only)', () => {
    const day: MockDay = { events: [], bills: [], meals: { breakfast: null, lunch: null, dinner: null } };
    expect(calculateLoadScore(day)).toBe(1.5); // 3 meal gaps * 0.5
  });

  it('busy day has high load', () => {
    const day: MockDay = {
      events: [{}, {}, {}, {}],
      bills: [{}, {}],
      meals: { breakfast: {}, lunch: null, dinner: {} },
    };
    expect(calculateLoadScore(day)).toBe(10.5); // 8 + 2 + 0.5
  });

  it('full day with all meals has no meal gap penalty', () => {
    const day: MockDay = {
      events: [{}, {}],
      bills: [],
      meals: { breakfast: {}, lunch: {}, dinner: {} },
    };
    expect(calculateLoadScore(day)).toBe(4); // 4 + 0 + 0
  });
});

describe('load-to-tint mapping', () => {
  it('high load (>=8) gets amber tint', () => {
    expect(loadToTintClass(8)).toContain('amber');
  });

  it('medium load (5-7) gets slate tint', () => {
    expect(loadToTintClass(5)).toContain('slate');
  });

  it('low load (<5) gets no tint', () => {
    expect(loadToTintClass(3)).toBe('');
  });
});
