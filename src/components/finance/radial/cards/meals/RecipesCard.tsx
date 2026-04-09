/**
 * RecipesCard — Meals sub-arc "RECIPES" preview card.
 *
 * Rectangular: Recipe count, quick recipes, complexity breakdown.
 * Circular: 5 primary category circles (B/L/D/Snacks/Desserts)
 *           with glow effects, clickable → RecipeListOverlay popup.
 */

import { useState, useMemo, useCallback } from 'react';
import { useRecipes, useRecipeCategories, useCreateRecipeCategory, useCreateMeal, useCreateRecipe } from '@/hooks';
import { useRecipeIntelligence } from '@/hooks/useRecipeIntelligence';
import { useRecipeFavorites } from '@/hooks/useRecipeInsights';
import { useToastStore } from '@/stores/toastStore';
import { useAppStore } from '@/stores/appStore';
import { CARD_SIZES, CIRCULAR_ROOT_STYLE, FONT_FAMILY, SUB_ARC_ACCENTS, TEXT_COLORS } from '../../cardTemplate';
import { CircularCardLayout, HeroMetric, FormField, ScrollZone, PillList, ButtonGroup, WheelPicker } from '../../shapes';
import type { PillListItem, WheelColumn } from '../../shapes';
import { ActionBar } from '../../shapes/ActionBar';
import { useTagsManagement } from './useTagsManagement';
import { CUISINE_TYPES } from '@/constants/cuisines';
import type { MealType, RecipeCreate } from '@/types';

// =============================================================================
// PRIMARY CATEGORIES
// =============================================================================

const PRIMARY_CATEGORIES = [
  { name: 'breakfast', label: 'Breakfast', tier: 'major' as const, x: 35, y: 32 },
  { name: 'lunch',     label: 'Lunch',     tier: 'major' as const, x: 30, y: 50 },
  { name: 'dinner',    label: 'Dinner',    tier: 'major' as const, x: 42, y: 68 },
  { name: 'snacks',    label: 'Snacks',    tier: 'minor' as const, x: 68, y: 36 },
  { name: 'desserts',  label: 'Desserts',  tier: 'minor' as const, x: 65, y: 58 },
] as const;

const MAJOR_GLOW = {
  boxShadow: '0 0 16px rgba(52, 211, 153, 0.3), 0 0 4px rgba(52, 211, 153, 0.6), inset 0 0 10px rgba(52, 211, 153, 0.08)',
  border: '2px solid rgba(52, 211, 153, 0.45)',
};

const MINOR_GLOW = {
  boxShadow: '0 0 14px rgba(251, 191, 36, 0.25), 0 0 4px rgba(251, 191, 36, 0.5), inset 0 0 8px rgba(251, 191, 36, 0.06)',
  border: '2px solid rgba(251, 191, 36, 0.4)',
};

// =============================================================================
// SECONDARY CATEGORIES (non-primary, shown as smaller muted pills)
// =============================================================================

// Singular forms that duplicate a primary category (e.g. "Dessert" vs "Desserts")
const PRIMARY_ALIASES = new Set(['dessert']);

// Named positions — placed logically relative to meal flow
const SECONDARY_LAYOUT: Record<string, { x: number; y: number }> = {
  'appetizer':  { x: 24, y: 62 },   // between Lunch & Dinner, before dinner
  'side dish':  { x: 50, y: 40 },   // center-right, above Soup
  'soup':       { x: 44, y: 56 },   // left-of-center, vertically below Side Dish
  'salad':      { x: 18, y: 42 },   // left side near Lunch — light/fresh
};

// Fallback positions for categories not in the named map
const FALLBACK_POSITIONS = [
  { x: 76, y: 48 },
  { x: 56, y: 28 },
  { x: 76, y: 70 },
  { x: 22, y: 76 },
];

const SECONDARY_PALETTE = [
  '#7b8fad',
  '#7d9a8c',
  '#9b8eb7',
  '#8ca39a',
  '#a3917c',
  '#7ca3a8',
  '#8b8ca3',
  '#8c9a7d',
];

// =============================================================================
// MAIN COMPONENT
// =============================================================================

const ACCENT = SUB_ARC_ACCENTS.meals;

const EMPTY_RECIPE: RecipeCreate = {
  name: '', instructions: '', category_id: null, prep_time_minutes: null,
  cook_time_minutes: null, servings: null, source: null, notes: null, cuisine_type: null,
};

