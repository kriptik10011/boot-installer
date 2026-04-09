/**
 * Data Source Registry — single source of truth for all displayable data sources.
 * Each entry maps a DataSourceId to its adapter hook, shape type, and metadata.
 * Adding a new data source = 1 entry here + 1 adapter hook.
 */

import type { RegistryArcPosition as ArcPosition, DataSourceEntry, DataSourceId, ActionId, ArcCardConfig } from './types';
import { DEFAULT_ARC_CARD_CONFIG, MAX_DETAIL_SLOTS, MAX_ACTION_SLOTS } from './types';
import { getAction } from './actionRegistry';

// ── Inventory adapters ──
import {
  useInventoryHealthAdapter,
  useAtRiskMealsAdapter,
  useExpiringSoonAdapter,
  useLowStockItemsAdapter,
  useFoodGroupBalanceAdapter,
  usePantrySuggestionsAdapter,
  useRestockingPredictionsAdapter,
  useInventoryLocationCountsAdapter,
  useExpiringCountAdapter,
} from './adapters/inventoryAdapters';

// ── Finance adapters ──
import {
  useFinanceHealthScoreAdapter,
  useFinanceUpcomingBillsAdapter,
  useBudgetPaceAdapter,
  useNearestGoalAdapter,
  useSafeToSpendAdapter,
  useNetWorthAdapter,
  useSpendingVelocityAdapter,
  useEmergencyFundAdapter,
  useSavingsRateAdapter,
  useSubscriptionTotalAdapter,
  useDebtSummaryAdapter,
  useBudgetHeroAdapter,
  useBudgetCategoriesAdapter,
  useTopGoalsAdapter,
  useDebtAccountsAdapter,
  usePortfolioValueAdapter,
  useInvestmentAccountsAdapter,
} from './adapters/financeAdapters';

// ── Week adapters ──
import {
  useWeekHealthScoreAdapter,
  useUpcomingEventsAdapter,
  useUpcomingBillsAdapter,
  useMealPlanStatusAdapter,
  useWeekSummaryAdapter,
  useCrossFeatureInsightsAdapter,
  useEventIntelligenceAdapter,
  useHabitStatusAdapter,
  useWeekDayHealthAdapter,
  useWeekEventCountAdapter,
  useWeekCharacterAdapter,
  useWeekFreeHoursAdapter,
  useWeekPatternsAdapter,
  useWeekBillTotalAdapter,
} from './adapters/weekAdapters';

// ── Meals adapters ──
import {
  useNextMealAdapter,
  useIngredientsNeededAdapter,
  useMealCoverageAdapter,
  useMealGapsAdapter,
  useMealIntelligenceAdapter,
  useIngredientVarietyAdapter,
  useRecipeFavoritesAdapter,
  useLowStockMealAlertsAdapter,
  useCookingStreakAdapter,
  useCookingPatternsAdapter,
} from './adapters/mealsAdapters';

// ── Registry ──

