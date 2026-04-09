/**
 * RadialDashboard Tests
 *
 * Goal: verify the component mounts without error and renders its core
 * structural elements. All heavy dependencies are mocked aggressively.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// ── Mock framer-motion before importing the component ────────────────────────

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement> & { children?: ReactNode }) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

// ── Mock radial hooks ─────────────────────────────────────────────────────────

vi.mock('@/components/finance/radial/hooks/useRadialNavigation', () => ({
  useRadialNavigation: vi.fn(() => ({
    hoveredArc: null,
    activeArc: null,
    activeCardIndex: 0,
    showComprehensive: false,
    hoveredJunction: null,
    activeJunction: null,
    junctionCardIndex: 0,
    subArcMode: null,
    enterSubArc: vi.fn(),
    exitSubArc: vi.fn(),
    activateArc: vi.fn(),
    collapseArc: vi.fn(),
    activateJunction: vi.fn(),
    scrollCard: vi.fn(),
    scrollJunctionCard: vi.fn(),
    showDashboard: vi.fn(),
    hideDashboard: vi.fn(),
    updateHoverFromPosition: vi.fn(),
    handleContainerLeave: vi.fn(),
    handleCardEnter: vi.fn(),
  })),
}));

vi.mock('@/components/finance/radial/hooks/useReducedMotion', () => ({
  useReducedMotion: vi.fn(() => false),
}));

// useWidgetData removed — widgets are self-fetching

vi.mock('@/hooks', () => ({
  useHealthScore: vi.fn(() => ({ data: { overall_score: 72 } })),
  useWeekEvents: vi.fn(() => ({ data: [] })),
  useWeekMeals: vi.fn(() => ({ data: [] })),
  useUnifiedBills: vi.fn(() => ({ bills: [] })),
  useNetWorthCurrent: vi.fn(() => ({ data: { net_worth: 10000 } })),
  useNetWorthTrend: vi.fn(() => ({ data: [] })),
  useBudgetStatus: vi.fn(() => ({ data: { total_spent: 400, total_allocated: 1000 } })),
  useSavingsGoals: vi.fn(() => ({ data: [] })),
  useInvestmentSummary: vi.fn(() => ({ data: null })),
  usePortfolioPerformance: vi.fn(() => ({ data: null })),
  useSubscriptionSummary: vi.fn(() => ({ data: null })),
  useIncomeVsExpenses: vi.fn(() => ({ data: null })),
  useRecipes: vi.fn(() => ({ data: [] })),
  useExpiringItems: vi.fn(() => ({ data: [] })),
  useInventoryItems: vi.fn(() => ({ data: [] })),
  useCreateInventoryItem: vi.fn(() => ({ mutate: vi.fn() })),
  useBulkCreateInventoryItems: vi.fn(() => ({ mutate: vi.fn() })),
}));

// ── Mock useRenderTier ────────────────────────────────────────────────────────

vi.mock('@/hooks/useRenderTier', () => ({
  useRenderTier: vi.fn(() => 0),
  TIER_MAX_STEPS: { 0: 0, 1: 32, 2: 64 },
}));

// ── Mock appStore ─────────────────────────────────────────────────────────────

const mockLatticePrefs = {
  cardShape: 'circular',
  shoppingMode: false,
  cameraTilt: 15,
  cameraDistance: 2.6,
  latticeDepth: 0.0,
  junctionActions: {},
};

vi.mock('@/stores/appStore', () => ({
  useAppStore: vi.fn((selector: (s: unknown) => unknown) =>
    selector({
      latticePrefs: mockLatticePrefs,
      defaultView: 'radial',
      enterCookingMode: vi.fn(),
      setLatticePrefs: vi.fn(),
    })
  ),
}));

// ── Mock lazy BackgroundLattice ───────────────────────────────────────────────

vi.mock('@/components/finance/radial/BackgroundLattice', () => ({
  BackgroundLattice: () => <div data-testid="background-lattice" />,
}));

// ── Mock visual sub-components ────────────────────────────────────────────────

vi.mock('@/components/finance/radial/ArcSegment', () => ({
  ArcSegment: ({ config }: { config: { label: string; position: string } }) => (
    <g data-testid={`arc-segment-${config.position}`} aria-label={config.label} />
  ),
}));

// CenterLens deleted — no longer rendered in RadialDashboard

vi.mock('@/components/finance/radial/JunctionNode', () => ({
  JunctionNode: ({ config }: { config: { id: string } }) => (
    <g data-testid={`junction-node-${config.id}`} />
  ),
}));

vi.mock('@/components/finance/radial/Carousel', () => ({
  Carousel: (props: Record<string, unknown>) => (
    <div data-testid={props.type === 'junction' ? 'junction-carousel' : 'card-carousel'} />
  ),
}));

vi.mock('@/components/finance/radial/hub/LiveAnnotation', () => ({
  LiveAnnotation: () => <div data-testid="live-annotation" />,
}));

vi.mock('@/components/finance/radial/dashboard/ComprehensiveDashboard', () => ({
  ComprehensiveDashboard: () => <div data-testid="comprehensive-dashboard" />,
}));

// ── Mock all data hooks consumed by RadialDashboard ──────────────────────────

vi.mock('@/api', () => ({
  recipesApi: {
    checkCoverage: vi.fn(() => Promise.resolve({ ingredients: [] })),
  },
}));

vi.mock('@/hooks/useShoppingList', () => ({
  useShoppingListWeek: vi.fn(() => ({ data: [] })),
  useCreateShoppingListItem: vi.fn(() => ({ mutate: vi.fn() })),
  useUpdateShoppingListItem: vi.fn(() => ({ mutate: vi.fn() })),
  useToggleShoppingListItem: vi.fn(() => ({ mutate: vi.fn() })),
  useDeleteShoppingListItem: vi.fn(() => ({ mutate: vi.fn() })),
}));

vi.mock('@/hooks/useHabits', () => ({
  useHabits: vi.fn(() => ({ data: [] })),
  useRecordHabit: vi.fn(() => ({ mutate: vi.fn() })),
  formatHabitName: vi.fn((n: string) => n),
  useHabitsNeedingCheckIn: vi.fn(() => ({ data: [] })),
}));

vi.mock('@/hooks/useEvents', () => ({
  useWeekEvents: vi.fn(() => ({ data: [] })),
  useCreateEvent: vi.fn(() => ({ mutate: vi.fn() })),
}));

vi.mock('@/hooks/useMeals', () => ({
  useWeekMeals: vi.fn(() => ({ data: [] })),
  useCreateMeal: vi.fn(() => ({ mutate: vi.fn() })),
  useDeleteMeal: vi.fn(() => ({ mutate: vi.fn() })),
}));

vi.mock('@/hooks/useInventory', () => ({
  useInventoryItems: vi.fn(() => ({ data: [] })),
  useCreateInventoryItem: vi.fn(() => ({ mutate: vi.fn() })),
  useBulkCreateInventoryItems: vi.fn(() => ({ mutate: vi.fn() })),
}));

vi.mock('@/hooks/useRecipeInsights', () => ({
  useRecipeFavorites: vi.fn(() => ({ data: [] })),
}));

vi.mock('@/hooks/useTags', () => ({
  useTags: vi.fn(() => ({ data: [] })),
}));

vi.mock('@/hooks/useRecipes', () => ({
  useRecipes: vi.fn(() => ({ data: [] })),
  useRecipeCategories: vi.fn(() => ({ data: [] })),
}));

vi.mock('@/hooks/useRecipeIntelligence', () => ({
  useRecipeIntelligence: vi.fn(() => ({
    favorites: [], complexityScores: [], suggestedRecipes: [],
    recordRecipeView: vi.fn(), confidence: 0.5, isLearning: false, isLoading: false,
  })),
}));

vi.mock('@/hooks/useProperty', () => ({
  useExpiringLeases: vi.fn(() => ({ data: [] })),
}));

vi.mock('@/hooks/usePredictions', () => ({
  useBillPredictions: vi.fn(() => ({ data: null })),
}));

vi.mock('@/hooks/useUnifiedBills', () => ({
  useUnifiedBills: vi.fn(() => ({ bills: [], isLoading: false })),
}));

vi.mock('@/hooks/useCrossFeatureIntelligence', () => ({
  useCrossFeatureIntelligence: vi.fn(() => ({ weekCharacter: 'balanced', insights: [] })),
}));

vi.mock('@/hooks/useEventIntelligence', () => ({
  useEventIntelligence: vi.fn(() => ({ dayInsights: [], byDate: {}, upcoming: [], weekEventCount: 0 })),
}));

vi.mock('@/hooks/useInventoryIntelligence', () => ({
  useInventoryIntelligence: vi.fn(() => ({
    health: { score: 70, label: 'Good' },
    lowStockDisplay: [],
    expiringWithDays: [],
    foodGroupFills: {},
    leftoverCount: 0,
    activeItemCount: 42,
    categoryBreakdown: [],
  })),
}));

vi.mock('@/hooks/usePatterns', () => ({
  useLowStockMeals: vi.fn(() => ({ data: [] })),
  useMealGaps: vi.fn(() => ({ data: [] })),
  usePatternConfidence: vi.fn(() => ({ data: { overall: 0.5 } })),
  useRestockingPredictions: vi.fn(() => ({ data: [] })),
  useIngredientVariety: vi.fn(() => ({ data: null })),
  useTrackingSuggestions: vi.fn(() => ({ data: [] })),
  getCurrentWeekStart: vi.fn(() => '2026-03-10'),
}));

vi.mock('@/hooks/useFinanceIntelligence', () => ({
  useFinanceIntelligence: vi.fn(() => ({
    billInsights: [], upcomingCount: 0, overdueCount: 0, totalUpcoming: 0,
    all: [], byDate: {}, overdue: [], upcoming7d: [], upcoming14d: [], upcoming30d: [],
    recurring: [], subscriptionSummary: { monthly: 0, annual: 0, count: 0 },
    markPaid: vi.fn(), markPaidPending: false, isLoading: false, isError: false,
  })),
}));

vi.mock('@/hooks/useMealIntelligence', () => ({
  useMealIntelligence: vi.fn(() => ({
    insights: [], gaps: [], byDate: {}, nextMealGap: null,
    coveragePct: 0, dayFills: [], isLoading: false, isLearning: false,
  })),
}));

vi.mock('@/hooks/useAuroraIntelligence', () => ({
  useAuroraIntelligence: vi.fn(() => ({ data: null })),
}));

vi.mock('@/utils/accessibility', () => ({
  announceToScreenReader: vi.fn(),
}));

vi.mock('@/utils/dateUtils', () => ({
  getMonday: vi.fn(() => '2026-03-10'),
  getTodayLocal: vi.fn(() => '2026-03-16'),
  addDays: vi.fn((d: string, n: number) => d),
}));

// ── Mock @tanstack/react-query useQuery ───────────────────────────────────────

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQuery: vi.fn(() => ({ data: undefined, isLoading: false, error: null })),
  };
});

// ── Import component after all mocks are set up ───────────────────────────────

import { RadialDashboard } from '@/components/finance/radial/RadialDashboard';

// ── Helpers ───────────────────────────────────────────────────────────────────

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('RadialDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mounts without crashing', () => {
    expect(() => {
      render(<RadialDashboard />, { wrapper: createWrapper() });
    }).not.toThrow();
  });

  it('renders the main container div with navigation role', () => {
    render(<RadialDashboard />, { wrapper: createWrapper() });

    const nav = screen.getByRole('navigation');
    expect(nav).toBeTruthy();
  });

  it('renders the outer fixed wrapper div', () => {
    const { container } = render(<RadialDashboard />, { wrapper: createWrapper() });

    // The outermost rendered div has fixed positioning set via className "fixed inset-0 z-50 flex"
    const wrapper = container.firstElementChild;
    expect(wrapper).toBeTruthy();
    expect(wrapper?.className).toContain('fixed');
  });

  it('renders all 4 arc segments', () => {
    render(<RadialDashboard />, { wrapper: createWrapper() });

    expect(screen.getByTestId('arc-segment-north')).toBeTruthy();
    expect(screen.getByTestId('arc-segment-south')).toBeTruthy();
    expect(screen.getByTestId('arc-segment-east')).toBeTruthy();
    expect(screen.getByTestId('arc-segment-west')).toBeTruthy();
  });

  // CenterLens test removed — component deleted (blue glow overlay obscured lattice)

  it('renders 4 junction nodes', () => {
    render(<RadialDashboard />, { wrapper: createWrapper() });

    expect(screen.getByTestId('junction-node-nw')).toBeTruthy();
    expect(screen.getByTestId('junction-node-ne')).toBeTruthy();
    expect(screen.getByTestId('junction-node-se')).toBeTruthy();
    expect(screen.getByTestId('junction-node-sw')).toBeTruthy();
  });

  it('does not render card carousel when no arc is active', () => {
    render(<RadialDashboard />, { wrapper: createWrapper() });

    expect(screen.queryByTestId('card-carousel')).toBeNull();
  });

  it('does not render the comprehensive dashboard when showComprehensive is false', () => {
    render(<RadialDashboard />, { wrapper: createWrapper() });

    expect(screen.queryByTestId('comprehensive-dashboard')).toBeNull();
  });
});
