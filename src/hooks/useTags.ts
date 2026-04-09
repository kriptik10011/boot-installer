/**
 * Recipe Tags Hook
 *
 * Provides tag management with intelligence integration.
 *
 * Intelligence Integration:
 * - OBSERVE: Track tag usage and creation
 * - INFER: Learn tag preferences
 * - DECIDE: Suggest tags for recipes
 * - SURFACE: Show popular/related tags
 * - ADAPT: Learn from corrections
 */

import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { tagsApi, type RecipeTag, type TagCreate, type TagUpdate, type TagSuggestion } from '@/api/client';
import { recordAction } from '@/services/observation';
import type { Recipe } from '@/types';

// Query keys for tags
export const tagKeys = {
  all: ['tags'] as const,
  lists: () => [...tagKeys.all, 'list'] as const,
  list: () => [...tagKeys.lists()] as const,
  details: () => [...tagKeys.all, 'detail'] as const,
  detail: (id: number) => [...tagKeys.details(), id] as const,
  recipe: (recipeId: number) => [...tagKeys.all, 'recipe', recipeId] as const,
  suggestions: (recipeId: number) => [...tagKeys.all, 'suggestions', recipeId] as const,
  popular: () => [...tagKeys.all, 'popular'] as const,
};

/**
 * Fetch all tags
 */
export function useTags() {
  return useQuery({
    queryKey: tagKeys.list(),
    queryFn: () => tagsApi.list(),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Fetch a single tag with its recipe IDs
 */
export function useTag(id: number) {
  return useQuery({
    queryKey: tagKeys.detail(id),
    queryFn: () => tagsApi.get(id),
    enabled: id > 0,
  });
}

/**
 * Fetch tags for a specific recipe
 */
export function useRecipeTags(recipeId: number) {
  return useQuery({
    queryKey: tagKeys.recipe(recipeId),
    queryFn: () => tagsApi.getRecipeTags(recipeId),
    enabled: recipeId > 0,
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Fetch AI-suggested tags for a recipe
 */
export function useTagSuggestions(recipeId: number) {
  return useQuery({
    queryKey: tagKeys.suggestions(recipeId),
    queryFn: () => tagsApi.suggestForRecipe(recipeId),
    enabled: recipeId > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Fetch popular tags
 */
export function usePopularTags(limit: number = 10) {
  return useQuery({
    queryKey: tagKeys.popular(),
    queryFn: () => tagsApi.getPopular(limit),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Create a new tag
 */
export function useCreateTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: TagCreate) => tagsApi.create(data),
    onSuccess: (newTag) => {
      // Record observation
      recordAction('tag_created', 'tag', newTag.id, {
        name: newTag.name,
        has_color: !!newTag.color,
      });

      // Invalidate tags list
      queryClient.invalidateQueries({ queryKey: tagKeys.lists() });
    },
  });
}

/**
 * Update an existing tag
 */
export function useUpdateTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: TagUpdate }) =>
      tagsApi.update(id, data),
    onSuccess: (_, variables) => {
      // Record observation
      recordAction('tag_updated', 'tag', variables.id, {
        changed_fields: Object.keys(variables.data),
      });

      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: tagKeys.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: tagKeys.lists() });
    },
  });
}

/**
 * Delete a tag
 */
export function useDeleteTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => tagsApi.delete(id),
    onSuccess: (_data, id) => {
      // Record observation
      recordAction('tag_deleted', 'tag', id);

      // Invalidate all tag queries
      queryClient.invalidateQueries({ queryKey: tagKeys.all });
    },
  });
}

/**
 * Update all tags for a recipe
 */
export function useUpdateRecipeTags() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ recipeId, tagIds }: { recipeId: number; tagIds: number[] }) =>
      tagsApi.updateRecipeTags(recipeId, tagIds),
    onSuccess: (_, variables) => {
      // Record observation
      recordAction('recipe_tags_updated', 'recipe', variables.recipeId, {
        tag_count: variables.tagIds.length,
        tag_ids: variables.tagIds,
      });

      // Invalidate recipe tags
      queryClient.invalidateQueries({ queryKey: tagKeys.recipe(variables.recipeId) });
      queryClient.invalidateQueries({ queryKey: tagKeys.lists() });
    },
  });
}

/**
 * Snapshot for rolling back optimistic recipe tag updates on error.
 */
interface TagMutationSnapshot {
  recipeQueries: Array<{ queryKey: readonly unknown[]; data: Recipe[] }>;
  recipeTags: RecipeTag[] | undefined;
  recipeTagKey: readonly unknown[];
}

/**
 * Optimistically update recipe tags in all cached ['recipes', ...] queries
 * AND the per-recipe ['tags', 'recipe', recipeId] query.
 * Returns a snapshot for rollback on error.
 */
function optimisticRecipeTagUpdate(
  queryClient: QueryClient,
  recipeId: number,
  updater: (tags: RecipeTag[]) => RecipeTag[],
): TagMutationSnapshot {
  const recipeQueries: TagMutationSnapshot['recipeQueries'] = [];

  // Update all cached ['recipes', ...] queries
  queryClient.getQueriesData<Recipe[]>({ queryKey: ['recipes'] }).forEach(([queryKey, data]) => {
    if (!data) return;
    recipeQueries.push({ queryKey, data });
    queryClient.setQueryData<Recipe[]>(queryKey, data.map(recipe =>
      recipe.id === recipeId
        ? { ...recipe, tags: updater(recipe.tags ?? []) }
        : recipe,
    ));
  });

  // Update the per-recipe tag cache too
  const recipeTagKey = tagKeys.recipe(recipeId);
  const prevRecipeTags = queryClient.getQueryData<RecipeTag[]>(recipeTagKey);
  if (prevRecipeTags) {
    queryClient.setQueryData<RecipeTag[]>(recipeTagKey, updater(prevRecipeTags));
  }

  return { recipeQueries, recipeTags: prevRecipeTags, recipeTagKey };
}

