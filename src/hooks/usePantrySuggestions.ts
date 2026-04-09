/**
 * Hook for pantry-first meal suggestions.
 * "What can I cook with what I have?"
 */

import { useQuery } from '@tanstack/react-query';
import { recipesApi } from '@/api/client';
import type { PantrySuggestion } from '@/types';

export function usePantrySuggestions(minMatch = 0, limit = 20) {
  return useQuery<PantrySuggestion[]>({
    queryKey: ['pantry-suggestions', minMatch, limit],
    queryFn: () => recipesApi.suggestFromPantry(minMatch, limit),
    staleTime: 5 * 60 * 1000, // 5 min — inventory doesn't change frequently
  });
}