const DATA_SOURCE_REGISTRY = new Map<DataSourceId, DataSourceEntry>([
  // Week (North) — 9 sources
  ['week-health-score', {
    id: 'week-health-score', label: 'Health Score', description: 'Overall week health score',
    domain: 'week', shape: 'HeroMetric', zones: ['hero', 'detail'], cap: 1, featured: true,
    useAdapter: useWeekHealthScoreAdapter,
    placeholder: () => ({ value: '--', label: 'Loading', color: '#94a3b8' }),
  }],
  ['upcoming-events', {
    id: 'upcoming-events', label: 'Upcoming Events', description: 'Events from today onward',
    domain: 'week', shape: 'PillList', zones: ['detail'], cap: 3, featured: true,
    useAdapter: useUpcomingEventsAdapter,
    placeholder: () => ({ items: [], header: 'Events', emptyMessage: 'Loading...' }),
  }],
  ['upcoming-bills', {
    id: 'upcoming-bills', label: 'Bills Due', description: 'Bills due within 7 days',
    domain: 'week', shape: 'PillList', zones: ['detail'], cap: 3, featured: true,
    useAdapter: useUpcomingBillsAdapter,
    placeholder: () => ({ items: [], header: 'Bills', emptyMessage: 'Loading...' }),
  }],
  ['meal-plan-status', {
    id: 'meal-plan-status', label: 'Meal Plan', description: 'Weekly meal planning coverage',
    domain: 'week', shape: 'ProgressBar', zones: ['detail'], cap: 1,
    useAdapter: useMealPlanStatusAdapter,
    placeholder: () => ({ progress: 0, label: 'Meal Plan', color: '#94a3b8' }),
  }],
  ['week-summary', {
    id: 'week-summary', label: 'Week Summary', description: 'Event, meal, and bill counts',
    domain: 'week', shape: 'StatGrid', zones: ['detail'], cap: 4,
    useAdapter: useWeekSummaryAdapter,
    placeholder: () => ({ stats: [], columns: 3 as const }),
  }],
  ['cross-feature-insights', {
    id: 'cross-feature-insights', label: 'Insights', description: 'Cross-feature intelligence alerts',
    domain: 'week', shape: 'PillList', zones: ['detail'], cap: 3,
    useAdapter: useCrossFeatureInsightsAdapter,
    placeholder: () => ({ items: [], header: 'Insights', emptyMessage: 'Loading...' }),
  }],
  ['event-intelligence', {
    id: 'event-intelligence', label: 'Day Status', description: 'Today\'s schedule density',
    domain: 'week', shape: 'PillList', zones: ['detail'], cap: 3,
    useAdapter: useEventIntelligenceAdapter,
    placeholder: () => ({ items: [], header: 'Day Status', emptyMessage: 'Loading...' }),
  }],
  ['habit-status', {
    id: 'habit-status', label: 'Habits', description: 'Habit tracking status',
    domain: 'week', shape: 'PillList', zones: ['detail'], cap: 3,
    useAdapter: useHabitStatusAdapter,
    placeholder: () => ({ items: [], header: 'Habits', emptyMessage: 'Loading...' }),
  }],
  ['week-day-health', {
    id: 'week-day-health', label: 'Daily Health', description: 'Per-day event load',
    domain: 'week', shape: 'StatGrid', zones: ['detail'], cap: 4,
    useAdapter: useWeekDayHealthAdapter,
    placeholder: () => ({ stats: [], columns: 2 as const }),
  }],
  // Sub-arc card adapters
  ['week-event-count', {
    id: 'week-event-count', label: 'Event Count', description: 'Total events this week with today status',
    domain: 'week', shape: 'HeroMetric', zones: ['hero', 'detail'], cap: 1,
    useAdapter: useWeekEventCountAdapter,
    placeholder: () => ({ value: '--', label: 'EVENTS', color: '#22d3ee' }),
  }],
  ['week-character', {
    id: 'week-character', label: 'Week Character', description: 'Light/Balanced/Busy/Overloaded narrative',
    domain: 'week', shape: 'HeroMetric', zones: ['hero', 'detail'], cap: 1,
    useAdapter: useWeekCharacterAdapter,
    placeholder: () => ({ value: '--', label: 'WEEK', color: '#38bdf8' }),
  }],
  ['week-free-hours', {
    id: 'week-free-hours', label: 'Free Hours', description: 'Today free hours + week trend',
    domain: 'week', shape: 'HeroMetric', zones: ['hero', 'detail'], cap: 1,
    useAdapter: useWeekFreeHoursAdapter,
    placeholder: () => ({ value: '--', label: 'RHYTHM', color: '#38bdf8' }),
  }],
  ['week-patterns', {
    id: 'week-patterns', label: 'Week Patterns', description: 'Busiest day, free windows, budget pace',
    domain: 'week', shape: 'PillList', zones: ['detail'], cap: 3,
    useAdapter: useWeekPatternsAdapter,
    placeholder: () => ({ items: [], header: 'Patterns', emptyMessage: 'Loading...' }),
  }],
  ['week-bill-total', {
    id: 'week-bill-total', label: 'Bill Total', description: 'Total upcoming bills amount',
    domain: 'week', shape: 'HeroMetric', zones: ['hero', 'detail'], cap: 1,
    useAdapter: useWeekBillTotalAdapter,
    placeholder: () => ({ value: '--', label: 'BILLS', color: '#a78bfa' }),
  }],

  // Meals (East) — 8 + 2 sources
  ['next-meal', {
    id: 'next-meal', label: 'Next Meal', description: 'Next upcoming meal today',
    domain: 'meals', shape: 'HeroMetric', zones: ['hero', 'detail'], cap: 1, featured: true,
    useAdapter: useNextMealAdapter,
    placeholder: () => ({ value: '--', label: 'Loading', color: '#10b981' }),
  }],
  ['ingredients-needed', {
    id: 'ingredients-needed', label: 'Ingredients', description: 'Ingredients for next meal with coverage',
    domain: 'meals', shape: 'PillList', zones: ['detail'], cap: 3, featured: true,
    useAdapter: useIngredientsNeededAdapter,
    placeholder: () => ({ items: [], header: 'Ingredients', emptyMessage: 'Loading...' }),
  }],
  ['meal-coverage', {
    id: 'meal-coverage', label: 'Meal Coverage', description: 'Weekly meal plan completion',
    domain: 'meals', shape: 'ProgressBar', zones: ['detail'], cap: 1, featured: true,
    useAdapter: useMealCoverageAdapter,
    placeholder: () => ({ progress: 0, label: 'Coverage', color: '#94a3b8' }),
  }],
  ['meal-gaps', {
    id: 'meal-gaps', label: 'Unplanned Meals', description: 'Days with unplanned meal slots',
    domain: 'meals', shape: 'PillList', zones: ['detail'], cap: 3,
    useAdapter: useMealGapsAdapter,
    placeholder: () => ({ items: [], header: 'Unplanned', emptyMessage: 'Loading...' }),
  }],
  ['meal-intelligence', {
    id: 'meal-intelligence', label: 'Meal Suggestions', description: 'AI-powered meal suggestions',
    domain: 'meals', shape: 'PillList', zones: ['detail'], cap: 3,
    useAdapter: useMealIntelligenceAdapter,
    placeholder: () => ({ items: [], header: 'Suggestions', emptyMessage: 'No suggestions' }),
  }],
  ['ingredient-variety', {
    id: 'ingredient-variety', label: 'Ingredient Variety', description: 'Unique ingredient diversity score',
    domain: 'meals', shape: 'GaugeRing', zones: ['hero', 'detail'], cap: 1,
    useAdapter: useIngredientVarietyAdapter,
    placeholder: () => ({ progress: 0, label: 'Variety' }),
  }],
  ['recipe-favorites', {
    id: 'recipe-favorites', label: 'Favorites', description: 'Most-used recipes this week',
    domain: 'meals', shape: 'PillList', zones: ['detail'], cap: 3,
    useAdapter: useRecipeFavoritesAdapter,
    placeholder: () => ({ items: [], header: 'Favorites', emptyMessage: 'Loading...' }),
  }],
  ['low-stock-meal-alerts', {
    id: 'low-stock-meal-alerts', label: 'Missing Ingredients', description: 'Recipes with missing ingredients',
    domain: 'meals', shape: 'PillList', zones: ['detail'], cap: 3,
    useAdapter: useLowStockMealAlertsAdapter,
    placeholder: () => ({ items: [], header: 'Missing', emptyMessage: 'Loading...' }),
  }],
  // Sub-arc card adapters
  ['cooking-streak', {
    id: 'cooking-streak', label: 'Cook Streak', description: 'Consecutive cooking days',
    domain: 'meals', shape: 'HeroMetric', zones: ['hero', 'detail'], cap: 1,
    useAdapter: useCookingStreakAdapter,
    placeholder: () => ({ value: '--', label: 'COOK STREAK', color: '#10b981' }),
  }],
  ['cooking-patterns', {
    id: 'cooking-patterns', label: 'Cooking Patterns', description: 'Cook count, top recipe, meal type breakdown',
    domain: 'meals', shape: 'PillList', zones: ['detail'], cap: 3,
    useAdapter: useCookingPatternsAdapter,
    placeholder: () => ({ items: [], header: 'Patterns', emptyMessage: 'Loading...' }),
  }],

  // Finance (South) — 11 + 6 sources
  ['finance-health-score', {
    id: 'finance-health-score', label: 'Health Score', description: 'Overall financial health',
    domain: 'finance', shape: 'HeroMetric', zones: ['hero', 'detail'], cap: 1, featured: true,
    useAdapter: useFinanceHealthScoreAdapter,
    placeholder: () => ({ value: '--', label: 'Loading', color: '#94a3b8' }),
  }],
  ['finance-upcoming-bills', {
    id: 'finance-upcoming-bills', label: 'Upcoming Bills', description: 'Bills due within 7 days',
    domain: 'finance', shape: 'PillList', zones: ['detail'], cap: 3, featured: true,
    useAdapter: useFinanceUpcomingBillsAdapter,
    placeholder: () => ({ items: [], header: 'Bills', emptyMessage: 'Loading...' }),
  }],
  ['budget-pace', {
    id: 'budget-pace', label: 'Budget Pace', description: 'Spending vs budget pacing',
    domain: 'finance', shape: 'ProgressBar', zones: ['detail'], cap: 1, featured: true,
    useAdapter: useBudgetPaceAdapter,
    placeholder: () => ({ progress: 0, label: 'Budget', color: '#94a3b8' }),
  }],
  ['nearest-goal', {
    id: 'nearest-goal', label: 'Savings Goal', description: 'Nearest incomplete savings goal',
    domain: 'finance', shape: 'ProgressBar', zones: ['detail'], cap: 1,
    useAdapter: useNearestGoalAdapter,
    placeholder: () => ({ progress: 0, label: 'Goal', color: '#a78bfa' }),
  }],
  ['safe-to-spend', {
    id: 'safe-to-spend', label: 'Safe to Spend', description: 'Remaining budget for the month',
    domain: 'finance', shape: 'HeroMetric', zones: ['hero', 'detail'], cap: 1,
    useAdapter: useSafeToSpendAdapter,
    placeholder: () => ({ value: '--', label: 'Safe to Spend', color: '#94a3b8' }),
  }],
  ['net-worth', {
    id: 'net-worth', label: 'Net Worth', description: 'Current net worth',
    domain: 'finance', shape: 'HeroMetric', zones: ['hero', 'detail'], cap: 1,
    useAdapter: useNetWorthAdapter,
    placeholder: () => ({ value: '--', label: 'Net Worth', color: '#94a3b8' }),
  }],
  ['spending-velocity', {
    id: 'spending-velocity', label: 'Spending Rate', description: 'Current vs expected spending pace',
    domain: 'finance', shape: 'ProgressBar', zones: ['detail'], cap: 1,
    useAdapter: useSpendingVelocityAdapter,
    placeholder: () => ({ progress: 0, label: 'Spending', color: '#94a3b8' }),
  }],
  ['emergency-fund', {
    id: 'emergency-fund', label: 'Emergency Fund', description: 'Emergency fund progress',
    domain: 'finance', shape: 'HeroMetric', zones: ['hero', 'detail'], cap: 1,
    useAdapter: useEmergencyFundAdapter,
    placeholder: () => ({ value: '--', label: 'Emergency', color: '#94a3b8' }),
  }],
  ['savings-rate', {
    id: 'savings-rate', label: 'Savings Rate', description: 'Percentage of budget saved',
    domain: 'finance', shape: 'ProgressBar', zones: ['detail'], cap: 1,
    useAdapter: useSavingsRateAdapter,
    placeholder: () => ({ progress: 0, label: 'Savings', color: '#94a3b8' }),
  }],
  ['subscription-total', {
    id: 'subscription-total', label: 'Subscriptions', description: 'Total monthly subscriptions',
    domain: 'finance', shape: 'HeroMetric', zones: ['hero', 'detail'], cap: 1,
    useAdapter: useSubscriptionTotalAdapter,
    placeholder: () => ({ value: '--', label: 'Subscriptions', color: '#a78bfa' }),
  }],
  ['debt-summary', {
    id: 'debt-summary', label: 'Total Debt', description: 'Total liabilities',
    domain: 'finance', shape: 'HeroMetric', zones: ['hero', 'detail'], cap: 1,
    useAdapter: useDebtSummaryAdapter,
    placeholder: () => ({ value: '--', label: 'Debt', color: '#94a3b8' }),
  }],
  // Sub-arc card adapters
  ['budget-hero', {
    id: 'budget-hero', label: 'Budget Spent', description: 'Total spent with pace status',
    domain: 'finance', shape: 'HeroMetric', zones: ['hero', 'detail'], cap: 1,
    useAdapter: useBudgetHeroAdapter,
    placeholder: () => ({ value: '--', label: 'Budget', color: '#a78bfa' }),
  }],
  ['budget-categories', {
    id: 'budget-categories', label: 'Budget Categories', description: 'Category breakdown with utilization %',
    domain: 'finance', shape: 'PillList', zones: ['detail'], cap: 5,
    useAdapter: useBudgetCategoriesAdapter,
    placeholder: () => ({ items: [], header: 'Categories', emptyMessage: 'Loading...' }),
  }],
  ['top-goals', {
    id: 'top-goals', label: 'Top Goals', description: 'Top 3 savings goals with progress',
    domain: 'finance', shape: 'PillList', zones: ['detail'], cap: 3,
    useAdapter: useTopGoalsAdapter,
    placeholder: () => ({ items: [], header: 'Goals', emptyMessage: 'Loading...' }),
  }],
  ['debt-accounts', {
    id: 'debt-accounts', label: 'Debt Accounts', description: 'Individual debt accounts with balances',
    domain: 'finance', shape: 'PillList', zones: ['detail'], cap: 3,
    useAdapter: useDebtAccountsAdapter,
    placeholder: () => ({ items: [], header: 'Debt', emptyMessage: 'Loading...' }),
  }],
  ['portfolio-value', {
    id: 'portfolio-value', label: 'Portfolio Value', description: 'Total portfolio with YTD return',
    domain: 'finance', shape: 'HeroMetric', zones: ['hero', 'detail'], cap: 1,
    useAdapter: usePortfolioValueAdapter,
    placeholder: () => ({ value: '--', label: 'PORTFOLIO', color: '#a78bfa' }),
  }],
  ['investment-accounts', {
    id: 'investment-accounts', label: 'Investment Accounts', description: 'Account list with values',
    domain: 'finance', shape: 'PillList', zones: ['detail'], cap: 4,
    useAdapter: useInvestmentAccountsAdapter,
    placeholder: () => ({ items: [], header: 'Accounts', emptyMessage: 'Loading...' }),
  }],

  // Inventory (West) — 8 + 1 sources
  ['inventory-health', {
    id: 'inventory-health', label: 'Inventory Health', description: 'Overall pantry health score',
    domain: 'inventory', shape: 'HeroMetric', zones: ['hero', 'detail'], cap: 1, featured: true,
    useAdapter: useInventoryHealthAdapter,
    placeholder: () => ({ value: '--', label: 'Loading', color: '#94a3b8' }),
  }],
  ['at-risk-meals', {
    id: 'at-risk-meals', label: 'At Risk Meals', description: 'Meals with missing ingredients',
    domain: 'inventory', shape: 'PillList', zones: ['detail'], cap: 3, featured: true,
    useAdapter: useAtRiskMealsAdapter,
    placeholder: () => ({ items: [], header: 'At Risk', emptyMessage: 'Loading...' }),
  }],
  ['expiring-soon', {
    id: 'expiring-soon', label: 'Expiring Soon', description: 'Items expiring within 7 days',
    domain: 'inventory', shape: 'PillList', zones: ['detail'], cap: 3, featured: true,
    useAdapter: useExpiringSoonAdapter,
    placeholder: () => ({ items: [], header: 'Expiring', emptyMessage: 'Loading...' }),
  }],
  ['low-stock-items', {
    id: 'low-stock-items', label: 'Low Stock', description: 'Items running low',
    domain: 'inventory', shape: 'PillList', zones: ['detail'], cap: 3,
    useAdapter: useLowStockItemsAdapter,
    placeholder: () => ({ items: [], header: 'Low Stock', emptyMessage: 'Loading...' }),
  }],
  ['food-group-balance', {
    id: 'food-group-balance', label: 'Food Groups', description: 'Nutritional category breakdown',
    domain: 'inventory', shape: 'StatGrid', zones: ['detail'], cap: 4,
    useAdapter: useFoodGroupBalanceAdapter,
    placeholder: () => ({ stats: [], columns: 2 as const }),
  }],
  ['pantry-suggestions', {
    id: 'pantry-suggestions', label: 'Cook With What You Have', description: 'Meal ideas from current stock',
    domain: 'inventory', shape: 'PillList', zones: ['detail'], cap: 3,
    useAdapter: usePantrySuggestionsAdapter,
    placeholder: () => ({ items: [], header: 'Cook With', emptyMessage: 'Loading...' }),
  }],
  ['restocking-predictions', {
    id: 'restocking-predictions', label: 'Restock Soon', description: 'Items predicted to run out',
    domain: 'inventory', shape: 'PillList', zones: ['detail'], cap: 3,
    useAdapter: useRestockingPredictionsAdapter,
    placeholder: () => ({ items: [], header: 'Restock', emptyMessage: 'Loading...' }),
  }],
  ['inventory-location-counts', {
    id: 'inventory-location-counts', label: 'Location Counts', description: 'Items per storage location',
    domain: 'inventory', shape: 'StatGrid', zones: ['detail'], cap: 3,
    useAdapter: useInventoryLocationCountsAdapter,
    placeholder: () => ({ stats: [], columns: 2 as const }),
  }],
  // Sub-arc card adapter
  ['expiring-count', {
    id: 'expiring-count', label: 'Expiring Count', description: 'Items expiring within 7 days with urgency',
    domain: 'inventory', shape: 'HeroMetric', zones: ['hero', 'detail'], cap: 1,
    useAdapter: useExpiringCountAdapter,
    placeholder: () => ({ value: '--', label: 'EXPIRING', color: '#fbbf24' }),
  }],
]);

