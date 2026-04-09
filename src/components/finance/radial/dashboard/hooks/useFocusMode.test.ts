import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFocusMode } from './useFocusMode';

describe('useFocusMode', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initial state: no card focused, isFocusMode false', () => {
    const { result } = renderHook(() => useFocusMode());
    expect(result.current.focusedCard).toBeNull();
    expect(result.current.isFocusMode).toBe(false);
  });

  it('focusCard sets focusedCard and isFocusMode to true', () => {
    const { result } = renderHook(() => useFocusMode());
    act(() => { result.current.focusCard('card-1'); });
    expect(result.current.focusedCard).toBe('card-1');
    expect(result.current.isFocusMode).toBe(true);
  });

  it('focusCard same card toggles off (unfocuses)', () => {
    const { result } = renderHook(() => useFocusMode());
    act(() => { result.current.focusCard('card-1'); });
    expect(result.current.isFocusMode).toBe(true);

    act(() => { result.current.focusCard('card-1'); });
    expect(result.current.focusedCard).toBeNull();
    expect(result.current.isFocusMode).toBe(false);
  });

  it('focusCard switches to a different card', () => {
    const { result } = renderHook(() => useFocusMode());
    act(() => { result.current.focusCard('card-1'); });
    expect(result.current.focusedCard).toBe('card-1');

    act(() => { result.current.focusCard('card-2'); });
    expect(result.current.focusedCard).toBe('card-2');
    expect(result.current.isFocusMode).toBe(true);
  });

  it('unfocus clears the focused card', () => {
    const { result } = renderHook(() => useFocusMode());
    act(() => { result.current.focusCard('card-1'); });
    act(() => { result.current.unfocus(); });
    expect(result.current.focusedCard).toBeNull();
    expect(result.current.isFocusMode).toBe(false);
  });

  describe('getCardOpacity', () => {
    it('returns 1 for all cards when no focus mode', () => {
      const { result } = renderHook(() => useFocusMode());
      expect(result.current.getCardOpacity('any-card')).toBe(1);
    });

    it('returns 1 for focused card, 0.25 for siblings', () => {
      const { result } = renderHook(() => useFocusMode());
      act(() => { result.current.focusCard('card-1'); });
      expect(result.current.getCardOpacity('card-1')).toBe(1);
      expect(result.current.getCardOpacity('card-2')).toBe(0.25);
      expect(result.current.getCardOpacity('card-3')).toBe(0.25);
    });
  });

  describe('getCardScale', () => {
    it('returns 1 for all cards when no focus mode', () => {
      const { result } = renderHook(() => useFocusMode());
      expect(result.current.getCardScale('any-card')).toBe(1);
    });

    it('returns 1.02 for focused card, 0.98 for siblings', () => {
      const { result } = renderHook(() => useFocusMode());
      act(() => { result.current.focusCard('card-1'); });
      expect(result.current.getCardScale('card-1')).toBe(1.02);
      expect(result.current.getCardScale('card-2')).toBe(0.98);
    });
  });

  describe('keyboard interaction', () => {
    it('Escape key unfocuses the card', () => {
      const { result } = renderHook(() => useFocusMode());
      act(() => { result.current.focusCard('card-1'); });
      expect(result.current.isFocusMode).toBe(true);

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      });
      expect(result.current.focusedCard).toBeNull();
      expect(result.current.isFocusMode).toBe(false);
    });

    it('Escape does nothing when no card is focused', () => {
      const { result } = renderHook(() => useFocusMode());
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      });
      expect(result.current.focusedCard).toBeNull();
    });

    it('non-Escape keys do not unfocus', () => {
      const { result } = renderHook(() => useFocusMode());
      act(() => { result.current.focusCard('card-1'); });

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      });
      expect(result.current.focusedCard).toBe('card-1');
    });

    it('keyboard listener is cleaned up when card unfocuses', () => {
      const addSpy = vi.spyOn(window, 'addEventListener');
      const removeSpy = vi.spyOn(window, 'removeEventListener');

      const { result } = renderHook(() => useFocusMode());

      // No listener when unfocused
      const keydownCalls = addSpy.mock.calls.filter(c => c[0] === 'keydown');
      expect(keydownCalls).toHaveLength(0);

      // Focus adds listener
      act(() => { result.current.focusCard('card-1'); });
      const keydownCallsAfterFocus = addSpy.mock.calls.filter(c => c[0] === 'keydown');
      expect(keydownCallsAfterFocus.length).toBeGreaterThan(0);

      // Unfocus triggers cleanup
      act(() => { result.current.unfocus(); });
      const removeKeydownCalls = removeSpy.mock.calls.filter(c => c[0] === 'keydown');
      expect(removeKeydownCalls.length).toBeGreaterThan(0);
    });
  });
});
