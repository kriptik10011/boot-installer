import { useQuery } from '@tanstack/react-query';
import { categoriesApi } from '@/api/client';
import { useBackendReady } from './useBackendReady';

// Query keys factory
export const categoryKeys = {
  all: ['categories'] as const,
  events: () => [...categoryKeys.all, 'events'] as const,
  recipes: () => [...categoryKeys.all, 'recipes'] as const,
  finances: () => [...categoryKeys.all, 'finances'] as const,
};

// Fetch event categories
export function useEventCategories() {
  const backendReady = useBackendReady();
  return useQuery({
    queryKey: categoryKeys.events(),
    queryFn: categoriesApi.eventCategories,
    staleTime: 5 * 60 * 1000, // Categories rarely change, cache for 5 minutes
    enabled: backendReady,
  });
}

// Fetch recipe categories
export function useRecipeCategories() {
  const backendReady = useBackendReady();
  return useQuery({
    queryKey: categoryKeys.recipes(),
    queryFn: categoriesApi.recipeCategories,
    staleTime: 5 * 60 * 1000,
    enabled: backendReady,
  });
}

// Fetch financial categories
export function useFinancialCategories() {
  const backendReady = useBackendReady();
  return useQuery({
    queryKey: categoryKeys.finances(),
    queryFn: categoriesApi.financialCategories,
    staleTime: 5 * 60 * 1000,
    enabled: backendReady,
  });
}
