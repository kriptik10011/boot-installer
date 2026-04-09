/**
 * RecipePanel Component - The Recipe Hub
 *
 * A comprehensive recipe management panel with:
 * - Browse all recipes with category filtering
 * - Import recipes from URLs
 * - Create new recipes manually
 * - View recipe details with portion scaling
 * - Add recipes to meal plans
 * - Tag-based organization with intelligence
 *
 * Intelligence Integration:
 * - OBSERVE: Track recipe views, imports, favorites
 * - INFER: Learn cuisine preferences, complexity tolerance
 * - DECIDE: Suggest recipes based on patterns
 * - SURFACE: "Based on your history..." recommendations
 * - ADAPT: Learn from recipe dismissals
 */

import { useState, useMemo, useCallback } from 'react';
import { useRecipes, useCreateRecipe, useDeleteRecipe, useUpdateRecipe } from '@/hooks/useRecipes';
import { useRecipeCategories } from '@/hooks/useCategories';
import { useRecipeIntelligence } from '@/hooks/useRecipeIntelligence';
import { useCreateMeal } from '@/hooks/useMeals';
import { PanelSkeleton } from '@/components/shared/PanelSkeleton';
import { RecipeImportForm } from '../recipes/RecipeImportForm';
import { RecipeImportPreview } from '../recipes/RecipeImportPreview';
import { RecipeDetail } from '../recipes/RecipeDetail';
import { AddToMealPlanModal } from '../recipes/AddToMealPlanModal';
import { CreateRecipeForm } from '../recipes/CreateRecipeForm';
import { ConfirmationModal } from '../shared/ConfirmationModal';
import { CompactTags } from '../recipes/RecipeTags';
import { PostCreateTagStep } from '../recipes/PostCreateTagStep';
import { recordAction } from '@/services/observation';
import type { Recipe, RecipeCreate, MealType } from '@/types';
import type { ExtractedRecipe } from '@/api/client';

// View states for the panel
type RecipeHubView =
  | 'browse'        // Default - browse recipes
  | 'import-url'    // Import from URL
  | 'import-preview' // Preview imported recipe
  | 'create'        // Create new recipe
  | 'create-tags'   // Tag step after create
  | 'edit'          // Edit existing recipe
  | 'detail';       // View recipe detail

interface RecipePanelProps {
  onClose: () => void;
  onSelectForMeal?: (recipe: Recipe) => void;
  initialRecipeId?: number;
}