/**
 * Rollback a TagMutationSnapshot — restores all caches to their pre-mutation state.
 */
function rollbackTagSnapshot(queryClient: QueryClient, snapshot: TagMutationSnapshot) {
  for (const { queryKey, data } of snapshot.recipeQueries) {
    queryClient.setQueryData(queryKey, data);
  }
  if (snapshot.recipeTags !== undefined) {
    queryClient.setQueryData(snapshot.recipeTagKey, snapshot.recipeTags);
  }
}

/**
 * Add a single tag to a recipe (optimistic update)
 */
export function useAddTagToRecipe() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ recipeId, tagId }: { recipeId: number; tagId: number }) =>
      tagsApi.addTagToRecipe(recipeId, tagId),
    onMutate: async (variables) => {
      // Cancel in-flight fetches so they don't overwrite our optimistic update
      await queryClient.cancelQueries({ queryKey: ['recipes'] });
      await queryClient.cancelQueries({ queryKey: tagKeys.recipe(variables.recipeId) });

      // Find the full tag object from the tags cache
      const allTags = queryClient.getQueryData<RecipeTag[]>(tagKeys.list()) ?? [];
      const tag = allTags.find(t => t.id === variables.tagId);
      if (!tag) return { snapshot: undefined };

      const snapshot = optimisticRecipeTagUpdate(
        queryClient,
        variables.recipeId,
        (tags) => tags.some(t => t.id === variables.tagId) ? tags : [...tags, { ...tag }],
      );

      return { snapshot };
    },
    onError: (_err, _variables, context) => {
      if (context?.snapshot) {
        rollbackTagSnapshot(queryClient, context.snapshot);
      }
    },
    onSuccess: (_, variables) => {
      recordAction('tag_added_to_recipe', 'recipe', variables.recipeId, {
        tag_id: variables.tagId,
      });
    },
    onSettled: (_data, _err, variables) => {
      // Refetch tag-specific caches; skip ['recipes'] to avoid flicker
      // (optimistic update already has the correct state on success,
      //  and onError rollback + invalidation handles failures)
      queryClient.invalidateQueries({ queryKey: tagKeys.recipe(variables.recipeId) });
      queryClient.invalidateQueries({ queryKey: tagKeys.lists() });
    },
  });
}

/**
 * Remove a single tag from a recipe (optimistic update)
 */
export function useRemoveTagFromRecipe() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ recipeId, tagId }: { recipeId: number; tagId: number }) =>
      tagsApi.removeTagFromRecipe(recipeId, tagId),
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ['recipes'] });
      await queryClient.cancelQueries({ queryKey: tagKeys.recipe(variables.recipeId) });

      const snapshot = optimisticRecipeTagUpdate(
        queryClient,
        variables.recipeId,
        (tags) => tags.filter(t => t.id !== variables.tagId),
      );

      return { snapshot };
    },
    onError: (_err, _variables, context) => {
      if (context?.snapshot) {
        rollbackTagSnapshot(queryClient, context.snapshot);
        // Re-sync after rollback
        queryClient.invalidateQueries({ queryKey: ['recipes'] });
      }
    },
    onSuccess: (_, variables) => {
      recordAction('tag_removed_from_recipe', 'recipe', variables.recipeId, {
        tag_id: variables.tagId,
      });
    },
    onSettled: (_data, _err, variables) => {
      queryClient.invalidateQueries({ queryKey: tagKeys.recipe(variables.recipeId) });
      queryClient.invalidateQueries({ queryKey: tagKeys.lists() });
    },
  });
}

/**
 * Hook that provides tag intelligence for a recipe
 */
export function useTagIntelligence(recipeId: number) {
  const { data: currentTags = [], isLoading: tagsLoading } = useRecipeTags(recipeId);
  const { data: suggestions = [], isLoading: suggestionsLoading } = useTagSuggestions(recipeId);
  const { data: popularTags = [] } = usePopularTags(10);

  const addTag = useAddTagToRecipe();
  const removeTag = useRemoveTagFromRecipe();

  // Filter suggestions to exclude already-applied tags
  const currentTagIds = new Set(currentTags.map(t => t.id));
  const filteredSuggestions = suggestions.filter(s => !currentTagIds.has(s.tag.id));

  // Get popular tags not yet applied
  const availablePopularTags = popularTags.filter(t => !currentTagIds.has(t.id));

  return {
    currentTags,
    suggestions: filteredSuggestions,
    popularTags: availablePopularTags,
    isLoading: tagsLoading || suggestionsLoading,
    addTag: (tagId: number) => addTag.mutate({ recipeId, tagId }),
    removeTag: (tagId: number) => removeTag.mutate({ recipeId, tagId }),
    isAdding: addTag.isPending,
    isRemoving: removeTag.isPending,
  };
}