const inputStyle = {
  width: '100%', padding: '0.6cqi 1cqi', fontSize: '1.7cqi', color: '#e2e8f0',
  backgroundColor: 'rgba(51, 65, 85, 0.4)', border: '1px solid rgba(71, 85, 105, 0.5)',
  borderRadius: '1cqi', outline: 'none', fontFamily: FONT_FAMILY,
} as const;

const labelStyle = {
  fontSize: '1.4cqi', color: TEXT_COLORS.secondary, fontFamily: FONT_FAMILY,
  marginBottom: '0.2cqi', display: 'block' as const,
} as const;

type CardView = 'default' | 'tags' | 'recipes' | 'schedule' | 'create';

export function RecipesCard() {
  const { data: recipes = [] } = useRecipes();
  const { data: categories = [] } = useRecipeCategories();
  const intelligence = useRecipeIntelligence(recipes);
  const tags = useTagsManagement();

  const createCategory = useCreateRecipeCategory();
  const createRecipe = useCreateRecipe();
  const addToast = useToastStore((s) => s.addToast);

  // Interactive state
  const [cardView, setCardView] = useState<CardView>('default');
  const [activeCategory, setActiveCategory] = useState<{ id: number; name: string } | null>(null);

  // Create recipe form state
  const [createForm, setCreateForm] = useState<RecipeCreate>(EMPTY_RECIPE);

  // Recipe list browse state
  const [recipeSearch, setRecipeSearch] = useState('');
  const [recipeTagFilter, setRecipeTagFilter] = useState<Set<number>>(new Set());

  // Schedule state (WheelPicker — replaces SuggestionCalendarModal)
  const [scheduleRecipe, setScheduleRecipe] = useState<{ id: number; name: string } | null>(null);
  const [scheduleMonthIdx, setScheduleMonthIdx] = useState(() => new Date().getMonth());
  const [scheduleDayIdx, setScheduleDayIdx] = useState(() => new Date().getDate() - 1);
  const [scheduleMealType, setScheduleMealType] = useState<MealType>('dinner');
  const createMeal = useCreateMeal();
  const schedulingContext = useAppStore((s) => s.lastMealSchedulingContext);
  const setSchedulingContext = useAppStore((s) => s.setMealSchedulingContext);

  const totalRecipes = recipes.length;
  const suggestedRecipe = intelligence.suggestedRecipes[0] ?? null;

  const complexityBreakdown = useMemo(() => ({
    quick: intelligence.complexityScores.filter((c) => c.complexityLabel === 'Quick').length,
    medium: intelligence.complexityScores.filter((c) => c.complexityLabel === 'Medium').length,
    involved: intelligence.complexityScores.filter((c) => c.complexityLabel === 'Involved').length,
  }), [intelligence.complexityScores]);

  // Match PRIMARY_CATEGORIES to actual RecipeCategory records (case-insensitive)
  const primaryCircles = useMemo(() => {
    const uncategorizedCount = recipes.filter((r) => r.category_id == null).length;
    return PRIMARY_CATEGORIES.map((pc) => {
      const match = categories.find(
        (c) => c.name.toLowerCase() === pc.name.toLowerCase(),
      );
      return {
        ...pc,
        categoryId: match?.id ?? null,
        recipeCount: match
          ? recipes.filter((r) => r.category_id === match.id).length + uncategorizedCount
          : uncategorizedCount,
      };
    });
  }, [categories, recipes]);

  // Secondary categories = any DB category not matching primary names or aliases
  const secondaryCircles = useMemo(() => {
    const primaryNames = new Set(PRIMARY_CATEGORIES.map((pc) => pc.name.toLowerCase()));
    const filtered = categories.filter((c) => {
      const lower = c.name.toLowerCase();
      return !primaryNames.has(lower) && !PRIMARY_ALIASES.has(lower);
    });
    let fallbackIdx = 0;
    return filtered.map((cat, i) => {
      const lower = cat.name.toLowerCase();
      let pos = SECONDARY_LAYOUT[lower];
      if (!pos) {
        pos = FALLBACK_POSITIONS[fallbackIdx % FALLBACK_POSITIONS.length];
        fallbackIdx++;
      }
      return {
        categoryId: cat.id,
        label: cat.name,
        recipeCount: recipes.filter((r) => r.category_id === cat.id).length,
        x: pos.x,
        y: pos.y,
        color: SECONDARY_PALETTE[i % SECONDARY_PALETTE.length],
      };
    });
  }, [categories, recipes]);

  const featured = useMemo(() => {
    const recipe = intelligence.suggestedRecipes[0];
    if (!recipe) return null;
    const totalTime = (recipe.prep_time_minutes ?? 0) + (recipe.cook_time_minutes ?? 0);
    const complexity = intelligence.complexityScores.find((c) => c.recipeId === recipe.id);
    const fav = intelligence.favorites.find((f) => f.recipe.id === recipe.id);
    return {
      name: recipe.name,
      totalTime,
      complexityLabel: complexity?.complexityLabel ?? 'Quick',
      cookCount: fav?.cookCount ?? 0,
    };
  }, [intelligence.suggestedRecipes, intelligence.complexityScores, intelligence.favorites]);

  // ─── Tags (via extracted hook) ──────────────────────────────────────────

  const handleTagsBack = useCallback(() => {
    setCardView('default');
    tags.resetTags();
  }, [tags]);

  // ─── Schedule opener (must be before browseSections which captures it) ────

  const inferMealType = useCallback((categoryName: string | null): MealType => {
    if (!categoryName) return 'dinner';
    const lower = categoryName.toLowerCase();
    if (lower === 'breakfast') return 'breakfast';
    if (lower === 'lunch') return 'lunch';
    if (lower === 'dinner') return 'dinner';
    return 'dinner';
  }, []);

  const openSchedule = useCallback((recipe: { id: number; name: string }) => {
    setScheduleRecipe(recipe);
    if (schedulingContext) {
      const ctxDate = new Date(schedulingContext.date);
      setScheduleMonthIdx(ctxDate.getMonth());
      setScheduleDayIdx(ctxDate.getDate() - 1);
      setScheduleMealType(schedulingContext.mealType);
      setSchedulingContext(null);
    } else {
      setScheduleMonthIdx(new Date().getMonth());
      setScheduleDayIdx(new Date().getDate() - 1);
      setScheduleMealType(inferMealType(activeCategory?.name ?? null));
    }
    setCardView('schedule');
  }, [schedulingContext, setSchedulingContext, inferMealType, activeCategory]);

  // ─── Recipe browse (absorbed from RecipeListOverlay) ──────────────────────

  const { data: favorites = [] } = useRecipeFavorites(20);
  const favoriteIds = useMemo(() => new Set(favorites.map((f: { recipe_id: number }) => f.recipe_id)), [favorites]);

  const categoryRecipes = useMemo(() =>
    activeCategory
      ? recipes.filter((r) => r.category_id === activeCategory.id || r.category_id == null)
      : recipes,
  [recipes, activeCategory]);

  const browseUsedTags = useMemo(() => {
    const tagIds = new Set<number>();
    for (const r of categoryRecipes) {
      if (r.tags) for (const t of r.tags) tagIds.add(t.id);
    }
    return tags.allTags.filter((t: { id: number }) => tagIds.has(t.id)).slice(0, 6);
  }, [categoryRecipes, tags.allTags]);

  const browseTagOptions = useMemo(() => [
    { value: '', label: 'All' },
    ...browseUsedTags.map((t) => ({ value: String(t.id), label: t.name })),
  ], [browseUsedTags]);

  const filteredBrowseRecipes = useMemo(() => {
    let pool = categoryRecipes;
    if (recipeSearch.trim()) {
      const lower = recipeSearch.toLowerCase();
      pool = pool.filter((r) => r.name.toLowerCase().includes(lower));
    }
    if (recipeTagFilter.size > 0) {
      pool = pool.filter((r) =>
        [...recipeTagFilter].every((tid) => r.tags?.some((t) => t.id === tid)),
      );
    }
    return pool;
  }, [categoryRecipes, recipeSearch, recipeTagFilter]);

  const browseSections = useMemo(() => {
    const result: { label: string; items: PillListItem[] }[] = [];
    const favs = filteredBrowseRecipes.filter((r) => favoriteIds.has(r.id));
    if (favs.length > 0) {
      result.push({
        label: 'Favorites',
        items: favs.map((r) => ({
          label: r.name,
          dotColor: r.tags?.[0]?.color ?? ACCENT,
          onItemClick: () => openSchedule({ id: r.id, name: r.name }),
        })),
      });
    }
    const cuisineMap = new Map<string, PillListItem[]>();
    for (const r of filteredBrowseRecipes) {
      if (favoriteIds.has(r.id)) continue;
      const cuisine = r.cuisine_type ?? 'Other';
      if (!cuisineMap.has(cuisine)) cuisineMap.set(cuisine, []);
      cuisineMap.get(cuisine)!.push({
        label: r.name,
        dotColor: r.tags?.[0]?.color ?? undefined,
        onItemClick: () => openSchedule({ id: r.id, name: r.name }),
      });
    }
    for (const [label, items] of [...cuisineMap.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      result.push({ label, items });
    }
    return result;
  }, [filteredBrowseRecipes, favoriteIds, openSchedule]);

  const handleBrowseBack = useCallback(() => {
    setActiveCategory(null);
    setCardView('default');
    setRecipeSearch('');
    setRecipeTagFilter(new Set());
  }, []);

  // ─── Schedule WheelPicker ─────────────────────────────────────────────────

  const MONTH_NAMES = useMemo(() => [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ], []);

  const daysInMonth = useMemo(() => {
    const year = new Date().getFullYear();
    const adjustedYear = scheduleMonthIdx < new Date().getMonth() ? year + 1 : year;
    return new Date(adjustedYear, scheduleMonthIdx + 1, 0).getDate();
  }, [scheduleMonthIdx]);

  const dayValues = useMemo(() =>
    Array.from({ length: daysInMonth }, (_, i) => String(i + 1)),
  [daysInMonth]);

  // Clamp day index if month changes to shorter month
  const clampedDayIdx = Math.min(scheduleDayIdx, daysInMonth - 1);

  const scheduleColumns: WheelColumn[] = useMemo(() => [
    { values: MONTH_NAMES, selectedIndex: scheduleMonthIdx, onChange: setScheduleMonthIdx, flex: 2 },
    { values: dayValues, selectedIndex: clampedDayIdx, onChange: setScheduleDayIdx },
  ], [MONTH_NAMES, scheduleMonthIdx, dayValues, clampedDayIdx]);

  const mealTypeOptions = useMemo(() => [
    { value: 'breakfast', label: 'B' },
    { value: 'lunch', label: 'L' },
    { value: 'dinner', label: 'D' },
  ], []);


  const handleScheduleConfirm = useCallback(async () => {
    if (!scheduleRecipe || createMeal.isPending) return;
    const year = new Date().getFullYear();
    const adjustedYear = scheduleMonthIdx < new Date().getMonth() ? year + 1 : year;
    const day = clampedDayIdx + 1;
    const date = `${adjustedYear}-${String(scheduleMonthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    createMeal.mutate(
      { date, meal_type: scheduleMealType, recipe_id: scheduleRecipe.id, description: null },
      {
        onSuccess: () => {
          addToast({ message: `${scheduleRecipe.name} scheduled`, type: 'success', durationMs: 3000 });
          setScheduleRecipe(null);
          setCardView('default');
        },
        onError: () => addToast({ message: 'Failed to schedule', type: 'error', durationMs: 3000 }),
      },
    );
  }, [scheduleRecipe, createMeal, scheduleMonthIdx, clampedDayIdx, scheduleMealType, addToast]);

  const handleScheduleBack = useCallback(() => {
    setScheduleRecipe(null);
    setCardView('default');
  }, []);

  // ─── Create recipe ──────────────────────────────────────────────────────────

  const updateCreateField = useCallback(<K extends keyof RecipeCreate>(key: K, value: RecipeCreate[K]) => {
    setCreateForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleCreateSubmit = useCallback(async () => {
    if (!createForm.name.trim() || !createForm.instructions.trim() || createRecipe.isPending) return;
    try {
      await createRecipe.mutateAsync(createForm);
      addToast({ message: `Recipe "${createForm.name}" created`, type: 'success', durationMs: 3000 });
      setCreateForm(EMPTY_RECIPE);
      setCardView('default');
    } catch {
      addToast({ message: 'Failed to create recipe', type: 'error', durationMs: 4000 });
    }
  }, [createForm, createRecipe, addToast]);

  const handleCreateBack = useCallback(() => {
    setCreateForm(EMPTY_RECIPE);
    setCardView('default');
  }, []);

  const categoryOptions = useMemo(() => [
    { value: '', label: 'None' },
    ...categories.map((c) => ({ value: String(c.id), label: c.name })),
  ], [categories]);

  const cuisineOptions = useMemo(() => [
    { value: '', label: 'Select...' },
    ...CUISINE_TYPES.map((c) => ({ value: c, label: c })),
  ], []);

  // ─── Render ─────────────────────────────────────────────────────────────────

  // Tags formZone state
  if (cardView === 'tags') {
    return (
      <div className="relative w-full h-full overflow-hidden" style={CIRCULAR_ROOT_STYLE}>
        <CircularCardLayout
          hero={<HeroMetric value="Tags" label="RECIPES" sublabel={`${tags.allTags.length} tag${tags.allTags.length !== 1 ? 's' : ''}`} color={ACCENT} />}
          formZone={
            <>
              <div style={{ flexShrink: 0, paddingLeft: '6cqi', paddingRight: '6cqi' }}>
                <FormField
                  type="text" value={tags.tagSearch} onChange={tags.setTagSearch}
                  label="Search" placeholder="Search or create tag..."
                  accentColor={ACCENT}
                />
              </div>
              <ScrollZone paddingX="6cqi" paddingBottom="4cqi">
                <PillList items={tags.tagPills} header="TAGS" headerColor={ACCENT}
                          emptyMessage={tags.tagSearch.trim() ? 'No matching tags' : 'No tags yet'} maxItems={50} />
              </ScrollZone>
              <ActionBar actions={[
                ...(tags.canCreateTag ? [{ label: '+ Create', variant: 'emerald' as const, onClick: tags.handleCreateTag }] : []),
                { label: 'Back', variant: 'slate' as const, onClick: handleTagsBack },
              ]} />
            </>
          }
        />
      </div>
    );
  }

  // Recipe browse formZone state
  if (cardView === 'recipes' && activeCategory) {
    return (
      <div className="relative w-full h-full overflow-hidden" style={CIRCULAR_ROOT_STYLE}>
        <CircularCardLayout
          hero={<HeroMetric value={activeCategory.name} label="RECIPES" sublabel={`${filteredBrowseRecipes.length} recipe${filteredBrowseRecipes.length !== 1 ? 's' : ''}`} color={ACCENT} />}
          formZone={
            <>
              <div style={{ flexShrink: 0, paddingLeft: '6cqi', paddingRight: '6cqi' }}>
                <FormField
                  type="text" value={recipeSearch} onChange={setRecipeSearch}
                  label="Search" placeholder="Search recipes..."
                  accentColor={ACCENT}
                />
              </div>
              {browseUsedTags.length > 0 && (
                <div style={{ flexShrink: 0, paddingLeft: '6cqi', paddingRight: '6cqi' }}>
                  <ButtonGroup
                    options={browseTagOptions}
                    value={recipeTagFilter.size === 0 ? '' : String([...recipeTagFilter][0])}
                    onChange={(v) => setRecipeTagFilter(v === '' ? new Set() : new Set([Number(v)]))}
                    size="sm" wrap accentColor={ACCENT}
                  />
                </div>
              )}
              <ScrollZone paddingX="6cqi" paddingBottom="4cqi">
                {browseSections.map((section) => (
                  <PillList key={section.label} header={section.label}
                            headerColor={section.label === 'Favorites' ? ACCENT : TEXT_COLORS.secondary}
                            items={section.items} maxItems={10} emptyMessage="No recipes" />
                ))}
                {browseSections.length === 0 && (
                  <PillList items={[]} maxItems={1}
                            emptyMessage={recipeSearch.trim() ? 'No recipes found' : 'No recipes in this category'} />
                )}
              </ScrollZone>
              <ActionBar actions={[{ label: 'Back', variant: 'slate' as const, onClick: handleBrowseBack }]} />
            </>
          }
        />
      </div>
    );
  }

  // Schedule formZone state (WheelPicker — D-6)
  if (cardView === 'schedule' && scheduleRecipe) {
    return (
      <div className="relative w-full h-full overflow-hidden" style={CIRCULAR_ROOT_STYLE}>
        <CircularCardLayout
          hero={<HeroMetric value={scheduleRecipe.name} label="SCHEDULE" sublabel={`${MONTH_NAMES[scheduleMonthIdx]} ${clampedDayIdx + 1}`} color={ACCENT} />}
          formZone={
            <>
              <div style={{ flexShrink: 0, paddingLeft: '6cqi', paddingRight: '6cqi' }}>
                <WheelPicker columns={scheduleColumns} accentColor={ACCENT} />
              </div>
              <div style={{ flexShrink: 0, paddingLeft: '6cqi', paddingRight: '6cqi', marginTop: '1cqi' }}>
                <ButtonGroup
                  options={mealTypeOptions}
                  value={scheduleMealType}
                  onChange={(v) => setScheduleMealType(v as MealType)}
                  size="sm" accentColor={ACCENT}
                />
              </div>
              <ActionBar actions={[
                { label: 'Schedule', variant: 'emerald' as const, onClick: handleScheduleConfirm, disabled: createMeal.isPending },
                { label: 'Back', variant: 'slate' as const, onClick: handleScheduleBack },
              ]} />
            </>
          }
        />
      </div>
    );
  }

  // Create recipe formZone state (D-5)
  if (cardView === 'create') {
    const MB = '0.8cqi';
    return (
      <div className="relative w-full h-full overflow-hidden" style={CIRCULAR_ROOT_STYLE}>
        <CircularCardLayout
          hero={<HeroMetric value="New Recipe" label="RECIPES" color={ACCENT} />}
          formZone={
            <>
              <ScrollZone paddingX="6cqi" paddingBottom="4cqi">
                <div style={{ marginBottom: MB }}>
                  <span style={labelStyle}>Name *</span>
                  <input type="text" value={createForm.name}
                    onChange={(e) => updateCreateField('name', e.target.value)}
                    placeholder="e.g., Overnight Oats" style={inputStyle} />
                </div>
                <div style={{ marginBottom: MB }}>
                  <span style={labelStyle}>Category</span>
                  <ButtonGroup
                    options={categoryOptions}
                    value={createForm.category_id != null ? String(createForm.category_id) : ''}
                    onChange={(v) => updateCreateField('category_id', v ? Number(v) : null)}
                    size="sm" wrap accentColor={ACCENT}
                  />
                </div>
                <div style={{ marginBottom: MB }}>
                  <span style={labelStyle}>Cuisine</span>
                  <ButtonGroup
                    options={cuisineOptions}
                    value={createForm.cuisine_type ?? ''}
                    onChange={(v) => updateCreateField('cuisine_type', v || null)}
                    size="sm" wrap accentColor={ACCENT}
                  />
                </div>
                <div style={{ display: 'flex', gap: '0.4cqi', marginBottom: MB }}>
                  <div style={{ flex: 1 }}>
                    <span style={labelStyle}>Prep (min)</span>
                    <input type="number" min="0" value={createForm.prep_time_minutes ?? ''}
                      onChange={(e) => updateCreateField('prep_time_minutes', e.target.value ? parseInt(e.target.value) : null)}
                      style={inputStyle} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <span style={labelStyle}>Cook (min)</span>
                    <input type="number" min="0" value={createForm.cook_time_minutes ?? ''}
                      onChange={(e) => updateCreateField('cook_time_minutes', e.target.value ? parseInt(e.target.value) : null)}
                      style={inputStyle} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <span style={labelStyle}>Servings</span>
                    <input type="number" min="1" value={createForm.servings ?? ''}
                      onChange={(e) => updateCreateField('servings', e.target.value ? parseInt(e.target.value) : null)}
                      placeholder="4" style={inputStyle} />
                  </div>
                </div>
                <div style={{ marginBottom: MB }}>
                  <span style={labelStyle}>Instructions *</span>
                  <textarea value={createForm.instructions}
                    onChange={(e) => updateCreateField('instructions', e.target.value)}
                    rows={4} placeholder="1. First step&#10;2. Second step"
                    style={{ ...inputStyle, resize: 'none' as const }} />
                </div>
                <div style={{ marginBottom: MB }}>
                  <span style={labelStyle}>Source</span>
                  <input type="text" value={createForm.source ?? ''}
                    onChange={(e) => updateCreateField('source', e.target.value || null)}
                    placeholder="URL or cookbook" style={inputStyle} />
                </div>
                <div style={{ marginBottom: MB }}>
                  <span style={labelStyle}>Notes</span>
                  <textarea value={createForm.notes ?? ''}
                    onChange={(e) => updateCreateField('notes', e.target.value || null)}
                    rows={2} placeholder="Tips, variations..."
                    style={{ ...inputStyle, resize: 'none' as const }} />
                </div>
              </ScrollZone>
              <ActionBar actions={[
                { label: 'Create', variant: 'emerald' as const, onClick: handleCreateSubmit,
                  disabled: createRecipe.isPending || !createForm.name.trim() || !createForm.instructions.trim() },
                { label: 'Back', variant: 'slate' as const, onClick: handleCreateBack },
              ]} />
            </>
          }
        />
      </div>
    );
  }

  return (
    <div
        className="relative w-full h-full overflow-hidden"
        style={CIRCULAR_ROOT_STYLE}
      >
        {/* ── Header ── */}
        <div
          className="absolute flex flex-col items-center"
          style={{
            top: '6%',
            left: '50%',
            transform: 'translateX(-50%)',
          }}
        >
          <div className="flex items-baseline gap-[0.6cqi]">
            <span
              className="font-bold tabular-nums"
              style={{ fontSize: `${CARD_SIZES.heroText}cqi`, color: '#34d399' }}
            >
              {totalRecipes}
            </span>
            <span
              className="uppercase tracking-wider font-medium"
              style={{ fontSize: '2cqi', color: 'rgb(148, 163, 184)' }}
            >
              Recipes
            </span>
          </div>
          <div className="flex items-center gap-[1cqi]" style={{ marginTop: '0.3cqi' }}>
            {intelligence.favorites.length > 0 && (
              <span style={{ fontSize: '1.5cqi', color: '#f472b6' }}>
                {intelligence.favorites.length} favs
              </span>
            )}
            {intelligence.favorites.length > 0 && complexityBreakdown.quick > 0 && (
              <span style={{ fontSize: '1.5cqi', color: 'rgb(71, 85, 105)' }}>·</span>
            )}
            {complexityBreakdown.quick > 0 && (
              <span style={{ fontSize: '1.5cqi', color: '#4ade80' }}>
                {complexityBreakdown.quick} quick
              </span>
            )}
          </div>
        </div>

        {/* ── Action buttons ── */}
        <div
          className="absolute flex items-center justify-between"
          style={{
            top: '17%',
            left: '22%',
            right: '22%',
          }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); setCardView('tags'); }}
            className="transition-colors"
            style={{
              fontSize: '1.6cqi',
              color: 'rgb(148, 163, 184)',
              background: 'rgba(100, 116, 139, 0.1)',
              border: '1px solid rgba(100, 116, 139, 0.2)',
              borderRadius: '99px',
              padding: '0.3cqi 1.2cqi',
            }}
          >
            Tags
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setCardView('create'); }}
            className="transition-colors"
            style={{
              fontSize: '1.6cqi',
              color: '#34d399',
              background: 'rgba(52, 211, 153, 0.1)',
              border: '1px solid rgba(52, 211, 153, 0.2)',
              borderRadius: '99px',
              padding: '0.3cqi 1.2cqi',
            }}
          >
            + Recipe
          </button>
        </div>

        {/* ── Primary category circles ── */}
        {primaryCircles.map((circle) => {
          const isMajor = circle.tier === 'major';
          const glow = isMajor ? MAJOR_GLOW : MINOR_GLOW;
          const sizeMultiplier = isMajor ? 1.75 : 1.5;
          const basePad = 2; // cqi
          const pad = basePad * sizeMultiplier;

          const handleCircleClick = async (e: React.MouseEvent) => {
            e.stopPropagation();
            if (createCategory.isPending) return;
            if (circle.categoryId) {
              setActiveCategory({ id: circle.categoryId, name: circle.label });
              setCardView('recipes');
            } else {
              try {
                const created = await createCategory.mutateAsync({ name: circle.label });
                addToast({ message: `Created "${circle.label}" category`, type: 'success', durationMs: 2000 });
                setActiveCategory({ id: created.id, name: circle.label });
                setCardView('recipes');
              } catch {
                addToast({ message: `Failed to create "${circle.label}"`, type: 'error', durationMs: 3000 });
              }
            }
          };

          return (
            <button
              key={circle.name}
              onClick={handleCircleClick}
              className="absolute transition-opacity"
              style={{
                left: `${circle.x}%`,
                top: `${circle.y}%`,
                transform: 'translate(-50%, -50%)',
                padding: `${pad * 0.4}cqi ${pad * 0.7}cqi`,
                borderRadius: '99px',
                backdropFilter: 'blur(12px)',
                background: isMajor
                  ? 'rgba(52, 211, 153, 0.06)'
                  : 'rgba(251, 191, 36, 0.05)',
                ...glow,
                cursor: 'pointer',
              }}
            >
              <div
                style={{
                  fontSize: `${1.8 * sizeMultiplier}cqi`,
                  fontWeight: 600,
                  color: isMajor ? 'rgba(110, 231, 183, 0.9)' : 'rgba(252, 211, 77, 0.85)',
                  lineHeight: 1.2,
                  whiteSpace: 'nowrap',
                }}
              >
                {circle.label}
                {circle.recipeCount > 0 && (
                  <span
                    style={{
                      fontSize: `${1.3 * sizeMultiplier}cqi`,
                      color: isMajor ? 'rgba(52, 211, 153, 0.6)' : 'rgba(251, 191, 36, 0.5)',
                      marginLeft: '0.5cqi',
                      fontWeight: 400,
                    }}
                  >
                    {circle.recipeCount}
                  </span>
                )}
              </div>
            </button>
          );
        })}

        {/* ── Secondary category pills (smaller, muted) ── */}
        {secondaryCircles.map((circle) => (
          <button
            key={circle.categoryId}
            onClick={(e) => {
              e.stopPropagation();
              setActiveCategory({ id: circle.categoryId, name: circle.label });
              setCardView('recipes');
            }}
            className="absolute transition-opacity"
            style={{
              left: `${circle.x}%`,
              top: `${circle.y}%`,
              transform: 'translate(-50%, -50%)',
              padding: '0.5cqi 1cqi',
              borderRadius: '99px',
              backdropFilter: 'blur(8px)',
              background: `${circle.color}0a`,
              boxShadow: `0 0 8px ${circle.color}25, 0 0 2px ${circle.color}40`,
              border: `1px solid ${circle.color}30`,
              cursor: 'pointer',
            }}
          >
            <div
              style={{
                fontSize: '2cqi',
                fontWeight: 500,
                color: `${circle.color}cc`,
                lineHeight: 1.2,
                whiteSpace: 'nowrap',
              }}
            >
              {circle.label}
              {circle.recipeCount > 0 && (
                <span
                  style={{
                    fontSize: '1.5cqi',
                    color: `${circle.color}70`,
                    marginLeft: '0.4cqi',
                    fontWeight: 400,
                  }}
                >
                  {circle.recipeCount}
                </span>
              )}
            </div>
          </button>
        ))}

        {/* ── Bottom suggestion pill ── */}
        <div
          className="absolute"
          onClick={suggestedRecipe ? (e) => { e.stopPropagation(); openSchedule({ id: suggestedRecipe.id, name: suggestedRecipe.name }); } : undefined}
          style={{
            bottom: '18%',
            left: '30%',
            right: '30%',
            background: 'rgba(16, 185, 129, 0.06)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(16, 185, 129, 0.15)',
            borderRadius: '99px',
            padding: '0.5cqi 1.5cqi',
            textAlign: 'center',
            cursor: suggestedRecipe ? 'pointer' : 'default',
          }}
        >
          {intelligence.isLearning ? (
            <span style={{ fontSize: '1.5cqi', color: 'rgb(71, 85, 105)' }}>
              Building taste profile...
            </span>
          ) : featured ? (
            <>
              <div
                className="truncate"
                style={{ fontSize: '1.6cqi', color: 'rgb(203, 213, 225)' }}
              >
                &#9733; {featured.name}
              </div>
              <div style={{ fontSize: '1.3cqi', color: 'rgb(100, 116, 139)' }}>
                {featured.totalTime > 0 ? `${featured.totalTime}m \u00b7 ` : ''}
                {featured.complexityLabel}
                {featured.cookCount > 0 ? ` \u00b7 ${featured.cookCount}\u00d7` : ''}
              </div>
            </>
          ) : (
            <span style={{ fontSize: '1.5cqi', color: 'rgb(71, 85, 105)' }}>
              Add recipes for suggestions
            </span>
          )}
        </div>

      </div>
    );
}
