/**
 * CookingLayout Tests
 *
 * Simple tests to verify CookingLayout renders correctly.
 * The component uses position:fixed for fullscreen display.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CookingLayout } from '@/components/panels/CookingLayout';
import type { Recipe, MealPlanEntry } from '@/types';

// Mock the observation service
vi.mock('@/services/observation', () => ({
  recordAction: vi.fn(),
}));

// Mock the APIs
vi.mock('@/api/client', () => ({
  mealsApi: {
    completeCooking: vi.fn().mockResolvedValue({}),
  },
  patternsApi: {
    getRecipeChefNotes: vi.fn().mockResolvedValue([]),
    getRecipeDurationEstimate: vi.fn().mockResolvedValue({ source: 'recipe', confidence: 0 }),
  },
}));

// Test data
const mockRecipe: Recipe = {
  id: 1,
  name: 'Test Recipe',
  instructions: 'Step 1. Preheat oven.\nStep 2. Mix ingredients.\nStep 3. Bake.',
  prep_time_minutes: 15,
  cook_time_minutes: 30,
  servings: 4,
  notes: 'Test notes',
  source: null,
  image_url: null,
  category_id: null,
  cuisine_type: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const mockMeal: MealPlanEntry = {
  id: 1,
  date: '2026-02-02',
  meal_type: 'dinner',
  recipe_id: 1,
  description: 'Test Dinner',
  planned_servings: null,
  actual_servings: null,
  actual_prep_minutes: null,
  actual_cook_minutes: null,
  cooked_at: null,
  cooking_notes: null,
  inventory_depleted: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function renderCookingLayout(recipe = mockRecipe, meal: MealPlanEntry | null = mockMeal) {
  const onClose = vi.fn();
  const onDone = vi.fn();
  return {
    ...render(
      <CookingLayout recipe={recipe} meal={meal} onClose={onClose} onDone={onDone} />,
      { wrapper: createWrapper() }
    ),
    onClose,
    onDone,
  };
}

describe('CookingLayout', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe('Rendering (White Screen Prevention)', () => {
    it('renders content immediately (no white screen)', () => {
      const { container } = renderCookingLayout();

      // Must have visible content - this catches white screen bugs
      expect(container.innerHTML.trim()).not.toBe('');
      expect(container.firstChild).not.toBeNull();
    });

    it('renders recipe name', async () => {
      renderCookingLayout();

      await waitFor(() => {
        expect(screen.getByText('Test Recipe')).toBeInTheDocument();
      });
    });

    it('renders Instructions section', async () => {
      renderCookingLayout();

      await waitFor(() => {
        expect(screen.getByText('Instructions')).toBeInTheDocument();
      });
    });

    it('renders Done Cooking button', async () => {
      renderCookingLayout();

      await waitFor(() => {
        expect(screen.getByText('Done Cooking')).toBeInTheDocument();
      });
    });

    it('renders Back button', async () => {
      renderCookingLayout();

      await waitFor(() => {
        expect(screen.getByText('Back')).toBeInTheDocument();
      });
    });
  });

  describe('Edge Cases', () => {
    it('handles null meal without crashing', async () => {
      const { container } = renderCookingLayout(mockRecipe, null);

      expect(container.innerHTML.trim()).not.toBe('');
      await waitFor(() => {
        expect(screen.getByText('Test Recipe')).toBeInTheDocument();
      });
    });

    it('handles recipe with empty instructions', async () => {
      const emptyRecipe = { ...mockRecipe, instructions: '' };
      const { container } = renderCookingLayout(emptyRecipe, null);

      expect(container.innerHTML.trim()).not.toBe('');
    });
  });

  describe('Callbacks', () => {
    it('calls onClose when Back button is clicked', async () => {
      const { onClose } = renderCookingLayout();

      await waitFor(() => {
        expect(screen.getByText('Back')).toBeInTheDocument();
      });

      screen.getByText('Back').closest('button')?.click();
      expect(onClose).toHaveBeenCalled();
    });
  });
});
