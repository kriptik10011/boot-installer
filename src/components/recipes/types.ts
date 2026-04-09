/**
 * Recipes Section Types
 */

import type {
  Recipe,
  RecipeCategory,
  RecipeCreate,
  RecipeUpdate,
  MealType,
} from '@/types';

// ============================================================================
// FILTER STATE
// ============================================================================

export interface RecipeFiltersState {
  categoryId: number | null;
  searchQuery: string;
}

// ============================================================================
// VIEW PROPS
// ============================================================================

export interface RecipesGridViewProps {
  recipes: Recipe[];
  categories: RecipeCategory[];
  filters: RecipeFiltersState;
  onRecipeClick: (recipe: Recipe) => void;
  onAddRecipe: () => void;
  onFiltersChange: (filters: RecipeFiltersState) => void;
}

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface RecipeCardProps {
  recipe: Recipe;
  category?: RecipeCategory;
  onClick: () => void;
}

export interface RecipeSearchProps {
  value: string;
  onChange: (value: string) => void;
}

export interface CategoryTabsProps {
  categories: RecipeCategory[];
  activeId: number | null;
  onChange: (categoryId: number | null) => void;
}

export interface RecipeFormProps {
  recipe?: Recipe;
  categories: RecipeCategory[];
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: RecipeCreate | RecipeUpdate) => void;
}

export interface RecipeDetailProps {
  recipe: Recipe;
  category?: RecipeCategory;
  onEdit: () => void;
  onDelete: () => void;
  onAddToMealPlan: (servings: number | null) => void;
  onClose: () => void;
}

export interface AddToMealPlanModalProps {
  isOpen: boolean;
  recipeName: string;
  initialServings?: number | null;
  defaultServings?: number;
  onConfirm: (date: string, mealType: MealType, servings: number) => void;
  onCancel: () => void;
}
