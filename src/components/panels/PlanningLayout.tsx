/**
 * PlanningLayout Component
 *
 * Standard panel layout for meal planning mode:
 * - Recipe selection prominent
 * - Ingredients collapsed/expandable
 * - Shopping impact preview
 *
 * This is the default view when not actively cooking.
 *
 * Intelligent meal display.
 */

import { useState, useMemo } from 'react';
import { useRecipes, useCreateRecipe } from '@/hooks/useRecipes';
import { useRecipeCategories } from '@/hooks/useCategories';
import { useMealSlotSuggestions } from '@/hooks/useMealIntelligence';
import { PanelSkeleton } from '@/components/shared/PanelSkeleton';
import { RecipeForm } from '@/components/recipes/RecipeForm';
import type { Recipe, MealPlanEntry, MealType, RecipeCreate } from '@/types';

interface PlanningLayoutProps {
  // Current meal data
  meal: MealPlanEntry | null;
  date: string;
  mealType: MealType;
  isNew: boolean;

  // Current selection state
  selectedRecipeId: number | null;
  description: string;

  // Callbacks
  onRecipeSelect: (recipe: Recipe) => void;
  onDescriptionChange: (description: string) => void;
  onSubmit: () => void;
  onDelete: () => void;
  onClose: () => void;
  onStartCooking?: () => void;  // Manual entry to cooking mode

  // Loading states
  isSubmitting: boolean;
}

const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
};

// Keywords to filter recipes by meal type
const MEAL_TYPE_KEYWORDS: Record<MealType, string[]> = {
  breakfast: ['breakfast', 'pancake', 'waffle', 'oatmeal', 'eggs', 'omelet', 'cereal', 'toast', 'muffin', 'smoothie', 'bacon', 'sausage'],
  lunch: ['lunch', 'sandwich', 'salad', 'soup', 'wrap', 'bowl'],
  dinner: ['dinner', 'steak', 'chicken', 'pasta', 'roast', 'casserole', 'stew'],
};

// Check if recipe name matches meal type keywords
function recipeMatchesMealType(recipe: Recipe, mealType: MealType): boolean {
  const name = recipe.name.toLowerCase();
  return MEAL_TYPE_KEYWORDS[mealType].some(keyword => name.includes(keyword));
}

