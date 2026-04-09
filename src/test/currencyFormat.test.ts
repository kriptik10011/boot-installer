import { describe, it, expect } from 'vitest';
import {
  fmtCurrencyAbbrev,
  fmtCurrencyFull,
  fmtCurrencyCents,
  fmtCurrencyRound,
} from '@/utils/currencyFormat';

describe('fmtCurrencyAbbrev', () => {
  it('abbreviates millions', () => {
    expect(fmtCurrencyAbbrev(1_500_000)).toBe('$1.5M');
    expect(fmtCurrencyAbbrev(2_000_000)).toBe('$2.0M');
  });

  it('abbreviates thousands', () => {
    expect(fmtCurrencyAbbrev(5_400)).toBe('$5.4K');
    expect(fmtCurrencyAbbrev(1_000)).toBe('$1.0K');
  });

  it('shows whole dollars below 1K', () => {
    expect(fmtCurrencyAbbrev(123)).toBe('$123');
    expect(fmtCurrencyAbbrev(0)).toBe('$0');
  });

  it('handles negative values', () => {
    expect(fmtCurrencyAbbrev(-2_500_000)).toBe('$-2.5M');
    expect(fmtCurrencyAbbrev(-999)).toBe('$-999');
  });

  it('handles edge cases', () => {
    expect(fmtCurrencyAbbrev(NaN)).toBe('$0');
    expect(fmtCurrencyAbbrev(Infinity)).toBe('$0');
    expect(fmtCurrencyAbbrev(-Infinity)).toBe('$0');
  });
});

describe('fmtCurrencyFull', () => {
  it('formats with locale grouping', () => {
    expect(fmtCurrencyFull(1234567)).toMatch(/^\$1,?234,?567$/);
  });

  it('rounds to whole dollars', () => {
    expect(fmtCurrencyFull(1234.99)).toMatch(/^\$1,?235$/);
  });

  it('uses absolute value', () => {
    expect(fmtCurrencyFull(-500)).toBe('$500');
  });

  it('handles edge cases', () => {
    expect(fmtCurrencyFull(0)).toBe('$0');
    expect(fmtCurrencyFull(NaN)).toBe('$0');
    expect(fmtCurrencyFull(Infinity)).toBe('$0');
  });
});

describe('fmtCurrencyCents', () => {
  it('shows 2 decimal places', () => {
    expect(fmtCurrencyCents(1234.5)).toMatch(/^\$1,?234\.50$/);
    expect(fmtCurrencyCents(99.99)).toBe('$99.99');
  });

  it('uses absolute value', () => {
    expect(fmtCurrencyCents(-42.1)).toBe('$42.10');
  });

  it('handles edge cases', () => {
    expect(fmtCurrencyCents(0)).toBe('$0.00');
    expect(fmtCurrencyCents(NaN)).toBe('$0.00');
    expect(fmtCurrencyCents(Infinity)).toBe('$0.00');
  });
});

describe('fmtCurrencyRound', () => {
  it('formats with locale grouping, no decimals', () => {
    expect(fmtCurrencyRound(1234)).toBe('$1,234');
    expect(fmtCurrencyRound(0)).toBe('$0');
  });

  it('uses absolute value', () => {
    expect(fmtCurrencyRound(-750)).toBe('$750');
  });

  it('handles null/undefined', () => {
    expect(fmtCurrencyRound(null)).toBe('$0');
    expect(fmtCurrencyRound(undefined)).toBe('$0');
  });

  it('handles edge cases', () => {
    expect(fmtCurrencyRound(NaN)).toBe('$0');
    expect(fmtCurrencyRound(Infinity)).toBe('$0');
  });
});
