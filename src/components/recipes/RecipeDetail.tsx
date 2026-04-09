import { useState } from 'react';
import { Clock, Users, Tag, Link, FileText, Edit2, Trash2, Plus } from 'lucide-react';
import { RecipeTags } from './RecipeTags';
import { ScaledIngredientList } from './ScaledIngredientList';
import { useRecipe } from '@/hooks/useRecipes';
import type { RecipeDetailProps } from './types';

export function RecipeDetail({
  recipe,
  category,
  onEdit,
  onDelete,
  onAddToMealPlan,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onClose,
}: RecipeDetailProps) {
  // Fetch full recipe with ingredients
  const { data: fullRecipe } = useRecipe(recipe.id);
  const recipeWithIngredients = fullRecipe || recipe;

  // Track selected servings for "Add to Meal Plan" action
  const [selectedServings, setSelectedServings] = useState<number | null>(null);

  const totalTime = (recipe.prep_time_minutes || 0) + (recipe.cook_time_minutes || 0);

  const formatTime = (minutes: number | null): string => {
    if (!minutes) return '';
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    }
    return `${minutes} min`;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-800">
        <h2 className="font-['Space_Grotesk'] text-xl font-semibold text-slate-100">
          {recipe.name}
        </h2>
        {category && (
          <div className="flex items-center gap-2 mt-2">
            <Tag className="w-4 h-4 text-slate-400" />
            <span className="text-sm text-slate-400">{category.name}</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Meta info */}
        <div className="flex items-center gap-6">
          {totalTime > 0 && (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Clock className="w-4 h-4" />
              <span>
                {recipe.prep_time_minutes && `${formatTime(recipe.prep_time_minutes)} prep`}
                {recipe.prep_time_minutes && recipe.cook_time_minutes && ' · '}
                {recipe.cook_time_minutes && `${formatTime(recipe.cook_time_minutes)} cook`}
              </span>
            </div>
          )}
          {recipe.servings && (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Users className="w-4 h-4" />
              <span>Serves {recipe.servings}</span>
            </div>
          )}
        </div>

        {/* Tags */}
        <div>
          <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wide mb-3">
            Tags
          </h3>
          <RecipeTags recipeId={recipe.id} editable={true} />
        </div>

        {/* Ingredients with Portion Scaling */}
        {recipeWithIngredients.ingredients && recipeWithIngredients.ingredients.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wide mb-3">
              Ingredients
            </h3>
            <ScaledIngredientList
              ingredients={recipeWithIngredients.ingredients}
              originalServings={recipe.servings || 4}
              recipeId={recipe.id}
              recipeName={recipe.name}
              onServingsChange={setSelectedServings}
            />
          </div>
        )}

        {/* Instructions */}
        <div>
          <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wide mb-3">
            Instructions
          </h3>
          <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
            <pre className="text-sm text-slate-300 whitespace-pre-wrap font-sans leading-relaxed">
              {recipe.instructions}
            </pre>
          </div>
        </div>

        {/* Source */}
        {recipe.source && (
          <div>
            <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wide mb-2">
              Source
            </h3>
            <div className="flex items-center gap-2">
              <Link className="w-4 h-4 text-slate-400" />
              {recipe.source.startsWith('http') ? (
                <a
                  href={recipe.source}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
                >
                  {recipe.source}
                </a>
              ) : (
                <span className="text-sm text-slate-300">{recipe.source}</span>
              )}
            </div>
          </div>
        )}

        {/* Notes */}
        {recipe.notes && (
          <div>
            <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wide mb-2">
              Notes
            </h3>
            <div className="flex items-start gap-2">
              <FileText className="w-4 h-4 text-slate-400 mt-0.5" />
              <p className="text-sm text-slate-400 italic whitespace-pre-wrap">
                {recipe.notes}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-6 py-4 border-t border-slate-800 flex gap-3">
        <button
          onClick={() => onAddToMealPlan(selectedServings)}
          className="
            flex-1 flex items-center justify-center gap-2
            px-4 py-2.5 rounded-lg
            bg-cyan-500/10 hover:bg-cyan-500/20
            text-sm font-medium text-cyan-400
            border border-cyan-500/20
            transition-colors
            focus:outline-none focus:ring-2 focus:ring-cyan-500
          "
        >
          <Plus className="w-4 h-4" />
          <span>Add to Meal Plan</span>
        </button>
        <button
          onClick={onEdit}
          className="
            flex items-center justify-center gap-2
            px-4 py-2.5 rounded-lg
            bg-slate-800 hover:bg-slate-700
            text-sm font-medium text-slate-200
            transition-colors
            focus:outline-none focus:ring-2 focus:ring-cyan-500
          "
        >
          <Edit2 className="w-4 h-4" />
          <span>Edit</span>
        </button>
        <button
          onClick={onDelete}
          className="
            flex items-center justify-center gap-2
            px-4 py-2.5 rounded-lg
            bg-amber-500/10 hover:bg-amber-500/20
            text-sm font-medium text-amber-400
            border border-amber-500/20
            transition-colors
            focus:outline-none focus:ring-2 focus:ring-amber-500
          "
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