export function PlanningLayout({
  meal,
  date,
  mealType,
  isNew,
  selectedRecipeId,
  description,
  onRecipeSelect,
  onDescriptionChange,
  onSubmit,
  onDelete,
  onClose,
  onStartCooking,
  isSubmitting,
}: PlanningLayoutProps) {
  const { data: recipes = [], isLoading: recipesLoading } = useRecipes();
  const { data: categories = [] } = useRecipeCategories();
  const createRecipe = useCreateRecipe();

  // Intelligence integration - get recipe suggestions for this slot
  const {
    suggestions: aiSuggestions,
    reasoning: aiReasoning,
    isLoading: suggestionsLoading,
  } = useMealSlotSuggestions(date, mealType);

  // Local UI state
  const [searchQuery, setSearchQuery] = useState('');
  const [showAllRecipes, setShowAllRecipes] = useState(false);
  const [showRecipeForm, setShowRecipeForm] = useState(false);
  const [showIngredients, setShowIngredients] = useState(false);

  // Filter recipes by meal type and search
  const filteredRecipes = useMemo(() => {
    let filtered = recipes;

    // Filter by meal type keywords (unless showing all)
    if (mealType && !showAllRecipes && !searchQuery.trim()) {
      const matching = recipes.filter(r => recipeMatchesMealType(r, mealType));
      if (matching.length > 0) {
        filtered = matching;
      }
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((r) => r.name.toLowerCase().includes(query));
    }

    return filtered;
  }, [recipes, searchQuery, mealType, showAllRecipes]);

  // Check if there are recipes being filtered out
  const hasFilteredRecipes = useMemo(() => {
    if (!mealType || showAllRecipes) return false;
    const matching = recipes.filter(r => recipeMatchesMealType(r, mealType));
    return matching.length > 0 && matching.length < recipes.length;
  }, [recipes, mealType, showAllRecipes]);

  // Get selected recipe
  const selectedRecipe = useMemo(() => {
    return recipes.find((r) => r.id === selectedRecipeId) || null;
  }, [recipes, selectedRecipeId]);

  const handleSaveRecipe = async (recipeData: RecipeCreate) => {
    try {
      const newRecipe = await createRecipe.mutateAsync(recipeData);
      onRecipeSelect(newRecipe);
      setShowRecipeForm(false);
    } catch {
      // Recipe creation failure handled by TanStack Query's onError
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  if (recipesLoading) {
    return <PanelSkeleton />;
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header Info */}
      <div className="pb-4 border-b border-slate-700">
        <div className="text-sm text-slate-400">
          {date && new Date(date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </div>
        <div className="text-lg font-medium text-white">
          {mealType && MEAL_TYPE_LABELS[mealType]}
        </div>
      </div>

      {/* AI Recipe Suggestions - Glass Box */}
      {!selectedRecipeId && aiSuggestions.length > 0 && !suggestionsLoading && (
        <div className="p-4 bg-gradient-to-r from-cyan-500/10 to-emerald-500/10 border border-cyan-500/20 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            <span className="text-sm font-medium text-cyan-400">Suggested for you</span>
          </div>
          {/* Glass Box: Show reasoning */}
          <p className="text-xs text-slate-400 mb-3">{aiReasoning}</p>
          <div className="flex flex-wrap gap-2">
            {aiSuggestions.slice(0, 3).map((suggestion) => (
              <button
                key={suggestion.recipe.id}
                type="button"
                onClick={() => onRecipeSelect(suggestion.recipe as Recipe)}
                className="flex items-center gap-2 px-3 py-1.5 bg-slate-700/50 hover:bg-slate-700 border border-slate-600 hover:border-cyan-500/50 rounded-lg text-sm text-slate-200 hover:text-white transition-colors"
              >
                <span>{suggestion.recipe.name}</span>
                {suggestion.recipe.prep_time_minutes && (
                  <span className="text-xs text-slate-400">
                    {suggestion.recipe.prep_time_minutes}min
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Recipe Search */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">
          Select a Recipe
        </label>
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 pl-10 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500"
            placeholder="Search recipes..."
          />
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>

        {/* Recipe List */}
        <div className="mt-3 max-h-48 overflow-y-auto space-y-1">
          {filteredRecipes.map((recipe) => (
            <button
              key={recipe.id}
              type="button"
              onClick={() => onRecipeSelect(recipe)}
              className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                selectedRecipeId === recipe.id
                  ? 'bg-cyan-500/20 border border-cyan-500/50 text-cyan-300'
                  : 'bg-slate-700/50 hover:bg-slate-700 text-slate-300'
              }`}
            >
              <div className="font-medium">{recipe.name}</div>
              {recipe.prep_time_minutes && (
                <div className="text-xs text-slate-400">
                  {recipe.prep_time_minutes}min prep
                  {recipe.servings && ` • ${recipe.servings} servings`}
                </div>
              )}
            </button>
          ))}
          {filteredRecipes.length === 0 && (
            <div className="text-center py-4 text-slate-400">
              No recipes found
            </div>
          )}
        </div>

        {/* Add New Recipe button */}
        <button
          type="button"
          onClick={() => setShowRecipeForm(true)}
          className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2 bg-slate-700/50 hover:bg-slate-700 border border-dashed border-slate-600 rounded-lg text-slate-300 hover:text-white transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add New Recipe
        </button>

        {/* Show all recipes toggle */}
        {hasFilteredRecipes && !searchQuery.trim() && (
          <button
            type="button"
            onClick={() => setShowAllRecipes(!showAllRecipes)}
            className="mt-2 text-sm text-slate-400 hover:text-cyan-400 transition-colors"
          >
            {showAllRecipes
              ? `Show only ${MEAL_TYPE_LABELS[mealType!].toLowerCase()} recipes`
              : 'Show all recipes'}
          </button>
        )}
      </div>

      {/* Selected Recipe Preview */}
      {selectedRecipe && (
        <div className="p-4 bg-slate-700/50 rounded-lg space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-sm font-medium text-cyan-400">Selected Recipe</div>
              <div className="font-medium text-white mt-1">{selectedRecipe.name}</div>
              <div className="text-sm text-slate-400 mt-1">
                {selectedRecipe.prep_time_minutes && `${selectedRecipe.prep_time_minutes}min prep`}
                {selectedRecipe.cook_time_minutes && ` • ${selectedRecipe.cook_time_minutes}min cook`}
                {selectedRecipe.servings && ` • ${selectedRecipe.servings} servings`}
              </div>
            </div>
            {/* Start Cooking Button - Manual entry to fullscreen cooking mode */}
            {onStartCooking && (
              <button
                type="button"
                onClick={onStartCooking}
                className="flex items-center gap-2 px-3 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/50 text-emerald-400 rounded-lg text-sm font-medium transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Start Cooking
              </button>
            )}
          </div>

          {/* Collapsible Instructions Preview */}
          {selectedRecipe.instructions && (
            <div>
              <button
                type="button"
                onClick={() => setShowIngredients(!showIngredients)}
                className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
              >
                <svg
                  className={`w-4 h-4 transition-transform ${showIngredients ? 'rotate-90' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                View Instructions
              </button>
              {showIngredients && (
                <div className="mt-2 p-3 bg-slate-800/50 rounded-lg">
                  <p className="text-sm text-slate-300 whitespace-pre-wrap line-clamp-6">
                    {selectedRecipe.instructions}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Or Custom Description */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">
          Or add a custom meal
        </label>
        <input
          type="text"
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500"
          placeholder="e.g., Leftovers, Takeout, etc."
        />
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-700">
        {!isNew && (
          <button
            type="button"
            onClick={onDelete}
            className="px-4 py-2 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 rounded-lg transition-colors"
          >
            Remove Meal
          </button>
        )}
        <div className={`flex items-center gap-3 ${isNew ? 'ml-auto' : ''}`}>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={(!selectedRecipeId && !description.trim()) || isSubmitting}
            className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {isNew ? 'Plan Meal' : 'Update Meal'}
          </button>
        </div>
      </div>

      {/* Recipe Form Modal - includes Import from URL tab */}
      <RecipeForm
        recipe={undefined}
        categories={categories}
        isOpen={showRecipeForm}
        onClose={() => setShowRecipeForm(false)}
        onSave={(data) => handleSaveRecipe(data as RecipeCreate)}
      />
    </div>
  );
}
