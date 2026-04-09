import { describe, it, expect } from 'vitest';
import { parseTimeInput } from '../components/shared/TimeInput';

describe('parseTimeInput', () => {
  // ── Standard HH:MM passthrough ──
  it('passes through valid HH:MM', () => {
    expect(parseTimeInput('09:30')).toBe('09:30');
    expect(parseTimeInput('14:00')).toBe('14:00');
    expect(parseTimeInput('23:59')).toBe('23:59');
    expect(parseTimeInput('00:00')).toBe('00:00');
  });

  it('rejects invalid HH:MM', () => {
    expect(parseTimeInput('25:00')).toBeNull();
    expect(parseTimeInput('12:60')).toBeNull();
  });

  // ── AM/PM formats ──
  it('parses "2pm" → "14:00"', () => {
    expect(parseTimeInput('2pm')).toBe('14:00');
  });

  it('parses "2am" → "02:00"', () => {
    expect(parseTimeInput('2am')).toBe('02:00');
  });

  it('parses "12pm" → "12:00"', () => {
    expect(parseTimeInput('12pm')).toBe('12:00');
  });

  it('parses "12am" → "00:00"', () => {
    expect(parseTimeInput('12am')).toBe('00:00');
  });

  it('parses "2:30pm" → "14:30"', () => {
    expect(parseTimeInput('2:30pm')).toBe('14:30');
  });

  it('parses "2:30p" → "14:30"', () => {
    expect(parseTimeInput('2:30p')).toBe('14:30');
  });

  it('parses "11:45am" → "11:45"', () => {
    expect(parseTimeInput('11:45am')).toBe('11:45');
  });

  it('parses "11:45a" → "11:45"', () => {
    expect(parseTimeInput('11:45a')).toBe('11:45');
  });

  // ── Digit-only formats ──
  it('parses "930" → "09:30"', () => {
    expect(parseTimeInput('930')).toBe('09:30');
  });

  it('parses "1430" → "14:30"', () => {
    expect(parseTimeInput('1430')).toBe('14:30');
  });

  it('parses "930a" → "09:30"', () => {
    expect(parseTimeInput('930a')).toBe('09:30');
  });

  it('parses "130pm" → "13:30"', () => {
    expect(parseTimeInput('130pm')).toBe('13:30');
  });

  // ── Hour-only formats ──
  it('parses "2" → "02:00"', () => {
    expect(parseTimeInput('2')).toBe('02:00');
  });

  it('parses "14" → "14:00"', () => {
    expect(parseTimeInput('14')).toBe('14:00');
  });

  it('parses "9" → "09:00"', () => {
    expect(parseTimeInput('9')).toBe('09:00');
  });

  // ── Edge cases ──
  it('returns null for empty string', () => {
    expect(parseTimeInput('')).toBeNull();
  });

  it('returns null for whitespace', () => {
    expect(parseTimeInput('   ')).toBeNull();
  });

  it('returns null for garbage', () => {
    expect(parseTimeInput('hello')).toBeNull();
    expect(parseTimeInput('abc123')).toBeNull();
  });

  it('trims whitespace before parsing', () => {
    expect(parseTimeInput(' 2pm ')).toBe('14:00');
    expect(parseTimeInput('  09:30  ')).toBe('09:30');
  });

  it('handles case insensitivity', () => {
    expect(parseTimeInput('2PM')).toBe('14:00');
    expect(parseTimeInput('2Am')).toBe('02:00');
    expect(parseTimeInput('2:30PM')).toBe('14:30');
  });
});
