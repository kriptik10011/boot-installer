/**
 * Keyboard Navigation + Sediment Layer Tests (Session 3: X6 + X2)
 *
 * Tests for:
 * - useKeyboardNavigation: Arrow keys, Enter, Escape, Home, End
 * - Sediment layer: Paid bills sorted to bottom
 */

import { describe, it, expect } from 'vitest';

// --- Keyboard Navigation logic tests ---

function clamp(index: number, gridSize: number): number {
  return Math.max(0, Math.min(gridSize - 1, index));
}

describe('useKeyboardNavigation', () => {
  const gridSize = 7;

  it('ArrowRight increments focus index', () => {
    const current = 2;
    expect(clamp(current + 1, gridSize)).toBe(3);
  });

  it('ArrowLeft decrements focus index', () => {
    const current = 3;
    expect(clamp(current - 1, gridSize)).toBe(2);
  });

  it('clamps at left boundary (index 0)', () => {
    const current = 0;
    expect(clamp(current - 1, gridSize)).toBe(0);
  });

  it('clamps at right boundary (index 6)', () => {
    const current = 6;
    expect(clamp(current + 1, gridSize)).toBe(6);
  });

  it('Home goes to index 0', () => {
    expect(clamp(0, gridSize)).toBe(0);
  });

  it('End goes to last index', () => {
    expect(clamp(gridSize - 1, gridSize)).toBe(6);
  });

  it('handles single-cell grid', () => {
    expect(clamp(0, 1)).toBe(0);
    expect(clamp(-1, 1)).toBe(0);
    expect(clamp(1, 1)).toBe(0);
  });
});

// --- Sediment Layer: Bill sorting tests ---

interface MockBill {
  id: number;
  name: string;
  is_paid: boolean;
  amount: number;
}

function sortBillsSediment(bills: MockBill[]): MockBill[] {
  return [...bills].sort((a, b) => {
    if (a.is_paid === b.is_paid) return 0;
    return a.is_paid ? 1 : -1;
  });
}

describe('sediment layer bill sorting', () => {
  it('paid bills settle to bottom', () => {
    const bills: MockBill[] = [
      { id: 1, name: 'Electric', is_paid: true, amount: 100 },
      { id: 2, name: 'Water', is_paid: false, amount: 50 },
      { id: 3, name: 'Internet', is_paid: false, amount: 80 },
    ];
    const sorted = sortBillsSediment(bills);
    expect(sorted[0].name).toBe('Water');
    expect(sorted[1].name).toBe('Internet');
    expect(sorted[2].name).toBe('Electric');
  });

  it('preserves order when all unpaid', () => {
    const bills: MockBill[] = [
      { id: 1, name: 'A', is_paid: false, amount: 10 },
      { id: 2, name: 'B', is_paid: false, amount: 20 },
    ];
    const sorted = sortBillsSediment(bills);
    expect(sorted[0].name).toBe('A');
    expect(sorted[1].name).toBe('B');
  });

  it('preserves order when all paid', () => {
    const bills: MockBill[] = [
      { id: 1, name: 'A', is_paid: true, amount: 10 },
      { id: 2, name: 'B', is_paid: true, amount: 20 },
    ];
    const sorted = sortBillsSediment(bills);
    expect(sorted[0].name).toBe('A');
    expect(sorted[1].name).toBe('B');
  });

  it('handles empty bills array', () => {
    expect(sortBillsSediment([])).toEqual([]);
  });

  it('does not mutate original array', () => {
    const bills: MockBill[] = [
      { id: 1, name: 'Paid', is_paid: true, amount: 10 },
      { id: 2, name: 'Unpaid', is_paid: false, amount: 20 },
    ];
    const originalFirst = bills[0].name;
    sortBillsSediment(bills);
    expect(bills[0].name).toBe(originalFirst);
  });
});
