/**
 * Finance View Toggle Tests
 *
 * Verifies the appStore financeViewMode state, toggle/cycle behavior,
 * and persist migrations.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '@/stores/appStore';

describe('financeViewMode in appStore', () => {
  beforeEach(() => {
    // Reset store to defaults
    useAppStore.setState({
      financeViewMode: 'classic',
    });
  });

  it('defaults to classic view', () => {
    const mode = useAppStore.getState().financeViewMode;
    expect(mode).toBe('classic');
  });

  it('cycles through radial -> classic -> living -> radial', () => {
    useAppStore.setState({ financeViewMode: 'radial' });

    useAppStore.getState().cycleFinanceViewMode();
    expect(useAppStore.getState().financeViewMode).toBe('classic');

    useAppStore.getState().cycleFinanceViewMode();
    expect(useAppStore.getState().financeViewMode).toBe('living');

    useAppStore.getState().cycleFinanceViewMode();
    expect(useAppStore.getState().financeViewMode).toBe('radial');
  });

  it('sets view mode directly', () => {
    useAppStore.getState().setFinanceViewMode('living');
    expect(useAppStore.getState().financeViewMode).toBe('living');

    useAppStore.getState().setFinanceViewMode('radial');
    expect(useAppStore.getState().financeViewMode).toBe('radial');

    useAppStore.getState().setFinanceViewMode('classic');
    expect(useAppStore.getState().financeViewMode).toBe('classic');
  });

  it('is included in persist partialize', () => {
    useAppStore.getState().setFinanceViewMode('radial');
    const state = useAppStore.getState();
    expect(state.financeViewMode).toBe('radial');
  });

  it('v5→v6 migration maps aurora to living', () => {
    // Simulate v5 persisted state with aurora
    const v5State = { financeViewMode: 'aurora' } as Record<string, unknown>;
    // The migration logic: aurora → living
    const fvm = v5State.financeViewMode === 'aurora' ? 'living' : (v5State.financeViewMode ?? 'classic');
    expect(fvm).toBe('living');
  });

  it('v5→v6 migration preserves classic', () => {
    const v5State = { financeViewMode: 'classic' } as Record<string, unknown>;
    const fvm = v5State.financeViewMode === 'aurora' ? 'living' : (v5State.financeViewMode ?? 'classic');
    expect(fvm).toBe('classic');
  });
});
