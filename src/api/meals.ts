/**
 * Meals API — recipes, meal plans, batch prep, tags, dietary restrictions, food parser.
 */

import { request } from './core';
import type {
  Recipe,
  RecipeCreate,
  RecipeUpdate,
  MealPlanEntry,
  MealPlanCreate,
  MealPlanUpdate,
  RecipeCategory,
} from '@/types';

// =============================================================================
// RECIPE IMPORT TYPES
// =============================================================================

export interface ExtractedIngredient {
  name: string;
  quantity: string | null;
  unit: string | null;
  notes: string | null;
  raw_text: string;
}

export interface ExtractedRecipe {
  name: string;
  instructions: string;
  ingredients: ExtractedIngredient[];
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  total_time_minutes: number | null;
  servings: number | null;
  source_url: string;
  source_site: string;
  image_url: string | null;
  cuisine_type: string | null;
  notes: string | null;
  confidence: number;
  extraction_method: string;
}

export interface ImportPreviewResponse {
  success: boolean;
  recipe: ExtractedRecipe | null;
  error_message: string | null;
  ai_prompt: string | null;
  source_url: string;
}

export interface ImportConfirmRequest {
  name: string;
  instructions: string;
  ingredients: Array<{
    name: string;
    quantity?: string | null;
    unit?: string | null;
    notes?: string | null;
  }>;
  prep_time_minutes?: number | null;
  cook_time_minutes?: number | null;
  servings?: number | null;
  source_url: string;
  image_url?: string | null;
  cuisine_type?: string | null;
  notes?: string | null;
  category_id?: number | null;
}

// =============================================================================
// INVENTORY COVERAGE CHECK TYPES
// =============================================================================

export interface IngredientStatus {
  name: string;
  in_stock: boolean;
  stock_note: string | null;
  food_category: string | null;
  alternatives: string[];
}

export interface CoverageCheckResponse {
  coverage_pct: number;
  total_ingredients: number;
  in_stock_count: number;
  missing_count: number;
  ingredients: IngredientStatus[];
}

// =============================================================================
// COOKING COMPLETE TYPE
// =============================================================================

export interface CookingCompleteRequest {
  actual_servings: number;
  actual_prep_minutes: number;
  actual_cook_minutes: number;
  notes?: string | null;
}

// =============================================================================
// RECIPES API
// =============================================================================

export const recipesApi = {
  list: (categoryId?: number, search?: string) => {
    const params = new URLSearchParams();
    if (categoryId) params.append('category_id', String(categoryId));
    if (search) params.append('search', search);
    const queryString = params.toString();
    return request<Recipe[]>(`/recipes${queryString ? `?${queryString}` : ''}`);
  },
  get: (id: number) => request<Recipe>(`/recipes/${id}`),
  create: (data: RecipeCreate) => request<Recipe>('/recipes', { method: 'POST', body: data }),
  update: (id: number, data: RecipeUpdate) => request<Recipe>(`/recipes/${id}`, { method: 'PUT', body: data }),
  delete: (id: number) => request<void>(`/recipes/${id}`, { method: 'DELETE' }),
  importPreview: (url: string) =>
    request<ImportPreviewResponse>('/recipes/import/preview', {
      method: 'POST',
      body: { url },
    }),
  importConfirm: (data: ImportConfirmRequest) =>
    request<Recipe>('/recipes/import/confirm', {
      method: 'POST',
      body: data,
    }),
  importAiParse: (jsonText: string, sourceUrl: string) =>
    request<ImportPreviewResponse>('/recipes/import/ai-parse', {
      method: 'POST',
      body: { json_text: jsonText, source_url: sourceUrl },
    }),
  suggestFromPantry: (minMatch = 0, limit = 20) =>
    request<any[]>(`/recipes/suggest/from-pantry?min_match=${minMatch}&limit=${limit}`),
  checkCoverage: (ingredientNames: string[]) =>
    request<CoverageCheckResponse>('/recipes/import/coverage', {
      method: 'POST',
      body: { ingredient_names: ingredientNames },
    }),
};

// =============================================================================
// RECIPE CATEGORIES
// =============================================================================

export const recipeCategoriesApi = {
  list: () => request<RecipeCategory[]>('/categories/recipes'),
  create: (data: { name: string }) =>
    request<RecipeCategory>('/categories/recipes', { method: 'POST', body: data }),
};

// =============================================================================
// MEALS API
// =============================================================================

export const mealsApi = {
  list: () => request<MealPlanEntry[]>('/meals'),
  get: (id: number) => request<MealPlanEntry>(`/meals/${id}`),
  create: (data: MealPlanCreate) => request<MealPlanEntry>('/meals', { method: 'POST', body: data }),
  update: (id: number, data: MealPlanUpdate) => request<MealPlanEntry>(`/meals/${id}`, { method: 'PUT', body: data }),
  delete: (id: number) => request<void>(`/meals/${id}`, { method: 'DELETE' }),
  getWeek: (weekStart: string) => request<MealPlanEntry[]>(`/meals/week/${weekStart}`),
  completeCooking: (id: number, data: CookingCompleteRequest) =>
    request<MealPlanEntry>(`/meals/${id}/cooking-complete`, { method: 'POST', body: data }),
  reuseSuggestions: (weekStart: string, limit = 10) =>
    request<any[]>(`/meals/reuse-suggestions/${weekStart}?limit=${limit}`),
};

