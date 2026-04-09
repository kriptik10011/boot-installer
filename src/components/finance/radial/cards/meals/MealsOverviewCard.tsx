/**
 * MealsOverviewCard — Unified shape-composed meal planning card.
 *
 * Default: CircularCardLayout with "Next Up" hero + unplanned gaps PillList.
 *   Always visible unless drilling into a meal.
 * Day selected: 3 tiny B/L/D buttons appear near the selected day pill (bezel).
 * Meal selected: CircularCardLayout swaps to compact meal detail view.
 *
 * Day arc slots: glass pill buttons positioned on bezel (only absolute elements).
 * B/L/D buttons: tiny ActionBar-style pills near the day slot (bezel elements).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCreateMeal, useDeleteMeal, useRecipes, useRecipeCategories } from '@/hooks';
import { useRecipeFavorites } from '@/hooks/useRecipeInsights';
import { useTags } from '@/hooks/useTags';
import { useMealIntelligence } from '@/hooks/useMealIntelligence';
import { useToastStore } from '@/stores/toastStore';
import { getMonday, getWeekDates, getTodayLocal, parseDateLocal, addWeeks } from '@/utils/dateUtils';
import type { MealType, MealPlanEntry, Recipe, RecipeTag } from '@/types';
import {
  CIRCULAR_ROOT_STYLE, FONT_FAMILY, CARD_SIZES,
  TEXT_COLORS, SUB_ARC_ACCENTS,
} from '../../cardTemplate';
import { CircularCardLayout, HeroMetric, PillList, DayArcPills, ButtonGroup, FormField, ScrollZone } from '../../shapes';
import type { PillListItem, DayArcPillData } from '../../shapes';
import { ActionBar, VARIANT } from '../../shapes/ActionBar';
import { circlePoint } from '../shared/arcHelpers';

// ─── Constants ────────────────────────────────────────────────────────────────

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner'];
const MEAL_LABELS: Record<MealType, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' };
const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const ACCENT = SUB_ARC_ACCENTS.meals;

// Arc geometry (DayArcPills handles day rendering; these are for B/L/D positioning)
const VIEWBOX = 400;
const OUTER_R = 0.92 * (VIEWBOX / 2); // must match DayArcPills
const PILL_HEIGHT = 12;
const INNER_R = OUTER_R - PILL_HEIGHT;
const BLD_R = INNER_R - 10; // B/L/D buttons sit just inside the day arc ring
const BLD_SPREAD = 8; // degrees spread between B/L/D buttons

// Angle computation for B/L/D positioning (reuses same math as DayArcPills)
const ARC_SWEEP = 160;
const SLOT_GAP = 3;

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface DayData {
  date: string;
  breakfast: MealPlanEntry | undefined;
  lunch: MealPlanEntry | undefined;
  dinner: MealPlanEntry | undefined;
  fillCount: number;
}

function buildDayData(dates: string[], meals: MealPlanEntry[]): DayData[] {
  return dates.map((date) => {
    const dm = meals.filter((m) => m.date === date);
    return {
      date,
      breakfast: dm.find((m) => m.meal_type === 'breakfast'),
      lunch: dm.find((m) => m.meal_type === 'lunch'),
      dinner: dm.find((m) => m.meal_type === 'dinner'),
      fillCount: dm.length,
    };
  });
}

function computeDayAngles(arcStart: number): number[] {
  const n = DAY_LABELS.length;
  const segSweep = (ARC_SWEEP - SLOT_GAP * (n - 1)) / n;
  return Array.from({ length: n }, (_, i) =>
    arcStart + i * (segSweep + SLOT_GAP) + segSweep / 2,
  );
}

function daysUntil(from: string, to: string): number {
  return Math.round((parseDateLocal(to).getTime() - parseDateLocal(from).getTime()) / 86400000);
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MealsOverviewCard() {
  const weekStart = useMemo(() => getMonday(), []);
  const nextWeekStart = useMemo(() => addWeeks(weekStart, 1), [weekStart]);
  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart]);
  const nextWeekDates = useMemo(() => getWeekDates(nextWeekStart), [nextWeekStart]);
  const thisWeekdays = useMemo(() => weekDates, [weekDates]);
  const nextWeekdays = useMemo(() => nextWeekDates, [nextWeekDates]);
  const allWeekdays = useMemo(() => [...thisWeekdays, ...nextWeekdays], [thisWeekdays, nextWeekdays]);
  const today = useMemo(() => getTodayLocal(), []);
  const todayIdx = useMemo(() => thisWeekdays.indexOf(today), [thisWeekdays, today]);

  const intelligence = useMealIntelligence(weekStart);
  const nextIntelligence = useMealIntelligence(nextWeekStart);
  const { data: recipes = [] } = useRecipes();
  const { data: categories = [] } = useRecipeCategories();
  const { data: favorites = [] } = useRecipeFavorites(20);
  const { data: allTags = [] } = useTags();
  const createMeal = useCreateMeal();
  const deleteMeal = useDeleteMeal();
  const addToast = useToastStore((s) => s.addToast);
  const isBusy = createMeal.isPending || deleteMeal.isPending;

  const dayData = useMemo(() => buildDayData(thisWeekdays, intelligence.allMeals), [thisWeekdays, intelligence.allMeals]);
  const nextDayData = useMemo(() => buildDayData(nextWeekdays, nextIntelligence.allMeals), [nextWeekdays, nextIntelligence.allMeals]);
  const allDayData = useMemo(() => [...dayData, ...nextDayData], [dayData, nextDayData]);

  // State
  const [activeDay, setActiveDay] = useState<number | null>(null);
  const [selectedMeal, setSelectedMeal] = useState<MealType | null>(null);
  const [picker, setPicker] = useState<{ dayIndex: number; mealType: MealType; replacingId: number | null } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTagId, setActiveTagId] = useState<number | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timer on unmount to prevent setState-after-unmount
  useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current); }, []);

  const currentDayData = activeDay != null ? allDayData[activeDay] : null;
  const showMealDetail = selectedMeal != null && currentDayData != null;

  // DayArcPills data
  const topPillData = useMemo((): DayArcPillData[] =>
    DAY_LABELS.map((label, i) => ({
      label,
      isActive: activeDay === i,
      hasMeals: (allDayData[i]?.fillCount ?? 0) > 0,
      isToday: i === todayIdx,
      dimmed: false,
    })),
  [activeDay, allDayData, todayIdx]);

  const bottomPillData = useMemo((): DayArcPillData[] =>
    DAY_LABELS.map((label, i) => ({
      label,
      isActive: activeDay === i + 7,
      hasMeals: (allDayData[i + 7]?.fillCount ?? 0) > 0,
      isToday: false,
      dimmed: true,
    })),
  [activeDay, allDayData]);

  // Arc angles (for B/L/D positioning only)
  const topAngles = useMemo(() => computeDayAngles(-170), []);
  const bottomAnglesRaw = useMemo(() => computeDayAngles(10), []);
  const bottomAngles = useMemo(() => [...bottomAnglesRaw].reverse(), [bottomAnglesRaw]);
  const cx = VIEWBOX / 2;
  const cy = VIEWBOX / 2;

  // Active day angle (for B/L/D positioning)
  const activeDayAngle = useMemo(() => {
    if (activeDay == null) return 0;
    return activeDay < 7 ? topAngles[activeDay] : bottomAngles[activeDay - 7];
  }, [activeDay, topAngles, bottomAngles]);

  // ─── Handlers ───────────────────────────────────────────────────────────────

  // Shared hover: any day pill or B/L/D entering cancels the hide timer.
  // Leaving starts a 300ms timer. If nothing else is entered, day clears.
  // Clicked meal is sticky — ignores the timer entirely.
  const pointerEnter = useCallback((dayIdx?: number) => {
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
    if (dayIdx != null && selectedMeal == null) setActiveDay(dayIdx);
  }, [selectedMeal]);

  const pointerLeave = useCallback(() => {
    if (selectedMeal != null) return; // clicked meal stays
    hideTimer.current = setTimeout(() => { setActiveDay(null); }, 300);
  }, [selectedMeal]);

  // Meal slot click: filled → show detail, empty → open picker
  const handleMealClick = useCallback((type: MealType) => {
    if (!currentDayData) return;
    if (currentDayData[type]) {
      setSelectedMeal((prev) => prev === type ? null : type);
    } else {
      setPicker({ dayIndex: activeDay!, mealType: type, replacingId: null });
    }
  }, [currentDayData, activeDay]);

  const handleSwap = () => {
    if (activeDay == null || !selectedMeal) return;
    const entry = currentDayData?.[selectedMeal];
    setPicker({ dayIndex: activeDay, mealType: selectedMeal, replacingId: entry?.id ?? null });
  };

  const handleRemove = useCallback(() => {
    if (isBusy || !selectedMeal || !currentDayData) return;
    const entry = currentDayData[selectedMeal];
    if (!entry) return;
    deleteMeal.mutate(entry.id, {
      onSuccess: () => { addToast({ message: 'Meal removed', type: 'success', durationMs: 3000 }); setSelectedMeal(null); },
      onError: () => addToast({ message: 'Failed to remove', type: 'error', durationMs: 3000 }),
    });
  }, [isBusy, selectedMeal, currentDayData, deleteMeal, addToast]);

  const handlePickRecipe = useCallback((recipeId: number | null, description: string | null) => {
    if (isBusy || !picker) return;
    const date = allWeekdays[picker.dayIndex];
    const doCreate = () => {
      createMeal.mutate(
        { date, meal_type: picker.mealType, recipe_id: recipeId, description },
        {
          onSuccess: () => { addToast({ message: `${MEAL_LABELS[picker.mealType]} added`, type: 'success', durationMs: 3000 }); setPicker(null); },
          onError: () => addToast({ message: 'Failed to add meal', type: 'error', durationMs: 3000 }),
        },
      );
    };
    if (picker.replacingId) {
      deleteMeal.mutate(picker.replacingId, {
        onSuccess: doCreate,
        onError: () => addToast({ message: 'Failed to swap meal', type: 'error', durationMs: 3000 }),
      });
    } else {
      doCreate();
    }
  }, [isBusy, picker, allWeekdays, createMeal, deleteMeal, addToast]);

  // ─── State 3: Recipe picker data (absorbed from MealRecipePicker) ───────────

  const favoriteIds = useMemo(() => new Set(favorites.map((f: { recipe_id: number }) => f.recipe_id)), [favorites]);

  const categoryMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const c of categories) map.set(c.id, c.name);
    return map;
  }, [categories]);

  const usedTags = useMemo(() => {
    const tagSet = new Set<number>();
    for (const r of recipes) {
      if (r.tags) for (const t of r.tags) tagSet.add(t.id);
    }
    return (allTags as RecipeTag[]).filter((t) => tagSet.has(t.id));
  }, [recipes, allTags]);

  const pickerSections = useMemo(() => {
    let pool = [...recipes];
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      pool = pool.filter((r) => r.name.toLowerCase().includes(term));
    }
    if (activeTagId !== null) {
      pool = pool.filter((r) => r.tags?.some((t) => t.id === activeTagId));
    }
    const favs = pool.filter((r) => favoriteIds.has(r.id));
    const rest = pool.filter((r) => !favoriteIds.has(r.id));
    const byCat = new Map<string, Recipe[]>();
    for (const r of rest) {
      const catName = r.category_id ? (categoryMap.get(r.category_id) ?? 'Other') : 'Uncategorized';
      if (!byCat.has(catName)) byCat.set(catName, []);
      byCat.get(catName)!.push(r);
    }
    const result: { label: string; items: Recipe[] }[] = [];
    if (favs.length > 0) result.push({ label: 'Favorites', items: favs.slice(0, 5) });
    for (const [catName, items] of byCat) {
      result.push({ label: catName, items: items.slice(0, 5) });
    }
    return result;
  }, [recipes, searchTerm, activeTagId, favoriteIds, categoryMap]);

  const sectionPills = useMemo(() =>
    pickerSections.map((section) => ({
      label: section.label,
      items: section.items.map((recipe): PillListItem => ({
        label: recipe.name,
        dotColor: recipe.tags?.[0]?.color ?? undefined,
        onItemClick: isBusy ? undefined : () => handlePickRecipe(recipe.id, recipe.name),
      })),
    })),
  [pickerSections, isBusy, handlePickRecipe]);

  const tagOptions = useMemo(() => [
    { value: '', label: 'All' },
    ...usedTags.slice(0, 5).map((t) => ({ value: String(t.id), label: t.name })),
  ], [usedTags]);

  const handlePickerBack = useCallback(() => {
    setPicker(null);
    setSearchTerm('');
    setActiveTagId(null);
    // selectedMeal stays set if came from Swap -> returns to State 2
    // selectedMeal is null if came from empty slot -> returns to State 1
  }, []);

  const pickerDayName = useMemo(() => {
    if (!picker) return '';
    const label = DAY_LABELS[picker.dayIndex % 7];
    return picker.dayIndex >= 7 ? `Next ${label}` : label;
  }, [picker]);

  // ─── Default view data ──────────────────────────────────────────────────────

  const defaultHero = useMemo(() => {
    const gaps = [...intelligence.gaps.filter((g) => g.date >= today), ...nextIntelligence.gaps];
    if (gaps.length === 0) return { value: 'All Planned', label: 'MEALS', color: ACCENT };
    const next = gaps[0];
    const dayName = next.day_name ?? DAY_NAMES_SHORT[parseDateLocal(next.date).getDay()] ?? '';
    const d = daysUntil(today, next.date);
    return { value: `${dayName} ${next.meal_type}`, label: 'NEXT UP', sublabel: d === 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`, color: ACCENT };
  }, [intelligence.gaps, nextIntelligence.gaps, today]);

  const activeDayName = useMemo(() => {
    if (activeDay == null) return '';
    const label = DAY_LABELS[activeDay % 7];
    return activeDay >= 7 ? `Next ${label}` : label;
  }, [activeDay]);

  const activeDayPlanned = useMemo(() => {
    if (!currentDayData) return 0;
    return [currentDayData.breakfast, currentDayData.lunch, currentDayData.dinner].filter(Boolean).length;
  }, [currentDayData]);

  // ─── Meal detail data ───────────────────────────────────────────────────────

  const mealDetail = useMemo(() => {
    if (!currentDayData || !selectedMeal) return null;
    const entry = currentDayData[selectedMeal];
    if (!entry) return null;
    const recipe: Recipe | undefined = entry.recipe_id
      ? recipes.find((r) => r.id === entry.recipe_id)
      : undefined;
    const name = recipe?.name ?? entry.description ?? 'Meal';
    const ingredients: PillListItem[] = (recipe?.ingredients ?? [])
      .map((ing) => ({
        label: ing.ingredient_name ?? '',
        badge: ing.quantity && ing.unit ? `${ing.quantity} ${ing.unit}` : undefined,
      }))
      .filter((item) => item.label);
    const instructionText = recipe?.instructions ?? '';
    const instructions: PillListItem[] = instructionText
      ? instructionText.split('\n').filter(Boolean).map((step) => ({ label: step }))
      : [{ label: 'No instructions' }];
    const prepTime = recipe?.prep_time_minutes ?? null;
    return { name, ingredients, instructions, prepTime };
  }, [currentDayData, selectedMeal, recipes]);

  // ─── DayArcPills handlers ───────────────────────────────────────────────────

  const handlePillClick = useCallback((index: number, isTop: boolean) => {
    const globalIdx = isTop ? index : index + 7;
    setSelectedMeal(null);
    setActiveDay((prev) => prev === globalIdx ? null : globalIdx);
  }, []);

  const handlePillEnter = useCallback((index: number, isTop: boolean) => {
    const globalIdx = isTop ? index : index + 7;
    pointerEnter(globalIdx);
  }, [pointerEnter]);

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="relative w-full h-full overflow-hidden" style={CIRCULAR_ROOT_STYLE} onMouseLeave={pointerLeave}>
      {/* Bezel layer — pointer-events:none so content underneath receives scroll/click */}
      <div className="absolute inset-0" style={{ zIndex: 5, pointerEvents: 'none' }}>
        {/* Day arc pills — curved SVG bezel shape */}
        <DayArcPills
          topPills={topPillData}
          bottomPills={bottomPillData}
          accentColor={ACCENT}
          viewBox={VIEWBOX}
          onPillClick={handlePillClick}
          onPillEnter={handlePillEnter}
        />

        {/* B/L/D circular glass buttons — positioned near active day */}
        {!showMealDetail && !picker && activeDay != null && MEAL_TYPES.map((type, i) => {
          const isTopArc = activeDay < 7;
          const offset = (i - 1) * BLD_SPREAD * (isTopArc ? 1 : -1);
          const btnAngle = activeDayAngle + offset;
          const pos = circlePoint(cx, cy, BLD_R, btnAngle);
          const rotation = isTopArc ? btnAngle + 90 : btnAngle - 90;
          const filled = currentDayData?.[type] != null;
          const colors = filled ? VARIANT.emerald : VARIANT.slate;

          return (
            <button
              key={`bld-${type}`}
              onClick={() => handleMealClick(type)}
              onMouseEnter={(e) => {
                pointerEnter(); // cancel timer only — active day stays
                e.currentTarget.style.boxShadow = `0 0 8px ${ACCENT}60`;
                e.currentTarget.style.borderColor = filled ? ACCENT : VARIANT.slate.text;
              }}
              onMouseLeave={(e) => {
                // No pointerLeave here — container div handles it (fixes jitter)
                e.currentTarget.style.boxShadow = filled ? `0 0 4px ${ACCENT}30` : '';
                e.currentTarget.style.borderColor = colors.border;
              }}
              style={{
                position: 'absolute',
                left: `${(pos.x / VIEWBOX) * 100}%`,
                top: `${(pos.y / VIEWBOX) * 100}%`,
                transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
                border: `1px solid ${colors.border}`,
                background: 'transparent',
                pointerEvents: 'auto' as const,
                borderRadius: '50%',
                width: '5cqi',
                height: '5cqi',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: `${CARD_SIZES.sectionContent}cqi`,
                fontFamily: FONT_FAMILY,
                fontWeight: 600,
                color: filled ? ACCENT : TEXT_COLORS.secondary,
                cursor: 'pointer',
                zIndex: 12,
                outline: 'none',
                lineHeight: 1,
                textShadow: filled ? `0 0 6px ${ACCENT}66` : undefined,
                boxShadow: filled ? `0 0 4px ${ACCENT}30` : undefined,
                transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
              }}
            >
              {type[0].toUpperCase()}
            </button>
          );
        })}
      </div>

      {/* State 0: Default — hero centered, no day selected */}
      {activeDay == null && !showMealDetail && !picker && (
        <div className="flex items-center justify-center h-full w-full">
          <HeroMetric {...defaultHero} />
        </div>
      )}

      {/* State 1: Day selected — centered hero, B/L/D on bezel */}
      {activeDay != null && !showMealDetail && !picker && (
        <div className="flex items-center justify-center h-full w-full">
          <HeroMetric value={activeDayName} label="MEALS" sublabel={`${activeDayPlanned}/3 planned`} color={ACCENT} />
        </div>
      )}

      {/* State 2: Meal detail — single-column scroll (fits circular boundary) */}
      {showMealDetail && mealDetail && !picker && (
        <CircularCardLayout
          hero={
            <div style={{ marginTop: '4cqi' }}>
              <HeroMetric
                value={mealDetail.name}
                label={MEAL_LABELS[selectedMeal!]}
                sublabel={mealDetail.prepTime ? `${mealDetail.prepTime} min prep` : undefined}
                color={ACCENT}
              />
            </div>
          }
          formZone={
            <>
              <ScrollZone paddingX="6cqi" paddingBottom="4cqi">
                <PillList items={mealDetail.ingredients} header="INGREDIENTS" headerColor={ACCENT} maxItems={20} emptyMessage="None listed" />
                <PillList items={mealDetail.instructions} header="INSTRUCTIONS" headerColor={TEXT_COLORS.secondary} maxItems={20} emptyMessage="No steps" />
              </ScrollZone>
              <ActionBar actions={[
                { label: 'Swap', onClick: handleSwap, variant: 'emerald' as const },
                { label: 'Remove', onClick: handleRemove, variant: 'slate' as const },
                { label: 'Back', onClick: () => setSelectedMeal(null), variant: 'slate' as const },
              ]} />
            </>
          }
        />
      )}

      {/* State 3: Recipe picker — formZone (absorbed from MealRecipePicker) */}
      {picker && (
        <CircularCardLayout
          hero={<HeroMetric value="Pick Recipe" label={`${pickerDayName} ${MEAL_LABELS[picker.mealType]}`} color={ACCENT} />}
          formZone={
            <>
              <div style={{ flexShrink: 0, paddingLeft: '6cqi', paddingRight: '6cqi' }}>
                <FormField type="text" value={searchTerm} onChange={setSearchTerm}
                           label="Search" placeholder="Search recipes..." accentColor={ACCENT} />
              </div>
              {usedTags.length > 0 && (
                <div style={{ flexShrink: 0, paddingLeft: '6cqi', paddingRight: '6cqi' }}>
                  <ButtonGroup
                    options={tagOptions}
                    value={activeTagId === null ? '' : String(activeTagId)}
                    onChange={(v) => setActiveTagId(v === '' ? null : Number(v))}
                    size="sm" wrap accentColor={ACCENT}
                  />
                </div>
              )}
              <ScrollZone paddingX="6cqi" paddingBottom="4cqi">
                {sectionPills.map((section) => (
                  <PillList key={section.label} header={section.label}
                            headerColor={section.label === 'Favorites' ? ACCENT : TEXT_COLORS.secondary}
                            items={section.items} maxItems={5} emptyMessage="No recipes" />
                ))}
                {sectionPills.length === 0 && (
                  <PillList items={[]} maxItems={1}
                            emptyMessage={searchTerm.trim() ? 'No recipes found' : 'No recipes yet'} />
                )}
              </ScrollZone>
              <ActionBar actions={[{ label: 'Back', variant: 'slate' as const, onClick: handlePickerBack }]} />
            </>
          }
        />
      )}
    </div>
  );
}
