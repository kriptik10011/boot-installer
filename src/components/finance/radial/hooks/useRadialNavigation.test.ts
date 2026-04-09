import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRadialNavigation } from './useRadialNavigation';

// Zone constants (must match useRadialNavigation.ts):
// CARD_R = 0.75, TRANSIT_R = 0.84, ARC_DETECT_MIN = 0.84, ARC_DETECT_MAX = 1.05
// SWITCH_DELAY = 200, COLLAPSE_DELAY = 300, INITIAL_DELAY = 1
// Ring positions use dist ~0.95 to land in the arc detection band [0.84, 1.05].

describe('useRadialNavigation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initial state: all null/false/0', () => {
    const { result } = renderHook(() => useRadialNavigation());
    expect(result.current.hoveredArc).toBeNull();
    expect(result.current.activeArc).toBeNull();
    expect(result.current.activeCardIndex).toBe(0);
    expect(result.current.showComprehensive).toBe(false);
  });

  it('updateHoverFromPosition sets activeArc after initial delay for north quadrant', () => {
    const { result } = renderHook(() => useRadialNavigation());

    act(() => { result.current.updateHoverFromPosition(0, -0.95); });
    expect(result.current.hoveredArc).toBe('north');
    // activeArc set after INITIAL_DELAY timer
    act(() => { vi.advanceTimersByTime(60); });
    expect(result.current.activeArc).toBe('north');
    expect(result.current.activeCardIndex).toBe(0);
  });

  it('switch between arcs via position with dwell', () => {
    const { result } = renderHook(() => useRadialNavigation());

    // Move to north, advance past initial delay
    act(() => { result.current.updateHoverFromPosition(0, -0.95); });
    act(() => { vi.advanceTimersByTime(60); });
    expect(result.current.activeArc).toBe('north');

    // Move to east — needs switch delay (card is now active, SWITCH_DELAY = 200ms)
    act(() => { result.current.updateHoverFromPosition(0.95, 0); });
    expect(result.current.hoveredArc).toBe('east');
    act(() => { vi.advanceTimersByTime(260); });
    expect(result.current.activeArc).toBe('east');
    expect(result.current.activeCardIndex).toBe(0);
  });

  it('center dead zone clears hover but keeps activeArc', () => {
    const { result } = renderHook(() => useRadialNavigation());

    // Activate north first
    act(() => { result.current.updateHoverFromPosition(0, -0.95); });
    act(() => { vi.advanceTimersByTime(60); });
    expect(result.current.activeArc).toBe('north');

    // Move to center dead zone (dist 0.05 << CARD_R 0.75)
    act(() => { result.current.updateHoverFromPosition(0, 0.05); });
    expect(result.current.activeArc).toBe('north'); // kept
  });

  it('all four quadrants map correctly', () => {
    const { result } = renderHook(() => useRadialNavigation());

    act(() => { result.current.updateHoverFromPosition(0, -0.95); });
    act(() => { vi.advanceTimersByTime(60); });
    expect(result.current.activeArc).toBe('north');

    act(() => { result.current.updateHoverFromPosition(0.95, 0); });
    act(() => { vi.advanceTimersByTime(260); });
    expect(result.current.activeArc).toBe('east');

    act(() => { result.current.updateHoverFromPosition(0, 0.95); });
    act(() => { vi.advanceTimersByTime(260); });
    expect(result.current.activeArc).toBe('south');

    act(() => { result.current.updateHoverFromPosition(-0.95, 0); });
    act(() => { vi.advanceTimersByTime(260); });
    expect(result.current.activeArc).toBe('west');
  });

  it('handleContainerLeave clears hover immediately, collapses after 300ms', () => {
    const { result } = renderHook(() => useRadialNavigation());

    // Activate north
    act(() => { result.current.activateArc('north'); });
    expect(result.current.activeArc).toBe('north');

    // Leave container
    act(() => { result.current.handleContainerLeave(); });
    expect(result.current.hoveredArc).toBeNull();
    expect(result.current.activeArc).toBe('north'); // still active during delay

    // Advance past collapse delay (300ms)
    act(() => { vi.advanceTimersByTime(310); });
    expect(result.current.activeArc).toBeNull();
    expect(result.current.activeCardIndex).toBe(0);
  });

  it('re-entering container cancels collapse', () => {
    const { result } = renderHook(() => useRadialNavigation());

    act(() => { result.current.activateArc('north'); });
    act(() => { result.current.handleContainerLeave(); });

    // Re-enter before collapse fires
    act(() => { vi.advanceTimersByTime(200); });
    act(() => { result.current.handleCardEnter(); });

    // Wait past collapse timer — should NOT collapse (timer was cancelled)
    act(() => { vi.advanceTimersByTime(300); });
    expect(result.current.activeArc).toBe('north');
  });

  it('activateArc → instant expand (keyboard)', () => {
    const { result } = renderHook(() => useRadialNavigation());

    act(() => { result.current.activateArc('west'); });
    expect(result.current.activeArc).toBe('west');
    expect(result.current.hoveredArc).toBe('west');
    expect(result.current.activeCardIndex).toBe(0);
  });

  it('collapseArc → immediate reset', () => {
    const { result } = renderHook(() => useRadialNavigation());

    act(() => { result.current.activateArc('east'); });
    expect(result.current.activeArc).toBe('east');

    act(() => { result.current.collapseArc(); });
    expect(result.current.activeArc).toBeNull();
    expect(result.current.hoveredArc).toBeNull();
    expect(result.current.activeCardIndex).toBe(0);
  });

  it('scrollCard within [0, 2] bounds', () => {
    const { result } = renderHook(() => useRadialNavigation());

    act(() => { result.current.activateArc('north'); });

    // Scroll down (maxIndex=2)
    act(() => { result.current.scrollCard(1, 2); });
    expect(result.current.activeCardIndex).toBe(1);

    act(() => { result.current.scrollCard(1, 2); });
    expect(result.current.activeCardIndex).toBe(2);

    // Clamped at 2
    act(() => { result.current.scrollCard(1, 2); });
    expect(result.current.activeCardIndex).toBe(2);

    // Scroll back up
    act(() => { result.current.scrollCard(-1, 2); });
    expect(result.current.activeCardIndex).toBe(1);

    act(() => { result.current.scrollCard(-1, 2); });
    expect(result.current.activeCardIndex).toBe(0);

    // Clamped at 0
    act(() => { result.current.scrollCard(-1, 2); });
    expect(result.current.activeCardIndex).toBe(0);
  });

  it('scrollCard no-ops when no active arc', () => {
    const { result } = renderHook(() => useRadialNavigation());
    act(() => { result.current.scrollCard(1); });
    expect(result.current.activeCardIndex).toBe(0);
  });

  it('showDashboard sets showComprehensive', () => {
    const { result } = renderHook(() => useRadialNavigation());

    act(() => { result.current.showDashboard(); });
    expect(result.current.showComprehensive).toBe(true);
    expect(result.current.activeArc).toBeNull();
  });

  it('hideDashboard resets everything', () => {
    const { result } = renderHook(() => useRadialNavigation());

    act(() => { result.current.showDashboard(); });
    act(() => { result.current.hideDashboard(); });
    expect(result.current.showComprehensive).toBe(false);
    expect(result.current.activeArc).toBeNull();
  });

  it('updateHoverFromPosition ignored during comprehensive view', () => {
    const { result } = renderHook(() => useRadialNavigation());

    act(() => { result.current.showDashboard(); });
    act(() => { result.current.updateHoverFromPosition(0, -0.95); });

    // Should still be in comprehensive, not expanded on north
    expect(result.current.showComprehensive).toBe(true);
    expect(result.current.activeArc).toBeNull();
  });

  // ── Zone boundary tests ──

  it('card zone (dist < 0.75) freezes active arc', () => {
    const { result } = renderHook(() => useRadialNavigation());

    // Activate north via direct click
    act(() => { result.current.activateArc('north'); });
    expect(result.current.activeArc).toBe('north');

    // Move mouse inside card zone (dist = 0.50 < CARD_R 0.75) — should stay frozen
    act(() => { result.current.updateHoverFromPosition(0.35, 0.35); });
    expect(result.current.activeArc).toBe('north');
    expect(result.current.hoveredArc).toBe('north');
  });

  it('transit zone (0.75 < dist < 0.84) suppresses switch while card active', () => {
    const { result } = renderHook(() => useRadialNavigation());

    // Activate north
    act(() => { result.current.activateArc('north'); });

    // Move into transit zone (dist = 0.80, between CARD_R and TRANSIT_R)
    act(() => { result.current.updateHoverFromPosition(0, 0.80); });
    // hoveredArc should revert to activeArc (north), not switch to south
    expect(result.current.hoveredArc).toBe('north');
    expect(result.current.activeArc).toBe('north');
  });

  it('ring zone (dist >= 0.84) detects arc', () => {
    const { result } = renderHook(() => useRadialNavigation());

    // Move to ring zone (dist = 0.95, well inside [0.84, 1.05])
    act(() => { result.current.updateHoverFromPosition(0, -0.95); });
    expect(result.current.hoveredArc).toBe('north');

    // After initial delay, arc activates
    act(() => { vi.advanceTimersByTime(60); });
    expect(result.current.activeArc).toBe('north');
  });

  it('ARC_DETECT_MIN boundary: dist 0.83 produces no candidate', () => {
    const { result } = renderHook(() => useRadialNavigation());

    // dist = 0.83, just below ARC_DETECT_MIN (0.84) — should NOT detect any arc
    act(() => { result.current.updateHoverFromPosition(0, -0.83); });
    act(() => { vi.advanceTimersByTime(60); });
    expect(result.current.activeArc).toBeNull();
  });
});
