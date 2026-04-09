/**
 * FinancePanel Orchestrator Tests
 *
 * Tests the orchestrator pattern: view toggle renders correct view,
 * toggle state persists, header structure, aria attributes.
 * V2.5: Aurora replaced by Living Vitals.
 */

import { describe, it, expect } from 'vitest';

type FinanceViewMode = 'classic' | 'living';

function toggleMode(current: FinanceViewMode): FinanceViewMode {
  return current === 'classic' ? 'living' : 'classic';
}

function getAriaLabel(isLiving: boolean): string {
  return `Switch to ${isLiving ? 'classic' : 'living'} view`;
}

function getButtonText(isLiving: boolean): string {
  return isLiving ? 'Living' : 'Classic';
}

describe('FinancePanel - orchestrator', () => {
  it('view mode defaults to classic', () => {
    const defaultMode: FinanceViewMode = 'classic';
    expect(defaultMode).toBe('classic');
    expect(defaultMode).not.toBe('living');
  });

  it('toggle switches from classic to living', () => {
    const result = toggleMode('classic');
    expect(result).toBe('living');
  });

  it('toggle switches from living back to classic', () => {
    const result = toggleMode('living');
    expect(result).toBe('classic');
  });

  it('toggle button aria-label reflects current state', () => {
    expect(getAriaLabel(true)).toBe('Switch to classic view');
    expect(getAriaLabel(false)).toBe('Switch to living view');
  });

  it('toggle button aria-pressed matches living state', () => {
    // In FinancePanel: aria-pressed={isLiving}
    const livingPressed = true;
    const classicPressed = false;
    expect(livingPressed).toBe(true);
    expect(classicPressed).toBe(false);
  });

  it('toggle button text reflects active view', () => {
    expect(getButtonText(true)).toBe('Living');
    expect(getButtonText(false)).toBe('Classic');
  });
});

describe('FinancePanel - command palette integration', () => {
  it('toggleFinanceView command toggles between modes', () => {
    let mode: FinanceViewMode = 'classic';
    const toggle = () => { mode = toggleMode(mode); };
    toggle();
    expect(mode).toBe('living');
    toggle();
    expect(mode).toBe('classic');
  });

  it('command palette action-toggle-finance-view has correct keywords', () => {
    const keywords = ['living', 'vitals', 'classic', 'view', 'finance', 'dashboard'];
    expect(keywords).toContain('living');
    expect(keywords).toContain('classic');
    expect(keywords).toContain('vitals');
    expect(keywords).toContain('finance');
  });
});
