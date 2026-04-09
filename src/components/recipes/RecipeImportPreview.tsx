/**
 * RecipeImportPreview Component
 *
 * Shows extracted recipe data for review and editing before saving.
 *
 * Recipe import preview.
 */

import { useState, useMemo, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { recipesApi, type ExtractedRecipe, type ExtractedIngredient, type ImportConfirmRequest } from '@/api/client';
import { useRecipeCategories } from '@/hooks/useCategories';
import { useRecipes } from '@/hooks/useRecipes';
import { scaleQuantity } from '@/utils/portionScaling';
import { PostCreateTagStep } from './PostCreateTagStep';
import type { Recipe } from '@/types';

// Glass Box: Duplicate match result with reasoning
interface DuplicateMatch {
  recipe: Recipe;
  matchType: 'url' | 'name' | 'ingredients';
  similarity: number;
  reasoning: string;
}

interface RecipeImportPreviewProps {
  recipe: ExtractedRecipe;
  onSuccess: () => void;
  onBack: () => void;
}

export function RecipeImportPreview({ recipe, onSuccess, onBack }: RecipeImportPreviewProps) {
  const queryClient = useQueryClient();
  const { data: categories = [] } = useRecipeCategories();
  const { data: existingRecipes = [] } = useRecipes();

  const [name, setName] = useState(recipe.name);
  const [duplicateAcknowledged, setDuplicateAcknowledged] = useState(false);
  const [savedRecipe, setSavedRecipe] = useState<{ id: number; name: string } | null>(null);

  // Glass Box: Check for duplicate recipes with reasoning
  const duplicateMatch = useMemo((): DuplicateMatch | null => {
    if (duplicateAcknowledged) return null;

    // Priority 1: Exact URL match
    if (recipe.source_url) {
      const urlMatch = existingRecipes.find(r =>
        r.source?.toLowerCase() === recipe.source_url?.toLowerCase()
      );
      if (urlMatch) {
        return {
          recipe: urlMatch,
          matchType: 'url',
          similarity: 1.0,
          reasoning: `This URL was already imported as "${urlMatch.name}" on ${new Date(urlMatch.created_at || Date.now()).toLocaleDateString()}`,
        };
      }
    }

    // Priority 2: Similar name match (>80% similarity)
    const normalizedName = recipe.name.toLowerCase().trim();
    const nameMatch = existingRecipes.find(r => {
      const existingName = r.name.toLowerCase().trim();
      // Simple similarity check: exact match or starts with
      return existingName === normalizedName ||
        existingName.startsWith(normalizedName) ||
        normalizedName.startsWith(existingName);
    });
    if (nameMatch) {
      return {
        recipe: nameMatch,
        matchType: 'name',
        similarity: 0.85,
        reasoning: `"${nameMatch.name}" has a similar name and may be the same recipe`,
      };
    }

    return null;
  }, [recipe.source_url, recipe.name, existingRecipes, duplicateAcknowledged]);
  const [instructions, setInstructions] = useState(recipe.instructions);
  // Store ORIGINAL ingredients and servings from URL for scaling reference
  const [originalIngredients] = useState<ExtractedIngredient[]>(recipe.ingredients);
  const originalServings = recipe.servings ?? 4;

  const [ingredients, setIngredients] = useState<ExtractedIngredient[]>(recipe.ingredients);
  const [prepTime, setPrepTime] = useState(recipe.prep_time_minutes?.toString() || '');
  const [cookTime, setCookTime] = useState(recipe.cook_time_minutes?.toString() || '');
  const [servings, setServings] = useState(recipe.servings?.toString() || '');
  const [cuisineType, setCuisineType] = useState(recipe.cuisine_type || '');
  const [notes, setNotes] = useState(recipe.notes || '');
  const [categoryId, setCategoryId] = useState<number | null>(null);

  // Scale ingredients when servings changes
  const handleServingsChange = useCallback((newServings: string) => {
    setServings(newServings);

    const newServingsNum = parseInt(newServings, 10);
    if (isNaN(newServingsNum) || newServingsNum < 1) return;

    const scaleFactor = newServingsNum / originalServings;

    // Scale all ingredient quantities
    const scaledIngredients = originalIngredients.map(ing => {
      if (!ing.quantity) return ing;

      try {
        const quantityStr = `${ing.quantity}${ing.unit ? ` ${ing.unit}` : ''}`;
        const scaled = scaleQuantity(quantityStr, scaleFactor);
        // Extract just the number part (scaleQuantity returns "2 cups" format)
        const parts = scaled.split(' ');
        const newQuantity = parts[0];

        return {
          ...ing,
          quantity: newQuantity,
        };
      } catch {
        return ing;
      }
    });

    setIngredients(scaledIngredients);
  }, [originalIngredients, originalServings]);

  const confirmMutation = useMutation({
    mutationFn: (data: ImportConfirmRequest) => recipesApi.importConfirm(data),
    onSuccess: (savedData) => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      setSavedRecipe({ id: savedData.id, name: savedData.name });
    },
  });

  const handleIngredientChange = (index: number, field: keyof ExtractedIngredient, value: string) => {
    setIngredients(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value || null };
      return updated;
    });
  };

  const handleRemoveIngredient = (index: number) => {
    setIngredients(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddIngredient = () => {
    setIngredients(prev => [...prev, { name: '', quantity: null, unit: null, notes: null, raw_text: '' }]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const data: ImportConfirmRequest = {
      name,
      instructions,
      ingredients: ingredients
        .filter(ing => ing.name.trim())
        .map(ing => ({
          name: ing.name,
          quantity: ing.quantity,
          unit: ing.unit,
          notes: ing.notes,
        })),
      prep_time_minutes: prepTime ? parseInt(prepTime, 10) : null,
      cook_time_minutes: cookTime ? parseInt(cookTime, 10) : null,
      servings: servings ? parseInt(servings, 10) : null,
      source_url: recipe.source_url,
      image_url: recipe.image_url ?? null,
      cuisine_type: cuisineType.trim() || null,
      notes: notes.trim() || null,
      category_id: categoryId,
    };

    confirmMutation.mutate(data);
  };

  const confidenceColor = recipe.confidence >= 0.9 ? 'text-emerald-400' : recipe.confidence >= 0.7 ? 'text-amber-400' : 'text-amber-300';

  // Post-import tag step
  if (savedRecipe) {
    return (
      <div className="max-h-[70vh] overflow-y-auto pr-2">
        <PostCreateTagStep
          recipeId={savedRecipe.id}
          recipeName={savedRecipe.name}
          onDone={onSuccess}
        />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
      {/* Confidence Indicator */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-400">
          Source: <a href={recipe.source_url} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">{recipe.source_site || 'External'}</a>
        </span>
        <span className={confidenceColor}>
          {Math.round(recipe.confidence * 100)}% confidence ({recipe.extraction_method})
        </span>
      </div>

      {/* Glass Box: Duplicate Warning - Amber/dotted per No-Shame + Glass Box patterns */}
      {duplicateMatch && (
        <div className="border border-dashed border-amber-500/50 bg-amber-500/10 rounded-lg p-4">
          <div className="flex items-start gap-3">
            {/* Amber alert icon - NOT red (No-Shame) */}
            <svg className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>

            <div className="flex-1">
              <p className="text-amber-200 font-medium">
                Similar recipe found
              </p>

              {/* Glass Box reasoning - WHY we think it's a match */}
              <p className="text-slate-400 text-sm mt-1">
                {duplicateMatch.reasoning}
              </p>

              {/* User override options - always offer control */}
              <div className="flex gap-3 mt-3">
                <button
                  type="button"
                  onClick={() => {
                    // TODO: Navigate to existing recipe for editing
                    // For now, just acknowledge and let user compare
                    window.open(`/recipes?id=${duplicateMatch.recipe.id}`, '_blank');
                  }}
                  className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
                >
                  View existing recipe
                </button>
                <button
                  type="button"
                  onClick={() => setDuplicateAcknowledged(true)}
                  className="text-sm text-slate-400 hover:text-slate-300 transition-colors"
                >
                  Create as new anyway
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Recipe Name */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">
          Recipe Name *
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
        />
      </div>

      {/* Category */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">
          Category
        </label>
        <select
          value={categoryId || ''}
          onChange={(e) => setCategoryId(e.target.value ? parseInt(e.target.value, 10) : null)}
          className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
        >
          <option value="">No Category</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>
      </div>

      {/* Cuisine Type */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">
          Cuisine Type
        </label>
        <input
          type="text"
          value={cuisineType}
          onChange={(e) => setCuisineType(e.target.value)}
          placeholder="e.g., Italian, Mexican, Thai"
          className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
        />
      </div>

      {/* Time and Servings */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Prep Time (min)
          </label>
          <input
            type="number"
            value={prepTime}
            onChange={(e) => setPrepTime(e.target.value)}
            min="0"
            className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Cook Time (min)
          </label>
          <input
            type="number"
            value={cookTime}
            onChange={(e) => setCookTime(e.target.value)}
            min="0"
            className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Servings
            {recipe.servings && (
              <span className="text-slate-500 font-normal ml-1">(original: {recipe.servings})</span>
            )}
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              value={servings}
              onChange={(e) => handleServingsChange(e.target.value)}
              min="1"
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
            />
          </div>
          {/* Quick adjust buttons */}
          <div className="flex gap-1 mt-2">
            {[2, 4, 6, 8].map(num => (
              <button
                key={num}
                type="button"
                onClick={() => handleServingsChange(num.toString())}
                className={`px-2 py-1 text-xs rounded ${
                  servings === num.toString()
                    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                    : 'bg-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                {num}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Ingredients will scale automatically
          </p>
        </div>
      </div>

      {/* Ingredients */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-slate-300">
            Ingredients ({ingredients.length})
          </label>
          <button
            type="button"
            onClick={handleAddIngredient}
            className="text-sm text-cyan-400 hover:text-cyan-300"
          >
            + Add Ingredient
          </button>
        </div>
        <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
          {ingredients.map((ing, idx) => (
            <div key={idx} className="flex gap-2 items-center">
              <input
                type="text"
                placeholder="Qty"
                value={ing.quantity || ''}
                onChange={(e) => handleIngredientChange(idx, 'quantity', e.target.value)}
                className="w-16 px-2 py-1 bg-slate-700 border border-slate-600 rounded text-sm text-white focus:outline-none focus:border-cyan-500"
              />
              <input
                type="text"
                placeholder="Unit"
                value={ing.unit || ''}
                onChange={(e) => handleIngredientChange(idx, 'unit', e.target.value)}
                className="w-20 px-2 py-1 bg-slate-700 border border-slate-600 rounded text-sm text-white focus:outline-none focus:border-cyan-500"
              />
              <input
                type="text"
                placeholder="Ingredient name"
                value={ing.name}
                onChange={(e) => handleIngredientChange(idx, 'name', e.target.value)}
                className="flex-1 px-2 py-1 bg-slate-700 border border-slate-600 rounded text-sm text-white focus:outline-none focus:border-cyan-500"
              />
              <button
                type="button"
                onClick={() => handleRemoveIngredient(idx)}
                className="p-1 text-slate-400 hover:text-amber-400"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">
          Notes
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Any tips, variations, or personal notes about this recipe"
          className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500 resize-none"
        />
      </div>

      {/* Instructions */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">
          Instructions *
        </label>
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          required
          rows={8}
          className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500 resize-none"
        />
      </div>

      {/* Actions */}
      <div className="flex justify-between pt-4 border-t border-slate-700">
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
        >
          Back
        </button>
        <button
          type="submit"
          disabled={!name.trim() || !instructions.trim() || confirmMutation.isPending}
          className="px-6 py-2 bg-cyan-500 hover:bg-cyan-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          {confirmMutation.isPending ? 'Saving...' : 'Save Recipe'}
        </button>
      </div>

      {/* Error */}
      {confirmMutation.isError && (
        <div className="p-4 bg-amber-900/30 border border-amber-800 rounded-lg text-amber-200">
          Failed to save recipe. Please try again.
        </div>
      )}
    </form>
  );
}
