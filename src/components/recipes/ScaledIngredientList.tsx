/**
 * ScaledIngredientList Component
 *
 * Displays recipe ingredients with portion scaling controls.
 * Ingredients are automatically scaled based on the selected serving size.
 *
 * Intelligence Integration:
 * - OBSERVE: Track portion size selections
 * - INFER: Learn default portions per recipe type
 * - DECIDE: Suggest "Your usual is X servings for this dish"
 */

import { useState, useMemo, useCallback } from 'react';
import { Minus, Plus, Users } from 'lucide-react';
import { scaleQuantity, parseQuantity, formatQuantity } from '@/utils/portionScaling';
import { recordAction } from '@/services/observation';
import type { RecipeIngredient } from '@/types';

interface ScaledIngredientListProps {
  ingredients: RecipeIngredient[];
  originalServings: number;
  recipeId: number;
  recipeName?: string;
  /** Initial serving value (e.g., from meal.planned_servings). Defaults to originalServings. */
  initialServings?: number;
  onServingsChange?: (servings: number) => void;
}

export function ScaledIngredientList({
  ingredients,
  originalServings,
  recipeId,
  recipeName,
  initialServings,
  onServingsChange,
}: ScaledIngredientListProps) {
  // Use initialServings if provided (e.g., from persisted meal plan), otherwise use recipe default
  const [selectedServings, setSelectedServings] = useState(initialServings ?? originalServings);
  // Guard against division by zero
  const scaleFactor = originalServings > 0 ? selectedServings / originalServings : 1;

  // Scale all ingredients
  const scaledIngredients = useMemo(() => {
    return ingredients.map((ing) => {
      const quantityStr = ing.quantity
        ? `${ing.quantity}${ing.unit ? ` ${ing.unit}` : ''}`
        : ing.unit || '';

      let scaledQuantity = quantityStr;
      let originalParsed = null;

      if (quantityStr) {
        try {
          originalParsed = parseQuantity(quantityStr);
          scaledQuantity = scaleQuantity(quantityStr, scaleFactor);
        } catch {
          // If parsing fails, keep original
          scaledQuantity = quantityStr;
        }
      }

      return {
        ...ing,
        originalQuantity: quantityStr,
        scaledQuantity,
        hasChanged: scaleFactor !== 1 && originalParsed !== null,
      };
    });
  }, [ingredients, scaleFactor]);

  // Handle serving size changes
  const handleServingsChange = useCallback((newServings: number) => {
    if (newServings < 1 || newServings > 50) return;

    setSelectedServings(newServings);
    onServingsChange?.(newServings);

    // Record observation for intelligence
    recordAction('portion_size_selected', 'recipe', recipeId, {
      original_servings: originalServings,
      selected_servings: newServings,
      scale_factor: newServings / originalServings,
      recipe_name: recipeName,
    });
  }, [recipeId, originalServings, recipeName, onServingsChange]);

  const increment = () => handleServingsChange(selectedServings + 1);
  const decrement = () => handleServingsChange(selectedServings - 1);

  if (ingredients.length === 0) {
    return (
      <div className="text-sm text-slate-500 italic">
        No ingredients listed
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Portion Size Selector */}
      <div className="flex items-center justify-between bg-slate-800/50 rounded-lg p-3 border border-slate-700">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Users className="w-4 h-4" />
          <span>Servings</span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={decrement}
            disabled={selectedServings <= 1}
            className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            aria-label="Decrease servings"
          >
            <Minus className="w-4 h-4 text-slate-300" />
          </button>

          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold text-white min-w-[2ch] text-center">
              {selectedServings}
            </span>
            {scaleFactor !== 1 && (
              <span className="text-xs text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded">
                {scaleFactor > 1 ? `${scaleFactor.toFixed(1)}×` : `${scaleFactor.toFixed(2)}×`}
              </span>
            )}
          </div>

          <button
            onClick={increment}
            disabled={selectedServings >= 50}
            className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            aria-label="Increase servings"
          >
            <Plus className="w-4 h-4 text-slate-300" />
          </button>
        </div>

        {/* Quick select buttons */}
        <div className="flex gap-1.5">
          {[2, 4, 6, 8].map((num) => (
            <button
              key={num}
              onClick={() => handleServingsChange(num)}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                selectedServings === num
                  ? 'bg-cyan-500 text-white'
                  : 'bg-slate-700 text-slate-400 hover:bg-slate-600 hover:text-white'
              }`}
            >
              {num}
            </button>
          ))}
        </div>
      </div>

      {/* Ingredients List */}
      <ul className="space-y-2">
        {scaledIngredients.map((ing, index) => (
          <li
            key={ing.ingredient_id || index}
            className="flex items-start gap-3 py-2 border-b border-slate-700/50 last:border-0"
          >
            {/* Checkbox placeholder for future shopping list integration */}
            <div className="flex-shrink-0 w-5 h-5 mt-0.5 rounded border border-slate-600 bg-slate-800" />

            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                {/* Scaled quantity */}
                {ing.scaledQuantity && (
                  <span
                    className={`font-medium ${
                      ing.hasChanged ? 'text-cyan-400' : 'text-slate-200'
                    }`}
                  >
                    {ing.scaledQuantity}
                  </span>
                )}

                {/* Ingredient name */}
                <span className="text-slate-300">{ing.ingredient_name}</span>

                {/* Original quantity indicator (when scaled) */}
                {ing.hasChanged && ing.originalQuantity && (
                  <span className="text-xs text-slate-500 line-through">
                    ({ing.originalQuantity})
                  </span>
                )}
              </div>

              {/* Notes */}
              {ing.notes && (
                <p className="text-xs text-slate-500 mt-0.5 italic">{ing.notes}</p>
              )}
            </div>
          </li>
        ))}
      </ul>

      {/* Scaling info */}
      {scaleFactor !== 1 && (
        <div className="text-xs text-slate-500 bg-slate-800/30 rounded px-3 py-2">
          Original recipe serves {originalServings}. Quantities adjusted for {selectedServings} servings.
        </div>
      )}
    </div>
  );
}

/**
 * Compact version for meal plan cards
 */
interface CompactIngredientsProps {
  ingredients: RecipeIngredient[];
  maxVisible?: number;
}

export function CompactIngredients({ ingredients, maxVisible = 4 }: CompactIngredientsProps) {
  const visible = ingredients.slice(0, maxVisible);
  const remaining = ingredients.length - maxVisible;

  return (
    <div className="space-y-1">
      {visible.map((ing, index) => (
        <div key={ing.ingredient_id || index} className="text-xs text-slate-400 truncate">
          {ing.quantity && <span className="text-slate-300">{ing.quantity} </span>}
          {ing.unit && <span className="text-slate-300">{ing.unit} </span>}
          {ing.ingredient_name}
        </div>
      ))}
      {remaining > 0 && (
        <div className="text-xs text-slate-500">+{remaining} more</div>
      )}
    </div>
  );
}
