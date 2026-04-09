import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePrivacyBlur } from './usePrivacyBlur';

describe('usePrivacyBlur', () => {
  let originalHidden: boolean;

  beforeEach(() => {
    originalHidden = document.hidden;
    // Make document.hidden writable for tests
    Object.defineProperty(document, 'hidden', {
      writable: true,
      configurable: true,
      value: false,
    });
  });

  afterEach(() => {
    Object.defineProperty(document, 'hidden', {
      writable: true,
      configurable: true,
      value: originalHidden,
    });
    vi.restoreAllMocks();
  });

  it('initial state: not blurred, not auto-blurred', () => {
    const { result } = renderHook(() => usePrivacyBlur());
    expect(result.current.isBlurred).toBe(false);
    expect(result.current.isAutoBlur).toBe(false);
  });

  it('toggleManualBlur sets isBlurred to true', () => {
    const { result } = renderHook(() => usePrivacyBlur());
    act(() => { result.current.toggleManualBlur(); });
    expect(result.current.isBlurred).toBe(true);
    expect(result.current.isAutoBlur).toBe(false);
  });

  it('toggleManualBlur twice returns to unblurred', () => {
    const { result } = renderHook(() => usePrivacyBlur());
    act(() => { result.current.toggleManualBlur(); });
    expect(result.current.isBlurred).toBe(true);

    act(() => { result.current.toggleManualBlur(); });
    expect(result.current.isBlurred).toBe(false);
  });

  it('tab hidden triggers auto blur', () => {
    const { result } = renderHook(() => usePrivacyBlur());

    act(() => {
      Object.defineProperty(document, 'hidden', {
        writable: true,
        configurable: true,
        value: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(result.current.isAutoBlur).toBe(true);
    expect(result.current.isBlurred).toBe(true);
  });

  it('tab visible again clears auto blur', () => {
    const { result } = renderHook(() => usePrivacyBlur());

    // Hide tab
    act(() => {
      Object.defineProperty(document, 'hidden', { writable: true, configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(result.current.isAutoBlur).toBe(true);

    // Show tab
    act(() => {
      Object.defineProperty(document, 'hidden', { writable: true, configurable: true, value: false });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(result.current.isAutoBlur).toBe(false);
    expect(result.current.isBlurred).toBe(false);
  });

  it('manual blur persists after auto blur clears', () => {
    const { result } = renderHook(() => usePrivacyBlur());

    // Manual blur on
    act(() => { result.current.toggleManualBlur(); });

    // Tab hidden
    act(() => {
      Object.defineProperty(document, 'hidden', { writable: true, configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(result.current.isBlurred).toBe(true);

    // Tab visible — auto blur clears but manual persists
    act(() => {
      Object.defineProperty(document, 'hidden', { writable: true, configurable: true, value: false });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(result.current.isAutoBlur).toBe(false);
    expect(result.current.isBlurred).toBe(true); // manual still on
  });

  it('autoBlurEnabled=false disables visibility listener', () => {
    const addSpy = vi.spyOn(document, 'addEventListener');
    renderHook(() => usePrivacyBlur(false));

    const visCalls = addSpy.mock.calls.filter(c => c[0] === 'visibilitychange');
    expect(visCalls).toHaveLength(0);
  });

  it('default autoBlurEnabled is true (listener added)', () => {
    const addSpy = vi.spyOn(document, 'addEventListener');
    renderHook(() => usePrivacyBlur());

    const visCalls = addSpy.mock.calls.filter(c => c[0] === 'visibilitychange');
    expect(visCalls.length).toBeGreaterThan(0);
  });

  it('listener is cleaned up on unmount', () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    const { unmount } = renderHook(() => usePrivacyBlur());

    unmount();

    const visCalls = removeSpy.mock.calls.filter(c => c[0] === 'visibilitychange');
    expect(visCalls.length).toBeGreaterThan(0);
  });
});