// ── Public API ──

export function getDataSource(id: DataSourceId): DataSourceEntry | undefined {
  return DATA_SOURCE_REGISTRY.get(id);
}

export function getRegisteredSources(): DataSourceEntry[] {
  return Array.from(DATA_SOURCE_REGISTRY.values());
}

export function getSourcesForDomain(domain: string): DataSourceEntry[] {
  return getRegisteredSources().filter((s) => s.domain === domain);
}

export function getFeaturedSources(): DataSourceEntry[] {
  return getRegisteredSources().filter((s) => s.featured);
}

/**
 * Resolve and validate a persisted arc card config.
 * Validates all IDs against the registry, caps arrays, falls back to defaults.
 * Prevents crash from corrupted localStorage.
 */
export function resolveArcConfig(arc: ArcPosition, raw: ArcCardConfig | undefined): ArcCardConfig {
  const defaults = DEFAULT_ARC_CARD_CONFIG[arc];
  if (!raw || typeof raw !== 'object') return defaults;

  // Validate hero — must exist in registry AND support the 'hero' zone
  const heroEntry = typeof raw.hero === 'string' ? DATA_SOURCE_REGISTRY.get(raw.hero as DataSourceId) : undefined;
  const hero = heroEntry && heroEntry.zones.includes('hero') ? raw.hero : defaults.hero;

  // Validate details — allow empty array if user explicitly cleared slots, deduplicate
  const rawDetailsPresent = Array.isArray(raw.details);
  const details = [...new Set(
    (rawDetailsPresent ? raw.details : [])
      .filter((id): id is DataSourceId => {
        if (typeof id !== 'string') return false;
        const entry = DATA_SOURCE_REGISTRY.get(id as DataSourceId);
        return entry != null && entry.zones.includes('detail');
      }),
  )].slice(0, MAX_DETAIL_SLOTS);

  // Validate actions
  const rawActionsPresent = Array.isArray(raw.actions);
  const actions = (rawActionsPresent ? raw.actions : [])
    .filter((id): id is ActionId => typeof id === 'string' && getAction(id as ActionId) != null)
    .slice(0, MAX_ACTION_SLOTS);

  return {
    hero,
    // Fall back to defaults only if field was missing, not if user emptied it
    actions: rawActionsPresent ? (actions.length > 0 ? actions : defaults.actions) : defaults.actions,
    details: rawDetailsPresent ? details : defaults.details,
  };
}
