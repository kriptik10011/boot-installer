import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// Mock appStore before importing module under test
const mockUseAppStore = vi.fn();
vi.mock('@/stores/appStore', () => ({
  useAppStore: (selector: (s: unknown) => unknown) => mockUseAppStore(selector),
}));

import {
  useCardShape,
  JUNCTION_INSETS,
  JUNCTION_CONTENT_PADDING,
  JUNCTION_ACCENTS,
  CARD_SIZES,
  PILL_COLUMN_STYLE,
  BUTTON_MIN_TEXT,
  MAX_PILL_ITEMS,
  PILL_RADIUS_LEFT,
  PILL_RADIUS_RIGHT,
  PILL_RADIUS_SINGLE,
} from '../cardTemplate';

describe('cardTemplate', () => {
  describe('useCardShape', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('returns rectangular shape when store has rectangular', () => {
      mockUseAppStore.mockImplementation((selector: (s: { latticePrefs: { cardShape: string } }) => unknown) =>
        selector({ latticePrefs: { cardShape: 'rectangular' } })
      );

      const { result } = renderHook(() => useCardShape());
      expect(result.current.cardShape).toBe('rectangular');
      expect(result.current.isCircular).toBe(false);
    });

    it('returns circular shape when store has circular', () => {
      mockUseAppStore.mockImplementation((selector: (s: { latticePrefs: { cardShape: string } }) => unknown) =>
        selector({ latticePrefs: { cardShape: 'circular' } })
      );

      const { result } = renderHook(() => useCardShape());
      expect(result.current.cardShape).toBe('circular');
      expect(result.current.isCircular).toBe(true);
    });

    it('defaults to rectangular when store returns null', () => {
      mockUseAppStore.mockImplementation((selector: (s: { latticePrefs: { cardShape: null } }) => unknown) =>
        selector({ latticePrefs: { cardShape: null } })
      );

      const { result } = renderHook(() => useCardShape());
      expect(result.current.cardShape).toBe('rectangular');
      expect(result.current.isCircular).toBe(false);
    });

    it('defaults to rectangular when store returns undefined', () => {
      mockUseAppStore.mockImplementation((selector: (s: { latticePrefs: Record<string, never> }) => unknown) =>
        selector({ latticePrefs: {} })
      );

      const { result } = renderHook(() => useCardShape());
      expect(result.current.cardShape).toBe('rectangular');
      expect(result.current.isCircular).toBe(false);
    });
  });

  describe('JUNCTION_INSETS', () => {
    it('has circ variant with shield and card', () => {
      expect(JUNCTION_INSETS.circ).toBeDefined();
      expect(JUNCTION_INSETS.circ.shield).toBeDefined();
      expect(JUNCTION_INSETS.circ.card).toBeDefined();
    });
  });

  describe('JUNCTION_CONTENT_PADDING', () => {
    it('padding uses cqi units', () => {
      expect(JUNCTION_CONTENT_PADDING).toContain('cqi');
    });
  });

  describe('JUNCTION_ACCENTS', () => {
    it('has all 4 junction positions', () => {
      expect(JUNCTION_ACCENTS.nw).toMatch(/^#/);
      expect(JUNCTION_ACCENTS.ne).toMatch(/^#/);
      expect(JUNCTION_ACCENTS.se).toMatch(/^#/);
      expect(JUNCTION_ACCENTS.sw).toMatch(/^#/);
    });
  });

  describe('card template constants', () => {
    it('CARD_SIZES has expected keys', () => {
      expect(CARD_SIZES.heroText).toBeGreaterThan(0);
      expect(CARD_SIZES.labelText).toBeGreaterThan(0);
      expect(CARD_SIZES.statusText).toBeGreaterThan(0);
    });

    it('PILL_COLUMN_STYLE has no border', () => {
      expect(PILL_COLUMN_STYLE.border).toBe('none');
    });

    it('PILL_COLUMN_STYLE has backdrop blur', () => {
      expect(PILL_COLUMN_STYLE.backdropFilter).toContain('blur');
    });

    it('BUTTON_MIN_TEXT is at least 2.4', () => {
      expect(BUTTON_MIN_TEXT).toBeGreaterThanOrEqual(2.4);
    });

    it('MAX_PILL_ITEMS is 3', () => {
      expect(MAX_PILL_ITEMS).toBe(3);
    });

    it('pill radii are defined', () => {
      expect(PILL_RADIUS_LEFT).toContain('cqi');
      expect(PILL_RADIUS_RIGHT).toContain('cqi');
      // PILL_RADIUS_SINGLE is '9999px' (full pill shape)
      expect(PILL_RADIUS_SINGLE).toBe('9999px');
    });
  });
});
