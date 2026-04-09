/**
 * MealPanel Component
 *
 * Contextual panel for viewing/editing meals.
 * Uses intelligent context detection to show either:
 * - Planning Layout: Recipe selection, standard panel view
 * - Cooking Layout: Fullscreen side-by-side instructions/info
 *
 * Intelligent meal display.
 */

import { useState, useMemo, useEffect } from 'react';
import { useMeal, useCreateMeal, useUpdateMeal, mealKeys } from '@/hooks/useMeals';
import { mealsApi } from '@/api/client';
import { useRecipes } from '@/hooks/useRecipes';
import { useMealContext } from '@/hooks/useMealContext';
import { PanelSkeleton } from '@/components/shared/PanelSkeleton';
import { PlanningLayout } from './PlanningLayout';
import { useUndoDelete } from '@/hooks/useUndoDelete';
import { useToastStore } from '@/stores/toastStore';
import type { MealPanelProps } from './types';
import type { MealPlanCreate, MealPlanEntry, Recipe } from '@/types';

export function MealPanel({ mealId, date, mealType, onClose, onEnterCookingMode }: MealPanelProps) {
  const { data: meal, isLoading: mealLoading } = useMeal(mealId || 0);
  const { data: recipes = [], isLoading: recipesLoading } = useRecipes();
  const createMeal = useCreateMeal();
  const updateMeal = useUpdateMeal();

  const isNew = mealId === null;

  const addToast = useToastStore((s) => s.addToast);

  // Undo-delete for meals
  const { requestDelete } = useUndoDelete<MealPlanEntry>({
    entityLabel: 'meal',
    getItemName: (m) => m.description || m.meal_type,
    getItemId: (m) => m.id,
    listQueryKeys: [mealKeys.lists(), [...mealKeys.all, 'week']],
    deleteFn: (id) => mealsApi.delete(id),
    invalidateKeys: [mealKeys.all],
  });

  // Form state
  const [selectedRecipeId, setSelectedRecipeId] = useState<number | null>(null);
  const [description, setDescription] = useState('');


  // Initialize form with existing meal data
  useEffect(() => {
    if (meal) {
      setSelectedRecipeId(meal.recipe_id);
      setDescription(meal.description || '');
    }
  }, [meal]);

  // Get selected recipe
  const selectedRecipe = useMemo(() => {
    return recipes.find((r) => r.id === selectedRecipeId) || null;
  }, [recipes, selectedRecipeId]);

  // Get meal context for intelligent display mode
  const mealContext = useMealContext(
    mealType!,
    date!,
    !!selectedRecipe
  );

  // Handle submit
  const handleSubmit = async () => {
    if (!date || !mealType) return;

    const data: MealPlanCreate = {
      date,
      meal_type: mealType,
      recipe_id: selectedRecipeId,
      description: description || null,
    };

    try {
      if (isNew) {
        await createMeal.mutateAsync(data);
      } else if (mealId) {
        await updateMeal.mutateAsync({
          id: mealId,
          data: { recipe_id: selectedRecipeId, description: description || null },
        });
      }
      addToast({ message: 'Meal saved successfully', type: 'success', durationMs: 4000 });
      setTimeout(() => onClose(), 500);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown error';
      addToast({ message: `Failed to save meal: ${detail}`, type: 'error', durationMs: 4000 });
    }
  };

  // Handle delete — undo toast pattern
  const handleDelete = () => {
    if (!mealId || !meal) return;
    requestDelete(meal);
    onClose();
  };

  // Handle recipe selection
  const handleRecipeSelect = (recipe: Recipe) => {
    setSelectedRecipeId(recipe.id);
    setDescription(recipe.name);
  };

  // Handle description change (clears recipe selection)
  const handleDescriptionChange = (newDescription: string) => {
    setDescription(newDescription);
    if (newDescription.trim()) {
      setSelectedRecipeId(null); // Clear recipe when typing custom
    }
  };

  // Handle "Start Cooking" button - enters fullscreen cooking mode
  // Pass meal slot context for auto-assignment when cooking completes
  const handleStartCooking = () => {
    if (selectedRecipe && onEnterCookingMode && date && mealType) {
      onEnterCookingMode(selectedRecipe.id, meal?.id || null, { date, mealType });
    }
  };

  // Auto-enter cooking mode if context suggests it (e.g., dinner time)
  useEffect(() => {
    if (
      selectedRecipe &&
      onEnterCookingMode &&
      mealContext.displayMode === 'cooking' &&
      date &&
      mealType
    ) {
      onEnterCookingMode(selectedRecipe.id, meal?.id || null, { date, mealType });
    }
  }, [selectedRecipe, mealContext.displayMode, onEnterCookingMode, meal?.id, date, mealType]);

  // Loading state
  if ((mealLoading && !isNew) || recipesLoading) {
    return <PanelSkeleton />;
  }

  // Ensure required props exist
  if (!date || !mealType) {
    return (
      <div className="p-6 text-center text-slate-400">
        Missing meal information
      </div>
    );
  }

  // Always render planning layout - cooking mode is handled at WeekView level
  return (
    <>
      <PlanningLayout
        meal={meal || null}
        date={date}
        mealType={mealType}
        isNew={isNew}
        selectedRecipeId={selectedRecipeId}
        description={description}
        onRecipeSelect={handleRecipeSelect}
        onDescriptionChange={handleDescriptionChange}
        onSubmit={handleSubmit}
        onDelete={handleDelete}
        onClose={onClose}
        onStartCooking={selectedRecipe ? handleStartCooking : undefined}
        isSubmitting={createMeal.isPending || updateMeal.isPending}
      />
    </>
  );
}