// =============================================================================
// TAGS API
// =============================================================================

export interface RecipeTag {
  id: number;
  name: string;
  color: string | null;
  created_at: string;
  recipe_count: number;
}

export interface TagWithRecipes extends RecipeTag {
  recipe_ids: number[];
}

export interface TagSuggestion {
  tag: RecipeTag;
  confidence: number;
  reasoning: string;
}

export interface TagCreate {
  name: string;
  color?: string;
}

export interface TagUpdate {
  name?: string;
  color?: string;
}

export const tagsApi = {
  list: () => request<RecipeTag[]>('/tags'),
  get: (id: number) => request<TagWithRecipes>(`/tags/${id}`),
  create: (data: TagCreate) =>
    request<RecipeTag>('/tags', { method: 'POST', body: data }),
  update: (id: number, data: TagUpdate) =>
    request<RecipeTag>(`/tags/${id}`, { method: 'PUT', body: data }),
  delete: (id: number) =>
    request<void>(`/tags/${id}`, { method: 'DELETE' }),
  getRecipeTags: (recipeId: number) =>
    request<RecipeTag[]>(`/tags/recipe/${recipeId}`),
  updateRecipeTags: (recipeId: number, tagIds: number[]) =>
    request<RecipeTag[]>(`/tags/recipe/${recipeId}`, {
      method: 'PUT',
      body: { tag_ids: tagIds },
    }),
  addTagToRecipe: (recipeId: number, tagId: number) =>
    request<RecipeTag[]>(`/tags/recipe/${recipeId}/add/${tagId}`, {
      method: 'POST',
    }),
  removeTagFromRecipe: (recipeId: number, tagId: number) =>
    request<RecipeTag[]>(`/tags/recipe/${recipeId}/remove/${tagId}`, {
      method: 'DELETE',
    }),
  suggestForRecipe: (recipeId: number) =>
    request<TagSuggestion[]>(`/tags/suggest/${recipeId}`),
  getPopular: (limit: number = 10) =>
    request<RecipeTag[]>(`/tags/popular?limit=${limit}`),
};

// =============================================================================
// DIETARY RESTRICTIONS API
// =============================================================================

export const dietaryRestrictionsApi = {
  list: () => request<any[]>('/dietary-restrictions'),
  create: (data: { name: string; icon?: string; description?: string }) =>
    request<any>('/dietary-restrictions', { method: 'POST', body: data }),
  delete: (id: number) =>
    request<void>(`/dietary-restrictions/${id}`, { method: 'DELETE' }),
  getForRecipe: (recipeId: number) =>
    request<any[]>(`/dietary-restrictions/recipe/${recipeId}`),
  setForRecipe: (recipeId: number, restrictionIds: number[]) =>
    request<any[]>(`/dietary-restrictions/recipe/${recipeId}`, { method: 'PUT', body: { restriction_ids: restrictionIds } }),
  filterRecipes: (restrictionIds: number[], matchAll = true) =>
    request<any[]>(`/dietary-restrictions/filter/recipes?restriction_ids=${restrictionIds.join(',')}&match_all=${matchAll}`),
};

// =============================================================================
// BATCH PREP API
// =============================================================================

export const batchPrepApi = {
  list: () => request<any[]>('/batch-prep/'),
  getWeek: (weekStart: string) => request<any[]>(`/batch-prep/week/${weekStart}`),
  get: (id: number) => request<any>(`/batch-prep/${id}`),
  create: (data: any) => request<any>('/batch-prep/', { method: 'POST', body: data }),
  update: (id: number, data: any) => request<any>(`/batch-prep/${id}`, { method: 'PUT', body: data }),
  delete: (id: number) => request<void>(`/batch-prep/${id}`, { method: 'DELETE' }),
  complete: (id: number, actualMinutes?: number) =>
    request<any>(`/batch-prep/${id}/complete${actualMinutes ? `?actual_duration_minutes=${actualMinutes}` : ''}`, { method: 'POST' }),
  addTask: (sessionId: number, data: { task_name: string; estimated_minutes?: number }) =>
    request<any>(`/batch-prep/${sessionId}/tasks`, { method: 'POST', body: data }),
  toggleTask: (sessionId: number, taskId: number) =>
    request<any>(`/batch-prep/${sessionId}/tasks/${taskId}`, { method: 'PUT' }),
  linkMeals: (sessionId: number, mealIds: number[]) =>
    request<any>(`/batch-prep/${sessionId}/meals`, { method: 'POST', body: mealIds }),
};

// =============================================================================
// FOOD PARSER API
// =============================================================================

export interface ParsedFoodItem {
  name: string;
  quantity: number;
  unit: string | null;
  package_size: number | null;
  package_unit: string | null;
  notes: string | null;
  expiration_date: string | null;
  category_hint: string | null;
  raw_text: string;
  confidence: number;
}

export interface FoodParserResponse {
  items: ParsedFoodItem[];
  format_detected: string;
  total_lines: number;
  parsed_count: number;
}

export const foodParserApi = {
  preview: (text: string, context: string = 'inventory') =>
    request<FoodParserResponse>('/food-parser/preview', {
      method: 'POST',
      body: { text, context },
    }),
  previewSingle: (text: string, context: string = 'inventory') =>
    request<ParsedFoodItem>('/food-parser/preview-single', {
      method: 'POST',
      body: { text, context },
    }),
};
