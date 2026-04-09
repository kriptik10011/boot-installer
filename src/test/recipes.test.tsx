import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRecipes, useCreateRecipe, useDeleteRecipe } from '../hooks/useRecipes';
import type { ReactNode } from 'react';
import type { Recipe } from '../types';

// Mock the API client
vi.mock('../api/client', () => ({
  recipesApi: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

import { recipesApi } from '../api/client';

// Sample test data
const mockRecipes: Recipe[] = [
  {
    id: 1,
    name: 'Spaghetti Bolognese',
    category_id: 1,
    instructions: 'Cook pasta, make sauce, combine.',
    prep_time_minutes: 15,
    cook_time_minutes: 45,
    servings: 4,
    source: 'Family recipe',
    image_url: null,
    notes: null,
    cuisine_type: 'Italian',
    created_at: '2026-01-15T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z',
  },
  {
    id: 2,
    name: 'Chicken Stir Fry',
    category_id: 2,
    instructions: 'Cut chicken, stir fry with veggies.',
    prep_time_minutes: 20,
    cook_time_minutes: 15,
    servings: 2,
    source: null,
    image_url: null,
    notes: 'Use fresh vegetables',
    cuisine_type: 'Asian',
    created_at: '2026-01-16T00:00:00Z',
    updated_at: '2026-01-16T00:00:00Z',
  },
];

// Wrapper component for testing hooks
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
}

describe('Recipe Hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('useRecipes', () => {
    it('fetches and returns recipes list', async () => {
      vi.mocked(recipesApi.list).mockResolvedValue(mockRecipes);

      const { result } = renderHook(() => useRecipes(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockRecipes);
      expect(recipesApi.list).toHaveBeenCalledWith(undefined, undefined);
    });

    it('filters recipes by category', async () => {
      const filteredRecipes = mockRecipes.filter(r => r.category_id === 1);
      vi.mocked(recipesApi.list).mockResolvedValue(filteredRecipes);

      const { result } = renderHook(() => useRecipes(1), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(recipesApi.list).toHaveBeenCalledWith(1, undefined);
      expect(result.current.data).toEqual(filteredRecipes);
    });

    it('filters recipes by search term', async () => {
      const searchResults = mockRecipes.filter(r => r.name.includes('Spaghetti'));
      vi.mocked(recipesApi.list).mockResolvedValue(searchResults);

      const { result } = renderHook(() => useRecipes(undefined, 'Spaghetti'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(recipesApi.list).toHaveBeenCalledWith(undefined, 'Spaghetti');
    });
  });

  describe('useCreateRecipe', () => {
    it('creates recipe and calls API', async () => {
      const newRecipe = {
        ...mockRecipes[0],
        id: 3,
        name: 'New Recipe',
      };
      vi.mocked(recipesApi.create).mockResolvedValue(newRecipe);

      const { result } = renderHook(() => useCreateRecipe(), {
        wrapper: createWrapper(),
      });

      const recipeData = {
        name: 'New Recipe',
        instructions: 'Test instructions',
        category_id: 1,
      };

      result.current.mutate(recipeData);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(recipesApi.create).toHaveBeenCalledWith(recipeData);
    });
  });

  describe('useDeleteRecipe', () => {
    it('deletes recipe by ID', async () => {
      vi.mocked(recipesApi.delete).mockResolvedValue(undefined);

      const { result } = renderHook(() => useDeleteRecipe(), {
        wrapper: createWrapper(),
      });

      result.current.mutate(1);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(recipesApi.delete).toHaveBeenCalledWith(1);
    });
  });
});