export function RecipePanel({ onClose, onSelectForMeal, initialRecipeId }: RecipePanelProps) {
  const { data: recipes = [], isLoading } = useRecipes();
  const { data: categories = [] } = useRecipeCategories();
  const createRecipe = useCreateRecipe();
  const updateRecipe = useUpdateRecipe();
  const deleteRecipe = useDeleteRecipe();
  const createMeal = useCreateMeal();
  const { suggestedRecipes, recordRecipeView } = useRecipeIntelligence(recipes);

  // View state
  const [view, setView] = useState<RecipeHubView>(initialRecipeId ? 'detail' : 'browse');
  const [selectedRecipeId, setSelectedRecipeId] = useState<number | null>(initialRecipeId || null);
  const [importedRecipe, setImportedRecipe] = useState<ExtractedRecipe | null>(null);

  // Modal state
  const [addingToMealPlan, setAddingToMealPlan] = useState<Recipe | null>(null);
  const [addingServings, setAddingServings] = useState<number | null>(null);
  const [deletingRecipe, setDeletingRecipe] = useState<Recipe | null>(null);

  // Post-create tag step
  const [newlyCreatedRecipe, setNewlyCreatedRecipe] = useState<{ id: number; name: string } | null>(null);

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);

  // Create form state
  const [createFormData, setCreateFormData] = useState<RecipeCreate>({
    name: '',
    instructions: '',
    category_id: null,
    prep_time_minutes: null,
    cook_time_minutes: null,
    servings: null,
    source: null,
    notes: null,
  });

  // Edit form state
  const [editFormData, setEditFormData] = useState<RecipeCreate>({
    name: '',
    instructions: '',
    category_id: null,
    prep_time_minutes: null,
    cook_time_minutes: null,
    servings: null,
    source: null,
    notes: null,
  });

  // Get selected recipe
  const selectedRecipe = useMemo(() => {
    if (!selectedRecipeId) return null;
    return recipes.find(r => r.id === selectedRecipeId) || null;
  }, [recipes, selectedRecipeId]);

  // Get category for selected recipe
  const selectedCategory2 = useMemo(() => {
    if (!selectedRecipe?.category_id) return undefined;
    return categories.find(c => c.id === selectedRecipe.category_id);
  }, [selectedRecipe, categories]);

  // Filter recipes
  const filteredRecipes = useMemo(() => {
    return recipes.filter(recipe => {
      const matchesSearch = !searchQuery ||
        recipe.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === null ||
        recipe.category_id === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [recipes, searchQuery, selectedCategory]);

  // Group recipes by category
  const recipesByCategory = useMemo(() => {
    const groups: Record<string, Recipe[]> = { 'Uncategorized': [] };

    for (const cat of categories) {
      groups[cat.name] = [];
    }

    for (const recipe of filteredRecipes) {
      const category = categories.find(c => c.id === recipe.category_id);
      const groupName = category?.name || 'Uncategorized';
      if (!groups[groupName]) groups[groupName] = [];
      groups[groupName].push(recipe);
    }

    return Object.fromEntries(
      Object.entries(groups).filter(([_, recipes]) => recipes.length > 0)
    );
  }, [filteredRecipes, categories]);

  // Handlers
  const handleViewRecipe = useCallback((recipe: Recipe) => {
    setSelectedRecipeId(recipe.id);
    setView('detail');
    recordRecipeView(recipe.id);

    recordAction('recipe_viewed', 'recipe', recipe.id, {
      category_id: recipe.category_id,
      has_servings: !!recipe.servings,
      has_times: !!(recipe.prep_time_minutes || recipe.cook_time_minutes),
    });
  }, [recordRecipeView]);

  const handleSelectForMeal = useCallback((recipe: Recipe) => {
    if (onSelectForMeal) {
      onSelectForMeal(recipe);
      onClose();
    }
  }, [onSelectForMeal, onClose]);

  const handleImportPreviewReady = useCallback((recipe: ExtractedRecipe) => {
    setImportedRecipe(recipe);
    setView('import-preview');

    recordAction('recipe_import_started', 'recipe', undefined, {
      source_url: recipe.source_url,
      extraction_method: recipe.extraction_method,
      confidence: recipe.confidence,
      ingredient_count: recipe.ingredients.length,
    });
  }, []);

  const handleImportSuccess = useCallback(() => {
    if (importedRecipe) {
      recordAction('recipe_imported', 'recipe', undefined, {
        source_url: importedRecipe.source_url,
        extraction_method: importedRecipe.extraction_method,
        confidence: importedRecipe.confidence,
        ingredient_count: importedRecipe.ingredients.length,
      });
    }

    setImportedRecipe(null);
    setView('browse');
  }, [importedRecipe]);

  // Open delete confirmation modal
  const handleDeleteRecipe = useCallback((recipe: Recipe) => {
    setDeletingRecipe(recipe);
  }, []);

  // Confirm delete
  const handleConfirmDelete = useCallback(async () => {
    if (!deletingRecipe) return;
    try {
      await deleteRecipe.mutateAsync(deletingRecipe.id);
      setDeletingRecipe(null);
      setView('browse');
      setSelectedRecipeId(null);
    } catch (error) {
    }
  }, [deleteRecipe, deletingRecipe]);

  // Open edit view
  const handleEditRecipe = useCallback((recipe: Recipe) => {
    setEditFormData({
      name: recipe.name,
      instructions: recipe.instructions,
      category_id: recipe.category_id,
      prep_time_minutes: recipe.prep_time_minutes,
      cook_time_minutes: recipe.cook_time_minutes,
      servings: recipe.servings,
      source: recipe.source,
      notes: recipe.notes,
    });
    setView('edit');
  }, []);

  // Save edited recipe
  const handleSaveEdit = useCallback(async () => {
    if (!selectedRecipeId || !editFormData.name.trim() || !editFormData.instructions.trim()) return;

    try {
      await updateRecipe.mutateAsync({
        id: selectedRecipeId,
        data: editFormData,
      });
      setView('detail');
    } catch (error) {
    }
  }, [updateRecipe, selectedRecipeId, editFormData]);

  // Open Add to Meal Plan modal
  const handleOpenAddToMealPlan = useCallback((recipe: Recipe, servings: number | null = null) => {
    setAddingToMealPlan(recipe);
    setAddingServings(servings);
  }, []);

  // Confirm Add to Meal Plan
  const handleConfirmAddToMealPlan = useCallback(async (date: string, mealType: MealType, servings: number) => {
    if (!addingToMealPlan) return;

    try {
      await createMeal.mutateAsync({
        date,
        meal_type: mealType,
        recipe_id: addingToMealPlan.id,
        description: null,
        planned_servings: servings,
      });

      recordAction('recipe_added_to_meal', 'recipe', addingToMealPlan.id, {
        date,
        meal_type: mealType,
        servings,
      });

      setAddingToMealPlan(null);
      setAddingServings(null);
    } catch (error) {
    }
  }, [createMeal, addingToMealPlan]);

  const handleCreateRecipe = useCallback(async () => {
    if (!createFormData.name.trim() || !createFormData.instructions.trim()) return;

    try {
      const created = await createRecipe.mutateAsync(createFormData);
      setCreateFormData({
        name: '',
        instructions: '',
        category_id: null,
        prep_time_minutes: null,
        cook_time_minutes: null,
        servings: null,
        source: null,
        notes: null,
      });
      setNewlyCreatedRecipe({ id: created.id, name: created.name });
      setView('create-tags');
    } catch (error) {
    }
  }, [createRecipe, createFormData]);

  if (isLoading) {
    return <PanelSkeleton />;
  }

  return (
    <div className="flex flex-col h-full">
      {/* View: Browse Recipes */}
      {view === 'browse' && (
        <>
          <div className="px-6 py-4 border-b border-slate-700 space-y-4">
            <div className="flex gap-2">
              <button
                onClick={() => setView('import-url')}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white font-medium rounded-lg transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                Import from URL
              </button>
              <button
                onClick={() => setView('create')}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New Recipe
              </button>
            </div>

            <div className="relative">
              <input
                type="text"
                placeholder="Search recipes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500"
              />
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>

            <div className="flex gap-2 flex-wrap pb-2">
              <button
                onClick={() => setSelectedCategory(null)}
                className={`px-3 py-1 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                  selectedCategory === null
                    ? 'bg-cyan-500 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                All ({recipes.length})
              </button>
              {categories.map((cat) => {
                const count = recipes.filter(r => r.category_id === cat.id).length;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`px-3 py-1 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                      selectedCategory === cat.id
                        ? 'bg-cyan-500 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {cat.name} ({count})
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
            {/* Intelligence suggestions - Selection Pattern: 3 contextual cards, no scrolling */}
            {suggestedRecipes.length > 0 && !searchQuery && selectedCategory === null && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-slate-400">For tonight</h3>
                <div className="grid grid-cols-3 gap-3">
                  {suggestedRecipes.slice(0, 3).map((recipe, index) => {
                    // Glass Box: Show WHY each recipe is suggested
                    const totalTime = (recipe.prep_time_minutes || 0) + (recipe.cook_time_minutes || 0);
                    const reason = index === 0
                      ? 'Quick option'
                      : index === 1
                        ? totalTime > 0 ? `${totalTime} min total` : 'One of your favorites'
                        : 'Popular choice';

                    return (
                      <button
                        key={recipe.id}
                        onClick={() => handleViewRecipe(recipe)}
                        className="p-3 bg-slate-800/50 border border-slate-700 rounded-lg text-left hover:border-slate-600 transition-colors"
                      >
                        <div className="font-medium text-slate-200 text-sm truncate">
                          {recipe.name}
                        </div>
                        {totalTime > 0 && (
                          <div className="text-xs text-slate-500 mt-1">
                            {totalTime} min
                          </div>
                        )}
                        {/* Glass Box: WHY this suggestion */}
                        <div className="text-xs text-cyan-400/70 mt-2">
                          {reason}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {Object.keys(recipesByCategory).length > 0 ? (
              Object.entries(recipesByCategory).map(([categoryName, categoryRecipes]) => (
                <div key={categoryName} className="space-y-2">
                  <h3 className="text-sm font-medium text-slate-400">{categoryName}</h3>
                  <div className="grid gap-2">
                    {categoryRecipes.map((recipe) => (
                      <RecipeListItem
                        key={recipe.id}
                        recipe={recipe}
                        onClick={() => handleViewRecipe(recipe)}
                        onSelectForMeal={onSelectForMeal ? () => handleSelectForMeal(recipe) : undefined}
                      />
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <EmptyState onAddRecipe={() => setView('create')} onImport={() => setView('import-url')} />
            )}
          </div>
        </>
      )}

      {/* View: Import from URL */}
      {view === 'import-url' && (
        <div className="px-6 py-4">
          <BackButton onClick={() => setView('browse')} label="Back to Recipes" />
          <h3 className="text-lg font-semibold text-white mb-4">Import from URL</h3>
          <RecipeImportForm
            onPreviewReady={handleImportPreviewReady}
            onCancel={() => setView('browse')}
          />
        </div>
      )}

      {/* View: Import Preview */}
      {view === 'import-preview' && importedRecipe && (
        <div className="px-6 py-4">
          <BackButton onClick={() => setView('import-url')} label="Back" />
          <h3 className="text-lg font-semibold text-white mb-4">Review & Save</h3>
          <RecipeImportPreview
            recipe={importedRecipe}
            onSuccess={handleImportSuccess}
            onBack={() => setView('import-url')}
          />
        </div>
      )}

      {/* View: Create New Recipe */}
      {view === 'create' && (
        <div className="flex flex-col h-full">
          <div className="px-6 py-4 border-b border-slate-700">
            <BackButton onClick={() => setView('browse')} label="Back to Recipes" />
            <h3 className="text-lg font-semibold text-white">New Recipe</h3>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <CreateRecipeForm
              formData={createFormData}
              categories={categories}
              onChange={setCreateFormData}
              onSubmit={handleCreateRecipe}
              isSubmitting={createRecipe.isPending}
            />
          </div>
        </div>
      )}

      {/* View: Tag step after create */}
      {view === 'create-tags' && newlyCreatedRecipe && (
        <div className="flex flex-col h-full">
          <div className="px-6 py-4 border-b border-slate-700">
            <h3 className="text-lg font-semibold text-white">Add Tags</h3>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <PostCreateTagStep
              recipeId={newlyCreatedRecipe.id}
              recipeName={newlyCreatedRecipe.name}
              onDone={() => {
                setNewlyCreatedRecipe(null);
                setView('browse');
              }}
            />
          </div>
        </div>
      )}

      {/* View: Edit Recipe */}
      {view === 'edit' && selectedRecipe && (
        <div className="flex flex-col h-full">
          <div className="px-6 py-4 border-b border-slate-700">
            <BackButton onClick={() => setView('detail')} label="Back to Recipe" />
            <h3 className="text-lg font-semibold text-white">Edit Recipe</h3>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <CreateRecipeForm
              formData={editFormData}
              categories={categories}
              onChange={setEditFormData}
              onSubmit={handleSaveEdit}
              isSubmitting={updateRecipe.isPending}
              submitLabel="Save Changes"
            />
          </div>
        </div>
      )}

      {/* View: Recipe Detail */}
      {view === 'detail' && selectedRecipe && (
        <div className="flex flex-col h-full">
          <div className="px-6 py-4 border-b border-slate-700">
            <BackButton
              onClick={() => {
                setView('browse');
                setSelectedRecipeId(null);
              }}
              label="Back to Recipes"
            />
          </div>
          <div className="flex-1 min-h-0">
            <RecipeDetail
              recipe={selectedRecipe}
              category={selectedCategory2}
              onEdit={() => handleEditRecipe(selectedRecipe)}
              onDelete={() => handleDeleteRecipe(selectedRecipe)}
              onAddToMealPlan={onSelectForMeal
                ? () => handleSelectForMeal(selectedRecipe)
                : (servings) => handleOpenAddToMealPlan(selectedRecipe, servings)}
              onClose={onClose}
            />
          </div>
        </div>
      )}

      {/* Add to Meal Plan Modal */}
      <AddToMealPlanModal
        isOpen={!!addingToMealPlan}
        recipeName={addingToMealPlan?.name ?? ''}
        initialServings={addingServings}
        defaultServings={addingToMealPlan?.servings ?? 4}
        onConfirm={handleConfirmAddToMealPlan}
        onCancel={() => { setAddingToMealPlan(null); setAddingServings(null); }}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={!!deletingRecipe}
        title="Delete Recipe"
        message={`Are you sure you want to delete "${deletingRecipe?.name ?? ''}"? Any meal plan entries using this recipe will be unlinked.`}
        confirmLabel="Delete"
        confirmVariant="warning"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeletingRecipe(null)}
        warningNote="This action cannot be undone."
      />
    </div>
  );
}

// Back button component
function BackButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 text-slate-400 hover:text-white mb-4"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
      </svg>
      {label}
    </button>
  );
}

// Recipe list item
function RecipeListItem({
  recipe,
  onClick,
  onSelectForMeal,
}: {
  recipe: Recipe;
  onClick: () => void;
  onSelectForMeal?: () => void;
}) {
  const totalTime = (recipe.prep_time_minutes || 0) + (recipe.cook_time_minutes || 0);

  return (
    <div
      className="flex items-center justify-between p-3 bg-slate-700/50 hover:bg-slate-700 rounded-lg cursor-pointer transition-colors group"
      onClick={onClick}
    >
      <div className="min-w-0 flex-1">
        <h4 className="text-white font-medium truncate">{recipe.name}</h4>
        {recipe.tags && recipe.tags.length > 0 && (
          <div className="mt-1">
            <CompactTags tags={recipe.tags} maxVisible={3} />
          </div>
        )}
        <div className="flex items-center gap-3 text-sm text-slate-400 mt-1">
          {totalTime > 0 && (
            <span className="flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {totalTime} min
            </span>
          )}
          {recipe.servings && (
            <span className="flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              {recipe.servings}
            </span>
          )}
        </div>
      </div>

      {onSelectForMeal && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSelectForMeal();
          }}
          className="opacity-0 group-hover:opacity-100 px-3 py-1.5 bg-cyan-500 hover:bg-cyan-600 text-white text-sm font-medium rounded transition-all"
        >
          Add to Meal
        </button>
      )}
    </div>
  );
}


// Empty state
function EmptyState({ onAddRecipe, onImport }: { onAddRecipe: () => void; onImport: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-full bg-slate-700 flex items-center justify-center mb-4">
        <svg className="w-8 h-8 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      </div>
      <h3 className="text-lg font-medium text-white mb-2">No Recipes Yet</h3>
      <p className="text-slate-400 text-sm mb-6 max-w-xs">
        Import recipes from your favorite websites or create your own collection.
      </p>
      <div className="flex gap-3">
        <button
          onClick={onImport}
          className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white font-medium rounded-lg transition-colors"
        >
          Import from URL
        </button>
        <button
          onClick={onAddRecipe}
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition-colors"
        >
          Create Manually
        </button>
      </div>
    </div>
  );
}
