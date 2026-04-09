/**
 * Meal, Recipe, Cooking & Ingredient Types
 */

export interface RecipeCategory {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface RecipeTag {
  id: number;
  name: string;
  color: string | null;
  created_at: string;
  recipe_count: number;
}

export interface TagSuggestion {
  tag: RecipeTag;
  confidence: number;
  reasoning: string;
}

export interface RecipeIngredient {
  ingredient_id: number;
  ingredient_name: string;
  quantity: string | null;
  unit: string | null;
  notes: string | null;
}

export interface Recipe {
  id: number;
  name: string;
  category_id: number | null;
  instructions: string;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  servings: number | null;
  source: string | null;
  image_url: string | null;
  notes: string | null;
  cuisine_type: string | null;
  created_at: string;
  updated_at: string;
  ingredients?: RecipeIngredient[];
  tags?: RecipeTag[];
}

export type MealType = 'breakfast' | 'lunch' | 'dinner';

export interface MealPlanEntry {
  id: number;
  date: string;
  meal_type: MealType;
  recipe_id: number | null;
  description: string | null;
  planned_servings: number | null;
  created_at: string;
  updated_at: string;
  actual_servings: number | null;
  actual_prep_minutes: number | null;
  actual_cook_minutes: number | null;
  cooked_at: string | null;
  cooking_notes: string | null;
  inventory_depleted: boolean;
}

export interface RecipeCreate {
  name: string;
  category_id?: number | null;
  instructions: string;
  prep_time_minutes?: number | null;
  cook_time_minutes?: number | null;
  servings?: number | null;
  source?: string | null;
  image_url?: string | null;
  notes?: string | null;
  cuisine_type?: string | null;
}

export interface RecipeUpdate extends Partial<RecipeCreate> {}

export interface MealPlanCreate {
  date: string;
  meal_type: MealType;
  recipe_id?: number | null;
  description?: string | null;
  planned_servings?: number | null;
}

export interface MealPlanUpdate extends Partial<MealPlanCreate> {}

// Batch Prep
export interface PrepTask {
  id: number;
  task_name: string;
  is_completed: boolean;
  sort_order: number;
  estimated_minutes?: number | null;
  notes?: string | null;
}

export interface BatchPrepSession {
  id: number;
  name: string;
  prep_date: string;
  prep_start_time?: string | null;
  estimated_duration_minutes?: number | null;
  actual_duration_minutes?: number | null;
  description?: string | null;
  is_completed: boolean;
  completed_at?: string | null;
  tasks: PrepTask[];
  meal_ids: number[];
}

// Ingredient Reuse
export interface IngredientOverlap {
  ingredient_id: number;
  ingredient_name: string;
  shared_with_recipes: string[];
}

export interface ReuseSuggestion {
  recipe_id: number;
  recipe_name: string;
  overlap_count: number;
  total_ingredients: number;
  overlap_pct: number;
  shared_ingredients: IngredientOverlap[];
  unique_ingredients: number;
}

// Dietary Restrictions
export interface DietaryRestriction {
  id: number;
  name: string;
  icon?: string | null;
  description?: string | null;
  is_system: boolean;
}

export interface RecipeWithRestrictions {
  recipe_id: number;
  recipe_name: string;
  restrictions: DietaryRestriction[];
}
