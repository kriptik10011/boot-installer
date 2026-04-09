import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useReducedMotion } from './useReducedMotion';

describe('useReducedMotion', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns false when prefers-reduced-motion is no-preference', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: false,
      media: '(prefers-reduced-motion: reduce)',
    } as MediaQueryList);

    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
  });

  it('returns true when prefers-reduced-motion is reduce', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
    } as MediaQueryList);

    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);
  });

  it('calls matchMedia with correct query', () => {
    const spy = vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: false,
      media: '(prefers-reduced-motion: reduce)',
    } as MediaQueryList);

    renderHook(() => useReducedMotion());
    expect(spy).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
  });
});
