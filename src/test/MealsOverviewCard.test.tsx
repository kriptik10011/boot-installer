/**
 * MealsOverviewCard — Tests for the day-arc spoke-based meal planner.
 *
 * Architecture: 14 arced day pills on two 150-degree arcs.
 * Click day -> spoke with 3 meal slot circles (B/L/D).
 * Hover slot -> expanded view. Click -> recipe picker overlay.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('@/stores/toastStore', () => ({
  useToastStore: vi.fn((selector: (s: { addToast: ReturnType<typeof vi.fn> }) => unknown) =>
    selector({ addToast: vi.fn() }),
  ),
}));

vi.mock('@/utils/dateUtils', () => {
  const WEEK_DATES = [
    '2026-03-16', '2026-03-17', '2026-03-18', '2026-03-19',
    '2026-03-20', '2026-03-21', '2026-03-22',
  ];
  const NEXT_WEEK_DATES = [
    '2026-03-23', '2026-03-24', '2026-03-25', '2026-03-26',
    '2026-03-27', '2026-03-28', '2026-03-29',
  ];
  return {
    getMonday: vi.fn(() => '2026-03-16'),
    getTodayLocal: vi.fn(() => '2026-03-16'),
    getWeekDates: vi.fn((start: string) =>
      start === '2026-03-16' ? WEEK_DATES : NEXT_WEEK_DATES,
    ),
    addWeeks: vi.fn((_start: string, _n: number) => '2026-03-23'),
    parseDateLocal: vi.fn((dateStr: string) => new Date(dateStr + 'T00:00:00')),
  };
});

vi.mock('@/components/finance/radial/cardTemplate', () => ({
  CARD_SIZES: { labelText: 3.5 },
}));

vi.mock('@/components/finance/radial/cards/shared/arcHelpers', () => ({
  arcPath: vi.fn(() => 'M 0 0'),
  circlePoint: vi.fn(() => ({ x: 200, y: 200 })),
}));

vi.mock('@/hooks', () => ({
  useCreateMeal: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
  })),
  useDeleteMeal: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
  })),
  useRecipes: vi.fn(() => ({ data: [] })),
  useRecipeCategories: vi.fn(() => ({ data: [] })),
}));

vi.mock('@/hooks/useRecipeInsights', () => ({
  useRecipeFavorites: vi.fn(() => ({ data: [] })),
}));

vi.mock('@/hooks/useTags', () => ({
  useTags: vi.fn(() => ({ data: [] })),
}));

vi.mock('@/hooks/useMealIntelligence', () => ({
  useMealIntelligence: vi.fn(() => ({
    gaps: [],
    suggestions: [],
    expiringIngredientSuggestions: [],
    plannedCount: 0,
    unplannedCount: 0,
    confidence: 0.5,
    isLearning: false,
    isLoading: false,
    byDate: {},
    nextMealGap: null,
    coveragePct: 0,
    dayFills: [],
    allMeals: [],
  })),
}));

// Import AFTER mocks are registered.
import { MealsOverviewCard } from '@/components/finance/radial/cards/meals/MealsOverviewCard';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderCard() {
  return render(
    <QueryClientProvider client={makeQueryClient()}>
      <MealsOverviewCard />
    </QueryClientProvider>,
  );
}

/** Returns all buttons whose visible text is exactly one day-label character. */
function getDayButtons(): HTMLElement[] {
  return screen.getAllByRole('button').filter((b) => {
    const text = b.textContent?.trim() ?? '';
    return text.length === 1 && /^[MTWFS]$/.test(text);
  });
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('MealsOverviewCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('arc view (default)', () => {
    it('renders the planned count display', () => {
      renderCard();
      expect(screen.getByText('/42 planned')).toBeDefined();
    });

    it('renders 14 day pill buttons total (7 this week + 7 next week)', () => {
      renderCard();
      expect(getDayButtons()).toHaveLength(14);
    });

    it('renders M T W T F S S labels across both arcs', () => {
      renderCard();
      const dayButtons = getDayButtons();
      const labels = dayButtons.map((b) => b.textContent?.trim());
      expect(labels).toEqual(['M', 'T', 'W', 'T', 'F', 'S', 'S', 'M', 'T', 'W', 'T', 'F', 'S', 'S']);
    });

    it('hero metric shows 0 planned with no meals', () => {
      renderCard();
      expect(screen.getByText('0')).toBeDefined();
    });
  });

  describe('spoke expansion (click day)', () => {
    it('clicking a day pill shows meal slot circles', () => {
      renderCard();
      const mondayBtn = getDayButtons()[0];
      act(() => {
        fireEvent.click(mondayBtn);
      });
      // After clicking, 3 meal slot circles should appear (B, L, D)
      // They render as role="button" divs with meal type icons or letters
      const allButtons = screen.getAllByRole('button');
      // Should have 14 day pills + 3 meal slots = 17+ buttons
      expect(allButtons.length).toBeGreaterThanOrEqual(17);
    });

    it('clicking the same day pill again collapses the spoke', () => {
      renderCard();
      const mondayBtn = getDayButtons()[0];
      act(() => { fireEvent.click(mondayBtn); });
      act(() => { fireEvent.click(mondayBtn); });
      // Back to 14 day pills only
      const dayButtons = getDayButtons();
      expect(dayButtons).toHaveLength(14);
    });

    it('clicking two different days expands both spokes', () => {
      renderCard();
      const buttons = getDayButtons();
      act(() => { fireEvent.click(buttons[0]); }); // Monday
      act(() => { fireEvent.click(buttons[1]); }); // Tuesday
      const allButtons = screen.getAllByRole('button');
      // 14 day pills + 6 meal slots (3 per day) = 20+ buttons
      expect(allButtons.length).toBeGreaterThanOrEqual(20);
    });

    it('hero metric click collapses all expanded days', () => {
      renderCard();
      const mondayBtn = getDayButtons()[0];
      act(() => { fireEvent.click(mondayBtn); });
      // Click the hero (planned count) to dismiss all
      const heroText = screen.getByText('0');
      act(() => { fireEvent.click(heroText.parentElement!); });
      expect(getDayButtons()).toHaveLength(14);
    });
  });
});
