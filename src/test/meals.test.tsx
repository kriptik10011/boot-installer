import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useWeekMeals, useCreateMeal, useDeleteMeal } from '../hooks/useMeals';
import type { MealPlanEntry } from '../types';

// Mock the API — MUST be before import
vi.mock('../api/client', () => ({
  mealsApi: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getWeek: vi.fn(),
  },
}));

import { mealsApi } from '../api/client';

// Sample test data
const mockMeals: MealPlanEntry[] = [
  {
    id: 1,
    date: '2026-01-19',
    meal_type: 'breakfast',
    recipe_id: 1,
    description: null,
    planned_servings: null,
    created_at: '2026-01-15T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z',
    actual_servings: null,
    actual_prep_minutes: null,
    actual_cook_minutes: null,
    cooked_at: null,
    cooking_notes: null,
    inventory_depleted: false,
  },
  {
    id: 2,
    date: '2026-01-19',
    meal_type: 'lunch',
    recipe_id: 2,
    description: 'Leftover pasta',
    planned_servings: null,
    created_at: '2026-01-15T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z',
    actual_servings: null,
    actual_prep_minutes: null,
    actual_cook_minutes: null,
    cooked_at: null,
    cooking_notes: null,
    inventory_depleted: false,
  },
  {
    id: 3,
    date: '2026-01-20',
    meal_type: 'dinner',
    recipe_id: null,
    description: 'Eating out',
    planned_servings: null,
    created_at: '2026-01-16T00:00:00Z',
    updated_at: '2026-01-16T00:00:00Z',
    actual_servings: null,
    actual_prep_minutes: null,
    actual_cook_minutes: null,
    cooked_at: null,
    cooking_notes: null,
    inventory_depleted: false,
  },
];

// Helper to create wrapper with QueryClient
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('Meal Hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('useWeekMeals', () => {
    it('returns meals for a specific week', async () => {
      vi.mocked(mealsApi.getWeek).mockResolvedValue(mockMeals);

      const { result } = renderHook(() => useWeekMeals('2026-01-19'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mealsApi.getWeek).toHaveBeenCalledWith('2026-01-19');
      expect(result.current.data).toEqual(mockMeals);
      expect(result.current.data).toHaveLength(3);
    });
  });

  describe('useCreateMeal', () => {
    it('calls API correctly when creating a meal', async () => {
      const newMeal = {
        date: '2026-01-21',
        meal_type: 'breakfast' as const,
        recipe_id: 5,
      };

      const createdMeal: MealPlanEntry = {
        id: 4,
        ...newMeal,
        description: null,
        planned_servings: null,
        created_at: '2026-01-21T00:00:00Z',
        updated_at: '2026-01-21T00:00:00Z',
        actual_servings: null,
        actual_prep_minutes: null,
        actual_cook_minutes: null,
        cooked_at: null,
        cooking_notes: null,
        inventory_depleted: false,
      };

      vi.mocked(mealsApi.create).mockResolvedValue(createdMeal);

      const { result } = renderHook(() => useCreateMeal(), {
        wrapper: createWrapper(),
      });

      result.current.mutate(newMeal);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mealsApi.create).toHaveBeenCalledWith(newMeal);
    });
  });

  describe('useDeleteMeal', () => {
    it('calls API correctly when deleting a meal', async () => {
      vi.mocked(mealsApi.delete).mockResolvedValue(undefined);

      const { result } = renderHook(() => useDeleteMeal(), {
        wrapper: createWrapper(),
      });

      result.current.mutate(1);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mealsApi.delete).toHaveBeenCalledWith(1);
    });
  });
});
