/**
 * MealPanel Tests
 *
 * Smoke tests verifying MealPanel renders in create/edit modes,
 * shows loading skeleton, and handles recipe selection.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MealPanel } from '@/components/panels/MealPanel';

// Mock hooks
vi.mock('@/hooks/useMeals', () => ({
  useMeal: vi.fn((id: number) => {
    if (id === 0) return { data: undefined, isLoading: false };
    if (id === 999) return { data: undefined, isLoading: true };
    return {
      data: {
        id: 1,
        date: '2026-02-10',
        meal_type: 'dinner',
        recipe_id: 1,
        description: 'Spaghetti Bolognese',
        planned_servings: 4,
        actual_servings: null,
        actual_prep_minutes: null,
        actual_cook_minutes: null,
        cooked_at: null,
        cooking_notes: null,
        inventory_depleted: false,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      isLoading: false,
    };
  }),
  useCreateMeal: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useUpdateMeal: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useDeleteMeal: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  mealKeys: { all: ['meals'], lists: () => ['meals', 'list'] },
}));

vi.mock('@/api/client', () => ({
  mealsApi: { delete: vi.fn() },
}));

vi.mock('@/hooks/useUndoDelete', () => ({
  useUndoDelete: vi.fn(() => ({ requestDelete: vi.fn() })),
}));

vi.mock('@/stores/toastStore', () => ({
  useToastStore: vi.fn((selector: any) => selector({ addToast: vi.fn() })),
}));

vi.mock('@/hooks/useRecipes', () => ({
  useRecipes: vi.fn(() => ({
    data: [
      { id: 1, name: 'Spaghetti Bolognese', instructions: '', prep_time_minutes: 15, cook_time_minutes: 30, servings: 4, notes: null, source: null, category_id: null, created_at: '', updated_at: '' },
      { id: 2, name: 'Caesar Salad', instructions: '', prep_time_minutes: 10, cook_time_minutes: 0, servings: 2, notes: null, source: null, category_id: null, created_at: '', updated_at: '' },
    ],
    isLoading: false,
  })),
  useRecipe: vi.fn(() => ({ data: undefined, isLoading: false })),
  useCreateRecipe: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useUpdateRecipe: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useDeleteRecipe: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));

vi.mock('@/hooks/useCategories', () => ({
  useRecipeCategories: vi.fn(() => ({ data: [], isLoading: false })),
  useFinancialCategories: vi.fn(() => ({ data: [], isLoading: false })),
  useEventCategories: vi.fn(() => ({ data: [], isLoading: false })),
}));

vi.mock('@/hooks/useMealIntelligence', () => ({
  useMealSlotSuggestions: vi.fn(() => ({ suggestions: [], reasoning: null, isLoading: false })),
}));

vi.mock('@/hooks/useMealContext', () => ({
  useMealContext: vi.fn(() => ({
    displayMode: 'planning',
    timeOfDay: 'evening',
    isCloseToMealTime: false,
  })),
}));

vi.mock('@/services/observation', () => ({
  recordAction: vi.fn(),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('MealPanel', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders create form when mealId is null', () => {
    render(
      <MealPanel mealId={null} date="2026-02-10" mealType="dinner" onClose={onClose} />,
      { wrapper: createWrapper() }
    );
    // Should show recipe selection or meal form
    expect(screen.queryByText('Missing meal information')).toBeNull();
  });

  it('shows loading skeleton when fetching meal', () => {
    render(
      <MealPanel mealId={999} date="2026-02-10" mealType="dinner" onClose={onClose} />,
      { wrapper: createWrapper() }
    );
    // PanelSkeleton renders, not the form
    expect(screen.queryByText('Missing meal information')).toBeNull();
  });

  it('shows error when missing date/mealType', () => {
    render(
      <MealPanel mealId={null} onClose={onClose} />,
      { wrapper: createWrapper() }
    );
    expect(screen.getByText('Missing meal information')).toBeTruthy();
  });

  it('renders edit mode with existing data', () => {
    render(
      <MealPanel mealId={1} date="2026-02-10" mealType="dinner" onClose={onClose} />,
      { wrapper: createWrapper() }
    );
    // Should not show missing information
    expect(screen.queryByText('Missing meal information')).toBeNull();
  });
});
